import { clampFish, FISH_BOTTOM_MIN, FISH_BOTTOM_MAX, fishRarityScale, fishSchoolKey, fishSeed, isBottomFish } from "./fishSwimMotion";

export interface AqFishEntry {
  id: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  starRarity: number | null;
  facingDirection: string | null;
  fishSwimZone?: string | null;
  hasParts?: boolean;
  isSeaAnimal?: boolean;
}

export interface SwimmingFish extends AqFishEntry {
  x: number;
  y: number;
  vx: number;
  targetVx: number;
  wobble: number;
  wobbleSpeed: number;
  facingRight: boolean;
  baseSpeed: number;
  state: "normal" | "fast" | "chasing" | "fleeing";
  stateTimer: number;
  chaseTargetId?: string;
  targetY?: number;
  targetYTimer?: number;
  schooling?: boolean;
  floorHomeX?: number;
  floorHomeY?: number;
}

const BOTTOM_MIN = FISH_BOTTOM_MIN * 100;
const BOTTOM_MAX = FISH_BOTTOM_MAX * 100;
const FLOOR_ROAM = 6;
const FLOOR_SPEED = .035;

export function aquariumFishSize(fish: AqFishEntry, tankWidth: number, tankHeight = Infinity) {
  // Preserve the existing bitmap and parts base sizes while ensuring even
  // the biggest fish fits narrow phones. Never depend on a reference phone.
  return Math.min(fish.hasParts ? 130 : 54, Math.max(1, tankWidth) * .32, Math.max(1, tankHeight) * .26) * fishRarityScale(fish.starRarity);
}

export function aquariumFishBounds(fish: AqFishEntry, tankWidth: number, tankHeight = Infinity) {
  const half = aquariumFishSize(fish, tankWidth, tankHeight) / Math.max(1, tankWidth) * 50;
  return { left: Math.max(5, half), right: Math.min(91, 100 - half) };
}

export function confineAquariumFish(fish: SwimmingFish, tankWidth: number, tankHeight = Infinity): SwimmingFish {
  const bounds = aquariumFishBounds(fish, tankWidth, tankHeight);
  const bottom = isBottomFish(fish);
  const x = clampFish(fish.x, bounds.left, bounds.right);
  const y = clampFish(fish.y, bottom ? BOTTOM_MIN : 22, bottom ? BOTTOM_MAX : 71);
  return { ...fish, x, y,
    floorHomeX: bottom ? clampFish(fish.floorHomeX ?? x, bounds.left, bounds.right) : undefined,
    floorHomeY: bottom ? clampFish(fish.floorHomeY ?? y, BOTTOM_MIN, BOTTOM_MAX) : undefined };

}

type SchoolTarget = {x: number; y: number; vx: number; leader?: boolean};

/** Intermittent schools, from the existing aquarium tick (20ms). Stable
 * species-specific phases prevent all schools gathering at once. */
function aquariumSchoolTargets(fish: readonly SwimmingFish[], tick: number) {
  const groups = new Map<string, SwimmingFish[]>();
  for (const swimmer of fish) {
    const key = fishSchoolKey(swimmer.shopItemId, swimmer);
    if (!key || swimmer.state !== "normal" || (tick + fishSeed(key) % 1600) % 1600 >= 850) continue;
    const localKey = isBottomFish(swimmer) ? key + ":" + Math.floor((swimmer.floorHomeX ?? swimmer.x) / 12) : key;
    const group = groups.get(localKey) ?? [];
    group.push(swimmer);
    groups.set(localKey, group);
  }
  const result = new Map<string, SchoolTarget>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const leader = group[0];
    result.set(leader.id, { x: leader.x, y: leader.y, vx: leader.vx, leader: true });
    group.slice(1).forEach((f, i) => {
      const row = Math.floor(i / 3) + 1;
      const direction = leader.vx < 0 ? -1 : 1;
      const gap = isBottomFish(f) ? Math.min(5, row * 2.2) + (i % 3) * .6 : Math.min(30, row * (f.hasParts ? 13 : 9)) + (i % 3) * 2.5;
      const vertical = (i % 3 - 1) * (isBottomFish(f) ? 1.4 : 4.5);
      result.set(f.id, { x: leader.x - direction * gap, y: leader.y + vertical, vx: leader.vx });
    });
  }
  return result;
}

export function makeSwimmer(entry: AqFishEntry, x?: number, y?: number, random = Math.random): SwimmingFish {
  const tier = random();
  const isBottom = isBottomFish(entry);
  const speedMultiplier = isBottom ? 0.19 : 0.70;
  const rawSpeed = tier < 0.33
    ? 0.050 + random() * 0.020
    : tier < 0.67
    ? 0.085 + random() * 0.030
    : 0.130 + random() * 0.035;
  const baseSpeed = rawSpeed * speedMultiplier;
  const startsRight = entry.facingDirection !== "left";
  const defaultY = isBottom
    ? 96 + random() * 4
    : 26 + random() * 44;
  const initialVx = startsRight ? baseSpeed : -baseSpeed;
  return {
    ...entry,
    x: x ?? (random() * 80),
    y: clampFish(y ?? defaultY, isBottom ? BOTTOM_MIN : 22, isBottom ? BOTTOM_MAX : 71),
    vx: initialVx,
    targetVx: initialVx,
    wobble: random() * Math.PI * 2,
    wobbleSpeed: 0.022 + random() * 0.014,
    facingRight: startsRight,
    baseSpeed,
    state: "normal",
    stateTimer: 60 + Math.floor(random() * 120),
    targetY: isBottom
      ? BOTTOM_MIN + random() * (BOTTOM_MAX - BOTTOM_MIN)
      : undefined,
    targetYTimer: isBottom ? 200 + Math.floor(random() * 400) : undefined,
  };
}

export function stepAquariumFish(prev: readonly SwimmingFish[], tick: number, tankWidth: number, tankHeight = Infinity, random = Math.random): SwimmingFish[] {
  const posMap = new Map(prev.map(f => [f.id, { x: f.x, y: f.y }]));
  const school = aquariumSchoolTargets(prev, tick);
  let updated = prev.map(f => {
    let { x, y, vx, targetVx, wobble, wobbleSpeed, facingRight, baseSpeed, state, stateTimer, chaseTargetId } = f;
    const isBottom = isBottomFish(f);
    // Floor dwellers creep, rather than darting or pursuing other fish.
    if (isBottom && state !== "normal") {
      state = "normal"; chaseTargetId = undefined;
      targetVx = (targetVx >= 0 ? 1 : -1) * baseSpeed;
    }
    stateTimer = Math.max(0, stateTimer - 1);
    if (stateTimer === 0) {
      if (state === "chasing") {
        targetVx = targetVx >= 0 ? -baseSpeed : baseSpeed;
        state = "normal"; chaseTargetId = undefined;
        stateTimer = 80 + Math.floor(random() * 120);
      } else if (state === "fleeing") {
        targetVx = (targetVx >= 0 ? 1 : -1) * baseSpeed;
        state = "normal"; chaseTargetId = undefined;
        stateTimer = 80 + Math.floor(random() * 120);
      } else if (state === "fast") {
        state = "normal";
        targetVx = (targetVx >= 0 ? 1 : -1) * baseSpeed;
        stateTimer = 80 + Math.floor(random() * 140);
      } else if (school.has(f.id)) {
        // Keep the school coordinated for its brief shared excursion.
        stateTimer = 100 + Math.floor(random() * 160);
      } else {
        if (!isBottom && random() < 0.20) {
          state = "fast";
          targetVx = (targetVx >= 0 ? 1 : -1) * baseSpeed * 1.8;
          stateTimer = 20 + Math.floor(random() * 35);
        } else {
          if (random() < .20) targetVx = -targetVx;
          stateTimer = 100 + Math.floor(random() * 160);
        }
      }
    }
    if (state === "chasing" && chaseTargetId) {
      const target = posMap.get(chaseTargetId);
      if (target) {
        const chaseSpeed = baseSpeed * 1.8;
        const dx = target.x - x;
        if (dx > 2)       { targetVx = chaseSpeed; }
        else if (dx < -2) { targetVx = -chaseSpeed; }
      }
    }
    if (state === "fleeing" && chaseTargetId) {
      const target = posMap.get(chaseTargetId);
      if (target) {
        const fleeSpeed = baseSpeed * 3.4;
        const dx = target.x - x;
        if (dx > 2)       { targetVx = -fleeSpeed; }
        else if (dx < -2) { targetVx = fleeSpeed; }
      }
    }
    const formation = state === "normal" ? school.get(f.id) : undefined;
    const schooling = !!formation;
    const tankBounds = aquariumFishBounds(f, tankWidth, tankHeight);
    const floorHomeX = isBottom ? clampFish(f.floorHomeX ?? x, tankBounds.left, tankBounds.right) : undefined;
    const floorHomeY = isBottom ? clampFish(f.floorHomeY ?? y, BOTTOM_MIN, BOTTOM_MAX) : undefined;
    const yMin = isBottom ? Math.max(BOTTOM_MIN, floorHomeY! - 1.25) : 22;
    const yMax = isBottom ? Math.min(BOTTOM_MAX, floorHomeY! + 1.25) : 71;
    const bounds = isBottom ? { left: Math.max(tankBounds.left, floorHomeX! - FLOOR_ROAM), right: Math.min(tankBounds.right, floorHomeX! + FLOOR_ROAM) } : tankBounds;
    // A follower approaches a moving, staggered slot behind its leader.
    // It then aligns with the leader's velocity. Fast/chasing/fleeing fish
    // retain the existing independent state machine.
    if (formation && !formation.leader) {
      const goalX = clampFish(formation.x, bounds.left, bounds.right);
      targetVx = clampFish(formation.vx + (goalX - x) * .025, isBottom ? -FLOOR_SPEED : -.35, isBottom ? FLOOR_SPEED : .35);
    } else if ((!formation || formation.leader) && f.schooling && state === "normal") {
      targetVx = (vx >= 0 ? 1 : -1) * baseSpeed;
    }
    if (isBottom) targetVx = clampFish(targetVx, -FLOOR_SPEED, FLOOR_SPEED);
    vx += (targetVx - vx) * .08;
    if (isBottom) vx = clampFish(vx, -FLOOR_SPEED, FLOOR_SPEED);
    wobble = (wobble + wobbleSpeed) % (Math.PI * 2);
    const sineY = Math.sin(wobble) * (isBottom ? .002 : .012);
    x = clampFish(x + vx, bounds.left, bounds.right);
    let { targetY, targetYTimer } = f;
    if (formation && !formation.leader) {
      y += (clampFish(formation.y, yMin, yMax) - y) * .025 + sineY;
    } else if (isBottom) {
      targetYTimer = (targetYTimer ?? 0) - 1;
      if (targetY === undefined || targetYTimer <= 0 || targetY < yMin || targetY > yMax) {
        targetY = yMin + random() * (yMax - yMin);
        targetYTimer = 300 + Math.floor(random() * 600);
      }
      y += (targetY - y) * .012 + sineY;
    } else {
      y += sineY;
    }
    y = clampFish(y, yMin, yMax);
    // Use visible displacement rather than the intent to turn. During the
    // gradual reversal, the sprite must not swim backwards.
    if (x !== f.x) facingRight = x > f.x;
    if (x <= bounds.left && vx < 0) { vx = Math.abs(vx); targetVx = vx; }
    if (x >= bounds.right && vx > 0) { vx = -Math.abs(vx); targetVx = vx; }

    return { ...f, x, y, vx, targetVx, wobble, wobbleSpeed, facingRight, baseSpeed, state, stateTimer, chaseTargetId, targetY, targetYTimer, schooling, floorHomeX, floorHomeY };
  });

  const activeChasers = updated.filter(f => f.state === "chasing").length;
  if (activeChasers < 1) {
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].state !== "normal" || isBottomFish(updated[i])) continue;
      const iRarity = updated[i].starRarity ?? 1;
      if (iRarity < 3) continue;
      for (let j = 0; j < updated.length; j++) {
        if (i === j || updated[j].state !== "normal" || isBottomFish(updated[j])) continue;
        const jRarity = updated[j].starRarity ?? 1;
        if (iRarity < jRarity) continue;
        if (iRarity === jRarity && random() < 0.5) continue;
        const dx = updated[i].x - updated[j].x;
        const dy = (updated[i].y - updated[j].y) * 1.5;
        if (Math.hypot(dx, dy) < 12) {
          if (random() < 0.002) {
            const chaseTimer = 150 + Math.floor(random() * 100);
            updated[i] = { ...updated[i], schooling: false, state: "chasing", chaseTargetId: updated[j].id, stateTimer: chaseTimer };
            updated[j] = { ...updated[j], schooling: false, state: "fleeing",  chaseTargetId: updated[i].id, stateTimer: chaseTimer };
          }
          break;
        }
      }
    }
  }
  return updated;
}
