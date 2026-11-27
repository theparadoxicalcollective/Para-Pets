/**
 * Pet Park earning intervals are calculated from server timestamps.
 * Pure functions here do not credit wallets, award XP, or modify deposits.
 * Those actions must be performed atomically in a future server transaction.
 */
export const PET_PARK_ACCRUAL_CAP_MS = 24 * 60 * 60 * 1000;
export const PET_PARK_SECOND_SLOT_PRICE = 2_500;
export const PET_PARK_THIRD_SLOT_PRICE = 5_000;
/** Existing recommended hourly rates, also used when first opening an unconfigured park. */
export const PET_PARK_BASE_REWARD_RATES = { coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 } as const;

export type PetParkAccrualState = {
  /** Beginning of the currently unclaimed earning interval. */
  checkpointMs: number;
  /** The instant the park last became unavailable, if closed. */
  pausedAtMs: number | null;
  /** Total time spent closed since the checkpoint. */
  pausedDurationMs: number;
};

/**
 * Returns the remaining eligible earning duration, capped at 24 hours.
 * The server owns all timestamps. Invalid or backwards clocks earn nothing.
 */
export function claimablePetParkDurationMs(
  state: PetParkAccrualState,
  nowMs: number,
): number {
  if (![state.checkpointMs, state.pausedDurationMs, nowMs].every(Number.isFinite) ||
      (state.pausedAtMs !== null && !Number.isFinite(state.pausedAtMs))) return 0;
  const end = Math.min(nowMs, state.pausedAtMs ?? nowMs);
  const elapsed = Math.max(0, end - state.checkpointMs - Math.max(0, state.pausedDurationMs));
  return Math.min(PET_PARK_ACCRUAL_CAP_MS, elapsed);
}

/**
 * Advance the checkpoint at claim time without restarting the deposit.
 * When closed, retain the closure timestamp so no closed time can earn XP.
 */
export function checkpointPetParkClaim(
  state: PetParkAccrualState,
  nowMs: number,
): PetParkAccrualState {
  if (!Number.isFinite(nowMs)) throw new Error("Invalid claim timestamp");
  const claimAt = Math.max(nowMs, state.checkpointMs);
  return {
    checkpointMs: claimAt,
    pausedAtMs: state.pausedAtMs === null ? null : claimAt,
    pausedDurationMs: 0,
  };
}

/** Mark park closure without destroying unclaimed rewards. */
export function pausePetParkAccrual(
  state: PetParkAccrualState,
  closedAtMs: number,
): PetParkAccrualState {
  if (!Number.isFinite(closedAtMs)) throw new Error("Invalid closure timestamp");
  if (state.pausedAtMs !== null) return state;
  return { ...state, pausedAtMs: Math.max(state.checkpointMs, closedAtMs) };
}

/** Resume from the same unclaimed checkpoint while excluding closed time. */
export function resumePetParkAccrual(
  state: PetParkAccrualState,
  reopenedAtMs: number,
): PetParkAccrualState {
  if (!Number.isFinite(reopenedAtMs)) throw new Error("Invalid reopening timestamp");
  if (state.pausedAtMs === null) return state;
  return {
    ...state,
    pausedDurationMs: state.pausedDurationMs + Math.max(0, reopenedAtMs - state.pausedAtMs),
    pausedAtMs: null,
  };
}

/**
 * Convert elapsed milliseconds into whole reward units. Caller provides
 * economy rates (units per hour); rates are deliberately not decided here.
 * Award with a server-side ledger and a single database transaction.
 */
export function petParkRewardUnits(elapsedMs: number, unitsPerHour: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(unitsPerHour) ||
      elapsedMs <= 0 || unitsPerHour <= 0) return 0;
  return Math.floor((Math.min(elapsedMs, PET_PARK_ACCRUAL_CAP_MS) / 3_600_000) * unitsPerHour);
}

export type PetParkRewardAmounts = { coins: number; essence: number; petXp: number };
export type PetParkRewardRates = { coinsPerHour: number; essencePerHour: number; petXpPerHour: number };

/** Match the existing settlement ledger, including the two-essence preset
 * and carry-over fractions. Only the new earning interval is capped at 24h.
 * No wallet/pet writes are performed here. */
export function claimablePetParkRewards(
  duration: number, settledDuration: number, claimed: PetParkRewardAmounts, rates: PetParkRewardRates,
): PetParkRewardAmounts {
  if (!(duration > 0)) return { coins: 0, essence: 0, petXp: 0 };
  const totalDuration = settledDuration + duration;
  return {
    coins: Math.max(0, Math.floor(totalDuration * rates.coinsPerHour / 3_600_000) - claimed.coins),
    essence: Math.max(0, (rates.essencePerHour === 24
      ? Math.floor(totalDuration / 300_000) * 2
      : Math.floor(totalDuration * rates.essencePerHour / 3_600_000)) - claimed.essence),
    petXp: Math.max(0, Math.floor(totalDuration * rates.petXpPerHour / 3_600_000) - claimed.petXp),
  };
}
