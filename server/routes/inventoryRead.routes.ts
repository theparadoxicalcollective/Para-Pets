import type { Express, RequestHandler } from "express";

type InventoryReadStorage = Pick<
  typeof import("../storage").storage,
  "getUserInventoryWithItems" | "updateInventoryItem" | "getAllShopItems" | "getHouseBundles"
>;

export interface InventoryReadRouteDependencies {
  storage: InventoryReadStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Authenticated player inventory read plus existing pet-care time decay and
 * fishing-pole compatibility backfill.
 *
 * This is an organization-only boundary. It preserves the existing decay
 * formulas, write-throttling behavior, response fields/defaults, and errors.
 */
export function registerInventoryReadRoutes(
  app: Express,
  { storage, isAuthenticated }: InventoryReadRouteDependencies,
): void {
  // ── Pet hunger / mood time-decay helper ────────────────────────────────────
  // Hunger drains at HUNGER_DECAY_PER_MIN regardless of placement.
  // Max hunger is always 1000 for all pets — a full bar empties in 6 hours.
  // Mood only drains when hunger falls below 50% (starvation). Battle defeats
  // drop mood by a flat amount at the defeat site; there is no time-based cap.
  const HUNGER_DECAY_PER_MIN = 1000 / 360; // 1000 pts over 360 min (6 hours)
  const MOOD_STARVE_DECAY_PER_MIN = 0.5;
  const HUNGRY_THRESHOLD_PCT = 0.5;         // <50% hunger = "hungry"
  async function applyPetTimeDecay(inv: any): Promise<{ petHunger: number; petMood: number }> {
    const maxHunger = 1000;
    // First-touch initialization: -1 means "uninitialized" — start full.
    let hunger = inv.petHunger == null || inv.petHunger < 0 ? maxHunger : inv.petHunger;
    let mood = inv.petMood == null ? 100 : inv.petMood;
    const now = Date.now();
    const last = inv.petStatsUpdatedAt ? new Date(inv.petStatsUpdatedAt).getTime() : now;
    const minutes = Math.max(0, (now - last) / 60000);
    if (minutes > 0) {
      const newHunger = Math.max(0, hunger - HUNGER_DECAY_PER_MIN * minutes);
      // Starvation drain: applies only for the portion of the elapsed
      // interval the pet was actually below the 50% hunger threshold.
      const startHungerPct = hunger / maxHunger;
      const endHungerPct = newHunger / maxHunger;
      let starveMinutes = 0;
      if (endHungerPct < HUNGRY_THRESHOLD_PCT) {
        if (startHungerPct < HUNGRY_THRESHOLD_PCT) {
          starveMinutes = minutes;
        } else if (HUNGER_DECAY_PER_MIN > 0) {
          const hungerAtThreshold = HUNGRY_THRESHOLD_PCT * maxHunger;
          const minutesToThreshold = (hunger - hungerAtThreshold) / HUNGER_DECAY_PER_MIN;
          starveMinutes = Math.max(0, minutes - minutesToThreshold);
        }
      }
      const starveDrain = MOOD_STARVE_DECAY_PER_MIN * starveMinutes;
      const newMood = Math.max(0, mood - starveDrain);
      hunger = Math.round(newHunger);
      mood = Math.round(newMood);
    }
    // Only persist when something actually changed. The previous version
    // wrote a row for every placed pet on every /api/inventory fetch (because
    // `minutes > 0` is essentially always true), which caused a write storm
    // that made the app feel like it was stalling/restarting under load.
    // We also only refresh the timestamp when at least 1 full minute has
    // passed AND values changed — small fractional minutes get rolled into
    // the next tick without a DB write.
    const changed = hunger !== inv.petHunger || mood !== inv.petMood;
    // Only persist to DB if at least 2 minutes have elapsed since the last
    // write. Rapid successive inventory fetches (e.g. every 30s from the
    // client) still get correct computed values, but don't each hammer
    // Railway with a write round-trip. The pet's displayed stats are
    // always accurate; only the persistence is rate-limited.
    if (changed && minutes >= 2) {
      await storage.updateInventoryItem(inv.id, {
        petHunger: hunger,
        petMood: mood,
        petStatsUpdatedAt: new Date(),
      } as any);
      inv.petHunger = hunger;
      inv.petMood = mood;
      inv.petStatsUpdatedAt = new Date();
    } else if (changed) {
      // Return updated values without persisting yet.
      inv.petHunger = hunger;
      inv.petMood = mood;
    }
    return { petHunger: hunger, petMood: mood };
  }

  // Render the Bag group icons using uploaded game catalog artwork, not local
  // placeholder images or assets a particular player happens to own.
  app.get("/api/inventory/group-icons", isAuthenticated, async (_req, res) => {
    try {
      const [shopItems, bundles] = await Promise.all([
        storage.getAllShopItems(),
        storage.getHouseBundles(),
      ]);
      const hasName = (name: string, target: string) =>
        name.trim().toLowerCase().includes(target);
      const seerRabbit = shopItems.find(item => item.type === "pet" && hasName(item.name, "seer rabbit"));
      const radioactiveBass = shopItems.find(item =>
        (item.type === "fish" || item.fishingType === "fish") && hasName(item.name, "radioactive bass"));
      const basicHealingPotion = shopItems.find(item =>
        item.type === "potion" && hasName(item.name, "basic healing potion"));
      const fallHome = bundles.find(bundle => hasName(bundle.name, "fall home"));
      return res.json({
        pets: seerRabbit?.hatchedImageUrl || seerRabbit?.imageUrl || null,
        fish: radioactiveBass?.imageUrl || null,
        home: fallHome?.shopImageUrl || fallHome?.bgImageUrl || null,
        items: basicHealingPotion?.imageUrl || null,
      });
    } catch {
      return res.status(500).json({ message: "Could not load inventory group artwork" });
    }
  });

  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await storage.getUserInventoryWithItems(user.id);
      const filteredRows = rows;

      // Backfill poleUsesLeft for poles that gained a use-limit after being purchased
      await Promise.all(filteredRows.map(async ({ inventory: inv, shopItem }) => {
        if (shopItem?.fishingType === "pole" && shopItem.poleMaxUses != null && inv.poleUsesLeft == null) {
          await storage.updateInventoryItem(inv.id, { poleUsesLeft: shopItem.poleMaxUses });
          inv.poleUsesLeft = shopItem.poleMaxUses;
        }
      }));

      // Apply hunger/mood time decay for every hatched pet.
      // Decay runs for all hatched pets regardless of placement status.
      await Promise.all(filteredRows.map(async ({ inventory: inv, shopItem }) => {
        if (shopItem?.type === "pet" && inv.isHatched) {
          await applyPetTimeDecay(inv);
        }
      }));

      const itemsWithDetails = filteredRows.map(({ inventory: inv, shopItem }) => ({
        id: inv.id,
        inventoryId: inv.id,
        isListed: inv.isListed,
        shopItemId: inv.shopItemId,
        acquiredAt: inv.acquiredAt,
        name: shopItem?.name || "Unknown",
        description: shopItem?.description || null,
        type: shopItem?.type || "item",
        adornmentSlot: shopItem?.adornmentSlot ?? null,
        imageUrl: shopItem?.imageUrl || null,
        worldId: shopItem?.worldId || "",
        rarity: shopItem?.rarity || null,
        starRarity: shopItem?.starRarity ?? null,
        hatchTime: shopItem?.hatchTime || null,
        eggImageUrl: shopItem?.eggImageUrl || null,
        hatchedImageUrl: shopItem?.hatchedImageUrl || null,
        statBoostType: shopItem?.statBoostType || null,
        statBoostAmount: shopItem?.statBoostAmount || null,
        specialType: shopItem?.specialType || null,
        specialAmount: shopItem?.specialAmount || null,
        healthRestored: shopItem?.healthRestored ?? null,
        manaRestored: shopItem?.manaRestored ?? null,
        petsRevived: shopItem?.petsRevived ?? null,
        petsHealed: shopItem?.petsHealed ?? null,
        petTemplateId: shopItem?.petTemplateId || null,
        canFly: (shopItem as any)?.canFly ?? false,
        petNickname: inv.petNickname || null,
        hatchStartedAt: inv.hatchStartedAt,
        isHatched: inv.isHatched,
        isEvolved: inv.isEvolved,
        petHealth: inv.petHealth,
        petAtk: inv.petAtk,
        petDef: inv.petDef,
        petLevel: inv.petLevel,
        petLevelPoints: inv.petLevelPoints,
        petFeedPoints: inv.petFeedPoints ?? 0,
        petHunger: inv.petHunger ?? -1,
        petMood: inv.petMood ?? 100,
        petLoyalty: inv.petLoyalty ?? 0,
        lastFedAt: inv.lastFedAt ?? null,
        lastPettedAt: inv.lastPettedAt ?? null,
        lastBattleDefeatAt: inv.lastBattleDefeatAt ?? null,
        facingDirection: shopItem?.facingDirection ?? null,
        giftPoints: shopItem?.giftPoints ?? null,
        petExp: shopItem?.petExp ?? null,
        petStatsUpdatedAt: inv.petStatsUpdatedAt ?? null,
        itemsUsedThisLevel: inv.itemsUsedThisLevel,
        atkBoost: shopItem?.atkBoost ?? null,
        defBoost: shopItem?.defBoost ?? null,
        healthBoost: shopItem?.healthBoost ?? null,
        specialSkill: shopItem?.specialSkill ?? null,
        specialSkillType: (shopItem as any)?.specialSkillType ?? null,
        skillDamagePercent: shopItem?.skillDamagePercent ?? null,
        skillHealPercent: (shopItem as any)?.skillHealPercent ?? null,
        skillType: (shopItem as any)?.skillType ?? null,
        skillAffects: (shopItem as any)?.skillAffects ?? null,
        fishingType: shopItem?.fishingType ?? null,
        rarityBoostPercent: shopItem?.rarityBoostPercent ?? null,
        baitRarityBoostStar: shopItem?.baitRarityBoostStar ?? null,
        baitCatchBoost: shopItem?.baitCatchBoost ?? null,
        poleMaxUses: shopItem?.poleMaxUses ?? null,
        poleUsesLeft: inv.poleUsesLeft ?? null,
        poleSlowdown3: shopItem?.poleSlowdown3 ?? null,
        poleSlowdown4: shopItem?.poleSlowdown4 ?? null,
        poleSlowdown5: shopItem?.poleSlowdown5 ?? null,
        fishSwimZone: shopItem?.fishSwimZone ?? null,
        quantity: inv.quantity ?? 1,
        xpBoostPct: (inv as any).xpBoostPct ?? null,
        xpBoostUntil: (inv as any).xpBoostUntil ?? null,
      }));
      return res.json(itemsWithDetails);
    } catch (err) {
      console.error("Get inventory error:", err);
      return res.status(500).json({ message: "Failed to get inventory" });
    }
  });
}
