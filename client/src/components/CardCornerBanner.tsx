import * as React from "react";
import { CARD_LABEL_DETAILS, type CardLabel } from "@shared/cardLabel";

/** Compact seasonal tag tucked into the upper-left so it stays clear of the card title. */
export default function CardCornerBanner({ label, depth3d = false }: { label: CardLabel; depth3d?: boolean }) {
  const { text, background, highlight } = CARD_LABEL_DETAILS[label];
  const gradientId = `card-label-gradient-${label}`;

  return <svg
    data-testid={`card-label-${label}`}
    role="img"
    aria-label={text}
    viewBox="0 0 100 150"
    preserveAspectRatio="none"
    style={{ position: "absolute", inset: 0, zIndex: 6, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden", transform: depth3d ? "translateZ(38px)" : undefined, backfaceVisibility: "hidden", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.72))" }}
  >
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={highlight} />
        <stop offset="56%" stopColor={background} />
        <stop offset="100%" stopColor={background} />
      </linearGradient>
    </defs>
    <g transform="rotate(-10 19.5 19.5)">
      <path
        d="M -4 15 L 36.8 15 L 42.5 19.5 L 36.8 24 L -4 24 L 1.2 19.5 Z"
        fill={`url(#${gradientId})`}
        stroke="#f0c96f"
        strokeWidth=".72"
        strokeLinejoin="round"
      />
      <path d="M -.2 16.35 L 35.9 16.35 L 39.8 19.5 L 35.9 22.65 L -.2 22.65" fill="none" stroke="#ffe0a0" strokeWidth=".22" opacity=".82" />
      <text
        x="19"
        y="19.7"
        textAnchor="middle"
        dominantBaseline="middle"
        textLength="34.5"
        lengthAdjust="spacingAndGlyphs"
        fill="#ffe7a3"
        stroke="#3a1908"
        strokeWidth=".11"
        paintOrder="stroke"
        style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: "3.05px", fontWeight: 700, letterSpacing: ".018em" }}
      >
        {text}
      </text>
    </g>
  </svg>;
}
