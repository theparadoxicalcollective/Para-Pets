import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEffectivePetLayer } from "../shared/petLayer";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Head 2 and Head 3 remain in front of the body while Neck Back stays behind it", () => {
  const body = getEffectivePetLayer({ partType: "body", zIndex: 50 });
  const bodyUnderlay = getEffectivePetLayer({ partType: "body_2", zIndex: 49 });

  assert.ok(getEffectivePetLayer({ partType: "h2_head", zIndex: 88 }) > body);
  assert.ok(getEffectivePetLayer({ partType: "h3_head", zIndex: 73 }) > body);
  assert.ok(getEffectivePetLayer({ partType: "h2_eyes", zIndex: 94 }) > body);
  assert.ok(getEffectivePetLayer({ partType: "h3_mouth", zIndex: 76 }) > body);

  const h2Neck = getEffectivePetLayer({ partType: "h2_neck", zIndex: 85 });
  const h3Neck = getEffectivePetLayer({ partType: "h3_neck", zIndex: 70 });
  assert.ok(h2Neck > body);
  assert.ok(h3Neck > body);
  assert.ok(h2Neck < getEffectivePetLayer({ partType: "h2_head", zIndex: 88 }));
  assert.ok(h3Neck < getEffectivePetLayer({ partType: "h3_head", zIndex: 73 }));

  const h2NeckBack = getEffectivePetLayer({ partType: "h2_neck_back", zIndex: 48 });
  const h3NeckBack = getEffectivePetLayer({ partType: "h3_neck_back", zIndex: 48 });
  assert.ok(h2NeckBack < body);
  assert.ok(h3NeckBack < body);
  assert.ok(h2NeckBack > bodyUnderlay);
  assert.ok(h3NeckBack > bodyUnderlay);
});

test("Pet Parts editor exposes Neck 2/3 and Neck Back only in Head 2 and Head 3 sections", () => {
  const source = read("client/src/components/PetDatabasePanel.tsx");

  assert.match(source, /i === 2 \|\| i === 3/);
  assert.match(source, /key: k\("neck"\), label: i === 2 \? "Neck 2" : "Neck 3"/);
  assert.match(source, /key: k\("neck_back"\), label: "Neck Back"/);
  assert.match(source, /defaultZ: 48, layer: "back"/);

  // The same part definitions feed both regular and evolution artwork forms.
  assert.match(source, /const activeParts = editorTab === "evolution"/);
  assert.match(source, /templateDetail\?\.evolutionParts \?\? \[\]/);
  assert.match(source, /form: editorTab === "evolution" \? "evolution" : "base"/);
});

test("runtime keeps rear necks synced to their matching secondary head but below the torso", () => {
  const source = read("client/src/components/PetAnimatorCore.tsx");

  assert.match(source, /const secondaryNeckHeadGroups = new Map/);
  assert.match(source, /part\.partType\.match\(\/\^\(h\[23\]\)_neck\$\//);
  assert.match(source, /data-secondary-neck-head-sync/);
  assert.match(source, /zIndex: 8\.5/);
  assert.match(source, /const rearNeckHeadGroups = new Map/);
  assert.match(source, /part\.partType\.match\(\/\^\(h\[23\]\)_neck_back\$\//);
  assert.match(source, /data-rear-neck-head-sync/);
  assert.match(source, /compressedZ\.set\(part\.id, Math\.max\(0, bodyCompressedZ - 0\.5\)\)/);
  assert.match(source, /const headWrapperZ = 9/);
});

test("server assembled pet artwork uses the shared semantic layer resolver", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /import \{ getEffectivePetLayer \} from "@shared\/petLayer"/);
  assert.match(routes, /getEffectivePetLayer\(a, facing\) - getEffectivePetLayer\(b, facing\)/);
});
