import assert from "node:assert/strict";
import test from "node:test";
import { createPetCareGestureController } from "../client/src/lib/petCareInteractions";

test("real gesture controller owns deliberate movement as one item drag", () => {
  const controller = createPetCareGestureController<{ id: string }>();
  controller.begin(1, 100, 200, { id: "food" });
  assert.equal(controller.move(1, 130, 195)?.intent, "vertical-item-drag");
  assert.equal(controller.current()?.intent, "vertical-item-drag", "confirmed dragging persists until release");
  controller.cancel();
  controller.begin(2, 100, 200, { id: "food" });
  assert.equal(controller.move(2, 102, 180)?.intent, "vertical-item-drag");
  assert.equal(controller.consume(2)?.item.id, "food");
  assert.equal(controller.consume(2), null, "duplicate pointerup is ignored");
});

test("a horizontal wobble can remain pending and resolve into an upward drag", () => {
  const controller = createPetCareGestureController<{ kind: "edibles" | "gift" }>();
  for (const kind of ["edibles", "gift"] as const) {
    controller.begin(4, 100, 200, { kind });
    assert.equal(controller.move(4, 109, 198)?.intent, "pending");
    assert.equal(controller.move(4, 110, 182)?.intent, "vertical-item-drag");
    assert.equal(controller.consume(4)?.item.kind, kind);
  }
});

test("a stationary release remains a tap while movement becomes a drag", () => {
  const controller = createPetCareGestureController<{ id: string }>();
  controller.begin(5, 100, 200, { id: "apple" });
  assert.equal(controller.consume(5)?.intent, "pending", "a release without travel is available to the tap fallback");

  controller.begin(6, 100, 200, { id: "apple" });
  controller.move(6, 125, 201);
  assert.equal(controller.consume(6)?.intent, "vertical-item-drag", "movement cannot accidentally become a shelf swipe");
});

test("drop arbitration applies once inside the expanded pet and never outside", () => {
  const pet = { left: 100, right: 200, top: 80, bottom: 180 };
  const controller = createPetCareGestureController<string>();
  let applications = 0;
  const release = (pointerId: number, x: number, y: number) => {
    const gesture = controller.consume(pointerId);
    if (gesture?.intent === "vertical-item-drag" && x >= pet.left - 26 && x <= pet.right + 26 && y >= pet.top - 26 && y <= pet.bottom + 26) applications++;
  };
  controller.begin(7, 150, 260, "edible"); controller.move(7, 155, 210); release(7, 95, 120); release(7, 95, 120);
  assert.equal(applications, 1, "one release causes exactly one application");
  controller.begin(8, 150, 260, "gift"); controller.move(8, 155, 210); release(8, 40, 40);
  assert.equal(applications, 1, "release outside causes zero additional applications");
});

test("pointer cancellation and lost capture clear without an application", () => {
  const controller = createPetCareGestureController<string>();
  controller.begin(9, 100, 200, "gift"); controller.move(9, 100, 180); controller.cancel();
  assert.equal(controller.consume(9), null);
  controller.cancel();
  assert.equal(controller.current(), null);
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
