import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const [name, file, dialogId] of [
  ["Janson", "JansonQuestOverlay", "janson-quest-dialog"],
  ["Lonelle", "LonelleQuestOverlay", "lonelle-quest-dialog"],
  ["Ginny", "GinnyQuestOverlay", "ginny-quest-dialog"],
] as const) {
  test(`${name} quest overlay owns pointer input above the world`, () => {
    const source = readFileSync(`client/src/components/${file}.tsx`, "utf8");
    assert.match(source, /pointerEvents: "auto"/);
    assert.match(source, /onPointerDown=\{event => event\.stopPropagation\(\)\}/);
    assert.ok(source.includes(`data-testid="${dialogId}"`));
    assert.match(source, /onClick=\{\(\) => setDialogOpen\(false\)\}/);
  });
}
