import { useQuery } from "@tanstack/react-query";

export const PLAYER_CURRENCY_QUERY_KEY = ["/api/auth/me"] as const;
export type PlayerCurrencyBalances = { coins: number; essence: number };
export function usePlayerCurrencyBalances() {
  const query = useQuery<any>({ queryKey: PLAYER_CURRENCY_QUERY_KEY });
  const coin = Number(query.data?.coins ?? 0);
  const essence = Number(query.data?.essence ?? 0);
  return { coin, essence, loading: query.isLoading, error: query.error, formattedCoin: coin.toLocaleString("en-US"), formattedEssence: essence.toLocaleString("en-US"), query };
}
export function mergePlayerCurrencyBalances(current: any, balances: PlayerCurrencyBalances) {
  return current ? { ...current, coins: balances.coins, essence: balances.essence } : current;
}
