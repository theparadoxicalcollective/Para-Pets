import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin, requireAuthenticated } from "../auth";
import {
  miniPetDefinitions,
  miniPetParts,
  petEquippedMiniPets,
  shopItems,
  userInventory,
} from "@shared/schema";
import { miniPetCreateSchema, miniPetPartSchema, miniPetUpdateSchema } from "@shared/miniPet";

async function getEquippedMiniPet(petInventoryId: string) {
  const [equipped] = await db.select({
    inventoryId: petEquippedMiniPets.miniPetInventoryId,
    shopItemId: shopItems.id,
    name: shopItems.name,
    imageUrl: shopItems.imageUrl,
    rarity: shopItems.starRarity,
    atkBoost: shopItems.atkBoost,
    healthBoost: shopItems.healthBoost,
    defBoost: shopItems.defBoost,
    animationStyle: miniPetDefinitions.animationStyle,
  }).from(petEquippedMiniPets)
    .innerJoin(userInventory, eq(userInventory.id, petEquippedMiniPets.miniPetInventoryId))
    .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
    .innerJoin(miniPetDefinitions, eq(miniPetDefinitions.shopItemId, shopItems.id))
    .where(eq(petEquippedMiniPets.petInventoryId, petInventoryId))
    .limit(1);
  if (!equipped) return null;
  const parts = await db.select().from(miniPetParts)
    .where(eq(miniPetParts.shopItemId, equipped.shopItemId));
  return { ...equipped, parts };
}

export function registerMiniPetRoutes(app: Express, processImage: (data: string) => Promise<string>) {
  app.get("/api/admin/mini-pets", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const pets = await db.select({
        shopItemId: shopItems.id,
        name: shopItems.name,
        imageUrl: shopItems.imageUrl,
        price: shopItems.price,
        rarity: shopItems.starRarity,
        atkBoost: shopItems.atkBoost,
        healthBoost: shopItems.healthBoost,
        defBoost: shopItems.defBoost,
        animationStyle: miniPetDefinitions.animationStyle,
      }).from(miniPetDefinitions)
        .innerJoin(shopItems, eq(shopItems.id, miniPetDefinitions.shopItemId));
      const parts = await db.select().from(miniPetParts);
      return res.json(pets.map(pet => ({
        ...pet,
        parts: parts.filter(part => part.shopItemId === pet.shopItemId),
      })));
    } catch (error) {
      console.error("[mini-pets] admin list failed", error);
      return res.status(500).json({ message: "Failed to load Mini Pets" });
    }
  });

  app.post("/api/admin/mini-pets", requireAdmin, async (req: Request, res: Response) => {
    const parsed = miniPetCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid Mini Pet" });
    try {
      const imageUrl = await processImage(parsed.data.imageData);
      const created = await db.transaction(async tx => {
        const [item] = await tx.insert(shopItems).values({
          name: parsed.data.name,
          price: parsed.data.price,
          type: "mini_pet",
          worldId: "mini-pets",
          imageUrl,
          rarity: parsed.data.rarity,
          starRarity: parsed.data.rarity,
          atkBoost: parsed.data.atkBoost,
          healthBoost: parsed.data.healthBoost,
          defBoost: parsed.data.defBoost,
        }).returning();
        await tx.insert(miniPetDefinitions).values({
          shopItemId: item.id,
          animationStyle: parsed.data.animationStyle,
        });
        return item;
      });
      return res.status(201).json(created);
    } catch (error) {
      console.error("[mini-pets] create failed", error);
      return res.status(500).json({ message: "Failed to create Mini Pet" });
    }
  });

  app.patch("/api/admin/mini-pets/:shopItemId", requireAdmin, async (req: Request, res: Response) => {
    const parsed = miniPetUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid Mini Pet" });
    const shopItemId = String(req.params.shopItemId);
    try {
      const [definition] = await db.select().from(miniPetDefinitions)
        .where(eq(miniPetDefinitions.shopItemId, shopItemId)).limit(1);
      if (!definition) return res.status(404).json({ message: "Mini Pet not found" });
      const imageUrl = parsed.data.imageData ? await processImage(parsed.data.imageData) : undefined;
      const [updated] = await db.transaction(async tx => {
        const currentResult = await tx.execute(sql`
          SELECT atk_boost, health_boost, def_boost FROM shop_items
          WHERE id=${shopItemId} AND type='mini_pet' FOR UPDATE
        `);
        const current = currentResult.rows[0] as any;
        if (!current) throw Object.assign(new Error("Mini Pet not found"), { status: 404 });
        const [item] = await tx.update(shopItems).set({
          name: parsed.data.name,
          price: parsed.data.price,
          rarity: parsed.data.rarity,
          starRarity: parsed.data.rarity,
          atkBoost: parsed.data.atkBoost,
          healthBoost: parsed.data.healthBoost,
          defBoost: parsed.data.defBoost,
          ...(imageUrl ? { imageUrl } : {}),
        }).where(and(eq(shopItems.id, shopItemId), eq(shopItems.type, "mini_pet"))).returning();
        await tx.update(miniPetDefinitions).set({
          animationStyle: parsed.data.animationStyle,
          updatedAt: new Date(),
        }).where(eq(miniPetDefinitions.shopItemId, shopItemId));
        const atkDelta = parsed.data.atkBoost - Number(current.atk_boost || 0);
        const hpDelta = parsed.data.healthBoost - Number(current.health_boost || 0);
        const defDelta = parsed.data.defBoost - Number(current.def_boost || 0);
        if (atkDelta || hpDelta || defDelta) {
          await tx.execute(sql`
            UPDATE user_inventory pet SET
              pet_atk=GREATEST(0,pet.pet_atk+${atkDelta}),
              pet_health=GREATEST(0,pet.pet_health+${hpDelta}),
              pet_def=GREATEST(0,pet.pet_def+${defDelta})
            FROM pet_equipped_mini_pets equipped
            JOIN user_inventory mini ON mini.id=equipped.mini_pet_inventory_id
            WHERE pet.id=equipped.pet_inventory_id AND mini.shop_item_id=${shopItemId}
          `);
        }
        return [item];
      });
      return res.json(updated);
    } catch (error: any) {
      console.error("[mini-pets] update failed", error);
      return res.status(error.status ?? 500).json({ message: error.status ? error.message : "Failed to update Mini Pet" });
    }
  });

  app.post("/api/admin/mini-pets/:shopItemId/parts", requireAdmin, async (req: Request, res: Response) => {
    const parsed = miniPetPartSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid Mini Pet part" });
    try {
      const [definition] = await db.select().from(miniPetDefinitions)
        .where(eq(miniPetDefinitions.shopItemId, String(req.params.shopItemId))).limit(1);
      if (!definition) return res.status(404).json({ message: "Mini Pet not found" });
      const imageUrl = await processImage(parsed.data.imageData);
      const [part] = await db.insert(miniPetParts).values({
        shopItemId: definition.shopItemId,
        partType: parsed.data.partType,
        imageUrl,
      }).onConflictDoUpdate({
        target: [miniPetParts.shopItemId, miniPetParts.partType],
        set: { imageUrl },
      }).returning();
      return res.json(part);
    } catch (error) {
      console.error("[mini-pets] part save failed", error);
      return res.status(500).json({ message: "Failed to save Mini Pet part" });
    }
  });

  app.delete("/api/admin/mini-pets/:shopItemId", requireAdmin, async (req: Request, res: Response) => {
    const shopItemId = String(req.params.shopItemId);
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(userInventory)
        .where(eq(userInventory.shopItemId, shopItemId));
      if (Number(count) > 0) return res.status(409).json({ message: "This Mini Pet is owned by players and cannot be deleted" });
      await db.delete(shopItems).where(and(eq(shopItems.id, shopItemId), eq(shopItems.type, "mini_pet")));
      return res.json({ success: true });
    } catch (error) {
      console.error("[mini-pets] delete failed", error);
      return res.status(500).json({ message: "Failed to delete Mini Pet" });
    }
  });

  app.get("/api/mini-pets/inventory", requireAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as { id: string };
    try {
      const rows = await db.select({
        inventoryId: userInventory.id,
        isListed: userInventory.isListed,
        name: shopItems.name,
        imageUrl: shopItems.imageUrl,
        rarity: shopItems.starRarity,
        atkBoost: shopItems.atkBoost,
        healthBoost: shopItems.healthBoost,
        defBoost: shopItems.defBoost,
        animationStyle: miniPetDefinitions.animationStyle,
      }).from(userInventory)
        .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
        .innerJoin(miniPetDefinitions, eq(miniPetDefinitions.shopItemId, shopItems.id))
        .where(and(eq(userInventory.userId, user.id), eq(shopItems.type, "mini_pet")));
      const equipped = await db.select({ inventoryId: petEquippedMiniPets.miniPetInventoryId }).from(petEquippedMiniPets)
        .innerJoin(userInventory, eq(userInventory.id, petEquippedMiniPets.petInventoryId))
        .where(eq(userInventory.userId, user.id));
      const equippedIds = new Set(equipped.map(row => row.inventoryId));
      return res.json(rows.map(row => ({ ...row, isEquipped: equippedIds.has(row.inventoryId) })));
    } catch (error) {
      console.error("[mini-pets] inventory failed", error);
      return res.status(500).json({ message: "Failed to load Mini Pets" });
    }
  });

  app.get("/api/pet/:petInventoryId/mini-pet", requireAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as { id: string };
    const petInventoryId = String(req.params.petInventoryId);
    try {
      const [pet] = await db.select({ id: userInventory.id }).from(userInventory)
        .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
        .where(and(eq(userInventory.id, petInventoryId), eq(userInventory.userId, user.id), eq(shopItems.type, "pet"))).limit(1);
      if (!pet) return res.status(404).json({ message: "Pet not found" });
      return res.json({ equipped: await getEquippedMiniPet(petInventoryId) });
    } catch (error) {
      console.error("[mini-pets] equipped load failed", error);
      return res.status(500).json({ message: "Failed to load equipped Mini Pet" });
    }
  });

  app.post("/api/pet/:petInventoryId/mini-pet/equip", requireAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as { id: string };
    const petInventoryId = String(req.params.petInventoryId);
    const miniPetInventoryId = typeof req.body?.miniPetInventoryId === "string" ? req.body.miniPetInventoryId : "";
    if (!miniPetInventoryId) return res.status(400).json({ message: "miniPetInventoryId is required" });
    try {
      await db.transaction(async tx => {
        const petResult = await tx.execute(sql`
          SELECT ui.id FROM user_inventory ui JOIN shop_items si ON si.id=ui.shop_item_id
          WHERE ui.id=${petInventoryId} AND ui.user_id=${user.id} AND si.type='pet' AND ui.is_hatched=true FOR UPDATE
        `);
        if (!petResult.rows[0]) throw Object.assign(new Error("Pet not found"), { status: 404 });
        const miniResult = await tx.execute(sql`
          SELECT ui.id, si.atk_boost, si.health_boost, si.def_boost
          FROM user_inventory ui JOIN shop_items si ON si.id=ui.shop_item_id
          WHERE ui.id=${miniPetInventoryId} AND ui.user_id=${user.id} AND si.type='mini_pet' AND ui.is_listed=false FOR UPDATE
        `);
        const mini = miniResult.rows[0] as any;
        if (!mini) throw Object.assign(new Error("Mini Pet not found or unavailable"), { status: 404 });
        const elsewhere = await tx.execute(sql`SELECT pet_inventory_id FROM pet_equipped_mini_pets WHERE mini_pet_inventory_id=${miniPetInventoryId} FOR UPDATE`);
        if (elsewhere.rows[0] && (elsewhere.rows[0] as any).pet_inventory_id !== petInventoryId) {
          throw Object.assign(new Error("That Mini Pet is already equipped"), { status: 409 });
        }
        const oldResult = await tx.execute(sql`
          SELECT pem.mini_pet_inventory_id, si.atk_boost, si.health_boost, si.def_boost
          FROM pet_equipped_mini_pets pem
          JOIN user_inventory ui ON ui.id=pem.mini_pet_inventory_id
          JOIN shop_items si ON si.id=ui.shop_item_id
          WHERE pem.pet_inventory_id=${petInventoryId} FOR UPDATE
        `);
        const old = oldResult.rows[0] as any;
        if (old?.mini_pet_inventory_id === miniPetInventoryId) return;
        const atkDelta = Number(mini.atk_boost || 0) - Number(old?.atk_boost || 0);
        const hpDelta = Number(mini.health_boost || 0) - Number(old?.health_boost || 0);
        const defDelta = Number(mini.def_boost || 0) - Number(old?.def_boost || 0);
        await tx.execute(sql`UPDATE user_inventory SET
          pet_atk=GREATEST(0,pet_atk+${atkDelta}), pet_health=GREATEST(0,pet_health+${hpDelta}),
          pet_def=GREATEST(0,pet_def+${defDelta}) WHERE id=${petInventoryId}`);
        await tx.execute(sql`
          INSERT INTO pet_equipped_mini_pets(pet_inventory_id,mini_pet_inventory_id)
          VALUES(${petInventoryId},${miniPetInventoryId})
          ON CONFLICT(pet_inventory_id) DO UPDATE SET mini_pet_inventory_id=EXCLUDED.mini_pet_inventory_id, created_at=now()
        `);
      });
      return res.json({ equipped: await getEquippedMiniPet(petInventoryId) });
    } catch (error: any) {
      console.error("[mini-pets] equip failed", error);
      return res.status(error.status ?? 500).json({ message: error.status ? error.message : "Failed to equip Mini Pet" });
    }
  });

  app.delete("/api/pet/:petInventoryId/mini-pet", requireAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as { id: string };
    const petInventoryId = String(req.params.petInventoryId);
    try {
      await db.transaction(async tx => {
        const petResult = await tx.execute(sql`SELECT id FROM user_inventory WHERE id=${petInventoryId} AND user_id=${user.id} FOR UPDATE`);
        if (!petResult.rows[0]) throw Object.assign(new Error("Pet not found"), { status: 404 });
        const oldResult = await tx.execute(sql`
          SELECT si.atk_boost, si.health_boost, si.def_boost FROM pet_equipped_mini_pets pem
          JOIN user_inventory ui ON ui.id=pem.mini_pet_inventory_id JOIN shop_items si ON si.id=ui.shop_item_id
          WHERE pem.pet_inventory_id=${petInventoryId} FOR UPDATE
        `);
        const old = oldResult.rows[0] as any;
        if (!old) return;
        await tx.execute(sql`UPDATE user_inventory SET
          pet_atk=GREATEST(0,pet_atk-${Number(old.atk_boost || 0)}),
          pet_health=GREATEST(0,pet_health-${Number(old.health_boost || 0)}),
          pet_def=GREATEST(0,pet_def-${Number(old.def_boost || 0)})
          WHERE id=${petInventoryId}`);
        await tx.delete(petEquippedMiniPets).where(eq(petEquippedMiniPets.petInventoryId, petInventoryId));
      });
      return res.json({ equipped: null });
    } catch (error: any) {
      console.error("[mini-pets] unequip failed", error);
      return res.status(error.status ?? 500).json({ message: error.status ? error.message : "Failed to unequip Mini Pet" });
    }
  });
}
