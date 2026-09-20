import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { effectiveSlotItemRarity, getSlotPrizeCatalog, grantSlotEgg, slotPrizePreviews, type CasinoPrizeItem } from "./hauntedSlotPrizes";
import {
  DEFAULT_HAUNTED_CASINO_HOTSPOTS,
  HAUNTED_CASINO_BETS,
  HAUNTED_SLOTS_FREE_BET,
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

export class HauntedCasinoError extends Error {
  constructor(
    public code: "invalid_bet" | "insufficient_coins" | "free_spin_unavailable" | "player_not_found",
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

function pickWeightedSymbol(available: ReadonlySet<HauntedSlotSymbolId>, randomInt: (max: number) => number): HauntedSlotSymbolId {
  const weights = HAUNTED_SLOT_SYMBOL_WEIGHTS.filter(entry => available.has(entry.id));
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = randomInt(totalWeight);
  for (const entry of weights) {
    if (roll < entry.weight) return entry.id;
    roll -= entry.weight;
  }
  return "coin";
}

export function hauntedCasinoPrizeWeight(item: Pick<CasinoPrizeItem, "price" | "rarity" | "star_rarity">): number {
  const rarity = effectiveSlotItemRarity(item);
  return [0, 100, 45, 18, 6, 2][rarity] ?? 2;
}

export function eligibleSlotCatalog(
  catalog: Record<HauntedSlotItemCategory, CasinoPrizeItem[]>,
  bet: number,
): Record<HauntedSlotItemCategory, CasinoPrizeItem[]> {
  return {
    edible: eligibleSlotItems(catalog.edible, bet),
    egg: eligibleSlotItems(catalog.egg, bet),
    loot: eligibleSlotItems(catalog.loot, bet),
  };
}

function eligibleSlotItems(items: CasinoPrizeItem[], bet: number): CasinoPrizeItem[] {
  if (bet >= 1000) return items.filter(item => effectiveSlotItemRarity(item) >= 3);
  // Do not offer an all-rare item pool on the cheapest bets.
  return items.some(item => effectiveSlotItemRarity(item) <= 2) ? items : [];
}

export function pickPrizeItem(
  items: CasinoPrizeItem[],
  bet: number,
  randomInt: (max: number) => number = crypto.randomInt,
): CasinoPrizeItem | null {
  const eligible = eligibleSlotItems(items, bet);
  if (!eligible.length) return null;
  const common = eligible.filter(item => effectiveSlotItemRarity(item) <= 2);
  const rare = eligible.filter(item => effectiveSlotItemRarity(item) >= 3);
  // When both tiers exist, 90% of low-bet item wins are common/uncommon.
  const pool = bet < 1000 && common.length && rare.length
    ? (randomInt(10) < 9 ? common : rare)
    : eligible;
  const weighted = pool.map(item => ({ item, weight: hauntedCasinoPrizeWeight(item) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = randomInt(total);
  for (const entry of weighted) {
    if (roll < entry.weight) return entry.item;
    roll -= entry.weight;
  }
  return weighted[0]?.item ?? null;
}

const FREE_SLOT_SETTING_PREFIX = "haunted_slots_free_500_v1:";
function freeSlotSettingKey(userId: string): string {
  return FREE_SLOT_SETTING_PREFIX + userId;
}
export function casinoDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
async function freeSlotAvailable(executor: any, userId: string, day: string): Promise<boolean> {
  const result = await executor.execute(sql`SELECT value FROM game_settings WHERE key = ${freeSlotSettingKey(userId)} LIMIT 1`);
  return String((result.rows[0] as any)?.value ?? "") !== day;
}

function previewPrizeItem(items: CasinoPrizeItem[]): CasinoPrizeItem | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const rarityDiff = effectiveSlotItemRarity(a) - effectiveSlotItemRarity(b);
    if (rarityDiff) return rarityDiff;
    const priceDiff = Number(a.price ?? 0) - Number(b.price ?? 0);
    if (priceDiff) return priceDiff;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

async function getGinnyNpcImageUrl(executor: any): Promise<string | null> {
  const result = await executor.execute(sql`
    SELECT image_url
    FROM shop_items
    WHERE type = 'npc'
      AND world_id = '__npc_catalog__'
      AND lower(name) LIKE 'ginny%'
      AND COALESCE(image_url, '') <> ''
    ORDER BY CASE WHEN lower(name) = 'ginny' THEN 0 ELSE 1 END, id
    LIMIT 1
  `);
  return (result.rows[0] as any)?.image_url ?? null;
}

export async function getHauntedSlotState(userId: string) {
  const day = casinoDay();
  const [userResult, catalog, ginnyImageUrl, freeSpinAvailable] = await Promise.all([
    // This is the same users.coins / users.essence wallet used throughout the
    // game. Slaughter Slots deliberately has no separate casino balance.
    db.execute(sql`SELECT coins, essence FROM users WHERE id = ${userId} LIMIT 1`),
    getSlotPrizeCatalog(db),
    getGinnyNpcImageUrl(db),
    freeSlotAvailable(db, userId, day),
  ]);
  const user = userResult.rows[0] as any;
  if (!user) throw new HauntedCasinoError("player_not_found", 404, "Player not found");

  return {
    balances: { coins: Number(user.coins ?? 0), essence: Number(user.essence ?? 0) },
    betOptions: [...HAUNTED_CASINO_BETS],
    freeSpinAvailable,
    symbols: slotSymbols(eligibleSlotCatalog(catalog, 50), ginnyImageUrl),
    prizes: slotPrizePreviews(catalog),
  };
}

function slotSymbols(catalog: Awaited<ReturnType<typeof getSlotPrizeCatalog>>, ginnyImageUrl: string | null) {
  const ediblePreview = previewPrizeItem(catalog.edible);
  const eggPreview = previewPrizeItem(catalog.egg);
  const lootPreview = previewPrizeItem(catalog.loot);

  return [
      { id: "coin" as const, label: "Coins", imageUrl: STATIC_SYMBOL_IMAGES.coin },
      { id: "essence" as const, label: "Essence", imageUrl: STATIC_SYMBOL_IMAGES.essence },
      {
        id: "edible" as const,
        label: ediblePreview ? `Edible Prize · ${ediblePreview.name}` : "Edible Prize",
        imageUrl: ediblePreview?.image_url ?? null,
      },
      {
        id: "egg" as const,
        label: eggPreview ? `Pet Egg · ${eggPreview.name}` : "Pet Egg",
        imageUrl: eggPreview?.egg_image_url ?? null,
      },
      {
        id: "loot" as const,
        label: lootPreview ? `Mystery Prize · ${lootPreview.name}` : "Mystery Prize",
        imageUrl: lootPreview?.image_url ?? null,
      },
      { id: "ginny" as const, label: "Ginny's Lucky Visit", imageUrl: ginnyImageUrl },
      { id: "skull" as const, label: "PvP Skull", imageUrl: STATIC_SYMBOL_IMAGES.skull },
    ].filter(symbol => {
      if (symbol.id === "ginny") return Boolean(ginnyImageUrl);
      return !["edible", "egg", "loot"].includes(symbol.id) || catalog[symbol.id as HauntedSlotItemCategory].length > 0;
    });
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
  if (category === "egg") return bet * 5;
  return bet * 3;
}

export async function spinHauntedSlots(userId: string, requestedBet: unknown, useFreeSpin = false, database: Pick<typeof db, "transaction"> = db, randomInt: (max: number) => number = crypto.randomInt) {
  const bet = Number(requestedBet);
  if (!HAUNTED_CASINO_BETS.includes(bet as any)) {
    throw new HauntedCasinoError("invalid_bet", 400, "Choose one of the available bets");
  }

  return database.transaction(async (tx) => {
    const userResult = await tx.execute(sql`
      SELECT id, coins, essence
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `);
    const user = userResult.rows[0] as any;
    if (!user) throw new HauntedCasinoError("player_not_found", 404, "Player not found");
    const day = casinoDay();
    if (useFreeSpin && (bet !== HAUNTED_SLOTS_FREE_BET || !(await freeSlotAvailable(tx, userId, day)))) {
      throw new HauntedCasinoError("free_spin_unavailable", 409, "Today's free 500 coin spin has already been used.");
    }
    const cost = useFreeSpin ? 0 : bet;
    if (Number(user.coins ?? 0) < cost) {
      throw new HauntedCasinoError("insufficient_coins", 409, "Not enough coins for that bet");
    }

    // The server owns both the RNG and payout calculation. The client only
    // submits the selected stake and receives the final reel result.
    const [catalog, ginnyImageUrl] = await Promise.all([
      getSlotPrizeCatalog(tx),
      getGinnyNpcImageUrl(tx),
    ]);
    const eligibleCatalog = eligibleSlotCatalog(catalog, bet);
    const available = new Set<HauntedSlotSymbolId>(["coin", "essence", "skull"]);
    for (const category of ["edible", "egg", "loot"] as const) {
      if (eligibleCatalog[category].length) available.add(category);
    }
    if (ginnyImageUrl) available.add("ginny");
    const reels: [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId] = [
      pickWeightedSymbol(available, randomInt),
      pickWeightedSymbol(available, randomInt),
      pickWeightedSymbol(available, randomInt),
    ];
    let reward = evaluateHauntedSlotResult(reels, bet);
    if (reels.every(symbol => symbol === "ginny")) {
      const multiplier = 3 + randomInt(4);
      reward = {
        ...reward,
        coins: bet * multiplier,
        message: `Ginny's lucky visit! She surprised you with a ${multiplier}× coin prize.`,
      };
    }
    let itemGranted: { id: string; name: string; imageUrl: string | null } | null = null;
    let fallbackEssence = 0;

    if (reward.itemCategory) {
      const prize = pickPrizeItem(eligibleCatalog[reward.itemCategory], bet);
      if (prize) {
        if (reward.itemCategory === "egg") await grantSlotEgg(tx, userId, prize);
        else await grantPrizeItem(tx, userId, prize);
        itemGranted = { id: prize.id, name: prize.name, imageUrl: (reward.itemCategory === "egg" ? prize.egg_image_url : prize.image_url) ?? null };
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
      SET coins = coins - ${cost} + ${reward.coins},
          essence = COALESCE(essence, 0) + ${essenceWon},
          total_coins_earned = total_coins_earned + ${reward.coins}
      WHERE id = ${userId}
      RETURNING coins, essence
    `);
    const balances = balanceResult.rows[0] as any;
    if (useFreeSpin) {
      await tx.execute(sql`
        INSERT INTO game_settings (key, value) VALUES (${freeSlotSettingKey(userId)}, ${day})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `);
    }

    return {
      bet,
      wasFree: useFreeSpin,
      freeSpinAvailable: useFreeSpin ? false : await freeSlotAvailable(tx, userId, day),
      reels,
      symbols: slotSymbols(eligibleCatalog, ginnyImageUrl),
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