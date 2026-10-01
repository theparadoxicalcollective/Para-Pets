import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";

export interface MixingTreeRecipeRouteDependencies {
  db: typeof database;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
}

/**
 * Mixing Tree recipe catalog, unlock, and admin CRUD routes.
 *
 * This module intentionally preserves the existing route URLs, authentication,
 * response shapes, status codes, and SQL behavior from the legacy registry.
 */
export function registerMixingTreeRecipeRoutes(
  app: Express,
  { db, isAuthenticated, isAdmin }: MixingTreeRecipeRouteDependencies,
): void {
  app.get("/api/recipes", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT r.id, r.result_type, r.recipe_item_id,
          ri.name as recipe_item_name, ri.image_url as recipe_item_image,
          i1.id as ing1_id, i1.name as ing1_name, i1.image_url as ing1_image,
          i2.id as ing2_id, i2.name as ing2_name, i2.image_url as ing2_image,
          i3.id as ing3_id, i3.name as ing3_name, i3.image_url as ing3_image,
          rr.id as result_id, rr.name as result_name, rr.image_url as result_image, rr.type as result_item_type
        FROM mixing_tree_recipes r
        JOIN shop_items i1 ON r.ingredient1_id = i1.id
        JOIN shop_items i2 ON r.ingredient2_id = i2.id
        LEFT JOIN shop_items i3 ON r.ingredient3_id = i3.id
        JOIN shop_items rr ON r.result_id = rr.id
        LEFT JOIN shop_items ri ON r.recipe_item_id = ri.id
        ORDER BY r.created_at
      `);
      return res.json(rows.rows);
    } catch (err) {
      console.error("Get recipes error:", err);
      return res.status(500).json({ message: "Failed to get recipes" });
    }
  });

  app.get("/api/recipes/unlocked", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      const rows = await db.execute(sql`
        SELECT recipe_id FROM player_unlocked_recipes WHERE user_id = ${userId}
      `);
      return res.json((rows.rows as any[]).map((r) => r.recipe_id));
    } catch (err) {
      console.error("Get unlocked recipes error:", err);
      return res.status(500).json({ message: "Failed to get unlocked recipes" });
    }
  });

  app.post("/api/recipes/unlock", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    const { inventoryId } = req.body;
    if (!inventoryId) return res.status(400).json({ message: "inventoryId required" });
    try {
      // Find the inventory item and its shop_item_id
      const invRow = await db.execute(sql`
        SELECT ui.id, ui.shop_item_id FROM user_inventory ui
        WHERE ui.id = ${inventoryId} AND ui.user_id = ${userId}
      `);
      if (!invRow.rows.length) return res.status(404).json({ message: "Item not found" });
      const shopItemId = (invRow.rows[0] as any).shop_item_id;

      // Find the recipe this scroll unlocks
      const recipeRow = await db.execute(sql`
        SELECT r.id, r.result_type,
          ri.image_url as recipe_item_image,
          i1.id as ing1_id, i1.name as ing1_name, i1.image_url as ing1_image,
          i2.id as ing2_id, i2.name as ing2_name, i2.image_url as ing2_image,
          rr.id as result_id, rr.name as result_name, rr.image_url as result_image
        FROM mixing_tree_recipes r
        JOIN shop_items i1 ON r.ingredient1_id = i1.id
        JOIN shop_items i2 ON r.ingredient2_id = i2.id
        JOIN shop_items rr ON r.result_id = rr.id
        LEFT JOIN shop_items ri ON r.recipe_item_id = ri.id
        WHERE r.recipe_item_id = ${shopItemId}
        LIMIT 1
      `);
      if (!recipeRow.rows.length) return res.status(404).json({ message: "No recipe found for this scroll" });
      const recipe = recipeRow.rows[0] as any;

      // Check not already unlocked
      const alreadyRow = await db.execute(sql`
        SELECT 1 FROM player_unlocked_recipes WHERE user_id = ${userId} AND recipe_id = ${recipe.id}
      `);
      if (alreadyRow.rows.length) return res.status(409).json({ message: "Already unlocked", errorCode: "ALREADY_UNLOCKED" });

      // Unlock and consume scroll
      await db.execute(sql`
        INSERT INTO player_unlocked_recipes (user_id, recipe_id) VALUES (${userId}, ${recipe.id})
      `);
      await db.execute(sql`
        DELETE FROM user_inventory WHERE id = ${inventoryId} AND user_id = ${userId}
      `);
      return res.json({ ok: true, recipe });
    } catch (err) {
      console.error("Unlock recipe error:", err);
      return res.status(500).json({ message: "Failed to unlock recipe" });
    }
  });

  app.post("/api/admin/recipes", isAdmin, async (req: any, res) => {
    try {
      const { ingredient1Id, ingredient2Id, ingredient3Id, resultId, resultType, name } = req.body;
      if (!ingredient1Id || !ingredient2Id || !resultId || !resultType) {
        return res.status(400).json({ message: "ingredient1Id, ingredient2Id, resultId and resultType are required" });
      }
      if (!["item","fish","pet"].includes(resultType)) {
        return res.status(400).json({ message: "resultType must be item, fish, or pet" });
      }
      const adminId = req.user!.id;
      const ing3: string | null = ingredient3Id || null;

      // 1. Look up the result item name for the scroll label fallback
      const resultRows = await db.execute(sql`SELECT name FROM shop_items WHERE id = ${resultId}`);
      const resultName: string = (resultRows.rows[0] as any)?.name ?? "Unknown";
      const scrollName: string = (name && typeof name === "string" && name.trim()) ? name.trim() : (resultName + " Recipe Scroll");

      // 2. Create a recipe-type shop item (the scroll) linked to this recipe
      const scrollRows = await db.execute(sql`
        INSERT INTO shop_items (name, price, type, world_id, image_url)
        VALUES (${scrollName}, 0, 'recipe', 'mixing_tree', '/recipe-scroll.png')
        RETURNING id
      `);
      const scrollItemId: string = (scrollRows.rows[0] as any).id;

      // 3. Insert the recipe, linking the scroll as its recipe_item_id
      await db.execute(sql`
        INSERT INTO mixing_tree_recipes (ingredient1_id, ingredient2_id, ingredient3_id, result_id, result_type, recipe_item_id)
        VALUES (${ingredient1Id}, ${ingredient2Id}, ${ing3}, ${resultId}, ${resultType}, ${scrollItemId})
      `);

      // 4. Add one copy of the scroll to the admin's inventory
      await db.execute(sql`
        INSERT INTO user_inventory (user_id, shop_item_id, quantity)
        VALUES (${adminId}, ${scrollItemId}, 1)
      `);

      return res.json({ ok: true, scrollItemId });
    } catch (err) {
      console.error("Add recipe error:", err);
      return res.status(500).json({ message: "Failed to add recipe" });
    }
  });

  app.patch("/api/admin/recipes/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params as Record<string,string>;
      const { ingredient1Id, ingredient2Id, ingredient3Id, resultId, resultType, name } = req.body;

      // Get current recipe to find the scroll shop item
      const curr = await db.execute(sql`SELECT recipe_item_id FROM mixing_tree_recipes WHERE id = ${id}`);
      if (!curr.rows.length) return res.status(404).json({ message: "Recipe not found" });
      const scrollItemId: string | null = (curr.rows[0] as any).recipe_item_id ?? null;

      // Update recipe fields (only provided ones)
      const updates: string[] = [];
      if (ingredient1Id) updates.push(`ingredient1_id = '${ingredient1Id}'`);
      if (ingredient2Id) updates.push(`ingredient2_id = '${ingredient2Id}'`);
      // ingredient3Id can be cleared (pass null/empty string to remove) or set
      if (ingredient3Id !== undefined) {
        updates.push(ingredient3Id ? `ingredient3_id = '${ingredient3Id}'` : `ingredient3_id = NULL`);
      }
      if (resultId)      updates.push(`result_id = '${resultId}'`);
      if (resultType && ["item","fish","pet"].includes(resultType)) updates.push(`result_type = '${resultType}'`);
      if (updates.length) {
        await db.execute(sql`UPDATE mixing_tree_recipes SET ${sql.raw(updates.join(", "))} WHERE id = ${id}`);
      }

      // Update scroll name if provided
      if (name && typeof name === "string" && name.trim() && scrollItemId) {
        await db.execute(sql`UPDATE shop_items SET name = ${name.trim()} WHERE id = ${scrollItemId}`);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("Update recipe error:", err);
      return res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete("/api/admin/recipes/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params as Record<string,string>;
      await db.execute(sql`DELETE FROM mixing_tree_recipes WHERE id = ${id}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Delete recipe error:", err);
      return res.status(500).json({ message: "Failed to delete recipe" });
    }
  });
}
