import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import type { HouseInteriorEffect } from "@shared/housing";
import {
  HOME_OUTDOOR_LIGHTING_STORAGE_KEY,
  cycleHomeOutdoorLightingMode,
  getHomeOutdoorDarkness,
  getHomeOutdoorNightStrength,
  isHomeOutdoorLightingMode,
  type HomeOutdoorLightingMode,
} from "@/lib/homeOutdoorLighting";

function readStoredMode(): HomeOutdoorLightingMode {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(HOME_OUTDOOR_LIGHTING_STORAGE_KEY);
    return isHomeOutdoorLightingMode(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function useHomeOutdoorLighting() {
  const [mode, setModeState] = useState<HomeOutdoorLightingMode>(readStoredMode);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (mode !== "auto") return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HOME_OUTDOOR_LIGHTING_STORAGE_KEY || !isHomeOutdoorLightingMode(event.newValue)) return;
      setModeState(event.newValue);
      setNow(new Date());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((next: HomeOutdoorLightingMode) => {
    setModeState(next);
    setNow(new Date());
    try {
      window.localStorage.setItem(HOME_OUTDOOR_LIGHTING_STORAGE_KEY, next);
    } catch {
      // Local preference persistence is best-effort.
    }
  }, []);

  const cycleMode = useCallback(() => {
    setMode(cycleHomeOutdoorLightingMode(mode));
  }, [mode, setMode]);

  const nightStrength = useMemo(() => getHomeOutdoorNightStrength(mode, now), [mode, now]);
  const darkness = useMemo(() => getHomeOutdoorDarkness(mode, now), [mode, now]);

  return { mode, setMode, cycleMode, nightStrength, darkness };
}

function AutoLightingIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.6 4.1V2.4M7.6 21.6v-1.7M1.8 12h1.8M11.6 12h1.8M3.5 7.9 2.2 6.6M12.9 17.3l-1.3-1.3M3.5 16.1l-1.3 1.3M12.9 6.7l-1.3 1.3" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round"/>
      <circle cx="7.6" cy="12" r="3.35" stroke="currentColor" strokeWidth="1.45"/>
      <path d="M20.5 6.2a7.2 7.2 0 0 0-4.4 13.1 7.4 7.4 0 0 1-5.6-7.2 7.4 7.4 0 0 1 7.4-7.4c.9 0 1.8.2 2.6.5Z" fill="currentColor" opacity=".82"/>
    </svg>
  );
}

export function HomeDayNightToggle({
  mode,
  onCycle,
  style,
}: {
  mode: HomeOutdoorLightingMode;
  onCycle: () => void;
  style?: CSSProperties;
}) {
  const label = mode === "auto"
    ? "Automatic day and night. Tap for daylight."
    : mode === "day"
      ? "Daylight override. Tap for night."
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
        width: 42,
        height: 42,
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        border: mode === "night" ? "1.5px solid rgba(157,196,255,.62)" : "1.5px solid rgba(255,218,116,.62)",
        color: mode === "night" ? "#d9e7ff" : "#ffe29a",
        background: mode === "night"
          ? "radial-gradient(circle at 45% 38%, rgba(73,103,155,.48), rgba(3,10,24,.88) 72%)"
          : "radial-gradient(circle at 45% 38%, rgba(126,96,34,.42), rgba(8,14,7,.88) 72%)",
        boxShadow: mode === "night"
          ? "0 0 14px rgba(102,148,226,.22), 0 4px 12px rgba(0,0,0,.5)"
          : "0 0 14px rgba(255,201,77,.18), 0 4px 12px rgba(0,0,0,.5)",
        backdropFilter: "blur(6px)",
        cursor: "pointer",
        pointerEvents: "auto",
        touchAction: "manipulation",
        ...style,
      }}
    >
      {mode === "day" ? <Sun size={20} strokeWidth={1.8} /> : mode === "night" ? <Moon size={19} strokeWidth={1.8} /> : <AutoLightingIcon />}
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
}: {
  darkness: number;
  nightStrength: number;
  effects: HouseInteriorEffect[];
  panX: number;
  imgWidth: number;
  sceneHeight: number;
  zIndex?: number;
}) {
  const safeNight = Math.max(0, Math.min(1, nightStrength));
  return (
    <>
      <div
        data-testid="home-outdoor-night-tint"
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: zIndex - 1,
          opacity: safeNight * .24,
          background: "radial-gradient(circle at 52% 12%, rgba(43,69,120,.38), transparent 42%), linear-gradient(180deg, rgba(9,22,52,.42), rgba(2,7,20,.68))",
          transition: "opacity 30s linear",
        }}
      />
      <HomeInteriorDarknessLayer
        darkness={darkness}
        effects={effects}
        panX={panX}
        imgWidth={imgWidth}
        sceneHeight={sceneHeight}
        zIndex={zIndex}
      />
    </>
  );
}
