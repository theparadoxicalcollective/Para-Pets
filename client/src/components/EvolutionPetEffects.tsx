import type { CSSProperties } from "react";
import {
  DEFAULT_EVOLUTION_EFFECT_COLOR,
  type EvolutionPetEffect,
} from "@shared/petEvolutionEffects";

const SPARKLE_POINTS = [
  [14, 26, 0.1], [30, 12, 0.55], [51, 19, 0.9], [75, 15, 1.3],
  [88, 33, 0.35], [67, 42, 1.65], [39, 40, 1.05], [19, 55, 1.9],
  [48, 61, 0.2], [82, 64, 1.15], [65, 78, 0.7], [31, 83, 1.45],
  [9, 76, 0.8], [91, 84, 1.8], [55, 91, 0.45], [43, 31, 1.25],
] as const;

const SMOKE_PUFFS = [
  [28, 62, 0], [48, 66, 0.7], [67, 59, 1.35], [38, 45, 1.9], [59, 41, 2.55], [51, 24, 3.1],
] as const;

export function EvolutionPetEffectVisual({
  effect,
  animated = true,
}: {
  effect: EvolutionPetEffect;
  animated?: boolean;
}) {
  const color = effect.type === "smoke"
    ? "#b9bec8"
    : (effect.color || DEFAULT_EVOLUTION_EFFECT_COLOR[effect.type]);

  if (effect.type === "sparkle") {
    return (
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {SPARKLE_POINTS.map(([left, top, delay], index) => (
          <span
            key={index}
            className={animated ? "evo-pet-sparkle-dot" : undefined}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: index % 5 === 0 ? "2.2%" : "1.35%",
              aspectRatio: "1",
              borderRadius: "999px",
              background: color,
              boxShadow: `0 0 4px ${color}, 0 0 8px ${color}88`,
              animationDelay: animated ? `-${delay}s` : undefined,
              opacity: animated ? undefined : 0.9,
            }}
          />
        ))}
      </div>
    );
  }

  if (effect.type === "smoke") {
    return (
      <div className="absolute inset-0 pointer-events-none" aria-hidden style={{ filter: "blur(1px)" }}>
        {SMOKE_PUFFS.map(([left, top, delay], index) => (
          <span
            key={index}
            className={animated ? "evo-pet-smoke-puff" : undefined}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${28 + (index % 3) * 8}%`,
              aspectRatio: "1",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(225,228,235,.42) 0%, rgba(133,139,150,.26) 48%, rgba(70,73,80,0) 74%)",
              animationDelay: animated ? `-${delay}s` : undefined,
              opacity: animated ? undefined : 0.55,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={animated ? "evo-pet-light-ball" : undefined}
      style={{
        position: "absolute",
        inset: "8%",
        borderRadius: "50%",
        background: `radial-gradient(circle, #ffffff 0%, ${color} 12%, ${color}dd 28%, ${color}66 51%, ${color}22 68%, transparent 78%)`,
        boxShadow: `0 0 10px ${color}, 0 0 25px ${color}aa, 0 0 45px ${color}55`,
        opacity: animated ? undefined : 0.82,
      }}
    />
  );
}

export default function EvolutionPetEffectsLayer({
  effects,
  animated = true,
  className,
  style,
}: {
  effects: readonly EvolutionPetEffect[];
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (!effects.length) return null;
  return (
    <div className={className} data-testid="evolution-pet-effects-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30, overflow: "visible", ...style }}>
      {effects.map(effect => (
        <div
          key={effect.id}
          data-evolution-effect={effect.type}
          style={{
            position: "absolute",
            left: `${effect.xPct * 100}%`,
            top: `${effect.yPct * 100}%`,
            width: `${effect.sizePct}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >
          <EvolutionPetEffectVisual effect={effect} animated={animated} />
        </div>
      ))}
      <style>{`
        @keyframes evoPetSparkleGlint {
          0%, 100% { opacity: .15; transform: scale(.55); }
          45% { opacity: 1; transform: scale(1.2); }
          65% { opacity: .55; transform: scale(.85); }
        }
        @keyframes evoPetSmokeDrift {
          0% { opacity: .12; transform: translate3d(-6%, 12%, 0) scale(.72); }
          45% { opacity: .5; }
          100% { opacity: 0; transform: translate3d(8%, -38%, 0) scale(1.35); }
        }
        @keyframes evoPetLightPulse {
          0%, 100% { opacity: .72; transform: scale(.94); }
          50% { opacity: 1; transform: scale(1.06); }
        }
        .evo-pet-sparkle-dot { animation: evoPetSparkleGlint 1.8s ease-in-out infinite; }
        .evo-pet-smoke-puff { animation: evoPetSmokeDrift 4.3s ease-out infinite; }
        .evo-pet-light-ball { animation: evoPetLightPulse 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
