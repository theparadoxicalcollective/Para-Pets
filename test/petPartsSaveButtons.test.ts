import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../client/src/components/PetDatabasePanel.tsx", import.meta.url),
  "utf8",
);

test("regular and evolution pet-part editors both expose explicit save buttons", () => {
  assert.match(source, /button-save-regular-parts/);
  assert.match(source, /button-save-evolution-parts/);
  assert.match(source, /Save Regular Parts/);
  assert.match(source, /Save Evolution Parts/);
});

test("Save Parts persists the complete visible transform set for the current form", () => {
  assert.match(source, /const savePartsMutation = useMutation/);
  assert.match(source, /Promise\.all\(parts\.map\(part =>/);
  assert.match(source, /apiRequest\("PATCH", `\/api\/admin\/pet-template-parts\/\$\{part\.id\}`/);
  assert.match(source, /posX: part\.posX/);
  assert.match(source, /posY: part\.posY/);
  assert.match(source, /width: part\.width/);
  assert.match(source, /height: part\.height/);
  assert.match(source, /pivotX: part\.pivotX/);
  assert.match(source, /pivotY: part\.pivotY/);
  assert.match(source, /rotation: part\.rotation \?\? 0/);
  assert.match(source, /form: editorTab === "evolution" \? "evolution" : "base"/);
});

test("Save Parts includes any currently edited draft before persisting", () => {
  assert.match(source, /if \(partDraftRef\.current && !updatePartMutation\.isPending\)/);
  assert.match(source, /const draft = partDraftRef\.current/);
  assert.match(source, /index === draftIndex \? \{ \.\.\.part, \.\.\.draft \} : part/);
  assert.match(source, /title: "Parts saved"/);
});
