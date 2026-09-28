import { sql } from "drizzle-orm";

export const LONELLE_KEY = (userId: string) => `quest:lonelle-lost-adornment:${userId}`;
export const LONELLE_REWARD_COINS = 300;
export const LONELLE_REQUIRED_KILLS = 5;

export type LonelleProgress = {
  status: "accepted" | "found" | "taken" | "claimed";
  kills: number;
  scarfInventoryId: string | null;
};

export function parseLonelleProgress(value: unknown): LonelleProgress | null {
  if (typeof value !== "string") return null;
  try {
    const row = JSON.parse(value);
    if (!["accepted", "found", "taken", "claimed"].includes(row.status)) return null;
    return {
      status: row.status,
      kills: Math.max(0, Math.min(LONELLE_REQUIRED_KILLS, Number(row.kills) || 0)),
      scarfInventoryId: typeof row.scarfInventoryId === "string" ? row.scarfInventoryId : null,
    };
  } catch { return null; }
}

type Executor = { execute(statement: any): Promise<{ rows: any[] }> };

export function nextLonelleDefeat(progress: LonelleProgress | null): LonelleProgress | null {
  if (!progress || progress.status !== "accepted") return null;
  const kills = Math.min(LONELLE_REQUIRED_KILLS, progress.kills + 1);
  return { ...progress, kills, status: kills === LONELLE_REQUIRED_KILLS ? "found" : "accepted" };
}

/** Called only after the Clearing has accepted and rewarded a unique regular defeat. */
export async function recordLonelleClearingDefeat(tx: Executor, userId: string): Promise<LonelleProgress | null> {
  const key = LONELLE_KEY(userId);
  const result = await tx.execute(sql`SELECT value FROM game_settings WHERE key=${key} FOR UPDATE`);
  const progress = parseLonelleProgress(result.rows[0]?.value);
  const next = nextLonelleDefeat(progress);
  if (!next) return progress;
  await tx.execute(sql`UPDATE game_settings SET value=${JSON.stringify(next)} WHERE key=${key}`);
  return next;
}
