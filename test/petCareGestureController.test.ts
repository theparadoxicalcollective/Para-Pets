import assert from "node:assert/strict";
import test from "node:test";
import { createPetCareGestureController } from "../client/src/lib/petCareInteractions";

test("real gesture controller separates shelf scrolling from one upward drag", () => {
  const controller = createPetCareGestureController<{ id: string }>();
  controller.begin(1, 100, 200, { id: "food" });
  assert.equal(controller.move(1, 130, 195), null);
  controller.begin(2, 100, 200, { id: "food" });
  assert.equal(controller.move(2, 102, 180)?.intent, "vertical-item-drag");
  assert.equal(controller.consume(2)?.item.id, "food");
  assert.equal(controller.consume(2), null, "duplicate pointerup is ignored");
});

test("cancel and twenty repeated interactions leave no active gesture", () => {
  const controller = createPetCareGestureController<number>();
  controller.begin(1, 0, 20, 1); controller.move(1, 0, 0); controller.cancel();
  assert.equal(controller.consume(1), null);
  for (let i = 0; i < 20; i++) {
    controller.begin(i, 0, 20, i); controller.move(i, 0, 0); assert.equal(controller.consume(i)?.item, i);
  }
  assert.equal(controller.current(), null);
});
