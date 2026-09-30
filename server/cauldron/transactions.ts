import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import { tryConsumeOneFromInventory } from "../inventoryConsumption";

type CauldronTx = Parameters<Parameters<typeof database.transaction>[0]>[0];

export interface CauldronContent {
  shopItemId: string;
  quantity: number;
}

export type CauldronFailure = {
  ok: false;
  status: number;
  body: {
    message: string;
    errorCode?: "INCORRECT_RECIPE" | "RECIPE_LOCKED" | "INSUFFICIENT_COINS";
  };
};

export type CauldronAddResult = { ok: true } | CauldronFailure;

export type CauldronBrewResult =
  | {
      ok: true;
      result: {
        name: string;
        imageUrl: string | null;
        type: string;
      };
    }
  | CauldronFailure;

const CAULDRON_CAPACITY = 2;
const BREW_COST = 100;

export const cauldronContentsKey = (userId: string) => `cauldron_contents:${userId}`;

function parseContents(raw: unknown): CauldronContent[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function lockPlayerCauldron(tx: CauldronTx, userId: string): Promise<void> {
  // All value-moving Cauldron mutations take the same transaction-scoped lock
  // first. This serializes add / clear / brew for one player without creating
  // permanent lock rows or changing the database schema.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cauldron:${userId}`}))`);
}

async function readContents(tx: CauldronTx, userId: string): Promise<CauldronContent[]> {
  const key = cauldronContentsKey(userId);
  const row = await tx.execute(sql`SELECT value FROM game_settings WHERE key = ${key}`);
  return parseContents(row.rows[0]?.value);
}

async function writeContents(tx: CauldronTx, userId: string, contents: CauldronContent[]): Promise<void> {
  const key = cauldronContentsKey(userId);
  await tx.execute(sql`
    INSERT INTO game_settings (key, value)
    VALUES (${key}, ${JSON.stringify(contents)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
}

function fail(status: number, message: string, errorCode?: CauldronFailure["body"]["errorCode"]): CauldronFailure {
  return {
    ok: false,
    status,
    body: errorCode ? { message, errorCode } : { message },
  };
}

/**
 * Remove one owned ingredient and record it in the player's Cauldron in the
 * same transaction. If either write fails, neither state change commits.
 */
export async function addCauldronIngredient(
  db: Pick<typeof database, "transaction">,
  input: { userId: string; inventoryId: string },
): Promise<CauldronAddResult> {
  return db.transaction(async (tx) => {
    await lockPlayerCauldron(tx, input.userId);

    const inventory = await tx.execute(sql`
      SELECT
        ui.user_id AS "userId",
        ui.shop_item_id AS "shopItemId",
        si.type AS "itemType"
      FROM user_inventory ui
      JOIN shop_items si ON si.id = ui.shop_item_id
      WHERE ui.id = ${input.inventoryId}
      FOR UPDATE OF ui
    `);
    const item = inventory.rows[0] as
      | { userId: string; shopItemId: string; itemType: string }
      | undefined;

    if (!item || item.userId !== input.userId) {
      return fail(404, "Inventory item not found");
    }
    if (item.itemType !== "ingredient") {
      return fail(400, "Only ingredients can be added to the cauldron");
    }

    const contents = await readContents(tx, input.userId);
    const total = contents.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
    if (total >= CAULDRON_CAPACITY) {
      return fail(409, "Cauldron is full");
    }

    const { consumed } = await tryConsumeOneFromInventory(tx, input.userId, input.inventoryId);
    if (!consumed) {
      return fail(409, "Out of stock");
    }

    const existing = contents.find((entry) => entry.shopItemId === item.shopItemId);
    if (existing) existing.quantity += 1;
    else contents.push({ shopItemId: item.shopItemId, quantity: 1 });

    await writeContents(tx, input.userId, contents);
    return { ok: true };
  });
}

/**
 * Return every stored ingredient and clear the Cauldron atomically. A failure
 * while restoring any item rolls the complete operation back.
 */
export async function clearCauldronContents(
  db: Pick<typeof database, "transaction">,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockPlayerCauldron(tx, userId);
    const contents = await readContents(tx, userId);

    for (const entry of contents) {
      if (!entry.shopItemId || !entry.quantity) continue;

      const existing = await tx.execute(sql`
        SELECT id
        FROM user_inventory
        WHERE user_id = ${userId} AND shop_item_id = ${entry.shopItemId}
        LIMIT 1
        FOR UPDATE
      `);

      if (existing.rows.length) {
        await tx.execute(sql`
          UPDATE user_inventory
          SET quantity = quantity + ${entry.quantity}
          WHERE id = ${(existing.rows[0] as any).id}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO user_inventory (user_id, shop_item_id, quantity)
          VALUES (${userId}, ${entry.shopItemId}, ${entry.quantity})
        `);
      }
    }

    await writeContents(tx, userId, []);
  });
}

/**
 * Validate the stored recipe, charge the player, award the result, and clear
 * the Cauldron in one transaction. The shared per-player lock prevents two
 * simultaneous brew requests from consuming the same pair twice.
 */
export async function brewCauldron(
  db: Pick<typeof database, "transaction">,
  userId: string,
): Promise<CauldronBrewResult> {
  return db.transaction(async (tx) => {
    await lockPlayerCauldron(tx, userId);
    const contents = await readContents(tx, userId);

    const flatIds: string[] = [];
    for (const entry of contents) {
      for (let i = 0; i < (entry.quantity || 0); i++) flatIds.push(entry.shopItemId);
    }
    if (flatIds.length !== 2) {
      return fail(400, "Add exactly 2 ingredients to brew");
    }
    const [id1, id2] = flatIds;

    const recipeRows = await tx.execute(sql`
      SELECT
        r.id,
        r.result_id AS "resultId",
        r.result_type AS "resultType",
        ri.name AS "resultName",
        ri.image_url AS "resultImage"
      FROM mixing_tree_recipes r
      JOIN shop_items ri ON r.result_id = ri.id
      WHERE (r.ingredient1_id = ${id1} AND r.ingredient2_id = ${id2})
         OR (r.ingredient1_id = ${id2} AND r.ingredient2_id = ${id1})
      LIMIT 1
    `);
    if (!recipeRows.rows.length) {
      return fail(404, "Incorrect Recipe", "INCORRECT_RECIPE");
    }
    const recipe = recipeRows.rows[0] as {
      id: string;
      resultId: string;
      resultType: string;
      resultName: string;
      resultImage: string | null;
    };

    const unlockedRow = await tx.execute(sql`
      SELECT 1
      FROM player_unlocked_recipes
      WHERE user_id = ${userId} AND recipe_id = ${recipe.id}
    `);
    if (!unlockedRow.rows.length) {
      return fail(403, "Find Recipe", "RECIPE_LOCKED");
    }

    const debit = await tx.execute(sql`
      UPDATE users
      SET coins = coins - ${BREW_COST}
      WHERE id = ${userId} AND coins >= ${BREW_COST}
      RETURNING id
    `);
    if (!debit.rows.length) {
      return fail(402, "Not enough coins to brew (costs 100 coins)", "INSUFFICIENT_COINS");
    }

    const existing = await tx.execute(sql`
      SELECT id
      FROM user_inventory
      WHERE user_id = ${userId} AND shop_item_id = ${recipe.resultId}
      LIMIT 1
      FOR UPDATE
    `);
    if (existing.rows.length) {
      await tx.execute(sql`
        UPDATE user_inventory
        SET quantity = quantity + 1
        WHERE id = ${(existing.rows[0] as any).id}
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO user_inventory (user_id, shop_item_id, quantity)
        VALUES (${userId}, ${recipe.resultId}, 1)
      `);
    }

    await writeContents(tx, userId, []);

    return {
      ok: true,
      result: {
        name: recipe.resultName,
        imageUrl: recipe.resultImage,
        type: recipe.resultType,
      },
    };
  });
}
