import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scenePointToPlacement } from "../client/src/lib/coordinateContracts";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const details = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
const homeEffects = readFileSync("client/src/components/HomeInteriorEffect.tsx", "utf8");
const adminRoutes = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");

test("park building details are admin-only, contextual and use existing storage", () => {
  assert.match(page, /scene\?\.canEditPark && detailsBuilding && <PetParkBuildingDetails/);
  assert.match(page, /setDetailsBuildingId\(activeBuilding\.id\)/);
  assert.match(page, /setDetailsBuildingId\(selectedPlacement\.id\)/);
  assert.match(details, /Park building name/);
  assert.match(details, /Park building capacity/);
  assert.match(details, /Replace park building exterior/);
  assert.match(details, /Replace park building interior/);
  assert.match(details, /api\/admin\/pet-park\/buildings\/\$\{building\.id\}/);
  assert.match(adminRoutes, /app\.patch\("\/api\/admin\/pet-park\/buildings\/:id", isAdmin/);
  assert.match(adminRoutes, /sanitizeHouseInteriorEffects/);
});

test("player and admin effects share natural-image room coordinates and Home effect layer", () => {
  assert.match(page, /<PetParkInteriorRoom imageUrl=\{activeBuilding\.interiorImageUrl\}/);
  assert.match(details, /<PetParkInteriorRoom imageUrl=\{imagePreview\}/);
  assert.match(room, /naturalWidth \/ naturalHeight/);
  assert.match(room, /getBoundingClientRect\(\)/);
  assert.match(room, /observeHomeViewport\(element, measure, "artwork-scene"\)/);
  assert.match(room, /imgWidth=\{dimensions\.width\} sceneHeight=\{dimensions\.height\}/);
  assert.match(room, /<HomeInteriorEffectsLayer/);
  assert.match(homeEffects, /onEffectPointerDown=/);
  assert.doesNotMatch(page, /aspectRatio: "4 \/ 3"/);
  assert.doesNotMatch(page, /Math\.min\(900, viewportSize\.width - 24\)/);
});

test("interior effect editing reuses coordinate contract and supports cancel/save without duplicating a renderer", () => {
  assert.match(details, /scenePointToPlacement\(/);
  assert.match(details, /safeSetPointerCapture\(/);
  assert.match(details, /onEffectPointerMove=/);
  assert.match(details, /onEffectPointerCancel=/);
  assert.match(details, /HOUSE_INTERIOR_EFFECT_MIN_SIZE/);
  assert.match(details, /HOUSE_INTERIOR_EFFECT_MAX_SIZE/);
  assert.match(details, /HOME_INTERIOR_EFFECT_OPTIONS\.map/);
  assert.match(details, /Save interior effects/);
  assert.match(details, /Cancel effect changes/);
  assert.match(details, /interiorEffects: effects/);
  const origin = { x: 0.38, y: 0.65 };
  for (const [width, height] of [[400, 300], [300, 540], [900, 500], [1440, 900]]) {
    const point = scenePointToPlacement({
      x: origin.x * width + width * 0.12,
      y: origin.y * height - height * 0.18,
    }, { left: 0, top: 0, width, height });
    assert.ok(point);
    assert.ok(Math.abs(point.xPct - 0.50) < 1e-10);
    assert.ok(Math.abs(point.yPct - 0.47) < 1e-10);
    assert.deepEqual(scenePointToPlacement({ x: -9999, y: height * 10 }, { left: 0, top: 0, width, height }), { xPct: 0, yPct: 1 });
  }
  assert.equal(scenePointToPlacement({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 400 }), null);
});
