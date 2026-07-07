import { useEffect, useState, useRef } from "react";
import bgVolcanic from "@assets/bg_volcanic_map.webp";
import bgSwamp from "@assets/bg_bayous_heart.webp";
import bgHauntedWoods from "@assets/bg_haunted_woods_v2.webp";

const WORLD_THEMES = {
  volcanic: {
    name: "Volcanic Isle",
    bg: bgVolcanic,
    accent: "#ff4500",
    accentSoft: "#ff6a00",
    accentDim: "rgba(255,69,0,0.35)",
    overlay:
      "linear-gradient(to bottom, rgba(18,4,2,0.92) 0%, rgba(36,10,5,0.70) 45%, rgba(18,4,2,0.94) 100%)",
    solidBg: null as string | null,
    particles: "embers" as const,
    particleColor: "#ff7020",
    particleGlow: "rgba(255,90,10,0.7)",
    barGradient: "linear-gradient(90deg,#7a1800,#d43000,#ff4500,#ff8c00,#ffd060)",
    label: "Volcanic Isle",
    subtext: "Entering the Volcanic Isle…",
  },
  swamp: {
    name: "Elysian Swamplands",
    bg: bgSwamp,
    accent: "#4ade80",
    accentSoft: "#34d399",
    accentDim: "rgba(74,222,128,0.28)",
    overlay:
      "linear-gradient(to bottom, rgba(3,10,6,0.93) 0%, rgba(6,20,10,0.68) 45%, rgba(3,10,6,0.96) 100%)",
    solidBg: null as string | null,
    particles: "fireflies" as const,
    particleColor: "#86efac",
    particleGlow: "rgba(74,222,128,0.75)",
    barGradient: "linear-gradient(90deg,#052e1c,#059669,#34d399,#a7f3d0)",
    label: "Elysian Swamplands",
    subtext: "Entering the Elysian Swamplands…",
  },
  haunted_woods: {
    name: "Haunted Woods",
    bg: bgHauntedWoods,
    accent: "#a855f7",
    accentSoft: "#c084fc",
    accentDim: "rgba(168,85,247,0.28)",
    overlay:
      "linear-gradient(to bottom, rgba(8,3,20,0.95) 0%, rgba(20,5,35,0.75) 45%, rgba(8,3,20,0.97) 100%)",
    solidBg: null as string | null,
    particles: "fireflies" as const,
    particleColor: "#d8b4fe",
    particleGlow: "rgba(168,85,247,0.80)",
    barGradient: "linear-gradient(90deg,#2e1065,#6d28d9,#a855f7,#c084fc,#e9d5ff)",
    label: "Haunted Woods",
    subtext: "Entering the Haunted Woods…",
  },
  snowy_mountain: {
    name: "Frostpeak",
    bg: null,
    accent: "#88ccff",
    accentSoft: "#aaddff",
    accentDim: "rgba(136,204,255,0.28)",
    overlay: null,
    solidBg: "linear-gradient(180deg, #07101e 0%, #0e2240 40%, #07101e 100%)",
    particles: "snowflakes" as const,
    particleColor: "#c8e8ff",
    particleGlow: "rgba(136,204,255,0.6)",
    barGradient: "linear-gradient(90deg,#071a36,#1a5080,#3a90cc,#88ccff,#cce8ff)",
    label: "Frostpeak",
    subtext: "Entering the Frostpeak Mountains…",
  },
  sky_realm: {
    name: "Sky Realm",
    bg: null,
    accent: "#ffd700",
    accentSoft: "#ffe066",
    accentDim: "rgba(255,215,0,0.28)",
    overlay: null,
    solidBg: "linear-gradient(180deg, #110e02 0%, #2a2208 40%, #110e02 100%)",
    particles: "fireflies" as const,
    particleColor: "#ffe066",
    particleGlow: "rgba(255,215,0,0.7)",
    barGradient: "linear-gradient(90deg,#2a1a00,#806000,#c89a00,#ffd700,#fff0a0)",
    label: "Sky Realm",
    subtext: "Ascending to the Sky Realm…",
  },
  island: {
    name: "The Lost Island",
    bg: null,
    accent: "#20b2aa",
    accentSoft: "#3dcfc7",
    accentDim: "rgba(32,178,170,0.28)",
    overlay: null,
    solidBg: "linear-gradient(180deg, #010f0e 0%, #052820 40%, #010f0e 100%)",
    particles: "fireflies" as const,
    particleColor: "#3dcfc7",
    particleGlow: "rgba(32,178,170,0.65)",
    barGradient: "linear-gradient(90deg,#021a18,#0a6060,#15a090,#20b2aa,#7de0da)",
    label: "The Lost Island",
    subtext: "Setting sail for the Lost Island…",
  },
  desert: {
    name: "Scorched Desert",
    bg: null,
    accent: "#daa520",
    accentSoft: "#e8c040",
    accentDim: "rgba(218,165,32,0.30)",
    overlay: null,
    solidBg: "linear-gradient(180deg, #120900 0%, #2e1800 40%, #120900 100%)",
    particles: "embers" as const,
    particleColor: "#e8a020",
    particleGlow: "rgba(218,140,20,0.65)",
    barGradient: "linear-gradient(90deg,#1e0e00,#703010,#b06000,#daa520,#f5d060)",
    label: "Scorched Desert",
    subtext: "Venturing into the Scorched Desert…",
  },
  enchanted_grove: {
    name: "Enchanted Grove",
    bg: null,
    accent: "#7fffd4",
    accentSoft: "#a0ffe0",
    accentDim: "rgba(127,255,212,0.25)",
    overlay: null,
    solidBg: "linear-gradient(180deg, #010e09 0%, #042a16 40%, #010e09 100%)",
    particles: "fireflies" as const,
    particleColor: "#7fffd4",
    particleGlow: "rgba(127,255,212,0.65)",
    barGradient: "linear-gradient(90deg,#011a0e,#0a6040,#10a070,#3fddb0,#7fffd4)",
    label: "Enchanted Grove",
    subtext: "Stepping into the Enchanted Grove…",
  },
};

function seededVal(i: number, salt: number) {
  let h = (i + 1) * 2654435761 + salt;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  x: seededVal(i, 1) * 100,
  size: 2 + seededVal(i, 2) * 3,
  delay: seededVal(i, 3) * 3.5,
  dur: 2.8 + seededVal(i, 4) * 2.2,
  drift: (seededVal(i, 5) - 0.5) * 60,
  opacity: 0.5 + seededVal(i, 6) * 0.45,
}));

const FIREFLIES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: seededVal(i, 7) * 94,
  y: 15 + seededVal(i, 8) * 65,
  size: 3 + seededVal(i, 9) * 3,
  delay: seededVal(i, 10) * 4,
  dur: 2.5 + seededVal(i, 11) * 2,
  driftX: (seededVal(i, 12) - 0.5) * 28,
  driftY: (seededVal(i, 13) - 0.5) * 20,
  opacity: 0.45 + seededVal(i, 14) * 0.5,
}));

const SNOWFLAKES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: seededVal(i, 15) * 96,
  size: 2.5 + seededVal(i, 16) * 4,
  delay: seededVal(i, 17) * 4,
  dur: 3.5 + seededVal(i, 18) * 3,
  drift: (seededVal(i, 19) - 0.5) * 50,
  opacity: 0.35 + seededVal(i, 20) * 0.55,
}));

const MIN_MS = 1800;
const MAX_WAIT_MS = 8000;

interface Props {
  worldId: string;
  pageReady: boolean;
  onReady: () => void;
}

export default function WorldLoadingScreen({ worldId, pageReady, onReady }: Props) {
  const theme = WORLD_THEMES[worldId as keyof typeof WORLD_THEMES];
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);
  const pageReadyRef = useRef(pageReady);
  useEffect(() => { pageReadyRef.current = pageReady; }, [pageReady]);

  useEffect(() => {
    if (!theme) {
      onReady();
      return;
    }

    if (theme.bg) {
      const preload = new Image();
      preload.src = theme.bg;
    }

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const minDone = elapsed >= MIN_MS;
      const hardTimeout = elapsed >= MAX_WAIT_MS;
      const prog = Math.min(elapsed / MIN_MS, 1);
      setProgress(prog);

      if (!minDone) {
        rafRef.current = requestAnimationFrame(tick);
      } else if ((pageReadyRef.current || hardTimeout) && !doneRef.current) {
        doneRef.current = true;
        setFadeOut(true);
        setTimeout(onReady, 560);
      } else if (!doneRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (pageReady && doneRef.current === false) {
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= MIN_MS) {
        cancelAnimationFrame(rafRef.current);
        doneRef.current = true;
        setFadeOut(true);
        setTimeout(onReady, 560);
      }
    }
  }, [pageReady]);

  if (!theme) return null;

  const isEmbers = theme.particles === "embers";
  const isFireflies = theme.particles === "fireflies";
  const isSnowflakes = theme.particles === "snowflakes";

  return (
    <div
      data-testid={`world-loading-${worldId}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
        overflow: "hidden",
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 0.56s ease-out" : "opacity 0.22s ease-in",
        WebkitTransition: fadeOut ? "opacity 0.56s ease-out" : "opacity 0.22s ease-in",
        isolation: "isolate",
      }}
    >
      <style>{`
        @keyframes wls-ember {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: 0.55; }
          100% { transform: translateY(calc(-75*var(--vh))) translateX(var(--drift)) scale(0.35); opacity: 0; }
        }
        @keyframes wls-firefly {
          0%   { transform: translate(0,0); opacity: 0.1; }
          30%  { opacity: 1; }
          70%  { opacity: 0.85; }
          100% { transform: translate(var(--driftX), var(--driftY)); opacity: 0.1; }
        }
        @keyframes wls-snowflake {
          0%   { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(110vh) translateX(var(--drift)) rotate(360deg); opacity: 0; }
        }
        @keyframes wls-pulse-ring {
          0%   { transform: scale(0.92); opacity: 0.6; }
          50%  { transform: scale(1.06); opacity: 0.25; }
          100% { transform: scale(0.92); opacity: 0.6; }
        }
        @keyframes wls-title-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Background: image-based worlds */}
      {theme.bg && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${theme.bg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "brightness(0.42) saturate(1.3)",
            transform: "scale(1.04)",
          }}
        />
      )}

      {/* Background: gradient-only worlds */}
      {!theme.bg && theme.solidBg && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: theme.solidBg,
          }}
        />
      )}

      {/* Atmospheric overlay (image-based only) */}
      {theme.overlay && (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: theme.overlay }} />
      )}

      {/* Vignette */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 70% 65% at 50% 45%, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* ── Embers (Volcanic, Desert) ─────────────────────────────────────── */}
      {isEmbers && EMBERS.map(p => (
        <div
          key={p.id}
          aria-hidden
          style={{
            position: "absolute",
            left: `${p.x}%`,
            bottom: -6,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: theme.particleColor,
            boxShadow: `0 0 ${p.size * 2.5}px ${theme.particleGlow}`,
            opacity: p.opacity,
            animation: `wls-ember ${p.dur}s ${p.delay}s ease-in infinite`,
            willChange: "transform, opacity",
            ["--drift" as any]: `${p.drift}px`,
          }}
        />
      ))}

      {/* ── Fireflies (Swamp, Haunted Woods, Sky Realm, Island, Grove) ────── */}
      {isFireflies && FIREFLIES.map(p => (
        <div
          key={p.id}
          aria-hidden
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: theme.particleColor,
            boxShadow: `0 0 ${p.size * 3}px ${theme.particleGlow}, 0 0 ${p.size * 6}px ${theme.particleGlow}`,
            opacity: p.opacity,
            animation: `wls-firefly ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
            willChange: "transform, opacity",
            ["--driftX" as any]: `${p.driftX}px`,
            ["--driftY" as any]: `${p.driftY}px`,
          }}
        />
      ))}

      {/* ── Snowflakes (Frostpeak) ─────────────────────────────────────────── */}
      {isSnowflakes && SNOWFLAKES.map(p => (
        <div
          key={p.id}
          aria-hidden
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: -10,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: theme.particleColor,
            boxShadow: `0 0 ${p.size * 2}px ${theme.particleGlow}`,
            opacity: p.opacity,
            animation: `wls-snowflake ${p.dur}s ${p.delay}s linear infinite`,
            willChange: "transform, opacity",
            ["--drift" as any]: `${p.drift}px`,
          }}
        />
      ))}

      {/* ── Center content ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 32,
          paddingRight: 32,
          paddingTop: "max(env(safe-area-inset-top), 24px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
        }}
      >
        {/* Pulse ring behind title */}
        <div
          aria-hidden
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            border: `1.5px solid ${theme.accent}50`,
            position: "absolute",
            animation: "wls-pulse-ring 2.4s ease-in-out infinite",
          }}
        />

        {/* Entering label */}
        <p
          className="font-fantasy"
          style={{
            fontSize: 10,
            letterSpacing: "0.38em",
            color: theme.accentSoft,
            textTransform: "uppercase",
            marginBottom: 10,
            opacity: 0.85,
            animation: "wls-title-in 0.5s ease-out both",
          }}
        >
          Entering
        </p>

        {/* World name */}
        <h1
          className="font-fantasy text-center"
          style={{
            fontSize: 26,
            color: "#fff",
            letterSpacing: "0.1em",
            textShadow: `0 0 28px ${theme.accentDim}, 0 0 60px ${theme.accentDim}, 0 3px 10px rgba(0,0,0,0.95)`,
            marginBottom: 6,
            animation: "wls-title-in 0.5s 0.1s ease-out both",
            lineHeight: 1.2,
          }}
        >
          {theme.name}
        </h1>

        {/* Ornament divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 32,
            marginTop: 4,
            width: "100%",
            maxWidth: 260,
            animation: "wls-title-in 0.5s 0.2s ease-out both",
          }}
        >
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${theme.accent}60)` }} />
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: theme.accent,
              boxShadow: `0 0 10px ${theme.accentDim}`,
            }}
          />
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${theme.accent}60,transparent)` }} />
        </div>

        {/* Progress track */}
        <div
          style={{
            width: "100%",
            maxWidth: 220,
            height: 3,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 99,
            overflow: "hidden",
            marginBottom: 12,
            animation: "wls-title-in 0.5s 0.25s ease-out both",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              background: theme.barGradient,
              borderRadius: 99,
              boxShadow: `0 0 8px ${theme.accentDim}`,
              transition: "width 0.12s linear",
              WebkitTransition: "width 0.12s linear",
            }}
          />
        </div>

        {/* Subtext */}
        <p
          className="font-fantasy text-center"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: `${theme.accent}70`,
            animation: "wls-title-in 0.5s 0.3s ease-out both",
          }}
        >
          {theme.subtext}
        </p>
      </div>
    </div>
  );
}
