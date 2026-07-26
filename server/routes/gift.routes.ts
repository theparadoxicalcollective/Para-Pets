import type { Express, RequestHandler } from "express";

type GiftStorage = Pick<typeof import("../storage").storage, "getPendingGifts">;
type GiftTransactions = typeof import("../gifts/transactions");

export interface GiftRouteDependencies {
  storage: GiftStorage;
  isAuthenticated: RequestHandler;
  executeSendGift: GiftTransactions["executeSendGift"];
  executeAcceptGift: GiftTransactions["executeAcceptGift"];
}

export function registerGiftRoutes(app: Express, dependencies: GiftRouteDependencies): void {
  const { storage, isAuthenticated, executeSendGift, executeAcceptGift } = dependencies;

  app.post("/api/gifts/send", isAuthenticated, async (req, res) => {
    try {
      const senderId = (req.user as any).id;
      const { receiverId, message, coinAmount, itemType, shopItemInventoryId, decorItemId, itemQuantity, itemName, itemImageUrl, shopItemId } = req.body;
      if (!receiverId) return res.status(400).json({ message: "receiverId required" });
      if (coinAmount == null || coinAmount < 0) return res.status(400).json({ message: "coinAmount must be >= 0" });
      if (senderId === receiverId) return res.status(400).json({ message: "Cannot send gift to yourself" });
      const gift = await executeSendGift({ senderId, receiverId, message, coinAmount, itemType, shopItemInventoryId, decorItemId, itemQuantity, itemName, itemImageUrl, shopItemId });
      return res.json(gift);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/gifts/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const pending = await storage.getPendingGifts(userId);
      return res.json(pending);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/gifts/:id/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const gift = await executeAcceptGift((req.params.id as string), userId);
      return res.json(gift);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
