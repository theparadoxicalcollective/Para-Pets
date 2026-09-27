import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const profile = readFileSync("client/src/components/PlayerDetailPanel.tsx", "utf8");
const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const house = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

test("inventory portraits fit visible pet artwork and retain owner equipment and mini pets", () => {
  assert.match(profile, /costumeAccess="public"[\s\S]*?mode="static"[\s\S]*?fillContainer[\s\S]*?fitVisible/);
  assert.match(inventory, /<PetAnimator petTemplateId=\{petTemplateId\} petInventoryId=\{petInventoryId\} mode="static" size=\{140\} fillContainer fitVisible/);
  assert.match(inventory, /<MiniPetRenderer petInventoryId=\{petInventoryId\} animated=\{false\}/);
  assert.match(inventory, /IntersectionObserver/);
});

test("the navigation bag opens the actual bag page and Cards retains its own route", () => {
  assert.match(nav, /id: "bag",\s+label: "Bag",\s+icon: bagNavIcon/);
  assert.doesNotMatch(nav, /id: "friends",\s+label: "Friends"/);
  assert.match(nav, /if \(id === "bag"\)\s+\{ setTimeout\(\(\) => navigate\("\/bag"\)/);
  assert.match(nav, /const isLocked = item\.id === "keepers" && !isStaff/);
  assert.match(app, /location === "\/bag"[\s\S]*?<BagInventoryPage \/>/);
  assert.match(app, /location === "\/cards"[\s\S]*?<CardsCollectionPage \/>/);
});

test("Pet House places Friends between Pets and Home and opens the Friends page", () => {
  assert.match(house, /key: "pets"[\s\S]*?key: "friends"[\s\S]*?key: "home"/);
  assert.match(house, /key === "friends" \? navigate\("\/friends"\)/);
  assert.match(house, /data-testid=\{`button-\$\{key\}-inventory`\}/);
});
