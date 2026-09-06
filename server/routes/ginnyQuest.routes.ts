import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuthenticated } from "../auth";
import {
  GINNY_MINI_PET_CHOICES,
  GINNY_NPC_NAME,
  GINNY_QUEST_KEY,
  GINNY_REWARD_COINS,
  GINNY_WORLD_ID,
  parseGinnyMiniPetChoice,
  type GinnyMiniPetChoice,
} from "../ginnyQuestRules";

type SqlExecutor = { execute(statement: any): Promise<{ rows: any[] }> };

type MiniPetCatalogOption = {
  choice: GinnyMiniPetChoice;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  rarity: number;
};

async function resolveMiniPet(executor: SqlExecutor, choice: GinnyMiniPetChoice): Promise<MiniPetCatalogOption | null> {
  const miniPetLabel = `${choice} mini pet`;
  const containsChoice = `%${choice}%`;
  const result = await executor.execute(sql`
    SELECT si.id, si.name, si.image_url, COALESCE(si.star_rarity, si.rarity, 1) AS rarity
    FROM shop_items si
    INNER JOIN mini_pet_definitions definition ON definition.shop_item_id = si.id
    WHERE si.type = 'mini_pet'
      AND (
        LOWER(TRIM(si.name)) = ${choice}
        OR LOWER(TRIM(si.name)) = ${miniPetLabel}
        OR LOWER(si.name) LIKE ${containsChoice}
      )
    ORDER BY
      CASE
        WHEN LOWER(TRIM(si.name)) = ${choice} THEN 0
        WHEN LOWER(TRIM(si.name)) = ${miniPetLabel} THEN 1
        ELSE 2
      END,
      si.created_at ASC
    LIMIT 1
  `);
  const row = result.rows[0] as any;
  if (!row) return null;
  return {
    choice,
    shopItemId: String(row.id),
    name: String(row.name),
    imageUrl: row.image_url ? String(row.image_url) : null,
    rarity: Math.max(1, Math.min(5, Number(row.rarity) || 1)),
  };
}

async function selectedMiniPetIsEquipped(executor: SqlExecutor, userId: string, miniPetInventoryId: string): Promise<boolean> {
  const result = await executor.execute(sql`
    SELECT equipped.pet_inventory_id
    FROM pet_equipped_mini_pets equipped
    INNER JOIN user_inventory pet ON pet.id = equipped.pet_inventory_id
    INNER JOIN user_inventory mini ON mini.id = equipped.mini_pet_inventory_id
    WHERE equipped.mini_pet_inventory_id = ${miniPetInventoryId}
      AND pet.user_id = ${userId}
      AND mini.user_id = ${userId}
    LIMIT 1
  `);
  return Boolean(result.rows[0]);
}

async function loadGinnyQuestState(executor: SqlExecutor, userId: string) {
  const [bat, ghost] = await Promise.all(
    GINNY_MINI_PET_CHOICES.map(choice => resolveMiniPet(executor, choice)),
  );
  const options = [bat, ghost].filter((option): option is MiniPetCatalogOption => Boolean(option));

  const questResult = await executor.execute(sql`
    SELECT user_id, choice, mini_pet_shop_item_id, mini_pet_inventory_id,
           accepted_at, completed_at, reward_claimed_at
    FROM user_ginny_mini_pet_quests
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  let quest = questResult.rows[0] as any;

  if (quest && !quest.completed_at && await selectedMiniPetIsEquipped(executor, userId, String(quest.mini_pet_inventory_id))) {
    const completed = await executor.execute(sql`
      UPDATE user_ginny_mini_pet_quests
      SET completed_at = COALESCE(completed_at, now())
      WHERE user_id = ${userId}
      RETURNING completed_at
    `);
    quest = { ...quest, completed_at: (completed.rows[0] as any)?.completed_at ?? new Date() };
  }

  const activePetResult = await executor.execute(sql`
    SELECT users.active_pet_id, pet.is_hatched
    FROM users
    LEFT JOIN user_inventory pet
      ON pet.id = users.active_pet_id AND pet.user_id = users.id
    WHERE users.id = ${userId}
    LIMIT 1
  `);
  const activePet = activePetResult.rows[0] as any;

  const status = !quest
    ? "available"
    : quest.reward_claimed_at
      ? "claimed"
      : quest.completed_at
        ? "completed"
        : "accepted";

  const selected = quest
    ? options.find(option => option.shopItemId === String(quest.mini_pet_shop_item_id)) ?? {
        choice: String(quest.choice) as GinnyMiniPetChoice,
        shopItemId: String(quest.mini_pet_shop_item_id),
        name: String(quest.choice) === "bat" ? "Bat" : "Ghost",
        imageUrl: null,
        rarity: 1,
      }
    : null;

  return {
    key: GINNY_QUEST_KEY,
    worldId: GINNY_WORLD_ID,
    npcName: GINNY_NPC_NAME,
    title: "Ginny's Little Companion",
    description: "Choose a Mini Pet from Ginny, then equip it to your active pet.",
    rewardCoins: GINNY_REWARD_COINS,
    status,
    options,
    selected,
    miniPetInventoryId: quest ? String(quest.mini_pet_inventory_id) : null,
    acceptedAt: quest?.accepted_at ?? null,
    completedAt: quest?.completed_at ?? null,
    rewardClaimedAt: quest?.reward_claimed_at ?? null,
    activePetId: activePet?.active_pet_id ? String(activePet.active_pet_id) : null,
    activePetIsHatched: activePet?.is_hatched === true,
    canEquipNow: Boolean(activePet?.active_pet_id && activePet?.is_hatched === true),
  };
}

export function registerGinnyQuestRoutes(app: Express): void {
  app.get("/api/quests/ginny-mini-pet", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      return res.json(await loadGinnyQuestState(db as unknown as SqlExecutor, user.id));
    } catch (error) {
      console.error("[ginny-quest] state failed", error);
      return res.status(500).json({ message: "Failed to load Ginny's quest" });
    }
  });

  app.post("/api/quests/ginny-mini-pet/choose", requireAuthenticated, async (req: Request, res: Response) => {
    const choice = parseGinnyMiniPetChoice(req.body?.choice);
    if (!choice) return res.status(400).json({ message: "Choose either the Bat or Ghost Mini Pet" });

    try {
      const user = req.user as { id: string };
      await db.transaction(async tx => {
        const executor = tx as unknown as SqlExecutor;
        await executor.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);

        const existingResult = await executor.execute(sql`
          SELECT choice FROM user_ginny_mini_pet_quests WHERE user_id = ${user.id} LIMIT 1
        `);
        const existing = existingResult.rows[0] as any;
        if (existing) {
          if (String(existing.choice) !== choice) {
            throw Object.assign(new Error("Your Ginny quest choice is already locked in"), { status: 409 });
          }
          return;
        }

        const catalog = await resolveMiniPet(executor, choice);
        if (!catalog) {
          throw Object.assign(new Error(`The ${choice === "bat" ? "Bat" : "Ghost"} Mini Pet is not configured yet`), { status: 409 });
        }

        const ownedResult = await executor.execute(sql`
          SELECT ui.id
          FROM user_inventory ui
          WHERE ui.user_id = ${user.id}
            AND ui.shop_item_id = ${catalog.shopItemId}
            AND ui.is_listed = false
          ORDER BY ui.acquired_at ASC
          LIMIT 1
          FOR UPDATE
        `);
        let miniPetInventoryId = (ownedResult.rows[0] as any)?.id as string | undefined;
        if (!miniPetInventoryId) {
          const granted = await executor.execute(sql`
            INSERT INTO user_inventory (user_id, shop_item_id, quantity)
            VALUES (${user.id}, ${catalog.shopItemId}, 1)
            RETURNING id
          `);
          miniPetInventoryId = String((granted.rows[0] as any).id);
        }

        await executor.execute(sql`
          INSERT INTO user_ginny_mini_pet_quests
            (user_id, choice, mini_pet_shop_item_id, mini_pet_inventory_id)
          VALUES (${user.id}, ${choice}, ${catalog.shopItemId}, ${miniPetInventoryId})
        `);
      });

      return res.json(await loadGinnyQuestState(db as unknown as SqlExecutor, user.id));
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error("[ginny-quest] choose failed", error);
      return res.status(status).json({ message: status >= 500 ? "Failed to start Ginny's quest" : error.message });
    }
  });

  app.post("/api/quests/ginny-mini-pet/claim", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const result = await db.transaction(async tx => {
        const executor = tx as unknown as SqlExecutor;
        const questResult = await executor.execute(sql`
          SELECT mini_pet_inventory_id, completed_at, reward_claimed_at
          FROM user_ginny_mini_pet_quests
          WHERE user_id = ${user.id}
          FOR UPDATE
        `);
        const quest = questResult.rows[0] as any;
        if (!quest) throw Object.assign(new Error("Start Ginny's quest first"), { status: 404 });

        if (quest.reward_claimed_at) {
          const current = await executor.execute(sql`SELECT coins FROM users WHERE id = ${user.id} LIMIT 1`);
          return {
            alreadyClaimed: true,
            coinsGranted: 0,
            newCoinBalance: Number((current.rows[0] as any)?.coins ?? 0),
          };
        }

        const equipped = await selectedMiniPetIsEquipped(executor, user.id, String(quest.mini_pet_inventory_id));
        if (!equipped) {
          throw Object.assign(new Error("Equip the Mini Pet Ginny gave you before claiming this reward"), { status: 400 });
        }

        await executor.execute(sql`
          UPDATE user_ginny_mini_pet_quests
          SET completed_at = COALESCE(completed_at, now())
          WHERE user_id = ${user.id}
        `);

        const reserved = await executor.execute(sql`
          UPDATE user_ginny_mini_pet_quests
          SET reward_claimed_at = now()
          WHERE user_id = ${user.id} AND reward_claimed_at IS NULL
          RETURNING user_id
        `);
        if (!reserved.rows[0]) throw new Error("Ginny quest claim reservation changed unexpectedly");

        const updatedUser = await executor.execute(sql`
          UPDATE users
          SET coins = coins + ${GINNY_REWARD_COINS},
              total_coins_earned = total_coins_earned + ${GINNY_REWARD_COINS}
          WHERE id = ${user.id}
          RETURNING coins
        `);
        if (!updatedUser.rows[0]) throw new Error("User not found");

        return {
          alreadyClaimed: false,
          coinsGranted: GINNY_REWARD_COINS,
          newCoinBalance: Number((updatedUser.rows[0] as any).coins),
        };
      });

      return res.json({ ok: true, ...result });
    } catch (error: any) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error("[ginny-quest] claim failed", error);
      return res.status(status).json({ message: status >= 500 ? "Failed to claim Ginny's quest reward" : error.message });
    }
  });
}
