/** Rest interactions use saved park-world coordinates, not the device viewport. */
export interface ParkSleepArea {
  kind: "decor" | "sleep_spot" | "effect" | "terrain";
  effectType?: string | null;
  xPct: number;
  yPct: number;
  size: number;
}

export function isParkSleepPosition(
  position: { x: number; y: number },
  items: readonly ParkSleepArea[],
  world: { width: number; height: number },
): boolean {
  if (!(world.width > 0 && world.height > 0)) return false;
  return items.some(item => {
    if (item.kind !== "sleep_spot" && !(item.kind === "effect" && item.effectType === "sleep")) return false;
    if (!Number.isFinite(item.size) || item.size <= 0) return false;
    const half = item.size / 2;
    return Math.abs((position.x - item.xPct) * world.width) <= half &&
      Math.abs((position.y - item.yPct) * world.height) <= half;
  });
}
