import { parkImageHitAt } from "./petParkImageHit";
import { isParkConnectedPath } from "@shared/petParkTerrainDetails";

export type ParkAdminArtworkHit = {
  kind: "building" | "item";
  id: string;
  image: HTMLImageElement | null;
};
type ParkAdminObject = {
  kind?: string;
  effectType?: string | null;
  flipped: boolean;
};

/**
 * Admin-only hit selection. CSS rectangular hit targets can catch clicks in
 * transparent PNG padding before the intended smaller object ever sees them.
 * Check every overlapping world object in its *actual rendered depth order*
 * against the original alpha pixels; the first visible pixel wins.
 *
 * Only runs on pointer-down. No change to scene depth, stored placement or
 * player interaction targets; no per-frame canvas work.
 */
export function pickParkAdminArtwork(
  sceneElement: Element,
  clientX: number,
  clientY: number,
  lookup: (kind: "building" | "item", id: string) => ParkAdminObject | null,
): ParkAdminArtworkHit | null {
  const candidates = Array.from(
    sceneElement.querySelectorAll<HTMLElement>("[data-park-draggable][data-park-object-id]"),
  ).map((node, order) => ({
    node, order, z: Number(node.style.zIndex) || 0,
  })).sort((a, b) => b.z - a.z || b.order - a.order);

  for (const { node } of candidates) {
    const kind = node.dataset.parkObjectKind;
    const id = node.dataset.parkObjectId;
    if ((kind !== "building" && kind !== "item") || !id) continue;
    const object = lookup(kind, id);
    if (!object) continue;
    const rect = node.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top ||
        clientY > rect.bottom || rect.width <= 0 || rect.height <= 0) continue;

    const image = node.querySelector<HTMLImageElement>("img");
    if (image && (kind === "building" || object.kind === "decor")) {
      if (!parkImageHitAt(image, clientX, clientY, object.flipped)) continue;
    } else if (object.kind === "terrain" &&
        (isParkConnectedPath(object.effectType) || object.effectType === "garden_plot")) {
      // Painted paths, water and garden plots use the actual isometric diamond.
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      if (Math.abs(x - 0.5) + Math.abs(y - 0.5) > 0.5) continue;
    } else if (object.kind === "effect" || object.kind === "sleep_spot") {
      // Many glow/mist effects have a huge transparent rectangular element at
      // depth 12M. Their center is the admin's drag handle; the invisible
      // outskirts should never block decor or plots below them.
      const radius = Math.min(28, Math.min(rect.width, rect.height) * 0.38);
      if (Math.hypot(clientX - (rect.left + rect.width / 2),
        clientY - (rect.top + rect.height / 2)) > radius) continue;
    }
    return { kind, id, image };
  }
  return null;
}
