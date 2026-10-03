import { useId, type PointerEvent as ReactPointerEvent } from "react";
import { getHouseInteriorLightCutoutStrength, getHouseInteriorLightRadiusRatio, isHouseInteriorLightEffectType, sanitizeHouseInteriorDarkness, type HouseInteriorEffect, type HouseInteriorEffectType } from "@shared/housing";

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

type EffectToggleHandler = (effect: HouseInteriorEffect) => void;

export function isPlayerToggleableInteriorEffect(type: HouseInteriorEffectType): boolean {
  return isHouseInteriorLightEffectType(type);
}

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
  onEffectPointerCancel?: EffectPointerHandler;
  offEffectIds?: ReadonlySet<string>;
  onToggleEffect?: EffectToggleHandler;
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
@keyframes para-home-sleep-glint {
  0%, 100% { opacity: 0.18; transform: scale(0.62) rotate(0deg); }
  42% { opacity: 0.9; transform: scale(1.05) rotate(12deg); }
  70% { opacity: 0.34; transform: scale(0.78) rotate(-8deg); }
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
          "radial-gradient(circle, rgba(255,231,130,0.28) 0%, rgba(255,204,82,0.17) 25%, rgba(255,160,48,0.055) 52%, transparent 76%)",
        filter: "blur(2px)",
        mixBlendMode: "screen",
        opacity: 0.6,
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

function SleepSpotHintVisual() {
  const glints = [
    { left: "46%", top: "46%", delay: "0s", size: "0.10em" },
    { left: "54%", top: "51%", delay: "0.8s", size: "0.07em" },
    { left: "50%", top: "55%", delay: "1.45s", size: "0.055em" },
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {glints.map((glint, index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: glint.left,
            top: glint.top,
            color: "rgba(238,240,255,0.78)",
            fontSize: glint.size,
            lineHeight: 1,
            textShadow: "0 0 5px rgba(160,175,255,0.62)",
            animation: `para-home-sleep-glint 2.4s ease-in-out ${glint.delay} infinite`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

function EffectVisual({ type, adminPreview }: { type: HouseInteriorEffectType; adminPreview: boolean }) {
  if (type === "fire") return <CampfireVisual />;
  if (type === "candle_light") return <CandleLightVisual />;
  if (type === "warm_glow") return <WarmGlowVisual />;
  if (type === "sparkles") return <SparklesVisual />;
  if (type === "dust_motes") return <DustMotesVisual />;
  if (type === "soft_mist") return <SoftMistVisual />;
  return adminPreview ? <SleepSquareVisual /> : <SleepSpotHintVisual />;
}

export function HomeInteriorDarknessLayer({
  darkness,
  effects,
  offEffectIds,
  panX,
  imgWidth,
  sceneHeight,
  zIndex = 2,
}: {
  darkness: number;
  effects?: readonly HouseInteriorEffect[];
  offEffectIds?: ReadonlySet<string>;
  panX?: number;
  imgWidth?: number;
  sceneHeight?: number;
  zIndex?: number;
}) {
  const safeDarkness = sanitizeHouseInteriorDarkness(darkness);
  const rawId = useId();
  const maskId = `home-darkness-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (safeDarkness <= 0) return null;

  const useImageSpace = Number.isFinite(panX) && Number.isFinite(imgWidth) && Number.isFinite(sceneHeight)
    && (imgWidth ?? 0) > 0 && (sceneHeight ?? 0) > 0;
  const activeLights = effects?.filter(effect =>
    isHouseInteriorLightEffectType(effect.type) && !offEffectIds?.has(effect.id)
  ) ?? [];

  if (!useImageSpace || activeLights.length === 0) {
    return (
      <div
        aria-hidden
        data-testid="home-interior-darkness-layer"
        style={{
          position: "absolute",
          ...(useImageSpace ? {
            left: panX,
            top: 0,
            width: imgWidth,
            height: sceneHeight,
          } : { inset: 0 }),
          zIndex,
          pointerEvents: "none",
          background: `rgba(0,0,0,${safeDarkness / 100})`,
          transition: "background 260ms ease-out",
        }}
      />
    );
  }

  const width = imgWidth ?? 1;
  const height = sceneHeight ?? 1;

  return (
    <svg
      aria-hidden
      colorInterpolation="sRGB"
      data-testid="home-interior-darkness-layer"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: panX,
        top: 0,
        width,
        height,
        zIndex,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        {activeLights.map((effect, index) => {
          const gradientId = `${maskId}-light-${index}`;
          const radius = Math.max(40, getHouseInteriorLightRadiusRatio(effect) * height);
          const strength = getHouseInteriorLightCutoutStrength(effect.type);
          return (
            <radialGradient
              key={gradientId}
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              cx={effect.x * width}
              cy={effect.y * height}
              r={radius}
            >
              <stop offset="0%" stopColor="black" stopOpacity={strength} />
              <stop offset="38%" stopColor="black" stopOpacity={strength * 0.7} />
              <stop offset="72%" stopColor="black" stopOpacity={strength * 0.25} />
              <stop offset="100%" stopColor="black" stopOpacity={0} />
            </radialGradient>
          );
        })}
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={width}
          height={height}
          style={{ maskType: "luminance" }}
        >
          <rect x={0} y={0} width={width} height={height} fill="white" />
          {activeLights.map((effect, index) => {
            const radius = Math.max(40, getHouseInteriorLightRadiusRatio(effect) * height);
            return (
              <circle
                key={effect.id}
                cx={effect.x * width}
                cy={effect.y * height}
                r={radius}
                fill={`url(#${maskId}-light-${index})`}
              />
            );
          })}
        </mask>
      </defs>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="black"
        fillOpacity={safeDarkness / 100}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
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
  onEffectPointerCancel,
  offEffectIds,
  onToggleEffect,
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
        const playerToggleable = !interactive && !!onToggleEffect && isPlayerToggleableInteriorEffect(effect.type);
        const isOff = playerToggleable && offEffectIds?.has(effect.id) === true;
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
              pointerEvents: interactive || playerToggleable ? "auto" : "none",
              touchAction: "none",
              cursor: interactive ? "grab" : playerToggleable ? "pointer" : "default",
              borderRadius: isSleep ? "16%" : "50%",
              outline: selected ? "1.5px dashed rgba(255,215,0,0.9)" : "none",
              outlineOffset: selected ? 5 : 0,
              filter: selected ? "drop-shadow(0 0 7px rgba(255,215,0,0.8))" : "none",
              fontSize: sizePx,
            }}
            onPointerDown={interactive && onEffectPointerDown ? event => onEffectPointerDown(event, effect) : undefined}
            onPointerMove={interactive && onEffectPointerMove ? event => onEffectPointerMove(event, effect) : undefined}
            onPointerUp={interactive && onEffectPointerUp ? event => onEffectPointerUp(event, effect) : undefined}
            onPointerCancel={interactive && onEffectPointerCancel ? event => onEffectPointerCancel(event, effect) : undefined}
            onLostPointerCapture={interactive && onEffectPointerCancel ? event => onEffectPointerCancel(event, effect) : undefined}
            data-player-toggle-effect-id={playerToggleable ? effect.id : undefined}
            role={playerToggleable ? "button" : undefined}
            tabIndex={playerToggleable ? 0 : undefined}
            onKeyDown={playerToggleable ? event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onToggleEffect?.(effect);
            } : undefined}
            aria-label={playerToggleable ? `${isOff ? "Turn on" : "Turn off"} ${effect.type.replaceAll("_", " ")} effect` : undefined}
            data-effect-off={isOff ? "true" : undefined}
          >
            {!isOff && <EffectVisual type={effect.type} adminPreview={interactive} />}
          </div>
        );
      })}
    </>
  );
}
