import assert from "node:assert/strict";
import test from "node:test";
import { calculateGinnyGuidePlacement } from "../client/src/lib/ginnyGuidePosition";

test("keeps the existing centered coachmark centered for a centered target", () => {
  const placement = calculateGinnyGuidePlacement(
    { left: 150, top: 500, width: 90, height: 100 },
    390,
    844,
    84,
  );

  assert.equal(placement.tooltipLeft, 65);
  assert.equal(placement.arrowX, 130);
  assert.equal(placement.tooltipAbove, true);
});

test("edge-clamped coachmark arrow still points at a left-side Mini Pet target", () => {
  const placement = calculateGinnyGuidePlacement(
    { left: 30, top: 390, width: 80, height: 80 },
    390,
    844,
    84,
  );

  assert.equal(placement.tooltipLeft, 12);
  assert.equal(placement.arrowX, 58);
  assert.notEqual(placement.arrowX, placement.tooltipWidth / 2);
});

test("places the tooltip below a target near the top and therefore needs an upward arrow", () => {
  const placement = calculateGinnyGuidePlacement(
    { left: 145, top: 40, width: 100, height: 80 },
    390,
    844,
    84,
  );

  assert.equal(placement.tooltipAbove, false);
  assert.ok(placement.tooltipTop > placement.highlightTop + placement.highlightHeight);
});

test("places the tooltip above a low target and keeps it inside the viewport", () => {
  const placement = calculateGinnyGuidePlacement(
    { left: 145, top: 700, width: 100, height: 80 },
    390,
    844,
    96,
  );

  assert.equal(placement.tooltipAbove, true);
  assert.ok(placement.tooltipTop >= 8);
  assert.ok(placement.tooltipTop + 96 <= 844);
});

test("keeps a clamped coachmark inside an ordinary phone viewport", () => {
  const placement = calculateGinnyGuidePlacement(
    { left: 2, top: 300, width: 56, height: 56 },
    320,
    700,
    90,
  );

  assert.ok(placement.tooltipLeft >= 12);
  assert.ok(placement.tooltipLeft + placement.tooltipWidth <= 308);
  assert.ok(placement.arrowX >= 24);
  assert.ok(placement.arrowX <= placement.tooltipWidth - 24);
});
