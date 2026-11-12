import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { savePlayerAvatarCharacterSchema } from "../shared/playerAvatarEquipment";

const read = (path: string) => readFileSync(path, "utf8");
const source = read("client/src/pages/PlayerAvatarPage.tsx");
const server = read("server/routes/playerAvatar.routes.ts");
const id = "00000000-0000-4000-8000-000000000001";
const empty = { head: null, hair: null, face: null, top: null, bottom: null,
  shoes: null, back: null, accessories: null };

test("all body, tone, tuck, and clothing edits stay in preview until one Save Character action", () => {
  assert.match(source, /const chooseClothing =/);
  assert.match(source, /onClick=\{\(\) => chooseClothing\(item\)\}/);
  assert.match(source, /setPreviewSelections\(current => \(\{ \.\.\.current, \[category\]: item\.inventoryId \}\)\)/);
  assert.match(source, /const toggleTuck =/);
  assert.match(source, /setTuckChoice\(\{ accountId: userId, value: checked \}\)/);
  assert.match(source, /setBodyChoiceId\(option\.id\)/);
  assert.match(source, /setSkinChoice\(swatch\.value\)/);
  assert.doesNotMatch(source, /Save Appearance before changing your outfit/);
  assert.doesNotMatch(source, /data-testid="avatar-save-body-choice"/);
  assert.doesNotMatch(source, /data-testid="avatar-save-color-button"/);
  assert.doesNotMatch(source, /saveEquipment\(item\.inventoryId\)/);
  assert.match(source, /className="player-avatar-page__save-footer"/);
  assert.match(source, /"avatar-save-character-button"/);
  assert.match(source, /"Save Character"/);
});

test("Save Character serializes all eight explicit equipment slots with one revision", () => {
  assert.equal(savePlayerAvatarCharacterSchema.safeParse({
    expectedRevision: 2, baseId: id, skinTone: "#debda0",
    topTucked: true, outfit: { ...empty, hair: { inventoryId: id, colorTint: "#8161aa" } },
  }).success, true);
  assert.equal(savePlayerAvatarCharacterSchema.safeParse({
    expectedRevision: 2, baseId: id, topTucked: false,
    outfit: { top: { inventoryId: id } },
  }).success, false, "every slot must be included, with null for empty");
  assert.match(source, /"PUT", "\/api\/player-avatar\/character"/);
  assert.match(source, /expectedRevision: avatar\.revision, outfit: draftOutfit/);
  assert.match(server, /app\.put\("\/api\/player-avatar\/character", isAuthenticated/);
  assert.match(server, /profile\.revision !== input\.data\.expectedRevision/);
  assert.match(server, /for \(const \[category, selection\] of Object\.entries\(input\.data\.outfit\)/);
  assert.match(server, /await tx\.delete\(playerAvatarEquipment\)/);
  assert.match(server, /revision: profile\.revision \+ 1/);
  assert.match(server, /readPlayerAvatar\(db, user\.id\)/);
});

test("switching bodies does not lose the full outfit preview or leak account draft data", () => {
  assert.match(source, /const \[previewState, setPreviewState\]/);
  assert.match(source, /previewState\.accountId === userId/);
  assert.match(source, /canWearOnBody\(item\)/);
  assert.match(source, /item\.designBaseId === selectedBody\.id/);
  assert.match(source, /const draftOutfit = PLAYER_CLOTHING_CATEGORIES\.reduce/);
  assert.match(source, /previewSelections\[layer\.category\] !== null/);
  assert.match(source, /setPreviewSelections\(current => \(\{\s*\.\.\.current, \[category\]: null/);
  assert.match(source, /qc\.setQueryData\(playerAvatarQueryKey\(accountId\), saved\)/);
  assert.match(source, /qc\.invalidateQueries\(\{ queryKey: playerAvatarQueryKey\(input\.accountId\) \}\)/);
});

test("skin color is a softer hue overlay rather than a full darkening multiply layer", () => {
  const css = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(css, /player-character-renderer__skin-tint/);
  assert.match(css, /mix-blend-mode: color/);
  assert.match(css, /opacity: \.78/);
  assert.match(source, /data-testid="avatar-custom-skin"/);
});
