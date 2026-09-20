import { sql } from "drizzle-orm";
import { jansonQuestDate } from "./jansonQuestRules";

export const FISHING_ATTEMPT_TTL_MS = 2 * 60 * 1000;
export const FISH_POINTS: Readonly<Record<number, number>> = { 1: 10, 2: 12, 3: 20, 4: 25, 5: 50 };
const RARITY_WEIGHTS: Readonly<Record<number, number>> = { 1: 60, 2: 24, 3: 10, 4: 4, 5: 2 };

export type FishingRandom = () => number;
export type FishingAttemptFailure =
  | "invalid_location" | "empty_pond" | "no_pole" | "active_attempt"
  | "not_found" | "wrong_owner" | "wrong_location" | "expired"
  | "equipment_unavailable" | "invalid_completion";

export class FishingAttemptError extends Error {
  constructor(public readonly reason: FishingAttemptFailure) {
    super(reason);
  }
}

export interface FishingAttemptStarted {
  attemptId: string;
  expiresAt: string;
  presentationRarity: number;
}

export interface FishingAttemptResult {
  outcome: "caught" | "miss";
  caught: { id: string; userId: string; shopItemId: string; caughtAt: string; inAquarium: boolean; aquariumSlot: string } | null;
  fishItemId?: string;
  item?: Record<string, unknown> | null;
  reason?: "miss";
  replayed?: boolean;
  totalFishCaught?: number;
  worldId?: string | null;
}

export function normalizeFishingAttemptResult(value: unknown): FishingAttemptResult {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Stored fishing attempt result is invalid");
  const result = parsed as Partial<FishingAttemptResult>;
  const outcome = result.outcome ?? (result.caught ? "caught" : result.reason === "miss" ? "miss" : undefined);
  if (outcome !== "caught" && outcome !== "miss") throw new Error("Stored fishing attempt outcome is invalid");
  return { ...result, outcome, caught: result.caught ?? null } as FishingAttemptResult;
}

type Db = typeof import("./db").db;

function rows(result: any): any[] {
  return (result?.rows ?? result) as any[];
}

function starOf(entry: any): number {
  return Math.max(1, Math.min(5, Number.parseInt(String(entry.star_rarity ?? entry.starRarity ?? 1), 10) || 1));
}

export function selectAuthoritativeFish<T>(pond: T[], random: FishingRandom, baitBoost = 0, baitTargetStar = 0): T {
  if (pond.length === 0) throw new FishingAttemptError("empty_pond");
  if (baitBoost > 0 && baitTargetStar > 0 && random() < baitBoost / 100) {
    const targets = pond.filter(entry => starOf(entry) === baitTargetStar);
    if (targets.length) return targets[Math.floor(random() * targets.length)] ?? targets[targets.length - 1];
  }
  const counts: Record<number, number> = {};
  for (const entry of pond) counts[starOf(entry)] = (counts[starOf(entry)] ?? 0) + 1;
  const weighted = pond.map(entry => ({ entry, weight: Math.max(0.01, (RARITY_WEIGHTS[starOf(entry)] ?? 10) / counts[starOf(entry)]) }));
  let roll = random() * weighted.reduce((sum, value) => sum + value.weight, 0);
  for (const value of weighted) {
    roll -= value.weight;
    if (roll <= 0) return value.entry;
  }
  return weighted[weighted.length - 1].entry;
}

export async function startFishingAttempt(
  db: Db,
  input: { userId: string; locationId: string },
  options: { random?: FishingRandom; now?: Date; ttlMs?: number } = {},
): Promise<FishingAttemptStarted> {
  const random = options.random ?? Math.random;
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? FISHING_ATTEMPT_TTL_MS));
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId})::int, hashtext('fishing-attempt')::int)`);
    await tx.execute(sql`UPDATE fishing_attempts SET status = 'expired' WHERE user_id = ${input.userId} AND status = 'pending' AND expires_at <= NOW()`);
    const active = rows(await tx.execute(sql`SELECT id FROM fishing_attempts WHERE user_id = ${input.userId} AND status = 'pending' AND expires_at > NOW() LIMIT 1`));
    if (active.length) throw new FishingAttemptError("active_attempt");

    const locations = rows(await tx.execute(sql`SELECT id, world_id, type FROM world_locations WHERE id = ${input.locationId} LIMIT 1`));
    if (!locations[0] || locations[0].type !== "fishing") throw new FishingAttemptError("invalid_location");
    const pond = rows(await tx.execute(sql`
      SELECT pf.shop_item_id, si.star_rarity
      FROM pond_fish pf JOIN shop_items si ON si.id = pf.shop_item_id
      WHERE pf.location_id = ${input.locationId} AND si.type = 'fishing' AND si.fishing_type = 'fish'
    `));
    if (!pond.length) throw new FishingAttemptError("empty_pond");
    const equipment = rows(await tx.execute(sql`
      SELECT e.pole_inventory_id, e.bait_inventory_id,
             pole.pole_uses_left, bait.quantity AS bait_quantity,
             bait_item.rarity_boost_percent, bait_item.bait_rarity_boost_star
      FROM player_fishing_equipment e
      LEFT JOIN user_inventory pole ON pole.id = e.pole_inventory_id AND pole.user_id = e.user_id
      LEFT JOIN user_inventory bait ON bait.id = e.bait_inventory_id AND bait.user_id = e.user_id
      LEFT JOIN shop_items bait_item ON bait_item.id = bait.shop_item_id
      WHERE e.user_id = ${input.userId} LIMIT 1
    `))[0];
    if (!equipment?.pole_inventory_id || Number(equipment.pole_uses_left ?? 0) <= 0) throw new FishingAttemptError("no_pole");
    const chosen = selectAuthoritativeFish(pond, random, Number(equipment.rarity_boost_percent ?? 0), Number(equipment.bait_rarity_boost_star ?? 0));
    const catchRoll = Math.max(0, Math.min(0.999999999, random()));
    const inserted = rows(await tx.execute(sql`
      INSERT INTO fishing_attempts
        (user_id, location_id, world_id, selected_fish_id, presentation_rarity, catch_roll,
         pole_inventory_id, bait_inventory_id, expires_at, status)
      VALUES (${input.userId}, ${input.locationId}, ${locations[0].world_id}, ${chosen.shop_item_id}, ${starOf(chosen)}, ${catchRoll},
              ${equipment.pole_inventory_id}, ${equipment.bait_quantity > 0 ? equipment.bait_inventory_id : null}, ${expiresAt}, 'pending')
      RETURNING id, expires_at
    `))[0];
    return { attemptId: inserted.id, expiresAt: new Date(inserted.expires_at).toISOString(), presentationRarity: starOf(chosen) };
  });
}

export async function completeFishingAttempt(
  db: Db,
  input: { userId: string; attemptId: string; locationId: string; interactionScore: number },
): Promise<FishingAttemptResult> {
  if (!Number.isFinite(input.interactionScore) || input.interactionScore < 0 || input.interactionScore > 100) {
    throw new FishingAttemptError("invalid_completion");
  }
  return db.transaction(async tx => {
    const attempt = rows(await tx.execute(sql`SELECT *, expires_at <= NOW() AS is_expired FROM fishing_attempts WHERE id = ${input.attemptId} FOR UPDATE`))[0];
    if (!attempt) throw new FishingAttemptError("not_found");
    if (attempt.user_id !== input.userId) throw new FishingAttemptError("wrong_owner");
    if (attempt.location_id !== input.locationId) throw new FishingAttemptError("wrong_location");
    if (attempt.status === "completed" && attempt.result_json) {
      return { ...normalizeFishingAttemptResult(attempt.result_json), replayed: true };
    }
    if (attempt.status !== "pending" || attempt.is_expired) {
      if (attempt.status === "pending") await tx.execute(sql`UPDATE fishing_attempts SET status = 'expired' WHERE id = ${input.attemptId}`);
      throw new FishingAttemptError("expired");
    }

    const pole = rows(await tx.execute(sql`
      UPDATE user_inventory SET pole_uses_left = GREATEST(0, pole_uses_left - 1)
      WHERE id = ${attempt.pole_inventory_id} AND user_id = ${input.userId} AND pole_uses_left > 0
      RETURNING pole_uses_left
    `))[0];
    if (!pole) throw new FishingAttemptError("equipment_unavailable");
    if (Number(pole.pole_uses_left) === 0) {
      await tx.execute(sql`DELETE FROM user_inventory WHERE id = ${attempt.pole_inventory_id} AND user_id = ${input.userId}`);
      await tx.execute(sql`UPDATE player_fishing_equipment SET pole_inventory_id = NULL, updated_at = NOW() WHERE user_id = ${input.userId} AND pole_inventory_id = ${attempt.pole_inventory_id}`);
    }

    // Reaching 100 means the player completed the reel minigame successfully.
    // Do not roll a second hidden failure after the UI has already declared a catch.
    // Partial/legacy completion scores still use the server-side roll.
    const completedReel = input.interactionScore >= 100;
    const boundedScore = Math.min(99, Math.floor(input.interactionScore));
    const catchChance = 0.20 + (boundedScore / 100) * 0.65;
    if (!completedReel && Number(attempt.catch_roll) > catchChance) {
      const result: FishingAttemptResult = { outcome: "miss", caught: null, reason: "miss" };
      await tx.execute(sql`UPDATE fishing_attempts SET status = 'completed', completed_at = NOW(), result_json = ${JSON.stringify(result)}::jsonb WHERE id = ${input.attemptId}`);
      return result;
    }

    const fishRows = rows(await tx.execute(sql`SELECT * FROM shop_items WHERE id = ${attempt.selected_fish_id} AND type = 'fishing' AND fishing_type = 'fish' LIMIT 1`));
    const fishItem = fishRows[0];
    if (!fishItem) throw new Error("Authoritative fish is no longer available");
    const caught = rows(await tx.execute(sql`
      INSERT INTO player_fish_inventory (user_id, shop_item_id) VALUES (${input.userId}, ${attempt.selected_fish_id})
      RETURNING id, user_id, shop_item_id, caught_at, in_aquarium, aquarium_slot
    `))[0];
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId})::int, hashtext(${attempt.selected_fish_id})::int)`);
    await tx.execute(sql`
      INSERT INTO player_fish_catch_log (user_id, shop_item_id)
      SELECT ${input.userId}, ${attempt.selected_fish_id}
      WHERE NOT EXISTS (SELECT 1 FROM player_fish_catch_log WHERE user_id = ${input.userId} AND shop_item_id = ${attempt.selected_fish_id})
    `);
    const total = rows(await tx.execute(sql`UPDATE users SET total_fish_caught = total_fish_caught + 1 WHERE id = ${input.userId} RETURNING total_fish_caught`))[0];
    if (!total) throw new Error("Player fish total update failed");

    if (attempt.bait_inventory_id) {
      const bait = rows(await tx.execute(sql`
        UPDATE user_inventory SET quantity = quantity - 1
        WHERE id = ${attempt.bait_inventory_id} AND user_id = ${input.userId} AND quantity > 0 RETURNING quantity
      `))[0];
      if (!bait) throw new FishingAttemptError("equipment_unavailable");
      if (Number(bait.quantity) === 0) {
        await tx.execute(sql`DELETE FROM user_inventory WHERE id = ${attempt.bait_inventory_id} AND user_id = ${input.userId}`);
        await tx.execute(sql`UPDATE player_fishing_equipment SET bait_inventory_id = NULL, updated_at = NOW() WHERE user_id = ${input.userId} AND bait_inventory_id = ${attempt.bait_inventory_id}`);
      }
    }

    const points = FISH_POINTS[starOf(fishItem)] ?? 10;
    if (attempt.world_id) await tx.execute(sql`
      INSERT INTO fishing_leaderboard (user_id, world_id, points) VALUES (${input.userId}, ${attempt.world_id}, ${points})
      ON CONFLICT (user_id, world_id) DO UPDATE SET points = fishing_leaderboard.points + ${points}, updated_at = NOW()
    `);
    // Count only catches made after accepting Janson's one-time quest. Keep the
    // progress mutation in this transaction so a rolled-back catch never counts.
    const jansonProgress = await tx.execute(sql`
      UPDATE user_janson_quests p
      SET progress = LEAST(q.target_count, p.progress + 1),
          completed_at = CASE WHEN p.progress + 1 >= q.target_count THEN NOW() ELSE NULL END
      FROM daily_quests q
      WHERE p.user_id = ${input.userId} AND p.quest_key = 'catch_fish'
        AND p.completed_at IS NULL AND q.quest_key = 'catch_fish'
      RETURNING p.completed_at
    `);
    if ((jansonProgress.rows[0] as any)?.completed_at) await tx.execute(sql`
      INSERT INTO user_quest_log_state (user_id, has_unseen_completion)
      VALUES (${input.userId}, true)
      ON CONFLICT (user_id) DO UPDATE SET has_unseen_completion = true
    `);
    // The repeatable chapter advances only for today's accepted run. A catch
    // cannot count toward a quest the player has not taken from Janson yet.
    const dailyProgress = await tx.execute(sql`
      UPDATE user_janson_daily_quests p
      SET progress = LEAST(q.target_count, p.progress + 1),
          completed_at = CASE WHEN p.progress + 1 >= q.target_count THEN NOW() ELSE NULL END
      FROM daily_quests q
      WHERE p.user_id = ${input.userId} AND p.quest_day = ${jansonQuestDate()}::date
        AND p.completed_at IS NULL AND q.quest_key = 'catch_fish'
      RETURNING p.completed_at
    `);
    if ((dailyProgress.rows[0] as any)?.completed_at) await tx.execute(sql`
      INSERT INTO user_quest_log_state (user_id, has_unseen_completion)
      VALUES (${input.userId}, true)
      ON CONFLICT (user_id) DO UPDATE SET has_unseen_completion = true
    `);
    const result: FishingAttemptResult = {
      outcome: "caught",
      caught: { id: caught.id, userId: caught.user_id, shopItemId: caught.shop_item_id, caughtAt: caught.caught_at, inAquarium: caught.in_aquarium, aquariumSlot: caught.aquarium_slot },
      fishItemId: attempt.selected_fish_id,
      item: Object.fromEntries(Object.entries(fishItem).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value])),
      totalFishCaught: Number(total.total_fish_caught), worldId: attempt.world_id,
    };
    await tx.execute(sql`UPDATE fishing_attempts SET status = 'completed', completed_at = NOW(), result_json = ${JSON.stringify(result)}::jsonb WHERE id = ${input.attemptId}`);
    return result;
  });
}

export async function abandonFishingAttempt(db: Db, input: { userId: string; attemptId: string; locationId: string }): Promise<void> {
  await db.transaction(async tx => {
    const attempt = rows(await tx.execute(sql`SELECT user_id, location_id, status FROM fishing_attempts WHERE id = ${input.attemptId} FOR UPDATE`))[0];
    if (!attempt) return;
    if (attempt.user_id !== input.userId) throw new FishingAttemptError("wrong_owner");
    if (attempt.location_id !== input.locationId) throw new FishingAttemptError("wrong_location");
    if (attempt.status === "pending") await tx.execute(sql`UPDATE fishing_attempts SET status = 'abandoned' WHERE id = ${input.attemptId}`);
  });
}
