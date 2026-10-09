import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_PET_PRESENTATION } from "../shared/petPresentation";
import { getPetPlacementTransform, getStablePetGroundPoint, getPetSpotPosition } from "../client/src/lib/petGroundPlacement";

const read = (path: string) => readFileSync(path, "utf8");

test("every pet subpage grounds pet artwork using the same authored-foot transform as Active Pet", () => {
  const source = read("client/src/components/PetPageOvalPlacement.tsx");
  const active = read("client/src/components/ActivePetPlacement.tsx");
  assert.match(source, /getStablePetGroundPoint\(parts\)/);
  assert.match(source, /getPetPlacementTransform\(ground, petValue, anchor\)/);
  assert.match(source, /getPetSpotPosition\(anchor\)/);
  assert.match(active, /getStablePetGroundPoint\(visibleParts\)/);
  assert.match(active, /getPetPlacementTransform\(ground, value/);
  const ground = getStablePetGroundPoint([
    { partType: "left_leg", posX: 300, posY: 600, width: 150, height: 290, imageUrl: "leg" },
    { partType: "right_leg", posX: 530, posY: 600, width: 150, height: 290, imageUrl: "leg" },
  ]);
  const anchor = { x: 8, y: -13 };
  const transform = getPetPlacementTransform(ground, DEFAULT_PET_PRESENTATION, anchor);
  const translation = transform.transform.match(/translate\(([-\d.]+)%, ([-\d.]+)%\)/);
  assert.ok(translation);
  const spot = getPetSpotPosition(anchor);
  assert.equal(ground.x / 10 + Number(translation[1]), spot.x);
  assert.equal(ground.y / 10 + Number(translation[2]), spot.y);
});

test("Level Up stays inside the authored page rather than allowing full-page scroll", () => {
  const page = read("client/src/components/PetLevelUpPage.tsx");
  assert.match(page, /\.lupage-scroll\{position:relative;z-index:1;height:100%;min-height:0;overflow:hidden/);
  assert.match(page, /\.lupage-stage\{position:relative;flex:1 1 auto;min-height:0/);
  assert.match(page, /data-testid="level-up-authored-background"/);
  assert.match(page, /PetPageOvalPlacement page="levelUp" admin=\{Boolean\(props.admin\)\} petTemplateId=\{petTemplateId\} petInventoryId=\{petInventoryId\}/);
  assert.doesNotMatch(page, /<AdminPetPagePlacement/);
  assert.match(page, /onPointerUp=\{onPointerUp\}/);
  assert.match(page, /onUseItem\(item\)/);
});

test("Power-Up pet, orbit nodes and platform move as one while the old editor is absent", () => {
  const page = read("client/src/components/PetPowerUpPage.tsx");
  const group = page.indexOf('data-testid="power-up-pet-and-node-group"');
  const orbit = page.indexOf("<EvolutionPanel enabled", group);
  const oval = page.indexOf('<PetPageOvalPlacement page="powerUp"', group);
  const nameplate = page.indexOf('className="pupage-nameplate"', group);
  assert.ok(group > 0 && orbit > group && oval > orbit && nameplate > oval);
  assert.match(page, /onPreview=\{setPowerUpPreview\}/);
  assert.doesNotMatch(page, /AdminPetPagePlacement/);
});

test("Closet shows the same oval at the feet and preserves equipment interactions", () => {
  const page = read("client/src/components/PetEquipAccessoriesPage.tsx");
  const adornments = read("client/src/components/PetCostumeEquipmentSection.tsx");
  assert.match(page, /data-testid="closet-pet-preview"[\s\S]*?left: "5%"[\s\S]*?top: "28%"/);
  assert.match(page, /PetPageOvalPlacement page="closet" admin=\{user\?\.isAdmin === true\}/);
  assert.match(page, /rgba\(2,18,13,\.88\)/);
  assert.match(page, /data-testid="button-open-mini-pets"/);
  assert.match(page, /data-testid="closet-authored-background"/);
  assert.match(page, /aria-label="Accessory slots"/);
  assert.match(adornments, /aria-label="Adornment slots"/);
  assert.match(adornments, /rgba\(22,16,7,\.91\)/);
});
