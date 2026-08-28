import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainPetCareJarBody,
  createPetCareJarBodies,
  movePetCareJarBody,
  stepPetCareJarPhysics,
} from "../client/src/lib/petCareJarPhysics";

const bounds = { width: 200, height: 170 };

test("jar gravity makes a released item fall and rotate", () => {
  const [body] = createPetCareJarBodies(
    [{ key: "apple", left: 50, top: 35, rotation: -18 }],
    bounds,
  );
  const startY = body.y;
  const startAngle = body.angle;
  for (let frame = 0; frame < 8; frame += 1) {
    stepPetCareJarPhysics([body], bounds, 1 / 60);
  }
  assert.ok(body.y > startY);
  assert.notEqual(body.angle, startAngle);
});

test("jar bodies collide and push each other apart", () => {
  const bodies = createPetCareJarBodies(
    [
      { key: "first", left: 50, top: 55, rotation: 0 },
      { key: "second", left: 50, top: 55, rotation: 0 },
    ],
    bounds,
  );
  stepPetCareJarPhysics(bodies, bounds, 1 / 60);
  const distance = Math.hypot(bodies[1].x - bodies[0].x, bodies[1].y - bodies[0].y);
  assert.ok(distance >= bodies[0].radius + bodies[1].radius - 0.01);
});

test("dragging cannot move item artwork beyond the shaped jar interior", () => {
  const [body] = createPetCareJarBodies(
    [{ key: "gift", left: 50, top: 55, rotation: 0 }],
    bounds,
  );
  movePetCareJarBody(body, bounds, -500, 500, -200, 300);
  assert.ok(body.x > 0);
  assert.ok(body.y < bounds.height);
  const leftBound = body.x;
  body.x = 500;
  body.y = -500;
  constrainPetCareJarBody(body, bounds, false);
  assert.ok(body.x < bounds.width);
  assert.ok(body.y > 0);
  assert.ok(leftBound < body.x);
});
