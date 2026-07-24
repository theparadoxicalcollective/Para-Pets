/**
 * Database-free coordination for a first-catch fishing reward. The caller
 * supplies operations bound to one database transaction, including locking.
 */
export type FishCatchRewardClaimResult = "success" | "not-caught" | "already-claimed";

export interface FishCatchRewardClaimOperations {
  state(): Promise<"ready" | "not-caught" | "already-claimed">;
  grantCoins(): Promise<void>;
  /** Permanently claims every matching unclaimed historic log row. */
  claimCatchLogRows(): Promise<void>;
}

export async function executeFishCatchRewardClaim(
  operations: FishCatchRewardClaimOperations,
): Promise<FishCatchRewardClaimResult> {
  const state = await operations.state();
  if (state !== "ready") return state;
  await operations.grantCoins();
  await operations.claimCatchLogRows();
  return "success";
}
