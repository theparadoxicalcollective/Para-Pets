import type { Express, RequestHandler } from "express";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  gardenActionReceipts, gardenCrops, gardenPlayerPlots, petParkSceneItems,
  petParkSettings, shopItems, userInventory, users,
} from "@shared/schema";
import {
  GARDEN_PICKED_COOLDOWN_MS, GARDEN_WATER_CAPACITY,
  gardenAfterWaterPour, gardenEffectivePhase, gardenHarvestQuantity,
  isCompleteGardenCrop, type GardenPlotPhase,
} from "@shared/garden";
import { tryConsumeOneFromInventory } from "../inventoryConsumption";
import { db } from "../db";

type GardenTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GardenAction = "hoe" | "plant" | "water" | "harvest";
type SavedPlot = typeof gardenPlayerPlots.$inferSelect;
type SavedCrop = typeof gardenCrops.$inferSelect;
type CatalogItem = Pick<typeof shopItems.$inferSelect, "id" | "name" | "type" | "imageUrl">;
const requestKeyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100;

class GardenActionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function requireAction(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new GardenActionError(status, message);
}
function currentPlot(plotItemId: string, saved: SavedPlot | undefined, now: Date) {
  const phase = gardenEffectivePhase((saved?.phase ?? "empty") as GardenPlotPhase, saved?.pickedUntil, now);
  const reset = phase === "empty";
  return {
    plotItemId, phase, cropId: reset ? null : saved?.cropId ?? null,
    waterApplied: reset ? 0 : saved?.waterApplied ?? 0,
    harvestReady: reset ? false : saved?.harvestReady ?? false,
    pickedUntil: phase === "picked" ? saved?.pickedUntil?.toISOString() ?? null : null,
  };
}
function cropArt(crop: SavedCrop, seed?: CatalogItem, fruit?: CatalogItem) {
  const images = {
    seedPack: seed?.imageUrl ?? null, planted: crop.plantedImageUrl,
    seedling: crop.seedlingImageUrl, partial: crop.partialImageUrl,
    grown: crop.grownImageUrl, picked: crop.pickedImageUrl,
    fruit: fruit?.imageUrl ?? null,
  };
  const drops = {
    planted: crop.plantedDrops, seedling: crop.seedlingDrops,
    partial: crop.partialDrops, grown: crop.grownDrops,
  };
  return {
    id: crop.id, seedItemId: crop.seedItemId, fruitItemId: crop.fruitItemId,
    seedName: seed?.name ?? "Seed", fruitName: fruit?.name ?? "Fruit",
    images, drops, stagePlacements: crop.stagePlacements ?? {},
    ready: seed?.type === "garden_seed" && fruit?.type === "garden_fruit" &&
      isCompleteGardenCrop({ images, drops: Object.values(drops) }),
  };
}
async function requireParkAccess(tx: GardenTx, userId: string, lock: boolean) {
  // All garden mutations lock the SAME player row first. This serializes
  // concurrent taps across devices, including an absent plot's first INSERT,
  // without introducing a second scene or inventory ownership system.
  const playerQuery = tx.select({
    id: users.id, isAdmin: users.isAdmin, isModerator: users.isModerator,
  }).from(users).where(eq(users.id, userId));
  const [player] = lock ? await playerQuery.for("update") : await playerQuery;
  requireAction(player, 404, "Player not found");
  const [settings] = await tx.select({
    enabledForPlayers: petParkSettings.enabledForPlayers,
    enabledForModerators: petParkSettings.enabledForModerators,
  }).from(petParkSettings).where(eq(petParkSettings.id, "main"));
  requireAction(player.isAdmin || !!settings?.enabledForPlayers ||
    (!!settings?.enabledForModerators && player.isModerator),
  403, "Pet Park is not open to your account");
}
async function ownedEquipment(tx: GardenTx, userId: string, inventoryId: string) {
  // Marketplace escrows the WHOLE listed row; neither tools nor seeds may use it.
  const [inventory] = await tx.select({
    id: userInventory.id, userId: userInventory.userId,
    shopItemId: userInventory.shopItemId, isListed: userInventory.isListed,
    quantity: userInventory.quantity, gardenWaterLeft: userInventory.gardenWaterLeft,
  }).from(userInventory)
    .where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId)))
    .for("update");
  requireAction(inventory && !inventory.isListed && inventory.quantity > 0,
    422, "Choose an owned, unlisted garden item");
  const [item] = await tx.select({
    id: shopItems.id, type: shopItems.type, specialType: shopItems.specialType,
    isRefillable: shopItems.isRefillable, specialAmount: shopItems.specialAmount,
  }).from(shopItems).where(eq(shopItems.id, inventory.shopItemId));
  requireAction(item, 422, "Garden item is unavailable");
  return { inventory, item };
}
async function savePlot(tx: GardenTx, userId: string, plotId: string, existing: SavedPlot | undefined,
  values: Pick<SavedPlot, "phase" | "cropId" | "waterApplied" | "harvestReady" | "pickedUntil">) {
  const [saved] = existing
    ? await tx.update(gardenPlayerPlots).set({ ...values, updatedAt: new Date() })
      .where(and(eq(gardenPlayerPlots.id, existing.id), eq(gardenPlayerPlots.userId, userId))).returning()
    : await tx.insert(gardenPlayerPlots).values({ userId, plotItemId: plotId, ...values }).returning();
  requireAction(saved, 409, "Garden state changed; reload the plot");
  return saved;
}

/** The player-facing Pet Park garden action service. No new rendering stage,
 * admin placement update, client-authorized growth, or reward economy is added.
 * A receipt and all state/inventory writes commit together or not at all.
 */
export function registerGardenPlayerRoutes(
  app: Express, isAuthenticated: RequestHandler,
  database: typeof db = db,
  random: () => number = Math.random,
  clock: () => Date = () => new Date(),
): void {
  app.get("/api/pet-park/garden", isAuthenticated, async (req, res) => {
    const userId = (req.user as { id: string }).id;
    try {
      const data = await database.transaction(async tx => {
        await requireParkAccess(tx, userId, false);
        const [plots, ownStates, crops] = await Promise.all([
          tx.select({ id: petParkSceneItems.id, xPct: petParkSceneItems.xPct,
            yPct: petParkSceneItems.yPct, size: petParkSceneItems.size })
            .from(petParkSceneItems).where(and(
              eq(petParkSceneItems.kind, "terrain"),
              eq(petParkSceneItems.effectType, "garden_plot"),
            )),
          tx.select().from(gardenPlayerPlots).where(eq(gardenPlayerPlots.userId, userId)),
          tx.select().from(gardenCrops),
        ]);
        const ids = [...new Set(crops.flatMap(crop => [crop.seedItemId, crop.fruitItemId]))];
        const catalog: CatalogItem[] = ids.length
          ? await tx.select({
              id: shopItems.id, name: shopItems.name,
              type: shopItems.type, imageUrl: shopItems.imageUrl,
            }).from(shopItems).where(inArray(shopItems.id, ids))
          : [];
        const byItem = new Map(catalog.map(item => [item.id, item]));
        const byPlot = new Map(ownStates.map(state => [state.plotItemId, state]));
        const now = clock();
        return {
          serverNow: now.toISOString(),
          plots: plots.map(plot => ({ ...plot, ...currentPlot(plot.id, byPlot.get(plot.id), now) })),
          crops: crops.map(crop => cropArt(crop, byItem.get(crop.seedItemId), byItem.get(crop.fruitItemId)))
            .filter(crop => crop.ready),
        };
      });
      return res.json(data);
    } catch (error) {
      if (error instanceof GardenActionError)
        return res.status(error.status).json({ message: error.message });
      console.error("[garden] player state read failed", error);
      return res.status(500).json({ message: "Unable to load garden" });
    }
  });

  for (const action of ["hoe", "plant", "water", "harvest"] as const) {
    app.post(`/api/pet-park/garden/plots/:plotId/${action}`, isAuthenticated, async (req, res) => {
      const plotId = req.params.plotId;
      const { requestId, inventoryId } = req.body ?? {};
      if (!validId(plotId) || !validId(inventoryId) ||
          typeof requestId !== "string" || !requestKeyPattern.test(requestId) ||
          !req.body || Object.keys(req.body).some(key => key !== "requestId" && key !== "inventoryId")) {
        return res.status(400).json({ message: "Choose a garden item and a new request ID" });
      }
      const userId = (req.user as { id: string }).id;
      try {
        const response = await database.transaction(async tx => {
          await requireParkAccess(tx, userId, true);
          const [receipt] = await tx.select().from(gardenActionReceipts)
            .where(and(eq(gardenActionReceipts.userId, userId),
              eq(gardenActionReceipts.requestId, requestId)));
          if (receipt) {
            requireAction(receipt.plotItemId === plotId &&
              receipt.action === action && receipt.inventoryId === inventoryId,
            409, "Request ID was already used for a different garden action");
            return { ...receipt.result, replayed: true };
          }
          const [plot] = await tx.select({ id: petParkSceneItems.id })
            .from(petParkSceneItems).where(and(eq(petParkSceneItems.id, plotId),
              eq(petParkSceneItems.kind, "terrain"),
              eq(petParkSceneItems.effectType, "garden_plot")));
          requireAction(plot, 404, "This Garden Plot is no longer available");

          const [existing] = await tx.select().from(gardenPlayerPlots)
            .where(and(eq(gardenPlayerPlots.userId, userId),
              eq(gardenPlayerPlots.plotItemId, plotId))).for("update");
          const now = clock();
          const previous = currentPlot(plotId, existing, now);
          const { inventory, item } = await ownedEquipment(tx, userId, inventoryId);
          let values: Pick<SavedPlot, "phase" | "cropId" | "waterApplied" | "harvestReady" | "pickedUntil">;
          let reward: { fruitItemId: string; quantity: number } | undefined;
          let remainingQuantity: number | undefined;
          let waterLeft: number | undefined;
          let waterUsed: number | undefined;

          if (action === "hoe") {
            requireAction(item.type === "garden_tool" && item.specialType === "hoe",
              422, "Choose a Hoe from your inventory");
            requireAction(previous.phase === "empty", 409, "This plot is not empty");
            values = { phase: "tilled", cropId: null, waterApplied: 0, harvestReady: false, pickedUntil: null };
          } else if (action === "plant") {
            requireAction(item.type === "garden_seed", 422, "Choose an owned Seed Pack");
            requireAction(previous.phase === "tilled", 409, "Prepare the soil with a Hoe first");
            const [crop] = await tx.select().from(gardenCrops)
              .where(eq(gardenCrops.seedItemId, item.id));
            requireAction(crop, 422, "This Seed Pack has no garden crop");
            const [fruit] = await tx.select({
              id: shopItems.id, name: shopItems.name, type: shopItems.type, imageUrl: shopItems.imageUrl,
            }).from(shopItems).where(eq(shopItems.id, crop.fruitItemId));
            const [seed] = await tx.select({
              id: shopItems.id, name: shopItems.name, type: shopItems.type, imageUrl: shopItems.imageUrl,
            }).from(shopItems).where(eq(shopItems.id, item.id));
            requireAction(cropArt(crop, seed, fruit).ready, 422, "This crop still needs its stage artwork");
            const consumed = await tryConsumeOneFromInventory(tx, userId, inventoryId);
            requireAction(consumed.consumed, 409, "Seed Pack is no longer available");
            remainingQuantity = consumed.remainingQuantity;
            values = { phase: "planted", cropId: crop.id, waterApplied: 0, harvestReady: false, pickedUntil: null };
          } else if (action === "water") {
            requireAction(item.type === "garden_tool" && item.specialType === "watering_pail" &&
              item.specialAmount === GARDEN_WATER_CAPACITY,
            422, "Choose a 100-drop Watering Pail");
            requireAction(previous.cropId && ["planted", "seedling", "partial", "grown"].includes(previous.phase) &&
              !previous.harvestReady, 409, "This crop cannot be watered");
            const [crop] = await tx.select().from(gardenCrops).where(eq(gardenCrops.id, previous.cropId!));
            requireAction(crop, 409, "This crop no longer exists");
            const remaining = inventory.gardenWaterLeft ?? GARDEN_WATER_CAPACITY;
            requireAction(Number.isSafeInteger(remaining) && remaining > 0 &&
              remaining <= GARDEN_WATER_CAPACITY, 409, "The Watering Pail is empty");
            // A single tap pours at most ten drops. The server decides the
            // exact debit and stops at the NEXT stage boundary; no client
            // stage skip, free watering, or surplus-drop loss is possible.
            const { growth, dropsUsed } = gardenAfterWaterPour(previous, {
              planted: crop.plantedDrops, seedling: crop.seedlingDrops,
              partial: crop.partialDrops, grown: crop.grownDrops,
            }, remaining);
            const [charged] = await tx.update(userInventory).set({
              gardenWaterLeft: sql`COALESCE(${userInventory.gardenWaterLeft}, ${GARDEN_WATER_CAPACITY}) - ${dropsUsed}`,
            }).where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId),
              eq(userInventory.isListed, false),
              sql`COALESCE(${userInventory.gardenWaterLeft}, ${GARDEN_WATER_CAPACITY}) >= ${dropsUsed}`))
              .returning({ gardenWaterLeft: userInventory.gardenWaterLeft });
            requireAction(charged, 409, "The Watering Pail does not have enough water");
            waterLeft = charged.gardenWaterLeft ?? undefined;
            waterUsed = dropsUsed;
            values = { ...growth, cropId: crop.id, pickedUntil: null };
          } else {
            requireAction(item.type === "garden_tool" && item.specialType === "scythe",
              422, "Choose a Scythe from your inventory");
            requireAction(previous.phase === "grown" && previous.harvestReady && previous.cropId,
              409, "This crop is not ready for harvesting");
            const [crop] = await tx.select().from(gardenCrops).where(eq(gardenCrops.id, previous.cropId!));
            requireAction(crop, 409, "This crop no longer exists");
            const [fruit] = await tx.select({ id: shopItems.id, type: shopItems.type }).from(shopItems)
              .where(eq(shopItems.id, crop.fruitItemId));
            requireAction(fruit?.type === "garden_fruit", 409, "Garden fruit is not available");
            const quantity = gardenHarvestQuantity(random());
            // Reuse the ordinary unlisted inventory stack, never marketplace escrow.
            const [stack] = await tx.select({ id: userInventory.id }).from(userInventory).where(and(
              eq(userInventory.userId, userId), eq(userInventory.shopItemId, fruit.id),
              eq(userInventory.isListed, false), sql`${userInventory.quantity} > 0`,
            )).orderBy(userInventory.acquiredAt, userInventory.id).limit(1).for("update");
            if (stack) {
              await tx.update(userInventory).set({ quantity: sql`${userInventory.quantity} + ${quantity}` })
                .where(and(eq(userInventory.id, stack.id), eq(userInventory.userId, userId)));
            } else {
              await tx.insert(userInventory).values({ userId, shopItemId: fruit.id, quantity });
            }
            reward = { fruitItemId: fruit.id, quantity };
            values = { phase: "picked", cropId: crop.id, waterApplied: 0,
              harvestReady: false, pickedUntil: new Date(now.getTime() + GARDEN_PICKED_COOLDOWN_MS) };
          }

          const saved = await savePlot(tx, userId, plotId, existing, values);
          const result = {
            plot: currentPlot(plotId, saved, now),
            ...(remainingQuantity !== undefined ? { remainingQuantity } : {}),
            ...(waterLeft !== undefined ? { waterLeft, waterUsed } : {}),
            ...(reward ? { reward } : {}),
            replayed: false,
          };
          // A Watering Pail can spend thousands of drops across many crops.
          // Prune only this owner's stale retry receipts at the start of a
          // new crop cycle, not on every touch/water operation.
          if (action === "hoe") {
            await tx.delete(gardenActionReceipts).where(and(
              eq(gardenActionReceipts.userId, userId),
              lt(gardenActionReceipts.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
            ));
          }
          await tx.insert(gardenActionReceipts).values({
            userId, requestId, plotItemId: plotId, action, inventoryId, result,
          });
          return result;
        });
        return res.json(response);
      } catch (error) {
        if (error instanceof GardenActionError)
          return res.status(error.status).json({ message: error.message });
        console.error(`[garden] ${action} failed`, error);
        return res.status(500).json({ message: "Garden action could not be completed" });
      }
    });
  }
}
