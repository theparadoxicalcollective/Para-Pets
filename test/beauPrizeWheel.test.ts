import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BEAU_PRIZE_WHEEL_LOSS_SLOT,
  BEAU_PRIZE_WHEEL_PAID_COST,
  BEAU_PRIZE_WHEEL_PRIZE_SLOTS,
  BEAU_PRIZE_WHEEL_SLOT_COUNT,
  DEFAULT_BEAU_POINTER_LAYOUT,
  DEFAULT_BEAU_GHOST_LAYOUT,
  beauGhostLayoutFrom,
  clampBeauLayerLayout,
  DEFAULT_BEAU_WHEEL_LAYOUT,
  beauPointerAngle,
  beauWheelOdds,
  beauPointerLayoutFrom,
  beauWheelLayoutFrom,
  beauWheelLandingRotation,
  beauWheelSlotCenterAngle,
} from "../shared/beauPrizeWheel";

const server = readFileSync("server/beauPrizeWheel.ts", "utf8");
const routes = readFileSync("server/routes/beauPrizeWheel.routes.ts", "utf8");
const migration = readFileSync("server/startup/migrations/ensureBeauPrizeWheel.ts", "utf8");
const startup = readFileSync("server/startup/runStartup.ts", "utf8");
const overlay = readFileSync("client/src/components/world/BeauPrizeWheelOverlay.tsx", "utf8");
const bridge = readFileSync("client/src/components/BeauPrizeWheelBridge.tsx", "utf8");

test("Beau wheel has seven admin prizes plus one fixed skull bonus section", () => {
  assert.equal(BEAU_PRIZE_WHEEL_SLOT_COUNT, 8);
  assert.equal(BEAU_PRIZE_WHEEL_PRIZE_SLOTS, 7);
  assert.equal(BEAU_PRIZE_WHEEL_LOSS_SLOT, 7);
  assert.equal(BEAU_PRIZE_WHEEL_PAID_COST, 2500);

  const centers = Array.from({ length: 8 }, (_, slot) => beauWheelSlotCenterAngle(slot));
  assert.deepEqual(centers, [0, 45, 90, 135, 180, 225, 270, 315]);
  assert.equal(new Set(centers.map((_, slot) => beauWheelLandingRotation(slot))).size, 8);
  assert.equal(beauWheelLandingRotation(0), 0, "slot 1 aligns with the top arrow");
  assert.equal(beauWheelLandingRotation(2), 270, "slot 3 lands at the top arrow");
});

test("spin cost, daily free spin and reward grant stay server-authoritative and atomic", () => {
  assert.match(server, /America\/Chicago/);
  assert.match(server, /BEAU_PRIZE_WHEEL_PAID_COST/);
  assert.match(server, /transaction\(async tx/);
  assert.match(server, /WHERE id = \$\{userId\}[\s\S]*FOR UPDATE/);
  assert.match(server, /FROM beau_prize_wheel_spins[\s\S]*spin_day/);
  assert.match(server, /randomInt\(totalWeight\)/);
  assert.match(server, /slotIndex === BEAU_PRIZE_WHEEL_LOSS_SLOT/);
  assert.match(server, /grantSkullBonus/);
  assert.match(server, /SKULL_BONUS_AMOUNT = 100/);
  assert.match(server, /coins = coins \+ \$\{SKULL_BONUS_AMOUNT\}/);
  assert.match(server, /essence = COALESCE\(essence, 0\) \+ \$\{SKULL_BONUS_AMOUNT\}/);
  assert.match(server, /kind: "exp", amount: SKULL_BONUS_AMOUNT/);
  assert.match(server, /requiresActivePet: true/);
  assert.match(server, /active_pet_id/);
  assert.match(server, /pet_level_points/);
  assert.match(server, /ui\.is_hatched = true/);
  assert.match(server, /UPDATE users SET coins = coins - \$\{cost\}/);
  assert.match(server, /INSERT INTO beau_prize_wheel_spins/);
});

test("wheel cannot spin until every admin prize is valid", () => {
  assert.match(server, /ready: configs\.length === BEAU_PRIZE_WHEEL_PRIZE_SLOTS && configs\.every\(Boolean\)/);
  assert.match(server, /if \(!wheel\.ready\) throw new BeauPrizeWheelError\("not_configured"/);
  assert.match(routes, /\/api\/admin\/beau-prize-wheel\/slots\/:slot/);
  assert.match(routes, /\/api\/beau-prize-wheel\/spin/);
  assert.match(bridge, /if \(!next\.ready && !next\.isAdmin\)/);
});

test("player popup uses the exact Haunted Spin artwork and independently rotating wheel", () => {
  for (const file of ["Main", "Wheel", "Arrow", "Ghost"]) assert.match(overlay, new RegExp("HauntedSpin" + file + "\\.png"));
  assert.doesNotMatch(overlay, /BeauPrizeWheel\.png|PrizeWheelEmpty\.png|PrizeWheelArrow\.png/);
  assert.match(overlay, /bg_haunted_woods_v2\.webp/);
  assert.match(overlay, /Photoroom_20260705_103527_PM_1783426783499\.png/);
  assert.match(overlay, /beauPointerAngle/);
  assert.match(overlay, /beauWheelLandingRotation/);
  assert.match(overlay, /"beau-prize-wheel-pointer"/);
  assert.match(overlay, /"beau-prize-wheel-ghost"/);
  assert.match(overlay, /transform: `rotate\(\$\{rotation\}deg\)`/);
  assert.match(overlay, /beauPointerAngle\(layout, pointerLayout\)/);
  assert.match(overlay, /data-testid="beau-skull-burst"/);
  assert.match(overlay, /SKULL_BURST_PARTICLES/);
  assert.match(overlay, /FREE SPIN/);
  assert.match(overlay, /<span>SPIN<\/span>/);
});

test("admin can set coins, essence, pet EXP, items and eggs directly on wheel sections", () => {
  for (const kind of ["coins", "essence", "exp", "item", "egg"]) {
    assert.match(overlay, new RegExp('kind: "' + kind + '"'));
  }
  assert.match(overlay, /Set Prize/);
  assert.match(overlay, /EXP is applied only to the player's currently active, hatched pet/);
  assert.match(server, /type <> 'npc'/);
  assert.match(server, /type <> 'pet' OR COALESCE\(egg_image_url, ''\) <> ''/);
});

test("Legacy Beau NPC still opens the wheel for original-world recovery and startup installs the feature", () => {
  assert.match(bridge, /BEAU_PRIZE_WHEEL_WORLD_ID/);
  assert.match(bridge, /BEAU_PRIZE_WHEEL_NPC_NAME/);
  assert.match(bridge, /npcNamesMatch/);
  assert.match(bridge, /data-testid="casino-free-play-indicator"/);
  assert.match(bridge, /data-testid="beau-free-spin-indicator"/);
  assert.match(bridge, /state\?\.ready && state\.freeSpinAvailable/);
  assert.match(bridge, /lineHeight: 1/);
  assert.match(bridge, /translateY\(-1px\)/);
  assert.match(startup, /ensureBeauPrizeWheelSchema/);
  assert.match(startup, /registerBeauPrizeWheelRoutes\(app\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS beau_prize_wheel_spins/);
  assert.match(migration, /action_id UUID PRIMARY KEY/);
});

test("admin wheel and arrow pointer placement stay independently valid", () => {
  assert.deepEqual(beauWheelLayoutFrom(DEFAULT_BEAU_WHEEL_LAYOUT), DEFAULT_BEAU_WHEEL_LAYOUT);
  assert.deepEqual(beauPointerLayoutFrom(DEFAULT_BEAU_POINTER_LAYOUT), DEFAULT_BEAU_POINTER_LAYOUT);
  assert.deepEqual(beauWheelLayoutFrom({ left: 12.345, top: 20.123, size: 78 }), { left: 12.35, top: 20.12, size: 78 });
  assert.deepEqual(beauPointerLayoutFrom({ x: 90.126, y: 50.784, size: 5.6 }), { x: 90.13, y: 50.78, size: 5.6 });
  for (const placement of [
    { left: -1, top: 20, size: 69 },
    { left: 40, top: 20, size: 69 },
    { left: 10, top: 60, size: 69 },
    { left: 20, top: 20, size: 90 },
    { left: Number.NaN, top: 20, size: 69 },
    { left: "25", top: 20, size: 69 },
  ]) assert.equal(beauWheelLayoutFrom(placement), null);
  assert.equal(beauPointerLayoutFrom({ x: 1, y: 50, size: 10 }), null);
  assert.equal(beauPointerLayoutFrom({ x: 96, y: 50, size: 12 }), null);
  const angle = beauPointerAngle(DEFAULT_BEAU_WHEEL_LAYOUT, DEFAULT_BEAU_POINTER_LAYOUT);
  assert.equal(angle, 0, "default arrow faces down from the top");
  assert.equal(beauWheelLandingRotation(0, 180), 180);
  for (const angle of [0, 90, 180, 270, 33.4]) {
    for (let slot = 0; slot < 8; slot++) {
      const landing = beauWheelLandingRotation(slot, angle);
      assert.ok(Math.abs(((landing + beauWheelSlotCenterAngle(slot)) % 360) - angle) < 1e-9);
    }
  }
  assert.match(routes, /\/api\/admin\/beau-prize-wheel\/pointer-layout/);
  assert.match(server, /POINTER_LAYOUT_SETTING_KEY/);
});

test("Haunted artwork keeps old placement records and prize settings intact, with admin-only saves", () => {
  assert.deepEqual(beauGhostLayoutFrom(DEFAULT_BEAU_GHOST_LAYOUT), DEFAULT_BEAU_GHOST_LAYOUT);
  assert.equal(beauGhostLayoutFrom({ x: 95, y: 50, size: 30 }), null);
  assert.equal(beauGhostLayoutFrom({ x: 50, y: 50, size: Infinity }), null);
  for (const layer of ["arrow", "ghost"] as const) {
    const next = clampBeauLayerLayout({ x: -10, y: 120, size: 100 }, layer);
    assert.deepEqual(layer === "arrow" ? beauPointerLayoutFrom(next) : beauGhostLayoutFrom(next), next);
  }
  assert.match(server, /beau_prize_wheel_prizes_v1/);
  assert.match(server, /beau_prize_wheel_haunted_layout_v2/);
  assert.match(server, /beau_prize_wheel_haunted_pointer_layout_v2/);
  assert.match(server, /beau_prize_wheel_haunted_ghost_layout_v2/);
  assert.match(routes, /app.put\("\/api\/admin\/beau-prize-wheel\/ghost-layout", requireAuthenticated,[\s\S]*?if \(!adminUser\(req\)\) return res.status\(403\)/);
  assert.match(overlay, /saves automatically/);
});

test("players can rotate Beau's wheel by drag and a quick flick starts one authoritative spin", () => {
  assert.match(overlay, /spinDragRef/);
  assert.match(overlay, /signedAngleDelta/);
  assert.match(overlay, /rotationRef\.current \+ delta/);
  assert.match(overlay, /Math\.abs\(spinDrag\.velocity\) >= 220/);
  assert.match(overlay, /spinDrag\.totalDelta >= 18/);
  assert.match(overlay, /void spin\(spinDrag\.velocity\)/);
  assert.match(overlay, /body: JSON\.stringify\(\{ actionId: createActionId\(\) \}\)/);
  assert.match(overlay, /beauWheelLandingRotation\(spinResult\.slotIndex, pointerAngle\)/);
  assert.match(overlay, /Tap SPIN, or drag and flick the wheel/);
});

test("weighted wheel odds are normalized, preserve legacy defaults and favor common rewards", () => {
  const uniform = beauWheelOdds(Array(8).fill("common"));
  assert.equal(uniform.length, 8);
  uniform.forEach(chance => assert.equal(chance, 0.125));
  const weighted = beauWheelOdds(["common", "uncommon", "rare", "common", "rare", "uncommon", "common", "common"]);
  assert.ok(Math.abs(weighted.reduce((sum, chance) => sum + chance, 0) - 1) < 1e-12);
  assert.ok(weighted[0] > weighted[1] && weighted[1] > weighted[2]);
  assert.match(server, /const ticket = randomInt\(totalWeight\)/);
  assert.match(overlay, /beau-prize-rarity/);
  assert.match(overlay, /LIMITED/);
});
