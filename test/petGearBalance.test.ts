import assert from "node:assert/strict";
import test from "node:test";
import { auditPetGearBalance, petGearPower, petGearPriceBand, rarityBand } from "../shared/petGearBalance";

test("3500 coin premium accessories land around 41-46 power", () => {
  const nature = auditPetGearBalance({ price: 3500, atkBoost: 18, defBoost: 18, healthBoost: 160 });
  const celestial = auditPetGearBalance({ price: 3500, atkBoost: 32, defBoost: 10, healthBoost: 80 });
  const mushroom = auditPetGearBalance({ price: 3500, atkBoost: 8, defBoost: 28, healthBoost: 180 });
  const eye = auditPetGearBalance({ price: 3500, atkBoost: 38, defBoost: 6, healthBoost: 40 });
  const aqua = auditPetGearBalance({ price: 3500, atkBoost: 22, defBoost: 16, healthBoost: 140 });

  for (const result of [nature, celestial, mushroom, eye, aqua]) {
    assert.equal(result.status, "balanced");
    assert.ok(result.power >= 41 && result.power <= 46);
  }
});

test("flags weak and excessive accessories for their price", () => {
  assert.equal(auditPetGearBalance({ price: 3500, atkBoost: 8, defBoost: 8, healthBoost: 100 }).status, "underpowered");
  assert.equal(auditPetGearBalance({ price: 3500, atkBoost: 50, defBoost: 50, healthBoost: 300 }).status, "overpowered");
});

test("weights HP below ATK and DEF to reflect the much larger HP baseline", () => {
  assert.equal(petGearPower({ atkBoost: 10, defBoost: 10, healthBoost: 200 }), 30);
});

test("returns deterministic price and rarity bands", () => {
  assert.deepEqual(petGearPriceBand(3500), { minPrice: 3001, maxPrice: 3500, minPower: 41, maxPower: 46 });
  assert.deepEqual(rarityBand(5), { minPower: 51, maxPower: 65 });
  assert.equal(auditPetGearBalance({ price: 0, atkBoost: 999 }).status, "unpriced");
});
