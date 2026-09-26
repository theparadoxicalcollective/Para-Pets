import * as React from "react";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";

const WISP_POINTS = Array.from({ length: 72 }, (_, index) => ({
  x: 4 + ((index * 47 + 19) % 92),
  y: 5 + ((index * 67 + 11) % 140),
  size: .16 + (index % 5) * .055,
  group: index % 4,
}));

const PUMPKIN_POINTS = Array.from({ length: 30 }, (_, index) => ({
  x: 7 + ((index * 37 + 17) % 86),
  y: 8 + ((index * 61 + 29) % 134),
  size: .62 + ((index * 13) % 7) * .14,
  rotate: -16 + ((index * 19) % 33),
  group: index % 6,
}));

// The star occupies only the top half of the tile. Two offset mask layers interleave
// those half-height rows, creating a close stagger without stars touching vertically.
const STAR_MASK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 48"><path d="M12 1.6 14.6 8.9 22.4 9.2 16.2 13.9 18.4 21.4 12 17.1 5.6 21.4 7.8 13.9 1.6 9.2 9.4 8.9Z" fill="white"/></svg>`,
);
const STAR_MASK = `url("data:image/svg+xml,${STAR_MASK_SVG}")`;
const STAR_BACKGROUND = "linear-gradient(110deg, #8cecff 0%, #a994ff 18%, #ffb8e4 36%, #ffe36e 54%, #81f2c9 72%, #7dcaff 88%, #d5a7ff 100%)";

/** Lightweight artwork-only overlays. The frame and title remain controlled by rarity. */
export default function CardSpecialArtworkEffect({ effect, color }: { effect: CardSpecialEffect; color: string }) {
  const starStyle = {
    WebkitMaskImage: STAR_MASK,
    maskImage: STAR_MASK,
    WebkitMaskRepeat: "repeat",
    maskRepeat: "repeat",
    WebkitMaskSize: "10.5% 13.2%",
    maskSize: "10.5% 13.2%",
    background: STAR_BACKGROUND,
    backgroundSize: "280% 160%",
    backgroundPosition: "var(--card-turn-position, 0%) 50%",
  } as const;

  const layers = effect === "stars" ? (
    <>
      <div
        className="card-special-starfield card-special-starfield-a"
        style={{ ...starStyle, WebkitMaskPosition: "0 0", maskPosition: "0 0" }}
      />
      <div
        className="card-special-starfield card-special-starfield-b"
        style={{ ...starStyle, WebkitMaskPosition: "5.25% 6.6%", maskPosition: "5.25% 6.6%" }}
      />
    </>
  ) : effect === "pumpkin" ? (
    <svg
      data-testid="card-pumpkin-field"
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ mixBlendMode: "screen" }}
    >
      <defs>
        <linearGradient id="pumpkin-holo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD27A" />
          <stop offset="24%" stopColor="#FF9B35" />
          <stop offset="52%" stopColor="#FF6A24" />
          <stop offset="76%" stopColor="#E43B25" />
          <stop offset="100%" stopColor="#9D1F27" />
        </linearGradient>
      </defs>
      {PUMPKIN_POINTS.map((point, index) => (
        <g key={index} transform={`translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${point.size})`}>
          <g className={`card-special-pumpkin card-special-pumpkin-${point.group}`}>
            <path
              d="M -4 .4 C -4.5 -2.6 -2.5 -4.6 0 -4.3 C 2.5 -4.6 4.5 -2.6 4 .4 C 3.6 3.7 1.8 5.1 0 5.2 C -1.8 5.1 -3.6 3.7 -4 .4 Z"
              fill="url(#pumpkin-holo-gradient)"
              fillOpacity=".52"
            />
            <path d="M 0 -4.1 C -.45 -2.5 -.45 2.9 0 4.8 M -2.2 -3.2 C -1.2 -1.7 -1.25 2.8 -2 4 M 2.2 -3.2 C 1.2 -1.7 1.25 2.8 2 4" fill="none" stroke="#FFD98C" strokeWidth=".25" strokeOpacity=".48" />
            <path d="M -.65 -4.15 C -.5 -5.25 .15 -5.9 1.35 -5.8 C .65 -5.2 .45 -4.65 .55 -4.05 Z" fill="#FFB347" fillOpacity=".55" />
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
    <>
      <div className="card-special-mist" style={{ background: `radial-gradient(ellipse at 50% 70%, ${color}38, transparent 65%)` }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3].map(group => (
          <g key={group} className={`card-special-batch card-special-batch-${group}`}>
            {WISP_POINTS.filter(point => point.group === group && point.x % 3 < 1).map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r={point.size * 2.1} fill={color} opacity={.28 + (index % 4) * .1} />
            ))}
          </g>
        ))}
      </svg>
    </>
  );

  return <div data-testid={`card-special-effect-${effect}`} aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ zIndex: 1, pointerEvents: "none" }}>
    {layers}
    <style>{`
      @keyframes cardSpecialBreathe { 0%, 100% { opacity: .42; } 50% { opacity: .9; } }
      @keyframes cardSpecialDrift { 0%, 100% { transform: translate3d(-7%, 3%, 0) scale(1.1); opacity: .55; } 50% { transform: translate3d(7%, -4%, 0) scale(1.18); opacity: .85; } }
      @keyframes cardSpecialHolo { 0%, 100% { background-position: -110% 0; } 50% { background-position: 110% 0; } }
      @keyframes cardSpecialStarShift {
        0%, 100% { filter: hue-rotate(0deg) brightness(1.05) drop-shadow(0 0 1px rgba(255,255,255,.72)); opacity: .48; transform: translate3d(-.35%, 0, 0); }
        50% { filter: hue-rotate(180deg) brightness(1.16) drop-shadow(0 0 1.5px rgba(255,255,255,.82)); opacity: .64; transform: translate3d(.35%, -.2%, 0); }
      }
      @keyframes cardPumpkinPop {
        0%, 100% { opacity: .05; transform: scale(.68); filter: hue-rotate(-6deg) brightness(.9); }
        20% { opacity: .14; transform: scale(.82); }
        34% { opacity: .52; transform: scale(1); filter: hue-rotate(7deg) brightness(1.12) drop-shadow(0 0 1.5px rgba(255,128,48,.72)); }
        58% { opacity: .38; transform: scale(.96); }
        78% { opacity: .08; transform: scale(.78); filter: hue-rotate(-4deg) brightness(.94); }
      }
      .card-special-batch { animation: cardSpecialBreathe 3.6s ease-in-out infinite; }
      .card-special-batch-1 { animation-delay: -.9s; }
      .card-special-batch-2 { animation-delay: -1.8s; }
      .card-special-batch-3 { animation-delay: -2.7s; }
      .card-special-starfield {
        position: absolute;
        inset: 1.5%;
        mix-blend-mode: screen;
        animation: cardSpecialStarShift 7.5s ease-in-out infinite;
        transition: background-position 180ms ease-out;
        will-change: filter, opacity, transform, background-position;
      }
      .card-special-starfield-b { animation-delay: -3.75s; }
      .card-special-pumpkin {
        transform-box: fill-box;
        transform-origin: center;
        opacity: .08;
        animation: cardPumpkinPop 7.2s ease-in-out infinite;
      }
      .card-special-pumpkin-1 { animation-delay: -1.2s; }
      .card-special-pumpkin-2 { animation-delay: -2.4s; }
      .card-special-pumpkin-3 { animation-delay: -3.6s; }
      .card-special-pumpkin-4 { animation-delay: -4.8s; }
      .card-special-pumpkin-5 { animation-delay: -6s; }
      .card-special-holo { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 20%, #80e8ef35 37%, #bb9be93a 49%, #f6d2e238 58%, #f9e6a92c 66%, transparent 82%); background-size: 220% 100%; mix-blend-mode: screen; animation: cardSpecialHolo 7s ease-in-out infinite; }
      .card-special-aurora { position: absolute; inset: -20%; mix-blend-mode: screen; animation: cardSpecialDrift 9s ease-in-out infinite; }
      .card-special-aurora-b { animation-delay: -4.5s; animation-direction: reverse; opacity: .55; }
      .card-special-mist { position: absolute; inset: 0; mix-blend-mode: screen; opacity: .5; }
      @media (prefers-reduced-motion: reduce) {
        .card-special-batch,
        .card-special-starfield,
        .card-special-pumpkin,
        .card-special-holo,
        .card-special-aurora { animation: none; }
        .card-special-batch { opacity: .7; }
        .card-special-starfield { opacity: .56; transform: none; filter: drop-shadow(0 0 1px rgba(255,255,255,.72)); }
        .card-special-pumpkin { opacity: .34; transform: none; filter: none; }
      }
    `}</style>
  </div>;
}
