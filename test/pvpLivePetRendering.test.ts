import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("PvP battle animates living template pets and preserves safe fallbacks", () => {
  const battle = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");

  assert.match(battle, /PvpLivePetCanvas, PvpPetCanvasPrewarm/);
  assert.match(battle, /pet\.petTemplateId && !isDead \? \(/);
  assert.match(battle, /fallbackImageUrl=\{pet\.imageUrl\}/);
  assert.match(battle, /crowded=\{sideCount >= 4\}/);
  assert.match(battle, /templateIds=\{pets\.flatMap/);
  assert.match(battle, /\) : pet\.imageUrl \? \(/);
});

test("live PvP pet renderer stays one-canvas-per-pet and scales its frame budget", () => {
  const renderer = readFileSync("client/src/components/pvp/PvpLivePetCanvas.tsx", "utf8");

  assert.match(renderer, /PetAnimatorCanvas/);
  assert.match(renderer, /fps=\{crowded \? 24 : 30\}/);
  assert.match(renderer, /staleTime: Infinity/);
  assert.match(renderer, /fallbackImageUrl \? \(/);
  assert.match(renderer, /fps=\{15\}/);
  assert.doesNotMatch(renderer, /bufferScale=\{/);
  assert.doesNotMatch(renderer, /mode="petting"/);
});

test("small PvP roster and picker thumbnails remain static", () => {
  const lobby = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");

  assert.doesNotMatch(lobby, /PvpLivePetCanvas/);
  assert.match(lobby, /inv\.hatchedImageUrl \|\| inv\.imageUrl/);
});
