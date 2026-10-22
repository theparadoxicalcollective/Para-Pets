import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { nextPetParkSlotPurchase } from "../server/petPark/slotPolicy";

test("slot 1 is free and slot 2 costs exactly 2500", () => {
  assert.deepEqual(nextPetParkSlotPurchase(1, 2), { kind: "purchase", cost: 2500, unlockedSlots: 2 });
});
test("slot 3 requires slot 2 and costs exactly 5000", () => {
  assert.deepEqual(nextPetParkSlotPurchase(1, 3), { kind: "invalid" });
  assert.deepEqual(nextPetParkSlotPurchase(2, 3), { kind: "purchase", cost: 5000, unlockedSlots: 3 });
});
test("repeated purchase is idempotent; malformed slot requests are invalid", () => {
  assert.deepEqual(nextPetParkSlotPurchase(2, 2), { kind: "already_unlocked", unlockedSlots: 2 });
  assert.deepEqual(nextPetParkSlotPurchase(3, 3), { kind: "already_unlocked", unlockedSlots: 3 });
  assert.deepEqual(nextPetParkSlotPurchase(1, 4), { kind: "invalid" });
  assert.deepEqual(nextPetParkSlotPurchase(1, 1), { kind: "invalid" });
  assert.deepEqual(nextPetParkSlotPurchase(1, 2.5), { kind: "invalid" });
});
test("slot purchase route requires authentication, park availability and serialized atomic deduction", () => {
  const route = readFileSync("server/routes/petParkSlots.routes.ts", "utf8");
  const registration = readFileSync("server/routes.ts", "utf8");
  assert.match(route, /app\.post\("\/api\/pet-park\/slots\/unlock", isAuthenticated/);
  assert.match(route, /if \(!park\?\.enabled\)/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /await db\.transaction/);
  assert.match(route, /gte\(users\.coins, decision\.cost\)/);
  assert.match(route, /decision\.kind === "already_unlocked"/);
  assert.match(registration, /registerPetParkSlotRoutes\(app, isAuthenticated\)/);
});
