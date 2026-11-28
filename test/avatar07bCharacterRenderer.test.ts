import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_PLAYER_CHARACTER_TRANSFORMS,
  PLAYER_CHARACTER_PART_TYPES,
  resolvePlayerCharacterParts,
  type PlayerCharacterPart,
} from "../shared/playerCharacter";

const read = (file: string) => readFileSync(file, "utf8");
const renderer = read("client/src/components/PlayerCharacterRenderer.tsx");
const css = read("client/src/components/PlayerCharacterRenderer.css");
const preview = read("client/src/components/PlayerCharacterPartsPreview.tsx");
const panel = read("client/src/components/PlayerCharacterAdminPanel.tsx");

test("one shared renderer composes the eight base parts and preserves saved artwork pivots", () => {
  for (const part of PLAYER_CHARACTER_PART_TYPES) {
    assert.ok(DEFAULT_PLAYER_CHARACTER_TRANSFORMS[part], `missing transform: ${part}`);
    assert.match(css, new RegExp(`data-character-motion-part="${part}"`));
  }
  assert.match(renderer, /data-testid="player-character-renderer"/);
  assert.match(renderer, /data-coordinate-space="character-relative"/);
  assert.match(renderer, /data-character-motion=\{motion\}/);
  assert.match(renderer, /\[\.\.\.parts\]\.sort\(\(a, b\) => a\.zIndex - b\.zIndex\)/);
  assert.match(renderer, /left: \`\$\{part\.xPct\}%\`/);
  assert.match(renderer, /top: \`\$\{part\.yPct\}%\`/);
  assert.match(renderer, /width: \`\$\{part\.widthPct\}%\`/);
  assert.match(renderer, /transformOrigin: \`\$\{part\.pivotXPct\}% \$\{part\.pivotYPct\}%\`/);
  assert.match(renderer, /rotate\(\$\{part\.rotationDeg\}deg\)/);
  assert.match(renderer, /<img\s+src=\{part\.imageUrl\}/);
  assert.match(renderer, /data-character-motion-part=\{part\.partType\}/);
});

test("the admin preview uses the same renderer, and editing stays still and touch-controlled", () => {
  assert.match(preview, /import PlayerCharacterRenderer/);
  assert.match(preview, /<PlayerCharacterRenderer/);
  assert.doesNotMatch(preview, /sorted\.map\(part =>/);
  assert.match(preview, /motion=\{editable \? "static" : motion\}/);
  assert.match(preview, /data-testid="player-character-preview"/);
  assert.match(preview, /setPointerCapture/);
  assert.match(preview, /hasPointerCapture/);
  assert.match(preview, /touchAction: editable \? "none" : "auto"/);
  // The shared preview still supports motion, but the base-upload editor
  // intentionally does not expose movement, pivot, or animation controls.
  assert.match(panel, /<PlayerCharacterPartsPreview parts=\{previewParts\} \/>/);
  assert.match(panel, /data-testid="avatar-body-preview-box"/);
  assert.doesNotMatch(panel, /previewMotion|onMovePart|Save Selected Part|transformFields/);
});

test("walking moves each leg, its foot and both clothing formats together without swinging artwork pivots", () => {
  for (const [side, opposite] of [["left", "right"], ["right", "left"]]) {
    const rule = css.split(`animation-name: pc-walk-${side};`)[0].split('[data-character-motion="walk"] :is(').at(-1)!;
    for (const part of [`${side}_leg`, `${side}_foot`, `${opposite}_arm`]) {
      assert.ok(rule.includes(`[data-character-part="${part}"]`));
      assert.ok(rule.includes(`[data-clothing-part="${part}"]`));
    }
    const keyframes = css.split(`@keyframes pc-walk-${side} {`)[1].split("\n}")[0];
    assert.match(keyframes, /translate: 0 calc/);
    assert.doesNotMatch(keyframes, /rotate|transform:/);
    assert.match(keyframes, /0%, 50%, 100% \{ translate: 0 0; \}/);
  }
  assert.match(css, /container-type: size/);
  assert.match(css, /--walk-lift: 1\.5cqh/);
  assert.match(css, /--walk-cycle: 0\.84s/);
  assert.match(css, /animation: pc-walk-bounce var\(--walk-cycle\)/);
  assert.match(css, /\[data-character-motion="idle"\]/);
});

test("animation does not modify stored positions or re-fetch, paint canvas, run timers or touch the pet systems", () => {
  const original: PlayerCharacterPart[] = PLAYER_CHARACTER_PART_TYPES.map((partType, i) => ({
    ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType],
    partType, imageUrl: `/api/media/00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  }));
  const snapshot = JSON.stringify(original);
  assert.equal(resolvePlayerCharacterParts(original).length, 8);
  assert.equal(JSON.stringify(original), snapshot);
  // Ignore documentation comments: check executable source for hidden work.
  const executableRenderer = renderer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(executableRenderer, /requestAnimationFrame|setInterval|setTimeout|<canvas|\.getContext\(|fetch\(|apiRequest|PetAnimator|activePetId|useQuery|useEffect/);
  assert.doesNotMatch(preview, /requestAnimationFrame|setInterval|PetAnimator/);
  assert.doesNotMatch(renderer + css + preview, /390\s*[x×]\s*844|390px|844px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
});

test("no player cutover or clothing equipping is introduced in the animation stage", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const routes = read("server/routes/playerCharacter.routes.ts");
  assert.doesNotMatch(home, /PlayerCharacterRenderer|player-character\/default/);
  assert.doesNotMatch(routes, /app\.(post|put|patch)\("\/api\/player-character\/equip/);
});
