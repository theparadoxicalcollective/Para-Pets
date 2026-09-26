export const CARD_LABELS = ["halloween", "christmas", "valentine"] as const;
export type CardLabel = (typeof CARD_LABELS)[number];

export const CARD_LABEL_DETAILS: Record<CardLabel, { text: string; background: string; highlight: string }> = {
  halloween: { text: "Halloween Special", background: "#6D2F8E", highlight: "#934DB3" },
  christmas: { text: "Christmas Special", background: "#176B43", highlight: "#258B59" },
  valentine: { text: "Valentine Special", background: "#8F3042", highlight: "#B24759" },
};

export function parseCardLabel(value: unknown): CardLabel | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && CARD_LABELS.includes(value as CardLabel)) return value as CardLabel;
  throw new Error("Invalid card label");
}
