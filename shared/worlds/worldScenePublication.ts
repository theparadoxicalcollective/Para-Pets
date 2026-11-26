import { isKnownWorldId, type WorldId } from "./worldRegistry";
import type { WorldSceneContent } from "./worldSceneContent";
import type { WorldGroundTheme } from "./worldGroundTheme";

/** An independent, reversible player-facing choice for each registered world.
 * Saving an editor draft never changes this choice. */
export type WorldScenePublication = {
  worldId: WorldId;
  active: boolean;
  hasPublished: boolean;
  updatedAt: string | null;
  publishedAt: string | null;
};

/** A frozen, player-safe scene saved when the admin explicitly selects
 * Save & Set Live. Editing the draft never mutates this snapshot. */
export type PublishedWorldScene = WorldSceneContent & {
  worldId: WorldId;
  groundLevel: number;
  groundTheme: WorldGroundTheme;
  linkedPages: Array<{
    id: string; worldId: string; name: string; type: string; bgUrl: string | null;
  }>;
  npcs: Array<{ id: string; name: string; imageUrl: string | null }>;
};

export const PLAYER_WORLD_ZOOM_MAX = 1.4; // modestly closer-out than the editor's 1.6
export const PLAYER_WORLD_ZOOM_STEP = 0.12;

export function clampPlayerWorldZoom(value: number, minZoom: number): number {
  const lower = Number.isFinite(minZoom) ? Math.min(PLAYER_WORLD_ZOOM_MAX, Math.max(0.6, minZoom)) : 0.6;
  return Math.min(PLAYER_WORLD_ZOOM_MAX, Math.max(lower, Number.isFinite(value) ? value : 1));
}

export function isPublishedWorld(worldId: string, states: readonly WorldScenePublication[]): boolean {
  return isKnownWorldId(worldId) && states.some(state => state.worldId === worldId && state.active === true);
}
