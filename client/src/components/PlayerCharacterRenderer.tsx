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
      colorTint: null,
      categoryOrder: 0,
    })),
    ...clothingLayers.flatMap(outfit => outfit.segments.map(segment => ({
      segment,
      key: `${outfit.category}:${outfit.inventoryId}:${clothingSegmentKey(segment)}`,
      category: outfit.category,
      // Legacy saved colors on non-hair garments must never tint artwork.
      colorTint: outfit.category === "hair" ? outfit.colorTint ?? null : null,
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
  return (
    <div data-testid="player-character-renderer"
      data-coordinate-space="character-relative"
      data-character-motion={motion}
      data-preview-eyes-closed={previewEyesClosed}
      role="img" aria-label={ariaLabel}
      className="player-character-renderer">
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
            {skinTone && (
              <span aria-hidden="true" className="player-character-renderer__skin-tint"
                data-testid="avatar-skin-tint"
                style={{
                  backgroundColor: skinTone,
                  // The source PNG is its own alpha mask. Preserve original
                  // line work, highlights and soft painted shadow values.
                  maskImage: `url("${part.imageUrl}")`,
                  WebkitMaskImage: `url("${part.imageUrl}")`,
                }} />
            )}
          </div>
        </div>
      ))}
      {/* Legacy part-local garments are independent siblings of body anchors,
          so a sleeve or pant leg cannot be obscured by a higher-z torso.
          They keep the exact same part pivot, resize and motion as before. */}
      {oldPartLocal.map(layer => {
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
              zIndex: garmentDepth(layer),
              transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%`,
              transform: `translate(-${part.pivotXPct}%, -${part.pivotYPct}%) rotate(${part.rotationDeg}deg)`,
            }}>
            <div data-character-motion-part={layer.segment.partType}
              className={`player-character-renderer__motion player-character-renderer__motion--${motion}`}
              style={{ transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%` }}>
              {/* Keep the original part's intrinsic height so legacy % fit
                  coordinates remain unchanged even though this is a sibling
                  overlay rather than a child of the body image. */}
              <img src={part.imageUrl} alt="" aria-hidden="true" draggable={false}
                className="player-character-renderer__image"
                style={{ visibility: "hidden" }}/>
              <div className="player-character-renderer__clothing"
                 style={{
                  left: `${layer.segment.fit.xPct}%`,
                  top: `${layer.segment.fit.yPct}%`,
                  width: `${layer.segment.fit.widthPct}%`,
                  transformOrigin: `${layer.segment.fit.pivotXPct}% ${layer.segment.fit.pivotYPct}%`,
                  transform: `translate(-${layer.segment.fit.pivotXPct}%, -${layer.segment.fit.pivotYPct}%) rotate(${layer.segment.fit.rotationDeg}deg)`,
                  zIndex: 1,
                }}>
                <img src={layer.segment.imageUrl} alt="" aria-hidden="true"
                  draggable={false} className="player-character-renderer__legacy-image" />
                {layer.colorTint && <span aria-hidden="true" data-testid="avatar-clothing-tint"
                  className="player-character-renderer__legacy-tint"
                  style={{ backgroundColor: layer.colorTint,
                    maskImage: `url("${layer.segment.imageUrl}")`,
                    WebkitMaskImage: `url("${layer.segment.imageUrl}")` }} />}
              </div>
            </div>
          </div>
        );
      })}
      {/* New full-canvas artwork never inherits an individual part's resized
          anchor. Separate layers make Hair Back/Face/Accessories ordering
          possible even when multiple images attach to the same head. */}
      {fullCanvas.map(layer => {
        // Full-canvas parts already use the same head/limb motion keyframes as
        // the base. Match their world-space pivot too: rotating about the
        // overall 1000x1000 canvas center sends face parts the wrong way.
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
            zIndex: garmentDepth(layer),
          }}>
          <img src={layer.segment.imageUrl} alt="" aria-hidden="true"
            draggable={false}
            className={`player-character-renderer__canvas-image${layer.segment.slot === "face_open_eyes" ? " player-character-renderer__eyes-open" : ""}${layer.segment.slot === "face_closed_eyes" ? " player-character-renderer__eyes-closed" : ""}`}/>
           {layer.colorTint && <span aria-hidden="true" data-testid="avatar-clothing-tint"
             className={`player-character-renderer__canvas-tint${layer.segment.slot === "face_open_eyes" ? " player-character-renderer__eyes-open" : ""}${layer.segment.slot === "face_closed_eyes" ? " player-character-renderer__eyes-closed" : ""}`}
             style={{ backgroundColor: layer.colorTint,
               maskImage: `url("${layer.segment.imageUrl}")`,
               WebkitMaskImage: `url("${layer.segment.imageUrl}")` }} />}
        </div>
        );
      })}
    </div>
  );
}
