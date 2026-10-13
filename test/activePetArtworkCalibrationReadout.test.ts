import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("artwork calibration readout is admin-only and opt-in", () => {
  assert.match(home, /currentUser\.isAdmin && new URLSearchParams\(search\)\.get\("petCalibration"\) === "1"/);
  assert.match(home, /showArtworkCalibration && activePet\?\.isHatched && activePet\.petTemplateId/);
  assert.match(home, /data-testid="active-pet-artwork-calibration-readout"/);
});

test("readout reports measured artwork, backdrop, and scene baseline without controlling placement", () => {
  assert.match(home, /Artwork: \{activePetArtworkSize\.width\}/);
  assert.match(home, /Backdrop: \{Math\.round\(activePetBackdropRect\.width\)\}/);
  assert.match(home, /activePetPlatformCalibration\.x\.toFixed\(1\)/);
  assert.match(home, /Readout only — pet placement unchanged/);
  assert.match(home, /top: "calc\(72\*var\(--vh\)\)"/);
});
