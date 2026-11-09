import type { PointerEvent as ReactPointerEvent } from "react";
import type { PlayerCharacterPart } from "@shared/playerCharacter";

interface Props {
  parts: readonly PlayerCharacterPart[];
  activePartType?: string | null;
  editable?: boolean;
  onMovePart?: (xPct: number, yPct: number) => void;
}

/**
 * One static, artwork-relative compositing surface. Avatar 07/12 can use
 * this same base to add idle and walk transforms; never apply screen or
 * iPhone reference-stage coordinates to avatar artwork.
 */
export default function PlayerCharacterPartsPreview({
  parts, activePartType, editable = false, onMovePart,
}: Props) {
  const sorted = [...parts].sort((a, b) => a.zIndex - b.zIndex);
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
      {sorted.map(part => (
        <img
          key={part.partType}
          src={part.imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-character-part={part.partType}
          style={{
            position: "absolute",
            left: `${part.xPct}%`,
            top: `${part.yPct}%`,
            width: `${part.widthPct}%`,
            height: "auto",
            maxWidth: "none",
            zIndex: part.zIndex,
            transformOrigin: `${part.pivotXPct}% ${part.pivotYPct}%`,
            transform: `translate(-${part.pivotXPct}%, -${part.pivotYPct}%) rotate(${part.rotationDeg}deg)`,
            pointerEvents: "none",
            opacity: editable && part.partType === activePartType ? 0.96 : 1,
            filter: editable && part.partType === activePartType
              ? "drop-shadow(0 0 4px #f3d08e)" : undefined,
          }}
        />
      ))}
      {sorted.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-[#d6c294]">
          Upload the seven transparent avatar parts to build your base.
        </p>
      )}
    </div>
  );
}
