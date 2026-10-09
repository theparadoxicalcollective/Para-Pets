import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientPointInRenderedElement } from "../client/src/lib/stage";

test("screen-space hit testing maps into actual artwork, not a 390x844 phone plane", () => {
  const natural = { width: 1440, height: 2560 };
  for (const rect of [
    { left: 0, top: 0, width: 320, height: 700 },
    { left: 200, top: 40, width: 768, height: 1024 },
    { left: 460, top: 200, width: 400, height: 600 },
    { left: -200, top: -125, width: 1920, height: 1080 },
  ]) {
    const x = rect.left + rect.width * 0.63;
    const y = rect.top + rect.height * 0.28;
    const point = clientPointInRenderedElement(rect, x, y, natural.width, natural.height);
    assert.ok(Math.abs(point.x - natural.width * 0.63) < 1e-8);
    assert.ok(Math.abs(point.y - natural.height * 0.28) < 1e-8);
  }
});

test("invalid artwork extents fail closed for hit tests", () => {
  assert.deepEqual(clientPointInRenderedElement({left:0,top:0,width:0,height:100},12,14,100,100), {x:0,y:0});
});

test("World shop hit testing consumes the same rendered-element geometry", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  assert.match(source, /clientPointInRenderedElement\(rect, e\.clientX, e\.clientY, img\.naturalWidth, img\.naturalHeight\)/);
});
