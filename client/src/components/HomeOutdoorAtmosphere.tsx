import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { HomeInteriorDarknessLayer } from "@/components/HomeInteriorEffect";
import type { HouseInteriorEffect } from "@shared/housing";
import {
  getHomeOutdoorDarkness,
  getHomeOutdoorNightStrength,
  type HomeOutdoorLightingMode,
} from "@/lib/homeOutdoorLighting";

export function useHomeOutdoorLighting(mode: HomeOutdoorLightingMode) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    if (mode !== "auto") return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const nightStrength = useMemo(() => getHomeOutdoorNightStrength(mode, now), [mode, now]);
  const darkness = useMemo(() => getHomeOutdoorDarkness(mode, now), [mode, now]);

  return { mode, nightStrength, daylightStrength: 1 - nightStrength, darkness };
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
            transition: mode === "auto" ? "left 30s linear" : "left 280ms ease-out",
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
          opacity: safeNight * .30,
          background: "radial-gradient(circle at 52% 12%, rgba(43,69,120,.38), transparent 42%), linear-gradient(180deg, rgba(7,18,45,.5), rgba(1,5,15,.78))",
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
