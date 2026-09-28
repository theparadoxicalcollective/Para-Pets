import assert from "node:assert/strict";
import { test } from "node:test";
import { guideBoundsInSurface, guideCardShouldMoveUp, guideTargetOnScreen } from "../client/src/lib/questGuideViewport";
import { calculateStageLayout } from "../client/src/lib/stage";

test("quest guides distinguish visible targets from panned-off targets on phone and desktop", () => {
  for (const [width, height] of [[390, 844], [360, 740], [740, 360], [1440, 900], [1024, 600]]) {
    assert.equal(guideTargetOnScreen({ left: width / 2 - 40, right: width / 2 + 40, top: height - 180, bottom: height - 80 }, width, height), true);
    assert.equal(guideTargetOnScreen({ left: width / 2 - 40, right: width / 2 + 40, top: height + 5, bottom: height + 105 }, width, height), false);
    assert.equal(guideTargetOnScreen({ left: width + 5, right: width + 105, top: 100, bottom: 200 }, width, height), false);
    assert.equal(guideTargetOnScreen({ left: 100, right: 200, top: height - 40, bottom: height + 80 }, width, height), false);
  }
});

test("the guide card moves away from a lower world without moving for an upper target", () => {
  assert.equal(guideCardShouldMoveUp({ left: 100, right: 220, top: 620, bottom: 760 }, 844, 130), true);
  assert.equal(guideCardShouldMoveUp({ left: 100, right: 220, top: 200, bottom: 330 }, 844, 130), false);
});

test("desktop stage scaling returns the same guide coordinates as the iPhone 12 layout", () => {
  const phone = { left: 240, right: 320, top: 600, bottom: 680 };
  for (const [width, height] of [[768, 900], [1024, 768], [1440, 1100]]) {
    const stage = calculateStageLayout(width, height);
    const desktop = { left: stage.left + phone.left * stage.scale, right: stage.left + phone.right * stage.scale,
      top: stage.top + phone.top * stage.scale, bottom: stage.top + phone.bottom * stage.scale };
    const converted = guideBoundsInSurface(desktop, stage);
    for (const side of ["left", "right", "top", "bottom"] as const) assert.ok(Math.abs(converted[side] - phone[side]) < 0.0001);
    assert.equal(guideTargetOnScreen(converted, stage.designWidth, stage.designHeight), true);
  }
});
