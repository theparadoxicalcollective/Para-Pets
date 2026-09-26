export const CARD_SPECIAL_EFFECTS = ["stars", "aurora", "wisps", "pumpkin"] as const;
export type CardSpecialEffect = (typeof CARD_SPECIAL_EFFECTS)[number];

export function parseCardSpecialEffect(value: unknown): CardSpecialEffect | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && CARD_SPECIAL_EFFECTS.includes(value as CardSpecialEffect)) {
    return value as CardSpecialEffect;
  }
  throw new Error("Invalid card special effect");
}

export function cardArtworkEffect(specialEffect: CardSpecialEffect | null | undefined): CardSpecialEffect | "rarity" {
  return specialEffect ?? "rarity";
}
