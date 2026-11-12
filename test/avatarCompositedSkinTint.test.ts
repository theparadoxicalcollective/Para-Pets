import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { playerCharacterColorMatrix } from "../client/src/lib/playerCharacterColorMatrix";
import { PLAYER_SKIN_TONE_SWATCHES } from "../shared/playerSkinTone";
const read = (p: string) => readFileSync(p, "utf8");

const rgbFor = (matrix: string, source: number[]) => {
  const values = matrix.split(" ").map(Number);
  return [0, 1, 2].map(row => values[row * 5] * source[0] +
    values[row * 5 + 1] * source[1] + values[row * 5 + 2] * source[2]);
};
const luma = ([r,g,b]: number[]) => .2126 * r + .7152 * g + .0722 * b;

test("composited tint is a valid SVG matrix with unmodified alpha and dark results", () => {
  const reference = [241 / 255, 196 / 255, 169 / 255];
  let last = Number.POSITIVE_INFINITY;
  for (const swatch of PLAYER_SKIN_TONE_SWATCHES) {
    const matrix = playerCharacterColorMatrix(swatch.value);
    const values = matrix.split(" ").map(Number);
    assert.equal(values.length, 20);
    assert.deepEqual(values.slice(15), [0,0,0,1,0],
      "source alpha and antialiased edges must never be re-masked");
    const rgb = rgbFor(matrix, reference);
    assert.ok(rgb.every(x => x >= 0 && x <= 1.4));
    if (["Porcelain","Rich"].includes(swatch.label)) {
      if (swatch.label === "Rich") assert.ok(luma(rgb) < last * .38,
        "Rich needs substantially darker rendered RGB, not Color blend luminosity");
      else last = luma(rgb);
    }
  }
  assert.ok(rgbFor(playerCharacterColorMatrix("#42291f"), reference)[0] <
    rgbFor(playerCharacterColorMatrix("#f3cfb1"), reference)[0] * .37);
  for (const bad of ["#fff","#00000000","red","var(--tone)","url(#x)"]) {
    assert.throws(() => playerCharacterColorMatrix(bad));
  }
});

test("skin recoloring applies to the flattened eight-part body, not per-part mask overlays", () => {
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  const css = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(renderer, /className=\{\x60player-character-renderer__body\$\{skinTone/);
  assert.match(renderer, /style=\{\{ filter: tintFilter\(skinTone\) \}\}/);
  assert.match(renderer, /\{sorted\.map\(part => \(/);
  assert.match(renderer, /<feColorMatrix type="matrix" values=\{playerCharacterColorMatrix\(color\)\}/);
  assert.match(renderer, /colorInterpolationFilters="sRGB"/);
  assert.match(css, /\.player-character-renderer__body \{[\s\S]*?position: absolute;/);
  assert.match(css, /\.player-character-renderer__body \{[\s\S]*?z-index: 0;/);
  assert.match(css, /\.player-character-renderer \{[\s\S]*?isolation: isolate;/);
  assert.doesNotMatch(renderer, /maskImage:|WebkitMaskImage:|backgroundColor: skinTone/);
  assert.doesNotMatch(css, /mix-blend-mode: color|mix-blend-mode: multiply|mask-size:/);
  assert.match(renderer, /position: "relative", zIndex: 1/);
});

test("hair uses one artwork-filter per segment without extra translucent duplicates", () => {
  const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
  const css = read("client/src/components/PlayerCharacterRenderer.css");
  assert.match(renderer, /colorTint: outfit\.colorTint \?\? null/);
  assert.equal((renderer.match(/filter: grouped \? undefined : tintFilter\(layer\.colorTint\)/g) ?? []).length, 2);
  assert.match(renderer, /data-testid="avatar-clothing-composite"/);
  assert.match(renderer, /const isBackArtwork/);
  assert.match(renderer, /isBackArtwork\(layer\) \? bodyMinDepth - 140 : bodyMaxDepth \+ 140/);
  assert.match(renderer, /transformOrigin: attachment \? /);
  assert.match(css, /\.player-character-renderer__canvas-image \{/);
  assert.doesNotMatch(renderer, /player-character-renderer__legacy-tint|player-character-renderer__canvas-tint/);
  assert.doesNotMatch(renderer, /maskImage|WebkitMaskImage/);
});

test("Home, editor and clothing admin still share one character renderer", () => {
  const home = read("client/src/components/HomeAvatarStage.tsx");
  const editor = read("client/src/pages/PlayerAvatarPage.tsx");
  const admin = read("client/src/components/PlayerCharacterPartsPreview.tsx");
  for(const source of [home, editor, admin]) assert.match(source, /<PlayerCharacterRenderer/);
  assert.match(home,/skinTone=\{avatar\.data\?\.skinTone \?\? null\}/);
  assert.match(editor,/skinTone=\{skinTone\}/);
  assert.match(admin,/motion=\{editable \? "static" : motion\}/);
});
