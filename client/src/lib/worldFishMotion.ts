import type { WorldSwimFish, WorldFishCatalogEntry } from "@shared/worlds/worldSwimAreas";
import { clampFish, FISH_BOTTOM_MIN, fishArtFacingScale, fishRandom, fishRarityScale, fishSchoolKey, isBottomFish } from "./fishSwimMotion";

type Point = { x: number; y: number };
type FishTrack = {
  id: string; entry: WorldFishCatalogEntry; size: number; duration: number;
  points: Point[]; facing: (1 | -1)[];
};

/** Eight intervals, with two intervals of schooling between independent trips.
 * The compositor interpolates one transform per fish, without simulation timers.
 * All waypoints are inside the authored rectangle (including the sprite size).
 */
export function planWorldFishMotion(fish: readonly WorldSwimFish[], catalog: ReadonlyMap<string, WorldFishCatalogEntry>,
  width: number, height: number, scale: number): FishTrack[] {
  if (width <= 0 || height <= 0 || scale <= 0) return [];
  const candidates = fish.flatMap(placement => {
    const entry = catalog.get(placement.fishId);
    if (!entry?.imageUrl) return [];
    const speciesKey = fishSchoolKey(entry.id, entry);
    // Floor dwellers only school with nearby fish: they should never cross
    // the rectangle just to catch up to a distant member of their species.
    const key = speciesKey && isBottomFish(entry) ? speciesKey + ":" + Math.floor(placement.x / .12) : speciesKey;
    return [{ placement, entry, key }];
  });
  const groups = new Map<string, WorldSwimFish[]>();
  for (const { placement, key } of candidates) {
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(placement);
    groups.set(key, group);
  }
  const base = Math.min(width * .28, height * .45, 100 * scale);
  return candidates.map(({ placement, entry, key }) => {
    const random = fishRandom(placement.id);
    const group = key ? groups.get(key)! : [];
    const schools = group.length > 1;
    const size = base * fishRarityScale(entry.starRarity);
    const travel = width - size, verticalTravel = height - size;
    const bottom = isBottomFish(entry);
    const point = (x: number, y: number): Point => ({
      x: clampFish(x, 0, 1) * travel,
      y: bottom
        // y is the lower edge of the sprite within the bottom 10%, not
        // its centre. Even the largest artwork stays entirely inside.
        ? clampFish(height * (FISH_BOTTOM_MIN + .10 * clampFish(y, 0, 1)) - size, 0, verticalTravel)
        : clampFish(y, 0, 1) * verticalTravel,
    });
    const start = {
      x: clampFish(placement.x * width - size / 2, 0, travel),
      y: bottom ? clampFish(placement.y * height - size, Math.max(0, height * FISH_BOTTOM_MIN - size), verticalTravel)
        : clampFish(placement.y * height - size / 2, 0, verticalTravel),
    };
    // Independent excursions alternate between different sides, depths and
    // distances. IDs yield different durations and routes, not one uniform loop.
    const rightFirst = random() < .5;
    const excursion = (right: boolean) => bottom ? {
      x: clampFish(start.x + (right ? 1 : -1) * width * (.025 + random() * .045), 0, travel),
      y: clampFish(start.y + height * (random() - .5) * .025, Math.max(0, height * FISH_BOTTOM_MIN - size), verticalTravel),
    } : point(right ? .58 + random() * .42 : random() * .42, random());
    const points = [start, excursion(rightFirst), excursion(!rightFirst), excursion(rightFirst),
      excursion(!rightFirst), excursion(rightFirst), excursion(!rightFirst), excursion(rightFirst), start];
    let duration = bottom ? 65 + random() * 20 : 68 + random() * 20;
    if (schools) {
      const schoolRandom = fishRandom(key! + ":" + group[0].id);
      duration = 70 + schoolRandom() * 18;
      const right = schoolRandom() < .5;
      const centerY = .35 + schoolRandom() * .30;
      const index = group.findIndex(f => f.id === placement.id);
      // Stagger the members, not their clocks. They swim in a loose formation
      // for the middle of the cycle, then disperse along their own routes.
      const columns = Math.min(4, group.length);
      const spacing = Math.min(.15, Math.max(.09, size / Math.max(1, travel) * .7));
      const xOffset = ((index % columns) - (columns - 1) / 2) * spacing;
      const yOffset = (Math.floor(index / columns) - (Math.ceil(group.length / columns) - 1) / 2) * .14
        + (index % 2 ? .045 : -.045);
      const groupX = right ? [.25, .50, .75] : [.75, .50, .25];
      if (bottom) {
        const center = clampFish(group.reduce((sum, f) => sum + clampFish(f.x * width - size / 2, 0, travel), 0) / group.length, 0, travel);
        const offset = ((index % columns) - (columns - 1) / 2) * Math.min(width * .025, size * .4);
        groupX.forEach((x, i) => {
          points[3 + i] = {
            x: clampFish(center + (x - .5) * width * .12 + offset, Math.max(0, start.x - width * .11), Math.min(travel, start.x + width * .11)),
            y: clampFish(start.y + height * ((index % 2 ? .005 : -.005) + (i === 1 ? -.004 : .004)), Math.max(0, height * FISH_BOTTOM_MIN - size), verticalTravel),
          };
        });
      } else {
        groupX.forEach((x, i) => { points[3 + i] = point(x + xOffset, centerY + yOffset + (i === 1 ? -.045 : .045)); });
      }
    }
    const facing = points.slice(0, -1).map((p, i) => {
      const dx = points[i + 1].x - p.x;
      // For a vertical/stationary segment preserve the previous heading.
      return fishArtFacingScale(entry.facingDirection, dx === 0 ? (i > 0 ? p.x >= points[i - 1].x : entry.facingDirection !== "left") : dx > 0);
    });
    return { id: placement.id, entry, size, duration, points, facing };
  });
}
