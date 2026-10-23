import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");

test("Pet Park uses existing world scene to move buildings, decor and effects without a second placement renderer", () => {
  assert.match(page, /Move park objects/);
  assert.match(page, /scene\?\.canEditPark/);
  assert.match(page, /startPlacement\(e, "building"/);
  assert.match(page, /startPlacement\(e, "item"/);
  assert.match(page, /homeCameraPointerDelta/);
  assert.match(page, /delta\.x \/ sceneWidth/);
  assert.match(page, /delta\.y \/ sceneHeight/);
  assert.match(page, /Save position/);
  assert.match(page, /onPointerCancel=\{endPlacement\}/);
  assert.match(admin, /app\.patch\("\/api\/admin\/pet-park\/buildings\/:id"/);
  assert.match(admin, /app\.patch\("\/api\/admin\/pet-park\/items\/:id"/);
});
