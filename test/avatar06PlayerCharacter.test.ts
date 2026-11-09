import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PLAYER_CHARACTER_PART_TYPES,
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  playerCharacterNameSchema,
  playerCharacterPartWriteSchema,
  playerCharacterPartSchema,
  completePlayerCharacterParts,
  upsertPlayerCharacterPart,
  type PlayerCharacterPart,
} from "../shared/playerCharacter";

const read = (path: string) => readFileSync(path, "utf8");
const media = (n: number) => `/api/media/2c6575fa-474f-4531-aee7-00000000000${n}`;
const part = (type: typeof PLAYER_CHARACTER_PART_TYPES[number], n: number): PlayerCharacterPart => ({
  partType: type, imageUrl: media(n), ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[type],
});
const full = () => PLAYER_CHARACTER_PART_TYPES.map((type, n) => part(type, n));

test("the Avatar 07A anatomy has exactly eight front-facing, reusable base parts", () => {
  assert.deepEqual(PLAYER_CHARACTER_PART_TYPES, [
    "left_leg", "right_leg", "left_foot", "right_foot", "top", "left_arm", "right_arm", "head",
  ]);
  assert.equal(completePlayerCharacterParts([]), false);
  assert.equal(completePlayerCharacterParts(full().slice(0, 6)), false);
  assert.equal(completePlayerCharacterParts(full()), true);
  assert.equal(completePlayerCharacterParts([...full(), full()[0]]), false);
  const duplicate = full().map((p, i) => i === 1 ? { ...p, partType: "left_leg" as const } : p);
  assert.equal(completePlayerCharacterParts(duplicate), false);
});

test("part metadata is coordinate-relative, bounded, finite, validated, and anchored", () => {
  for (const p of full()) assert.equal(playerCharacterPartSchema.safeParse(p).success, true);
  for (const changes of [
    { xPct: -0.1 }, { yPct: 101 }, { widthPct: 1 }, { widthPct: 151 },
    { pivotXPct: -1 }, { pivotYPct: 100.1 },
    { rotationDeg: -181 }, { zIndex: 101 }, { xPct: Number.NaN },
    { imageUrl: "data:image/png;base64,AAAA" },
    { imageUrl: "https://outside.example/track.png" },
  ]) {
    assert.equal(playerCharacterPartSchema.safeParse({ ...part("head", 0), ...changes }).success, false,
      JSON.stringify(changes));
  }
  assert.equal(playerCharacterNameSchema.safeParse({ name: " Forest Walker " }).success, true);
  assert.equal(playerCharacterNameSchema.safeParse({ name: "" }).success, false);
});

test("upserting one part is immutable, ordered, and preserves all other saved layers", () => {
  const initial = full();
  const next = { ...part("head", 7), xPct: 61, zIndex: 88 };
  const edited = upsertPlayerCharacterPart(initial, next);
  assert.equal(edited.length, 8);
  assert.deepEqual(edited.find(p => p.partType === "head"), next);
  assert.equal(initial.find(p => p.partType === "head")?.xPct, part("head", 7).xPct);
  assert.equal(edited.at(-1)?.partType, "head");
  assert.deepEqual(edited.filter(p => p.partType !== "head"), initial.filter(p => p.partType !== "head"));
});

test("uploaded parts require valid transform and bounded PNG/WebP data, not arbitrary URL strings", () => {
  const transform = DEFAULT_PLAYER_CHARACTER_TRANSFORMS.head;
  const data = "data:image/png;base64,aGVsbG8=";
  assert.equal(playerCharacterPartWriteSchema.safeParse({ expectedRevision: 0, transform, imageData: data }).success, true);
  assert.equal(playerCharacterPartWriteSchema.safeParse({ expectedRevision: 0, transform }).success, true);
  for (const imageData of ["https://example.com/art.png", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,AAAA", "data:image/png;base64,<script>"]) {
    assert.equal(playerCharacterPartWriteSchema.safeParse({ expectedRevision: 0, transform, imageData }).success, false);
  }
  assert.equal(playerCharacterPartWriteSchema.safeParse({ expectedRevision: -1, transform }).success, false);
  assert.equal(playerCharacterPartWriteSchema.safeParse({ expectedRevision: 0, transform, excess: "no" }).success, false);
});

test("backend separates private drafts and published snapshots with explicit authorization and one default", () => {
  const route = read("server/routes/playerCharacter.routes.ts");
  const migration = read("server/startup/migrations/ensurePlayerCharacterStorage.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");
  const app = read("server/routes.ts");

  for (const method of ["get", "post", "patch", "put", "delete"]) {
    assert.match(route, new RegExp(`app\\.${method}\\("/api/admin/player-character/bases`));
  }
  assert.match(route, /"\/api\/admin\/player-character\/bases[^"]*", isAdmin/);
  assert.match(route, /"\/api\/player-character\/default", isAuthenticated/);
  assert.match(route, /\.for\("update"\)/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /completePlayerCharacterParts\(base\.draftParts\)/);
  assert.match(route, /publishedParts: resolvePlayerCharacterParts\(base\.draftParts\)\.map/);
  assert.match(route, /eq\(playerCharacterBases\.revision/);
  assert.match(route, /processImage\(payload\.data\.imageData, 1000\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_character_bases/);
  assert.match(migration, /WHERE is_default = true/);
  assert.match(migration, /published_parts jsonb/);
  assert.match(boot, /await ensurePlayerCharacterStorage\(\)/);
  assert.match(app, /registerPlayerCharacterRoutes\(app, \{ db, isAdmin, isAuthenticated, processImage: processWorldImage \}\)/);
  assert.doesNotMatch(read("server/routes/avatar.routes.ts"), /player.character\/bases/);
});

test("admin editor is isolated, lazy loaded and uses the same relative preview as later gameplay", () => {
  const admin = read("client/src/pages/AdminPage.tsx");
  const loader = read("client/src/components/admin/LazyAdminEditors.tsx");
  const panel = read("client/src/components/PlayerCharacterAdminPanel.tsx");
  const preview = read("client/src/components/PlayerCharacterPartsPreview.tsx");
  assert.match(admin, /\{ key: "avatar", label: "Avatar" \}/);
  assert.match(admin, /<PlayerCharacterAdminPanel \/>/);
  assert.match(loader, /lazyWithRetry\(\(\) => import\("@\/components\/PlayerCharacterAdminPanel"\)\)/);
  assert.match(panel, /completePlayerCharacterParts\(selected\.draftParts\)/);
  assert.match(panel, /expectedRevision: selected!\.revision/);
  assert.match(panel, /<PlayerCharacterPartsPreview/);
  assert.match(panel, /image\/png,image\/webp/);
  assert.match(preview, /data-coordinate-space="character-relative"/);
  assert.match(preview, /setPointerCapture/);
  assert.match(preview, /touchAction: editable \? "none" : "auto"/);
  assert.doesNotMatch(preview, /390|844|activePetId|PetAnimator/);
  assert.doesNotMatch(panel, /\/api\/pet\/|activePetId|PetAnimatorCore/);
});

test("default character read has no player-facing write path and can return empty until publish", () => {
  const route = read("server/routes/playerCharacter.routes.ts");
  assert.match(route, /return res\.json\(\{ base: base \?\? null \}\)/);
  assert.match(route, /"Cache-Control", "private, no-store"/);
  assert.doesNotMatch(read("client/src/pages/HomePage.tsx"), /player-character\/default/);
});
