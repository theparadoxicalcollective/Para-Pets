import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { playerCharacterCssTint } from "../client/src/lib/playerCharacterCssTint";
import { PLAYER_SKIN_TONE_SWATCHES } from "../shared/playerSkinTone";
const read = (p: string) => readFileSync(p, "utf8");

test("all skin swatches use distinct native filters, including truly dark tones", () => {
  const filters = PLAYER_SKIN_TONE_SWATCHES.map(swatch => playerCharacterCssTint(swatch.value));
  assert.equal(new Set(filters).size, PLAYER_SKIN_TONE_SWATCHES.length);
  for (const filter of filters) {
    assert.match(filter, /^grayscale\(1\) brightness\(0\.4\) sepia\(1\) hue-rotate\(\d+deg\) saturate\([\d.]+\) brightness\([\d.]+\)$/);
    assert.doesNotMatch(filter, /url\(|feColorMatrix|mix-blend-mode|mask/);
    assert.ok(!filter.includes("NaN") && !filter.includes("Infinity"));
  }
  assert.equal(playerCharacterCssTint("#42291F"), playerCharacterCssTint("#42291f"));
  assert.match(playerCharacterCssTint("#000000"), /^brightness\(0\)$/);
  for (const invalid of ["#fff", "#12345678", "red", "url(#id)", "var(--color)"])
    assert.throws(() => playerCharacterCssTint(invalid));
});

test("custom fabric and hair hues are not restricted to skin colors", () => {
  for (const sample of ["#3c5677", "#2d8c45", "#f055aa", "#00ffff", "#ff0000"]) {
    const value = playerCharacterCssTint(sample);
    assert.match(value, /hue-rotate\(\d+deg\)/);
    assert.match(value, /saturate\([\d.]+\)/);
  }
});

test("body recoloring applies once after eight original alpha-composited parts", () => {
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  const css = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(renderer, /className=\{\x60player-character-renderer__body\$\{skinTone/);
  assert.match(renderer, /style=\{\{ filter: tintFilter\(skinTone\) \}\}/);
  assert.match(renderer, /playerCharacterCssTint\(color\)/);
  assert.match(renderer, /\{sorted\.map\(part => \(/);
  assert.match(css, /\.player-character-renderer__body \{[\s\S]*?position: absolute;/);
  assert.match(css, /\.player-character-renderer__body \{[\s\S]*?z-index: 0;/);
  assert.match(css, /\.player-character-renderer \{[\s\S]*?isolation: isolate;/);
  assert.doesNotMatch(renderer, /<feColorMatrix|<svg|url\("#|maskImage:|WebkitMaskImage:/);
  assert.doesNotMatch(css, /mix-blend-mode: color|mix-blend-mode: multiply|mask-size:/);
  assert.match(renderer, /position: "relative", zIndex: 1/);
});

test("hair and opt-in garment color share the new filters without extra opacity layers", () => {
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  const css = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(renderer, /colorTint: outfit\.colorTint \?\? null/);
  assert.equal((renderer.match(/filter: grouped \? undefined : tintFilter\(layer\.colorTint\)/g) ?? []).length, 2);
  assert.match(renderer, /data-testid="avatar-clothing-composite"/);
  assert.match(renderer, /filter: tintFilter\(garment\.color\)/);
  assert.match(renderer, /const isBackArtwork/);
  assert.match(renderer, /isBackArtwork\(layer\) \? bodyMinDepth - 140 : bodyMaxDepth \+ 140/);
  assert.match(renderer, /transformOrigin: attachment \? /);
  assert.match(css, /\.player-character-renderer__canvas-image \{/);
  assert.doesNotMatch(renderer, /player-character-renderer__legacy-tint|player-character-renderer__canvas-tint/);
  assert.doesNotMatch(renderer, /maskImage|WebkitMaskImage/);
});

test("Home, player editor and admin share one character renderer", () => {
  const home = read("client/src/components/HomeAvatarStage.tsx");
  const editor = read("client/src/pages/PlayerAvatarPage.tsx");
  const admin = read("client/src/components/PlayerCharacterPartsPreview.tsx");
  for (const source of [home, editor, admin]) assert.match(source, /<PlayerCharacterRenderer/);
  assert.match(home, /skinTone=\{avatar\.data\?\.skinTone \?\? null\}/);
  assert.match(editor, /skinTone=\{skinTone\}/);
  assert.match(admin, /motion=\{editable \? "static" : motion\}/);
});
