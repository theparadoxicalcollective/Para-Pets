export type FishingCompletionOutcome = "caught" | "miss";

export interface FishingCompletionResponse<TCaught, TItem> {
  outcome?: FishingCompletionOutcome;
  caught?: TCaught | null;
  fishItemId?: string;
  item?: TItem | null;
  reason?: string;
  replayed?: boolean;
}

export function fishingCompletionOutcome<TCaught, TItem>(
  response: FishingCompletionResponse<TCaught, TItem>,
): FishingCompletionOutcome {
  if (response.outcome === "caught" || response.outcome === "miss") return response.outcome;
  // Backward compatibility for attempts committed before the outcome field deployed.
  if (response.caught) return "caught";
  if (response.reason === "miss") return "miss";
  throw new Error("Fishing completion response has no authoritative outcome");
}
