import { claimablePetParkDurationMs, claimablePetParkRewards, type PetParkRewardAmounts, type PetParkRewardRates } from "@shared/petParkAccrual";

export type ParkRewardRate = "coins" | "essence" | "petXp";
export type ParkRewardRates = PetParkRewardRates;
import { creditablePetXp } from "@shared/petLevelXp";
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

/** Choose whichever real payout cycle is due next for the single oval preview.
 * This avoids inventing a common coin/essence/XP progress target.
 * The detailed popup continues to show all three individual cycles.
 */
export function parkSoonestRewardProgress(
  timing: ParkRewardTiming, rates: ParkRewardRates, nowMs: number,
): { kind: ParkRewardRate; progress: number; secondsRemaining: number; paused: boolean } | null {
  const kinds: ParkRewardRate[] = ["coins", "essence", "petXp"];
  const enabled = kinds.map(kind => ({ kind, result: parkNextRewardProgress(kind, timing, rates, nowMs) }))
    .filter(entry => !entry.result.disabled);
  const next = enabled.reduce<(typeof enabled)[number] | null>((best, entry) =>
    best === null || entry.result.secondsRemaining < best.result.secondsRemaining ? entry : best, null);
  return next ? { kind: next.kind, progress: next.result.progress,
    secondsRemaining: next.result.secondsRemaining, paused: next.result.paused } : null;
}

export type ParkRewardBalance = ParkRewardTiming & {
  claimedRewards?: PetParkRewardAmounts;
  petLevel: number;
  petLevelPoints?: number | null;
};

/** Private ledger totals from /scene, using the same accrual as settlement.
 * Old cached scene responses without the new fields must not guess totals. */
export function parkPendingRewardTotals(
  timing: ParkRewardBalance, rates: ParkRewardRates, nowMs: number,
): PetParkRewardAmounts | null {
  if (!timing.claimedRewards || timing.petLevelPoints === undefined) return null;
  const duration = claimablePetParkDurationMs({
    checkpointMs: Date.parse(timing.checkpointAt),
    pausedAtMs: timing.pausedAt === null ? null : Date.parse(timing.pausedAt),
    pausedDurationMs: timing.pausedDurationMs,
  }, nowMs);
  const rewards = claimablePetParkRewards(duration, Number(timing.earnedDurationMs), timing.claimedRewards, rates);
  return { ...rewards, petXp: creditablePetXp(timing.petLevel, timing.petLevelPoints ?? 0, rewards.petXp) };
}

/** Only confirmed collecting routes can produce a receipt; swaps nest it.
 * Do not turn missing/malformed response values into fake zero rewards. */
export function parkCollectedRewards(path: string, result: unknown): PetParkRewardAmounts | null {
  const match = /^\/api\/pet-park\/deposits\/[^/]+\/(claim|swap|withdraw)$/.exec(path);
  if (!match || !result || typeof result !== "object") return null;
  const response = result as Record<string, unknown>;
  const rewards = match[1] === "swap" ? response.rewards : response;
  if (!rewards || typeof rewards !== "object") return null;
  const values = rewards as Record<string, unknown>;
  const amounts = { coins: values.coins, essence: values.essence, petXp: values.petXpApplied ?? values.petXp };
  if (!Object.values(amounts).every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) return null;
  return amounts as PetParkRewardAmounts;
}
