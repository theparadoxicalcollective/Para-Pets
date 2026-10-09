import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const page = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");

test("Level Up opts into full viewport while other pet placement pages remain unchanged", () => {
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,100}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.match(surface, /fullViewport \? children : <div/);
  assert.match(app, /location\.startsWith\("\/pet-care\/"\)[\s\S]{0,100}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.match(app, /location\.startsWith\("\/pet-level-up\/"\)[\s\S]{0,160}<PetLevelUpRoute/);
});

test("Level Up viewport UI scrolls and pet position remains authored by the original oval", () => {
  assert.match(page, /\[data-page-presentation="full-viewport"\] \.lupage-scroll\{/);
  assert.match(page, /overflow-y:auto;overscroll-behavior:contain/);
  assert.match(page, /\[data-page-presentation="full-viewport"\] \.lupage-pet-zone\{/);
  assert.match(page, /<PetPageOvalPlacement page="levelUp"/);
  assert.match(page, /ref=\{pageRef\}/);
  assert.match(page, /localPoint\(event\.clientX, event\.clientY\)/);
  assert.match(page, /pointInZone\(event\.clientX, event\.clientY\)/);
});

test("the viewport style override is scoped, leaving native phone reference styling intact", () => {
  assert.match(page, /@media\(max-width:430px\)/);
  assert.match(page, /\[data-page-presentation="full-viewport"\]/);
  assert.match(surface, /layout = "reference"/);
});
