import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const details = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const player = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");

test("effect drafts use the most recently confirmed server save as their cancel baseline", () => {
  assert.match(details, /savedEffects = useRef<ParkInteriorEffect\[\]>/);
  assert.match(details, /onSuccess: \(updated, variables\) =>/);
  assert.match(details, /variables\.interiorEffects !== undefined/);
  assert.match(details, /savedEffects\.current = confirmed/);
  assert.match(details, /setEffects\(confirmed\)/);
  assert.match(details, /setEffects\(savedEffects\.current\)/);
  assert.doesNotMatch(details, /setEffects\(building\.interiorEffects \?\? \[\]\); setSelectedEffectId/);
  assert.match(details, /setEffects\(current => JSON\.stringify\(current\) === JSON\.stringify\(previousSaved\) \? latest : current\)/);
  assert.match(details, /disabled=\{mutation\.isPending\} onClick=\{\(\) => mutation\.mutate\(\{ interiorEffects: effects \}\)\}/);
});

test("indoor deposits and capacity edits remain safe without affecting reward settlement", () => {
  assert.doesNotMatch(page, /occupantCount=\{/);
  assert.doesNotMatch(details, /capacity < occupantCount/);
  assert.match(details, /Visitors share the building with placed pets/);
  assert.match(admin, /db\.transaction\(async tx =>/);
  assert.match(admin, /isNull\(petParkDeposits\.withdrawnAt\)/);
  assert.match(admin, /occupants\.length > \(updates\.maxPets as number\)/);
  assert.match(admin, /count > room\.maxPets/);
  assert.match(player, /others\.length >= building\.maxPets/);
  assert.match(player, /isPetAccessibleParkRoom\(room\)/);
});
