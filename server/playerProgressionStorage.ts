import { and, eq } from "drizzle-orm";
import {
  playerProgression,
  playerXpReceipts,
} from "@shared/schema";
import type { PlayerProgression } from "@shared/playerProgression";
import { db } from "./db";
import {
  executePlayerXpAward,
  type PlayerXpAward,
  type PlayerXpAwardResult,
} from "./playerXpAward";

/** Read-only account progression. No row is created by browsing a profile;
 * existing users safely show Level 1 / 0 XP until a future approved award.
 */
export async function getPlayerProgression(userId: string): Promise<PlayerProgression | null> {
  const [row] = await db.select({
    level: playerProgression.level,
    totalXp: playerProgression.totalXp,
  }).from(playerProgression).where(eq(playerProgression.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * INTERNAL ONLY. No HTTP XP-award endpoint exists. A future trusted reward
 * handler must provide an approved level curve and a stable domain event ID,
 * and call this function within its own reward transaction if the XP award
 * must be atomic with another grant.
 *
 * This standalone transaction path is safe for events that do not also need
 * other reward writes. Before integrating currency/items, use a transaction-
 * scoped variant so their receipts and XP commit/roll back together.
 */
export async function awardPlayerXp(
  userId: string,
  award: PlayerXpAward,
  levelForTotalXp: (totalXp: number) => number,
): Promise<PlayerXpAwardResult> {
  return db.transaction(async (tx) => {
    return executePlayerXpAward(award, {
      async loadLockedProgress() {
        await tx.insert(playerProgression).values({ userId }).onConflictDoNothing();
        const [row] = await tx.select({
          level: playerProgression.level,
          totalXp: playerProgression.totalXp,
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
    }, levelForTotalXp);
  });
}
