import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const popupSource = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");
const evolutionRules = readFileSync("shared/evolution.ts", "utf8");
const evolutionServer = readFileSync("server/petEvolution.ts", "utf8");

const popupAssets = [
  "main.png",
  "close-icon.png",
  "decor-icon.png",
  "pet-card.png",
  "selected-icon.png",
  "points-bar.png",
  "selecting-icon.png",
];

test("Evolution feeder popup uses the organized ENP artwork", () => {
  for (const asset of popupAssets) {
    assert.ok(existsSync(`attached_assets/ui/power-up/evolution-popup/${asset}`), `${asset} should be organized in the permanent Power Up folder`);
  }
  assert.doesNotMatch(popupSource, /@assets\/uploads\//);
  assert.match(popupSource, /className="pupevo-picker-art" src=\{popupMain\}/);
  assert.match(popupSource, /className="pupevo-picker-close"/);
  assert.match(popupSource, /className="pupevo-picker-decor"/);
  assert.match(popupSource, /className="pupevo-feeder-card" src=\{popupPetCard\}/);
  assert.match(popupSource, /className="pupevo-points-art" src=\{popupPointsBar\}/);
  assert.match(popupSource, /className="pupevo-feed-icon" src=\{popupSelected\}/);
  assert.match(popupSource, /className="pupevo-selecting" src=\{popupSelecting\}/);
});

test("Evolution pet cards scroll independently and show gold stars and points", () => {
  assert.match(popupSource, /pupevo-feeders\{[^}]*overflow-y:auto[^}]*touch-action:pan-y/);
  assert.match(popupSource, /pupevo-feeder-stars\{[^}]*color:#f3c653/);
  assert.match(popupSource, /\{"★"\.repeat\(stars\)\}/);
  assert.match(popupSource, /pet\.evolutionPoints\.toLocaleString\(\).*pts/);
  assert.match(popupSource, /aria-pressed=\{checked\}/);
  assert.match(popupSource, /pupevo-feeder\.selected \.pupevo-selecting\{[^}]*drop-shadow/);
  assert.match(popupSource, /pupevo-feeder\+\.pupevo-feeder\{margin-top:-6%\}/);
  assert.match(popupSource, /pupevo-feeder\.selected::after\{[^}]*background:linear-gradient\(135deg,#087743,#25d87d\)/);
});

test("Evolution popup exposes progress and keeps its warning and confirmation aligned", () => {
  assert.match(popupSource, /className="pupevo-picker-progress" role="progressbar"/);
  assert.match(popupSource, /style=\{\{ width: `\$\{currentPercent\}%` \}\}/);
  assert.match(popupSource, />Pets used for evolution are permanently consumed\.<\/p>/);
  assert.match(popupSource, /pupevo-warning\{position:static/);
  assert.match(popupSource, /pupevo-feed\{left:8%;right:18%;bottom:9\.5%/);
  assert.match(popupSource, /selectedPets\.length === 1 \? "Confirm Pet"/);
});

test("Evolution popup close control cannot move the locked Power Up background", () => {
  assert.match(popupSource, /pickerCloseRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(popupSource, /pageScroll\.style\.overflowY = "hidden"/);
  assert.match(popupSource, /root\.style\.overflow = "hidden"/);
  assert.match(popupSource, /pageScroll\.scrollTop = position\.pageTop/);
  assert.match(popupSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(popupSource, /if \(event\.key === "Escape"\) closePicker\(\)/);
});

test("Selected points preview and server both preserve overflow across nodes", () => {
  assert.match(popupSource, /applyEvolutionPoints\(completedSlots, currentPoints, selectedPoints/);
  assert.match(popupSource, /projectedProgress\.currentPoints\.toLocaleString\(\).*pts carry forward/);
  assert.match(evolutionRules, /while \(completedSlots < EVOLUTION_SLOT_COUNT && currentPoints >= pointsRequired\)/);
  assert.match(evolutionRules, /currentPoints -= pointsRequired/);
  assert.match(evolutionServer, /const next = applyEvolutionPoints\(completedSlots, currentPoints, pointsAwarded, target\.rarity\)/);
});
