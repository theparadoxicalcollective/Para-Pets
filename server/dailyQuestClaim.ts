/**
 * Database-free coordination for a daily-quest claim. The route supplies
 * operations bound to one database transaction and to the authenticated user.
 */
export type DailyQuestClaimResult = "success" | "already-claimed" | "incomplete" | "expired";

export interface DailyQuestClaimOperations {
  state(): Promise<"ready" | "already-claimed" | "incomplete" | "expired">;
  /** Reserve the locked progress row before granting any value. */
  reserve(): Promise<boolean>;
  grantCoins(): Promise<void>;
  grantItems(): Promise<void>;
  /** Persist the claim only after every configured grant succeeded. */
  commit(): Promise<void>;
}

export async function executeDailyQuestClaim(operations: DailyQuestClaimOperations): Promise<DailyQuestClaimResult> {
  const state = await operations.state();
  if (state !== "ready") return state;
  if (!await operations.reserve()) return "already-claimed";
  await operations.grantCoins();
  await operations.grantItems();
  await operations.commit();
  return "success";
}
