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
  assert.match(panel, /useState<PlayerCharacterMotion>\("static"\)/);
  assert.match(panel, /\{ mode: "static", label: "Edit" \}/);
  assert.match(panel, /\{ mode: "idle", label: "Idle" \}/);
  assert.match(panel, /\{ mode: "walk", label: "Walk" \}/);
  assert.match(panel, /aria-pressed=\{previewMotion === mode\}/);
  assert.match(panel, /editable=\{previewMotion === "static" && Boolean\(imageData \|\| savedPart\)\}/);
  assert.match(panel, /motion=\{previewMotion\}/);
});

test("walking legs and their own feet share phases, arms swing opposite, and head/torso remain separate", () => {
  const matchSelector = (parts: string[], animationName: string) => {
    const start = css.indexOf('[data-character-motion="walk"]');
    const end = css.indexOf("@keyframes", start);
    const rules = css.slice(start, end);
    const rule = new RegExp(
      parts.map(part => `\\[data-character-motion-part="${part}"\\]`).join("[\\s\\S]*?") +
      `[\\s\\S]*?\\{\\s*animation-name: ${animationName};`
    );
    assert.match(rules, rule);
  };
  matchSelector(["left_leg", "left_foot"], "pc-walk-left");
  matchSelector(["right_leg", "right_foot"], "pc-walk-right");
  matchSelector(["left_arm"], "pc-walk-right");
  matchSelector(["right_arm"], "pc-walk-left");
  matchSelector(["head"], "pc-walk-head");
  matchSelector(["top"], "pc-walk-bounce");
  assert.match(css, /\[data-character-motion="idle"\]/);
  assert.match(css, /\[data-character-motion="walk"\]/);
  assert.match(css, /animation-duration: 0\.72s/);
});

test("animation does not modify stored positions or re-fetch, paint canvas, run timers or touch the pet systems", () => {
  const original: PlayerCharacterPart[] = PLAYER_CHARACTER_PART_TYPES.map((partType, i) => ({
    ...DEFAULT_PLAYER_CHARACTER_TRANSFORMS[partType],
    partType, imageUrl: `/api/media/00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  }));
  const snapshot = JSON.stringify(original);
  assert.equal(resolvePlayerCharacterParts(original).length, 8);
  assert.equal(JSON.stringify(original), snapshot);
  assert.doesNotMatch(renderer, /requestAnimationFrame|setInterval|setTimeout|canvas|fetch\(|apiRequest|PetAnimator|activePetId|useQuery|useEffect/);
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
