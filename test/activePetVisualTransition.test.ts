import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareActivePetVisualState, type ActivePetVisualCache } from "../client/src/lib/activePetVisuals";

class MemoryVisualCache implements ActivePetVisualCache {
  readonly values = new Map<string, unknown>();

  private key(queryKey: readonly unknown[]) {
    return JSON.stringify(queryKey);
  }

  getQueryData<T = unknown>(queryKey: readonly unknown[]): T | undefined {
    return this.values.get(this.key(queryKey)) as T | undefined;
  }

  setQueryData<T = unknown>(queryKey: readonly unknown[], value: T): unknown {
    this.values.set(this.key(queryKey), value);
    return value;
  }

  get(queryKey: readonly unknown[]) {
    return this.values.get(this.key(queryKey));
  }
}

test("active-pet visual preparation seeds evolution, costume, template and Mini Pet caches", async () => {
  const cache = new MemoryVisualCache();
  const controller = new AbortController();
  const calls: string[] = [];

  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input);
    calls.push(url);
    assert.equal(options?.credentials, "include");
    assert.equal(options?.signal, controller.signal);

    if (url.endsWith("/costumes")) return Response.json({ isEvolved: true, equipped: [] });
    if (url.endsWith("/mini-pet")) return Response.json({ equipped: { id: "mini-1" } });
    if (url.endsWith("?form=evolution")) return Response.json({ parts: [{ id: "body", imageUrl: "/body.png" }] });
    return Response.json({ message: "unexpected" }, { status: 404 });
  };

  const result = await prepareActivePetVisualState({
    pet: { inventoryId: "pet-inv-1", petTemplateId: "template-1" },
    cache,
    signal: controller.signal,
    fetcher,
  });

  assert.equal(result?.artworkForm, "evolution");
  assert.deepEqual(cache.get(["/api/pet", "pet-inv-1", "costumes", "owner"]), { isEvolved: true, equipped: [] });
  assert.deepEqual(cache.get(["/api/pet-template-parts", "template-1", "evolution"]), {
    parts: [{ id: "body", imageUrl: "/body.png" }],
  });
  assert.deepEqual(cache.get(["/api/pet", "pet-inv-1", "mini-pet", "owner"]), {
    equipped: { id: "mini-1" },
  });
  assert.ok(calls.some((url) => url.endsWith("/api/pet/pet-inv-1/costumes")));
  assert.ok(calls.some((url) => url.endsWith("/api/pet/pet-inv-1/mini-pet")));
  assert.ok(calls.some((url) => url.endsWith("/api/pet-template-parts/template-1?form=evolution")));
  assert.equal(cache.get(["/api/pet-template-parts", "template-1"]), undefined);
});

test("cached active-pet visual metadata does not refetch", async () => {
  const cache = new MemoryVisualCache();
  cache.setQueryData(["/api/pet", "pet-inv-2", "costumes", "owner"], { isEvolved: false, equipped: [] });
  cache.setQueryData(["/api/pet-template-parts", "template-2"], { parts: [] });
  cache.setQueryData(["/api/pet", "pet-inv-2", "mini-pet", "owner"], { equipped: null });

  let fetchCount = 0;
  const result = await prepareActivePetVisualState({
    pet: { inventoryId: "pet-inv-2", petTemplateId: "template-2" },
    cache,
    signal: new AbortController().signal,
    fetcher: async () => {
      fetchCount += 1;
      return Response.json({});
    },
  });

  assert.equal(result?.artworkForm, "base");
  assert.equal(fetchCount, 0);
});

test("aborted active-pet preparation cannot seed a late costume response", async () => {
  const cache = new MemoryVisualCache();
  const controller = new AbortController();
  let finishBody!: (value: unknown) => void;
  const body = new Promise((resolve) => { finishBody = resolve; });

  const resultPromise = prepareActivePetVisualState({
    pet: { inventoryId: "pet-old", petTemplateId: "template-old" },
    cache,
    signal: controller.signal,
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/mini-pet")) return Response.json({ equipped: null });
      return { ok: true, json: () => body } as Response;
    },
  });

  await Promise.resolve();
  controller.abort();
  finishBody({ isEvolved: false, equipped: [] });

  assert.equal(await resultPromise, null);
  assert.equal(cache.get(["/api/pet", "pet-old", "costumes", "owner"]), undefined);
});

test("startup waits for active-pet renderer metadata without removing the four-second cap", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(app, /prepareActivePetVisualState\(\{/);
  assert.match(app, /await prepareActivePetVisualState/);
  assert.match(app, /Promise\.all\(\[preloadImage\(homeBg\), fontReady, inventoryReady\]\)/);
  assert.match(app, /setTimeout\(\(\) => setIsPreloaded\(true\), 4000\)/);
  assert.match(app, /Image decoding remains\s*\/\/ non-blocking on mobile/);
});

test("pet selection prepares incoming visual state before changing activePetId", () => {
  const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
  const prepareIndex = inventory.indexOf("await prepareActivePetVisualState");
  const patchIndex = inventory.indexOf('apiRequest("PATCH", "/api/user/active-pet"');
  assert.ok(prepareIndex >= 0 && patchIndex > prepareIndex);
  assert.match(inventory, /window\.setTimeout\(\(\) => controller\.abort\(\), 1200\)/);
  assert.match(inventory, /Rendering can still fall back to the normal query path/);
});

test("active-pet PATCH cancels stale auth refetches before the request and still acknowledges only success", () => {
  const queryClient = readFileSync("client/src/lib/queryClient.ts", "utf8");
  const functionStart = queryClient.indexOf("export async function apiRequest");
  const cancelIndex = queryClient.indexOf('queryClient.cancelQueries({ queryKey: ["/api/auth/me"] })', functionStart);
  const fetchIndex = queryClient.indexOf("const res = await fetch(url", functionStart);
  const successIndex = queryClient.indexOf("await throwIfResNotOk(res);", functionStart);
  const dispatchIndex = queryClient.indexOf("window.dispatchEvent(new CustomEvent(ACTIVE_PET_UPDATE_CONFIRMED_EVENT", functionStart);

  assert.ok(cancelIndex > functionStart && cancelIndex < fetchIndex);
  assert.ok(successIndex > fetchIndex && dispatchIndex > successIndex);
  assert.match(queryClient, /if \(isActivePetUpdate\) \{\s*await queryClient\.cancelQueries/);
});
