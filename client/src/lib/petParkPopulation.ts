import { parkPetSeed, type ParkPoint } from "./petParkActivity";

export type ParkObstacle = { kind: "decor" | "sleep_spot" | "effect"; xPct: number; yPct: number; size: number };
export type ParkVisitor = { petInventoryId: string };

const COLUMNS = 14;
const ROWS = 18;
const LEFT = 0.09;
const RIGHT = 0.91;
const TOP = 0.25;
const BOTTOM = 0.89;
const CELLS = COLUMNS * ROWS;

function cellPosition(cell: number): ParkPoint {
  const column = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  return {
    x: LEFT + (RIGHT - LEFT) * ((column + 0.5) / COLUMNS),
    y: TOP + (BOTTOM - TOP) * ((row + 0.5) / ROWS),
  };
}

/** Exclude artwork footprints with a conservative scene-relative margin. */
function blocked(position: ParkPoint, objects: ParkObstacle[]): boolean {
  return objects.some(object => {
    if (object.kind !== "decor") return false;
    const halfWidth = Math.max(0.035, object.size / 1100 / 2 + 0.045);
    const halfHeight = Math.max(0.025, object.size / 1700 / 2 + 0.025);
    return Math.abs(position.x - object.xPct) < halfWidth &&
      Math.abs(position.y - object.yPct) < halfHeight;
  });
}

/** Deterministic hash-first occupancy. Existing visitors retain their cells
 * unless a colliding, earlier-sorted visitor or changed artwork claims them.
 * No storage writes, randomized layout, or per-viewer positions. */
export function arrangeParkVisitors(visitors: ParkVisitor[], objects: ParkObstacle[]): Map<string, ParkPoint> {
  const occupied = new Set<number>();
  const positions = new Map<string, ParkPoint>();
  const sorted = [...visitors].sort((a, b) => parkPetSeed(a.petInventoryId) - parkPetSeed(b.petInventoryId) || a.petInventoryId.localeCompare(b.petInventoryId));
  const restSpots = objects.filter(object => object.kind === "sleep_spot");
  for (const visitor of sorted) {
    const seed = parkPetSeed(visitor.petInventoryId);
    let start = seed % CELLS;
    // Resting visitors preferentially occupy the nearest free cell to an admin rest spot.
    // The shared occupancy set ensures each cell has at most one visitor.
    if (restSpots.length && seed % 5 === 0) {
      const spot = restSpots[Math.floor(seed / 5) % restSpots.length];
      // Choose a stable nearby candidate from the closest 24 available terrain cells.
      // Never select the current nearest unoccupied cell: that cascades positions
      // whenever a new visitor arrives at a rest spot.
      const nearby = Array.from({ length: CELLS }, (_, cell) => cell)
        .filter(cell => !blocked(cellPosition(cell), objects))
        .sort((left, right) => {
          const a = cellPosition(left);
          const b = cellPosition(right);
          return ((a.x - spot.xPct) ** 2 + (a.y - spot.yPct) ** 2) -
            ((b.x - spot.xPct) ** 2 + (b.y - spot.yPct) ** 2) || left - right;
        });
      if (nearby.length) start = nearby[Math.floor(seed / 5) % Math.min(24, nearby.length)];
    }
    let chosen = -1;
    for (let step = 0; step < CELLS; step++) {
      // Prime-to-grid stride avoids clustering and minimizes displacement on arrival.
      const cell = (start + step * 73) % CELLS;
      if (occupied.has(cell) || blocked(cellPosition(cell), objects)) continue;
      chosen = cell;
      break;
    }
    // Beyond capacity, reuse a deterministic cell; no visitors disappear from the roster.
    if (chosen < 0) chosen = start;
    occupied.add(chosen);
    positions.set(visitor.petInventoryId, cellPosition(chosen));
  }
  return positions;
}

export function isParkPetNearViewport(
  position: ParkPoint, sceneWidth: number, sceneHeight: number,
  cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number,
  overscan = 220,
): boolean {
  const x = position.x * sceneWidth + cameraX;
  const y = position.y * sceneHeight + cameraY;
  return x >= -overscan && x <= viewportWidth + overscan &&
    y >= -overscan && y <= viewportHeight + overscan;
}
