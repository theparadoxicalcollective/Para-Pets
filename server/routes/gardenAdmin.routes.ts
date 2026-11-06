import type { Express, RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";
import { gardenCrops, shopItems } from "@shared/schema";
import {
  GARDEN_IMAGE_KEYS, GARDEN_TOOL_OPTIONS, GARDEN_WATER_CAPACITY,
  isCompleteGardenCrop, validGardenArtwork, validGardenDrops, validGardenPrice,
  type GardenImageKey, type GardenToolKind,
} from "@shared/garden";
import type { db as database } from "../db";

type AdminDependencies = {
  db: typeof database;
  isAdmin: RequestHandler;
  processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
};
const validName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
const validDescription = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 600;
const gardenImageKeys = GARDEN_IMAGE_KEYS as readonly string[];
const optionalArt = (value: unknown): boolean => value == null || validGardenArtwork(value);

function imagePayload(body: Record<string, unknown>): Record<GardenImageKey, string | null> | null {
  const result = {} as Record<GardenImageKey, string | null>;
  for (const key of GARDEN_IMAGE_KEYS) {
    const value = body[key + "ImageData"];
    if (!optionalArt(value)) return null;
    result[key] = typeof value === "string" ? value : null;
  }
  return result;
}
export function registerGardenAdminRoutes(app: Express, { db, isAdmin, processWorldImage }: AdminDependencies): void {
  app.get("/api/admin/garden", isAdmin, async (_req, res) => {
    try {
      const [crops, catalog] = await Promise.all([
        db.select().from(gardenCrops),
        db.select({
          id: shopItems.id, name: shopItems.name, description: shopItems.description,
          price: shopItems.price, type: shopItems.type, specialType: shopItems.specialType,
          specialAmount: shopItems.specialAmount, imageUrl: shopItems.imageUrl,
          worldId: shopItems.worldId,
        }).from(shopItems).where(inArray(shopItems.type, ["garden_tool", "garden_seed", "garden_fruit"])),
      ]);
      const byId = new Map(catalog.map(item => [item.id, item]));
      return res.json({
        tools: catalog.filter(item => item.type === "garden_tool"),
        crops: crops.map(crop => {
          const seedItem = byId.get(crop.seedItemId);
          const fruitItem = byId.get(crop.fruitItemId);
          const images = {
            seedPack: seedItem?.imageUrl ?? null,
            planted: crop.plantedImageUrl, seedling: crop.seedlingImageUrl,
            partial: crop.partialImageUrl, grown: crop.grownImageUrl,
            picked: crop.pickedImageUrl, fruit: fruitItem?.imageUrl ?? null,
          };
          return { ...crop, seedItem, fruitItem,
            ready: isCompleteGardenCrop({ images, drops: [
              crop.plantedDrops, crop.seedlingDrops, crop.partialDrops, crop.grownDrops,
            ] }),
          };
        }),
      });
    } catch (error) {
      console.error("[garden] admin catalog read failed", error);
      return res.status(500).json({ message: "Unable to load garden items" });
    }
  });

  app.post("/api/admin/garden/tools", isAdmin, async (req, res) => {
    const { kind, name, description = "", price = 0, imageData } = req.body ?? {};
    const tool = GARDEN_TOOL_OPTIONS.find(candidate => candidate.key === kind);
    if (!tool || (name != null && !validName(name)) || !validDescription(description) ||
        !validGardenPrice(price) || !validGardenArtwork(imageData)) {
      return res.status(400).json({ message: "Provide a valid garden tool, price and image" });
    }
    try {
      const imageUrl = await processWorldImage(imageData, 1000);
      const [item] = await db.insert(shopItems).values({
        name: name?.trim() || tool.label, description: description || tool.description,
        worldId: "all", type: "garden_tool", imageUrl, price,
        specialType: kind as GardenToolKind,
        specialAmount: kind === "watering_pail" ? GARDEN_WATER_CAPACITY : null,
      }).returning();
      return res.status(201).json(item);
    } catch (error) {
      console.error("[garden] tool create failed", error);
      return res.status(500).json({ message: "Could not add garden tool" });
    }
  });

  app.post("/api/admin/garden/crops", isAdmin, async (req, res) => {
    const body = req.body ?? {};
    const { name, fruitName, description = "", price = 0 } = body;
    const images = imagePayload(body);
    const drops = [body.plantedDrops, body.seedlingDrops, body.partialDrops, body.grownDrops];
    if (!validName(name) || !validName(fruitName) || !validDescription(description) ||
        !validGardenPrice(price) || !images || !images.seedPack || !images.fruit ||
        !drops.every(validGardenDrops)) {
      return res.status(400).json({ message: "Seed pack, fruit, names and watering amounts are required" });
    }
    try {
      const saved = {} as Record<GardenImageKey, string | null>;
      for (const key of gardenImageKeys as GardenImageKey[]) {
        saved[key] = images[key] ? await processWorldImage(images[key], 1200) : null;
      }
      const result = await db.transaction(async tx => {
        const [seed] = await tx.insert(shopItems).values({
          name: name.trim(), description: description || null,
          price, type: "garden_seed", worldId: "all", imageUrl: saved.seedPack,
        }).returning();
        const [fruit] = await tx.insert(shopItems).values({
          name: fruitName.trim(), description: `Harvested from ${name.trim()}.`,
          price: 0, type: "garden_fruit", worldId: "garden_harvest_only", imageUrl: saved.fruit,
        }).returning();
        const [crop] = await tx.insert(gardenCrops).values({
          seedItemId: seed.id, fruitItemId: fruit.id,
          plantedImageUrl: saved.planted, seedlingImageUrl: saved.seedling,
          partialImageUrl: saved.partial, grownImageUrl: saved.grown,
          pickedImageUrl: saved.picked,
          plantedDrops: body.plantedDrops, seedlingDrops: body.seedlingDrops,
          partialDrops: body.partialDrops, grownDrops: body.grownDrops,
        }).returning();
        return { crop, seed, fruit };
      });
      return res.status(201).json(result);
    } catch (error) {
      console.error("[garden] seed create failed", error);
      return res.status(500).json({ message: "Could not create garden seed" });
    }
  });

  app.patch("/api/admin/garden/crops/:id", isAdmin, async (req, res) => {
    const body = req.body ?? {};
    const images = imagePayload(body);
    if (!images || (body.name != null && !validName(body.name)) ||
        (body.fruitName != null && !validName(body.fruitName)) ||
        (body.description != null && !validDescription(body.description)) ||
        (body.price != null && !validGardenPrice(body.price)) ||
        !["planted", "seedling", "partial", "grown"].every(key =>
          body[key + "Drops"] == null || validGardenDrops(body[key + "Drops"]))) {
      return res.status(400).json({ message: "Invalid garden seed update" });
    }
    try {
      const [existing] = await db.select().from(gardenCrops).where(eq(gardenCrops.id, String(req.params.id)));
      if (!existing) return res.status(404).json({ message: "Garden seed not found" });
      const saved = {} as Record<GardenImageKey, string>;
      for (const key of gardenImageKeys as GardenImageKey[]) {
        if (images[key]) saved[key] = await processWorldImage(images[key]!, 1200);
      }
      const result = await db.transaction(async tx => {
        if (body.name != null || body.description != null || body.price != null || saved.seedPack) {
          await tx.update(shopItems).set({
            ...(body.name != null ? { name: body.name.trim() } : {}),
            ...(body.description != null ? { description: body.description } : {}),
            ...(body.price != null ? { price: body.price } : {}),
            ...(saved.seedPack ? { imageUrl: saved.seedPack } : {}),
          }).where(eq(shopItems.id, existing.seedItemId));
        }
        if (body.fruitName != null || saved.fruit) {
          await tx.update(shopItems).set({
            ...(body.fruitName != null ? { name: body.fruitName.trim() } : {}),
            ...(saved.fruit ? { imageUrl: saved.fruit } : {}),
          }).where(eq(shopItems.id, existing.fruitItemId));
        }
        const [crop] = await tx.update(gardenCrops).set({
          ...(saved.planted ? { plantedImageUrl: saved.planted } : {}),
          ...(saved.seedling ? { seedlingImageUrl: saved.seedling } : {}),
          ...(saved.partial ? { partialImageUrl: saved.partial } : {}),
          ...(saved.grown ? { grownImageUrl: saved.grown } : {}),
          ...(saved.picked ? { pickedImageUrl: saved.picked } : {}),
          ...(body.plantedDrops != null ? { plantedDrops: body.plantedDrops } : {}),
          ...(body.seedlingDrops != null ? { seedlingDrops: body.seedlingDrops } : {}),
          ...(body.partialDrops != null ? { partialDrops: body.partialDrops } : {}),
          ...(body.grownDrops != null ? { grownDrops: body.grownDrops } : {}),
          updatedAt: new Date(),
        }).where(eq(gardenCrops.id, existing.id)).returning();
        return crop;
      });
      return res.json(result);
    } catch (error) {
      console.error("[garden] seed edit failed", error);
      return res.status(500).json({ message: "Could not update garden seed" });
    }
  });
}
