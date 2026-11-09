import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  type PlayerCharacterPart,
} from "../shared/playerCharacter";
import {
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS,
  playerClothingDefinitionSchema,
  type PlayerClothingSegment,
} from "../shared/playerCharacterClothing";
import {
  AVATAR_CLOTHING_UNRELEASED_WORLD,
  clothingSegmentWriteSchema,
  validClothingPublication,
  upsertClothingSegment,
} from "../shared/playerClothingAdmin";
import {
  pointerToCharacterPartLocal,
  clampClothingFitCoordinate,
} from "../client/src/lib/characterClothingFit";

const read = (path: string) => readFileSync(path, "utf8");
const part = (name: "top" | "left_leg" | "right_leg", n: number): PlayerCharacterPart => ({
  ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[name],
  partType: name,
  imageUrl: `/api/media/00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
});
const segment = (partType: "left_leg" | "right_leg", n: number): PlayerClothingSegment => ({
  partType,
  imageUrl: `/api/media/00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  fit: { xPct: 50, yPct: 50, widthPct: 100, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 1 },
  renderPlane: "with_part",
});

test("one named Bottom item can contain both leg images and they are not separate inventory records", () => {
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.bottom, ["left_leg", "right_leg"]);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.top, ["top", "left_arm", "right_arm"]);
  assert.deepEqual(PLAYER_CLOTHING_DEFAULT_ATTACHMENTS.shoes, ["left_foot", "right_foot"]);
  const left = segment("left_leg", 1);
  const right = segment("right_leg", 2);
  const parsed = playerClothingDefinitionSchema.parse({
    name: "Forest Wanderer Pants", category: "bottom", segments: [left, right],
  });
  assert.equal(parsed.segments.length, 2);
  assert.equal(validClothingPublication(parsed.name, parsed.category, parsed.segments), true);
  assert.deepEqual(parsed.segments.map(x => x.partType), ["left_leg", "right_leg"]);
  assert.equal(validClothingPublication(parsed.name, parsed.category, []), false);
  assert.equal(AVATAR_CLOTHING_UNRELEASED_WORLD, "__avatar_clothing_unreleased__");
});

test("piece edit is immutable and keeps the other pant leg and its original artwork", () => {
  const old = [segment("left_leg", 1), segment("right_leg", 2)];
  const next = { ...old[0], fit: { ...old[0].fit, xPct: 70, rotationDeg: -12 } };
  const edited = upsertClothingSegment(old, next);
  assert.equal(edited.length, 2);
  assert.deepEqual(edited.find(x => x.partType === "left_leg"), next);
  assert.deepEqual(edited.find(x => x.partType === "right_leg"), old[1]);
  assert.equal(old[0].fit.xPct, 50);
  assert.equal(playerClothingDefinitionSchema.safeParse({
    name: "Pants", category: "bottom", segments: [old[0], old[0]],
  }).success, false);
});

test("part-local pointer geometry remains consistent for scaled phone canvas and unrotated torso", () => {
  const torso = part("top", 1);
  const canvas = {
    left: 10, top: 20, renderedWidth: 200, renderedHeight: 200,
    logicalWidth: 400, logicalHeight: 400,
  };
  const location = pointerToCharacterPartLocal(
    110, 20 + torso.yPct * 2, canvas, torso, 1,
  );
  assert.ok(location);
  assert.ok(Math.abs(location.xPct - torso.pivotXPct) < 0.001);
  assert.ok(Math.abs(location.yPct - torso.pivotYPct) < 0.001);
  assert.equal(clampClothingFitCoordinate(-3), 0);
  assert.equal(clampClothingFitCoordinate(103), 100);
  assert.equal(clampClothingFitCoordinate(42.123), 42.1);
});

test("rotated limb placement inverts parent rotation instead of saving viewport-relative coordinates", () => {
  const leg = { ...part("left_leg", 1), rotationDeg: 90, xPct: 50, yPct: 50,
    pivotXPct: 50, pivotYPct: 50, widthPct: 50 };
  const canvas = { left: 0, top: 0, renderedWidth: 400, renderedHeight: 400,
    logicalWidth: 400, logicalHeight: 400 };
  const pivot = pointerToCharacterPartLocal(200, 200, canvas, leg, 1);
  assert.ok(pivot && Math.abs(pivot.xPct - 50) < 0.01 && Math.abs(pivot.yPct - 50) < 0.01);
  const east = pointerToCharacterPartLocal(240, 200, canvas, leg, 1);
  assert.ok(east);
  assert.ok(Math.abs(east.xPct - 50) < 0.01);
  assert.ok(Math.abs(east.yPct - 30) < 0.01);
  assert.equal(pointerToCharacterPartLocal(0, 0, { ...canvas, renderedWidth: 0 }, leg, 1), null);
});

test("bounded per-piece upload and artist controls reject arbitrary images, duplicate event data and bad fits", () => {
  const payload = {
    expectedRevision: 0,
    fit: segment("left_leg", 1).fit,
    renderPlane: "behind_character" as const,
    imageData: "data:image/png;base64,aGVsbG8=",
  };
  assert.equal(clothingSegmentWriteSchema.safeParse(payload).success, true);
  assert.equal(clothingSegmentWriteSchema.safeParse({ ...payload, imageData: "data:image/svg+xml;base64,AAAA" }).success, false);
  assert.equal(clothingSegmentWriteSchema.safeParse({ ...payload, fit: { ...payload.fit, xPct: -5 } }).success, false);
  assert.equal(clothingSegmentWriteSchema.safeParse({ ...payload, expectedRevision: -1 }).success, false);
  assert.equal(clothingSegmentWriteSchema.safeParse({ ...payload, imageUrl: "https://untrusted.com" }).success, false);
});

test("server creates private draft storage and catalog SKU only at explicit Save Clothing", () => {
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensurePlayerClothingStorage.ts");
  const startup = read("server/startup/migrations/runEssentialBoot.ts");
  const route = read("server/routes/playerClothingAdmin.routes.ts");
  const app = read("server/routes.ts");
  assert.match(schema, /playerClothingDrafts = pgTable\("player_clothing_drafts"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_clothing_drafts/);
  assert.match(migration, /REFERENCES shop_items\(id\)/);
  assert.match(startup, /await ensurePlayerClothingStorage\(\)/);
  assert.match(route, /registerPlayerClothingAdminRoutes/);
  assert.match(route, /"\/api\/admin\/player-character\/clothing", isAdmin/);
  assert.match(route, /"\/api\/admin\/player-character\/clothing\/:id\/segments\/:partType", isAdmin/);
  assert.match(route, /"\/api\/admin\/player-character\/clothing\/:id\/save", isAdmin/);
  assert.match(route, /db\.transaction\(async tx/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /validClothingPublication\(/);
  assert.match(route, /publishedSegments: draft\.draftSegments\.map/);
  assert.match(route, /tx\.insert\(shopItems\)/);
  assert.match(route, /processImage\(body\.data\.imageData, 1000\)/);
  assert.match(app, /registerPlayerClothingAdminRoutes\(app, \{ db, isAdmin, processImage: processWorldImage \}\)/);
  assert.match(app, /if \(shopItem\.type === "clothing"\)/);
  assert.match(app, /if \(parse\.data\.type === "clothing"\)/);
});

test("admin drag preview reuses the shared eight-part renderer and preserves existing avatar editor", () => {
  const component = read("client/src/components/PlayerClothingAdminPanel.tsx");
  const base = read("client/src/components/PlayerCharacterAdminPanel.tsx");
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  const styles = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(base, /avatar-open-create-clothing/);
  assert.match(base, /lazyWithRetry\(\(\) => import\("\.\/PlayerClothingAdminPanel"\)\)/);
  assert.match(component, /<PlayerCharacterRenderer parts=\{bodyParts\} clothingSegments=\{previewSegments\}/);
  assert.match(component, /setPointerCapture\(event\.pointerId\)/);
  assert.match(component, /pointerToCharacterPartLocal/);
  assert.match(component, /touchAction: "none"/);
  assert.match(component, /avatar-publish-clothing/);
  assert.match(renderer, /clothingSegments\.map\(segment =>/);
  assert.match(renderer, /layers\.filter\(layer => layer\.segment\.partType === part\.partType\)/);
  assert.match(renderer, /data-clothing-part=\{layer\.segment\.partType\}/);
  assert.match(styles, /player-character-renderer__clothing/);
  assert.doesNotMatch(component, /PetAnimator|activePetId|390\s*[×x]\s*844/);
  assert.doesNotMatch(read("client/src/pages/HomePage.tsx"), /PlayerClothingAdminPanel/);
});
