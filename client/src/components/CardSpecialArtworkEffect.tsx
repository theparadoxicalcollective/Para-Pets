import * as React from "react";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";

const STAR_PATH = "M0 -3 L.88 -1.05 L2.85 -.93 L1.35 .45 L1.82 2.45 L0 1.35 L-1.82 2.45 L-1.35 .45 L-2.85 -.93 L-.88 -1.05 Z";

const STAR_POINTS = Array.from({ length: 16 * 9 }, (_, index) => {
  const row = Math.floor(index / 9);
  const column = index % 9;
  return {
    x: 5 + column * 11 + (row % 2 ? 5.5 : 0),
    y: 6.2 + row * 9.05,
    size: .82 + ((row * 3 + column * 5) % 5) * .09,
    rotate: ((row + column) % 3 - 1) * 4,
    opacity: .46 + ((row + column * 2) % 4) * .07,
  };
}).filter((point) => point.x < 96);

const WISP_POINTS = Array.from({ length: 30 }, (_, index) => ({
  x: 7 + ((index * 41 + 13) % 86),
  y: 8 + ((index * 59 + 23) % 134),
  size: .78 + ((index * 11) % 6) * .13,
  rotate: -18 + ((index * 17) % 37),
  group: index % 6,
}));

const PUMPKIN_POINTS = Array.from({ length: 32 }, (_, index) => ({
  x: 7 + ((index * 37 + 17) % 86),
  y: 8 + ((index * 61 + 29) % 134),
  size: .68 + ((index * 13) % 7) * .14,
  rotate: -16 + ((index * 19) % 33),
  group: index % 6,
}));

/** Lightweight artwork-only overlays. The frame and title remain controlled by rarity. */
export default function CardSpecialArtworkEffect({ effect, color }: { effect: CardSpecialEffect; color: string }) {
  const instanceId = React.useId().replace(/:/g, "");
  const starGradientId = `star-holo-${instanceId}`;
  const pumpkinGradientId = `pumpkin-holo-${instanceId}`;
  const wispGradientId = `wisp-core-${instanceId}`;

  const layers = effect === "stars" ? (
    <svg
      data-testid="card-star-outline-field"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={starGradientId} x1="0" y1="0" x2="100" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8cecff" />
          <stop offset="18%" stopColor="#a994ff" />
          <stop offset="36%" stopColor="#ffb8e4" />
          <stop offset="54%" stopColor="#ffe36e" />
          <stop offset="72%" stopColor="#81f2c9" />
          <stop offset="88%" stopColor="#7dcaff" />
          <stop offset="100%" stopColor="#d5a7ff" />
        </linearGradient>
      </defs>
      <g className="card-special-star-outlines">
        {STAR_POINTS.map((point, index) => (
          <path
            key={index}
            d={STAR_PATH}
            transform={`translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${point.size})`}
            fill="none"
            stroke={`url(#${starGradientId})`}
            strokeWidth=".48"
            strokeLinejoin="round"
            opacity={point.opacity}
          />
        ))}
      </g>
    </svg>
  ) : effect === "pumpkin" ? (
    <svg
      data-testid="card-pumpkin-field"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={pumpkinGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD98A" />
          <stop offset="22%" stopColor="#FFAD42" />
          <stop offset="50%" stopColor="#FF762A" />
          <stop offset="76%" stopColor="#E9472D" />
          <stop offset="100%" stopColor="#A92832" />
        </linearGradient>
      </defs>
      {PUMPKIN_POINTS.map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${point.size})`}>
          <g className={`card-special-pumpkin card-special-pumpkin-${point.group}`}>
            <path
              d="M -4 .4 C -4.5 -2.6 -2.5 -4.6 0 -4.3 C 2.5 -4.6 4.5 -2.6 4 .4 C 3.6 3.7 1.8 5.1 0 5.2 C -1.8 5.1 -3.6 3.7 -4 .4 Z"
              fill={`url(#${pumpkinGradientId})`}
              fillOpacity=".42"
              stroke={`url(#${pumpkinGradientId})`}
              strokeWidth=".34"
              strokeOpacity=".78"
            />
            <path d="M 0 -4.1 C -.45 -2.5 -.45 2.9 0 4.8 M -2.2 -3.2 C -1.2 -1.7 -1.25 2.8 -2 4 M 2.2 -3.2 C 1.2 -1.7 1.25 2.8 2 4" fill="none" stroke="#FFE0A3" strokeWidth=".26" strokeOpacity=".62" />
            <path d="M -.65 -4.15 C -.5 -5.25 .15 -5.9 1.35 -5.8 C .65 -5.2 .45 -4.65 .55 -4.05 Z" fill="#FFB347" fillOpacity=".58" />
          </g>
        </g>
      ))}
    </svg>
  ) : effect === "aurora" ? (
    <>
      <div className="card-special-holo" />
      <div className="card-special-aurora card-special-aurora-a" style={{ background: `radial-gradient(ellipse at 25% 45%, ${color}80, transparent 60%), radial-gradient(ellipse at 77% 55%, #9a80ed7a, transparent 55%)` }} />
      <div className="card-special-aurora card-special-aurora-b" style={{ background: "linear-gradient(125deg, transparent 17%, #74e3d64a 40%, #df9fe850 62%, transparent 83%)" }} />
    </>
  ) : (
    <svg
      data-testid="card-moonfire-wisp-field"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={wispGradientId}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".96" />
          <stop offset="28%" stopColor={color} stopOpacity=".92" />
          <stop offset="68%" stopColor={color} stopOpacity=".42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {WISP_POINTS.map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${point.size})`}>
          <g className={`card-special-wisp card-special-wisp-${point.group}`}>
            <path
              d="M -2.7 3.4 C -1.7 1.7 -1.05 .35 -.45 -1.15"
              fill="none"
              stroke={color}
              strokeWidth=".52"
              strokeLinecap="round"
              strokeOpacity=".52"
            />
            <ellipse cx="0" cy="-.7" rx="2.25" ry="2.65" fill={`url(#${wispGradientId})`} opacity=".88" />
            <ellipse cx=".2" cy="-1.1" rx=".72" ry=".88" fill="#ffffff" opacity=".72" />
          </g>
        </g>
      ))}
    </svg>
  );

  return <div data-testid={`card-special-effect-${effect}`} aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ zIndex: 1, pointerEvents: "none" }}>
    {layers}
    <style>{`
      @keyframes cardSpecialDrift { 0%, 100% { transform: translate3d(-7%, 3%, 0) scale(1.1); opacity: .55; } 50% { transform: translate3d(7%, -4%, 0) scale(1.18); opacity: .85; } }
      @keyframes cardSpecialHolo { 0%, 100% { background-position: -110% 0; } 50% { background-position: 110% 0; } }
      @keyframes cardSpecialStarHue {
        0%, 100% { filter: hue-rotate(0deg) brightness(1.04) drop-shadow(0 0 1px rgba(255,255,255,.62)); opacity: .72; }
        50% { filter: hue-rotate(175deg) brightness(1.16) drop-shadow(0 0 1.5px rgba(255,255,255,.8)); opacity: .9; }
      }
      @keyframes cardPumpkinPop {
        0%, 100% { opacity: .12; transform: scale(.72); filter: hue-rotate(-7deg) brightness(.92); }
        18% { opacity: .28; transform: scale(.84); }
        34% { opacity: .72; transform: scale(1); filter: hue-rotate(8deg) brightness(1.12) drop-shadow(0 0 1.3px rgba(255,105,40,.68)); }
        58% { opacity: .5; transform: scale(.96); }
        78% { opacity: .18; transform: scale(.8); filter: hue-rotate(-3deg) brightness(.96); }
      }
      @keyframes cardWispFloat {
        0%, 100% { opacity: .3; transform: translate3d(-.8px, 1.4px, 0) scale(.86); }
        35% { opacity: .82; transform: translate3d(.7px, -1.8px, 0) scale(1.04); }
        68% { opacity: .52; transform: translate3d(1.2px, -3px, 0) scale(.94); }
      }
      .card-special-star-outlines {
        mix-blend-mode: screen;
        animation: cardSpecialStarHue 7.2s ease-in-out infinite;
        transform-origin: center;
      }
      .card-special-pumpkin {
        transform-box: fill-box;
        transform-origin: center;
        opacity: .18;
        animation: cardPumpkinPop 7.2s ease-in-out infinite;
      }
      .card-special-pumpkin-1 { animation-delay: -1.2s; }
      .card-special-pumpkin-2 { animation-delay: -2.4s; }
      .card-special-pumpkin-3 { animation-delay: -3.6s; }
      .card-special-pumpkin-4 { animation-delay: -4.8s; }
      .card-special-pumpkin-5 { animation-delay: -6s; }
      .card-special-wisp {
        transform-box: fill-box;
        transform-origin: center;
        animation: cardWispFloat 5.8s ease-in-out infinite;
        filter: drop-shadow(0 0 1.5px ${color});
      }
      .card-special-wisp-1 { animation-delay: -.95s; }
      .card-special-wisp-2 { animation-delay: -1.9s; }
      .card-special-wisp-3 { animation-delay: -2.85s; }
      .card-special-wisp-4 { animation-delay: -3.8s; }
      .card-special-wisp-5 { animation-delay: -4.75s; }
      .card-special-holo { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 20%, #80e8ef35 37%, #bb9be93a 49%, #f6d2e238 58%, #f9e6a92c 66%, transparent 82%); background-size: 220% 100%; mix-blend-mode: screen; animation: cardSpecialHolo 7s ease-in-out infinite; }
      .card-special-aurora { position: absolute; inset: -20%; mix-blend-mode: screen; animation: cardSpecialDrift 9s ease-in-out infinite; }
      .card-special-aurora-b { animation-delay: -4.5s; animation-direction: reverse; opacity: .55; }
      @media (prefers-reduced-motion: reduce) {
        .card-special-star-outlines,
        .card-special-pumpkin,
        .card-special-wisp,
        .card-special-holo,
        .card-special-aurora { animation: none; }
        .card-special-star-outlines { opacity: .78; filter: drop-shadow(0 0 1px rgba(255,255,255,.65)); }
        .card-special-pumpkin { opacity: .5; transform: none; filter: none; }
        .card-special-wisp { opacity: .62; transform: none; }
      }
    `}</style>
  </div>;
}
