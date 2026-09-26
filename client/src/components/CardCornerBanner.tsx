import * as React from "react";
import { CARD_LABEL_DETAILS, type CardLabel } from "@shared/cardLabel";

/** A small ribbon crossing the upper-left corner, clear of the center title. */
export default function CardCornerBanner({ label, depth3d = false }: { label: CardLabel; depth3d?: boolean }) {
  const { text, background } = CARD_LABEL_DETAILS[label];
  return <svg
    data-testid={`card-label-${label}`}
    role="img"
    aria-label={text}
    viewBox="0 0 100 150"
    preserveAspectRatio="none"
    style={{ position: "absolute", inset: 0, zIndex: 6, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden", transform: depth3d ? "translateZ(38px)" : undefined, backfaceVisibility: "hidden", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.75))" }}
  >
    <g transform="rotate(-32 18 31)">
      <path d="M -10 26 Q -5 24.8 0 26 Q 5 27.2 10 26 L 34 26 Q 40 24.8 46 26 L 49 27 L 49 36 L 46 37 Q 40 35.8 34 37 L 10 37 Q 5 38.2 0 37 Q -5 35.8 -10 37 Z" fill={background} stroke="#e6bd65" strokeWidth=".75" />
      <path d="M -8 27.6 Q 0 28.8 10 27.6 L 34 27.6 Q 42 26.5 47 28 M -8 35.5 Q 0 34.5 10 35.5 L 34 35.5 Q 42 34.2 47 35.5" fill="none" stroke="#f3d694" strokeWidth=".22" opacity=".8" />
      <text x="19.5" y="32.9" textAnchor="middle" dominantBaseline="middle" textLength="43" lengthAdjust="spacingAndGlyphs" fill="#f5d889" stroke="#422309" strokeWidth=".12" paintOrder="stroke" style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: "3.45px", fontWeight: 700, letterSpacing: ".02em" }}>{text}</text>
    </g>
  </svg>;
}
