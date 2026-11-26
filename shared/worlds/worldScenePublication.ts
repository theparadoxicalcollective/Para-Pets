import { isKnownWorldId, type WorldId } from "./worldRegistry";

/** An independent, reversible player-facing choice for each registered world.
 * Saving an editor draft never changes this choice. */
export type WorldScenePublication = {
  worldId: WorldId;
  active: boolean;
  hasBeenLive: boolean;
  updatedAt: string | null;
  firstEnabledAt: string | null;
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
