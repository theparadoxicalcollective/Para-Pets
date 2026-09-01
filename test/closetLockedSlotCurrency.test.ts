import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ACCESSORY_PAGE_PATH = "client/src/components/PetEquipAccessoriesPage.tsx";
const COSTUME_SECTION_PATH = "client/src/components/PetCostumeEquipmentSection.tsx";
const COSTUME_LABEL_PATH = "client/src/lib/costumeItemType.ts";
const ITEM_TYPE_FILTERS_PATH = "client/src/lib/itemTypeFilters.ts";

test("locked Closet accessory spaces show the shared game coin before the amount", () => {
  const source = fs.readFileSync(ACCESSORY_PAGE_PATH, "utf8");

  assert.match(source, /import \{ currencyAssets \} from "@\/lib\/currencyAssets"/);
  assert.match(source, /accessory-slot-price-\$\{slot\}/);
  assert.match(
    source,
    /<img src=\{currencyAssets\.coin\}[\s\S]*?\{SLOT_COST\.toLocaleString\(\)\}/,
  );
  assert.match(source, /aria-hidden="true"/);
});

test("locked Closet adornment spaces show the shared game coin before the amount", () => {
  const source = fs.readFileSync(COSTUME_SECTION_PATH, "utf8");

  assert.match(source, /import \{ currencyAssets \} from "@\/lib\/currencyAssets"/);
  assert.match(source, /costume-slot-price-\$\{slot\}/);
  assert.match(
    source,
    /<img src=\{currencyAssets\.coin\}[\s\S]*?\{price\.toLocaleString\(\)\}/,
  );
  assert.match(source, /aria-hidden="true"/);
});

test("costume-backed player labels are presented as adornments", () => {
  const section = fs.readFileSync(COSTUME_SECTION_PATH, "utf8");
  const labelSource = fs.readFileSync(COSTUME_LABEL_PATH, "utf8");
  const filterSource = fs.readFileSync(ITEM_TYPE_FILTERS_PATH, "utf8");

  assert.match(section, /ADORNMENTS/);
  assert.match(section, /Choose Adornment/);
  assert.match(section, /Unlock Adornment Slot/);
  assert.doesNotMatch(section, />COSTUMES/);
  assert.match(labelSource, /return "Adornment"/);
  assert.match(filterSource, /costume: "Adornments"/);
});
