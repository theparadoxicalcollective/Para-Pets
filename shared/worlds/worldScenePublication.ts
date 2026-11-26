import type { WorldGroundTheme } from "./worldGroundTheme";
import type { WorldSceneContent } from "./worldSceneContent";

/** The immutable, world-scoped copy players see when the admin switches that
 * world to its new scene. Continuing to edit the draft does not change this. */
export type WorldScenePlayerSnapshot = {
  worldId: string;
  groundLevel: number;
  groundTheme: WorldGroundTheme;
  content: WorldSceneContent;
  npcs: Array<{ id: string; name: string; imageUrl: string | null; specialSkill: string | null;
    legacyLocationId: string | null }>;
  legacyLocations: Array<{ id: string; worldId: string; name: string; type: string; isShop: boolean }>;
  publishedAt: string;
};

export type WorldScenePublicationStatus = {
  worldId: string;
  useNewWorld: boolean;
  hasPublishedSnapshot: boolean;
  hasSavedDraft: boolean;
  placementCount: number;
  legacyLinkCount: number;
  blockers: string[];
  warnings: string[];
  updatedAt: string | null;
};

/** When a switch is allowed, preserve older location pages until their
 * quests, shops, NPCs and player inventories have been verified in the new UI.
 * A safe publication does NOT authorize deleting these shared records. */
export function canSwitchToNewWorld(status: WorldScenePublicationStatus): boolean {
  return status.hasSavedDraft && status.placementCount > 0 &&
    status.blockers.length === 0;
}
