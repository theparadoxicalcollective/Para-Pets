export const GINNY_QUEST_KEY = "ginny_mini_pet_companion" as const;
export const GINNY_WORLD_ID = "haunted_woods" as const;
export const GINNY_NPC_NAME = "Ginny" as const;
export const GINNY_REWARD_COINS = 500 as const;

export const GINNY_MINI_PET_CHOICES = ["bat", "ghost"] as const;
export type GinnyMiniPetChoice = (typeof GINNY_MINI_PET_CHOICES)[number];

export function parseGinnyMiniPetChoice(value: unknown): GinnyMiniPetChoice | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (GINNY_MINI_PET_CHOICES as readonly string[]).includes(normalized)
    ? (normalized as GinnyMiniPetChoice)
    : null;
}

export function normalizeGinnyNpcName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

export function isGinnyNpcName(value: unknown): boolean {
  const normalized = normalizeGinnyNpcName(value);
  return normalized === "ginny" || normalized.startsWith("ginny ");
}
