import * as React from "react";
import { CARD_LABEL_DETAILS, type CardLabel } from "@shared/cardLabel";

/** Seasonal corner tag kept fully inside the card with text clipped to the ribbon body. */
export default function CardCornerBanner({ label, depth3d = false }: { label: CardLabel; depth3d?: boolean }) {
  const { text, background, highlight } = CARD_LABEL_DETAILS[label];
  const gradientId = `card-label-gradient-${label}`;
  const shadowId = `card-label-shadow-${label}`;
  const textClipId = `card-label-text-clip-${label}`;

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
      <clipPath id={textClipId} clipPathUnits="userSpaceOnUse">
        <path d="M 8.5 13.5 L 48.2 13.5 L 53.2 17 L 48.2 20.5 L 8.5 20.5 L 12 17 Z" />
      </clipPath>
    </defs>

    <g transform="rotate(-17 29 17)" filter={`url(#${shadowId})`}>
      <path
        d="M 4.5 12.5 L 50 12.5 L 56.5 17 L 50 21.5 L 4.5 21.5 L 9.5 17 Z"
        fill={`url(#${gradientId})`}
        stroke="#f0c96f"
        strokeWidth=".72"
        strokeLinejoin="round"
      />
      <path
        d="M 7 13.75 L 48.3 13.75 L 53 17 L 48.3 20.25 L 7 20.25"
        fill="none"
        stroke="#ffe0a0"
        strokeWidth=".22"
        opacity=".82"
      />
      <text
        x="29"
        y="17.2"
        textAnchor="middle"
        dominantBaseline="middle"
        textLength="35.5"
        lengthAdjust="spacingAndGlyphs"
        clipPath={`url(#${textClipId})`}
        fill="#ffe7a3"
        stroke="#3a1908"
        strokeWidth=".1"
        paintOrder="stroke"
        style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: "2.82px", fontWeight: 700, letterSpacing: ".012em" }}
      >
        {text}
      </text>
    </g>
  </svg>;
}
