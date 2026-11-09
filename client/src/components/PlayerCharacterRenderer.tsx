import type { PlayerCharacterPart, PlayerCharacterPartType } from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_CATEGORIES,
  type PlayerClothingSegment,
} from "@shared/playerCharacterClothing";
import type { AvatarClothingLayer } from "@/lib/playerAvatarWardrobe";
import "./PlayerCharacterRenderer.css";

/**
 * Single artwork-relative character compositor. Kept independent of the
 * user inventory, pet animation code and the screen/device viewport.
 *
 * "static" is used while editing so touch coordinates remain stable.
 * Idle/walk motion is CSS-only: no timers, RAF, or image/canvas rescans.
 * Later clothing segments will mount INSIDE each matching motion wrapper,
 * so a left-pant-leg layer receives the same movement as the left leg.
 */
export type PlayerCharacterMotion = "static" | "idle" | "walk";

export interface PlayerCharacterRendererProps {
  parts: readonly PlayerCharacterPart[];
  clothingSegments?: readonly PlayerClothingSegment[];
  /** The seven player outfit slots may share the same anatomy anchor. */
  clothingLayers?: readonly AvatarClothingLayer[];
  motion?: PlayerCharacterMotion;
  selectedPartType?: PlayerCharacterPartType | null;
  ariaLabel?: string;
}

export default function PlayerCharacterRenderer({
  parts,
  clothingSegments = [],
  clothingLayers = [],
  motion = "static",
  selectedPartType = null,
  ariaLabel = "Player character",
}: PlayerCharacterRendererProps) {
  // Never mutate the caller's draft or the published snapshot.
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
  const layers = [
    ...clothingSegments.map(segment => ({
      segment, key: `draft:${segment.partType}`, categoryOrder: -1,
    })),
    ...clothingLayers.flatMap(outfit => outfit.segments.map(segment => ({
      segment,
      key: `${outfit.category}:${outfit.inventoryId}:${segment.partType}`,
      categoryOrder: PLAYER_CLOTHING_CATEGORIES.indexOf(outfit.category),
    }))),
  ];
  // Part-local fit follows the same animated limb, while the authored plane
  // takes precedence over category ordering. The base image has depth 1.
  const planeDepth = { behind_character: -1000, with_part: 100, in_front_of_character: 1000 };
  return (
    <div
      data-testid="player-character-renderer"
      data-coordinate-space="character-relative"
      data-character-motion={motion}
      role="img"
      aria-label={ariaLabel}
      className="player-character-renderer"
    >
      {sorted.map(part => (
        <div
          key={part.partType}
          data-character-part={part.partType}
          className="player-character-renderer__anchor"
          style={{
            left: `${part.xPct}%`,
            top: `${part.yPct}%`,
            width: `${part.widthPct}%`,
            zIndex: part.zIndex,
            transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%`,
            // Retain the exact static placement contract used in 06/12.
            // The inner motion does not replace the saved transform.
            transform: `translate(-${part.pivotXPct}%, -${part.pivotYPct}%) rotate(${part.rotationDeg}deg)`,
          }}
        >
          <div
            data-character-motion-part={part.partType}
            className={`player-character-renderer__motion player-character-renderer__motion--${motion}`}
            style={{ transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%` }}
          >
            <img
              src={part.imageUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="player-character-renderer__image"
              style={{
                position: "relative",
                zIndex: 1,
                filter: part.partType === selectedPartType
                  ? "drop-shadow(0 0 4px #f3d08e)" : undefined,
                opacity: part.partType === selectedPartType ? 0.96 : 1,
              }}
            />
            {/* A clothing item owns multiple images, each fitted INSIDE the
                same motion wrapper as its selected body part. Both halves
                of pants therefore inherit their own leg's movement. */}
            {layers.filter(layer => layer.segment.partType === part.partType).map(layer => (
              <img
                key={layer.key}
                src={layer.segment.imageUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                data-clothing-part={layer.segment.partType}
                data-clothing-plane={layer.segment.renderPlane}
                data-clothing-key={layer.key}
                className="player-character-renderer__clothing"
                style={{
                  left: `${layer.segment.fit.xPct}%`,
                  top: `${layer.segment.fit.yPct}%`,
                  width: `${layer.segment.fit.widthPct}%`,
                  transformOrigin: `${layer.segment.fit.pivotXPct}% ${layer.segment.fit.pivotYPct}%`,
                  transform: `translate(-${layer.segment.fit.pivotXPct}%, -${layer.segment.fit.pivotYPct}%) rotate(${layer.segment.fit.rotationDeg}deg)`,
                  zIndex: planeDepth[layer.segment.renderPlane] +
                    layer.categoryOrder * 101 + layer.segment.fit.zIndex,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
