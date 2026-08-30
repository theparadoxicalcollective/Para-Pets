import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainPetCareJarBody,
  createPetCareJarBodies,
  movePetCareJarBody,
  reconcilePetCareJarBodies,
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

test("fast jar drags are capped and released rotation settles", () => {
  const [body] = createPetCareJarBodies(
    [{ key: "treat", left: 50, top: 45, rotation: 0 }],
    bounds,
  );
  movePetCareJarBody(body, bounds, bounds.width / 2, bounds.height / 2, 5000, -5000);
  assert.ok(Math.abs(body.vx) <= 280);
  assert.ok(Math.abs(body.vy) <= 340);
  assert.ok(Math.abs(body.angularVelocity) <= 42);

  for (let frame = 0; frame < 360; frame += 1) {
    stepPetCareJarPhysics([body], bounds, 1 / 60);
  }
  assert.equal(body.vx, 0);
  assert.equal(body.angularVelocity, 0);
});

test("inventory changes preserve surviving jar bodies and remove only consumed units", () => {
  const bodies = createPetCareJarBodies(
    [
      { key: "apple::0", left: 30, top: 55, rotation: 0 },
      { key: "apple::1", left: 60, top: 55, rotation: 0 },
    ],
    bounds,
  );
  bodies[1].x = 112;
  bodies[1].y = 82;
  bodies[1].vx = 14;
  bodies[1].angle = 23;

  const reconciled = reconcilePetCareJarBodies(
    bodies,
    [{ key: "apple::1", left: 20, top: 25, rotation: -30 }],
    bounds,
  );

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].key, "apple::1");
  assert.equal(reconciled[0].x, 112);
  assert.equal(reconciled[0].y, 82);
  assert.equal(reconciled[0].vx, 14);
  assert.equal(reconciled[0].angle, 23);
});

test("new inventory units join without reseeding existing jar bodies", () => {
  const existing = createPetCareJarBodies(
    [{ key: "gift::0", left: 50, top: 60, rotation: 4 }],
    bounds,
  );
  existing[0].x = 90;
  existing[0].angle = 16;

  const reconciled = reconcilePetCareJarBodies(
    existing,
    [
      { key: "gift::0", left: 20, top: 20, rotation: -20 },
      { key: "gift::1", left: 70, top: 30, rotation: 11 },
    ],
    bounds,
  );

  assert.equal(reconciled[0].x, 90);
  assert.equal(reconciled[0].angle, 16);
  assert.equal(reconciled[1].key, "gift::1");
  assert.equal(reconciled[1].x, 140);
});
