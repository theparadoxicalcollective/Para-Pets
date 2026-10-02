import type { PointerEvent as ReactPointerEvent } from "react";
import type { HouseInteriorEffect, HouseInteriorEffectType } from "@shared/housing";

export const HOME_INTERIOR_EFFECT_OPTIONS: Array<{
  type: HouseInteriorEffectType;
  label: string;
  description: string;
  defaultSize: number;
}> = [
  { type: "fire", label: "Campfire", description: "Natural open flame only — no logs or base", defaultSize: 14 },
  { type: "candle_light", label: "Candle Light", description: "Small focused flame for candles and lanterns", defaultSize: 10 },
  { type: "warm_glow", label: "Lamp Glow", description: "Soft lamp or window light without a visible flame", defaultSize: 18 },
  { type: "sparkles", label: "Sparkles", description: "Soft magical twinkle", defaultSize: 14 },
  { type: "dust_motes", label: "Dust Motes", description: "Subtle floating room particles", defaultSize: 18 },
  { type: "soft_mist", label: "Soft Mist", description: "Low translucent atmospheric haze", defaultSize: 22 },
  { type: "sleep", label: "Sleep Square", description: "Drop a pet here to make it sleep", defaultSize: 18 },
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
@keyframes para-home-flame-a {
  0%, 100% { transform: translate(-50%, 0) scale(0.96, 1.02) rotate(-2deg); }
  28% { transform: translate(-48%, -3%) scale(1.04, 0.96) rotate(3deg); }
  58% { transform: translate(-52%, -7%) scale(0.92, 1.08) rotate(-4deg); }
  82% { transform: translate(-49%, -2%) scale(1.02, 0.98) rotate(2deg); }
}
@keyframes para-home-flame-b {
  0%, 100% { transform: translate(-50%, 0) scale(1, 1) rotate(2deg); }
  35% { transform: translate(-54%, -5%) scale(0.9, 1.1) rotate(-5deg); }
  68% { transform: translate(-47%, -2%) scale(1.07, 0.94) rotate(4deg); }
}
@keyframes para-home-flame-c {
  0%, 100% { transform: translate(-50%, 0) scale(0.94, 1.04) rotate(-1deg); opacity: 0.9; }
  40% { transform: translate(-49%, -8%) scale(1.05, 0.92) rotate(4deg); opacity: 1; }
  72% { transform: translate(-53%, -3%) scale(0.9, 1.12) rotate(-3deg); opacity: 0.88; }
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

function CampfireVisual() {
  const tongues = [
    { left: "50%", bottom: "8%", width: "52%", height: "80%", animation: "para-home-flame-a 0.86s ease-in-out infinite", bg: "linear-gradient(180deg, rgba(255,244,183,0.06) 0%, #ffd458 36%, #ff8a1f 67%, rgba(207,45,8,0.9) 100%)", clip: "polygon(52% 0%, 68% 20%, 63% 37%, 83% 51%, 77% 75%, 55% 100%, 28% 83%, 17% 58%, 36% 36%)" },
    { left: "36%", bottom: "9%", width: "33%", height: "59%", animation: "para-home-flame-b 0.72s ease-in-out -0.18s infinite", bg: "linear-gradient(180deg, #ffd96b 0%, #ff9e27 54%, rgba(218,58,10,0.86) 100%)", clip: "polygon(55% 0%, 80% 31%, 69% 48%, 86% 70%, 62% 100%, 27% 90%, 14% 59%, 35% 34%)" },
    { left: "65%", bottom: "10%", width: "31%", height: "55%", animation: "para-home-flame-c 0.78s ease-in-out -0.33s infinite", bg: "linear-gradient(180deg, #ffe47c 0%, #ff9d23 52%, rgba(221,62,9,0.82) 100%)", clip: "polygon(45% 0%, 72% 24%, 66% 43%, 87% 62%, 71% 91%, 42% 100%, 16% 70%, 28% 38%)" },
    { left: "50%", bottom: "10%", width: "26%", height: "54%", animation: "para-home-flame-b 0.64s ease-in-out -0.41s infinite", bg: "linear-gradient(180deg, rgba(255,255,232,0.98) 0%, #fff08c 38%, #ffc134 73%, rgba(255,130,24,0.88) 100%)", clip: "polygon(50% 0%, 73% 35%, 65% 54%, 79% 73%, 58% 100%, 31% 92%, 20% 65%, 37% 38%)" },
  ];

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: "11%",
          right: "11%",
          bottom: "1%",
          height: "44%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at 50% 76%, rgba(255,124,23,0.32), rgba(255,69,12,0.12) 45%, transparent 72%)",
          filter: "blur(5px)",
          mixBlendMode: "screen",
        }}
      />
      {tongues.map((tongue, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: tongue.left,
            bottom: tongue.bottom,
            width: tongue.width,
            height: tongue.height,
            transformOrigin: "50% 100%",
            animation: tongue.animation,
            background: tongue.bg,
            clipPath: tongue.clip,
            filter: index === 3
              ? "drop-shadow(0 0 3px rgba(255,222,102,0.85))"
              : "drop-shadow(0 0 7px rgba(255,76,11,0.55))",
            mixBlendMode: "screen",
          }}
        />
      ))}
    </div>
  );
}

function CandleLightVisual() {
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

function SleepSquareVisual() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "16%",
        background: "linear-gradient(145deg, rgba(85,104,180,0.16), rgba(42,53,105,0.23))",
        border: "1.5px dashed rgba(181,196,255,0.72)",
        boxShadow: "inset 0 0 18px rgba(130,153,255,0.12), 0 0 12px rgba(115,137,230,0.18)",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: "12%",
          top: "9%",
          color: "rgba(218,226,255,0.78)",
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: "0.19em",
          letterSpacing: "0.02em",
          textShadow: "0 0 7px rgba(126,149,255,0.55)",
        }}
      >
        Zz
      </span>
    </div>
  );
}

function EffectVisual({ type }: { type: HouseInteriorEffectType }) {
  if (type === "fire") return <CampfireVisual />;
  if (type === "candle_light") return <CandleLightVisual />;
  if (type === "warm_glow") return <WarmGlowVisual />;
  if (type === "sparkles") return <SparklesVisual />;
  if (type === "dust_motes") return <DustMotesVisual />;
  if (type === "soft_mist") return <SoftMistVisual />;
  return <SleepSquareVisual />;
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
        const isSleep = effect.type === "sleep";
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
              borderRadius: isSleep ? "16%" : "50%",
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
