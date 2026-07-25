import type { Express, RequestHandler } from "express";
import { MarketplaceError } from "../marketplace/transactions";

type MarketplaceStorage = Pick<typeof import("../storage").storage,
  | "buyMarketSlot"
  | "getInventoryItemById"
  | "getMarketListing"
  | "getMarketListings"
  | "getMyMarketListings"
  | "getShopItem"
>;

type MarketplaceTransactions = typeof import("../marketplace/transactions");

export interface MarketplaceRouteDependencies {
  storage: MarketplaceStorage;
  isAuthenticated: RequestHandler;
  buyListing: MarketplaceTransactions["buyListing"];
  cancelListing: MarketplaceTransactions["cancelListing"];
  collectProceeds: MarketplaceTransactions["collectProceeds"];
  createFishListing: MarketplaceTransactions["createFishListing"];
  createInventoryListing: MarketplaceTransactions["createInventoryListing"];
}

export type MarketplaceRoutePhase = "details" | "lifecycle";

function marketplaceHttpStatus(error: MarketplaceError): number {
  if (error.code === "not_found" || error.code === "item_not_owned") return 404;
  if (error.code === "wrong_owner") return 403;
  if (["already_sold", "already_cancelled", "already_collected", "conflict", "not_active"].includes(error.code)) return 409;
  return 400;
}

/** Register marketplace routes in phases so their ordering among legacy routes stays unchanged. */
export function registerMarketplaceRoutes(
  app: Express,
  dependencies: MarketplaceRouteDependencies,
  phase: MarketplaceRoutePhase,
): void {
  const {
    storage,
    isAuthenticated,
    buyListing,
    cancelListing,
    collectProceeds,
    createFishListing,
    createInventoryListing,
  } = dependencies;

  if (phase === "details") {
    app.get("/api/market/listing/:listingId/item-details", isAuthenticated, async (req, res) => {
      try {
        const listing = await storage.getMarketListing(req.params.listingId as string);
        if (!listing) return res.status(404).json({ message: "Listing not found" });
        const invItem = await storage.getInventoryItemById(listing.inventoryId);
        if (!invItem) return res.status(404).json({ message: "Inventory item not found" });
        const shopItem = await storage.getShopItem(invItem.shopItemId);
        if (!shopItem) return res.status(404).json({ message: "Shop item not found" });

        const effects: string[] = [];
        const type = shopItem.type;
        if (type === "power_up") {
          if (shopItem.statBoostType && shopItem.statBoostAmount) {
            const label = shopItem.statBoostType === "health" ? "HP"
              : shopItem.statBoostType === "atk" ? "ATK"
              : shopItem.statBoostType === "def" ? "DEF"
              : String(shopItem.statBoostType).toUpperCase();
            effects.push(`+${shopItem.statBoostAmount} ${label}`);
          }
        } else if (type === "edibles") {
          if (shopItem.statBoostAmount) effects.push(`+${shopItem.statBoostAmount} Feed pts`);
        } else if (type === "potion") {
          if (shopItem.healthRestored) effects.push(`+${shopItem.healthRestored} HP restored`);
          if ((shopItem as any).manaRestored) effects.push(`+${(shopItem as any).manaRestored} MP restored`);
          if (shopItem.petsRevived) effects.push(`Revives ${shopItem.petsRevived} pet${shopItem.petsRevived > 1 ? "s" : ""}`);
        } else if (type === "special") {
          if (shopItem.specialType === "hatch_time" && shopItem.specialAmount) {
            effects.push(`−${shopItem.specialAmount} min hatch time`);
          } else if (shopItem.specialType === "level" && shopItem.specialAmount) {
            effects.push(`+${shopItem.specialAmount} Level pts`);
          } else if (shopItem.specialType) {
            effects.push(shopItem.specialType);
          }
        } else if (type === "accessory") {
          if ((shopItem as any).atkBoost) effects.push(`+${(shopItem as any).atkBoost} ATK`);
          if ((shopItem as any).defBoost) effects.push(`+${(shopItem as any).defBoost} DEF`);
          if ((shopItem as any).healthBoost) effects.push(`+${(shopItem as any).healthBoost} HP`);
        } else if (type === "fishing" || (shopItem as any).fishingType === "bait") {
          if ((shopItem as any).rarityBoostPercent) effects.push(`+${(shopItem as any).rarityBoostPercent}% rare catch chance`);
        }

        return res.json({
          name: shopItem.name,
          imageUrl: listing.itemImageUrl,
          type: listing.itemType,
          effects,
          description: (shopItem as any).description ?? null,
        });
      } catch (err) {
        return res.status(500).json({ message: "Failed to fetch item details" });
      }
    });

    app.get("/api/market/listing/:listingId/pet-details", isAuthenticated, async (req, res) => {
      try {
        const listing = await storage.getMarketListing((req.params.listingId as string));
        if (!listing) return res.status(404).json({ message: "Listing not found" });
        if (listing.itemType !== "pet_egg") return res.status(400).json({ message: "Not a pet egg listing" });
        const invItem = await storage.getInventoryItemById(listing.inventoryId);
        if (!invItem) return res.status(404).json({ message: "Pet inventory item not found" });
        const shopItem = await storage.getShopItem(invItem.shopItemId);
        return res.json({
          speciesName: shopItem?.name ?? "Unknown",
          eggImageUrl: shopItem?.eggImageUrl ?? null,
          petNickname: invItem.petNickname ?? null,
          level: invItem.petLevel,
          health: invItem.petHealth,
          atk: invItem.petAtk,
          def: invItem.petDef,
        });
      } catch (err) {
        return res.status(500).json({ message: "Failed to fetch pet details" });
      }
    });
    return;
  }

  app.get("/api/market", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const search = req.query.search as string | undefined;
      const itemType = req.query.itemType as string | undefined;
      const orderAsc = !!(itemType && itemType !== "all");
      const listings = await storage.getMarketListings({ search, itemType, orderAsc });
      const uniqueShopItemIds = [...new Set(listings.map(l => l.shopItemId).filter(Boolean))];
      const shopItems = await Promise.all(uniqueShopItemIds.map(id => storage.getShopItem(id)));
      const shopItemMap = new Map<string, any>();
      shopItems.forEach(si => { if (si) shopItemMap.set(si.id, si); });

      function computeEffectSummary(shopItem: any, listingItemType: string): string {
        if (!shopItem) return "";
        const type = shopItem.type;
        const parts: string[] = [];
        if (type === "power_up") {
          if (shopItem.statBoostType && shopItem.statBoostAmount) {
            const label = shopItem.statBoostType === "health" ? "HP"
              : shopItem.statBoostType === "atk" ? "ATK"
              : shopItem.statBoostType === "def" ? "DEF"
              : String(shopItem.statBoostType).toUpperCase();
            parts.push(`+${shopItem.statBoostAmount} ${label}`);
          }
        } else if (type === "edibles") {
          if (shopItem.statBoostAmount) parts.push(`+${shopItem.statBoostAmount} Feed`);
        } else if (type === "potion") {
          if (shopItem.healthRestored) parts.push(`+${shopItem.healthRestored} HP`);
          if (shopItem.petsRevived) parts.push(`Revives ${shopItem.petsRevived} pet${shopItem.petsRevived > 1 ? "s" : ""}`);
        } else if (type === "special") {
          if (shopItem.specialType === "hatch_time" && shopItem.specialAmount) parts.push(`−${shopItem.specialAmount}m hatch`);
          else if (shopItem.specialType === "level" && shopItem.specialAmount) parts.push(`+${shopItem.specialAmount} Lvl pts`);
          else if (shopItem.specialType) parts.push(shopItem.specialType);
        } else if (type === "accessory") {
          if (shopItem.atkBoost) parts.push(`+${shopItem.atkBoost} ATK`);
          if (shopItem.defBoost) parts.push(`+${shopItem.defBoost} DEF`);
          if (shopItem.healthBoost) parts.push(`+${shopItem.healthBoost} HP`);
        } else if (type === "fishing") {
          if (shopItem.fishingType === "bait") {
            if (shopItem.rarityBoostPercent) parts.push(`+${shopItem.rarityBoostPercent}% rare`);
          } else if (shopItem.fishingType === "pole") {
            if (shopItem.poleMaxUses) parts.push(`${shopItem.poleMaxUses} uses`);
          }
        } else if (listingItemType === "bait") {
          if (shopItem.rarityBoostPercent) parts.push(`+${shopItem.rarityBoostPercent}% rare`);
        } else if (listingItemType === "pole") {
          if (shopItem.poleMaxUses) parts.push(`${shopItem.poleMaxUses} uses`);
        }
        return parts.join(" · ");
      }

      const enriched = listings.map(listing => {
        const shopItem = shopItemMap.get(listing.shopItemId);
        const effectSummary = computeEffectSummary(shopItem, listing.itemType);
        const base: any = { ...listing, effectSummary };
        if (!user.isAdmin) delete base.sellerName;
        return base;
      });
      return res.json(enriched);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch market listings" });
    }
  });

  app.get("/api/market/my-listings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      return res.json(await storage.getMyMarketListings(user.id));
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch your listings" });
    }
  });

  app.post("/api/market/list", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId, price } = req.body ?? {};
      if (typeof inventoryId !== "string" || price == null) return res.status(400).json({ message: "inventoryId and price required" });
      return res.json(await createInventoryListing({ actorId: user.id, inventoryId, price }));
    } catch (err: any) {
      if (err instanceof MarketplaceError) return res.status(marketplaceHttpStatus(err)).json({ message: err.message, code: err.code });
      console.error("Marketplace listing transaction failed:", err);
      return res.status(500).json({ message: "Failed to create listing", code: "transaction_failure" });
    }
  });

  app.post("/api/market/list-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { fishInventoryId, price } = req.body ?? {};
      if (typeof fishInventoryId !== "string" || price == null) return res.status(400).json({ message: "fishInventoryId and price required" });
      return res.json(await createFishListing({ actorId: user.id, fishInventoryId, price }));
    } catch (err: any) {
      if (err instanceof MarketplaceError) return res.status(marketplaceHttpStatus(err)).json({ message: err.message, code: err.code });
      console.error("Fish marketplace listing transaction failed:", err);
      return res.status(500).json({ message: "Failed to list fish", code: "transaction_failure" });
    }
  });

  app.post("/api/market/:listingId/buy", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await buyListing({ actorId: user.id, listingId: req.params.listingId as string });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err instanceof MarketplaceError) return res.status(marketplaceHttpStatus(err)).json({ message: err.message, code: err.code });
      console.error("Marketplace purchase transaction failed:", err);
      return res.status(500).json({ message: "Failed to buy listing", code: "transaction_failure" });
    }
  });

  app.post("/api/market/:listingId/collect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await collectProceeds({ actorId: user.id, listingId: req.params.listingId as string });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err instanceof MarketplaceError) return res.status(marketplaceHttpStatus(err)).json({ message: err.message, code: err.code });
      console.error("Marketplace proceeds transaction failed:", err);
      return res.status(500).json({ message: "Failed to collect coins", code: "transaction_failure" });
    }
  });

  app.delete("/api/market/:listingId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await cancelListing({ actorId: user.id, listingId: req.params.listingId as string });
      return res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof MarketplaceError) return res.status(marketplaceHttpStatus(err)).json({ message: err.message, code: err.code });
      console.error("Marketplace cancellation transaction failed:", err);
      return res.status(500).json({ message: "Failed to cancel listing", code: "transaction_failure" });
    }
  });

  app.post("/api/market/buy-slot", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const updatedUser = await storage.buyMarketSlot(user.id);
      return res.json({ ok: true, marketExtraSlots: updatedUser.marketExtraSlots, coins: updatedUser.coins });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to purchase slot" });
    }
  });
}
