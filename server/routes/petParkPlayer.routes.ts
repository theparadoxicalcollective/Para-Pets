import type { Express, RequestHandler } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { petParkDeposits, petParkPlayerSlots, petParkSceneItems, petParkSettings, shopItems, userInventory, users } from "@shared/schema";
import { db } from "../db";

export function registerPetParkPlayerRoutes(app: Express, isAuthenticated: RequestHandler): void {
  app.get("/api/pet-park/scene", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [settings] = await db.select().from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const [player] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
      if (!settings?.enabledForPlayers && !player?.isAdmin) {
        return res.json({ enabledForPlayers: false, backgroundUrl: null, items: [], deposits: [], unlockedSlots: 1 });
      }
      const [slots] = await db.select().from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
      const items = await db.select().from(petParkSceneItems);
      const deposits = await db.select({
        id: petParkDeposits.id, slotNumber: petParkDeposits.slotNumber,
        petInventoryId: petParkDeposits.petInventoryId, petName: shopItems.name,
        petTemplateId: userInventory.shopItemId,
        petNickname: userInventory.petNickname,
        petLevel: userInventory.petLevel,
      }).from(petParkDeposits)
        .innerJoin(userInventory, eq(petParkDeposits.petInventoryId, userInventory.id))
        .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .where(and(eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt)));
      return res.json({
        enabledForPlayers: settings?.enabledForPlayers ?? false,
        backgroundUrl: settings?.backgroundUrl ?? null,
        items, deposits, unlockedSlots: slots?.unlockedSlots ?? 1,
        preview: !settings?.enabledForPlayers && !!player?.isAdmin,
      });
    } catch (error) {
      console.error("[pet-park] scene read failed", error);
      return res.status(500).json({ message: "Unable to load Pet Park" });
    }
  });

  app.post("/api/pet-park/deposits", isAuthenticated, async (req, res) => {
    const { petInventoryId, slotNumber } = req.body ?? {};
    if (typeof petInventoryId !== "string" || petInventoryId.length < 1 || petInventoryId.length > 100 ||
        !Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 3) {
      return res.status(400).json({ message: "Valid pet and slot required" });
    }
    try {
      const userId = (req.user as { id: string }).id;
      const result = await db.transaction(async tx => {
        // Serialize all deposit, retrieval and unlock actions for the same owner.
        const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!owner) return { status: 404 as const };
        const [park] = await tx.select({ enabled: petParkSettings.enabledForPlayers })
          .from(petParkSettings).where(eq(petParkSettings.id, "main"));
        if (!park?.enabled) return { status: 403 as const };
        const [slots] = await tx.select({ unlockedSlots: petParkPlayerSlots.unlockedSlots })
          .from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
        if (slotNumber > (slots?.unlockedSlots ?? 1)) return { status: 409 as const };
        const [pet] = await tx.select({ id: userInventory.id, isHatched: userInventory.isHatched, type: shopItems.type, isListed: userInventory.isListed })
          .from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
          .where(and(eq(userInventory.id, petInventoryId), eq(userInventory.userId, userId)));
        if (!pet || !pet.isHatched || pet.type !== "pet" || pet.isListed) return { status: 422 as const };
        const [existing] = await tx.select({ id: petParkDeposits.id }).from(petParkDeposits)
          .where(and(eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt),
            sql`(${petParkDeposits.slotNumber} = ${slotNumber} OR ${petParkDeposits.petInventoryId} = ${petInventoryId})`));
        if (existing) return { status: 409 as const };
        const [deposit] = await tx.insert(petParkDeposits).values({ userId, petInventoryId, slotNumber }).returning();
        return { status: 201 as const, deposit };
      });
      if (result.status === 404) return res.status(404).json({ message: "Player not found" });
      if (result.status === 403) return res.status(403).json({ message: "Pet Park is under construction" });
      if (result.status === 409) return res.status(409).json({ message: "Slot unavailable or pet already deposited" });
      if (result.status === 422) return res.status(422).json({ message: "Only your own hatched, unlisted pets can be deposited" });
      return res.status(201).json(result.deposit);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "Pet or slot already occupied" });
      console.error("[pet-park] deposit failed", error);
      return res.status(500).json({ message: "Unable to deposit pet" });
    }
  });

  // Retrieval is deliberately allowed while closed. No rewards are credited
  // until an audited atomic claim/withdraw settlement service is introduced.
  app.post("/api/pet-park/deposits/:id/withdraw", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const result = await db.transaction(async tx => {
        const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!owner) return null;
        const [withdrawn] = await tx.update(petParkDeposits).set({ withdrawnAt: new Date() })
          .where(and(eq(petParkDeposits.id, String(req.params.id)),
            eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt)))
          .returning({ id: petParkDeposits.id });
        return withdrawn ?? null;
      });
      return result ? res.json({ withdrawn: true }) : res.status(404).json({ message: "Active deposit not found" });
    } catch (error) {
      console.error("[pet-park] withdrawal failed", error);
      return res.status(500).json({ message: "Unable to retrieve pet" });
    }
  });
}
