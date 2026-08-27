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
  type HauntedSlotItemCategory,
  type HauntedSlotSymbolId,
} from "@shared/hauntedCasino";

const PVP_TICKET_ITEM_ID = "a1b2c3d4-9001-4000-8000-000000000099";
const PVP_TICKET_CAP = 100;

// Use the small standalone currency tokens here, not the long TopBar balance art.
const STATIC_SYMBOL_IMAGES: Record<"coin" | "essence" | "skull", string> = {
  coin: "/world-assets/icon_coin.png",
  essence: "/world-assets/Photoroom_20260709_23958_PM_1783626016795.png",
  skull: "/world-assets/Photoroom_20260705_103527_PM_1783426783499.png",
};

const HOTSPOT_IDS = new Set<HauntedCasinoHotspotId>(
  DEFAULT_HAUNTED_CASINO_HOTSPOTS.map((spot) => spot.id),
);

interface CasinoPrizeItem {
  id: string;
  name: string;
  type: string;
  image_url: string | null;
  price: number;
  rarity: number | null;
  star_rarity: number | null;
  fishing_type: string | null;
}

type PrizeCatalog = Record<HauntedSlotItemCategory, CasinoPrizeItem[]>;

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

function effectiveItemRarity(item: CasinoPrizeItem): number {
  const explicit = Number(item.star_rarity ?? item.rarity);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.max(1, Math.min(5, Math.floor(explicit)));

  // A number of older non-fish items have no rarity field. Price gives those
  // items a conservative rarity floor so expensive catalog entries never
  // become the easiest mystery prizes by accident.
  const price = Number(item.price ?? 0);
  if (price >= 1000) return 5;
  if (price >= 500) return 4;
  if (price >= 250) return 3;
  if (price >= 100) return 2;
  return 1;
}

export function hauntedCasinoPrizeWeight(item: Pick<CasinoPrizeItem, "price" | "rarity" | "star_rarity">): number {
  const rarity = effectiveItemRarity(item as CasinoPrizeItem);
  return [0, 100, 45, 18, 6, 2][rarity] ?? 2;
}

async function getEligiblePrizeCatalog(executor: any = db): Promise<PrizeCatalog> {
  const result = await executor.execute(sql`
    SELECT id, name, type, image_url, price, rarity, star_rarity, fishing_type
    FROM shop_items
    WHERE type <> 'pet'
      AND pet_template_id IS NULL
      AND egg_image_url IS NULL
      AND hatch_time IS NULL
      AND image_url IS NOT NULL
      AND price > 0
      AND lower(name) NOT LIKE '%ticket%'
      AND NOT (type = 'fishing' AND COALESCE(fishing_type, '') <> 'fish')
    ORDER BY created_at DESC
  `);

  const catalog: PrizeCatalog = { edible: [], fish: [], loot: [] };
  for (const raw of result.rows as any[]) {
    const item: CasinoPrizeItem = {
      id: String(raw.id),
      name: String(raw.name),
      type: String(raw.type),
      image_url: raw.image_url ?? null,
      price: Number(raw.price ?? 0),
      rarity: raw.rarity == null ? null : Number(raw.rarity),
      star_rarity: raw.star_rarity == null ? null : Number(raw.star_rarity),
      fishing_type: raw.fishing_type ?? null,
    };
    if (item.type === "edibles") catalog.edible.push(item);
    else if (item.type === "fishing" && item.fishing_type === "fish") catalog.fish.push(item);
    else catalog.loot.push(item);
  }
  return catalog;
}

function pickPrizeItem(items: CasinoPrizeItem[]): CasinoPrizeItem | null {
  if (!items.length) return null;
  const weighted = items.map((item) => ({ item, weight: hauntedCasinoPrizeWeight(item) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = crypto.randomInt(Math.max(1, total));
  for (const entry of weighted) {
    if (roll < entry.weight) return entry.item;
    roll -= entry.weight;
  }
  return weighted[0]?.item ?? null;
}

function previewPrizeItem(items: CasinoPrizeItem[]): CasinoPrizeItem | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const rarityDiff = effectiveItemRarity(a) - effectiveItemRarity(b);
    if (rarityDiff) return rarityDiff;
    const priceDiff = Number(a.price ?? 0) - Number(b.price ?? 0);
    if (priceDiff) return priceDiff;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

export async function getHauntedSlotState(userId: string) {
  const [userResult, catalog] = await Promise.all([
    // This is the same users.coins / users.essence wallet used throughout the
    // game. Slaughter Slots deliberately has no separate casino balance.
    db.execute(sql`SELECT coins, essence FROM users WHERE id = ${userId} LIMIT 1`),
    getEligiblePrizeCatalog(),
  ]);
  const user = userResult.rows[0] as any;
  if (!user) throw new HauntedCasinoError("player_not_found", 404, "Player not found");

  const ediblePreview = previewPrizeItem(catalog.edible);
  const fishPreview = previewPrizeItem(catalog.fish);
  const lootPreview = previewPrizeItem(catalog.loot);

  return {
    balances: { coins: Number(user.coins ?? 0), essence: Number(user.essence ?? 0) },
    betOptions: [...HAUNTED_CASINO_BETS],
    symbols: [
      { id: "coin" as const, label: "Coins", imageUrl: STATIC_SYMBOL_IMAGES.coin },
      { id: "essence" as const, label: "Essence", imageUrl: STATIC_SYMBOL_IMAGES.essence },
      {
        id: "edible" as const,
        label: ediblePreview ? `Edible Prize · ${ediblePreview.name}` : "Edible Prize",
        imageUrl: ediblePreview?.image_url ?? null,
      },
      {
        id: "fish" as const,
        label: fishPreview ? `Fish Prize · ${fishPreview.name}` : "Fish Prize",
        imageUrl: fishPreview?.image_url ?? null,
      },
      {
        id: "loot" as const,
        label: lootPreview ? `Mystery Prize · ${lootPreview.name}` : "Mystery Prize",
        imageUrl: lootPreview?.image_url ?? null,
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

async function grantPrizeItem(tx: any, userId: string, item: CasinoPrizeItem): Promise<void> {
  // Stack consumables where the rest of the game already treats them as a
  // quantity. Fish/accessories/costumes/special items remain individual rows.
  if (item.type === "potion" || item.type === "edibles") {
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

function fallbackEssenceFor(category: HauntedSlotItemCategory, bet: number): number {
  if (category === "loot") return bet * 7;
  if (category === "fish") return bet * 5;
  return bet * 3;
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

    if (reward.itemCategory) {
      const catalog = await getEligiblePrizeCatalog(tx);
      const prize = pickPrizeItem(catalog[reward.itemCategory]);
      if (prize) {
        await grantPrizeItem(tx, userId, prize);
        itemGranted = { id: prize.id, name: prize.name, imageUrl: prize.image_url ?? null };
      } else {
        // A paid spin must complete safely even when an admin temporarily has
        // no eligible item in one category. Currency is the deterministic
        // fallback and is still credited in this same transaction.
        fallbackEssence = fallbackEssenceFor(reward.itemCategory, bet);
      }
    }

    const pvpTicketsGranted = await grantPvpTickets(tx, userId, reward.pvpTickets);
    const essenceWon = reward.essence + fallbackEssence;

    // Bets and winnings touch the player's real global wallet directly. There
    // is no casino-only balance and no client-side credit ledger.
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
          ? `${reward.message} That prize category is empty right now, so the house paid extra essence instead.`
          : itemGranted
            ? `${reward.message} You won ${itemGranted.name}!`
            : reward.message,
      },
      balances: {
        coins: Number(balances.coins ?? 0),
        essence: Number(balances.essence ?? 0),
      },
    };
  });
}
