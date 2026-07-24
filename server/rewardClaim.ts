/**
 * Small, database-agnostic boundary for a reward claim.  The caller supplies
 * transactional operations; this keeps the ordering testable while ensuring a
 * claim record is never committed independently from its grants.
 */
export type RewardClaimResult = "success" | "already-claimed" | "ineligible";

export interface RewardClaimOperations {
  eligible(): Promise<boolean>;
  /** Atomically reserve the claim inside the caller's transaction. */
  reserve(): Promise<boolean>;
  grantCoins(): Promise<void>;
  grantItems(): Promise<void>;
  commit(): Promise<void>;
}

export async function executeRewardClaim(operations: RewardClaimOperations): Promise<RewardClaimResult> {
  if (!await operations.eligible()) return "ineligible";
  if (!await operations.reserve()) return "already-claimed";
  await operations.grantCoins();
  await operations.grantItems();
  await operations.commit();
  return "success";
}
