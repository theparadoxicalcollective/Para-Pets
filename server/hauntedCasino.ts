import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  DEFAULT_HAUNTED_CASINO_HOTSPOTS,
  HAUNTED_CASINO_BETS,
  HAUNTED_CASINO_HOTSPOT_SETTING_KEY,
  HAUNTED_SLOT_SYMBOL_WEIGHTS,
  evaluateHauntedSlotResult,
  type HauntedCasinoHotspot,
  type HauntedCasinoHotspotId,
  type HauntedSlotSymbolId,
} from "@shared/hauntedCasino";

const PVP_TICKET_ITEM_ID = "a1b2c3d4-9001-4000-8000-000000000099";
const PVP_TICKET_CAP = 100;

const STATIC_SYMBOL_IMAGES: Record<"coin" | "essence" | "skull", string> = {
  coin: "/world-assets/icon_coin.png",
  essence: "/world-assets/Photoroom_20260709_24152_PM_1783626130265.png",
  skull: "/world-assets/Photoroom_20260705_103527_PM_1783426783499.png",
};

const HOTSPOT_IDS = new Set<HauntedCasinoHotspotId>(
  DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((spot) => spot.id),
);

export class HauntedCasinoError extends Error {
  constructor(
    public code: "invalid_bet" | "insufficient_coins" | "player_not_found",
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function sanitizeHauntedCasinoHotspots(input: unknown): HauntedCasinoHotspot[] {
  const incoming = Array.isArray(input) ? input : [];
  const byId = new Map<HauntedCasinoHotspotId, any>();
  for (const entry of incoming) {
    const id = entry?.id as HauntedCasinoHotspotId;
    if (HOTSPOT_IDS.has(id)) byId.set(id, entry);
  }

  return DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((fallback) => {
    const entry = byId.get(fallback.id);
    return {
      id: fallback.id,
      label: fallback.label,
      x: clamp(entry?.x, 2, 98, fallback.x),
      y: clamp(entry?.y, 2, 98, fallback.y),
      size: clamp(entry?.size, 6, 28, fallback.size),
    };
  });
}

export async function getHauntedCasinoHotspots(): Promise<HauntedCasinoHotspot[]> {
  const result = await db.execute(sql`
    SELECT value FROM game_settings
    WHERE key = ${HAUNTED_CASINO_HOTSPOT_SETTING_KEY}
    LIMIT 1
  `);
  const raw = (result.rows[0] as any)?.value;
  if (!raw) return DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((spot) => ({ ...spot }));
  try {
    return sanitizeHauntedCasinoHotspots(JSON.parse(String(raw)));
  } catch {
    return DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((spot) => ({ ...spot }));
  }
}

export async function saveHauntedCasinoHotspots(input: unknown): Promise<HauntedCasinoHotspot[]> {
  const hotspots = sanitizeHauntedCasinoHotspots(input);
  await db.execute(sql`
    INSERT INTO game_settings (key, value)
    VALUES (${HAUNTED_CASINO_HOTSPOT_SETTING_KEY}, ${JSON.stringify(hotspots)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
  return hotspots;
}

function pickWeightedSymbol(): HauntedSlotSymbolId {
  const totalWeight = HAUNTED_SLOT_SYMBOL_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = crypto.randomInt(totalWeight);
  for (const entry of HAUNTED_SLOT_SYMBOL_WEIGHTS) {
    if (roll < entry.weight) return entry.id;
    roll -= entry.weight;
  }
  return "coin";
}

async function findPrizeItems(executor: any = db): Promise<Record<"koi" | "potion", any | null>> {
  const result = await executor.execute(sql`
    SELECT id, name, type, image_url
    FROM shop_items
    WHERE lower(name) IN ('red mood koi', 'basic health potion')
    ORDER BY CASE lower(name) WHEN 'red mood koi' THEN 0 ELSE 1 END
  `);
  const rows = result.rows as any[];
  return {
    koi: rows.find((row) => String(row.name).toLowerCase() === "red mood koi") ?? null,
    potion: rows.find((row) => String(row.name).toLowerCase() === "basic health potion") ?? null,
  };
}

export async function getHauntedSlotState(userId: string) {
  const [userResult, prizes] = await Promise.all([
    db.execute(sql`SELECT coins, essence FROM users WHERE id = ${userId} LIMIT 1`),
    findPrizeItems(),
  ]);
  const user = userResult.rows[0] as any;
  if (!user) throw new HauntedCasinoError("player_not_found", 404, "Player not found");

  return {
    balances: { coins: Number(user.coins ?? 0), essence: Number(user.essence ?? 0) },
    betOptions: [...HAUNTED_CASINO_BETS],
    symbols: [
      { id: "coin" as const, label: "Coins", imageUrl: STATIC_SYMBOL_IMAGES.coin },
      { id: "essence" as const, label: "Essence", imageUrl: STATIC_SYMBOL_IMAGES.essence },
      {
        id: "potion" as const,
        label: "Basic Health Potion",
        imageUrl: prizes.potion?.image_url ?? null,
      },
      {
        id: "koi" as const,
        label: "Red Mood Koi",
        imageUrl: prizes.koi?.image_url ?? null,
      },
      { id: "skull" as const, label: "PvP Skull", imageUrl: STATIC_SYMBOL_IMAGES.skull },
    ],
  };
}

async function grantPvpTickets(tx: any, userId: string, requested: number): Promise<number> {
  if (requested <= 0) return 0;
  const countResult = await tx.execute(sql`
    SELECT COALESCE(SUM(quantity), 0) AS total
    FROM user_inventory
    WHERE user_id = ${userId} AND shop_item_id = ${PVP_TICKET_ITEM_ID}
  `);
  const current = Number((countResult.rows[0] as any)?.total ?? 0);
  const amount = Math.max(0, Math.min(requested, PVP_TICKET_CAP - current));
  if (amount <= 0) return 0;

  const updated = await tx.execute(sql`
    UPDATE user_inventory
    SET quantity = quantity + ${amount}
    WHERE id = (
      SELECT id FROM user_inventory
      WHERE user_id = ${userId} AND shop_item_id = ${PVP_TICKET_ITEM_ID}
      ORDER BY id
      LIMIT 1
    )
    RETURNING id
  `);
  if (!updated.rows.length) {
    await tx.execute(sql`
      INSERT INTO user_inventory (user_id, shop_item_id, quantity)
      VALUES (${userId}, ${PVP_TICKET_ITEM_ID}, ${amount})
    `);
  }
  return amount;
}

async function grantPrizeItem(tx: any, userId: string, item: any): Promise<void> {
  // Stack potions when possible; fish/items remain individual inventory entries.
  if (item.type === "potion") {
    const stacked = await tx.execute(sql`
      UPDATE user_inventory
      SET quantity = quantity + 1
      WHERE id = (
        SELECT id FROM user_inventory
        WHERE user_id = ${userId}
          AND shop_item_id = ${item.id}
          AND COALESCE(quantity, 1) < 50
        ORDER BY id
        LIMIT 1
      )
      RETURNING id
    `);
    if (stacked.rows.length) return;
  }
  await tx.execute(sql`
    INSERT INTO user_inventory (user_id, shop_item_id, quantity)
    VALUES (${userId}, ${item.id}, 1)
  `);
}

export async function spinHauntedSlots(userId: string, requestedBet: unknown) {
  const bet = Number(requestedBet);
  if (!HAUNTED_CASINO_BETS.includes(bet as any)) {
    throw new HauntedCasinoError("invalid_bet", 400, "Choose one of the available bets");
  }

  return db.transaction(async (tx) => {
    const userResult = await tx.execute(sql`
      SELECT id, coins, essence
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const user = userResult.rows[0] as any;
    if (!user) throw new HauntedCasinoError("player_not_found", 404, "Player not found");
    if (Number(user.coins ?? 0) < bet) {
      throw new HauntedCasinoError("insufficient_coins", 409, "Not enough coins for that bet");
    }

    // The server owns both the RNG and payout calculation. The client only
    // submits the selected stake and receives the final reel result.
    const reels: [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId] = [
      pickWeightedSymbol(),
      pickWeightedSymbol(),
      pickWeightedSymbol(),
    ];
    const reward = evaluateHauntedSlotResult(reels, bet);
    let itemGranted: { id: string; name: string; imageUrl: string | null } | null = null;
    let fallbackEssence = 0;

    if (reward.itemName) {
      const prizes = await findPrizeItems(tx);
      const prize = reward.itemName === "Red Mood Koi" ? prizes.koi : prizes.potion;
      if (prize) {
        await grantPrizeItem(tx, userId, prize);
        itemGranted = { id: prize.id, name: prize.name, imageUrl: prize.image_url ?? null };
      } else {
        // Missing catalog art/content must never make a paid spin fail after
        // the stake is reserved. Convert that prize to essence instead.
        fallbackEssence = reward.itemName === "Red Mood Koi" ? bet * 6 : bet * 4;
      }
    }

    const pvpTicketsGranted = await grantPvpTickets(tx, userId, reward.pvpTickets);
    const essenceWon = reward.essence + fallbackEssence;

    const balanceResult = await tx.execute(sql`
      UPDATE users
      SET coins = coins - ${bet} + ${reward.coins},
          essence = COALESCE(essence, 0) + ${essenceWon},
          total_coins_earned = total_coins_earned + ${reward.coins}
      WHERE id = ${userId}
      RETURNING coins, essence
    `);
    const balances = balanceResult.rows[0] as any;

    return {
      bet,
      reels,
      reward: {
        ...reward,
        essence: essenceWon,
        pvpTickets: pvpTicketsGranted,
        itemGranted,
        usedFallbackEssence: fallbackEssence > 0,
        message: fallbackEssence > 0
          ? `${reward.message} The item was unavailable, so the house paid extra essence instead.`
          : reward.message,
      },
      balances: {
        coins: Number(balances.coins ?? 0),
        essence: Number(balances.essence ?? 0),
      },
    };
  });
}
