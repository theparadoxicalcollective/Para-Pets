import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkPetActivity, parkPetPosition } from "../client/src/lib/petParkActivity";

const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("Pet Park replaces staff-locked Keeper's Central navigation entry", () => {
  assert.match(nav, /label: "Pet Park"/);
  assert.match(nav, /navigate\("\/pet-park"\)/);
  assert.doesNotMatch(nav, /item\.id === "keepers" && !isStaff/);
  assert.match(park, /Pet Park — Under Construction/);
});

test("park placement is deterministic, bounded and supports admin rest spots", () => {
  const spots = [{ xPct: 0.5, yPct: 0.7 }];
  for (let index = 0; index < 100; index++) {
    const id = `pet-${index}`;
    const first = parkPetPosition(index, 100, id, spots);
    assert.deepEqual(first, parkPetPosition(index, 100, id, spots));
    assert.ok(first.x >= 0.08 && first.x <= 0.92);
    assert.ok(first.y >= 0.24 && first.y <= 0.89);
  }
});

test("offline activity is stable per pet, honors reduced motion and preserves inspection", () => {
  assert.deepEqual(parkPetActivity("visitor-a"), parkPetActivity("visitor-a"));
  assert.match(park, /prefers-reduced-motion: reduce/);
  assert.match(park, /isParkSleepPosition\(position, scene\.items/);
  assert.match(park, /pet\.pose === "sleep"/);
  assert.match(park, /sleeping \? "sleep" : "idle"/);
  assert.match(park, /setInspectedPet\(pet\)/);
  assert.match(park, /refetchInterval: 30_000/);
});
