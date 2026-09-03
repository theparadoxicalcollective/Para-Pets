export type CoinPackage = {
  id: string;
  coins: number;
  priceUsd: number;
  label: string;
  currency: "usd";
  eggBonus?: {
    // Existing rewards may use an immutable id. Name-based rewards are resolved
    // against the live pet catalog during fulfillment, never trusted from the client.
    shopItemId?: string;
    shopItemName?: string;
    itemName: string;
    itemImageUrl?: string;
  };
};

// This is the single server-owned source of truth used by checkout and fulfillment.
// Values intentionally match the pre-existing coin shop configuration.
export const COIN_PACKAGES: readonly CoinPackage[] = [
  { id: "pack_v2_100", coins: 100, priceUsd: 1, label: "100 Coins", currency: "usd" },
  { id: "pack_v2_1000", coins: 1000, priceUsd: 5, label: "1,000 Coins", currency: "usd" },
  { id: "pack_v2_2500", coins: 2500, priceUsd: 10, label: "2,500 Coins", currency: "usd" },
  { id: "pack_v2_7500", coins: 7500, priceUsd: 25, label: "7,500 Coins", currency: "usd" },
  { id: "pack_v2_20000", coins: 20000, priceUsd: 50, label: "20,000 Coins", currency: "usd", eggBonus: { shopItemName: "Midnight Juggler", itemName: "Midnight Juggler Egg" } },
  { id: "pack_v2_50000", coins: 50000, priceUsd: 100, label: "50,000 Coins", currency: "usd", eggBonus: { shopItemName: "The Paradox", itemName: "The Paradox Egg", itemImageUrl: "/api/media/e5019d66-d5a1-4f56-a7e6-e4f9bae5baee" } },
] as const;

export const coinPackageById = (id: string | null | undefined) =>
  COIN_PACKAGES.find((pack) => pack.id === id);

export const awardedCoinsFor = (pack: CoinPackage) => Math.round(pack.coins * 1.33);
export const contributionPointsFor = (pack: CoinPackage) => pack.priceUsd * 100;

export function communityRewardCoinsForUsd(amountUsd: number): number {
  const tiered: Record<number, number> = { 1: 0, 5: 0, 10: 0, 25: 50, 50: 100, 100: 500 };
  return tiered[amountUsd] ?? 0;
}
