import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("adornment Closet spaces have fixed names and ordering", () => {
  const feature = read("shared/costumeFeature.ts");
  assert.match(feature, /head:\s*1/);
  assert.match(feature, /left_hand:\s*2/);
  assert.match(feature, /right_hand:\s*3/);
  assert.match(feature, /wings:\s*4/);
  assert.match(feature, /back:\s*5/);
  assert.match(feature, /label:\s*"Head"/);
  assert.match(feature, /label:\s*"Left Hand"/);
  assert.match(feature, /label:\s*"Right Hand"/);
  assert.match(feature, /label:\s*"Wings"/);
  assert.match(feature, /label:\s*"Back"/);
});

test("administration saves and exposes a single adornment type selector", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");

  assert.match(admin, /data-testid="select-adornment-slot"/);
  assert.match(admin, /payload\.adornmentSlot = effectiveType === "costume" \? adornmentSlot : null/);
  assert.match(admin, /Adornment Type/);
  assert.match(admin, /Unassigned/);
  assert.match(schema, /adornmentSlot:\s*text\("adornment_slot"\)/);
  assert.match(boot, /ADD COLUMN IF NOT EXISTS adornment_slot TEXT/);
});

test("administration can assign safe item-level effects to adornments", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");
  const animation = read("shared/adornmentAnimation.ts");
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const routes = read("server/routes/costumePlayer.routes.ts");
  const artwork = read("client/src/components/AdornmentArtwork.tsx");
  const animator = read("client/src/components/PetAnimator.tsx");

  assert.match(admin, /data-testid="select-adornment-effect"/);
  assert.match(admin, />Effects<\/label>/);
  assert.match(animation, /float: "Float — balloon-like loop"/);
  assert.match(animation, /spin: "Spin — slow clockwise"/);
  assert.match(animation, /sway: "Sway — gentle side to side"/);
  assert.match(animation, /pulse: "Pulse — subtle magical breathing"/);
  assert.match(admin, /payload\.adornmentEffect = effectiveType === "costume" && adornmentSlot !== "wings" \? \(adornmentEffect \|\| null\) : null/);

  assert.match(animation, /ADORNMENT_ITEM_EFFECTS = \["still", "float", "spin", "sway", "pulse"\]/);
  assert.match(animation, /spin:\s*"rotate"/);
  assert.match(animation, /pulse:\s*"breathe"/);
  assert.match(schema, /adornmentEffect:\s*text\("adornment_effect"\)/);
  assert.match(boot, /ADD COLUMN IF NOT EXISTS adornment_effect TEXT/);

  assert.match(routes, /adornmentEffect:\s*shopItems\.adornmentEffect/);
  assert.match(animator, /adornmentEffect\?: AdornmentItemEffect \| null/);
  assert.match(animator, /effect=\{costume\.adornmentEffect\}/);
  assert.match(artwork, /const overrideProfile = adornmentItemEffectAnimation\(effect\)/);
  assert.match(artwork, /const safeFittedProfile = fittedProfile === "wings" \? "none" : fittedProfile/);
  assert.match(artwork, /const profile = wingPair \? "wings" : overrideProfile \?\? safeFittedProfile/);
  assert.match(artwork, /const mirroredPair = wingPair/);
  assert.match(animator, /wingPair=\{costume\.slot === ADORNMENT_SLOT_MAP\.wings\}/);
});

test("Wings adornment type automatically uses front-facing mirrored open-close motion", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");
  const animation = read("shared/adornmentAnimation.ts");
  const animator = read("client/src/components/PetAnimator.tsx");
  const artwork = read("client/src/components/AdornmentArtwork.tsx");
  const schema = read("shared/schema.ts");

  assert.match(admin, /data-testid="adornment-wings-effect"/);
  assert.match(admin, /Upload the wing adornment once/);
  assert.match(admin, /No separate wing spots are needed/);
  assert.match(admin, /adornmentSlot === "wings"/);
  assert.match(admin, /ADORNMENT_ITEM_EFFECTS\.map/);
  assert.match(admin, /adornmentSlot !== "wings"/);
  assert.doesNotMatch(animation, /ADORNMENT_ITEM_EFFECTS = \[[^\]]*"wings"/);
  assert.match(animation, /@keyframes adornment-wings \{ 0%,100% \{ transform:rotate\(-10deg\) scaleX\(\.74\); \} 50% \{ transform:rotate\(8deg\) scaleX\(1\); \} \}/);
  assert.match(animator, /wingPair=\{costume\.slot === ADORNMENT_SLOT_MAP\.wings\}/);
  assert.match(animator, /viewPlacements\.slice\(0, 1\)/);
  assert.match(artwork, /const profile = wingPair \? "wings"/);
  assert.match(schema, /Wings adornments use automatic mirrored wing motion instead of a selectable effect/);
});

test("Still Head and hand adornments follow the matching animated pet part", () => {
  const animator = read("client/src/components/PetAnimator.tsx");

  assert.match(animator, /function semanticStillPartType/);
  assert.match(animator, /costume\.adornmentEffect !== "still"/);
  assert.match(animator, /ADORNMENT_SLOT_MAP\.head\) return "head"/);
  assert.match(animator, /ADORNMENT_SLOT_MAP\.left_hand\) return "left_hand"/);
  assert.match(animator, /ADORNMENT_SLOT_MAP\.right_hand\) return "right_hand"/);
  assert.match(animator, /function rebasePlacementToPart/);
  assert.match(animator, /const placement = followPart \? rebasePlacementToPart\(savedPlacement, followPart, sortedParts\) : savedPlacement/);
  assert.match(animator, /animation: animName \? buildAnimation\(animName, duration, partDelay\) : undefined/);
});

test("base and evolution adornment fittings are stored separately with safe base fallback", () => {
  const feature = read("shared/costumeFeature.ts");
  const schema = read("shared/costumeSchema.ts");
  const editor = read("client/src/components/PetDatabasePanel.tsx");
  const animator = read("client/src/components/PetAnimator.tsx");

  assert.match(feature, /CostumeArtworkForm = "base" \| "evolution"/);
  assert.match(feature, /form\?: CostumeArtworkForm/);
  assert.match(schema, /form: z\.enum\(\["base", "evolution"\]\)\.default\("base"\)/);
  assert.match(schema, /\$\{placement\.form\}:\$\{placement\.view\}:\$\{placement\.instance\}/);
  assert.match(editor, /data-testid="button-adornment-form-base"/);
  assert.match(editor, /data-testid="button-adornment-form-evolution"/);
  assert.match(editor, /REGULAR PET ADORNMENTS/);
  assert.match(editor, /EVOLUTION ADORNMENTS/);
  assert.match(editor, /\(placement\.form \?\? "base"\) === costumeArtworkForm/);
  assert.match(animator, /function placementsForArtworkForm/);
  assert.match(animator, /artworkForm === "base"/);
  assert.match(animator, /resolvedArtworkForm/);
});

test("Head adornments can optionally hide the native Above Head pet part", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const routes = read("server/routes/costumePlayer.routes.ts");
  const animator = read("client/src/components/PetAnimator.tsx");

  assert.match(admin, /data-testid="toggle-head-adornment-hide-above-head"/);
  assert.match(admin, /adornmentSlot === "head"/);
  assert.match(admin, /payload\.hideAboveHeadPart = effectiveType === "costume" && adornmentSlot === "head" \? hideAboveHeadPart : false/);
  assert.match(schema, /hideAboveHeadPart:\s*boolean\("hide_above_head_part"\)\.notNull\(\)\.default\(false\)/);
  assert.match(boot, /ADD COLUMN IF NOT EXISTS hide_above_head_part BOOLEAN NOT NULL DEFAULT false/);
  assert.match(routes, /hideAboveHeadPart:\s*shopItems\.hideAboveHeadPart/);
  assert.match(animator, /costume\.slot === ADORNMENT_SLOT_MAP\.head/);
  assert.match(animator, /costume\.hideAboveHeadPart !== true/);
  assert.match(animator, /hasAboveHead && !hideAboveHeadPart/);
});

test("player Closet filters assigned adornments by space and Wings replaces native wing parts", () => {
  const closet = read("client/src/components/PetCostumeEquipmentSection.tsx");
  const routes = read("server/routes/costumePlayer.routes.ts");
  const inventory = read("server/routes.ts");
  const animator = read("client/src/components/PetAnimator.tsx");

  assert.match(closet, /item\.adornmentSlot === selectedSlotDefinition\.key/);
  assert.match(closet, />\{slotDefinition\.label\}<\/span>/);
  assert.doesNotMatch(closet, /\[ \{slotDefinition\.label\} \]/);
  assert.match(routes, /costumeItem\.adornmentSlot !== slotDefinition\.key/);
  assert.match(inventory, /adornmentSlot:\s*shopItem\?\.adornmentSlot \?\? null/);
  assert.match(animator, /costume\.slot === ADORNMENT_SLOT_MAP\.wings/);
  assert.match(animator, /part\.partType\.toLowerCase\(\)\.includes\("wing"\)/);
});
