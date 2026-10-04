import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  broadenHomeAttachedLampIllumination,
  buildHomeLampItemEffects,
  buildHomeSleepDecorEffects,
  getHomeItemDisplayImage,
  isLampLightHomeItem,
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
  homeTapImageUrl: string | null = null,
) => ({
  id,
  xPct: 0.42,
  yPct: 0.58,
  size: 120,
  effectEnabled,
  item: {
    type,
    homeEffect,
    imageUrl: "/normal.png",
    homeTapImageUrl,
    homeEffectX: 0.5,
    homeEffectY: 0.5,
    homeEffectSize: 40,
  },
});

test("Home catalog effects allow Lamp Light on Objects or Decor, Tap Image on Objects, and Sleep Spot on Decor", () => {
  assert.equal(sanitizeHomeCatalogEffect("object", "lamp_light"), "lamp_light");
  assert.equal(sanitizeHomeCatalogEffect("object", "tap"), "tap");
  assert.equal(sanitizeHomeCatalogEffect("object", "sleep"), null);
  assert.equal(sanitizeHomeCatalogEffect("decor", "sleep"), "sleep");
  assert.equal(sanitizeHomeCatalogEffect("decor", "lamp_light"), "lamp_light");
  assert.equal(sanitizeHomeCatalogEffect("decor", "tap"), null);
  assert.equal(sanitizeHomeCatalogEffect("decor", null), null);

  assert.equal(isTapEffectHomeItem(placement("lamp", "object", "lamp_light", true)), true);
  assert.equal(isTapEffectHomeItem(placement("switch", "object", "tap", true, "/tap.png")), true);
  assert.equal(isTapEffectHomeItem(placement("bed", "decor", "sleep")), false);
  assert.equal(isTapEffectHomeItem(placement("decor-lamp", "decor", "lamp_light", true)), true);
  assert.equal(isLampLightHomeItem(placement("lamp", "object", "lamp_light")), true);
  assert.equal(isLampLightHomeItem(placement("decor-lamp", "decor", "lamp_light")), true);
  assert.equal(isLampLightHomeItem(placement("switch", "object", "tap", true, "/tap.png")), false);
  assert.equal(isSleepEffectHomeItem(placement("bed", "decor", "sleep")), true);
});

test("placed Lamp Light follows either an Object or Decor and Tap Image Objects never create a lamp glow", () => {
  const lamp = placement("lamp-copy", "object", "lamp_light", false);
  assert.deepEqual(buildHomeLampItemEffects([lamp], 800), []);

  const [effect] = buildHomeLampItemEffects([{ ...lamp, effectEnabled: true }], 800);
  assert.equal(effect.id, "home-item-lamp:lamp-copy");
  assert.equal(effect.type, "lamp_light");
  assert.equal(effect.x, 0.42);
  assert.equal(effect.y, 0.58);
  assert.ok(effect.size >= 4 && effect.size <= 40);

  const tapObject = placement("tap-copy", "object", "tap", true, "/tap.png");
  assert.deepEqual(buildHomeLampItemEffects([tapObject], 800), []);

  const decorLamp = placement("decor-lamp-copy", "decor", "lamp_light", true);
  const [decorEffect] = buildHomeLampItemEffects([decorLamp], 800);
  assert.equal(decorEffect.id, "home-item-lamp:decor-lamp-copy");

  const movedLamp = placement("moved-lamp", "decor", "lamp_light", true);
  movedLamp.item.homeEffectX = 0.8;
  movedLamp.item.homeEffectY = 0.2;
  movedLamp.item.homeEffectSize = 80;
  const [movedEffect] = buildHomeLampItemEffects([movedLamp], 800, undefined, 1200);
  assert.ok(movedEffect.x > movedLamp.xPct);
  assert.ok(movedEffect.y < movedLamp.yPct);
  assert.ok(movedEffect.size > effect.size);

  const visitorOverride = buildHomeLampItemEffects([lamp], 800, () => true);
  assert.equal(visitorOverride.length, 1);
});

test("attached Lamp Light keeps its visible size while larger saved effects illuminate more area", () => {
  const smallLamp = placement("small-lamp", "decor", "lamp_light", true);
  smallLamp.item.homeEffectSize = 30;
  const largeLamp = placement("large-lamp", "decor", "lamp_light", true);
  largeLamp.item.homeEffectSize = 100;

  const [smallVisible] = buildHomeLampItemEffects([smallLamp], 800, undefined, 1200);
  const [largeVisible] = buildHomeLampItemEffects([largeLamp], 800, undefined, 1200);
  const [smallIllumination] = broadenHomeAttachedLampIllumination([smallVisible]);
  const [largeIllumination] = broadenHomeAttachedLampIllumination([largeVisible]);

  assert.equal(smallIllumination.x, smallVisible.x);
  assert.equal(smallIllumination.y, smallVisible.y);
  assert.equal(largeIllumination.x, largeVisible.x);
  assert.equal(largeIllumination.y, largeVisible.y);
  assert.ok(smallIllumination.size > smallVisible.size);
  assert.ok(largeIllumination.size > largeVisible.size);
  assert.ok(largeIllumination.size > smallIllumination.size);
  assert.ok(largeIllumination.size <= 46);
  assert.equal(
    smallVisible.size,
    buildHomeLampItemEffects([smallLamp], 800, undefined, 1200)[0].size,
  );
});

test("Tap Image Objects alternate between catalog artwork without changing placement geometry", () => {
  const tapObject = placement("tap-copy", "object", "tap", false, "/tap.png");
  assert.equal(getHomeItemDisplayImage(tapObject), "/normal.png");
  assert.equal(getHomeItemDisplayImage(tapObject, true), "/tap.png");
  assert.equal(getHomeItemDisplayImage(tapObject, false), "/normal.png");

  const missingAlternate = placement("missing", "object", "tap", true, null);
  assert.equal(getHomeItemDisplayImage(missingAlternate), "/normal.png");

  const lamp = placement("lamp-copy", "object", "lamp_light", true, "/unused.png");
  assert.equal(getHomeItemDisplayImage(lamp), "/normal.png");
});

test("Sleep Spot is anchored to Decor and can participate in the existing pet drop geometry", () => {
  const [effect] = buildHomeSleepDecorEffects([placement("bed-copy", "decor", "sleep")], 800);
  assert.equal(effect.id, "home-decor-sleep:bed-copy");
  assert.equal(effect.type, "sleep");
  assert.equal(effect.x, 0.42);
  assert.equal(effect.y, 0.58);
});

test("Admin uses the shared sizing editor and exposes Decor Sleep/Lamp plus Object Lamp/Tap controls", () => {
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const editor = read("client/src/components/HomeSceneSizeEditor.tsx");

  assert.equal((admin.match(/<HomeSceneSizeEditor/g) ?? []).length, 2);
  assert.match(editor, /effect: "lamp_light"/);
  assert.match(editor, /effect: "tap"/);
  assert.match(editor, /effect: "sleep"/);
  assert.match(editor, /Choose Sleep Spot or Lamp Light/);
  assert.match(editor, /safe-area-inset-top/);
  assert.match(editor, /effect-chip-lamp-light/);
  assert.match(editor, /effect-chip-tap-image/);
  assert.match(editor, /effect-chip-sleep-spot/);
  assert.match(editor, /tap-image-upload-panel/);
  assert.match(editor, /button-upload-tap-image/);
  assert.match(editor, /button-replace-tap-image/);
  assert.match(editor, /Preview Tapped Image/);
  assert.match(editor, /homeEffect === "tap" && !effectiveTapImage/);
  assert.match(editor, /home-scene-effect-drop-target/);
  assert.match(editor, /beginEffectDrag\(event, option\.effect\)/);
  assert.match(editor, /pointInsideTarget/);
  assert.match(editor, /<HomeInteriorEffectsLayer/);
  assert.match(editor, /Position \/ Resize/);
  assert.match(editor, /effectEditMode/);
  assert.match(editor, /home-item-effect-position-controls/);
  assert.match(editor, /setEffectTransform/);
});

test("Tap artwork and per-placement Object state persist independently", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const routes = read("server/routes/homeDecor.routes.ts");
  const storage = read("server/storage.ts");

  assert.equal((schema.match(/homeEffect: text\("home_effect"\)/g) ?? []).length, 2);
  assert.match(schema, /homeTapImageUrl: text\("home_tap_image_url"\)/);
  assert.equal((schema.match(/homeEffectX: real\("home_effect_x"\)/g) ?? []).length, 2);
  assert.equal((schema.match(/homeEffectY: real\("home_effect_y"\)/g) ?? []).length, 2);
  assert.equal((schema.match(/homeEffectSize: integer\("home_effect_size"\)/g) ?? []).length, 2);
  assert.match(schema, /effectEnabled: boolean\("effect_enabled"\)\.notNull\(\)\.default\(false\)/);
  assert.match(boot, /shop_items ADD COLUMN IF NOT EXISTS home_effect TEXT/);
  assert.match(boot, /shop_items ADD COLUMN IF NOT EXISTS home_tap_image_url TEXT/);
  assert.match(boot, /shop_items ADD COLUMN IF NOT EXISTS home_effect_x REAL/);
  assert.match(boot, /home_decor_items ADD COLUMN IF NOT EXISTS home_effect_size INTEGER/);
  assert.match(boot, /placed_home_decor ADD COLUMN IF NOT EXISTS effect_enabled BOOLEAN NOT NULL DEFAULT false/);

  assert.match(routes, /sanitizeHomeCatalogEffect\("object", raw\)/);
  assert.match(routes, /homeTapImageData/);
  assert.match(routes, /processWorldImage\(req\.body\.homeTapImageData, 2000\)/);
  assert.match(routes, /Tap effect requires an alternate Tap image/);
  assert.match(routes, /patch\.homeEffectX/);
  assert.match(routes, /patch\.homeEffectY/);
  assert.match(routes, /patch\.homeEffectSize/);
  assert.match(routes, /const isLampToggle = placement\.item\.homeEffect === "lamp_light"/);
  assert.match(routes, /const isTapImageToggle = placement\.item\.type === "object" && placement\.item\.homeEffect === "tap"/);
  assert.match(storage, /effectEnabled: boolean/);
  assert.match(storage, /homeTapImageUrl: string \| null/);
  assert.match(storage, /itemHomeTapImageUrl: shopItems\.homeTapImageUrl/);
});

test("owner Object taps do not collide with drag or double-tap editing, and Tap artwork renders in both locations", () => {
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
  assert.equal((owner.match(/getHomeItemDisplayImage\(item\)/g) ?? []).length, 2);
});

test("Sleep Decor augments pet drop and sleep rendering without replacing building Sleep effects", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /buildHomeSleepDecorEffects\(displayedItems, containerH, imgWidth\)/);
  assert.match(owner, /roomSleepEffects/);
  assert.match(owner, /getHouseInteriorSleepSnapPosition\([\s\S]{0,120}roomSleepEffects/);
  assert.match(owner, /buildHomeSleepDecorEffects\(placedDecor, containerH, imgWidth\)/);
  assert.match(owner, /getHouseInteriorSleepSnapPosition\([\s\S]{0,120}outdoorSleepDecorEffects/);

  assert.match(visitor, /buildHomeSleepDecorEffects\(placedItems, containerH, imgWidth\)/);
  assert.match(visitor, /buildHomeSleepDecorEffects\(outdoorDecor, containerH, imgWidth\)/);
  assert.match(visitor, /isHouseInteriorSleepPosition\([\s\S]{0,120}outdoorSleepDecorEffects/);
});

test("owner and visitor darkness layers use the broader attached-lamp illumination footprint", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /broadenHomeAttachedLampIllumination\(itemLampEffects\)/);
  assert.match(owner, /broadenHomeAttachedLampIllumination\(outdoorLampEffects\)/);
  assert.match(owner, /roomLightEffects[\s\S]{0,180}itemLampIlluminationEffects/);
  assert.match(owner, /outdoorLightEffects[\s\S]{0,220}outdoorLampIlluminationEffects/);

  assert.match(visitor, /broadenHomeAttachedLampIllumination\(itemLampEffects\)/);
  assert.match(visitor, /broadenHomeAttachedLampIllumination\(outdoorLampEffects\)/);
  assert.match(visitor, /roomLightEffects[\s\S]{0,180}itemLampIlluminationEffects/);
  assert.match(visitor, /outdoorLightEffects[\s\S]{0,220}outdoorLampIlluminationEffects/);
});

test("attached Lamp Light renders in front of placed Home artwork for owners and visitors", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.equal((owner.match(/effects=\{itemLampEffects\}[\s\S]{0,180}zIndex=\{24\}/g) ?? []).length, 1);
  assert.equal((owner.match(/effects=\{outdoorLampEffects\}[\s\S]{0,180}zIndex=\{24\}/g) ?? []).length, 1);
  assert.equal((visitor.match(/effects=\{itemLampEffects\}[\s\S]{0,180}zIndex=\{24\}/g) ?? []).length, 1);
  assert.equal((visitor.match(/effects=\{outdoorLampEffects\}[\s\S]{0,180}zIndex=\{24\}/g) ?? []).length, 1);
});

test("visitors can toggle Lamp or Tap Image Objects locally without changing the owner's saved copy", () => {
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(visitor, /visitorItemEffectOverrides/);
  assert.match(visitor, /toggleVisitorItemEffect/);
  assert.match(visitor, /onToggleItemEffect=\{toggleVisitorItemEffect\}/);
  assert.match(visitor, /visitorItemEffectOverrides\[item\.id\] \?\? item\.effectEnabled/);
  assert.match(visitor, /getHomeItemDisplayImage\(item, itemEffectEnabled\)/);
  assert.doesNotMatch(visitor, /apiRequest\("PATCH"[\s\S]{0,120}pet-house\/decor\/placed/);
});
