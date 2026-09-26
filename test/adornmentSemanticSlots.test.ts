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

test("administration saves and exposes an adornment Closet-space selector", () => {
  const admin = read("client/src/components/ItemDatabaseSection.tsx");
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");

  assert.match(admin, /data-testid="select-adornment-slot"/);
  assert.match(admin, /payload\.adornmentSlot = effectiveType === "costume" \? adornmentSlot : null/);
  assert.match(admin, /Adornment Closet Space/);
  assert.match(admin, /Unassigned/);
  assert.match(schema, /adornmentSlot:\s*text\("adornment_slot"\)/);
  assert.match(boot, /ADD COLUMN IF NOT EXISTS adornment_slot TEXT/);
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
