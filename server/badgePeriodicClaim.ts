/**
 * Database-free coordination for a periodic badge coin claim. The route binds
 * these operations to one transaction after it has acquired its advisory and
 * row locks.
 */
export type BadgePeriodicClaimResult = "success" | "not-owned" | "no-reward" | "cooldown" | "already-claimed";

export interface BadgePeriodicClaimOperations {
  state(): Promise<"ready" | "not-owned" | "no-reward" | "cooldown">;
  /** Confirms the transaction's lock-backed reservation is still usable. */
  reserve(): Promise<boolean>;
  grantCoins(): Promise<void>;
  /** Write the database-time claim timestamp only after the grant succeeds. */
  commit(): Promise<void>;
}

export async function executeBadgePeriodicClaim(
  operations: BadgePeriodicClaimOperations,
): Promise<BadgePeriodicClaimResult> {
  const state = await operations.state();
  if (state !== "ready") return state;
  if (!await operations.reserve()) return "already-claimed";
  await operations.grantCoins();
  await operations.commit();
  return "success";
}
