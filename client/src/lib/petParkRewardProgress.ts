import { claimablePetParkDurationMs } from "@shared/petParkAccrual";

export type ParkRewardRate = "coins" | "essence" | "petXp";
export type ParkRewardRates = { coinsPerHour: number; essencePerHour: number; petXpPerHour: number };
export type ParkRewardTiming = {
  checkpointAt: string;
  pausedAt: string | null;
  pausedDurationMs: number;
  earnedDurationMs: number;
};

/** Matches the server's coin/XP whole-unit and 2-essence/5-minute preset.
 * The bar is a cycle toward the NEXT payout, not an arbitrary wallet target.
 * Settled duration is included so collecting cannot visually reset fractions.
 */
export function parkNextRewardProgress(
  kind: ParkRewardRate, timing: ParkRewardTiming, rates: ParkRewardRates, nowMs: number,
): { progress: number; nextUnits: number; secondsRemaining: number; paused: boolean; disabled: boolean } {
  const rate = kind === "coins" ? rates.coinsPerHour : kind === "essence" ? rates.essencePerHour : rates.petXpPerHour;
  const disabled = !(rate > 0 && Number.isFinite(rate));
  const paused = timing.pausedAt !== null;
  if (disabled) return { progress: 0, nextUnits: 0, secondsRemaining: 0, paused, disabled: true };
  const nextUnits = kind === "essence" && rate === 24 ? 2 : 1;
  const intervalMs = kind === "essence" && rate === 24 ? 300_000 : 3_600_000 / rate;
  const checkpointMs = Date.parse(timing.checkpointAt);
  const pausedAtMs = timing.pausedAt === null ? null : Date.parse(timing.pausedAt);
  const duration = claimablePetParkDurationMs({
    checkpointMs, pausedAtMs, pausedDurationMs: timing.pausedDurationMs,
  }, nowMs);
  const total = Math.max(0, Number(timing.earnedDurationMs) || 0) + duration;
  // Never represent a new cycle as empty immediately after it completes.
  const fraction = (total % intervalMs) / intervalMs;
  return {
    progress: Math.max(0, Math.min(1, fraction)),
    nextUnits, secondsRemaining: Math.max(0, Math.ceil((intervalMs - total % intervalMs) / 1000)),
    paused, disabled: false,
  };
}
