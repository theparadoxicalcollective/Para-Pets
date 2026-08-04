export type ClearingSessionEnemy = { x?: unknown; y?: unknown; isBoss: boolean; [key: string]: unknown };

export function validClearingEnemyCoordinate(x: unknown, y: unknown) {
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && x >= .08 && x <= .92 && y >= .05 && y <= .94;
}

/** The server owns spawn coordinates. The fallback is only for malformed legacy responses. */
export function initializeClearingEnemies<T extends ClearingSessionEnemy>(source: T[], fallbackHomes: readonly { x:number; y:number }[], now: number, delays: readonly number[], visibleHeight: (boss:boolean)=>number) {
  return source.map((enemy, slot) => {
    const fallback = fallbackHomes[slot % fallbackHomes.length] ?? { x:.5, y:.6 };
    const home = validClearingEnemyCoordinate(enemy.x, enemy.y) ? { x:enemy.x as number, y:enemy.y as number } : fallback;
    return { ...enemy, engagedByPlayer:false, slot, x:home.x, y:home.y, homeX:home.x, homeY:home.y, targetX:home.x, targetY:home.y, velocityX:0, velocityY:0, visibleHalfWidth:visibleHeight(enemy.isBoss)*.4, state:"spawning" as const, facingLeft:false, nextActionAt:now+(delays[slot]??500) };
  });
}
