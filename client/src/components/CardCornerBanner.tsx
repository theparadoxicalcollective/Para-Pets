import * as React from "react";
import { CARD_LABEL_DETAILS, type CardLabel } from "@shared/cardLabel";

/** Compact seasonal tag angled across the upper-left without clipping the card edge. */
export default function CardCornerBanner({ label, depth3d = false }: { label: CardLabel; depth3d?: boolean }) {
  const { text, background, highlight } = CARD_LABEL_DETAILS[label];
  const gradientId = `card-label-gradient-${label}`;
  const shadowId = `card-label-shadow-${label}`;

  return <svg
    data-testid={`card-label-${label}`}
    role="img"
    aria-label={text}
    viewBox="0 0 100 150"
    preserveAspectRatio="none"
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 6,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      overflow: "hidden",
      transform: depth3d ? "translateZ(38px)" : undefined,
      backfaceVisibility: "hidden",
    }}
  >
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={highlight} />
        <stop offset="52%" stopColor={background} />
        <stop offset="100%" stopColor={background} />
      </linearGradient>
      <filter id={shadowId} x="-25%" y="-65%" width="165%" height="230%">
        <feDropShadow dx="0" dy=".75" stdDeviation=".7" floodColor="#000000" floodOpacity=".66" />
        <feDropShadow dx="0" dy="0" stdDeviation=".9" floodColor={background} floodOpacity=".78" />
      </filter>
    </defs>

    <g transform="rotate(-18 23 20.5)" filter={`url(#${shadowId})`}>
      <path
        d="M 4 16 L 41 16 L 47 20.5 L 41 25 L 4 25 L 8.6 20.5 Z"
        fill={`url(#${gradientId})`}
        stroke="#f0c96f"
        strokeWidth=".72"
        strokeLinejoin="round"
      />
      <path
        d="M 6 17.25 L 40.1 17.25 L 44.1 20.5 L 40.1 23.75 L 6 23.75"
        fill="none"
        stroke="#ffe0a0"
        strokeWidth=".22"
        opacity=".82"
      />
      <text
        x="23.3"
        y="20.7"
        textAnchor="middle"
        dominantBaseline="middle"
        textLength="34.6"
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
