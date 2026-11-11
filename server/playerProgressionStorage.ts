import { and, eq } from "drizzle-orm";
import {
  playerProgression,
  playerXpReceipts,
} from "@shared/schema";
import { levelForPlayerTotalXp, type PlayerProgression } from "@shared/playerProgression";
import { db } from "./db";
import {
  executePlayerXpAward,
  type PlayerXpAward,
  type PlayerXpAwardResult,
} from "./playerXpAward";

/** Read-only account progression. No row is created by browsing a profile;
 * existing users safely show Level 1 / 0 XP until they earn a new award.
 */
export async function getPlayerProgression(userId: string): Promise<PlayerProgression | null> {
  const [row] = await db.select({
    level: playerProgression.level,
    totalXp: playerProgression.totalXp,
    stars: playerProgression.stars,
    cycleStartXp: playerProgression.cycleStartXp,
  }).from(playerProgression).where(eq(playerProgression.userId, userId)).limit(1);
  return row ? { ...row, stars: Math.max(1, row.stars ?? 1) } : null;
}

/**
 * INTERNAL ONLY. No client-supplied XP amounts or award endpoints. Call
 * awardPlayerXpInTransaction for quests/loot to commit XP and rewards together.
 * A domain event's receipt is unique per user/source/event and is serialized
 * by a per-account row lock.
 * The caller owns the existing coins/items/quest transaction.
 */
export async function awardPlayerXpInTransaction(
  tx: any,
  userId: string,
  award: PlayerXpAward,
): Promise<PlayerXpAwardResult> {
  return executePlayerXpAward(award, {
      async loadLockedProgress() {
        await tx.insert(playerProgression).values({ userId }).onConflictDoNothing();
        const [row] = await tx.select({
          level: playerProgression.level,
          totalXp: playerProgression.totalXp,
          stars: playerProgression.stars,
          cycleStartXp: playerProgression.cycleStartXp,
        }).from(playerProgression).where(eq(playerProgression.userId, userId)).for("update");
        if (!row) throw new Error("Player progression row unavailable");
        return row;
      },
      async findReceipt(source, eventId) {
        const [row] = await tx.select({
          amount: playerXpReceipts.amount,
          levelAfter: playerXpReceipts.levelAfter,
          totalXpAfter: playerXpReceipts.totalXpAfter,
        }).from(playerXpReceipts).where(and(
          eq(playerXpReceipts.userId, userId),
          eq(playerXpReceipts.source, source),
          eq(playerXpReceipts.eventId, eventId),
        )).limit(1);
        return row ?? null;
      },
      async recordReceipt(input, progress) {
        const [row] = await tx.insert(playerXpReceipts).values({
          userId,
          source: input.source,
          eventId: input.eventId,
          amount: input.amount,
          levelAfter: progress.level,
          totalXpAfter: progress.totalXp,
        }).onConflictDoNothing({
          target: [playerXpReceipts.userId, playerXpReceipts.source, playerXpReceipts.eventId],
        }).returning({ id: playerXpReceipts.id });
        return Boolean(row);
      },
      async saveProgress(progress) {
        await tx.update(playerProgression).set({
          level: progress.level,
          totalXp: progress.totalXp,
          updatedAt: new Date(),
        }).where(eq(playerProgression.userId, userId));
      },
    }, (totalXp, current) => levelForPlayerTotalXp(
      totalXp - (current.cycleStartXp ?? 0),
    ));
}

/** Standalone path for verified events without a separate reward transaction. */
export async function awardPlayerXp(userId: string, award: PlayerXpAward): Promise<PlayerXpAwardResult> {
  return db.transaction(async (tx) => awardPlayerXpInTransaction(tx, userId, award));
}
