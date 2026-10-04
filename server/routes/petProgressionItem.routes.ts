import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { userInventory } from "@shared/schema";
import { tryConsumeOneFromInventory } from "../inventoryConsumption";
import { BEGIN_JOURNEY_TUTORIAL } from "../tutorial/config";
import { ensureEvolutionStorage } from "../petEvolution";
import { EVOLUTION_SLOT_COUNT, completelyFillCurrentEvolutionNode } from "@shared/evolution";

type PetProgressionStorage = Pick<
  typeof import("../storage").storage,
  "getInventoryItemById" | "getShopItem"
>;

type ApplyPetXp = (
  currentLevel: number,
  currentPoints: number,
  pointsToAdd: number,
) => { newLevel: number; newPoints: number };

type IncrementQuestProgress = (userId: string, questKey: string) => Promise<void>;

export interface PetProgressionItemRouteDependencies {
  storage: PetProgressionStorage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  applyPetXp: ApplyPetXp;
  incrementQuestProgress: IncrementQuestProgress;
}

/**
 * Pet progression consumable routes.
 *
 * This is an organization-only boundary. It preserves the existing power-up
 * and special-item behavior, including ownership checks, stat/level formulas,
 * inventory consumption, Begin Journey hatch-potion authorization, route order,
 * status codes, response shapes, and quest side effects.
 */
export function registerPetProgressionItemRoutes(
  app: Express,
  {
    storage,
    db,
    isAuthenticated,
    applyPetXp,
    incrementQuestProgress,
  }: PetProgressionItemRouteDependencies,
): void {
  app.post("/api/pet/:inventoryId/power-up", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }

      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      if (petInv.petLevel >= 100) {
        return res.status(400).json({ message: "Pet is at max level" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Item not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || (itemShopItem.type !== "power_up" && itemShopItem.type !== "item")) {
        return res.status(400).json({ message: "Not a usable power up" });
      }

      const boostType = itemShopItem.statBoostType;
      if (!boostType) {
        return res.status(400).json({ message: "This item has no stat boost" });
      }

      // slots per level: 1★→1/lvl, 2★→1/lvl, 3★→2/lvl, 4-5★→3/lvl
      const rawRarity = petShopItem.rarity || 1;
      const maxItemsPerLevel = rawRarity <= 2 ? 1 : rawRarity === 3 ? 2 : 3;
      const petLevel = petInv.petLevel || 1;
      const totalUsed = Math.max(0, petInv.itemsUsedThisLevel || 0);
      const totalAllowances = petLevel * maxItemsPerLevel;
      if (boostType !== "lvl" && totalUsed >= totalAllowances) {
        return res.status(400).json({ message: `No power-up slots available. Level up your pet to earn more!` });
      }

      const updates: any = { itemsUsedThisLevel: totalUsed + 1 };
      const boostAmount = itemShopItem.statBoostAmount || 10;

      if (boostType === "health") {
        updates.petHealth = (petInv.petHealth || 1000) + boostAmount;
      } else if (boostType === "atk") {
        updates.petAtk = (petInv.petAtk || 50) + boostAmount;
      } else if (boostType === "def") {
        updates.petDef = (petInv.petDef || 50) + boostAmount;
      } else if (boostType === "lvl") {
        const { newLevel, newPoints } = applyPetXp(petLevel, petInv.petLevelPoints || 0, boostAmount);
        updates.petLevelPoints = newPoints;
        if (newLevel > petLevel) {
          updates.petLevel = newLevel;
        }
      }

      const updatedPet = await db.transaction(async (tx) => {
        const [pet] = await tx
          .update(userInventory)
          .set(updates)
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
        if (!pet) throw new Error("Pet was not available for power up");
        const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
        if (!consumed) throw new Error("Power-up item is no longer available");
        return pet;
      });

      // Quest progress: use_powerup
      incrementQuestProgress(user.id, "use_powerup").catch(() => {});

      return res.json(updatedPet);
    } catch (err) {
      console.error("Power up error:", err);
      return res.status(500).json({ message: "Failed to power up pet" });
    }
  });

  app.post("/api/pet/:inventoryId/use-special", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId, tutorialFill } = req.body;

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Item not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "special") {
        return res.status(400).json({ message: "Not a special item" });
      }

      const specialType = itemShopItem.specialType;
      const specialAmount = itemShopItem.specialAmount || 10;

      if (specialType === "fill_evolution_node") {
        if (!petInv.isHatched) {
          return res.status(400).json({ message: "Pet has not hatched yet" });
        }

        await ensureEvolutionStorage();
        const evolutionProgress = await db.transaction(async (tx) => {
          await tx.execute(sql`
            INSERT INTO pet_evolution_progress(pet_inventory_id, completed_slots, current_points)
            VALUES (${petInv.id}, 0, 0)
            ON CONFLICT (pet_inventory_id) DO NOTHING
          `);

          const progressResult = await tx.execute(sql`
            SELECT completed_slots, current_points
            FROM pet_evolution_progress
            WHERE pet_inventory_id = ${petInv.id}
            FOR UPDATE
          `);
          const progress = (progressResult as any).rows?.[0] ?? (progressResult as any)?.[0];
          const completedSlots = Number(progress?.completed_slots ?? 0);

          if (completedSlots >= EVOLUTION_SLOT_COUNT) {
            const error: any = new Error("This pet's evolution track is already complete");
            error.statusCode = 409;
            throw error;
          }

          const next = completelyFillCurrentEvolutionNode(completedSlots, petShopItem.rarity);
          await tx.execute(sql`
            UPDATE pet_evolution_progress
            SET completed_slots = ${next.completedSlots},
                current_points = 0,
                updated_at = now()
            WHERE pet_inventory_id = ${petInv.id}
          `);

          const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
          if (!consumed) throw new Error("Special item is no longer available");
          return next;
        });

        return res.json({
          ...petInv,
          evolutionProgress,
        });
      } else if (specialType === "hatch_time") {
        if (petInv.isHatched) {
          return res.status(400).json({ message: "Pet is already hatched" });
        }
        // Accelerated hatch progress is RESERVED for Begin Journey. Each of
        // the three granted potions advances exactly one third of the full hatch
        // duration, so players learn the real use flow before the egg is ready.
        // It is authorized server-side (never by the client flag alone): the
        // player must have claimed tutorial potions but not yet completed the
        // quest. The client's tutorialFill is only an intent hint;
        // a spoofed flag does nothing outside the genuine tutorial window. Players
        // who have not started OR have finished the tutorial always get the
        // item's specific minute reduction below.
        let allowInstantFill = false;
        if (tutorialFill === true) {
          const trows = await db.execute(sql`SELECT tutorial_hatch_potions_claimed, tutorial_quest_completed FROM users WHERE id = ${user.id}`);
          const trow = (trows as any).rows?.[0] ?? (trows as any)?.[0];
          allowInstantFill = !!trow?.tutorial_hatch_potions_claimed && !trow?.tutorial_quest_completed;
        }
        let hatchUpdate: Record<string, any>;
        if (allowInstantFill) {
          // Tutorial only: advance one third of the configured hatch duration.
          // Three successful potion uses make the egg ready regardless of its
          // normal hatch time.
          const hatchTimeHours = (petShopItem.hatchTime ?? 24) as number;
          const tutorialStepMs = (hatchTimeHours * 3600 * 1000) / BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity;
          const currentStart = petInv.hatchStartedAt ? new Date(petInv.hatchStartedAt) : new Date();
          hatchUpdate = { hatchStartedAt: new Date(currentStart.getTime() - tutorialStepMs - 500) };
        } else {
          // NORMAL PLAY: reduce the remaining hatch time by the item's specific
          // amount (specialAmount minutes) by moving hatchStartedAt earlier —
          // it does NOT instantly finish hatching.
          const currentStart = petInv.hatchStartedAt ? new Date(petInv.hatchStartedAt) : new Date();
          hatchUpdate = { hatchStartedAt: new Date(currentStart.getTime() - specialAmount * 60 * 1000) };
        }
        const updatedPet = await db.transaction(async (tx) => {
          const [pet] = await tx
            .update(userInventory)
            .set(hatchUpdate)
            .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
            .returning();
          if (!pet) throw new Error("Pet was not available for special use");
          const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
          if (!consumed) throw new Error("Special item is no longer available");
          return pet;
        });
        return res.json(updatedPet);
      } else if (specialType === "level") {
        if (!petInv.isHatched) {
          return res.status(400).json({ message: "Pet has not hatched yet" });
        }
        const currentLevel = petInv.petLevel || 1;
        if (currentLevel >= 100) {
          return res.status(400).json({ message: "Pet is at max level" });
        }
        const { newLevel, newPoints } = applyPetXp(currentLevel, petInv.petLevelPoints || 0, specialAmount);
        const updates: any = { petLevelPoints: newPoints };
        if (newLevel !== currentLevel) {
          updates.petLevel = newLevel;
        }
        const updatedPet = await db.transaction(async (tx) => {
          const [pet] = await tx
            .update(userInventory)
            .set(updates)
            .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
            .returning();
          if (!pet) throw new Error("Pet was not available for special use");
          const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
          if (!consumed) throw new Error("Special item is no longer available");
          return pet;
        });
        return res.json(updatedPet);
      } else {
        return res.status(400).json({ message: "Unknown special type" });
      }
    } catch (err: any) {
      console.error("Use special error:", err);
      if (Number.isInteger(err?.statusCode)) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      return res.status(500).json({ message: "Failed to use special item" });
    }
  });
}
