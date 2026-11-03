import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareInventoryPetVisualState, type ActivePetVisualCache } from "../client/src/lib/activePetVisuals";

class Cache implements ActivePetVisualCache {
  values = new Map<string, unknown>();
  getQueryData<T = unknown>(key: readonly unknown[]): T | undefined {
    return this.values.get(JSON.stringify(key)) as T | undefined;
  }
  setQueryData<T = unknown>(key: readonly unknown[], value: T): unknown {
    this.values.set(JSON.stringify(key), value);
    return value;
  }
}

const records = [
  { inventoryId: "egg", petTemplateId: "egg-tpl", type: "pet", isHatched: false, rarity: 5, petLevel: 2 },
  { inventoryId: "common", petTemplateId: "common-tpl", type: "pet", isHatched: true, rarity: 1, petLevel: 5 },
  { inventoryId: "legend", petTemplateId: "legend-tpl", type: "pet", isHatched: true, rarity: 5, petLevel: 10 },
  { inventoryId: "other", petTemplateId: null, type: "potion", isHatched: false, rarity: 1, petLevel: 0 },
];

test("inventory preparation reuses appearance caches for only hatched pets, preserving evolution form", async () => {
  const cache = new Cache();
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/costumes")) return Response.json({ isEvolved: url.includes("/legend/"), equipped: [] });
    if (url.endsWith("/mini-pet")) return Response.json({ equipped: null });
    if (url.includes("/pet-template-parts/")) return Response.json({ parts: [{ id: "body", imageUrl: "/body.png" }] });
    return Response.json({}, { status: 404 });
  };
  const options = { pets: records, cache, signal: new AbortController().signal, fetcher };
  assert.equal(await prepareInventoryPetVisualState(options), 2);
  assert.ok(calls[0].includes("/legend/") || calls[1].includes("/legend/"), "higher rarity prepares first");
  assert.ok(calls.every(url => !url.includes("egg") && !url.includes("other")));
  assert.deepEqual(cache.getQueryData(["/api/pet", "legend", "costumes", "owner"]), { isEvolved: true, equipped: [] });
  assert.ok(cache.getQueryData(["/api/pet-template-parts", "legend-tpl", "evolution"]));
  assert.ok(cache.getQueryData(["/api/pet-template-parts", "common-tpl"]));
  assert.deepEqual(cache.getQueryData(["/api/pet", "legend", "mini-pet", "owner"]), { equipped: null });
  const requestCount = calls.length;
  assert.equal(await prepareInventoryPetVisualState(options), 2);
  assert.equal(calls.length, requestCount, "prepared collection should reuse metadata");
});

test("inventory preparation is concurrency-limited and cancellation-aware", async () => {
  const cache = new Cache();
  const controller = new AbortController();
  const many = Array.from({ length: 12 }, (_, i) => ({
    inventoryId: `owned-${i}`, petTemplateId: `tpl-${i}`, isHatched: true, type: "pet", rarity: 4,
  }));
  let inFlight = 0;
  let highWater = 0;
  const fetcher: typeof fetch = async input => {
    inFlight++;
    highWater = Math.max(highWater, inFlight);
    await Promise.resolve();
    inFlight--;
    const url = String(input);
    if (url.endsWith("/costumes")) return Response.json({ isEvolved: false, equipped: [] });
    if (url.endsWith("/mini-pet")) return Response.json({ equipped: null });
    return Response.json({ parts: [] });
  };
  assert.equal(await prepareInventoryPetVisualState({ pets: many, cache, signal: controller.signal, fetcher, concurrency: 2 }), 12);
  assert.ok(highWater <= 4, "at most two pets may fetch costume + mini data concurrently");

  controller.abort();
  let called = false;
  assert.equal(await prepareInventoryPetVisualState({
    pets: many, cache: new Cache(), signal: controller.signal,
    fetcher: async () => { called = true; return Response.json({}); },
  }), 0);
  assert.equal(called, false, "an aborted navigation cannot start new fetches");
});

test("inventory page prepares metadata before revealing the pet grid with a bounded loading state", () => {
  const page = readFileSync("client/src/pages/PetInventoryPage.tsx", "utf8");
  const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
  const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
  const mini = readFileSync("client/src/components/MiniPetRenderer.tsx", "utf8");

  assert.match(page, /prepareInventoryPetVisualState\(\{/);
  assert.match(page, /window\.setTimeout\(\(\) => \{ controller\.abort\(\); finish\(\); \}, 6000\)/);
  assert.match(page, /if \(inventoryError \|\| readyForUser !== resolvedUser\.id\)/);
  assert.match(page, /data-testid="pet-inventory-loading-page"/);
  assert.match(page, /<ViewportModalPortal>/);
  assert.match(page, /Try again/);
  assert.match(page, /onClick=\{\(\) => navigate\("\/"\)\}/);
  assert.match(page, /defaultTab="pets"[\s\S]*pageMode/);

  assert.match(inventory, /rootMargin: "960px"/);
  assert.match(inventory, /if \(entry\.isIntersecting\) \{ setVisible\(true\); observer\.disconnect\(\); \}/);
  assert.match(inventory, /<VisibleAssetImage src=\{imageUrl\}/);
  assert.match(inventory, /<\/ErrorBoundary> : <span aria-hidden="true" data-testid="inventory-pet-portrait-pending" \/>/);
  assert.match(animator, /costumeAccess === "public" \|\| performanceStatic \? 60_000 : 0/);
  assert.match(mini, /staleTime: animated \? 0 : 60_000/);
  assert.match(mini, /refetchOnMount: animated \? "always" : true/);
});
