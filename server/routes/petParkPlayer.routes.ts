import type { Express, RequestHandler } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { petParkBuildings, petParkDeposits, petParkRewardClaims, petParkPlayerSlots, petParkSceneItems, petParkSettings, shopItems, userInventory, users } from "@shared/schema";
import { db } from "../db";
import { claimablePetParkDurationMs, checkpointPetParkClaim } from "@shared/petParkAccrual";

export function registerPetParkPlayerRoutes(app: Express, isAuthenticated: RequestHandler, applyPetXp: (level: number, points: number, earned: number) => { newLevel: number; newPoints: number }): void {
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
      const buildings = await db.select().from(petParkBuildings);
      const deposits = await db.select({
        id: petParkDeposits.id, slotNumber: petParkDeposits.slotNumber,
        petInventoryId: petParkDeposits.petInventoryId, petName: shopItems.name,
        petTemplateId: userInventory.shopItemId,
        petNickname: userInventory.petNickname,
        petLevel: userInventory.petLevel,
        checkpointAt: petParkDeposits.checkpointAt, pausedAt: petParkDeposits.pausedAt, pausedDurationMs: petParkDeposits.pausedDurationMs,
      }).from(petParkDeposits)
        .innerJoin(userInventory, eq(petParkDeposits.petInventoryId, userInventory.id))
        .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .where(and(eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt)));
      // Public park roster is read-only; never expose wallet, private inventory,
      // reward checkpoints or another player's deposit mutation identifiers.
      const sharedPets = await db.select({
        petInventoryId: petParkDeposits.petInventoryId,
        petTemplateId: userInventory.shopItemId,
        petName: shopItems.name,
        petNickname: userInventory.petNickname,
        petLevel: userInventory.petLevel,
        ownerName: users.username,
        ownerId: users.id,
        depositedAt: petParkDeposits.createdAt,
      }).from(petParkDeposits)
        .innerJoin(userInventory, eq(petParkDeposits.petInventoryId, userInventory.id))
        .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .innerJoin(users, eq(petParkDeposits.userId, users.id))
        .where(isNull(petParkDeposits.withdrawnAt))
        .orderBy(petParkDeposits.createdAt, petParkDeposits.id);
      return res.json({
        enabledForPlayers: settings?.enabledForPlayers ?? false,
        backgroundUrl: settings?.backgroundUrl ?? null,
        rates: { coinsPerHour: settings?.coinsPerHour ?? 0, essencePerHour: settings?.essencePerHour ?? 0, petXpPerHour: settings?.petXpPerHour ?? 0 },
        items, deposits, sharedPets, unlockedSlots: slots?.unlockedSlots ?? 1,
        preview: !settings?.enabledForPlayers && !!player?.isAdmin,
        canEditPark: !!player?.isAdmin,
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


  // Collection and withdrawal share one transaction and owner lock.
  // The caller may collect without removing the pet.
  async function settleDeposit(userId: string, depositId: string, withdraw: boolean) {
    return db.transaction(async tx => {
      const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if (!owner) return null;
      const [deposit] = await tx.select().from(petParkDeposits)
        .where(and(eq(petParkDeposits.id, depositId), eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt)))
        .for("update");
      if (!deposit) return null;
      const [settings] = await tx.select().from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const now = new Date();
      const state = {
        checkpointMs: deposit.checkpointAt.getTime(),
        pausedAtMs: deposit.pausedAt?.getTime() ?? null,
        pausedDurationMs: deposit.pausedDurationMs,
      };
      const duration = claimablePetParkDurationMs(state, now.getTime());
      // Use the existing reward ledger to retain fractional earning progress.
      // Otherwise frequent collections would reset the checkpoint and players
      // could permanently lose slow rewards (e.g. 2 essence every 5 minutes).
      const [history] = await tx.select({
        duration: sql<number>`COALESCE(SUM(${petParkRewardClaims.earnedDurationMs}), 0)`,
        coins: sql<number>`COALESCE(SUM(${petParkRewardClaims.coins}), 0)`,
        essence: sql<number>`COALESCE(SUM(${petParkRewardClaims.essence}), 0)`,
        petXp: sql<number>`COALESCE(SUM(${petParkRewardClaims.petXp}), 0)`,
      }).from(petParkRewardClaims).where(eq(petParkRewardClaims.depositId, depositId));
      const totalDuration = Number(history?.duration ?? 0) + duration;
      const coins = Math.max(0, Math.floor(totalDuration * (settings?.coinsPerHour ?? 0) / 3_600_000) - Number(history?.coins ?? 0));
      const essence = Math.max(0, ((settings?.essencePerHour ?? 0) === 24 ? Math.floor(totalDuration / 300_000) * 2 : Math.floor(totalDuration * (settings?.essencePerHour ?? 0) / 3_600_000)) - Number(history?.essence ?? 0));
      const petXp = Math.max(0, Math.floor(totalDuration * (settings?.petXpPerHour ?? 0) / 3_600_000) - Number(history?.petXp ?? 0));
      if (duration > 0) {
        await tx.insert(petParkRewardClaims).values({
          depositId, userId, intervalStartAt: deposit.checkpointAt,
          intervalEndAt: now, earnedDurationMs: duration, coins, essence, petXp,
        });
        if (coins || essence) await tx.update(users).set({
          coins: sql`${users.coins} + ${coins}`,
          totalCoinsEarned: sql`${users.totalCoinsEarned} + ${coins}`,
          essence: sql`${users.essence} + ${essence}`,
        }).where(eq(users.id, userId));
        if (petXp > 0) {
          const [pet] = await tx.select({ petLevel: userInventory.petLevel, petLevelPoints: userInventory.petLevelPoints })
            .from(userInventory).where(and(eq(userInventory.id, deposit.petInventoryId), eq(userInventory.userId, userId))).for("update");
          if (!pet) throw new Error("Deposited pet no longer belongs to player");
          const xp = applyPetXp(pet.petLevel ?? 1, pet.petLevelPoints ?? 0, petXp);
          await tx.update(userInventory).set({ petLevel: xp.newLevel, petLevelPoints: xp.newPoints })
            .where(and(eq(userInventory.id, deposit.petInventoryId), eq(userInventory.userId, userId)));
        }
      }
      const next = checkpointPetParkClaim(state, now.getTime());
      await tx.update(petParkDeposits).set({
        checkpointAt: new Date(next.checkpointMs), pausedAt: next.pausedAtMs == null ? null : new Date(next.pausedAtMs),
        pausedDurationMs: next.pausedDurationMs, ...(withdraw ? { withdrawnAt: now } : {}),
      }).where(eq(petParkDeposits.id, depositId));
      return { coins, essence, petXp, earnedDurationMs: duration, withdrawn: withdraw };
    });
  }

  app.post("/api/pet-park/deposits/:id/claim", isAuthenticated, async (req, res) => {
    try {
      const result = await settleDeposit((req.user as { id: string }).id, String(req.params.id), false);
      return result ? res.json(result) : res.status(404).json({ message: "Active deposit not found" });
    } catch (error) {
      console.error("[pet-park] claim failed", error);
      return res.status(500).json({ message: "Unable to collect park rewards" });
    }
  });

  // Retrieval remains available during closure and settles accrued rewards.
  app.post("/api/pet-park/deposits/:id/withdraw", isAuthenticated, async (req, res) => {
    try {
      const result = await settleDeposit((req.user as { id: string }).id, String(req.params.id), true);
      return result ? res.json(result) : res.status(404).json({ message: "Active deposit not found" });
    } catch (error) {
      console.error("[pet-park] withdrawal failed", error);
      return res.status(500).json({ message: "Unable to retrieve pet" });
    }
  });
}
