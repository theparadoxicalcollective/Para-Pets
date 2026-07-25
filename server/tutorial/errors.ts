export type TutorialErrorCode =
  | "invalid_request"
  | "player_not_found"
  | "reward_item_unavailable"
  | "tutorial_not_completed"
  | "transaction_failure";

export class TutorialError extends Error {
  constructor(public readonly code: TutorialErrorCode, message: string) {
    super(message);
    this.name = "TutorialError";
  }
}

export function invalidTutorialRequest(): TutorialError {
  return new TutorialError("invalid_request", "Request body must be empty");
}
