import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHomeLampItemEffects,
  buildHomeSleepDecorEffects,
  isSleepEffectHomeItem,
  isTapEffectHomeItem,
} from "../client/src/lib/homeItemEffects";
import {
  sanitizeHomeCatalogEffect,
  type HomeCatalogEffect,
  type HomeSceneItemType,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

const placement = (
  id: string,
  type: HomeSceneItemType,
  homeEffect: HomeCatalogEffect | null,
  effectEnabled = false,
) => ({
  id,
  xPct: 0.42,
  yPct: 0.58,
  size: 120,
  effectEnabled,
  item: { type, homeEffect },
});

test("Home catalog effects are deliberately limited to Lamp Light Objects and Sleep Spot Decor", () => {
  assert.equal(sanitizeHomeCatalogEffect("object", "lamp_light"), "lamp_light");
  assert.equal(sanitizeHomeCatalogEffect("object", "sleep"), null);
  assert.equal(sanitizeHomeCatalogEffect("decor", "sleep"), "sleep");
  assert.equal(sanitizeHomeCatalogEffect("decor", "lamp_light"), null);
  assert.equal(sanitizeHomeCatalogEffect("decor", null), null);

  assert.equal(isTapEffectHomeItem(placement("lamp", "object", "lamp_light", true)), true);
  assert.equal(isTapEffectHomeItem(placement("bed", "decor", "sleep")), false);
  assert.equal(isSleepEffectHomeItem(placement("bed", "decor", "sleep")), true);
  assert.equal(isSleepEffectHomeItem(placement("lamp", "object", "lamp_light")), false);
});

test("placed Lamp Light follows its Object and renders only while that copy is on", () => {
  const lamp = placement("lamp-copy", "object", "lamp_light", false);
  assert.deepEqual(buildHomeLampItemEffects([lamp], 800), []);

  const [effect] = buildHomeLampItemEffects([{ ...lamp, effectEnabled: true }], 800);
  assert.equal(effect.id, "home-item-lamp:lamp-copy");
  assert.equal(effect.type, "lamp_light");
  assert.equal(effect.x, 0.42);
  assert.equal(effect.y, 0.58);
  assert.ok(effect.size >= 4 && effect.size <= 40);

  const visitorOverride = buildHomeLampItemEffects([lamp], 800, () => true);
  assert.equal(visitorOverride.length, 1);
});

test("Sleep Spot is anchored to Decor and can participate in the existing pet drop geometry", () => {
  const [effect] = buildHomeSleepDecorEffects([placement("bed-copy", "decor", "sleep")], 800);
  assert.equal(effect.id, "home-decor-sleep:bed-copy");
  assert.equal(effect.type, "sleep");
  assert.equal(effect.x, 0.42);
  assert.equal(effect.y, 0.58);
});

test("Admin uses the same sizing editor for Decor and Objects and exposes draggable effect chips", () => {
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const editor = read("client/src/components/HomeSceneSizeEditor.tsx");

  assert.equal((admin.match(/<HomeSceneSizeEditor/g) ?? []).length, 2);
  assert.match(editor, /itemLabel === "Object" \? "lamp_light" : "sleep"/);
  assert.match(editor, /effect-chip-lamp-light/);
  assert.match(editor, /effect-chip-sleep-spot/);
  assert.match(editor, /home-scene-effect-drop-target/);
  assert.match(editor, /onPointerDown=\{beginEffectDrag\}/);
  assert.match(editor, /pointInsideTarget/);
  assert.match(editor, /setHomeEffect\(availableEffect\)/);
});

test("catalog effects and per-placement Object power state persist independently", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const routes = read("server/routes/homeDecor.routes.ts");
  const storage = read("server/storage.ts");

  assert.equal((schema.match(/homeEffect: text\("home_effect"\)/g) ?? []).length, 2);
  assert.match(schema, /effectEnabled: boolean\("effect_enabled"\)\.notNull\(\)\.default\(false\)/);
  assert.match(boot, /shop_items ADD COLUMN IF NOT EXISTS home_effect TEXT/);
  assert.match(boot, /home_decor_items ADD COLUMN IF NOT EXISTS home_effect TEXT/);
  assert.match(boot, /placed_home_decor ADD COLUMN IF NOT EXISTS effect_enabled BOOLEAN NOT NULL DEFAULT false/);

  assert.match(routes, /sanitizeHomeCatalogEffect\("object", raw\)/);
  assert.match(routes, /sanitizeHomeCatalogEffect\("decor", raw\)/);
  assert.match(routes, /placement\.item\.type !== "object" \|\| placement\.item\.homeEffect !== "lamp_light"/);
  assert.match(storage, /effectEnabled: boolean/);
  assert.match(storage, /homeEffect: HomeCatalogEffect \| null/);
});

test("owner Lamp taps do not collide with drag or double-tap editing", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /HOME_EDIT_DRAG_THRESHOLD_PX/);
  assert.match(owner, /if \(!drag\.moved\)/);
  assert.match(owner, /isSecondHomeEditTap\(itemTapRef\.current, drag\.id, now\)/);
  assert.match(owner, /isSecondHomeEditTap\(outdoorDecorTapRef\.current, drag\.id, now\)/);
  assert.match(owner, /itemEffectTapTimerRef/);
  assert.match(owner, /outdoorItemEffectTapTimerRef/);
  assert.match(owner, /effectEnabled: !item\.effectEnabled/);
  assert.match(owner, /setTimeout\([\s\S]{0,260}HOME_EDIT_DOUBLE_TAP_MS/);
  assert.match(owner, /e\.type !== "pointerup"/);
});

test("Sleep Decor augments pet drop and sleep rendering without replacing building Sleep effects", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /buildHomeSleepDecorEffects\(displayedItems, containerH\)/);
  assert.match(owner, /roomSleepEffects/);
  assert.match(owner, /getHouseInteriorSleepSnapPosition\([\s\S]{0,120}roomSleepEffects/);
  assert.match(owner, /buildHomeSleepDecorEffects\(placedDecor, containerH\)/);
  assert.match(owner, /getHouseInteriorSleepSnapPosition\([\s\S]{0,120}outdoorSleepDecorEffects/);

  assert.match(visitor, /buildHomeSleepDecorEffects\(placedItems, containerH\)/);
  assert.match(visitor, /buildHomeSleepDecorEffects\(outdoorDecor, containerH\)/);
  assert.match(visitor, /isHouseInteriorSleepPosition\([\s\S]{0,120}outdoorSleepDecorEffects/);
});

test("visitors can play with Lamp Objects locally without changing the owner's saved copy", () => {
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(visitor, /visitorItemEffectOverrides/);
  assert.match(visitor, /toggleVisitorItemEffect/);
  assert.match(visitor, /onToggleItemEffect=\{toggleVisitorItemEffect\}/);
  assert.match(visitor, /visitorItemEffectOverrides\[item\.id\] \?\? item\.effectEnabled/);
  assert.doesNotMatch(visitor, /apiRequest\("PATCH"[\s\S]{0,120}pet-house\/decor\/placed/);
});
