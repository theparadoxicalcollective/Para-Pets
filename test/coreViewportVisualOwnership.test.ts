import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const shell = read("client/src/tabletStageShell.css");
const home = read("client/src/pages/HomePage.tsx");
const cards = read("client/src/pages/CardsCollectionPage.tsx");
const aquarium = read("client/src/pages/AquariumPage.tsx");
const backdropPortal = read("client/src/components/ViewportBackdropPortal.tsx");

test("stage-owned wide devices can separate scenery from canonical coordinates", () => {
  assert.match(
    shell,
    /#game-stage\[data-coordinate-owner="stage"\] \[data-viewport-visual-owner="backdrop"\][\s\S]*background-color: transparent !important;[\s\S]*background-image: none !important;/,
  );
  assert.match(
    shell,
    /#game-stage\[data-coordinate-owner="stage"\] \[data-canonical-visual-layer="duplicate-backdrop"\][\s\S]*display: none !important;/,
  );

  // Native phone ownership has no backdrop target, so the same visual children
  // still render inline and preserve the existing iPhone path.
  assert.match(backdropPortal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>>;/);
});

test("Active Pet keeps authored coordinates while the viewport owns its scenery", () => {
  assert.match(home, /data-testid="active-pet-page"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(home, /<ViewportBackdropPortal>[\s\S]*data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /backgroundImage: `url\(\$\{bgImg\}\)`/);

  // The pet's authored stage placement is intentionally unchanged.
  assert.match(home, /className="home-active-pet-stage"/);
  assert.match(home, /top: "calc\(72\*var\(--vh\)\)"/);
});

test("Cards uses one wide-device scenery owner without widening collection coordinates", () => {
  assert.match(cards, /data-testid="page-cards-collection"[\s\S]*data-stage-coordinate-space="canonical"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(cards, /<ViewportBackdropPortal>[\s\S]*data-testid="cards-viewport-backdrop"/);
  assert.match(cards, /data-canonical-visual-layer="duplicate-backdrop"/);

  // The collection itself keeps the existing narrow authored composition.
  assert.match(cards, /width: "min\(100%, 430px\)"/);
  assert.match(cards, /data-testid="card-collection-scroll"/);
});

test("Aquarium scenery fills the viewport while fish stay in canonical percent coordinates", () => {
  assert.match(aquarium, /import ViewportBackdropPortal from "@\/components\/ViewportBackdropPortal"/);
  assert.match(aquarium, /data-testid="aquarium-page"[\s\S]*data-viewport-visual-owner="backdrop"/);
  assert.match(aquarium, /<ViewportBackdropPortal>[\s\S]*data-testid="aquarium-viewport-backdrop"/);
  assert.match(aquarium, /\["main", aquariumBg\][\s\S]*\["bayou", bayouAquariumBg\][\s\S]*\["volcanic", volcanicAquariumBg\]/);

  // Swim and interaction geometry remains stage-relative.
  assert.match(aquarium, /left: `\$\{f\.x\}%`, top: `\$\{f\.y\}%`/);
  assert.match(aquarium, /const py = \(\(e\.clientY - rect\.top\) \/ rect\.height\) \* 100/);
  assert.match(aquarium, /apiRequest\("POST", "\/api\/fishing\/aquarium\/add"/);
  assert.match(aquarium, /apiRequest\("POST", "\/api\/fishing\/aquarium\/remove"/);
  assert.match(aquarium, /apiRequest\("POST", "\/api\/aquarium\/unlock", \{ aquariumId \}\)/);
});
