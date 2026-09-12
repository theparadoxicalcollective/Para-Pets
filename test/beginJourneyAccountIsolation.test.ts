import assert from "node:assert/strict";
import test from "node:test";
import {
  BJ_LS_KEY,
  BJ_PLAYER_KEY,
  BJ_STARTER_INVENTORY_KEY,
  bjGetStarterInventoryId,
  bjGetStatus,
  bjRestart,
  bjSetStarterInventoryId,
  bjSetStep,
  bjUsePlayer,
} from "../client/src/lib/beginJourney";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

test("Begin Journey state is isolated when accounts share one browser", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    bjUsePlayer("player-a");
    bjRestart();
    bjSetStep(3);
    bjSetStarterInventoryId("egg-a");
    assert.equal(bjGetStatus(), "active");

    bjUsePlayer("player-b");
    assert.equal(bjGetStatus(), "not_started");
    assert.equal(bjGetStarterInventoryId(), null);
    bjRestart();
    bjSetStarterInventoryId("egg-b");

    bjUsePlayer("player-a");
    assert.equal(bjGetStarterInventoryId(), "egg-a");
    assert.equal(storage.getItem(`${BJ_LS_KEY}:player-a`), "3");
    assert.equal(storage.getItem(`${BJ_STARTER_INVENTORY_KEY}:player-b`), "egg-b");
    assert.equal(storage.getItem(BJ_PLAYER_KEY), "player-a");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
