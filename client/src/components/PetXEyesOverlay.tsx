import type { PointerEventHandler } from "react";

const X_EYES_STYLES = `
@keyframes para-pet-x-eyes-wiggle {
  0%, 100% { transform: translate(-50%, -50%) rotate(-3deg) scale(0.98); }
  50% { transform: translate(-50%, -50%) rotate(3deg) scale(1.03); }
}
`;

export interface PetXEyesOverlayProps {
  x?: number;
  y?: number;
  scale?: number;
  animated?: boolean;
  interactive?: boolean;
  selected?: boolean;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
}

export default function PetXEyesOverlay({
  x = 500,
  y = 390,
  scale = 100,
  animated = false,
  interactive = false,
  selected = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PetXEyesOverlayProps) {
  const safeScale = Math.max(45, Math.min(180, scale));
  const widthPct = 38 * safeScale / 100;
  const heightPct = 20 * safeScale / 100;

  return (
    <div
      aria-hidden={!interactive}
      data-testid="pet-x-eyes-overlay"
      style={{
        position: "absolute",
        left: `${Math.max(0, Math.min(1000, x)) / 10}%`,
        top: `${Math.max(0, Math.min(1000, y)) / 10}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: "translate(-50%, -50%)",
        transformOrigin: "50% 50%",
        animation: animated ? "para-pet-x-eyes-wiggle 0.72s ease-in-out infinite" : undefined,
        zIndex: 32000,
        pointerEvents: interactive ? "auto" : "none",
        touchAction: interactive ? "none" : undefined,
        cursor: interactive ? "grab" : "default",
        borderRadius: "35%",
        outline: selected ? "2px dashed rgba(248,113,113,0.9)" : "none",
        outlineOffset: selected ? 4 : 0,
        filter: selected ? "drop-shadow(0 0 7px rgba(239,68,68,0.7))" : undefined,
      }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerCancel : undefined}
      onLostPointerCapture={interactive ? onPointerCancel : undefined}
    >
      <style>{X_EYES_STYLES}</style>
      <svg viewBox="0 0 100 48" width="100%" height="100%" overflow="visible">
        <g
          fill="none"
          stroke="#ff4038"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.85)) drop-shadow(0 0 3px rgba(255,55,45,0.55))" }}
        >
          <path d="M14 10 L40 38 M40 10 L14 38" />
          <path d="M60 10 L86 38 M86 10 L60 38" />
        </g>
        <g
          fill="none"
          stroke="#b80f0b"
          strokeWidth="2.3"
          strokeLinecap="round"
          opacity="0.9"
        >
          <path d="M14 10 L40 38 M40 10 L14 38" />
          <path d="M60 10 L86 38 M86 10 L60 38" />
        </g>
      </svg>
    </div>
  );
}
