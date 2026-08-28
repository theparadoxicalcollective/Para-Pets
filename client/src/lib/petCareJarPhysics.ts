export type PetCareJarBounds = {
  width: number;
  height: number;
};

export type PetCareJarBody = {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  radius: number;
};

type PetCareJarSeedBody = {
  key: string;
  left: number;
  top: number;
  rotation: number;
};

const GRAVITY = 920;
const LINEAR_DAMPING = 0.992;
const ANGULAR_DAMPING = 0.985;
const WALL_RESTITUTION = 0.2;
const BODY_RESTITUTION = 0.16;
const FLOOR_Y = 0.86;
const CEILING_Y = 0.1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function jarHalfWidth(normalizedY: number) {
  if (normalizedY < 0.22) {
    const progress = clamp((normalizedY - CEILING_Y) / 0.12, 0, 1);
    return 0.31 + progress * 0.1;
  }
  if (normalizedY < 0.48) {
    return 0.41 + ((normalizedY - 0.22) / 0.26) * 0.075;
  }
  if (normalizedY > 0.73) {
    return 0.485 - ((normalizedY - 0.73) / (FLOOR_Y - 0.73)) * 0.045;
  }
  return 0.485;
}

function wallRange(body: PetCareJarBody, bounds: PetCareJarBounds) {
  const normalizedY = clamp(body.y / bounds.height, CEILING_Y, FLOOR_Y);
  const artworkHalfWidth = bounds.width * 0.135;
  const inset = Math.max(body.radius, artworkHalfWidth);
  const halfWidth = jarHalfWidth(normalizedY) * bounds.width;
  return {
    minX: bounds.width * 0.5 - halfWidth + inset,
    maxX: bounds.width * 0.5 + halfWidth - inset,
  };
}

export function createPetCareJarBodies(
  seeds: PetCareJarSeedBody[],
  bounds: PetCareJarBounds,
): PetCareJarBody[] {
  const densityRadius = bounds.width * (seeds.length > 30 ? 0.043 : seeds.length > 18 ? 0.052 : 0.062);
  const radius = clamp(densityRadius, 7, 15);
  return seeds.map((seed, index) => ({
    key: seed.key,
    x: (seed.left / 100) * bounds.width,
    y: (seed.top / 100) * bounds.height,
    vx: ((index % 3) - 1) * 7,
    vy: 4 + (index % 4) * 2,
    angle: seed.rotation,
    angularVelocity: ((index % 5) - 2) * 5,
    radius,
  }));
}

export function constrainPetCareJarBody(
  body: PetCareJarBody,
  bounds: PetCareJarBounds,
  bounce = true,
) {
  const artworkHalfHeight = bounds.width * 0.135;
  const ceiling = bounds.height * CEILING_Y + artworkHalfHeight;
  const floor = bounds.height * FLOOR_Y - artworkHalfHeight;
  if (body.y < ceiling) {
    body.y = ceiling;
    if (body.vy < 0) body.vy = bounce ? -body.vy * WALL_RESTITUTION : 0;
  } else if (body.y > floor) {
    body.y = floor;
    if (body.vy > 0) body.vy = bounce ? -body.vy * WALL_RESTITUTION : 0;
    body.vx *= 0.86;
    body.angularVelocity *= 0.8;
  }

  const { minX, maxX } = wallRange(body, bounds);
  if (body.x < minX) {
    body.x = minX;
    if (body.vx < 0) body.vx = bounce ? -body.vx * WALL_RESTITUTION : 0;
    body.angularVelocity += 10;
  } else if (body.x > maxX) {
    body.x = maxX;
    if (body.vx > 0) body.vx = bounce ? -body.vx * WALL_RESTITUTION : 0;
    body.angularVelocity -= 10;
  }
  return body;
}

export function movePetCareJarBody(
  body: PetCareJarBody,
  bounds: PetCareJarBounds,
  x: number,
  y: number,
  vx: number,
  vy: number,
) {
  body.x = x;
  body.y = y;
  body.vx = clamp(vx, -900, 900);
  body.vy = clamp(vy, -900, 900);
  body.angularVelocity = clamp(body.vx * 0.16, -160, 160);
  return constrainPetCareJarBody(body, bounds, false);
}

function resolveBodyCollisions(bodies: PetCareJarBody[], heldKey: string | null) {
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    const first = bodies[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const second = bodies[secondIndex];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const minimumDistance = first.radius + second.radius;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimumDistance * minimumDistance) continue;

      const distance = Math.max(0.001, Math.sqrt(distanceSquared));
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minimumDistance - distance;
      const firstHeld = first.key === heldKey;
      const secondHeld = second.key === heldKey;
      const firstShare = firstHeld ? 0 : secondHeld ? 1 : 0.5;
      const secondShare = secondHeld ? 0 : firstHeld ? 1 : 0.5;
      first.x -= nx * overlap * firstShare;
      first.y -= ny * overlap * firstShare;
      second.x += nx * overlap * secondShare;
      second.y += ny * overlap * secondShare;

      const relativeVelocityX = second.vx - first.vx;
      const relativeVelocityY = second.vy - first.vy;
      const separatingSpeed = relativeVelocityX * nx + relativeVelocityY * ny;
      if (separatingSpeed < 0) {
        const impulse = (-(1 + BODY_RESTITUTION) * separatingSpeed) / 2;
        if (!firstHeld) {
          first.vx -= impulse * nx;
          first.vy -= impulse * ny;
          first.angularVelocity -= relativeVelocityX * 0.035;
        }
        if (!secondHeld) {
          second.vx += impulse * nx;
          second.vy += impulse * ny;
          second.angularVelocity += relativeVelocityX * 0.035;
        }
      }
    }
  }
}

export function stepPetCareJarPhysics(
  bodies: PetCareJarBody[],
  bounds: PetCareJarBounds,
  elapsedSeconds: number,
  heldKey: string | null = null,
) {
  const dt = clamp(elapsedSeconds, 0, 0.034);
  const substeps = 2;
  const step = dt / substeps;
  let moving = false;

  for (let substep = 0; substep < substeps; substep += 1) {
    for (const body of bodies) {
      if (body.key === heldKey) continue;
      body.vy += GRAVITY * step;
      body.x += body.vx * step;
      body.y += body.vy * step;
      body.angle += body.angularVelocity * step;
      body.vx *= LINEAR_DAMPING;
      body.vy *= LINEAR_DAMPING;
      body.angularVelocity *= ANGULAR_DAMPING;
      constrainPetCareJarBody(body, bounds);
    }
    resolveBodyCollisions(bodies, heldKey);
    for (const body of bodies) constrainPetCareJarBody(body, bounds);
  }

  for (const body of bodies) {
    if (body.key === heldKey || Math.abs(body.vx) > 2.5 || Math.abs(body.vy) > 3.5 || Math.abs(body.angularVelocity) > 2) {
      moving = true;
    } else {
      body.vx = 0;
      body.vy = 0;
      body.angularVelocity = 0;
    }
  }
  return moving;
}
