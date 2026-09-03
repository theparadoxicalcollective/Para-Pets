// This is only a retry reference. The server still retrieves the session from
// Stripe and checks paid status, package, amount, currency and player ownership.
type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const keyFor = (userId: string) => `para-pets:pending-purchase:${userId}`;

export function pendingPurchaseSession(userId: string, search: string, store?: SessionStore): string | null {
  const params = new URLSearchParams(search);
  const returned = params.get("success") === "true" ? params.get("session_id") : null;
  try {
    if (returned) store?.setItem(keyFor(userId), returned);
    return returned || store?.getItem(keyFor(userId)) || null;
  } catch {
    // A blocked/full browser store must not prevent verification of the URL.
    return returned;
  }
}

export function clearPendingPurchase(userId: string, sessionId: string, store?: SessionStore): void {
  try {
    // An older response must not erase a newer checkout waiting for verification.
    if (store?.getItem(keyFor(userId)) === sessionId) store.removeItem(keyFor(userId));
  } catch { /* The successful Stripe verification remains authoritative. */ }
}

export const PURCHASE_QUERY_KEYS = [
  "/api/coins/packs", "/api/coins/progress", "/api/rewards/pending",
  "/api/admin/coin-purchases", "/api/public/leaderboard", "/api/founders",
  "/api/inventory", "/api/gifts/pending", "/api/auth/me", "/api/badges", "/api/user/badges",
] as const;

export const PURCHASE_REFRESH_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchInterval: 30_000,
};
