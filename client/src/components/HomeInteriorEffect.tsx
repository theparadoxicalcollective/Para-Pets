import type { PointerEvent as ReactPointerEvent } from "react";
import type { HouseInteriorEffect, HouseInteriorEffectType } from "@shared/housing";

export const HOME_INTERIOR_EFFECT_OPTIONS: Array<{
  type: HouseInteriorEffectType;
  label: string;
  description: string;
  defaultSize: number;
}> = [
  { type: "fire", label: "Fire", description: "Animated fireplace or hearth flame", defaultSize: 12 },
  { type: "warm_glow", label: "Warm Glow", description: "Lamp, candle, or window light", defaultSize: 18 },
  { type: "sparkles", label: "Sparkles", description: "Soft magical twinkle", defaultSize: 14 },
  { type: "dust_motes", label: "Dust Motes", description: "Subtle floating room particles", defaultSize: 18 },
  { type: "soft_mist", label: "Soft Mist", description: "Low translucent atmospheric haze", defaultSize: 22 },
];

type EffectPointerHandler = (
  event: ReactPointerEvent<HTMLDivElement>,
  effect: HouseInteriorEffect,
) => void;

interface HomeInteriorEffectsLayerProps {
  effects: HouseInteriorEffect[];
  panX: number;
  imgWidth: number;
  sceneHeight: number;
  selectedId?: string | null;
  interactive?: boolean;
  onEffectPointerDown?: EffectPointerHandler;
  onEffectPointerMove?: EffectPointerHandler;
  onEffectPointerUp?: EffectPointerHandler;
  zIndex?: number;
}

const EFFECT_STYLES = `
@keyframes para-home-fire-flicker {
  0%, 100% { transform: scale(0.95, 1.02) translateY(1%); filter: blur(0.4px); opacity: 0.92; }
  35% { transform: scale(1.05, 0.94) translateY(-3%); filter: blur(0.9px); opacity: 1; }
  70% { transform: scale(0.98, 1.06) translateY(-1%); filter: blur(0.2px); opacity: 0.88; }
}
@keyframes para-home-glow-pulse {
  0%, 100% { transform: scale(0.96); opacity: 0.72; }
  50% { transform: scale(1.05); opacity: 0.96; }
}
@keyframes para-home-twinkle {
  0%, 100% { opacity: 0.16; transform: scale(0.55) rotate(0deg); }
  45% { opacity: 1; transform: scale(1.12) rotate(18deg); }
}
@keyframes para-home-dust-float {
  0% { transform: translate3d(0, 16%, 0); opacity: 0; }
  20% { opacity: 0.55; }
  75% { opacity: 0.3; }
  100% { transform: translate3d(12%, -38%, 0); opacity: 0; }
}
@keyframes para-home-mist-drift {
  0%, 100% { transform: translateX(-6%) scaleX(0.92); opacity: 0.18; }
  50% { transform: translateX(7%) scaleX(1.04); opacity: 0.34; }
}
`;

function FireVisual() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        animation: "para-home-fire-flicker 1.15s ease-in-out infinite",
        background:
          "radial-gradient(ellipse at 50% 72%, rgba(255,251,196,0.98) 0 9%, rgba(255,207,72,0.96) 15%, rgba(255,123,31,0.88) 31%, rgba(224,52,11,0.5) 48%, rgba(118,19,4,0.08) 65%, transparent 72%)",
        boxShadow: "0 0 22px rgba(255,117,24,0.48), 0 0 42px rgba(255,82,18,0.2)",
        mixBlendMode: "screen",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "34%",
          top: "20%",
          width: "32%",
          height: "54%",
          borderRadius: "55% 45% 55% 45%",
          transform: "rotate(8deg)",
          background: "linear-gradient(180deg, rgba(255,251,196,0.1), rgba(255,235,128,0.92) 38%, rgba(255,133,26,0.66) 78%, transparent)",
          filter: "blur(0.4px)",
        }}
      />
    </div>
  );
}

function WarmGlowVisual() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: "-18%",
        borderRadius: "50%",
        animation: "para-home-glow-pulse 2.6s ease-in-out infinite",
        background:
          "radial-gradient(circle, rgba(255,243,181,0.82) 0%, rgba(255,215,111,0.5) 25%, rgba(255,167,56,0.2) 52%, transparent 76%)",
        filter: "blur(2px)",
        mixBlendMode: "screen",
      }}
    />
  );
}

function SparklesVisual() {
  const positions = [
    [18, 30], [46, 14], [72, 28], [84, 58], [56, 74], [28, 68], [48, 48],
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0 }}>
      {positions.map(([left, top], index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: `${left}%`,
            top: `${top}%`,
            color: index % 2 === 0 ? "rgba(255,245,184,0.95)" : "rgba(255,255,255,0.92)",
            fontSize: `${index % 3 === 0 ? 18 : index % 3 === 1 ? 12 : 9}%`,
            lineHeight: 1,
            textShadow: "0 0 8px rgba(255,220,110,0.9)",
            animation: `para-home-twinkle ${1.45 + index * 0.13}s ease-in-out ${index * 0.16}s infinite`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

function DustMotesVisual() {
  const positions = [
    [12, 64], [23, 42], [35, 72], [47, 36], [58, 58], [68, 28], [76, 68], [88, 46], [52, 82],
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0 }}>
      {positions.map(([left, top], index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: `${left}%`,
            top: `${top}%`,
            width: index % 3 === 0 ? 4 : 2.5,
            height: index % 3 === 0 ? 4 : 2.5,
            borderRadius: "50%",
            background: "rgba(255,238,184,0.82)",
            boxShadow: "0 0 5px rgba(255,224,149,0.65)",
            animation: `para-home-dust-float ${3.4 + index * 0.25}s ease-in-out ${index * 0.28}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function SoftMistVisual() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {[18, 42, 66].map((top, index) => (
        <div
          key={top}
          style={{
            position: "absolute",
            left: "-12%",
            top: `${top}%`,
            width: "124%",
            height: index === 1 ? "25%" : "19%",
            borderRadius: "50%",
            background: "linear-gradient(90deg, transparent, rgba(240,244,247,0.34), rgba(255,255,255,0.16), transparent)",
            filter: "blur(6px)",
            animation: `para-home-mist-drift ${4.4 + index * 0.7}s ease-in-out ${index * 0.6}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function EffectVisual({ type }: { type: HouseInteriorEffectType }) {
  if (type === "fire") return <FireVisual />;
  if (type === "warm_glow") return <WarmGlowVisual />;
  if (type === "sparkles") return <SparklesVisual />;
  if (type === "dust_motes") return <DustMotesVisual />;
  return <SoftMistVisual />;
}

export function HomeInteriorEffectsLayer({
  effects,
  panX,
  imgWidth,
  sceneHeight,
  selectedId = null,
  interactive = false,
  onEffectPointerDown,
  onEffectPointerMove,
  onEffectPointerUp,
  zIndex = 3,
}: HomeInteriorEffectsLayerProps) {
  if (imgWidth <= 0 || sceneHeight <= 0 || effects.length === 0) return null;

  return (
    <>
      <style>{EFFECT_STYLES}</style>
      {effects.map(effect => {
        const sizePx = Math.max(24, sceneHeight * effect.size / 100);
        const selected = selectedId === effect.id;
        return (
          <div
            key={effect.id}
            data-testid={`home-interior-effect-${effect.id}`}
            style={{
              position: "absolute",
              left: panX + effect.x * imgWidth,
              top: effect.y * sceneHeight,
              width: sizePx,
              height: sizePx,
              transform: "translate(-50%, -50%)",
              zIndex,
              pointerEvents: interactive ? "auto" : "none",
              touchAction: "none",
              cursor: interactive ? "grab" : "default",
              borderRadius: "50%",
              outline: selected ? "1.5px dashed rgba(255,215,0,0.9)" : "none",
              outlineOffset: selected ? 5 : 0,
              filter: selected ? "drop-shadow(0 0 7px rgba(255,215,0,0.8))" : "none",
              fontSize: sizePx,
            }}
            onPointerDown={interactive && onEffectPointerDown ? event => onEffectPointerDown(event, effect) : undefined}
            onPointerMove={interactive && onEffectPointerMove ? event => onEffectPointerMove(event, effect) : undefined}
            onPointerUp={interactive && onEffectPointerUp ? event => onEffectPointerUp(event, effect) : undefined}
            onPointerCancel={interactive && onEffectPointerUp ? event => onEffectPointerUp(event, effect) : undefined}
          >
            <EffectVisual type={effect.type} />
          </div>
        );
      })}
    </>
  );
}
