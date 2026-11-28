import { BEAU_PRIZE_WHEEL_WORLD_ID, HAUNTED_SPIN_DECOR_ART } from "../beauPrizeWheel";
import { HAUNTED_WOODS_WORLD_ID } from "./hauntedWoods";

/** Code-owned gameplay connections for authored world objects. No arbitrary
 * route names or gameplay configuration come from artwork or player input. */
export type WorldSceneFishingAction = "fishing-leaderboard" | "fishing-spot";
export type WorldSceneAction = "beau-prize-wheel" | WorldSceneFishingAction;
export const HAUNTED_SPIN_DECOR_NAME = "Haunted Spin";
export const HAUNTED_FISH_LEADERBOARD_DECOR_NAME = "Fish Leaderboard";
// The asset can be renamed by an admin; recognize the original name and
// the exact fishing leaderboard labels used by the editor, not arbitrary signs.
const HAUNTED_FISH_LEADERBOARD_NAMES = new Set([
  HAUNTED_FISH_LEADERBOARD_DECOR_NAME.toLowerCase(),
  "fishing leaderboard",
  "haunted fishing leaderboard",
  "haunted forest fishing leaderboard",
  "haunted woods fishing leaderboard",
]);

/** Connections are world-scoped and apply only to outdoor placements. Match
 * exact decoration names (or the existing Spin artwork), and standalone water
 * ripple effects — never terrain, attached effects or similarly named buildings. */
export function resolveWorldSceneAction(
  worldId: string, placementKind: string,
  asset: { worldId: string; kind: string; name: string; imageUrl?: string | null } | null | undefined,
  effectType?: string | null,
): WorldSceneAction | null {
  if (worldId === HAUNTED_WOODS_WORLD_ID) {
    if (placementKind === "effect" && effectType === "water_ripple") return "fishing-spot";
    if (placementKind === "decor" && asset?.worldId === worldId && asset.kind === "decor" &&
        HAUNTED_FISH_LEADERBOARD_NAMES.has(asset.name.trim().toLowerCase())) {
      return "fishing-leaderboard";
    }
  }
  if (worldId === BEAU_PRIZE_WHEEL_WORLD_ID && placementKind === "decor" &&
      asset?.worldId === worldId && asset.kind === "decor" &&
      (asset.name.trim().toLowerCase() === HAUNTED_SPIN_DECOR_NAME.toLowerCase() ||
       asset.imageUrl === HAUNTED_SPIN_DECOR_ART)) {
    return "beau-prize-wheel";
  }
  return null;
}

/** The new Soul Exchange stays inside the authored Haunted Woods room. */
export const HAUNTED_SOUL_EXCHANGE_STONE_NAME = "The Soul Exchange Stone";

export function resolveWorldSceneInteriorAction(
  worldId: string, itemKind: string,
  asset: { worldId: string; kind: string; name: string } | null | undefined,
): "soul-exchange" | null {
  return worldId === HAUNTED_WOODS_WORLD_ID && itemKind === "decor" &&
    asset?.worldId === worldId && asset.kind === "decor" &&
    asset.name.trim().toLowerCase() === HAUNTED_SOUL_EXCHANGE_STONE_NAME.toLowerCase()
    ? "soul-exchange" : null;
}
