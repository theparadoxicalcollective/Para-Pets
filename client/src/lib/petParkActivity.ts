/** Deterministic Pet Park layout and activity; no per-frame network messages. */
export type ParkPoint = { x: number; y: number };
export type ParkRestSpot = { xPct: number; yPct: number };

export function parkPetSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function parkPetPosition(index: number, count: number, id: string, spots: ParkRestSpot[]): ParkPoint {
  // Distribute visitors over the walkable center, not across buildings/scene edges.
  const columns = Math.max(3, Math.ceil(Math.sqrt(Math.max(1, count) * 0.7)));
  const rows = Math.max(3, Math.ceil(Math.max(1, count) / columns));
  const seed = parkPetSeed(id);
  const base = {
    x: 0.10 + 0.80 * (((index % columns) + 0.5) / columns),
    y: 0.25 + 0.61 * ((Math.floor(index / columns) + 0.5) / rows),
  };
  // Some visitors settle near admin-designated rest spots, with small stable offsets.
  if (spots.length && seed % 5 === 0) {
    const spot = spots[Math.floor(seed / 5) % spots.length];
    return {
      x: Math.max(0.08, Math.min(0.92, spot.xPct + ((seed % 7) - 3) * 0.012)),
      y: Math.max(0.24, Math.min(0.89, spot.yPct + ((seed % 11) - 5) * 0.008)),
    };
  }
  return base;
}

export function parkPetActivity(id: string): { kind: "rest" | "wander" | "idle"; delaySeconds: number; durationSeconds: number; driftX: number; driftY: number } {
  const seed = parkPetSeed(id);
  const kind = seed % 5 === 0 ? "rest" : seed % 3 === 0 ? "wander" : "idle";
  return {
    kind,
    delaySeconds: -(seed % 13),
    durationSeconds: 9 + (seed % 8),
    driftX: ((seed % 3) - 1) * 14,
    driftY: ((Math.floor(seed / 7) % 3) - 1) * 9,
  };
}
