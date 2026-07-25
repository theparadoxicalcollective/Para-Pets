import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { FishingAttemptError, abandonFishingAttempt, completeFishingAttempt, startFishingAttempt } from "../fishingAttempt";

const FISH_CATCH_REWARD_COINS = 10;

export interface FishingRouteDependencies {
  storage: typeof import("../storage").storage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
  processFishPartImage(imageBuffer: Buffer): Promise<Buffer>;
  executeFishCatchRewardClaim: typeof import("../fishCatchRewardClaim").executeFishCatchRewardClaim;
  sellFish: typeof import("../fishSale").sellFish;
  getFishSaleErrorReason(error: unknown): import("../fishSale").FishSaleFailure | null;
  incrementQuestProgress(userId: string, questKey: string): Promise<void>;
  maybeAwardFisherBadges(userId: string, totalCaught: number): Promise<void>;
  maybeAwardFishBookBadge(userId: string, biomeWorldId: string): Promise<void>;
}

export function registerFishingRoutes(app: Express, deps: FishingRouteDependencies): void {
  const {
    storage,
    db,
    isAuthenticated,
    processFishPartImage,
    executeFishCatchRewardClaim,
    sellFish,
    getFishSaleErrorReason,
    incrementQuestProgress,
    maybeAwardFisherBadges,
    maybeAwardFishBookBadge,
  } = deps;
  app.get("/api/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const parts = await storage.getFishTemplateParts((req.params.fishItemId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const parts = await storage.getFishTemplateParts((req.params.fishItemId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const ALLOWED_FISH_PART_TYPES = new Set([
    // ── Standard fish layer set ─────────────────────────────────────────
    "body", "tail", "top_fin", "side_fin", "accessory",
    "bottom_fin_1", "bottom_fin_2", "head", "head_accessory",
    // Legacy types kept for backwards compatibility with previously
    // uploaded fish parts (head_fin → head_accessory rename, single
    // bottom_fin → bottom_fin_1/_2 split). Existing parts continue to
    // load and animate; new uploads should use the new keys.
    "head_fin", "bottom_fin",
    // ── Sea Animal extended layer set ───────────────────────────────────
    // Picked when the parent fish item has isSeaAnimal=true. eyes_open
    // doubles for blink (hide to "close"). Tail_1/2/3 are independent
    // tail segments (e.g. seahorse curl, octopus tentacles).
    "eyes_open", "front_arm", "front_leg", "back_arm", "back_leg",
    "back_accessory", "tail_1", "tail_2", "tail_3",
  ]);
  const ALLOWED_EQUIP_SLOTS = new Set(["pole", "bait"]);

  app.post("/api/admin/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { partType, imageData, posX, posY, width, height, zIndex } = req.body;
      if (!partType || !imageData) return res.status(400).json({ message: "Missing fields" });
      if (!ALLOWED_FISH_PART_TYPES.has(partType)) {
        return res.status(400).json({ message: `Invalid partType. Allowed: ${Array.from(ALLOWED_FISH_PART_TYPES).join(", ")}` });
      }
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await processFishPartImage(imageBuffer);
      const imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      const part = await storage.createFishTemplatePart({
        fishItemId: (req.params.fishItemId as string),
        partType,
        imageUrl,
        posX: posX ?? 100,
        posY: posY ?? 100,
        width: width ?? 200,
        height: height ?? 200,
        zIndex: zIndex ?? 1,
      });
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/fish-parts/:partId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const part = await storage.updateFishTemplatePart((req.params.partId as string), req.body);
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-parts/:partId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFishTemplatePart((req.params.partId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const fish = await storage.getPondFish((req.params.locationId as string));
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const location = await storage.getWorldLocation((req.params.locationId as string));
      if (!location || location.type !== "fishing") return res.status(400).json({ message: "Location must be a fishing-type location" });
      const fishItem = await storage.getShopItem(shopItemId);
      if (!fishItem || fishItem.type !== "fishing" || fishItem.fishingType !== "fish") {
        return res.status(400).json({ message: "Item must be a fish-type fishing item" });
      }
      const entry = await storage.addFishToPond((req.params.locationId as string), shopItemId);
      return res.json(entry);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/pond-fish/:shopItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.removeFishFromPond((req.params.locationId as string), (req.params.shopItemId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/all-fish", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getAllShopItems();
      const fish = items.filter((i: any) => i.type === "fishing" && i.fishingType === "fish");
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/fish-by-world", isAuthenticated, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ON (w.id, si.id)
          w.id   AS world_id,
          w.name AS world_name,
          si.id  AS fish_id,
          si.name AS fish_name,
          si.image_url AS image_url,
          si.star_rarity AS star_rarity
        FROM pond_fish pf
        JOIN world_locations wl ON wl.id = pf.location_id
        JOIN worlds w ON w.id = wl.world_id
        JOIN shop_items si ON si.id = pf.shop_item_id
        WHERE si.type = 'fishing' AND si.fishing_type = 'fish'
        ORDER BY w.id, si.id, w.name
      `);
      const rows = (result as any).rows as any[];
      const grouped = new Map<string, { worldId: string; worldName: string; fish: any[] }>();
      for (const r of rows) {
        let g = grouped.get(r.world_id);
        if (!g) {
          g = { worldId: r.world_id, worldName: r.world_name, fish: [] };
          grouped.set(r.world_id, g);
        }
        g.fish.push({
          id: r.fish_id,
          name: r.fish_name,
          imageUrl: r.image_url,
          starRarity: r.star_rarity,
        });
      }
      const out = Array.from(grouped.values()).map(g => ({
        ...g,
        fish: g.fish.sort((a, b) => (a.starRarity ?? 1) - (b.starRarity ?? 1) || a.name.localeCompare(b.name)),
      })).sort((a, b) => a.worldName.localeCompare(b.worldName));
      return res.json(out);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/caught-fish-ids", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const log = await storage.getPlayerCaughtFishLog(user.id);
      return res.json(log);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/claim-catch-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const result = await db.transaction(async (tx) => {
        // The pair lock also serializes historic duplicate rows and an absent-row
        // check, neither of which can be protected by a missing unique constraint.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id}), hashtext(${shopItemId}))`);

        let lockedRows: { id: string; reward_claimed: boolean }[] = [];
        let updatedCoins: number | null = null;
        const claim = await executeFishCatchRewardClaim({
          state: async () => {
            const result = await tx.execute(sql`
              SELECT id, reward_claimed
              FROM player_fish_catch_log
              WHERE user_id = ${user.id} AND shop_item_id = ${shopItemId}
              FOR UPDATE
            `);
            lockedRows = result.rows as { id: string; reward_claimed: boolean }[];
            if (lockedRows.length === 0) return "not-caught";
            return lockedRows.some(row => row.reward_claimed) ? "already-claimed" : "ready";
          },
          grantCoins: async () => {
            const result = await tx.execute(sql`
              UPDATE users
              SET coins = GREATEST(0, coins + ${FISH_CATCH_REWARD_COINS}),
                  total_coins_earned = total_coins_earned + ${FISH_CATCH_REWARD_COINS}
              WHERE id = ${user.id}
              RETURNING coins
            `);
            const row = result.rows[0] as { coins: number } | undefined;
            if (!row) throw new Error("User not found");
            updatedCoins = row.coins;
          },
          claimCatchLogRows: async () => {
            const result = await tx.execute(sql`
              UPDATE player_fish_catch_log
              SET reward_claimed = true
              WHERE user_id = ${user.id}
                AND shop_item_id = ${shopItemId}
                AND reward_claimed = false
              RETURNING id
            `);
            if (result.rows.length !== lockedRows.length) {
              throw new Error("Fish catch reward claim was not recorded");
            }
          },
        });
        if (claim === "success" && updatedCoins === null) throw new Error("User not found");
        return { claim, coins: updatedCoins };
      });
      if (result.claim !== "success") return res.status(400).json({ message: "Reward already claimed or fish not caught" });
      return res.json({ ok: true, coins: result.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const fish = await storage.getPondFish((req.params.locationId as string));
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/equipment", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const equipment = await storage.getPlayerFishingEquipment(user.id);
      let poleItem = null;
      let baitItem = null;
      let poleUsesLeft: number | null = null;
      if (equipment?.poleInventoryId) {
        const inv = await storage.getInventoryItemById(equipment.poleInventoryId);
        if (inv) {
          poleItem = await storage.getShopItem(inv.shopItemId);
          poleUsesLeft = inv.poleUsesLeft ?? null;
        }
      }
      if (equipment?.baitInventoryId) {
        const inv = await storage.getInventoryItemById(equipment.baitInventoryId);
        if (inv) baitItem = await storage.getShopItem(inv.shopItemId);
      }
      return res.json({ equipment, poleItem, baitItem, poleUsesLeft });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/equip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId, slot } = req.body;
      if (!inventoryId || !slot) return res.status(400).json({ message: "inventoryId and slot (pole|bait) required" });
      if (!ALLOWED_EQUIP_SLOTS.has(slot)) return res.status(400).json({ message: `Invalid slot. Allowed: ${Array.from(ALLOWED_EQUIP_SLOTS).join(", ")}` });
      const inv = await storage.getInventoryItemById(inventoryId);
      if (!inv || inv.userId !== user.id) return res.status(404).json({ message: "Inventory item not found" });
      const item = await storage.getShopItem(inv.shopItemId);
      if (!item || item.type !== "fishing") return res.status(400).json({ message: "Not a fishing item" });
      if (slot === "pole" && item.fishingType !== "pole") return res.status(400).json({ message: "Item is not a fishing pole" });
      if (slot === "bait" && item.fishingType !== "bait") return res.status(400).json({ message: "Item is not bait" });
      const data = slot === "pole"
        ? { poleInventoryId: inventoryId }
        : { baitInventoryId: inventoryId };
      const equipment = await storage.upsertPlayerFishingEquipment(user.id, data);
      return res.json({ ok: true, equipment });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/unequip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { slot } = req.body;
      if (!slot) return res.status(400).json({ message: "slot (pole|bait) required" });
      if (!ALLOWED_EQUIP_SLOTS.has(slot)) return res.status(400).json({ message: `Invalid slot. Allowed: ${Array.from(ALLOWED_EQUIP_SLOTS).join(", ")}` });
      const data = slot === "pole" ? { poleInventoryId: null } : { baitInventoryId: null };
      const equipment = await storage.upsertPlayerFishingEquipment(user.id, data);
      return res.json({ ok: true, equipment });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/inventory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fish = await storage.getPlayerFishInventory(user.id);
      const uniqueShopItemIds = [...new Set(fish.map(f => f.shopItemId))];
      const partsMap = new Map<string, boolean>();
      await Promise.all(uniqueShopItemIds.map(async (id) => {
        const parts = await storage.getFishTemplateParts(id);
        partsMap.set(id, parts.length > 0);
      }));
      const result = fish.map(f => ({
        ...f,
        item: f.item ? { ...f.item, hasParts: partsMap.get(f.shopItemId) ?? false } : null,
      }));
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });


  app.post("/api/fishing/attempts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { locationId } = req.body ?? {};
      if (!locationId) return res.status(400).json({ message: "locationId required" });
      return res.status(201).json(await startFishingAttempt(db, { userId: user.id, locationId: String(locationId) }));
    } catch (err: any) {
      if (err instanceof FishingAttemptError) {
        const status = err.reason === "active_attempt" ? 409 : err.reason === "no_pole" ? 422 : 400;
        return res.status(status).json({ message: err.message, reason: err.reason });
      }
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/attempts/:attemptId/complete", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const keys = Object.keys(req.body ?? {});
      if (keys.some(key => !["locationId", "interactionScore"].includes(key))) return res.status(400).json({ message: "Invalid completion payload", reason: "invalid_completion" });
      const { locationId, interactionScore } = req.body ?? {};
      if (!locationId || typeof interactionScore !== "number") return res.status(400).json({ message: "locationId and interactionScore required", reason: "invalid_completion" });
      const result = await completeFishingAttempt(db, { userId: user.id, attemptId: String(req.params.attemptId), locationId: String(locationId), interactionScore });
      if (result.caught && !result.replayed) {
        maybeAwardFisherBadges(user.id, result.totalFishCaught ?? 0).catch(() => {});
        if (result.worldId) maybeAwardFishBookBadge(user.id, result.worldId).catch(() => {});
      }
      return res.json(result);
    } catch (err: any) {
      if (err instanceof FishingAttemptError) {
        const status = err.reason === "wrong_owner" ? 403 : err.reason === "not_found" ? 404 : err.reason === "expired" ? 410 : err.reason === "wrong_location" || err.reason === "equipment_unavailable" ? 409 : 400;
        return res.status(status).json({ message: err.message, reason: err.reason });
      }
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/attempts/:attemptId/abandon", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (typeof req.body?.locationId !== "string") return res.status(400).json({ message: "locationId required" });
      await abandonFishingAttempt(db, { userId: user.id, attemptId: String(req.params.attemptId), locationId: req.body.locationId });
      return res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof FishingAttemptError) return res.status(err.reason === "wrong_owner" ? 403 : 409).json({ message: err.message, reason: err.reason });
      return res.status(500).json({ message: err.message });
    }
  });

  // Fishing leaderboard — per-world ranking by fishing points. Only counts
  // catches made after this feature shipped (the table starts empty).
  app.get("/api/fishing/leaderboard/:worldId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const worldId = String(req.params.worldId);
      const top = await storage.getFishingLeaderboard(worldId, 20);
      const me = await storage.getPlayerFishingRank(user.id, worldId);
      return res.json({ top, me });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

}

export function registerFishingAquariumRoutes(app: Express, deps: FishingRouteDependencies): void {
  const {
    storage,
    isAuthenticated,
    sellFish,
    getFishSaleErrorReason,
  } = deps;

  // Fish barrel routes
  app.get("/api/world/:worldId/fish-barrel", isAuthenticated, async (req, res) => {
    try {
      const barrel = await storage.getFishBarrelByWorld((req.params.worldId as string));
      return res.json(barrel || null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/fish-barrel/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { posX, posY, size } = req.body;
      const barrel = await storage.updateFishBarrel((req.params.id as string), { posX, posY, size });
      return res.json(barrel);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-barrel/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await storage.deleteFishBarrel((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Sync aquarium fish — marks exactly `count` fish per shopItemId as inAquarium
  app.post("/api/fishing/aquarium/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { counts } = req.body;
      console.log(`[AQ-SYNC] user=${user.id} counts=${JSON.stringify(counts)}`);
      if (!Array.isArray(counts)) return res.status(400).json({ message: "counts array required" });
      await storage.syncAquariumFish(user.id, counts);
      console.log(`[AQ-SYNC] success for user=${user.id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error(`[AQ-SYNC] error:`, err.message);
      return res.status(500).json({ message: err.message });
    }
  });

  // Add one fish to aquarium (atomic, no race conditions)
  app.post("/api/fishing/aquarium/add", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId, slot } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const fishId = await storage.addFishToAquarium(user.id, shopItemId, slot ?? "main");
      if (!fishId) return res.status(400).json({ message: "No available fish of this type" });
      return res.json({ ok: true, fishId });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Remove one fish from aquarium (atomic, no race conditions)
  app.post("/api/fishing/aquarium/remove", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId, slot } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const removed = await storage.removeFishFromAquarium(user.id, shopItemId, slot ?? "main");
      if (!removed) return res.status(400).json({ message: "No fish of this type in aquarium" });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Get aquarium unlocks for the current user
  app.get("/api/aquarium/unlocks", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const unlocks = await storage.getAquariumUnlocks(user.id);
      return res.json({ unlocks });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Purchase an aquarium unlock
  const AQUARIUM_PRICES: Record<string, number> = { bayou: 20000, volcanic: 25000 };
  app.post("/api/aquarium/unlock", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { aquariumId } = req.body;
      if (!aquariumId || !AQUARIUM_PRICES[aquariumId]) {
        return res.status(400).json({ message: "Invalid aquarium ID" });
      }
      const price = AQUARIUM_PRICES[aquariumId];
      // Check not already unlocked
      const existing = await storage.getAquariumUnlocks(user.id);
      if (existing.includes(aquariumId)) {
        return res.status(400).json({ message: "Already unlocked" });
      }
      // Atomic coin deduction — returns null if insufficient funds
      const updated = await storage.atomicDeductCoins(user.id, price);
      if (!updated) {
        return res.status(400).json({ message: "Not enough coins" });
      }
      await storage.unlockAquarium(user.id, aquariumId);
      return res.json({ ok: true, coinsRemaining: updated.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Sell fish
  app.post("/api/fishing/sell", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { fishIds } = req.body;
      if (!Array.isArray(fishIds) || fishIds.length === 0 || fishIds.some(id => typeof id !== "string" || id.length === 0)) {
        return res.status(400).json({ message: "fishIds array required" });
      }
      if (new Set(fishIds).size !== fishIds.length) {
        return res.status(400).json({ message: "Each fish inventory ID may only be sold once" });
      }
      return res.json(await sellFish(user.id, fishIds));
    } catch (err: any) {
      const saleErrorReason = getFishSaleErrorReason(err);
      if (saleErrorReason) {
        if (saleErrorReason === "fish-unavailable") {
          return res.status(409).json({ message: "Fish is unavailable for sale" });
        }
        return res.status(404).json({ message: "Fish not found" });
      }
      return res.status(500).json({ message: err.message });
    }
  });

}
