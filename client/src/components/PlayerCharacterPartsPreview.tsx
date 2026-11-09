import type { PointerEvent as ReactPointerEvent } from "react";
import type { PlayerCharacterPart } from "@shared/playerCharacter";
import PlayerCharacterRenderer, { type PlayerCharacterMotion } from "./PlayerCharacterRenderer";

interface Props {
  parts: readonly PlayerCharacterPart[];
  activePartType?: string | null;
  motion?: PlayerCharacterMotion;
  editable?: boolean;
  onMovePart?: (xPct: number, yPct: number) => void;
}

/**
 * Admin touch surface over the shared PlayerCharacterRenderer. The existing
 * editor continues positioning in character-relative coordinates. Preview
 * modes do not interfere with pointer capture or re-save artwork.
 */
export default function PlayerCharacterPartsPreview({
  parts, activePartType, editable = false, onMovePart, motion = "static",
}: Props) {
  const moveAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !onMovePart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
    onMovePart(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  };
  return (
    <div
      role={editable ? "application" : undefined}
      aria-label={editable ? "Drag or tap to position the selected avatar part" : undefined}
      data-testid="player-character-preview"
      data-coordinate-space="character-relative"
      onPointerDown={event => {
        if (!editable) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        moveAtPointer(event);
      }}
      onPointerMove={event => {
        if (editable && event.currentTarget.hasPointerCapture(event.pointerId)) moveAtPointer(event);
      }}
      onPointerUp={event => {
        if (editable && event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => {
        if (editable && event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#a88b45]/50"
      style={{
        background: "radial-gradient(circle at 50% 60%, #315d40 0%, #132d21 58%, #08170f 100%)",
        touchAction: editable ? "none" : "auto",
        userSelect: "none",
        maxWidth: 420,
      }}
    >
      <PlayerCharacterRenderer
        parts={parts}
        motion={editable ? "static" : motion}
        selectedPartType={editable ? activePartType as PlayerCharacterPart["partType"] | null : null}
        ariaLabel="Avatar base preview"
      />
      {parts.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-[#d6c294]">
          Upload the eight transparent avatar base parts to build your character.
        </p>
      )}
    </div>
  );
}
