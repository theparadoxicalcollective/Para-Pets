import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Active Pet background extension matches its real JPEG bytes", () => {
  const bytes = readFileSync("attached_assets/uploads/ActivePetMainPageNew.jpg");
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(bytes[2], 0xff);
});


test("Active Pet page and startup preload use the new GitHub background asset", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const app = read("client/src/App.tsx");

  assert.match(home, /import bgImg from "@assets\/uploads\/ActivePetMainPageNew\.jpg"/);
  assert.match(app, /import homeBg from "@assets\/uploads\/ActivePetMainPageNew\.jpg"/);
  assert.match(home, /<ViewportBackdropPortal(?:\\s+targetId="game-viewport-page")?>/);
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.doesNotMatch(home, /useStageSurroundings\(/);
  assert.match(home, /backgroundImage: `url\(\$\{bgImg\}\)`/);

  assert.doesNotMatch(home, /ActivePetMainPageNew\.png/);
  assert.doesNotMatch(home, /@assets\/bg_home_v2\.png/);
  assert.doesNotMatch(app, /ActivePetMainPageNew\.png/);
  assert.doesNotMatch(app, /import homeBg from "@assets\/bg_home_v2\.png"/);
});

test("rarity stars and name-level chrome follow the shared Admin Active Pet anchor", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /import \{ useActivePetAnchor \} from "@\/lib\/petPresentation"/);
  assert.match(home, /const activePetAnchorQuery = useActivePetAnchor\(true\)/);
  assert.match(home, /const logicalPixelPerAnchorPercent = getDesignW\(\) \/ 100/);
  assert.match(home, /x: activePetAnchorQuery\.anchor\.x \* logicalPixelPerAnchorPercent/);
  assert.match(home, /y: activePetAnchorQuery\.anchor\.y \* logicalPixelPerAnchorPercent/);

  const stars = home.indexOf('data-testid="display-pet-rarity-stars"');
  const pet = home.indexOf('data-testid="display-active-pet"');
  const chrome = home.indexOf('data-testid="active-pet-name-level-anchor"');
  assert.ok(stars >= 0 && pet > stars && chrome > pet);

  const starBlock = home.slice(stars, pet);
  assert.match(starBlock, /paddingTop: "155px"/);
  assert.match(starBlock, /marginBottom: "-52px"/);
  assert.match(starBlock, /transform: `translate\(\$\{activePetChromeOffset\.x\}px, \$\{activePetChromeOffset\.y\}px\)`/);

  const chromeBlock = home.slice(chrome, chrome + 1800);
  assert.match(chromeBlock, /bottom: "calc\(11\*var\(--vh\)\)"/);
  assert.match(chromeBlock, /left: "50%"/);
  assert.match(chromeBlock, /translate\(calc\(-50% \+ \$\{activePetChromeOffset\.x\}px\), \$\{activePetChromeOffset\.y\}px\)/);
  assert.match(chromeBlock, /data-testid="text-active-pet-name"/);
  assert.match(chromeBlock, /data-testid="text-home-pet-level"/);
});

test("shared anchor chrome does not move unhatched eggs or legacy image pets", () => {
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(home, /if \(!activePet\?\.isHatched \|\| !activePet\.petTemplateId\) return \{ x: 0, y: 0 \}/);
});

test("individual pet placement remains owned by ActivePetPlacement", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const placement = read("client/src/components/ActivePetPlacement.tsx");

  assert.match(home, /<ActivePetPlacement templateId=\{activePet\.petTemplateId\}/);
  assert.match(placement, /usePetPresentation\(templateId, form, resolvedView/);
  assert.match(placement, /getPetPlacementTransform\(ground, value, editor \? DEFAULT_ACTIVE_PET_ANCHOR : anchor\)/);
  assert.match(placement, /data-testid="active-pet-placement-guide"/);
});
