import type { PlayerCharacterPart, PlayerCharacterPartType } from "@shared/playerCharacter";
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
  motion?: PlayerCharacterMotion;
  selectedPartType?: PlayerCharacterPartType | null;
  ariaLabel?: string;
}

export default function PlayerCharacterRenderer({
  parts,
  motion = "static",
  selectedPartType = null,
  ariaLabel = "Player character",
}: PlayerCharacterRendererProps) {
  // Never mutate the caller's draft or the published snapshot.
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
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
                filter: part.partType === selectedPartType
                  ? "drop-shadow(0 0 4px #f3d08e)" : undefined,
                opacity: part.partType === selectedPartType ? 0.96 : 1,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
