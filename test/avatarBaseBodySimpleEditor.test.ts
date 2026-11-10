import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  PLAYER_CHARACTER_PART_TYPES,
  SIMPLE_AVATAR_BODY_ORDER,
  SIMPLE_AVATAR_BODY_Z_INDEX,
  playerCharacterBodyWriteSchema,
  resolvePlayerCharacterParts,
  type PlayerCharacterPart,
} from "../shared/playerCharacter";

const read = (path: string) => readFileSync(path, "utf8");
const png = "data:image/png;base64,aGVsbG8=";
const webp = "data:image/webp;base64,aGVsbG8=";
const body = (types: readonly string[]) => ({
  expectedRevision: 3,
  parts: types.map(partType => ({ partType, imageData: png })),
});

test("one Save Body request validates all eight unique bounded PNG/WebP uploads", () => {
  const full = body(PLAYER_CHARACTER_PART_TYPES);
  assert.equal(playerCharacterBodyWriteSchema.safeParse(full).success, true);
  assert.equal(playerCharacterBodyWriteSchema.safeParse({
    ...body(["head"]), parts: [{ partType: "head", imageData: webp }],
  }).success, true);
  assert.equal(playerCharacterBodyWriteSchema.safeParse(body(["head", "head"])).success, false);
  assert.equal(playerCharacterBodyWriteSchema.safeParse(body([])).success, false);
  assert.equal(playerCharacterBodyWriteSchema.safeParse({
    ...full, parts: [...full.parts, full.parts[0]],
  }).success, false);
  assert.equal(playerCharacterBodyWriteSchema.safeParse({ ...full, expectedRevision: -1 }).success, false);
  assert.equal(playerCharacterBodyWriteSchema.safeParse({
    ...full, parts: [{ partType: "eyes", imageData: png }],
  }).success, false);
  for (const imageData of ["https://untrusted.invalid/pet.png", "data:image/jpeg;base64,AAAA", "data:image/svg+xml;base64,AAAA"]) {
    assert.equal(playerCharacterBodyWriteSchema.safeParse({
      ...full, parts: [{ partType: "head", imageData }],
    }).success, false);
  }
  assert.equal(playerCharacterBodyWriteSchema.safeParse({ ...full, unknown: true }).success, false);
  assert.match(read("shared/playerCharacter.ts"), /40_000_000/);
  assert.match(read("client/src/components/PlayerCharacterAdminPanel.tsx"), /pendingBytes > 40_000_000/);
});

test("new Masc/Fem uploads layer in the requested front-to-back order, Head foremost", () => {
  assert.deepEqual(SIMPLE_AVATAR_BODY_ORDER, [
    "head", "top", "left_arm", "right_arm",
    "left_leg", "right_leg", "left_foot", "right_foot",
  ]);
  for (let i=0; i<SIMPLE_AVATAR_BODY_ORDER.length-1; i++) {
    assert.ok(SIMPLE_AVATAR_BODY_Z_INDEX[SIMPLE_AVATAR_BODY_ORDER[i]] >
      SIMPLE_AVATAR_BODY_Z_INDEX[SIMPLE_AVATAR_BODY_ORDER[i+1]]);
  }
  const old: PlayerCharacterPart[] = PLAYER_CHARACTER_PART_TYPES.map((partType, index) => ({
    partType,
    imageUrl: "/api/media/00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
    ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType],
    zIndex: SIMPLE_AVATAR_BODY_Z_INDEX[partType],
  }));
  const imageSnapshot = JSON.stringify(old);
  assert.equal(resolvePlayerCharacterParts(old).at(-1)?.partType, "head");
  assert.equal(JSON.stringify(old), imageSnapshot);
});

test("one authenticated admin batch saves a revision-checked private body draft without publishing", () => {
  const route = read("server/routes/playerCharacter.routes.ts");
  const start = route.indexOf('app.put("/api/admin/player-character/bases/:id/body", isAdmin');
  const end = route.indexOf('app.delete("/api/admin/player-character/bases/:id/parts/:partType"', start);
  assert.ok(start >= 0 && end > start);
  const bodyWrite = route.slice(start, end);
  assert.match(bodyWrite, /playerCharacterBodyWriteSchema.safeParse/);
  assert.match(bodyWrite, /current.revision !== payload.data.expectedRevision/);
  assert.match(bodyWrite, /for \(const part of payload.data.parts\)/);
  assert.match(bodyWrite, /await processImage\(part.imageData, 1000\)/);
  assert.match(bodyWrite, /upsertPlayerCharacterPart\(draftParts/);
  assert.match(bodyWrite, /zIndex: SIMPLE_AVATAR_BODY_Z_INDEX/);
  assert.match(bodyWrite, /draftParts: orderedDraft/);
  assert.match(bodyWrite, /eq\(playerCharacterBases.revision, current.revision\)/);
  assert.equal((bodyWrite.match(/db.update\(playerCharacterBases\)/g) ?? []).length, 1);
  assert.doesNotMatch(bodyWrite, /publishedParts:|isDefault: true/);
});

test("simple Masc and Fem editor exposes eight upload tiles, one save and a layered preview", () => {
  const panel = read("client/src/components/PlayerCharacterAdminPanel.tsx");
  const preview = read("client/src/components/PlayerCharacterPartsPreview.tsx");
  assert.match(panel, /type BodyKind = "Masc" \| "Fem"/);
  assert.match(panel, /base.name.trim\(\).toLowerCase\(\) === bodyKind.toLowerCase\(\)/);
  assert.match(panel, /SIMPLE_AVATAR_BODY_ORDER.map/);
  // Slots are generated from the shared, separately validated eight-part order.
  assert.equal(SIMPLE_AVATAR_BODY_ORDER.length, 8);
  assert.match(panel, /SIMPLE_AVATAR_BODY_ORDER.map/);
  assert.match(panel, /data-testid="avatar-body-preview-box"/);
  assert.match(panel, /<PlayerCharacterPartsPreview parts=\{previewParts\} \/>/);
  assert.match(panel, /data-testid="avatar-save-body"/);
  assert.match(panel, /"PUT", "\/api\/admin\/player-character\/bases\/"/);
  assert.match(panel, /parts,\s*\}/);
  assert.match(panel, /setPendingImages\(\{\}\)/);
  assert.match(panel, /disabled=\{busy \|\| !dirty\}/);
  assert.match(panel, /data-testid="avatar-publish-default"/);
  assert.match(panel, /avatar-open-create-clothing/);
  assert.doesNotMatch(panel, /Save Selected Part|Horizontal position|Vertical position|Width \(% of avatar\)|Rotation \(°\)|Layer order|onMovePart|transformFields/);
  assert.match(preview, /<PlayerCharacterRenderer/);
  assert.doesNotMatch(panel, /390\s*[x×]\s*844|390px|844px|PetAnimator|activePetId/);
});
