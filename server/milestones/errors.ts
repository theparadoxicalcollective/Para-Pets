export type PurchaseMilestoneErrorCode =
  | "unknown_milestone"
  | "not_qualified"
  | "already_claimed"
  | "missing_reward_configuration"
  | "unsupported_reward_type"
  | "invalid_reward_configuration"
  | "invalid_legacy_claim_state"
  | "concurrent_conflict"
  | "reward_grant_failure"
  | "transaction_failure";

export class PurchaseMilestoneError extends Error {
  constructor(public readonly code: PurchaseMilestoneErrorCode, message: string) {
    super(message);
    this.name = "PurchaseMilestoneError";
  }
}
