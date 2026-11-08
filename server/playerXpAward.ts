import {
  MAX_PLAYER_TOTAL_XP,
  MAX_PLAYER_XP_AWARD,
  type PlayerProgression,
} from "@shared/playerProgression";

/**
 * Transaction-bound award orchestration. Persistence supplies a locked
 * account row and unique source-event receipts; callers must supply the
 * approved level curve before any XP sources can be enabled.
 */
export interface PlayerXpAward {
  source: string;
  eventId: string;
  amount: number;
}

export interface PlayerXpReceipt {
  amount: number;
  levelAfter: number;
  totalXpAfter: number;
}

export interface PlayerXpAwardOperations {
  /** Must lock the user's progression row before any receipt or XP writes. */
  loadLockedProgress(): Promise<PlayerProgression>;
  findReceipt(source: string, eventId: string): Promise<PlayerXpReceipt | null>;
  /** Insert a receipt with a unique (user_id, source, event_id) constraint. */
  recordReceipt(award: PlayerXpAward, progress: PlayerProgression): Promise<boolean>;
  saveProgress(progress: PlayerProgression): Promise<void>;
}

export class PlayerXpAwardError extends Error {}
export class PlayerXpReceiptConflictError extends PlayerXpAwardError {}

export type PlayerXpAwardResult =
  | { status: "applied"; progress: PlayerProgression }
  | { status: "duplicate"; progress: PlayerProgression };

export function validatePlayerXpAward(award: PlayerXpAward): PlayerXpAward {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(award.source)) {
    throw new PlayerXpAwardError("Invalid player XP source");
  }
  if (typeof award.eventId !== "string" ||
      !award.eventId.trim() ||
      award.eventId.length > 160 ||
      award.eventId !== award.eventId.trim()) {
    throw new PlayerXpAwardError("Invalid player XP event identifier");
  }
  if (!Number.isSafeInteger(award.amount) || award.amount <= 0 ||
      award.amount > MAX_PLAYER_XP_AWARD) {
    throw new PlayerXpAwardError("Invalid player XP amount");
  }
  return award;
}

export async function executePlayerXpAward(
  award: PlayerXpAward,
  operations: PlayerXpAwardOperations,
  levelForTotalXp: (totalXp: number) => number,
): Promise<PlayerXpAwardResult> {
  validatePlayerXpAward(award);
  const current = await operations.loadLockedProgress();
  const previousReceipt = await operations.findReceipt(award.source, award.eventId);
  if (previousReceipt) {
    if (previousReceipt.amount !== award.amount)
      throw new PlayerXpReceiptConflictError("This XP event was already awarded with a different amount");
    return { status: "duplicate", progress: {
      level: previousReceipt.levelAfter, totalXp: previousReceipt.totalXpAfter,
    } };
  }

  if (current.totalXp > MAX_PLAYER_TOTAL_XP - award.amount) {
    throw new PlayerXpAwardError("Player XP total would exceed storage limit");
  }
  const totalXp = current.totalXp + award.amount;
  const level = levelForTotalXp(totalXp);
  if (!Number.isSafeInteger(level) || level < current.level || level < 1) {
    throw new PlayerXpAwardError("Player XP level policy must be valid and monotonic");
  }
  const next: PlayerProgression = { level, totalXp };

  // Receipt and balance must be committed in the SAME transaction. If another
  // writer claimed this event first, never grant the XP a second time.
  const inserted = await operations.recordReceipt(award, next);
  if (!inserted) {
    const prior = await operations.findReceipt(award.source, award.eventId);
    if (!prior) throw new PlayerXpAwardError("XP receipt conflicted without a readable record");
    if (prior.amount !== award.amount)
      throw new PlayerXpReceiptConflictError("This XP event was already awarded with a different amount");
    return { status: "duplicate", progress: {
      level: prior.levelAfter, totalXp: prior.totalXpAfter,
    } };
  }
  await operations.saveProgress(next);
  return { status: "applied", progress: next };
}
