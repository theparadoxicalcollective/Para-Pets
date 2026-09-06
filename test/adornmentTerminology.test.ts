import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("global UI terminology uses adornments instead of costumes", () => {
  const bridge = fs.readFileSync("client/src/components/AdornmentTerminologyBridge.tsx", "utf8");
  const main = fs.readFileSync("client/src/main.tsx", "utf8");

  assert.match(main, /import AdornmentTerminologyBridge/);
  assert.match(main, /<AdornmentTerminologyBridge\s*\/>/);
  assert.match(bridge, /\[\/\\bCostumes\\b\/g, "Adornments"\]/);
  assert.match(bridge, /\[\/\\bCostume\\b\/g, "Adornment"\]/);
  assert.match(bridge, /\[\/\\bcostumes\\b\/g, "adornments"\]/);
  assert.match(bridge, /\[\/\\bcostume\\b\/g, "adornment"\]/);
  assert.match(bridge, /aria-label/);
  assert.match(bridge, /placeholder/);
  assert.match(bridge, /querySelectorAll\("option"\)/);
});

test("legacy costume identifiers stay compatibility-only while visible item types are renamed", () => {
  const bridge = fs.readFileSync("client/src/components/AdornmentTerminologyBridge.tsx", "utf8");
  const database = fs.readFileSync("client/src/components/ItemDatabaseSection.tsx", "utf8");
  const closet = fs.readFileSync("client/src/components/PetCostumeEquipmentSection.tsx", "utf8");

  // Existing rows and equipment APIs still use this historical discriminator.
  // The terminology bridge changes what admins and players see without orphaning those rows.
  assert.match(database, /"costume"/);
  assert.match(closet, /\/costumes/);
  assert.match(bridge, /legacy `costume` discriminator intentionally/);

  // The existing Closet already calls the feature Adornments directly, while
  // the global bridge covers old item-type/category strings elsewhere.
  assert.match(closet, /\bAdornments\b/i);
  assert.doesNotMatch(bridge, /setAttribute\("value"/);
});
