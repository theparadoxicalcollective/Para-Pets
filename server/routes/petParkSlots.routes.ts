import type { Express, RequestHandler } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { petParkPlayerSlots, petParkSettings, users } from "@shared/schema";
import { db } from "../db";
import { nextPetParkSlotPurchase } from "../petPark/slotPolicy";

/**
 * Player-facing endpoints remain closed until an admin explicitly publishes
 * Pet Park. This phase adds only slot purchases and a read-only status.
 */
export function registerPetParkSlotRoutes(app: Express, isAuthenticated: RequestHandler): void {
  app.get("/api/pet-park/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [park] = await db.select({ enabled: petParkSettings.enabledForPlayers })
        .from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const [slots] = await db.select({ unlockedSlots: petParkPlayerSlots.unlockedSlots })
        .from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
      return res.json({ enabledForPlayers: park?.enabled ?? false, unlockedSlots: slots?.unlockedSlots ?? 1 });
    } catch (error) {
      console.error("[pet-park] status failed:", error);
      return res.status(500).json({ message: "Unable to read Pet Park status" });
    }
  });

  app.post("/api/pet-park/slots/unlock", isAuthenticated, async (req, res) => {
    const slot = req.body?.slot;
    if (!Number.isInteger(slot) || slot < 2 || slot > 3) {
      return res.status(400).json({ message: "Slot must be 2 or 3" });
    }
    try {
      const userId = (req.user as { id: string }).id;
      const result = await db.transaction(async (tx) => {
        // Serialize purchases for this user; this also guards coin deductions.
        const [owner] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.id, userId)).for("update");
        if (!owner) return { status: 404 as const };
        const [park] = await tx.select({ enabled: petParkSettings.enabledForPlayers })
          .from(petParkSettings).where(eq(petParkSettings.id, "main"));
        if (!park?.enabled) return { status: 403 as const };

        const [existing] = await tx.select({ unlockedSlots: petParkPlayerSlots.unlockedSlots })
          .from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
        const decision = nextPetParkSlotPurchase(existing?.unlockedSlots ?? 1, slot);
        if (decision.kind === "invalid") return { status: 409 as const };
        if (decision.kind === "already_unlocked") {
          return { status: 200 as const, unlockedSlots: decision.unlockedSlots, charged: 0 };
        }

        const [balance] = await tx.update(users)
          .set({ coins: sql`${users.coins} - ${decision.cost}` })
          .where(and(eq(users.id, userId), gte(users.coins, decision.cost)))
          .returning({ coins: users.coins });
        if (!balance) return { status: 402 as const };

        await tx.insert(petParkPlayerSlots)
          .values({ userId, unlockedSlots: decision.unlockedSlots, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: petParkPlayerSlots.userId,
            set: { unlockedSlots: decision.unlockedSlots, updatedAt: new Date() },
          });
        return { status: 200 as const, unlockedSlots: decision.unlockedSlots, charged: decision.cost, coins: balance.coins };
      });
      if (result.status === 404) return res.status(404).json({ message: "Player not found" });
      if (result.status === 403) return res.status(403).json({ message: "Pet Park is under construction" });
      if (result.status === 409) return res.status(409).json({ message: "Unlock the preceding slot first" });
      if (result.status === 402) return res.status(402).json({ message: "Not enough coins" });
      return res.json(result);
    } catch (error) {
      console.error("[pet-park] slot unlock failed:", error);
      return res.status(500).json({ message: "Unable to unlock Pet Park slot" });
    }
  });
}
