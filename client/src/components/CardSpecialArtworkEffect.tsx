import * as React from "react";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";

const WISP_POINTS = Array.from({ length: 72 }, (_, index) => ({
  x: 4 + ((index * 47 + 19) % 92),
  y: 5 + ((index * 67 + 11) % 140),
  size: .16 + (index % 5) * .055,
  group: index % 4,
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
        0%, 100% { filter: hue-rotate(0deg) brightness(1.05) drop-shadow(0 0 1px rgba(255,255,255,.8)); opacity: .66; transform: translate3d(-.35%, 0, 0); }
        50% { filter: hue-rotate(180deg) brightness(1.22) drop-shadow(0 0 2px rgba(255,255,255,.92)); opacity: .86; transform: translate3d(.35%, -.2%, 0); }
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
      .card-special-holo { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 20%, #80e8ef35 37%, #bb9be93a 49%, #f6d2e238 58%, #f9e6a92c 66%, transparent 82%); background-size: 220% 100%; mix-blend-mode: screen; animation: cardSpecialHolo 7s ease-in-out infinite; }
      .card-special-aurora { position: absolute; inset: -20%; mix-blend-mode: screen; animation: cardSpecialDrift 9s ease-in-out infinite; }
      .card-special-aurora-b { animation-delay: -4.5s; animation-direction: reverse; opacity: .55; }
      .card-special-mist { position: absolute; inset: 0; mix-blend-mode: screen; opacity: .5; }
      @media (prefers-reduced-motion: reduce) {
        .card-special-batch,
        .card-special-starfield,
        .card-special-holo,
        .card-special-aurora { animation: none; }
        .card-special-batch { opacity: .7; }
        .card-special-starfield { opacity: .74; transform: none; filter: drop-shadow(0 0 1px rgba(255,255,255,.8)); }
      }
    `}</style>
  </div>;
}
