export const CLEARING_WORLD_LAYERS = { entityBase: 100, effectOffset: 1200, hud: 3000, dialog: 4000 } as const;

/** Stable vertical scene ordering: lower feet render in front of higher feet. */
export function worldYToDepth(y: number, layerOffset = 0): number {
  const normalized = Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : 0;
  return CLEARING_WORLD_LAYERS.entityBase + Math.round(normalized * 1000) + layerOffset;
}

export type WorldPosition = { x: number; y: number };
export type WorldSafeBounds = { xMin: number; xMax: number; yMin: number; yMax: number };

export function clampWorldObjectPosition(position: WorldPosition, bounds: WorldSafeBounds): WorldPosition {
  return { x: Math.max(bounds.xMin, Math.min(bounds.xMax, position.x)), y: Math.max(bounds.yMin, Math.min(bounds.yMax, position.y)) };
}

/** Keeps old persisted drops safe and separates coincident chest sprites. */
export function layoutClearingChests<T extends WorldPosition>(chests: T[]): Array<T & WorldPosition> {
  const placed: Array<T & WorldPosition> = [];
  for (const chest of chests) {
    const base = clampWorldObjectPosition(chest, { xMin: .23, xMax: .77, yMin: .16, yMax: .84 });
    let point = Math.hypot(base.x - .5, (base.y - .7) * .62) < .13
      ? clampWorldObjectPosition({x: base.x + (base.x < .5 ? -.14 : .14), y: base.y - .08}, { xMin: .23, xMax: .77, yMin: .16, yMax: .84 })
      : base;
    for (let attempt = 0; attempt < 8 && placed.some(other => Math.hypot(other.x - point.x, (other.y - point.y) * .62) < .09); attempt++) {
      const column = Math.floor(attempt / 2) + 1;
      const direction = attempt % 2 ? -1 : 1;
      point = clampWorldObjectPosition({ x: base.x + direction * column * .105, y: base.y - column * .035 }, { xMin: .23, xMax: .77, yMin: .16, yMax: .84 });
    }
    placed.push(Object.assign({}, chest, point));
  }
  return placed;
}
