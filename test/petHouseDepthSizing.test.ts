import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PET_HOUSE_INTERIOR_PET_BASE_SIZE,
  PET_HOUSE_OUTDOOR_PET_BASE_SIZE,
  petHouseDepthScale,
  petHouseDepthSize,
} from "../client/src/lib/petHouseSizing";

test("Pet House perspective depends only on vertical depth", () => {
  assert.equal(petHouseDepthScale.length, 1);
  assert.equal(petHouseDepthScale(0.72), 1);
  assert.ok(petHouseDepthScale(0.15) < petHouseDepthScale(0.72));
  assert.ok(petHouseDepthScale(0.90) > petHouseDepthScale(0.72));

  assert.equal(petHouseDepthSize(200, 0.72), 200);
  assert.ok(petHouseDepthSize(200, 0.15) < 200);
  assert.ok(petHouseDepthSize(200, 0.90) > 200);
});

test("Pet House depth scale is clamped and resilient to invalid positions", () => {
  assert.equal(petHouseDepthScale(-100), petHouseDepthScale(0.05));
  assert.equal(petHouseDepthScale(100), petHouseDepthScale(0.92));
  assert.equal(petHouseDepthScale(Number.NaN), 1);
});

test("owner and visitor scenes use the same pet baselines and depth helper", () => {
  assert.equal(PET_HOUSE_OUTDOOR_PET_BASE_SIZE, 90);
  assert.equal(PET_HOUSE_INTERIOR_PET_BASE_SIZE, 125);

  const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");

  for (const source of [owner, visitor]) {
    assert.match(source, /PET_HOUSE_OUTDOOR_PET_BASE_SIZE/);
    assert.match(source, /PET_HOUSE_INTERIOR_PET_BASE_SIZE/);
    assert.match(source, /petHouseDepthSize/);
    assert.match(source, /fitVisible/);
  }

  assert.doesNotMatch(visitor, /const size = 100 \+ pseudo\(seed \+ 2\) \* 30/);
});

test("outdoor pets and decor scale from yPct rather than xPct", () => {
  const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");

  assert.match(owner, /petHouseDepthSize\(cfg\.size, yPct\)/);
  assert.match(owner, /petHouseDepthSize\(item\.size, item\.yPct\)/);
  assert.match(visitor, /petHouseDepthSize\(cfg\.size, yPct\)/);
  assert.match(visitor, /petHouseDepthSize\(item\.size, item\.yPct\)/);

  assert.doesNotMatch(owner, /petHouseDepthSize\([^\n]*xPct/);
  assert.doesNotMatch(visitor, /petHouseDepthSize\([^\n]*xPct/);
});
