export const HOME_REWARD_TYPES = ["house_bundle", "home_decor"] as const;
export type HomeRewardType = typeof HOME_REWARD_TYPES[number];

export interface ParsedHomeReward {
  type: HomeRewardType;
  id: string;
  quantity: number;
}

function isHomeRewardType(value: unknown): value is HomeRewardType {
  return value === "house_bundle" || value === "home_decor";
}

export function parseHomeRewards(value: unknown): ParsedHomeReward[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("homeRewards must be an array");

  const aggregated = new Map<string, ParsedHomeReward>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid home reward");
    }

    const candidate = raw as Record<string, unknown>;
    if (!isHomeRewardType(candidate.type)) {
      throw new Error("Invalid home reward type");
    }

    if (typeof candidate.id !== "string" || !candidate.id.trim()) {
      throw new Error("Home reward id is required");
    }

    const id = candidate.id.trim();
    const requestedQuantity = candidate.quantity === undefined ? 1 : Number(candidate.quantity);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 999) {
      throw new Error("Home reward quantity must be between 1 and 999");
    }

    const quantity = candidate.type === "house_bundle" ? 1 : requestedQuantity;
    const key = `${candidate.type}:${id}`;
    const existing = aggregated.get(key);

    if (!existing) {
      aggregated.set(key, { type: candidate.type, id, quantity });
      continue;
    }

    if (candidate.type === "house_bundle") continue;
    const combined = existing.quantity + quantity;
    if (combined > 999) throw new Error("Home reward quantity must be between 1 and 999");
    existing.quantity = combined;
  }

  return [...aggregated.values()];
}
