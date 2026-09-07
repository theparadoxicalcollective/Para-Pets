export type HauntedCasinoHotspotId =
  | "bingo"
  | "blackjack"
  | "slots"
  | "poker"
  | "scratch";

export interface HauntedCasinoHotspot {
  id: HauntedCasinoHotspotId;
  label: string;
  x: number;
  y: number;
  size: number;
}

export const HAUNTED_CASINO_HOTSPOT_SETTING_KEY = "haunted_casino_hotspots_v1";

// Percentages are relative to HauntedCasinoMainBG.png itself. They are only
// starter positions: admins can drag and resize every circle and the server
// persists that layout for every player.
export const DEFAULT_HAUNTED_CASINO_HOTSPOTS: HauntedCasinoHotspot[] = [
  { id: "bingo", label: "Bingo", x: 18, y: 35, size: 14 },
  { id: "slots", label: "Slots", x: 82, y: 37, size: 14 },
  { id: "blackjack", label: "Blackjack", x: 19, y: 71, size: 16 },
  { id: "poker", label: "Poker", x: 80, y: 72, size: 16 },
  { id: "scratch", label: "Scratch Offs", x: 62, y: 87, size: 11 },
];

// Stakes scale the same payout table rather than changing odds. The server
// still locks the real wallet and rejects any stake the player cannot afford.
export const HAUNTED_CASINO_BETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
export type HauntedCasinoBet = (typeof HAUNTED_CASINO_BETS)[number];

/**
 * Item symbols are categories rather than hard-coded item names. The server
 * resolves a real catalog item only after a winning line, which lets the slot
 * machine use admin-selected items and pet eggs from the live catalog.
 */
export type HauntedSlotSymbolId =
  | "coin"
  | "essence"
  | "edible"
  | "egg"
  | "loot"
  | "ginny"
  | "skull";

export type HauntedSlotItemCategory = "edible" | "egg" | "loot";

/** Public artwork only; prize eligibility still comes from the server catalog. */
export interface HauntedSlotPrizePreview {
  id: string;
  name: string;
  imageUrl: string | null;
  category: HauntedSlotItemCategory;
}

// Keep the total at 100 so the new character symbol is easy to reason about.
// Ginny is intentionally rare; the common currency symbols give up the weight.
export const HAUNTED_SLOT_SYMBOL_WEIGHTS: ReadonlyArray<{
  id: HauntedSlotSymbolId;
  weight: number;
}> = [
  { id: "coin", weight: 36 },
  { id: "essence", weight: 27 },
  { id: "edible", weight: 13 },
  { id: "egg", weight: 9 },
  { id: "loot", weight: 6 },
  { id: "ginny", weight: 4 },
  { id: "skull", weight: 5 },
];

export interface HauntedSlotReward {
  tier: "jackpot" | "triple" | "pair" | "combo" | "miss";
  message: string;
  coins: number;
  essence: number;
  /** Kept in the response shape for backwards compatibility; Slots no longer awards PvP tickets. */
  pvpTickets: number;
  itemCategory?: HauntedSlotItemCategory;
}

/**
 * Pure payout table shared by the server and tests. The stake is deducted
 * separately, so `coins` here means the amount credited after the reels stop.
 * Item-category wins are resolved against the live server catalog after the
 * reels are known; the client never submits item IDs, reward values, or rolls.
 * PvP tickets are intentionally excluded from all Slaughter Slots payouts.
 */
export function evaluateHauntedSlotResult(
  reels: readonly HauntedSlotSymbolId[],
  bet: number,
): HauntedSlotReward {
  const safeBet = Math.max(0, Math.floor(bet));
  const [a, b, c] = reels;

  if (a && a === b && b === c) {
    switch (a) {
      case "skull":
        return {
          tier: "jackpot",
          message: "SLAUGHTER JACKPOT! Three skulls awaken the house.",
          coins: safeBet * 10,
          essence: safeBet * 5,
          pvpTickets: 0,
        };
      case "ginny":
        return {
          tier: "triple",
          message: "Ginny's lucky visit! She leaves a surprise coin prize.",
          coins: safeBet * 3,
          essence: 0,
          pvpTickets: 0,
        };
      case "loot":
        return {
          tier: "triple",
          message: "Mystery vault! The house releases a catalog treasure.",
          coins: safeBet * 2,
          essence: 0,
          pvpTickets: 0,
          itemCategory: "loot",
        };
      case "egg":
        return {
          tier: "triple",
          message: "Mystery hatch! Three eggs win a pet egg.",
          coins: safeBet,
          essence: 0,
          pvpTickets: 0,
          itemCategory: "egg",
        };
      case "edible":
        return {
          tier: "triple",
          message: "Treat row! Three edibles win a real snack from the catalog.",
          coins: safeBet,
          essence: 0,
          pvpTickets: 0,
          itemCategory: "edible",
        };
      case "essence":
        return {
          tier: "triple",
          message: "Essence flood! The reels glow violet.",
          coins: safeBet,
          essence: safeBet * 5,
          pvpTickets: 0,
        };
      case "coin":
      default:
        return {
          tier: "triple",
          message: "Golden row! Three coin symbols line up.",
          coins: safeBet * 5,
          essence: 0,
          pvpTickets: 0,
        };
    }
  }

  const counts = new Map<HauntedSlotSymbolId, number>();
  for (const symbol of reels) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  const pair = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  if (pair) {
    switch (pair) {
      case "coin":
        return {
          tier: "pair",
          message: "Coin pair — the house gives a little back.",
          coins: Math.ceil(safeBet * 1.25),
          essence: 0,
          pvpTickets: 0,
        };
      case "essence":
        return {
          tier: "pair",
          message: "Essence pair — spectral winnings.",
          coins: 0,
          essence: safeBet * 2,
          pvpTickets: 0,
        };
      case "edible":
        return {
          tier: "pair",
          message: "Treat pair — a small coin return.",
          coins: Math.ceil(safeBet * 0.75),
          essence: 0,
          pvpTickets: 0,
        };
      case "egg":
        return {
          tier: "pair",
          message: "Egg pair — a little essence shimmers out.",
          coins: 0,
          essence: safeBet * 2,
          pvpTickets: 0,
        };
      case "loot":
        return {
          tier: "pair",
          message: "Vault pair — your stake comes back.",
          coins: safeBet,
          essence: 0,
          pvpTickets: 0,
        };
      case "ginny":
        return {
          tier: "pair",
          message: "Ginny pair — she returns your stake with a wink.",
          coins: safeBet,
          essence: 0,
          pvpTickets: 0,
        };
      case "skull":
        return {
          tier: "pair",
          message: "Cursed pair — spectral essence escapes the reels.",
          coins: 0,
          essence: safeBet * 2,
          pvpTickets: 0,
        };
    }
  }

  const unique = new Set(reels);
  if (
    reels.length === 3 &&
    unique.size === 3 &&
    unique.has("coin") &&
    unique.has("essence") &&
    unique.has("skull")
  ) {
    return {
      tier: "combo",
      message: "Haunted Trio! Coin, essence, and skull form a secret line.",
      coins: safeBet * 2,
      essence: safeBet * 2,
      pvpTickets: 0,
    };
  }

  return {
    tier: "miss",
    message: "The house keeps this spin. Try another bet when you're ready.",
    coins: 0,
    essence: 0,
    pvpTickets: 0,
  };
}