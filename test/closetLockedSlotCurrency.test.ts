import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const COSTUME_SECTION_PATH = "client/src/components/PetCostumeEquipmentSection.tsx";

test("locked Closet costume spaces show the shared game coin before the amount", () => {
  const source = fs.readFileSync(COSTUME_SECTION_PATH, "utf8");

  assert.match(source, /import \{ currencyAssets \} from "@\/lib\/currencyAssets"/);
  assert.match(source, /costume-slot-price-\$\{slot\}/);
  assert.match(
    source,
    /<img src=\{currencyAssets\.coin\}[\s\S]*?\{price\.toLocaleString\(\)\}/,
  );
  assert.match(source, /aria-hidden="true"/);
});
