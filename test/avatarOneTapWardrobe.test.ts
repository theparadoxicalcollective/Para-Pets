import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/PlayerAvatarPage.tsx", "utf8");

test("first-time creation still previews required pieces until the character is created", () => {
  const selection = source.slice(source.indexOf("const chooseClothing"), source.indexOf("const toggleTuck"));
  assert.match(selection, /if \(!avatar\?\.created\)/);
  assert.match(selection, /setPreviewSelections\(current => \(\{ \.\.\.current, \[category\]: item\.inventoryId \}\)\)/);
  assert.match(source, /missingFirstOutfit\.length > 0/);
  assert.match(source, /outfit: firstOutfit as AvatarCreationOutfit/);
});

test("existing players equip clothing immediately with one item tap and revision checks", () => {
  const selection = source.slice(source.indexOf("const chooseClothing"), source.indexOf("const toggleTuck"));
  assert.match(selection, /if \(busy \|\| !item\.compatible \|\| item\.isListed \|\| item\.quantity <= 0\) return/);
  assert.match(selection, /if \(avatar\?\.created && appearanceChanged\) return/);
  assert.match(selection, /saved\?\.inventoryId === item\.inventoryId/);
  assert.match(selection, /saveEquipment\(item\.inventoryId\)/);
  assert.match(source, /onClick=\{\(\) => chooseClothing\(item\)\}/);
  assert.match(source, /expectedRevision: avatar\.revision, accountId: userId/);
  assert.doesNotMatch(source, /data-testid="avatar-equip-button"/);
  assert.doesNotMatch(source, /toast\(\{ title: "Wardrobe saved"/);
});

test("only errors show notifications and any failed equipment mutation clears its preview", () => {
  assert.match(source, /toast\(\{ title: "Wardrobe not saved"/);
  const errorStart = source.indexOf('toast({ title: "Wardrobe not saved"');
  const afterError = source.slice(errorStart, source.indexOf("\n  });", errorStart));
  assert.match(afterError, /setPreviewSelections\(current =>/);
  assert.match(afterError, /qc\.invalidateQueries/);
});

test("saved clothing remains selected for color updates without re-tapping or a popup", () => {
  assert.match(source, /avatar\.equipped\.find\(item => item\.category === category\)\?\.inventoryId/);
  assert.match(source, /data-testid="avatar-save-color-button"/);
  assert.match(source, /onClick=\{\(\) => saveEquipment\(selected\.inventoryId, selectedTint\)\}/);
  assert.match(source, /data-testid="avatar-unequip-button"/);
  assert.match(source, /Save Appearance before changing your outfit/);
});
