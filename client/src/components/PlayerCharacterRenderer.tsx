import { playerCharacterCssTint } from "@/lib/playerCharacterCssTint";
import type { PlayerCharacterPart, PlayerCharacterPartType } from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  clothingLayerDepth,
  clothingSegmentKey,
  type PlayerClothingCategory,
  type PlayerClothingSegment,
} from "@shared/playerCharacterClothing";
import type { AvatarClothingLayer } from "@/lib/playerAvatarWardrobe";
import "./PlayerCharacterRenderer.css";

/** Existing body motion stays intact. New clothing uses the same part-motion
 * class but sits on the SHARED 1000×1000 canvas at global category depth.
 * Legacy published clothing without canvasAligned retains part-local fitting.
 */
export type PlayerCharacterMotion = "static" | "idle" | "walk";

export interface PlayerCharacterRendererProps {
  parts: readonly PlayerCharacterPart[];
  clothingSegments?: readonly PlayerClothingSegment[];
  clothingLayers?: readonly AvatarClothingLayer[];
  previewClothingCategory?: PlayerClothingCategory;
  /** Temporary editor-only swatch; never saved onto the clothing catalog art. */
  previewClothingTint?: string | null;
  previewEyesClosed?: boolean;
  /** Optional artist-friendly tint; null retains the original source pixels. */
  skinTone?: string | null;
  /** Player-owned tuck option: only changes Tops versus Bottoms depth. */
  topTucked?: boolean;
  motion?: PlayerCharacterMotion;
  selectedPartType?: PlayerCharacterPartType | null;
  ariaLabel?: string;
}

export default function PlayerCharacterRenderer({
  parts,
  clothingSegments = [],
  clothingLayers = [],
  previewClothingCategory = "top",
  previewClothingTint = null,
  previewEyesClosed = false,
  skinTone = null,
  topTucked = false,
  motion = "static",
  selectedPartType = null,
  ariaLabel = "Player character",
}: PlayerCharacterRendererProps) {
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
  const layers = [
    ...clothingSegments.map(segment => ({
      segment,
      key: `draft:${clothingSegmentKey(segment)}`,
      category: previewClothingCategory,
      colorTint: previewClothingTint,
      itemKey: `draft:${previewClothingCategory}`,
      categoryOrder: 0,
    })),
    ...clothingLayers.flatMap(outfit => outfit.segments.map(segment => ({
      segment,
      key: `${outfit.category}:${outfit.inventoryId}:${clothingSegmentKey(segment)}`,
      category: outfit.category,
      // Server and wardrobe gate opt-in recoloring by catalog SKU.
      // Non-recolorable garments never receive a tint from old saved data.
      colorTint: outfit.colorTint ?? null,
      itemKey: `${outfit.category}:${outfit.inventoryId}`,
      categoryOrder: PLAYER_CLOTHING_CATEGORIES.indexOf(outfit.category),
    }))),
  ];
  const oldPartLocal = layers.filter(layer => !layer.segment.canvasAligned);
  const partByType = new Map(parts.map(part => [part.partType, part]));
  // Base parts have their own z-indices (the torso can reach 70).
  // Never compare a clothing category depth directly with those part values:
  // that incorrectly puts Bottoms (55) behind the torso. Give clothing its
  // own foreground/background bands while preserving category ordering.
  const bodyMaxDepth = Math.max(0, ...parts.map(part => part.zIndex));
  const bodyMinDepth = Math.min(0, ...parts.map(part => part.zIndex));
  const isBackArtwork = (layer: (typeof layers)[number]) =>
    layer.category === "back" ||
    (layer.category === "hair" && layer.segment.renderPlane === "behind_character");
  const garmentDepth = (layer: (typeof layers)[number]) => {
    const slot = layer.category === "hair" && isBackArtwork(layer)
      ? "hair_back" : layer.segment.slot;
    return (isBackArtwork(layer) ? bodyMinDepth - 140 : bodyMaxDepth + 140)
      + clothingLayerDepth(layer.category, slot, layer.segment.shoesLayer, topTucked);
  };
  const fullCanvas = layers.filter(layer => layer.segment.canvasAligned)
    .sort((a,b) => clothingLayerDepth(a.category, a.category === "hair" &&
        a.segment.renderPlane === "behind_character" ? "hair_back" : a.segment.slot, a.segment.shoesLayer, topTucked)
      - clothingLayerDepth(b.category, b.category === "hair" &&
        b.segment.renderPlane === "behind_character" ? "hair_back" : b.segment.slot, b.segment.shoesLayer, topTucked));
  // Apply the same native CSS color filter to an already-flattened silhouette.
  // iOS WebKit can ignore CSS url(#svg-filter) on accelerated HTML layers.
  const tintFilter = (color: string | null) =>
    color ? playerCharacterCssTint(color) : undefined;
  // A colored Top or Bottom is ONE tinted material even when made from
  // independently moving sleeve/torso or leg sprites. Group only those two
  // categories: Hair Back and other high/low-depth accessories must retain
  // their existing scene stacking and blink/motion behavior.
  const compositedGarments = [...new Set(layers
    .filter(layer => (layer.category === "top" || layer.category === "bottom") && !!layer.colorTint)
    .map(layer => layer.itemKey))].map(itemKey => {
      const pieces = layers.filter(layer => layer.itemKey === itemKey);
      return { itemKey, pieces, color: pieces[0].colorTint!, depth: garmentDepth(pieces[0]) };
    });
  const compositeKeys = new Set(compositedGarments.map(item => item.itemKey));

  // Keep both legacy local-fit and new 1000px-canvas pieces in the exact
  // same rig. A nested colored piece receives NO independent filter; the
  // garment group's final composited alpha is recolored only once.
  const renderLegacy = (layer: (typeof layers)[number], grouped = false) => {
    const part = partByType.get(layer.segment.partType);
    if (!part) return null;
    return (
      <div key={layer.key} data-clothing-part={layer.segment.partType}
        data-clothing-slot={layer.segment.slot ?? layer.segment.partType}
        data-clothing-plane={layer.segment.renderPlane}
        data-clothing-key={layer.key}
        data-legacy-clothing-overlay="true"
        className="player-character-renderer__anchor"
        style={{
          left: `${part.xPct}%`, top: `${part.yPct}%`,
          width: `${part.widthPct}%`,
          zIndex: grouped ? 1 : garmentDepth(layer),
          transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%`,
          transform: `translate(-${part.pivotXPct}%, -${part.pivotYPct}%) rotate(${part.rotationDeg}deg)`,
        }}>
        <div data-character-motion-part={layer.segment.partType}
          className={`player-character-renderer__motion player-character-renderer__motion--${motion}`}
          style={{ transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%` }}>
          {/* Intrinsic part image keeps legacy fit coordinates aligned. */}
          <img src={part.imageUrl} alt="" aria-hidden="true" draggable={false}
            className="player-character-renderer__image" style={{ visibility: "hidden" }}/>
          <div className="player-character-renderer__clothing"
            style={{
              left: `${layer.segment.fit.xPct}%`,
              top: `${layer.segment.fit.yPct}%`,
              width: `${layer.segment.fit.widthPct}%`,
              transformOrigin: `${layer.segment.fit.pivotXPct}% ${layer.segment.fit.pivotYPct}%`,
              transform: `translate(-${layer.segment.fit.pivotXPct}%, -${layer.segment.fit.pivotYPct}%) rotate(${layer.segment.fit.rotationDeg}deg)`,
              zIndex: 1,
              filter: grouped ? undefined : tintFilter(layer.colorTint),
            }}>
            <img src={layer.segment.imageUrl} alt="" aria-hidden="true"
              draggable={false} className="player-character-renderer__legacy-image" />
          </div>
        </div>
      </div>
    );
  };
  const renderCanvas = (layer: (typeof layers)[number], grouped = false) => {
    const attachment = partByType.get(layer.segment.partType);
    return (
      <div key={layer.key}
        data-character-motion-part={layer.segment.partType}
        data-clothing-part={layer.segment.partType}
        data-clothing-slot={layer.segment.slot ?? layer.segment.partType}
        data-clothing-plane={layer.segment.renderPlane}
        data-clothing-key={layer.key}
        className={`player-character-renderer__canvas-motion player-character-renderer__motion--${motion}`}
        style={{
          transformOrigin: attachment ? `${attachment.xPct}% ${attachment.yPct}%` : "50% 50%",
          zIndex: grouped ? 1 : garmentDepth(layer),
          filter: grouped ? undefined : tintFilter(layer.colorTint),
        }}>
        <img src={layer.segment.imageUrl} alt="" aria-hidden="true" draggable={false}
          className={`player-character-renderer__canvas-image${layer.segment.slot === "face_open_eyes" ? " player-character-renderer__eyes-open" : ""}${layer.segment.slot === "face_closed_eyes" ? " player-character-renderer__eyes-closed" : ""}`}/>
      </div>
    );
  };
  const renderClothingPiece = (layer: (typeof layers)[number], grouped = false) =>
    layer.segment.canvasAligned ? renderCanvas(layer, grouped) : renderLegacy(layer, grouped);
  return (
    <div data-testid="player-character-renderer"
      data-coordinate-space="character-relative"
      data-character-motion={motion}
      data-preview-eyes-closed={previewEyesClosed}
      role="img" aria-label={ariaLabel}
      className="player-character-renderer">
      {/* Filter the COMPLETE body silhouette, after all eight sprites are
          composited. The original alpha overlaps and artist-authored shading
          remain intact. No per-limb mask or independent tint surfaces. */}
      <div className={`player-character-renderer__body${skinTone ? " player-character-renderer__skin-tint" : ""}`}
        data-testid={skinTone ? "avatar-skin-tint" : undefined}
        style={{ filter: tintFilter(skinTone) }}>
      {sorted.map(part => (
        <div key={part.partType} data-character-part={part.partType}
          className="player-character-renderer__anchor"
          style={{
            left: `${part.xPct}%`, top: `${part.yPct}%`,
            width: `${part.widthPct}%`, zIndex: part.zIndex,
            transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%`,
            transform: `translate(-${part.pivotXPct}%, -${part.pivotYPct}%) rotate(${part.rotationDeg}deg)`,
          }}>
          <div data-character-motion-part={part.partType}
            className={`player-character-renderer__motion player-character-renderer__motion--${motion}`}
            style={{ transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%` }}>
            <img src={part.imageUrl} alt="" aria-hidden="true" draggable={false}
              className="player-character-renderer__image"
              style={{
                position: "relative", zIndex: 1,
                filter: part.partType === selectedPartType ? "drop-shadow(0 0 4px #f3d08e)" : undefined,
                opacity: part.partType === selectedPartType ? 0.96 : 1,
              }}/>
          </div>
        </div>
      ))}
      </div>
      {/* Untinted or non-garment art keeps its original per-segment depth.
          This includes Back Hair and any uncolored sleeves or pants. */}
      {oldPartLocal.filter(layer => !compositeKeys.has(layer.itemKey)).map(layer => renderLegacy(layer))}
      {fullCanvas.filter(layer => !compositeKeys.has(layer.itemKey)).map(layer => renderCanvas(layer))}
      {/* Colored Tops and Bottoms are flattened before the shared hue/luma
          matrix runs. This eliminates duplicate tint pixels at seams while
          preserving each piece's independent animation/attachment. */}
      {compositedGarments.map(garment => (
        <div key={garment.itemKey} className="player-character-renderer__garment-composite"
          data-testid="avatar-clothing-composite"
          data-clothing-category={garment.pieces[0].category}
          data-clothing-item={garment.itemKey}
          style={{ zIndex: garment.depth, filter: tintFilter(garment.color) }}>
          {garment.pieces.map(piece => renderClothingPiece(piece, true))}
        </div>
      ))}
    </div>
  );
}
