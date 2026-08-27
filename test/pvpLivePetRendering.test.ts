import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("PvP battle uses still pet composites and does not mount live animation canvases", () => {
  const battle = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");

  assert.doesNotMatch(battle, /PvpLivePetCanvas|PvpPetCanvasPrewarm|PetAnimatorCanvas/);
  assert.doesNotMatch(battle, /pet\.petTemplateId && !isDead/);
  assert.match(battle, /\{pet\.imageUrl \? \(/);
  assert.match(battle, /src=\{pet\.imageUrl\}/);
});

test("small PvP roster and picker thumbnails remain still images", () => {
  const lobby = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");

  assert.doesNotMatch(lobby, /PvpLivePetCanvas|PetAnimatorCanvas/);
  assert.match(lobby, /inv\.hatchedImageUrl \|\| inv\.imageUrl/);
});
