export type StripePurchaseErrorCode =
  | "unsupported_package" | "unknown_player" | "amount_mismatch"
  | "currency_mismatch" | "unpaid" | "invalid_state" | "player_mismatch"
  | "concurrent_conflict" | "stripe_retrieval_failed" | "database_failure";

export class StripePurchaseError extends Error {
  constructor(public readonly code: StripePurchaseErrorCode, message: string) {
    super(message);
    this.name = "StripePurchaseError";
  }
}
