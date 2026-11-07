import type { Express, RequestHandler } from "express";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { petParkBuildings, petParkDeposits, petParkPresence, petParkRewardClaims, petParkPlayerSlots, petParkSceneItems, petParkSettings, shopItems, userInventory, users } from "@shared/schema";
import { db } from "../db";
import { claimablePetParkDurationMs, checkpointPetParkClaim } from "@shared/petParkAccrual";
import { registerPetParkDisplayRoutes } from "./petParkDisplay.routes";
import { isPetAccessibleParkRoom } from "@shared/petParkRooms";
import { PARK_ACTIVE_PRESENCE_MS, visibleOtherParkOutdoorIds } from "../petPark/publicOutdoorPopulation";

const PARK_PRESENCE_WRITE_INTERVAL_MS = 2 * 60 * 1000;

export function registerPetParkPlayerRoutes(app: Express, isAuthenticated: RequestHandler, applyPetXp: (level: number, points: number, earned: number) => { newLevel: number; newPoints: number }): void {
  registerPetParkDisplayRoutes(app, isAuthenticated);
  // Lightweight availability read for the main navigation. Do not load or
  // expose the scene, player deposits or other users' pets just to check access.
  app.get("/api/pet-park/status", isAuthenticated, async (_req, res) => {
    try {
      const userId = (_req.user as { id: string }).id;
      const [settings] = await db.select({ enabledForPlayers: petParkSettings.enabledForPlayers, enabledForModerators: petParkSettings.enabledForModerators })
        .from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const [role] = await db.select({ isAdmin: users.isAdmin, isModerator: users.isModerator }).from(users).where(eq(users.id, userId));
      return res.json({ enabledForPlayers: settings?.enabledForPlayers ?? false,
        canEnterPark: !!role?.isAdmin || !!settings?.enabledForPlayers || (!!settings?.enabledForModerators && !!role?.isModerator) });
    } catch (error) {
      console.error("[pet-park] availability read failed", error);
      return res.status(500).json({ message: "Unable to check Pet Park availability" });
    }
  });

  app.get("/api/pet-park/scene", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [settings] = await db.select().from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const [player] = await db.select({ isAdmin: users.isAdmin, isModerator: users.isModerator }).from(users).where(eq(users.id, userId));
      const canEnterPark = !!player?.isAdmin || !!settings?.enabledForPlayers || (!!settings?.enabledForModerators && !!player?.isModerator);
      if (!canEnterPark) {
        return res.json({ enabledForPlayers: false, groundLevel: 1, backgroundUrl: null, items: [], deposits: [], unlockedSlots: 1 });
      }
      // The park page polls this authenticated route every 30s while open.
      // Refresh presence no more than every 2 minutes; do not use login
      // events, which record sign-ins rather than ongoing activity.
      const now = new Date();
      const refreshBefore = new Date(now.getTime() - PARK_PRESENCE_WRITE_INTERVAL_MS);
      const activeSince = new Date(now.getTime() - PARK_ACTIVE_PRESENCE_MS);
      await db.insert(petParkPresence).values({ userId, lastSeenAt: now })
        .onConflictDoUpdate({
          target: petParkPresence.userId,
          set: { lastSeenAt: now },
          setWhere: lt(petParkPresence.lastSeenAt, refreshBefore),
        });
      const [slots] = await db.select().from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
      const items = await db.select().from(petParkSceneItems);
      const buildings = await db.select().from(petParkBuildings);
      const deposits = await db.select({
        id: petParkDeposits.id, slotNumber: petParkDeposits.slotNumber,
        petInventoryId: petParkDeposits.petInventoryId, petName: shopItems.name,
        petTemplateId: shopItems.petTemplateId,
        hatchedImageUrl: shopItems.hatchedImageUrl,
        petNickname: userInventory.petNickname,
        petLevel: userInventory.petLevel,
        buildingId: petParkDeposits.buildingId, roomEffectId: petParkDeposits.roomEffectId, showInPark: petParkDeposits.showInPark, parkXPct: petParkDeposits.parkXPct, parkYPct: petParkDeposits.parkYPct,
        interiorXPct: petParkDeposits.interiorXPct, interiorYPct: petParkDeposits.interiorYPct, pose: petParkDeposits.pose,
        checkpointAt: petParkDeposits.checkpointAt, pausedAt: petParkDeposits.pausedAt, pausedDurationMs: petParkDeposits.pausedDurationMs,
        // Includes settled-claim duration so fractional progress toward each
        // reward increment survives a manual collect or automatic pet swap.
        earnedDurationMs: sql<number>`COALESCE((SELECT SUM(${petParkRewardClaims.earnedDurationMs})
          FROM ${petParkRewardClaims} WHERE ${petParkRewardClaims.depositId} = ${petParkDeposits.id}), 0)`,
      }).from(petParkDeposits)
        .innerJoin(userInventory, eq(petParkDeposits.petInventoryId, userInventory.id))
        .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .where(and(eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt)));
      // Filter by first displayed pet and presence in SQL before loading
      // public artwork, cosmetics and the rest of the scene payload.
      const visibleOtherOutdoorIds = visibleOtherParkOutdoorIds(db, userId, activeSince);
      // The public roster is read-only; never expose wallet, private inventory,
      // reward checkpoints or another player's deposit mutation identifiers.
      const sharedPets = await db.select({
        petInventoryId: petParkDeposits.petInventoryId,
        parkXPct: petParkDeposits.parkXPct, parkYPct: petParkDeposits.parkYPct,
        buildingId: petParkDeposits.buildingId,
        roomEffectId: petParkDeposits.roomEffectId,
        interiorXPct: petParkDeposits.interiorXPct,
        interiorYPct: petParkDeposits.interiorYPct,
        pose: petParkDeposits.pose,
        petTemplateId: shopItems.petTemplateId,
        hatchedImageUrl: shopItems.hatchedImageUrl,
        petName: shopItems.name,
        petNickname: userInventory.petNickname,
        petLevel: userInventory.petLevel,
        rarity: shopItems.rarity,
        ownerName: users.username,
        ownerId: users.id,
        depositedAt: petParkDeposits.createdAt,
      }).from(petParkDeposits)
        .innerJoin(userInventory, eq(petParkDeposits.petInventoryId, userInventory.id))
        .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .innerJoin(users, eq(petParkDeposits.userId, users.id))
        // Equipping alone is private. Each visitor sees at most one outdoor
        // pet per OTHER player; their own three remain movable/inspectable.
        // Indoor residents are intentionally unaffected.
        .where(and(isNull(petParkDeposits.withdrawnAt), or(
          and(eq(petParkDeposits.showInPark, true), isNull(petParkDeposits.buildingId),
            isNotNull(petParkDeposits.parkXPct), isNotNull(petParkDeposits.parkYPct),
            or(eq(petParkDeposits.userId, userId),
              inArray(petParkDeposits.id, visibleOtherOutdoorIds))),
          isNotNull(petParkDeposits.buildingId),
        )))
        .orderBy(petParkDeposits.createdAt, petParkDeposits.id);
      return res.json({
        enabledForPlayers: settings?.enabledForPlayers ?? false,
        canEnterPark,
        backgroundUrl: settings?.backgroundUrl ?? null, // Legacy only; the live park draws grass instead.
        groundLevel: settings?.groundLevel ?? 1,
        groundTheme: settings?.groundTheme ?? "grass",
        buildings, rates: { coinsPerHour: settings?.coinsPerHour ?? 0, essencePerHour: settings?.essencePerHour ?? 0, petXpPerHour: settings?.petXpPerHour ?? 0 },
        serverNow: new Date().toISOString(),
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
        const [park] = await tx.select({ enabled: petParkSettings.enabledForPlayers, moderators: petParkSettings.enabledForModerators })
          .from(petParkSettings).where(eq(petParkSettings.id, "main"));
        const [role] = await tx.select({ isAdmin: users.isAdmin, isModerator: users.isModerator }).from(users).where(eq(users.id, userId));
        if (!park?.enabled && !role?.isAdmin && !(park?.moderators && role?.isModerator)) return { status: 403 as const };
        const [slots] = await tx.select({ unlockedSlots: petParkPlayerSlots.unlockedSlots })
          .from(petParkPlayerSlots).where(eq(petParkPlayerSlots.userId, userId));
        if (slotNumber > (slots?.unlockedSlots ?? 1)) return { status: 409 as const };
        const [pet] = await tx.select({ id: userInventory.id, isHatched: userInventory.isHatched, type: shopItems.type, isListed: userInventory.isListed, petLevel: userInventory.petLevel })
          .from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
          .where(and(eq(userInventory.id, petInventoryId), eq(userInventory.userId, userId)));
        if (!pet || !pet.isHatched || pet.type !== "pet" || pet.isListed || (pet.petLevel ?? 1) < 10) return { status: 422 as const };
        const [existing] = await tx.select({ id: petParkDeposits.id }).from(petParkDeposits)
          .where(and(eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt),
            sql`(${petParkDeposits.slotNumber} = ${slotNumber} OR ${petParkDeposits.petInventoryId} = ${petInventoryId})`));
        if (existing) return { status: 409 as const };
        const [deposit] = await tx.insert(petParkDeposits).values({ userId, petInventoryId, slotNumber, showInPark: false, pausedAt: park.enabled ? null : new Date() }).returning();
        return { status: 201 as const, deposit };
      });
      if (result.status === 404) return res.status(404).json({ message: "Player not found" });
      if (result.status === 403) return res.status(403).json({ message: "Pet Park is under construction" });
      if (result.status === 409) return res.status(409).json({ message: "Slot unavailable or pet already deposited" });
      if (result.status === 422) return res.status(422).json({ message: "Only your own hatched, unlisted level 10+ pets can be deposited" });
      return res.status(201).json(result.deposit);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "Pet or slot already occupied" });
      console.error("[pet-park] deposit failed", error);
      return res.status(500).json({ message: "Unable to deposit pet" });
    }
  });


  // Interior placement is deliberately separate from public outdoor display.
  // Only the owner can move one of their three deposits inside. Indoor pets
  // are visible to room visitors but are never published on the outdoor map;
  // they continue accruing rewards without resetting their checkpoints.
  app.patch("/api/pet-park/deposits/:id/placement", isAuthenticated, async (req, res) => {
    const depositId = req.params.id;
    const { buildingId, roomEffectId = null, xPct, yPct, pose = "idle" } = req.body ?? {};
    if (typeof depositId !== "string" || !depositId || depositId.length > 100 ||
        typeof buildingId !== "string" || !buildingId || buildingId.length > 100 ||
        (roomEffectId !== null && (typeof roomEffectId !== "string" || !roomEffectId || roomEffectId.length > 64)) ||
        typeof xPct !== "number" || !Number.isFinite(xPct) || xPct < 0 || xPct > 1 ||
        typeof yPct !== "number" || !Number.isFinite(yPct) || yPct < 0 || yPct > 1 ||
        !["idle", "sit", "sleep"].includes(pose)) {
      return res.status(400).json({ message: "Choose a valid indoor position and building" });
    }
    try {
      const userId = (req.user as { id: string }).id;
      const result = await db.transaction(async tx => {
        // Preserve owner -> deposit -> building lock ordering for park actions.
        const [owner] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.id, userId)).for("update");
        if (!owner) return { status: 404 as const };
        const [deposit] = await tx.select().from(petParkDeposits)
          .where(and(eq(petParkDeposits.id, depositId), eq(petParkDeposits.userId, userId),
            isNull(petParkDeposits.withdrawnAt))).for("update");
        if (!deposit) return { status: 404 as const };
        const [park] = await tx.select({ enabled: petParkSettings.enabledForPlayers,
          moderators: petParkSettings.enabledForModerators }).from(petParkSettings)
          .where(eq(petParkSettings.id, "main"));
        const [role] = await tx.select({ isAdmin: users.isAdmin,
          isModerator: users.isModerator }).from(users).where(eq(users.id, userId));
        if (!park?.enabled && !role?.isAdmin && !(park?.moderators && role?.isModerator))
          return { status: 403 as const };
        // Serialize occupancy with all other placements and admin capacity edits.
        const [building] = await tx.select().from(petParkBuildings)
          .where(eq(petParkBuildings.id, buildingId)).for("update");
        if (!building || !building.interiorImageUrl || building.isShop) return { status: 422 as const };
        const room = roomEffectId === null ? null :
          (building.interiorEffects ?? []).find(effect => effect.id === roomEffectId);
        if (roomEffectId !== null && !isPetAccessibleParkRoom(room))
          return { status: 422 as const };
        const occupants = await tx.select({ id: petParkDeposits.id,
          roomEffectId: petParkDeposits.roomEffectId }).from(petParkDeposits)
          .where(and(eq(petParkDeposits.buildingId, buildingId), isNull(petParkDeposits.withdrawnAt)));
        const others = occupants.filter(item => item.id !== deposit.id);
        if (others.length >= building.maxPets) return { status: 409 as const };
        if (room && isPetAccessibleParkRoom(room) &&
            others.filter(item => item.roomEffectId === roomEffectId).length >= room.maxPets)
          return { status: 409 as const };
        const [updated] = await tx.update(petParkDeposits).set({
          buildingId, roomEffectId, interiorXPct: xPct, interiorYPct: yPct, pose,
          showInPark: false, parkXPct: null, parkYPct: null,
        }).where(eq(petParkDeposits.id, deposit.id)).returning();
        return { status: 200 as const, deposit: updated };
      });
      if (result.status === 404) return res.status(404).json({ message: "Equipped pet not found" });
      if (result.status === 403) return res.status(403).json({ message: "Pet Park is not open to your account" });
      if (result.status === 422) return res.status(422).json({ message: "This building or room cannot hold pets" });
      if (result.status === 409) return res.status(409).json({ message: "This building or room is full" });
      return res.json(result.deposit);
    } catch (error) {
      console.error("[pet-park] indoor placement failed", error);
      return res.status(500).json({ message: "Unable to place pet inside" });
    }
  });

  // Collection and withdrawal share one transaction and owner lock.
  // The caller may collect without removing the pet.
  type ParkTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function settleDepositInTransaction(tx: ParkTransaction, userId: string, depositId: string, withdraw: boolean) {
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
  }
  async function settleDeposit(userId: string, depositId: string, withdraw: boolean) {
    return db.transaction(tx => settleDepositInTransaction(tx, userId, depositId, withdraw));
  }


  // A swap is all-or-nothing: validate replacement, settle rewards and withdraw
  // the previous pet, then deposit the replacement under one owner lock.
  app.post("/api/pet-park/deposits/:id/swap", isAuthenticated, async (req, res) => {
    const petInventoryId = req.body?.petInventoryId;
    if (typeof petInventoryId !== "string" || petInventoryId.length < 1 || petInventoryId.length > 100)
      return res.status(400).json({ message: "Choose a valid replacement pet" });
    try {
      const userId = (req.user as { id: string }).id;
      const result = await db.transaction(async tx => {
        const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!owner) return { status: 404 as const };
        const [park] = await tx.select({ enabled: petParkSettings.enabledForPlayers, moderators: petParkSettings.enabledForModerators })
          .from(petParkSettings).where(eq(petParkSettings.id, "main"));
        const [role] = await tx.select({ isAdmin: users.isAdmin, isModerator: users.isModerator }).from(users).where(eq(users.id, userId));
        if (!park?.enabled && !role?.isAdmin && !(park?.moderators && role?.isModerator)) return { status: 403 as const };
        const [outgoing] = await tx.select().from(petParkDeposits)
          .where(and(eq(petParkDeposits.id, String(req.params.id)), eq(petParkDeposits.userId, userId), isNull(petParkDeposits.withdrawnAt))).for("update");
        if (!outgoing) return { status: 404 as const };
        if (outgoing.petInventoryId === petInventoryId) return { status: 409 as const };
        const [replacement] = await tx.select({ id: userInventory.id, isHatched: userInventory.isHatched, isListed: userInventory.isListed, type: shopItems.type, petLevel: userInventory.petLevel })
          .from(userInventory).innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
          .where(and(eq(userInventory.id, petInventoryId), eq(userInventory.userId, userId)));
        if (!replacement || !replacement.isHatched || replacement.isListed || replacement.type !== "pet" || (replacement.petLevel ?? 1) < 10)
          return { status: 422 as const };
        const [alreadyDeposited] = await tx.select({ id: petParkDeposits.id }).from(petParkDeposits)
          .where(and(eq(petParkDeposits.petInventoryId, petInventoryId), isNull(petParkDeposits.withdrawnAt)));
        if (alreadyDeposited) return { status: 409 as const };
        const rewards = await settleDepositInTransaction(tx, userId, outgoing.id, true);
        if (!rewards) throw new Error("Unable to settle outgoing pet");
        const [deposit] = await tx.insert(petParkDeposits).values({
          userId, petInventoryId, slotNumber: outgoing.slotNumber,
          showInPark: false, pausedAt: park.enabled ? null : new Date(),
        }).returning();
        return { status: 200 as const, rewards, deposit };
      });
      if (result.status === 404) return res.status(404).json({ message: "Active deposit or player not found" });
      if (result.status === 403) return res.status(403).json({ message: "Pet Park is under construction" });
      if (result.status === 409) return res.status(409).json({ message: "Replacement is already in the park" });
      if (result.status === 422) return res.status(422).json({ message: "Choose a hatched, unlisted level 10+ pet" });
      return res.json(result);
    } catch (error) {
      console.error("[pet-park] swap failed", error);
      return res.status(500).json({ message: "Unable to swap pets; original pet and rewards were preserved" });
    }
  });

  app.post("/api/pet-park/deposits/:id/claim", isAuthenticated, async (req, res) => {
    try {
      const result = await settleDeposit((req.user as { id: string }).id, String(req.params.id), false);
      return result ? res.json(result) : res.status(404).json({ message: "Active deposit not found" });
    } catch (error) {
      console.error("[pet-park] claim failed", error);
      return res.status(500).json({ message: "Unable to collect park rewards" });
    }
  });

  // Read-only public merchandise preview for the *entered* shop building.
  // Do not add catalog thumbnails or descriptions to every scene refresh.
  app.get("/api/pet-park/buildings/:id/shop-items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as { id: string }).id;
      const [settings] = await db.select({
        enabledForPlayers: petParkSettings.enabledForPlayers,
        enabledForModerators: petParkSettings.enabledForModerators,
      }).from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const [viewer] = await db.select({ isAdmin: users.isAdmin, isModerator: users.isModerator })
        .from(users).where(eq(users.id, userId));
      const allowed = !!viewer?.isAdmin || !!settings?.enabledForPlayers ||
        (!!settings?.enabledForModerators && !!viewer?.isModerator);
      if (!allowed) return res.status(403).json({ message: "Pet Park is not open" });
      const [building] = await db.select({
        isShop: petParkBuildings.isShop, shopItemIds: petParkBuildings.shopItemIds,
        shopItemPlacements: petParkBuildings.shopItemPlacements,
      }).from(petParkBuildings).where(eq(petParkBuildings.id, String(req.params.id)));
      if (!building?.isShop) return res.status(404).json({ message: "Shop building not found" });
      const ids = Array.isArray(building.shopItemIds) ? building.shopItemIds.slice(0, 80) : [];
      if (!ids.length) return res.json([]);
      const catalog = await db.select({
        id: shopItems.id, name: shopItems.name, type: shopItems.type,
        imageUrl: shopItems.imageUrl, eggImageUrl: shopItems.eggImageUrl,
        hatchedImageUrl: shopItems.hatchedImageUrl, price: shopItems.price,
        description: shopItems.description,
        specialType: shopItems.specialType,
      }).from(shopItems).where(inArray(shopItems.id, ids));
      const byId = new Map(catalog.map(item => [item.id, item]));
      const placementMap = new Map((building.shopItemPlacements ?? []).map(item => [item.itemId, item]));
      return res.json(ids.flatMap(id => {
        const item = byId.get(id);
        return item ? [{ ...item, placement: placementMap.get(id) ?? null }] : [];
      }));
    } catch (error) {
      console.error("[pet-park] shop item read failed", error);
      return res.status(500).json({ message: "Unable to view shop building" });
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
