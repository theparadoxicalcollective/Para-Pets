import { and, desc, eq, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { petParkDeposits, petParkPresence } from "@shared/schema";
import type { db as database } from "../db";

// The budget covers only OTHER owners, in addition to the viewer's own
// equipped pets. Do not conflate public display with earning or occupancy.
export const PARK_PUBLIC_OUTDOOR_OWNER_BUDGET = 40;
export const PARK_ACTIVE_PRESENCE_MS = 15 * 60 * 1000;

/** Builds the read-only list of other owners' visible outdoor deposit IDs.
 * 1. Choose the lowest-numbered actually published outdoor slot per owner.
 * 2. If uncrowded, include recent and inactive owners alike.
 * 3. When crowded, include only park visitors active in the last 15 minutes
 *    (maximum 40, most recently present first).
 *
 * The query returns only IDs. The scene's existing public record query uses
 * them as a subquery so hidden pets' image and costume data never get sent.
 */
export function visibleOtherParkOutdoorIds(
  databaseClient: typeof database,
  viewerId: string,
  activeSince: Date,
) {
  const firstOutdoor = alias(petParkDeposits, "first_outdoor");
  const firstPublicOutdoor = databaseClient.selectDistinctOn([firstOutdoor.userId], {
    id: firstOutdoor.id,
    userId: firstOutdoor.userId,
  }).from(firstOutdoor).where(and(
    ne(firstOutdoor.userId, viewerId),
    isNull(firstOutdoor.withdrawnAt),
    eq(firstOutdoor.showInPark, true),
    isNull(firstOutdoor.buildingId),
    isNotNull(firstOutdoor.parkXPct), isNotNull(firstOutdoor.parkYPct),
  )).orderBy(firstOutdoor.userId, firstOutdoor.slotNumber,
    firstOutdoor.createdAt, firstOutdoor.id).as("first_public_outdoor");

  const rankedOutdoorOwners = databaseClient.select({
    id: firstPublicOutdoor.id,
    userId: firstPublicOutdoor.userId,
    lastSeenAt: petParkPresence.lastSeenAt,
    ownerCount: sql<number>`count(*) over ()`.as("owner_count"),
  }).from(firstPublicOutdoor)
    .leftJoin(petParkPresence, eq(petParkPresence.userId, firstPublicOutdoor.userId))
    .as("ranked_outdoor_owners");

  return databaseClient.select({ id: rankedOutdoorOwners.id })
    .from(rankedOutdoorOwners)
    .where(or(
      lte(rankedOutdoorOwners.ownerCount, PARK_PUBLIC_OUTDOOR_OWNER_BUDGET),
      gte(rankedOutdoorOwners.lastSeenAt, activeSince),
    ))
    .orderBy(desc(rankedOutdoorOwners.lastSeenAt), rankedOutdoorOwners.userId)
    .limit(PARK_PUBLIC_OUTDOOR_OWNER_BUDGET);
}
