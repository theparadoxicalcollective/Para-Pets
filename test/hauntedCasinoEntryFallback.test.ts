import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Haunted Casino opens without requiring a saved background image", () => {
  const source = fs.readFileSync("client/src/components/world/WorldLocations.tsx", "utf8");
  const predicate = source.split("function isScrollableHauntedCasino(")[1]?.split("export default function")[0] ?? "";
  assert.match(predicate, /worldId === "haunted_woods"/);
  assert.match(predicate, /\/casino\/i\.test\(location\.name\)/);
  assert.doesNotMatch(predicate, /location\.bgUrl/);
  assert.match(source, /src=\{casinoScene\.bgUrl \|\| hauntedCasinoBackground\}/);
  assert.match(source, /setCasinoScene\(loc\)/);
});
