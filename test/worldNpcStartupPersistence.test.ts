import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const guardSource = readFileSync(
  resolve(here, "../server/startup/preserveDynamicWorldLocations.ts"),
  "utf8",
);
const startupSource = readFileSync(
  resolve(here, "../server/startup/runStartup.ts"),
  "utf8",
);

test("startup guard snapshots only dynamic NPC world locations", () => {
  assert.match(guardSource, /lower\(COALESCE\(type, ''\)\) = 'npc'/);
  assert.match(guardSource, /to_jsonb\(wl\)/);
});

test("startup guard restores NPC rows even when legacy startup throws", () => {
  assert.match(guardSource, /try\s*\{[\s\S]*await runLegacyStartup\(\);[\s\S]*\}\s*finally\s*\{/);
  assert.match(guardSource, /jsonb_populate_record/);
  assert.match(guardSource, /ON CONFLICT \(id\) DO NOTHING/);
});

test("background initialization wraps the legacy non-critical startup with NPC preservation", () => {
  assert.match(
    startupSource,
    /preserveDynamicWorldLocationsDuringLegacyStartup\(runNonCriticalStartup\)/,
  );
});
