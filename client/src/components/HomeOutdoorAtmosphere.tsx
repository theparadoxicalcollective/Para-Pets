import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { getHouseInteriorLightCutoutStrength, isHouseInteriorLightEffectType, type HouseInteriorEffect } from "@shared/housing";
import { parkOutdoorLightRadius } from "@shared/petParkAtmosphere";
import {
  getHomeOutdoorDarkness,
  getHomeOutdoorNightStrength,
  HOME_OUTDOOR_AUTO_TRANSITION_MS,
  HOME_OUTDOOR_OVERRIDE_TRANSITION_MS,
  HOME_OUTDOOR_RESUME_TRANSITION_MS,
  type HomeOutdoorLightingMode,
} from "@/lib/homeOutdoorLighting";

export function useHomeOutdoorLighting(mode: HomeOutdoorLightingMode) {
  const [now, setNow] = useState(() => new Date());
  const [autoTransitionMs, setAutoTransitionMs] = useState(HOME_OUTDOOR_RESUME_TRANSITION_MS);

  useEffect(() => {
    if (mode !== "auto") {
      setNow(new Date());
      setAutoTransitionMs(HOME_OUTDOOR_OVERRIDE_TRANSITION_MS);
      return;
    }

    let timer: number | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const syncNow = (transitionMs: number) => {
      setAutoTransitionMs(transitionMs);
      setNow(new Date());
    };
    const startTimer = () => {
      clearTimer();
      if (document.visibilityState === "hidden") return;
      timer = window.setInterval(() => {
        syncNow(HOME_OUTDOOR_AUTO_TRANSITION_MS);
      }, 30_000);
    };
    const syncFromLifecycle = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
        return;
      }
      syncNow(HOME_OUTDOOR_RESUME_TRANSITION_MS);
      startTimer();
    };

    syncNow(HOME_OUTDOOR_RESUME_TRANSITION_MS);
    startTimer();
    document.addEventListener("visibilitychange", syncFromLifecycle);
    window.addEventListener("pageshow", syncFromLifecycle);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", syncFromLifecycle);
      window.removeEventListener("pageshow", syncFromLifecycle);
    };
  }, [mode]);

  const nightStrength = useMemo(() => getHomeOutdoorNightStrength(mode, now), [mode, now]);
  const darkness = useMemo(() => getHomeOutdoorDarkness(mode, now), [mode, now]);

  const transitionMs = mode === "auto"
    ? autoTransitionMs
    : HOME_OUTDOOR_OVERRIDE_TRANSITION_MS;

  return { mode, nightStrength, daylightStrength: 1 - nightStrength, darkness, transitionMs };
}

export function HomeDayNightToggle({
  mode,
  nightStrength,
  onCycle,
  style,
}: {
  mode: HomeOutdoorLightingMode;
  nightStrength: number;
  onCycle: () => void;
  style?: CSSProperties;
}) {
  const safeNight = mode === "day" ? 0 : mode === "night" ? 1 : Math.max(0, Math.min(1, nightStrength));
  const label = mode === "auto"
    ? "Automatic day and night. Tap for daylight override."
    : mode === "day"
      ? "Daylight override. Tap for night override."
      : "Night override. Tap for automatic day and night.";

  return (
    <button
      type="button"
      data-testid="button-home-day-night-toggle"
      data-lighting-mode={mode}
      aria-label={label}
      title={label}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        onCycle();
      }}
      style={{
        width: 86,
        height: 32,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,218,116,.46)",
        color: "#ffe29a",
        background: "linear-gradient(180deg, rgba(10,18,18,.88), rgba(4,8,14,.92))",
        boxShadow: "0 0 12px rgba(255,201,77,.12), 0 4px 12px rgba(0,0,0,.48)",
        backdropFilter: "blur(6px)",
        cursor: "pointer",
        pointerEvents: "auto",
        touchAction: "manipulation",
        ...style,
      }}
    >
      <Sun size={14} strokeWidth={1.8} aria-hidden="true" />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: "50%",
          height: 2,
          transform: "translateY(-50%)",
          borderRadius: 999,
          background: "linear-gradient(90deg, rgba(255,218,116,.42), rgba(141,169,226,.34))",
          boxShadow: "inset 0 0 2px rgba(0,0,0,.7)",
        }}
      >
        <span
          data-testid="home-day-night-planet"
          style={{
            position: "absolute",
            left: `${safeNight * 100}%`,
            top: "50%",
            width: 9,
            height: 9,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle at 35% 30%, #fff4bd 0%, #ffd75a 38%, #c89014 100%)",
            border: "1px solid rgba(255,237,153,.9)",
            boxShadow: "0 0 7px rgba(255,211,72,.82), 0 0 2px rgba(255,255,255,.7)",
            transition: mode === "auto"
              ? `left ${HOME_OUTDOOR_AUTO_TRANSITION_MS}ms linear`
              : `left ${HOME_OUTDOOR_OVERRIDE_TRANSITION_MS}ms ease-out`,
          }}
        />
      </span>
      <Moon size={13} strokeWidth={1.8} aria-hidden="true" />
      {mode === "auto" && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 2,
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "rgba(255,226,154,.58)",
            transform: "translateX(-50%)",
          }}
        />
      )}
    </button>
  );
}

export function HomeOutdoorAtmosphereLayer({
  darkness,
  nightStrength,
  effects,
  panX,
  panY = 0,
  imgWidth,
  sceneHeight,
  zIndex = 20,
  transitionMs = HOME_OUTDOOR_AUTO_TRANSITION_MS,
  parkLampFalloff = false,
}: {
  darkness: number;
  nightStrength: number;
  effects: HouseInteriorEffect[];
  panX: number;
  panY?: number;
  imgWidth: number;
  sceneHeight: number;
  zIndex?: number;
  transitionMs?: number;
  /** Only park/world scenes use the warmer, wider lamp falloff; homes remain unchanged. */
  parkLampFalloff?: boolean;
}) {
  const safeNight = Math.max(0, Math.min(1, nightStrength));
  const numericDarkness = Number(darkness);
  const safeDarkness = Number.isFinite(numericDarkness)
    ? Math.max(0, Math.min(100, numericDarkness))
    : 0;
  const hasSceneBox = Number.isFinite(imgWidth) && Number.isFinite(sceneHeight)
    && imgWidth > 0 && sceneHeight > 0;

  /*
   * Keep one SVG darkness renderer mounted for the whole outdoor visit.
   *
   * The earlier outdoor implementation switched to a flat CSS darkness layer
   * and then painted large warm "screen" circles above it. That produced the
   * visible beige disks seen around lamps instead of actually revealing the
   * night-darkened scene beneath them.
   *
   * Interiors already solve this correctly with a luminance mask: light
   * sources cut soft holes in the darkness. Outdoors now uses the same visual
   * principle without switching between DIV and SVG renderers after image
   * dimensions load, which was the part that had been troublesome on iOS.
   */
  const rawMaskId = useId();
  const maskId = `home-outdoor-darkness-mask-${rawMaskId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const maskWidth = hasSceneBox ? imgWidth : 1;
  const maskHeight = hasSceneBox ? sceneHeight : 1;
  const activeLights = hasSceneBox
    ? effects.filter(effect => isHouseInteriorLightEffectType(effect.type))
    : [];
  const isSceneLamp = (effect: HouseInteriorEffect) =>
    parkLampFalloff && (effect.type === "lamp_light" || effect.type === "candle_light");
  const lightRadius = (effect: HouseInteriorEffect) =>
    parkOutdoorLightRadius(effect, maskHeight, isSceneLamp(effect));

  return (
    <>
      <div
        data-testid="home-outdoor-night-tint"
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: zIndex - 1,
          opacity: safeNight * .30,
          background: "radial-gradient(circle at 52% 12%, rgba(43,69,120,.38), transparent 42%), linear-gradient(180deg, rgba(7,18,45,.5), rgba(1,5,15,.78))",
          transition: `opacity ${transitionMs}ms linear`,
          contain: "paint",
        }}
      />

      <svg
        aria-hidden="true"
        colorInterpolation="sRGB"
        data-testid="home-outdoor-darkness-layer"
        viewBox={`0 0 ${maskWidth} ${maskHeight}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          ...(hasSceneBox ? {
            left: panX,
            top: panY,
            width: imgWidth,
            height: sceneHeight,
          } : {
            inset: 0,
            width: "100%",
            height: "100%",
          }),
          zIndex,
          pointerEvents: "none",
          overflow: "visible",
          contain: "paint",
        }}
      >
        <defs>
          {activeLights.map((effect, index) => {
            const gradientId = `${maskId}-light-${index}`;
            const radius = lightRadius(effect);
            const soft = isSceneLamp(effect);
            // The outdoor orb stays translucent; the ground beneath it
            // should light up as clearly as it does around a campfire.
            const baseStrength = soft
              ? getHouseInteriorLightCutoutStrength("fire")
              : getHouseInteriorLightCutoutStrength(effect.type);
            const cutoutStrength = effect.type === "warm_glow"
              ? baseStrength * (1 - safeNight)
              : effect.type === "lamp_light" || effect.type === "candle_light"
                ? baseStrength * safeNight
                : baseStrength;


            return (
              <Fragment key={gradientId}>
                <radialGradient
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  cx={effect.x * maskWidth}
                  cy={effect.y * maskHeight}
                  r={radius}
                >
                  {soft ? <>
                    {/* Softer center and long tail: illuminate the scenery well
                        beyond the small visual lantern flare, with no hard ring. */}
                    <stop offset="0%" stopColor="black" stopOpacity={cutoutStrength} />
                    <stop offset="14%" stopColor="black" stopOpacity={cutoutStrength * 0.96} />
                    <stop offset="32%" stopColor="black" stopOpacity={cutoutStrength * 0.82} />
                    <stop offset="52%" stopColor="black" stopOpacity={cutoutStrength * 0.59} />
                    <stop offset="72%" stopColor="black" stopOpacity={cutoutStrength * 0.33} />
                    <stop offset="88%" stopColor="black" stopOpacity={cutoutStrength * 0.10} />
                    <stop offset="100%" stopColor="black" stopOpacity={0} />
                  </> : <>
                    <stop offset="0%" stopColor="black" stopOpacity={cutoutStrength} />
                    <stop offset="38%" stopColor="black" stopOpacity={cutoutStrength * 0.70} />
                    <stop offset="72%" stopColor="black" stopOpacity={cutoutStrength * 0.25} />
                    <stop offset="100%" stopColor="black" stopOpacity={0} />
                  </>}
                </radialGradient>
                {soft && <radialGradient
                  id={`${gradientId}-warm`}
                  gradientUnits="userSpaceOnUse"
                  cx={effect.x * maskWidth}
                  cy={effect.y * maskHeight}
                  r={radius}
                >
                  <stop offset="0%" stopColor="#f7c168" stopOpacity="0.12" />
                  <stop offset="24%" stopColor="#efb055" stopOpacity="0.085" />
                  <stop offset="48%" stopColor="#de993f" stopOpacity="0.043" />
                  <stop offset="72%" stopColor="#bd7d34" stopOpacity="0.017" />
                  <stop offset="90%" stopColor="#a86c27" stopOpacity="0.004" />
                  <stop offset="100%" stopColor="#a86c27" stopOpacity="0" />
                </radialGradient>}
              </Fragment>
            );
          })}
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={maskWidth}
            height={maskHeight}
            style={{ maskType: "luminance" }}
          >
            <rect x={0} y={0} width={maskWidth} height={maskHeight} fill="white" />
            {activeLights.map((effect, index) => {
              const radius = lightRadius(effect);
              return (
                <circle
                  key={effect.id}
                  cx={effect.x * maskWidth}
                  cy={effect.y * maskHeight}
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
          width={maskWidth}
          height={maskHeight}
          fill="black"
          mask={`url(#${maskId})`}
          style={{
            fillOpacity: safeDarkness / 100,
            transition: `fill-opacity ${transitionMs}ms linear`,
          }}
        />
        {parkLampFalloff && activeLights.map((effect, index) => {
          if (!isSceneLamp(effect)) return null;
          return <circle
            key={`${effect.id}-warm-spill`}
            data-testid="park-outdoor-lamp-warm-spill"
            cx={effect.x * maskWidth}
            cy={effect.y * maskHeight}
            r={lightRadius(effect)}
            fill={`url(#${maskId}-light-${index}-warm)`}
            style={{ opacity: safeNight, transition: `opacity ${transitionMs}ms linear`,
              pointerEvents: "none" }}
          />;
        })}
      </svg>
    </>
  );
}

