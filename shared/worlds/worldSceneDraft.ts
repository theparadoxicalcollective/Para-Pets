import { isParkGroundLevel, isParkGroundTheme, type ParkGroundTheme } from "../petParkGround";
import { isKnownWorldId, type WorldId } from "./worldRegistry";

/**
 * The World Editor is a private authoring system, distinct from Pet Park.
 * This is draft metadata only; it never selects a player-facing world.
 */
export type WorldSceneDraftSettings = {
  groundLevel: number;
  groundTheme: ParkGroundTheme;
};

export type WorldSceneDraft = WorldSceneDraftSettings & {
  worldId: WorldId;
  hasSavedDraft: boolean;
  updatedAt: string | null;
};

const THEMES_BY_WORLD: Partial<Record<WorldId, ParkGroundTheme>> = {
  snowy_mountain: "snow",
  haunted_woods: "haunted",
  swamp: "swamp",
  volcanic: "volcanic",
};

export function defaultWorldSceneDraft(worldId: WorldId): WorldSceneDraft {
  return {
    worldId,
    groundLevel: 1,
    groundTheme: THEMES_BY_WORLD[worldId] ?? "grass",
    hasSavedDraft: false,
    updatedAt: null,
  };
}

/** Refuse unknown worlds, malformed data and implicit string-to-number coercion. */
export function parseWorldSceneDraftSettings(value: unknown): WorldSceneDraftSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isParkGroundLevel(input.groundLevel) || !isParkGroundTheme(input.groundTheme)) return null;
  return { groundLevel: input.groundLevel, groundTheme: input.groundTheme };
}

export function isEditableWorldSceneId(worldId: string): worldId is WorldId {
  return isKnownWorldId(worldId);
}
