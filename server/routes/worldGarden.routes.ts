import type { Express, RequestHandler } from "express";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  worldGardenActionReceipts, gardenCrops, worldGardenPlayerPlots, worldScenePlacements,
  shopItems, userInventory, users,
} from "@shared/schema";
import {
  GARDEN_PICKED_COOLDOWN_MS, GARDEN_WATER_CAPACITY,
  gardenAfterWaterPour, gardenAfterPassiveTime, gardenEffectivePhase, gardenHarvestQuantity,
  isCompleteGardenCrop, type GardenPlotPhase,
} from "@shared/garden";
import { tryConsumeOneFromInventory } from "../inventoryConsumption";
import { db } from "../db";
import { isEditableWorldSceneId } from "@shared/worlds/worldSceneDraft";

type GardenTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GardenAction = "hoe" | "plant" | "water" | "harvest";
type SavedPlot = typeof worldGardenPlayerPlots.$inferSelect;
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
function cropRequirements(crop: SavedCrop) {
  return { planted: crop.plantedDrops, seedling: crop.seedlingDrops,
    partial: crop.partialDrops, grown: crop.grownDrops };
}
function currentPlot(plotItemId: string, saved: SavedPlot | undefined, now: Date, crop?: SavedCrop) {
  const phase = gardenEffectivePhase((saved?.phase ?? "empty") as GardenPlotPhase, saved?.pickedUntil, now);
  const reset = phase === "empty";
  const growth = {
    phase, waterApplied: reset ? 0 : saved?.waterApplied ?? 0,
    harvestReady: reset ? false : saved?.harvestReady ?? false,
  };
  // Read-only resolution of elapsed hours: no cron, background job or
  // unguarded GET mutations. POST actions resolve the same growth under lock.
  const natural = crop && saved?.passiveGrowthAt
    ? gardenAfterPassiveTime(growth, cropRequirements(crop), saved.passiveGrowthAt, now).growth
    : growth;
  return {
    plotItemId, ...natural, cropId: reset ? null : saved?.cropId ?? null,
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
async function requireWorldPreviewAccess(tx: GardenTx, userId: string, lock: boolean) {
  // Lock the same users row as Pet Park before consuming shared inventory.
  // Private draft worlds are not publicly accessible until a later release.
  const query = tx.select({ id: users.id, isAdmin: users.isAdmin })
    .from(users).where(eq(users.id, userId));
  const [player] = lock ? await query.for("update") : await query;
  requireAction(player, 404, "Player not found");
  requireAction(player.isAdmin, 403, "Unpublished worlds are admin-only");
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
async function savePlot(tx: GardenTx, userId: string, worldId: string, plotId: string, existing: SavedPlot | undefined,
  values: Pick<SavedPlot, "phase" | "cropId" | "waterApplied" | "harvestReady" | "pickedUntil">,
  passiveGrowthAt: Date | null, now: Date) {
  const [saved] = existing
    ? await tx.update(worldGardenPlayerPlots).set({ ...values, passiveGrowthAt, updatedAt: now })
      .where(and(eq(worldGardenPlayerPlots.id, existing.id), eq(worldGardenPlayerPlots.userId, userId),
        eq(worldGardenPlayerPlots.worldId, worldId))).returning()
    : await tx.insert(worldGardenPlayerPlots).values({ userId, worldId, plotItemId: plotId, ...values, passiveGrowthAt }).returning();
  requireAction(saved, 409, "Garden state changed; reload the plot");
  return saved;
}

/** The independent private-world garden route uses the SAME shared catalog,
 * inventory consumption, water capacity, growth and harvest rules as Pet Park.
 * It writes only world-specific plot/receipt tables; world drafts remain admin-only.
 * A receipt and all state/inventory writes commit together or not at all.
 */
export function registerWorldGardenRoutes(
  app: Express, isAuthenticated: RequestHandler,
  database: typeof db = db,
  random: () => number = Math.random,
  clock: () => Date = () => new Date(),
): void {
  app.get("/api/admin/world-editor/:worldId/garden", isAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    const userId = (req.user as { id: string }).id;
    try {
      const data = await database.transaction(async tx => {
        await requireWorldPreviewAccess(tx, userId, false);
        const [plots, ownStates, crops] = await Promise.all([
          tx.select({ id: worldScenePlacements.id, xPct: worldScenePlacements.xPct,
            yPct: worldScenePlacements.yPct, size: worldScenePlacements.size })
            .from(worldScenePlacements).where(and(
              eq(worldScenePlacements.worldId, worldId),
              eq(worldScenePlacements.kind, "terrain"),
              eq(worldScenePlacements.effectType, "garden_plot"),
            )),
          tx.select().from(worldGardenPlayerPlots).where(and(
            eq(worldGardenPlayerPlots.userId, userId), eq(worldGardenPlayerPlots.worldId, worldId))),
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
        const cropsById = new Map(crops.map(crop => [crop.id, crop]));
        const now = clock();
        return {
          serverNow: now.toISOString(),
          plots: plots.map(plot => {
            const saved = byPlot.get(plot.id);
            return { ...plot, ...currentPlot(plot.id, saved, now, cropsById.get(saved?.cropId ?? "")) };
          }),
          crops: crops.map(crop => cropArt(crop, byItem.get(crop.seedItemId), byItem.get(crop.fruitItemId)))
            .filter(crop => crop.ready),
        };
      });
      return res.json(data);
    } catch (error) {
      if (error instanceof GardenActionError)
        return res.status(error.status).json({ message: error.message });
      console.error("[world-garden] state read failed", error);
      return res.status(500).json({ message: "Unable to load garden" });
    }
  });

  for (const action of ["hoe", "plant", "water", "harvest"] as const) {
    app.post(`/api/admin/world-editor/:worldId/garden/plots/:plotId/${action}`, isAuthenticated, async (req, res) => {
      const worldId = req.params.worldId;
      if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId))
        return res.status(404).json({ message: "Unknown world" });
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
          await requireWorldPreviewAccess(tx, userId, true);
          const [receipt] = await tx.select().from(worldGardenActionReceipts)
            .where(and(eq(worldGardenActionReceipts.userId, userId),
              eq(worldGardenActionReceipts.requestId, requestId)));
          if (receipt) {
            requireAction(receipt.worldId === worldId && receipt.plotItemId === plotId &&
              receipt.action === action && receipt.inventoryId === inventoryId,
            409, "Request ID was already used for a different garden action");
            return { ...receipt.result, replayed: true };
          }
          const [plot] = await tx.select({ id: worldScenePlacements.id })
            .from(worldScenePlacements).where(and(eq(worldScenePlacements.id, plotId),
              eq(worldScenePlacements.worldId, worldId),
              eq(worldScenePlacements.kind, "terrain"),
              eq(worldScenePlacements.effectType, "garden_plot")));
          requireAction(plot, 404, "This Garden Plot is no longer available");

          const [existing] = await tx.select().from(worldGardenPlayerPlots)
            .where(and(eq(worldGardenPlayerPlots.userId, userId),
              eq(worldGardenPlayerPlots.worldId, worldId),
              eq(worldGardenPlayerPlots.plotItemId, plotId))).for("update");
          const now = clock();
          const [activeCrop] = existing?.cropId
            ? await tx.select().from(gardenCrops).where(eq(gardenCrops.id, existing.cropId))
            : [undefined];
          const previous = currentPlot(plotId, existing, now, activeCrop);
          const passiveCheckpoint = existing?.passiveGrowthAt && activeCrop
            ? gardenAfterPassiveTime({
                phase: (existing.phase as GardenPlotPhase),
                waterApplied: existing.waterApplied, harvestReady: existing.harvestReady,
              }, cropRequirements(activeCrop), existing.passiveGrowthAt, now).checkpoint
            : existing?.passiveGrowthAt ?? null;
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
            const crop = activeCrop;
            requireAction(crop, 409, "This crop no longer exists");
            const remaining = inventory.gardenWaterLeft ?? GARDEN_WATER_CAPACITY;
            requireAction(Number.isSafeInteger(remaining) && remaining > 0 &&
              remaining <= GARDEN_WATER_CAPACITY, 409, "The Watering Pail is empty");
            // A single tap pours at most ten drops. The server decides the
            // exact debit and stops at the NEXT stage boundary; no client
            // stage skip, free watering, or surplus-drop loss is possible.
            const { growth, dropsUsed } = gardenAfterWaterPour(previous, cropRequirements(crop), remaining);
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
            const crop = activeCrop;
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

          const checkpoint = action === "plant" ? now
            : action === "water" ? passiveCheckpoint ?? now : null;
          const saved = await savePlot(tx, userId, worldId, plotId, existing, values, checkpoint, now);
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
            await tx.delete(worldGardenActionReceipts).where(and(
              eq(worldGardenActionReceipts.userId, userId),
              lt(worldGardenActionReceipts.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
            ));
          }
          await tx.insert(worldGardenActionReceipts).values({
            userId, worldId, requestId, plotItemId: plotId, action, inventoryId, result,
          });
          return result;
        });
        return res.json(response);
      } catch (error) {
        if (error instanceof GardenActionError)
          return res.status(error.status).json({ message: error.message });
        console.error(`[world-garden] ${action} failed`, error);
        return res.status(500).json({ message: "Garden action could not be completed" });
      }
    });
  }
}
