import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("active pet stays behind its petting hearts and sparkles", () => {
  const hearts = source.indexOf("petHearts.map((h) =>");
  const sparkles = source.indexOf("petSparkles.map((s) =>");
  const pet = source.indexOf("{...activePetTouchHandlers}", sparkles);
  assert.ok(hearts > 0 && sparkles > hearts && pet > sparkles);
  assert.match(source.slice(hearts, sparkles), /zIndex: 540/);
  assert.match(source.slice(sparkles, pet), /zIndex: 541/);
  assert.match(source.slice(pet, pet + 2200), /zIndex: 1/);
});
