import { useEffect } from "react";
import type { ReactNode } from "react";
import { Star, Clock } from "lucide-react";
import powerupBagIconPO from "@assets/generated_images/icon_powerup_bag.png";

export type PowerUpEffectType = "stat" | "level" | "hatch";

interface PowerUpOverlayProps {
  visible: boolean;
  effectType: PowerUpEffectType;
  label: string;
  onDone: () => void;
}

const CONFIGS: Record<PowerUpEffectType, {
  color: string;
  colorRgb: string;
  bg: string;
  icon: ReactNode;
  title: string;
  particleColors: string[];
}> = {
  stat: {
    color: "#4ade80",
    colorRgb: "74,222,128",
    bg: "rgba(74,222,128,0.08)",
    icon: <img src={powerupBagIconPO} alt="" style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 0 18px rgba(74,222,128,0.9)) drop-shadow(0 0 40px rgba(74,222,128,0.5))" }} />,
    title: "POWER UP!",
    particleColors: ["#4ade80", "#86efac", "#bbf7d0", "#22c55e", "#fff"],
  },
  level: {
    color: "#f0c040",
    colorRgb: "240,192,64",
    bg: "rgba(240,192,64,0.08)",
    icon: <Star style={{ width: 88, height: 88, color: "#f0c040", fill: "#f0c040", filter: "drop-shadow(0 0 18px rgba(240,192,64,0.9)) drop-shadow(0 0 40px rgba(240,192,64,0.5))" }} />,
    title: "LEVEL UP!",
    particleColors: ["#f0c040", "#fbbf24", "#fde68a", "#fcd34d", "#fff"],
  },
  hatch: {
    color: "#38bdf8",
    colorRgb: "56,189,248",
    bg: "rgba(56,189,248,0.08)",
    icon: <Clock style={{ width: 88, height: 88, color: "#38bdf8", filter: "drop-shadow(0 0 18px rgba(56,189,248,0.9)) drop-shadow(0 0 40px rgba(56,189,248,0.5))" }} />,
    title: "SPEED UP!",
    particleColors: ["#38bdf8", "#7dd3fc", "#bae6fd", "#0ea5e9", "#c4b5fd"],
  },
};

const DURATION = 2600;

export default function PowerUpOverlay({ visible, effectType, label, onDone }: PowerUpOverlayProps) {
  const cfg = CONFIGS[effectType];

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, DURATION);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("navOverlayToggle", { detail: { open: visible } }));
  }, [visible]);

  if (!visible) return null;

  const particles = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const dist = 90 + Math.random() * 130;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const size = 5 + Math.random() * 10;
    const delay = Math.random() * 0.25;
    const colorIdx = Math.floor(Math.random() * cfg.particleColors.length);
    return { px, py, size, delay, color: cfg.particleColors[colorIdx] };
  });

  const rings = [0, 0.15, 0.3, 0.5];
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <div
      className="fixed inset-0 z-[500] pointer-events-none overflow-hidden flex items-center justify-center"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      {/* Dark overlay fade */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, ${cfg.bg} 0%, rgba(0,0,0,0.55) 100%)`,
          animation: `puOverlayFade ${DURATION}ms ease-out forwards`,
        }}
      />

      {/* Screen flash */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, rgba(${cfg.colorRgb},0.55) 0%, rgba(${cfg.colorRgb},0.2) 40%, transparent 70%)`,
          animation: `puFlash 0.5s ease-out forwards`,
        }}
      />

      {/* Expanding rings */}
      {rings.map((delay, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 80,
            height: 80,
            border: `3px solid rgba(${cfg.colorRgb},${0.9 - i * 0.15})`,
            animation: `puRingExpand 1.4s ${delay}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}

      {/* Light rays */}
      {rays.map((angle, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: 3,
            height: 280,
            background: `linear-gradient(to bottom, transparent 0%, rgba(${cfg.colorRgb},0.7) 35%, rgba(${cfg.colorRgb},0.4) 65%, transparent 100%)`,
            transform: `rotate(${angle}deg)`,
            animation: `puRayFade 1.0s ${i * 0.04}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}

      {/* Particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            ["--pu-px" as any]: `${p.px}px`,
            ["--pu-py" as any]: `${p.py}px`,
            animation: `puParticle 1.1s ${p.delay}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}

      {/* Star sparkles */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const d = 60 + Math.random() * 60;
        return (
          <div
            key={`star-${i}`}
            className="absolute font-bold"
            style={{
              fontSize: 14 + Math.random() * 10,
              color: cfg.particleColors[i % cfg.particleColors.length],
              left: `calc(50% + ${Math.cos(angle) * d}px)`,
              top: `calc(50% + ${Math.sin(angle) * d}px)`,
              animation: `puStar 1.2s ${i * 0.07}s ease-out forwards`,
              opacity: 0,
              transform: "translate(-50%, -50%)",
              filter: `drop-shadow(0 0 6px ${cfg.color})`,
            }}
          >
            ✦
          </div>
        );
      })}

      {/* Center content */}
      <div
        className="relative flex flex-col items-center gap-3 z-10"
        style={{ animation: `puContent ${DURATION}ms ease-out forwards` }}
      >
        {/* Big icon */}
        <div
          style={{
            lineHeight: 1,
            animation: "puIconBounce 0.9s ease-out forwards",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cfg.icon}
        </div>

        {/* Stat label */}
        <div
          className="font-fantasy text-4xl font-bold tracking-wider"
          data-testid="text-power-up-success"
          style={{
            color: cfg.color,
            textShadow: `0 0 24px rgba(${cfg.colorRgb},1), 0 0 48px rgba(${cfg.colorRgb},0.6), 0 0 80px rgba(${cfg.colorRgb},0.3)`,
            animation: "puLabelPop 0.8s 0.15s ease-out both",
          }}
        >
          {label}
        </div>

        {/* Title */}
        <div
          className="font-fantasy text-sm tracking-[0.3em] uppercase"
          style={{
            color: `rgba(${cfg.colorRgb},0.75)`,
            textShadow: `0 0 12px rgba(${cfg.colorRgb},0.6)`,
            animation: "puLabelPop 0.8s 0.3s ease-out both",
          }}
        >
          {cfg.title}
        </div>
      </div>
    </div>
  );
}
