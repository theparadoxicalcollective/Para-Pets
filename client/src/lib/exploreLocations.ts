/**
 * Types and stable IDs for client-side explore-location configurations.
 *
 * Each explore location has a matching world_locations DB row (for map icon
 * rendering) and a WalkAroundLocationConfig (for scene setup). The DB row
 * stores posX/posY/iconSize; this file stores everything the scene needs.
 */

/** Editable boundary inside the scene background where the pet may walk.
 *  All values are fractions of the scene container's width/height (0–1). */
export interface WalkableBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Extension points for future combat features — none active yet. */
export interface ExploreLocationFeatures {
  movement: boolean;
  enemies: boolean;
  combat: boolean;
  rewards: boolean;
  interactions: boolean;
  // ── Future slots — implement when ready ──────────────────────────────────
  enemySpawning?: boolean;
  petAttackAnimations?: boolean;
  hitboxes?: boolean;
  healthSystem?: boolean;
  enemyWaves?: boolean;
  itemDrops?: boolean;
  cooldowns?: boolean;
  temporaryVisualEffects?: boolean;
}

/** Full configuration for a walk-around explore area. */
export interface WalkAroundLocationConfig {
  /** Must match the world_locations.id DB row. */
  id: string;
  worldId: string;
  name: string;
  /** Client-side route, e.g. "/explore/elysian-bayou-clearing". */
  route: string;
  /** Imported background image URL — pass from the page via @assets import. */
  backgroundUrl: string;
  sceneType: "walk-around";
  /** Area inside the background where the pet is allowed to walk. */
  walkableBounds: WalkableBounds;
  /** Starting position as a fraction of the container (0–1). */
  spawnPoint: { x: number; y: number };
  /** Movement speed: scene-fraction units per second. */
  movementSpeed: number;
  features: ExploreLocationFeatures;
}

// ── Stable DB row IDs ────────────────────────────────────────────────────────

export const ELYSIAN_BAYOU_CLEARING_ID = "a1b2c3d4-0011-4000-8000-000000000011";
