import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  LEGACY_PLAYER_CHARACTER_PART_TYPES,
  PLAYER_CHARACTER_PART_TYPES,
  completePlayerCharacterParts,
  parseStoredPlayerCharacterParts,
  resolvePlayerCharacterParts,
  upsertPlayerCharacterPart,
  type LegacyPlayerCharacterPart,
  type PlayerCharacterPart,
} from "../shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS,
  PLAYER_CLOTHING_ITEM_TYPE,
  PLAYER_CLOTHING_SEGMENT_TYPES,
  playerClothingDefinitionSchema,
} from "../shared/playerCharacterClothing";

const url = (n: number) => `/api/media/01234567-abcd-4123-8123-${String(n).padStart(12, "0")}`;
const modern = (type: typeof PLAYER_CHARACTER_PART_TYPES[number], n: number): PlayerCharacterPart =>
  ({ ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[type], partType: type, imageUrl: url(n) });
const legacy: LegacyPlayerCharacterPart[] = [
  { ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS.top, partType: "body", imageUrl: url(90) },
  { ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS.head, partType: "eyes", imageUrl: url(91) },
];

test("new rig is eight distinct parts and does not confuse clothing inventory categories", () => {
  assert.deepEqual(PLAYER_CHARACTER_PART_TYPES,
    ["left_leg", "right_leg", "left_foot", "right_foot", "top", "left_arm", "right_arm", "head"]);
  assert.deepEqual(LEGACY_PLAYER_CHARACTER_PART_TYPES, ["body", "eyes"]);
  assert.deepEqual(PLAYER_CLOTHING_CATEGORIES,
    ["accessories", "head", "hair", "face", "top", "bottom", "shoes", "back"]);
  assert.equal(PLAYER_CLOTHING_ITEM_TYPE, "clothing");
  assert.deepEqual(PLAYER_CLOTHING_SEGMENT_TYPES, PLAYER_CHARACTER_PART_TYPES);
  assert.equal(PLAYER_CLOTHING_CATEGORIES.includes("back"), true);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.bottom, ["left_leg", "right_leg"]);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.top, ["top", "left_arm", "right_arm"]);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.shoes, ["left_foot", "right_foot"]);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.back, ["top"]);
});

test("legacy seven-piece draft is preserved, torso auto-previews from Body, but feet still required", () => {
  const old = [
    modern("head", 1), modern("left_arm", 2), modern("right_arm", 3),
    modern("left_leg", 4), modern("right_leg", 5), ...legacy,
  ];
  const original = JSON.stringify(old);
  assert.equal(completePlayerCharacterParts(old), false);
  assert.deepEqual(resolvePlayerCharacterParts(old).map(p => p.partType).sort(),
    ["head", "left_arm", "left_leg", "right_arm", "right_leg", "top"].sort());
  assert.equal(resolvePlayerCharacterParts(old).find(p => p.partType === "top")?.imageUrl, url(90));
  const withFeet = upsertPlayerCharacterPart(old, modern("left_foot", 6));
  const ready = upsertPlayerCharacterPart(withFeet, modern("right_foot", 7));
  assert.equal(completePlayerCharacterParts(ready), true);
  assert.equal(ready.some(part => part.partType === "eyes" && part.imageUrl === url(91)), true);
  assert.equal(ready.some(part => part.partType === "body" && part.imageUrl === url(90)), true);
  assert.deepEqual(resolvePlayerCharacterParts(ready).map(p => p.partType).sort(),
    [...PLAYER_CHARACTER_PART_TYPES].sort());
  assert.equal(JSON.stringify(old), original, "legacy draft must never be mutated in place");
});

test("explicit Top overrides old Body without deleting archived artwork", () => {
  const old = [modern("head", 1), ...legacy];
  const edited = upsertPlayerCharacterPart(old, modern("top", 8));
  assert.equal(edited.filter(p => p.partType === "body").length, 1);
  assert.equal(edited.filter(p => p.partType === "eyes").length, 1);
  assert.equal(resolvePlayerCharacterParts(edited).find(p => p.partType === "top")?.imageUrl, url(8));
  assert.throws(() => parseStoredPlayerCharacterParts([...old, legacy[0]]));
});

test("one pants item carries independently fitted left and right legs with a single inventory category", () => {
  const toSegment = (partType: "left_leg" | "right_leg", n: number) => ({
    partType, imageUrl: url(n),
    fit: { ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType], xPct: 50, yPct: 50 },
    renderPlane: "with_part" as const,
  });
  const pants = {
    name: "Forest Wanderer Pants",
    category: "bottom" as const,
    segments: [toSegment("left_leg", 1), toSegment("right_leg", 2)],
  };
  const valid = playerClothingDefinitionSchema.safeParse(pants);
  assert.equal(valid.success, true);
  if (!valid.success) return;

  assert.equal(valid.data.name, "Forest Wanderer Pants");
  assert.equal(valid.data.category, "bottom");
  assert.deepEqual(valid.data.segments.map(segment => segment.partType),
    ["left_leg", "right_leg"]);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    ...pants, segments: [pants.segments[0], pants.segments[0]],
  }).success, false);
  assert.equal(playerClothingDefinitionSchema.safeParse({ ...pants, segments: [] }).success, false);
  assert.equal(playerClothingDefinitionSchema.safeParse({ ...pants, category: "costume" }).success, false);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    ...pants, segments: [{ ...pants.segments[0], imageUrl: "https://untrusted.invalid/image" }],
  }).success, false);
});

test("clothing fits stay relative to an animated base part and allow independent depth planes", () => {
  const fit = DEFAULT_PLAYER_CHARACTER_TRANSFORMS.top;
  const cape = playerClothingDefinitionSchema.safeParse({
    name: "Moonlit Cape", category: "back",
    segments: [{
      partType: "top", imageUrl: url(3),
      fit, renderPlane: "behind_character",
    }],
  });
  assert.equal(cape.success, true);
  const sleeve = playerClothingDefinitionSchema.safeParse({
    name: "Moss Shirt", category: "top",
    segments: [{
      partType: "left_arm", imageUrl: url(4),
      fit: DEFAULT_PLAYER_CHARACTER_TRANSFORMS.left_arm,
    }],
  });
  assert.equal(sleeve.success, true, "renderPlane defaults to with_part");
  assert.equal(sleeve.success && sleeve.data.segments[0].renderPlane, "with_part");
});

test("published snapshot is filtered to eight active parts, not legacy Eyes or Body", () => {
  const route = readFileSync("server/routes/playerCharacter.routes.ts", "utf8");
  const panel = readFileSync("client/src/components/PlayerCharacterAdminPanel.tsx", "utf8");
  const preview = readFileSync("client/src/components/PlayerCharacterPartsPreview.tsx", "utf8");
  assert.match(route, /publishedParts: resolvePlayerCharacterParts\(base\.draftParts\)/);
  // The simplified upload UI does not expose legacy Eyes or delete them.
  assert.match(route, /draftParts: orderedDraft/);
  assert.match(readFileSync("shared/playerCharacter.ts", "utf8"), /Preserve old Eyes and Body source artwork/);
  assert.doesNotMatch(panel, /Remove from Draft|Save Selected Part/);
  assert.match(panel, /resolvePlayerCharacterParts\(selected\.draftParts\)/);
  assert.match(preview, /eight transparent avatar base parts/);
  assert.doesNotMatch(route, /DELETE FROM player_character_bases/);
  assert.doesNotMatch(route, /await tx\.delete\(playerCharacterBases\)/);
});
