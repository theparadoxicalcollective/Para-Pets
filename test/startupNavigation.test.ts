import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fetchStartupInventory } from "../client/src/lib/startupInventory";

// Evaluate the real route selector with inert JSX and mocked auth/location.
// The returned element type/key are React's reconciliation identity: changing
// either remounts App even when the authenticated account has not changed.
function rootHarness() {
  let location = "/";
  let user: any = { id: "player-a", emailVerified: true };
  const App = () => null;
  const exports: any = {};
  const output = ts.transpileModule(
    readFileSync("client/src/RootEntry.tsx", "utf8") + "\nexport { RootEntryInner };",
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      if (name === "./App") return { default: App };
      if (name === "wouter") return { useLocation: () => [location], Redirect: () => null };
      if (name === "@tanstack/react-query") return { useQuery: () => ({ data: user, isLoading: false }) };
      if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown, key: unknown) => ({ type, props, key }) };
      return {};
    },
  });
  return {
    App,
    render(path: string, nextUser = user) { location = path; user = nextUser; return exports.RootEntryInner(); },
  };
}

test("Home and game routes preserve App identity; an account switch resets it", () => {
  const h = rootHarness();
  const home = h.render("/");
  assert.equal(home.type, h.App);
  for (const path of ["/map", "/world/swamp", "/pets", "/", "/market"]) {
    const page = h.render(path);
    assert.equal(page.type, home.type);
    assert.equal(page.key, home.key);
  }
  assert.notEqual(h.render("/map", { id: "player-b", emailVerified: true }).key, home.key);
});

test("unverified accounts remain gated on Home and direct game links", () => {
  const h = rootHarness();
  for (const path of ["/", "/map", "/pvp", "/pet-care/pet-a"]) {
    assert.notEqual(h.render(path, { id: "new", emailVerified: false }).type, h.App);
  }
  for (const path of ["/hub", "/privacy", "/reset-password/example"]) {
    assert.equal(h.render(path).type, h.App);
  }
});

test("startup caches valid inventory and passes cancellation to fetch", async () => {
  const controller = new AbortController();
  const items = [{ inventoryId: "pet-a", type: "pet" }];
  const seeded: unknown[] = [];
  const fetcher: typeof fetch = async (_url, options) => {
    assert.equal(options?.signal, controller.signal);
    assert.equal(options?.credentials, "include");
    return Response.json(items);
  };
  assert.deepEqual(await fetchStartupInventory(controller.signal, value => seeded.push(value), fetcher), items);
  assert.deepEqual(seeded, [items]);
});

test("401, server errors and malformed responses cannot poison the inventory cache", async () => {
  for (const response of [Response.json({ message: "Unauthorized" }, { status: 401 }), Response.json({ message: "Unavailable" }, { status: 503 }), Response.json({ items: [] })]) {
    const result = await fetchStartupInventory(new AbortController().signal, () => assert.fail("unexpected cache write"), async () => response);
    assert.equal(result, null);
  }
});

test("a response finishing after account disposal cannot overwrite the new inventory", async () => {
  const controller = new AbortController();
  let finishBody!: (value: unknown) => void;
  const body = new Promise(resolve => { finishBody = resolve; });
  const result = fetchStartupInventory(controller.signal, () => assert.fail("stale account wrote to cache"), async () => ({ ok: true, json: () => body }) as Response);
  await Promise.resolve();
  controller.abort();
  finishBody([{ inventoryId: "old-account-pet" }]);
  assert.equal(await result, null);
});
