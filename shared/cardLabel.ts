export const CARD_LABELS = ["halloween", "christmas", "valentine"] as const;
export type CardLabel = (typeof CARD_LABELS)[number];

export const CARD_LABEL_DETAILS: Record<CardLabel, { text: string; background: string }> = {
  halloween: { text: "Halloween Special", background: "#261432" },
  christmas: { text: "Christmas Special", background: "#123a2c" },
  valentine: { text: "Valentine Special", background: "#4b1829" },
};

export function parseCardLabel(value: unknown): CardLabel | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && CARD_LABELS.includes(value as CardLabel)) return value as CardLabel;
  throw new Error("Invalid card label");
}
