import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { userInventory } from "@shared/schema";
import { tryConsumeInventoryQuantity } from "../inventoryConsumption";

type PetCareStorage = Pick<
  typeof import("../storage").storage,
  | "getPetPettingState"
  | "getInventoryItemById"
  | "updateInventoryItem"
  | "addCoins"
  | "setPetPettingState"
  | "getUser"
  | "getShopItem"
>;

type ApplyPetXp = (
  currentLevel: number,
  currentPoints: number,
  pointsToAdd: number,
) => { newLevel: number; newPoints: number };

type IncrementQuestProgress = (userId: string, questKey: string) => Promise<void>;

export interface PetCareRouteDependencies {
  storage: PetCareStorage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  applyPetXp: ApplyPetXp;
  incrementQuestProgress: IncrementQuestProgress;
}

// After a PvP or cave battle defeat, the pet's mood is temporarily capped.
// These are the existing Pet Care values moved with the only routes that use them.
const BATTLE_DEFEAT_RECENT_MINUTES = 60;
const BATTLE_DEFEAT_MOOD_CAP = 70;

/**
 * Petting reward route. Kept as a separate registration function so its
 * original position before Molten Blocks remains unchanged.
 */
export function registerPetPettingRewardRoute(
  app: Express,
  { storage, isAuthenticated }: PetCareRouteDependencies,
): void {
  // Per-pet petting reward. Counters live on the inventory row so each of the
  // player's pets has its own daily allotment: the first successful petting
  // circle on each pet (per UTC day) always grants 10 coins; up to 4 extra
  // rewards (3-5 coins each, ~30% chance) may follow on that same pet.
  app.post("/api/pets/:inventoryId/petting-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const inventoryId = String(req.params.inventoryId || "");
      if (!inventoryId) return res.status(400).json({ message: "inventoryId required" });

      const state = await storage.getPetPettingState(user.id, inventoryId);
      if (!state) return res.status(404).json({ message: "Pet not found" });

      // First 3 pettings per hour give a small mood boost (deterministic,
      // no hunger gate). The timestamp is always recorded so the neglect-decay
      // clock resets on every pet regardless of whether mood changed.
      let moodGained = 0;
      let pettingsThisHour = 0;
      const pettedPet = await storage.getInventoryItemById(inventoryId);
      if (pettedPet && pettedPet.userId === user.id) {
        const nowMs = Date.now();
        const MOOD_PETTING_WINDOW_MS = 60 * 60 * 1000;
        const MOOD_PETTING_MAX_PER_WINDOW = 3;
        const MOOD_PETTING_GAIN = 3;
        const wsRaw = (pettedPet as any).moodPettingWindowStart;
        const ws = wsRaw ? new Date(wsRaw).getTime() : 0;
        const cnt = (pettedPet as any).moodPettingCount ?? 0;
        const windowExpired = !ws || (nowMs - ws) > MOOD_PETTING_WINDOW_MS;
        const newWs = windowExpired ? nowMs : ws;
        const newCnt = windowExpired ? 1 : cnt + 1;
        const allowMoodGain = newCnt <= MOOD_PETTING_MAX_PER_WINDOW;
        moodGained = allowMoodGain ? MOOD_PETTING_GAIN : 0;
        pettingsThisHour = Math.min(newCnt, MOOD_PETTING_MAX_PER_WINDOW);
        let newMood = Math.min(100, (pettedPet.petMood ?? 100) + moodGained);
        if (pettedPet.lastBattleDefeatAt) {
          const sinceDefeatMin = (nowMs - new Date(pettedPet.lastBattleDefeatAt).getTime()) / 60000;
          if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
            newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
          }
        }
        await storage.updateInventoryItem(inventoryId, {
          petMood: newMood,
          lastPettedAt: new Date(nowMs),
          petStatsUpdatedAt: new Date(nowMs),
          moodPettingWindowStart: new Date(newWs),
          moodPettingCount: Math.min(newCnt, MOOD_PETTING_MAX_PER_WINDOW),
        } as any);
      }

      const now = new Date();
      const last = state.lastPettingRewardAt;
      const sameDay = !!last
        && last.getUTCFullYear() === now.getUTCFullYear()
        && last.getUTCMonth() === now.getUTCMonth()
        && last.getUTCDate() === now.getUTCDate();

      // Roll over to a fresh day's allotment whenever the UTC day changes.
      const countSoFar = sameDay ? (state.pettingRewardsToday ?? 0) : 0;

      const MAX_REWARDS_PER_DAY = 5;        // 1 guaranteed + 4 randomized
      const EXTRA_REWARD_CHANCE = 0.30;     // ~30% per attempt after the first

      // First petting of the day for this pet → guaranteed 10 coins.
      if (countSoFar === 0) {
        const updated = await storage.addCoins(user.id, 10);
        await storage.setPetPettingState(user.id, inventoryId, now, 1);
        return res.json({ rewarded: true, coins: updated.coins, amount: 10, moodGained, pettingsThisHour });
      }

      // Pet has already given its daily max → animation only.
      if (countSoFar >= MAX_REWARDS_PER_DAY) {
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0, moodGained, pettingsThisHour });
      }

      // Random chance for each extra reward beyond the first.
      if (Math.random() > EXTRA_REWARD_CHANCE) {
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0, moodGained, pettingsThisHour });
      }

      const amount = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
      const updated = await storage.addCoins(user.id, amount);
      await storage.setPetPettingState(user.id, inventoryId, now, countSoFar + 1);
      return res.json({ rewarded: true, coins: updated.coins, amount, moodGained, pettingsThisHour });
    } catch (err) {
      console.error("Petting reward error:", err);
      return res.status(500).json({ message: "Failed to grant petting reward" });
    }
  });
}

/**
 * Edible feeding route. Kept as a separate registration function so Molten
 * Blocks remains registered between petting and feeding exactly as before.
 */
export function registerPetFeedingRoute(
  app: Express,
  {
    storage,
    db,
    isAuthenticated,
    applyPetXp,
    incrementQuestProgress,
  }: PetCareRouteDependencies,
): void {
  app.post("/api/pet/:inventoryId/feed-edible", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId, quantity: rawQuantity } = req.body;
      if (typeof itemInventoryId !== "string" || !itemInventoryId) {
        return res.status(400).json({ message: "itemInventoryId required" });
      }
      const quantity = rawQuantity == null ? 1 : Number(rawQuantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Quantity must be a positive integer" });
      }

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Edible not found in inventory" });
      }
      const availableQty = itemInv.quantity ?? 0;
      if (availableQty <= 0) {
        return res.status(409).json({ message: "Edible has already been consumed" });
      }
      if (quantity > availableQty) {
        return res.status(400).json({ message: "Not enough items in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "edibles") {
        return res.status(400).json({ message: "Not an edible item" });
      }

      // Edibles grant "feed points" (lifetime tally) AND restore the pet's
      // hunger meter by the same amount, capped at the pet's HP. Mood gets a
      // small immediate bump too, since the pet is happy after eating.
      const feedPointsPerUnit = itemShopItem.statBoostAmount || 5;
      const totalFeedPoints = feedPointsPerUnit * quantity;
      const maxHunger = 1000;
      const currentHunger = petInv.petHunger == null || petInv.petHunger < 0 ? maxHunger : petInv.petHunger;
      const newHunger = Math.min(maxHunger, currentHunger + totalFeedPoints);
      // Mood gain on feed is small overall, and even smaller when the pet was
      // already too hungry to enjoy the meal. This keeps the mood bar harder
      // to fill — feeding alone can't max it out.
      const wasHungry = (currentHunger / maxHunger) < 0.5;
      const moodGain = wasHungry ? 1 : 3;
      let newMood = Math.min(100, (petInv.petMood ?? 100) + moodGain);
      // Recent battle defeats cap how high mood can rise.
      if (petInv.lastBattleDefeatAt) {
        const sinceDefeatMin = (Date.now() - new Date(petInv.lastBattleDefeatAt).getTime()) / 60000;
        if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
          newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
        }
      }
      const updates: any = {
        petFeedPoints: (petInv.petFeedPoints || 0) + totalFeedPoints,
        petHunger: newHunger,
        petMood: newMood,
        petStatsUpdatedAt: new Date(),
        lastFedAt: new Date(),
      };

      const expAdded = Math.max(0, itemShopItem.petExp ?? 0) * quantity;
      const updatedPet = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT pet_level, pet_level_points FROM user_inventory
          WHERE id = ${petInv.id} AND user_id = ${user.id} FOR UPDATE`);
        const current = locked.rows[0];
        if (!current) throw new Error("Pet was not available for feeding");
        if (expAdded > 0) {
          const { newLevel, newPoints } = applyPetXp(Number(current.pet_level), Number(current.pet_level_points), expAdded);
          updates.petLevel = newLevel;
          updates.petLevelPoints = newPoints;
        }
        const [pet] = await tx.update(userInventory)
          .set(updates)
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
        if (!pet) throw new Error("Pet was not available for feeding");
        if (!await tryConsumeInventoryQuantity(tx, user.id, itemInv.id, quantity)) {
          throw new Error("Edible is no longer available");
        }
        return pet;
      });
      // Quest progress: feed_pet
      incrementQuestProgress(user.id, "feed_pet").catch(() => {});
      return res.json({ ...updatedPet, totalFeedPoints, expAdded });
    } catch (err) {
      console.error("Feed edible error:", err);
      if (err instanceof Error && err.message === "Edible is no longer available") {
        return res.status(409).json({ message: "Edible has already been consumed" });
      }
      return res.status(500).json({ message: "Failed to feed edible" });
    }
  });
}
