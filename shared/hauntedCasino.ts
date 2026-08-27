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

export const HAUNTED_CASINO_BETS = [10, 25, 50, 100, 250] as const;
export type HauntedCasinoBet = (typeof HAUNTED_CASINO_BETS)[number];

export type HauntedSlotSymbolId =
  | "coin"
  | "essence"
  | "potion"
  | "koi"
  | "skull";

export const HAUNTED_SLOT_SYMBOL_WEIGHTS: ReadonlyArray<{
  id: HauntedSlotSymbolId;
  weight: number;
}> = [
  { id: "coin", weight: 34 },
  { id: "essence", weight: 27 },
  { id: "potion", weight: 18 },
  { id: "koi", weight: 13 },
  { id: "skull", weight: 8 },
];

export interface HauntedSlotReward {
  tier: "jackpot" | "triple" | "pair" | "combo" | "miss";
  message: string;
  coins: number;
  essence: number;
  pvpTickets: number;
  itemName?: "Red Mood Koi" | "Basic Health Potion";
}

/**
 * Pure payout table shared by the server and tests. The stake is deducted
 * separately, so `coins` here means the amount credited after the reels stop.
 * No client-provided reward values are ever trusted by the spin endpoint.
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
          pvpTickets: 5,
        };
      case "koi":
        return {
          tier: "triple",
          message: "Three Red Mood Koi — the haunted pond pays out.",
          coins: safeBet * 3,
          essence: 0,
          pvpTickets: 0,
          itemName: "Red Mood Koi",
        };
      case "potion":
        return {
          tier: "triple",
          message: "Potion row! A Basic Health Potion joins the winnings.",
          coins: safeBet * 2,
          essence: 0,
          pvpTickets: 0,
          itemName: "Basic Health Potion",
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
      case "potion":
        return {
          tier: "pair",
          message: "Potion pair — a partial coin return.",
          coins: Math.ceil(safeBet * 0.75),
          essence: 0,
          pvpTickets: 0,
        };
      case "koi":
        return {
          tier: "pair",
          message: "Koi pair — a small essence catch.",
          coins: 0,
          essence: safeBet * 3,
          pvpTickets: 0,
        };
      case "skull":
        return {
          tier: "pair",
          message: "Cursed pair — one PvP ticket survives the spin.",
          coins: 0,
          essence: 0,
          pvpTickets: 1,
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
