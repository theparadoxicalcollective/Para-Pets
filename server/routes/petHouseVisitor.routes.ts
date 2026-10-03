import type { Express, RequestHandler } from "express";

const PET_HOME_VISIT_REWARD_COINS = 10;

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type PetHouseVisitorStorage = Pick<typeof import("../storage").storage,
  | "getUser"
  | "getUserInventoryWithItems"
  | "getPetHousePositions"
  | "getClaimedPetHouseVisitRewardPetIds"
  | "claimPetHouseVisitReward"
>;

export interface PetHouseVisitorRouteDependencies {
  storage: PetHouseVisitorStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Pet House visitor data and the small daily visitor reward.
 *
 * The visitor reward is server-authoritative and limited to one 10-coin claim
 * per visitor, per placed pet, per UTC day. The unique reward ledger keeps
 * double taps, refreshes, or parallel requests from minting duplicate coins.
 */
export function registerPetHouseVisitorRoutes(
  app: Express,
  { storage, isAuthenticated }: PetHouseVisitorRouteDependencies,
): void {
  app.get("/api/users/:userId/pets", isAuthenticated, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId as string);
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const visitor = req.user as any;
      const [inventoryRows, savedPositions] = await Promise.all([
        storage.getUserInventoryWithItems(targetUser.id),
        storage.getPetHousePositions(targetUser.id),
      ]);
      const posMap = new Map(
        savedPositions.map((p) => [
          p.inventoryId,
          { posLeft: p.posLeft, posTop: p.posTop, location: p.location, scalePct: p.scalePct, flipped: p.flipped },
        ]),
      );

      const eligiblePetIds = inventoryRows
        .filter((r) => r.inventory.isHatched && r.shopItem?.type === "pet" && posMap.has(r.inventory.id))
        .map((r) => r.inventory.id);

      const claimedPetIds = visitor?.id && visitor.id !== targetUser.id
        ? await storage.getClaimedPetHouseVisitRewardPetIds(visitor.id, eligiblePetIds, utcDayKey())
        : [];
      const claimedSet = new Set(claimedPetIds);

      const hatchedPets = inventoryRows
        .filter((r) => r.inventory.isHatched && r.shopItem?.type === "pet")
        .map((r) => {
          const pos = posMap.get(r.inventory.id);
          const rewardEligible = !!pos && !!visitor?.id && visitor.id !== targetUser.id;
          return {
            inventoryId: r.inventory.id,
            shopItemId: r.shopItem!.id,
            name: r.shopItem!.name,
            nickname: r.inventory.petNickname,
            imageUrl: r.shopItem!.imageUrl,
            hatchedImageUrl: r.shopItem!.hatchedImageUrl,
            eggImageUrl: r.shopItem!.eggImageUrl,
            rarity: r.shopItem!.rarity,
            petLevel: r.inventory.petLevel,
            petHealth: r.inventory.petHealth,
            petAtk: r.inventory.petAtk,
            petDef: r.inventory.petDef,
            petTemplateId: r.shopItem!.petTemplateId || null,
            posLeft: pos?.posLeft ?? null,
            posTop: pos?.posTop ?? null,
            location: pos?.location ?? null,
            homeScalePct: pos?.scalePct ?? 100,
            homeFlipped: pos?.flipped ?? false,
            visitRewardAvailable: rewardEligible && !claimedSet.has(r.inventory.id),
            visitRewardAmount: rewardEligible ? PET_HOME_VISIT_REWARD_COINS : 0,
          };
        });

      return res.json({ username: targetUser.username, pets: hatchedPets });
    } catch (err) {
      console.error("Get user pets error:", err);
      return res.status(500).json({ message: "Failed to get pets" });
    }
  });

  app.post("/api/users/:userId/pets/:inventoryId/visit-reward", isAuthenticated, async (req, res) => {
    try {
      const visitor = req.user as any;
      const ownerId = String(req.params.userId || "");
      const inventoryId = String(req.params.inventoryId || "");
      if (!ownerId || !inventoryId) {
        return res.status(400).json({ message: "Pet Home reward target is required" });
      }
      if (!visitor?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (visitor.id === ownerId) {
        return res.status(400).json({ message: "You cannot collect rewards from your own Pet Home" });
      }

      const owner = await storage.getUser(ownerId);
      if (!owner || owner.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const result = await storage.claimPetHouseVisitReward(
        visitor.id,
        owner.id,
        inventoryId,
        utcDayKey(),
        PET_HOME_VISIT_REWARD_COINS,
      );
      if (!result) {
        return res.status(404).json({ message: "Placed pet not found" });
      }

      return res.json({
        inventoryId,
        rewarded: result.rewarded,
        amount: result.rewarded ? PET_HOME_VISIT_REWARD_COINS : 0,
        coins: result.coins,
      });
    } catch (err) {
      console.error("Pet Home visit reward error:", err);
      return res.status(500).json({ message: "Failed to collect Pet Home reward" });
    }
  });
}
