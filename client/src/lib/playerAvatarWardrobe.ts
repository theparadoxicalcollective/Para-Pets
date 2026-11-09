import type { PlayerCharacterPart } from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
} from "@shared/playerCharacterClothing";

export const PLAYER_AVATAR_QUERY_KEY = ["/api/player-avatar"] as const;

/** All avatar UI (Home, walking and wardrobe) must cache owned artwork by
 * authenticated account, never at the unscoped endpoint prefix. Otherwise an
 * account switch can briefly display another player's cached outfit.
 * Keep the prefix for targeted invalidations without storing player data on it.
 */
export const playerAvatarQueryKey = (userId: string) =>
  [...PLAYER_AVATAR_QUERY_KEY, userId] as const;

/**
 * Shared authenticated, no-store read for the wardrobe and Home actor.
 * A failed or malformed read must never be confused with created:false:
 * otherwise Home would show Design Character for an existing player.
 */
export async function fetchPlayerAvatar(signal?: AbortSignal): Promise<PlayerAvatarState> {
  const response = await fetch("/api/player-avatar", {
    credentials: "include", signal, cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load your saved character");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" ||
      !("created" in data) || typeof data.created !== "boolean" ||
      !("equipped" in data) || !Array.isArray(data.equipped) ||
      !("ownedClothing" in data) || !Array.isArray(data.ownedClothing) ||
      !("unavailableEquipmentSlots" in data) || !Array.isArray(data.unavailableEquipmentSlots) ||
      !("base" in data) ||
      (data.base !== null && (
        !data.base || typeof data.base !== "object" ||
        !("parts" in data.base) || !Array.isArray(data.base.parts)
      ))) {
    throw new Error("Player avatar response was invalid");
  }
  return data as PlayerAvatarState;
}


export interface OwnedAvatarClothing {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  category: PlayerClothingCategory;
  quantity: number;
  isListed: boolean;
  compatible: boolean;
  segments: PlayerClothingSegment[];
}

export interface EquippedAvatarClothing {
  category: PlayerClothingCategory;
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  segments: PlayerClothingSegment[];
}

export interface PlayerAvatarState {
  created: boolean;
  revision: number | null;
  base: {
    id: string;
    name: string;
    publishedAt: string;
    parts: PlayerCharacterPart[];
  } | null;
  ownedClothing: OwnedAvatarClothing[];
  equipped: EquippedAvatarClothing[];
  unavailableEquipmentSlots: PlayerClothingCategory[];
}

/**
 * Clothing belongs to seven wardrobe categories, but each item contains up
 * to eight artwork segments attached to the independent animation rig.
 * Never merge by partType: a hat, hair and face may all follow the same head.
 */
export interface AvatarClothingLayer {
  category: PlayerClothingCategory;
  inventoryId: string;
  segments: readonly PlayerClothingSegment[];
}

export function wardrobeLayers(
  avatar: PlayerAvatarState,
  preview?: { category: PlayerClothingCategory; inventoryId: string } | null,
): AvatarClothingLayer[] {
  const unavailable = new Set(avatar.unavailableEquipmentSlots);
  const equipped: AvatarClothingLayer[] = avatar.equipped
    .filter(item => !unavailable.has(item.category))
    .map(({ category, inventoryId, segments }) => ({ category, inventoryId, segments }));

  const chosen = preview && avatar.ownedClothing.find(item =>
    item.inventoryId === preview.inventoryId &&
    item.category === preview.category &&
    item.compatible && !item.isListed && item.quantity > 0
  );
  if (chosen) {
    const index = equipped.findIndex(item => item.category === chosen.category);
    if (index >= 0) equipped.splice(index, 1);
    equipped.push({
      category: chosen.category,
      inventoryId: chosen.inventoryId,
      segments: chosen.segments,
    });
  }

  return equipped.sort((a, b) =>
    PLAYER_CLOTHING_CATEGORIES.indexOf(a.category) -
    PLAYER_CLOTHING_CATEGORIES.indexOf(b.category));
}

export async function writePlayerAvatar(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<PlayerAvatarState> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = value && typeof value === "object" && "message" in value &&
      typeof value.message === "string" ? value.message : "Could not save your character";
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return value as PlayerAvatarState;
}
