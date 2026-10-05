import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { getHouseInteriorLightCutoutStrength, getHouseInteriorLightRadiusRatio, isHouseInteriorLightEffectType, type HouseInteriorEffect } from "@shared/housing";
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
  imgWidth,
  sceneHeight,
  zIndex = 20,
  transitionMs = HOME_OUTDOOR_AUTO_TRANSITION_MS,
}: {
  darkness: number;
  nightStrength: number;
  effects: HouseInteriorEffect[];
  panX: number;
  imgWidth: number;
  sceneHeight: number;
  zIndex?: number;
  transitionMs?: number;
}) {
  const safeNight = Math.max(0, Math.min(1, nightStrength));
  const numericDarkness = Number(darkness);
  const safeDarkness = Number.isFinite(numericDarkness)
    ? Math.max(0, Math.min(100, numericDarkness))
    : 0;
  const hasSceneBox = Number.isFinite(imgWidth) && Number.isFinite(sceneHeight)
    && imgWidth > 0 && sceneHeight > 0;

  // Outdoor night previously reused the interior SVG-mask renderer. On iOS
  // Safari/WebKit that meant the full-yard darkness surface could switch from
  // a DIV to a large animated SVG mask as Home dimensions/effects finished
  // loading. Keep one lightweight CSS darkness surface mounted for the entire
  // visit, then add small local CSS illumination pools above it. This preserves
  // the stable renderer while allowing lamps/fire to visibly push back the
  // darkness around their authored positions.
  const activeLights = hasSceneBox
    ? effects.filter(effect => isHouseInteriorLightEffectType(effect.type))
    : [];

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
      <div
        data-testid="home-outdoor-darkness-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          ...(hasSceneBox ? {
            left: panX,
            top: 0,
            width: imgWidth,
            height: sceneHeight,
          } : { inset: 0 }),
          zIndex,
          pointerEvents: "none",
          backgroundColor: `rgba(0,0,0,${safeDarkness / 100})`,
          transition: `background-color ${transitionMs}ms linear`,
          contain: "paint",
        }}
      />
      {activeLights.map(effect => {
        const rawRadius = getHouseInteriorLightRadiusRatio(effect) * sceneHeight;
        const radius = Math.max(36, Math.min(sceneHeight * 0.68, rawRadius));
        const baseStrength = getHouseInteriorLightCutoutStrength(effect.type);
        // Sunlight should not create an artificial night lamp. Other light
        // sources strengthen naturally as the yard gets darker.
        const lightStrength = effect.type === "warm_glow"
          ? baseStrength * (1 - safeNight)
          : baseStrength;
        const illumination = Math.max(
          0,
          Math.min(0.78, (safeDarkness / 100) * lightStrength * 1.18),
        );
        if (illumination <= 0.002) return null;

        return (
          <div
            key={`outdoor-light-reveal-${effect.id}`}
            data-testid={`home-outdoor-light-reveal-${effect.id}`}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: panX + effect.x * imgWidth,
              top: effect.y * sceneHeight,
              width: radius * 2,
              height: radius * 2,
              transform: "translate(-50%, -50%)",
              zIndex: zIndex + 1,
              pointerEvents: "none",
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(255,250,226,${illumination}) 0%, rgba(255,226,158,${illumination * 0.72}) 31%, rgba(255,190,105,${illumination * 0.28}) 62%, rgba(255,170,75,0) 100%)`,
              mixBlendMode: "screen",
              transition: `opacity ${transitionMs}ms linear`,
              opacity: safeNight,
              contain: "paint",
            }}
          />
        );
      })}
    </>
  );
}
