import assert from "node:assert/strict";
import test from "node:test";
import {
  finitePetCareStat,
  parsePetCareInventory,
  parsePetCareUser,
  readPetCareJson,
} from "../client/src/lib/petCareData";

test("Pet Care drops null inventory rows before components access properties", () => {
  assert.deepEqual(parsePetCareInventory([null, undefined, { id: "pet-1", type: "pet" }]), [
    { id: "pet-1", type: "pet" },
  ]);
  assert.throws(() => parsePetCareInventory({ items: [] }), /must be a JSON array/);
});

test("Pet Care user and stats have null-safe defaults", () => {
  assert.equal(parsePetCareUser(null), null);
  assert.throws(() => parsePetCareUser([]), /must be a JSON object/);
  assert.equal(finitePetCareStat(undefined, 100), 100);
  assert.equal(finitePetCareStat("bad", 0), 0);
  assert.equal(finitePetCareStat(150, 0), 100);
});

test("Pet Care reports failed and malformed API responses without property access", async () => {
  await assert.rejects(
    readPetCareJson(new Response("service unavailable", { status: 503 }), "inventory"),
    /request failed \(503\)/,
  );
  await assert.rejects(
    readPetCareJson(new Response("not-json", { status: 200 }), "inventory"),
    /was not valid JSON/,
  );
});
