import type { Express, RequestHandler } from "express";

type WelcomeBundleStorage = Pick<
  typeof import("../storage").storage,
  "getAllShopItems" | "setGameSetting"
>;

export interface WelcomeBundleConfig {
  coinAmount: number;
  message: string;
  items: Array<{ name: string; qty: number }>;
}

export interface WelcomeBundleAdminRouteDependencies {
  storage: WelcomeBundleStorage;
  isAdmin: RequestHandler;
  getWelcomeBundleConfig: () => Promise<WelcomeBundleConfig>;
  computeItemEffect: (shop: any) => string | null;
}

/**
 * Administrator Welcome Bundle configuration routes.
 *
 * This is an organization-only boundary. It intentionally preserves the
 * existing URLs, middleware, item-art fallback order, response shapes,
 * storage calls, and legacy error behavior from server/routes.ts.
 */
export function registerWelcomeBundleAdminRoutes(
  app: Express,
  {
    storage,
    isAdmin,
    getWelcomeBundleConfig,
    computeItemEffect,
  }: WelcomeBundleAdminRouteDependencies,
): void {
  app.get("/api/admin/welcome-bundle", isAdmin, async (_req, res) => {
    try {
      const config = await getWelcomeBundleConfig();
      const allShopItems = await storage.getAllShopItems();
      const itemsWithDetails = config.items.map(({ name, qty }) => {
        const shop = allShopItems.find(i => i.name.toLowerCase() === name.toLowerCase());

        // Pet shop items leave imageUrl blank and use eggImageUrl as their
        // primary shop art. Preserve the full legacy fallback order so the
        // Admin editor never shows a missing-art tile for an item that has art.
        const resolvedImage =
          (shop as any)?.imageUrl
          || (shop as any)?.eggImageUrl
          || (shop as any)?.hatchedImageUrl
          || (shop as any)?.hooklessImageUrl
          || (shop as any)?.sleepingImageUrl
          || null;

        return {
          name,
          qty,
          found: !!shop,
          imageUrl: resolvedImage,
          type: shop?.type ?? null,
          effect: computeItemEffect(shop),
        };
      });

      return res.json({
        coinAmount: config.coinAmount,
        message: config.message,
        items: itemsWithDetails,
      });
    } catch (err) {
      console.error("Get welcome bundle config error:", err);
      return res.status(500).json({ message: "Failed to get welcome bundle config" });
    }
  });

  app.put("/api/admin/welcome-bundle", isAdmin, async (req, res) => {
    try {
      const { coinAmount, message, items } = req.body;
      const config = {
        coinAmount: Number(coinAmount) || 0,
        message: message || "",
        items: items || [],
      };
      await storage.setGameSetting("welcome_bundle_config", JSON.stringify(config));
      return res.json({ success: true, config });
    } catch (err) {
      console.error("Save welcome bundle config error:", err);
      return res.status(500).json({ message: "Failed to save welcome bundle config" });
    }
  });
}
