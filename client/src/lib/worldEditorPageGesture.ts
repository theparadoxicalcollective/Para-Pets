import { resolveWorldSceneAction } from "@shared/worlds/worldSceneActions";
import type { WorldSceneAsset, WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import { isKnownWorldId } from "@shared/worlds/worldRegistry";

export type WorldEditorTap = {
  itemId: string; pointerType: string; x: number; y: number; time: number;
};

// Only completed taps on already-selected, opaque artwork are passed here.
// Keep a small spatial tolerance for touch and use monotonic pointer timestamps.
export function isWorldEditorDoubleTap(previous: WorldEditorTap | null, next: WorldEditorTap): boolean {
  return !!previous && previous.itemId === next.itemId && previous.pointerType === next.pointerType &&
    next.time >= previous.time && next.time - previous.time <= 450 &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= 24;
}

export type WorldEditorAttachedPage =
  | { kind: "beau-prize-wheel" }
  | { kind: "room" }
  | { kind: "legacy"; locationId: string };

export function worldEditorAttachedPage(
  worldId: string, placement: WorldScenePlacement | null, asset: WorldSceneAsset | undefined,
): WorldEditorAttachedPage | null {
  if (!placement || placement.worldId !== worldId || !asset?.imageUrl ||
      asset.worldId !== worldId || asset.id !== placement.assetId || asset.kind !== placement.kind) return null;
  const action = resolveWorldSceneAction(worldId, placement.kind, asset);
  if (action === "beau-prize-wheel") return { kind: action };
  if (placement.kind !== "building") return null;
  if (placement.legacyLocationId) return { kind: "legacy", locationId: placement.legacyLocationId };
  return asset.interiorImageUrl ? { kind: "room" } : null;
}

// Only the verified catalog entry can supply a destination, not artwork names
// or arbitrary URLs. The admin return target is always a known editor world.
export function worldEditorLegacyPagePath(
  editorWorld: string, locationId: string,
  page: { id: string; worldId: string } | undefined,
): string | null {
  if (!page || page.id !== locationId || !isKnownWorldId(page.worldId) ||
      !isKnownWorldId(editorWorld)) return null;
  const params = new URLSearchParams({ legacyLocationId: page.id, returnEditor: editorWorld });
  return `/world/${encodeURIComponent(page.worldId)}?${params}`;
}
