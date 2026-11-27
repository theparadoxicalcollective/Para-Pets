import { BEAU_PRIZE_WHEEL_WORLD_ID, HAUNTED_SPIN_DECOR_ART } from "../beauPrizeWheel";

/** Code-owned gameplay connections for authored world objects. No arbitrary
 * route names or gameplay configuration come from artwork or player input. */
export type WorldSceneAction = "beau-prize-wheel";
export const HAUNTED_SPIN_DECOR_NAME = "Haunted Spin";

/** The editor's linked copies retain the same asset and name. Match only this
 * exact named outdoor decoration (or its exact bundled artwork) in its own world, never a similarly named
 * building, NPC or decoration in a different world. */
export function resolveWorldSceneAction(
  worldId: string, placementKind: string,
  asset: { worldId: string; kind: string; name: string; imageUrl?: string | null } | null | undefined,
): WorldSceneAction | null {
  if (worldId === BEAU_PRIZE_WHEEL_WORLD_ID && placementKind === "decor" &&
      asset?.worldId === worldId && asset.kind === "decor" &&
      (asset.name.trim().toLowerCase() === HAUNTED_SPIN_DECOR_NAME.toLowerCase() ||
       asset.imageUrl === HAUNTED_SPIN_DECOR_ART)) {
    return "beau-prize-wheel";
  }
  return null;
}
