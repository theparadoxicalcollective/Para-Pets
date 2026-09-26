import * as React from "react";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";

const STAR_COLORS = ["#9cecff", "#b9aaff", "#ffd4eb", "#ffeb9b", "#a9f5d7"];
const POINTS = Array.from({ length: 72 }, (_, index) => ({
  x: 4 + ((index * 47 + 19) % 92),
  y: 5 + ((index * 67 + 11) % 140),
  size: .16 + (index % 5) * .055,
  group: index % 4,
}));

/** Lightweight artwork-only overlays. The frame and title remain controlled by rarity. */
export default function CardSpecialArtworkEffect({ effect, color }: { effect: CardSpecialEffect; color: string }) {
  const layers = effect === "aurora" ? (
    <>
      <div className="card-special-aurora card-special-aurora-a" style={{ background: `radial-gradient(ellipse at 25% 45%, ${color}80, transparent 60%), radial-gradient(ellipse at 77% 55%, #9a80ed7a, transparent 55%)` }} />
      <div className="card-special-aurora card-special-aurora-b" style={{ background: "linear-gradient(125deg, transparent 17%, #74e3d64a 40%, #df9fe850 62%, transparent 83%)" }} />
    </>
  ) : (
    <>
      {effect === "stars" && <div className="card-special-holo" />}
      {effect === "wisps" && <div className="card-special-mist" style={{ background: `radial-gradient(ellipse at 50% 70%, ${color}38, transparent 65%)` }} />}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3].map(group => (
          <g key={group} className={`card-special-batch card-special-batch-${group}`}>
            {POINTS.filter(point => point.group === group && (effect === "stars" || point.x % 3 < 1)).map((point, index) => {
              const size = effect === "stars" ? point.size : point.size * 2.1;
              const fill = effect === "stars" ? STAR_COLORS[Math.min(4, Math.floor(point.x / 20))] : color;
              return effect === "stars" ? (
                <path key={index} d={`M ${point.x} ${point.y - size * 2} L ${point.x + size * .35} ${point.y - size * .35} L ${point.x + size * 2} ${point.y} L ${point.x + size * .35} ${point.y + size * .35} L ${point.x} ${point.y + size * 2} L ${point.x - size * .35} ${point.y + size * .35} L ${point.x - size * 2} ${point.y} L ${point.x - size * .35} ${point.y - size * .35} Z`} fill={fill} opacity={.48 + (index % 4) * .1} />
              ) : <circle key={index} cx={point.x} cy={point.y} r={size} fill={fill} opacity={.28 + (index % 4) * .1} />;
            })}
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
      .card-special-batch { animation: cardSpecialBreathe 3.6s ease-in-out infinite; }
      .card-special-batch-1 { animation-delay: -.9s; }
      .card-special-batch-2 { animation-delay: -1.8s; }
      .card-special-batch-3 { animation-delay: -2.7s; }
      .card-special-holo { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 20%, #80e8ef35 37%, #bb9be93a 49%, #f6d2e238 58%, #f9e6a92c 66%, transparent 82%); background-size: 220% 100%; mix-blend-mode: screen; animation: cardSpecialHolo 7s ease-in-out infinite; }
      .card-special-aurora { position: absolute; inset: -20%; mix-blend-mode: screen; animation: cardSpecialDrift 9s ease-in-out infinite; }
      .card-special-aurora-b { animation-delay: -4.5s; animation-direction: reverse; opacity: .55; }
      .card-special-mist { position: absolute; inset: 0; mix-blend-mode: screen; opacity: .5; }
      @media (prefers-reduced-motion: reduce) { .card-special-batch, .card-special-holo, .card-special-aurora { animation: none; } .card-special-batch { opacity: .7; } }
    `}</style>
  </div>;
}
