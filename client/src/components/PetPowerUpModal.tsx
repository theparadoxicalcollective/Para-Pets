import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { getNextZ } from "@/lib/layerManager";
import type { ReactNode } from "react";
import { Star, Clock, Zap } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import forestBg from "@assets/generated_images/powerup_forest_bg.png";

// ── Inline success-animation configs (mirrors PowerUpOverlay) ──────────────
const EFFECT_CONFIGS: Record<"stat" | "level" | "hatch", { color: string; rgb: string; icon: ReactNode; title: string; particleColors: readonly string[] }> = {
  stat:  { color: "#4ade80", rgb: "74,222,128",  icon: <Zap style={{ width: 80, height: 80, color: "#4ade80", fill: "#4ade80", filter: "drop-shadow(0 0 18px rgba(74,222,128,0.9))" }} />, title: "POWER UP!", particleColors: ["#4ade80","#86efac","#bbf7d0","#22c55e","#fff"] },
  level: { color: "#f0c040", rgb: "240,192,64",  icon: <Star style={{ width: 80, height: 80, color: "#f0c040", fill: "#f0c040", filter: "drop-shadow(0 0 18px rgba(240,192,64,0.9))" }} />, title: "LEVEL UP!",  particleColors: ["#f0c040","#fbbf24","#fde68a","#fcd34d","#fff"] },
  hatch: { color: "#38bdf8", rgb: "56,189,248",  icon: <Clock style={{ width: 80, height: 80, color: "#38bdf8", filter: "drop-shadow(0 0 18px rgba(56,189,248,0.9))" }} />, title: "SPEED UP!",  particleColors: ["#38bdf8","#7dd3fc","#bae6fd","#0ea5e9","#c4b5fd"] },
} as const;

export interface PowerUpItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
}

interface PetPowerUpModalProps {
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  rarity: number;
  petLevel: number;
  petAtk: number;
  petDef: number;
  petHealth: number;
  itemsRemaining: number;
  items: PowerUpItem[];
  isPending: boolean;
  title?: string;
  subtitle?: string;
  showBuyButton?: boolean;
  successEffect?: { type: "stat" | "level" | "hatch"; label: string } | null;
  onUseItem: (item: PowerUpItem) => void;
  onSuccessAnimEnd: () => void;
  onClose: () => void;
}

// ── Web Audio synthetic power-up sound ──────────────────────────────────────
function playPowerUpSound(type: "stat" | "level" | "hatch") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes =
      type === "level"  ? [523, 659, 784, 1047] :
      type === "hatch"  ? [440, 554, 659, 880]  :
                          [392, 523, 659, 784];

    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
      gain.gain.setValueAtTime(0,   ctx.currentTime + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.38);
    });

    const sh     = ctx.createOscillator();
    const shGain = ctx.createGain();
    sh.type = "triangle";
    sh.frequency.setValueAtTime(3400, ctx.currentTime);
    sh.frequency.exponentialRampToValueAtTime(5200, ctx.currentTime + 0.35);
    shGain.gain.setValueAtTime(0.09, ctx.currentTime);
    shGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    sh.connect(shGain);
    shGain.connect(ctx.destination);
    sh.start(ctx.currentTime);
    sh.stop(ctx.currentTime + 0.5);
  } catch {}
}

// ── Colour helpers ───────────────────────────────────────────────────────────
function itemColor(item: PowerUpItem) {
  if (item.type === "special") {
    return item.specialType === "hatch_time" ? "#38bdf8" : "#f0c040";
  }
  switch (item.statBoostType) {
    case "health": return "#4ade80";
    case "atk":    return "#f87171";
    case "def":    return "#60a5fa";
    case "lvl":    return "#c084fc";
    default:       return "#f0c040";
  }
}

function itemLabel(item: PowerUpItem) {
  if (item.type === "special") {
    return item.specialType === "hatch_time"
      ? `-${item.specialAmount ?? "?"} min`
      : `+${item.specialAmount ?? "?"} LVL pts`;
  }
  const amt = item.statBoostAmount ?? "?";
  switch (item.statBoostType) {
    case "health": return `+${amt} HP`;
    case "atk":    return `+${amt} ATK`;
    case "def":    return `+${amt} DEF`;
    case "lvl":    return `+${amt} Feed pts`;
    default:       return `+${amt}`;
  }
}

function itemSoundType(item: PowerUpItem): "stat" | "level" | "hatch" {
  if (item.type === "special") {
    return item.specialType === "hatch_time" ? "hatch" : "level";
  }
  if (item.statBoostType === "lvl") return "level";
  return "stat";
}

const ANIM_DURATION = 2400;

// ── Component ────────────────────────────────────────────────────────────────
export default function PetPowerUpModal({
  petName, petImage, petTemplateId, rarity,
  petLevel, petAtk, petDef, petHealth,
  itemsRemaining, items, isPending,
  title = "POWER UP", subtitle,
  showBuyButton = false,
  successEffect,
  onUseItem, onSuccessAnimEnd, onClose,
}: PetPowerUpModalProps) {
  const petZoneRef    = useRef<HTMLDivElement>(null);
  const draggingRef   = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);

  const [myZ] = useState(() => getNextZ());
  const [dragging,    setDragging]    = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [dragOverPet, setDragOverPet] = useState(false);
  const [petAnim,     setPetAnim]     = useState<"none" | "bounce" | "flash">("none");
  const [petGlow,     setPetGlow]     = useState<string | null>(null);
  const [sparkles,    setSparkles]    = useState<{ id: number; x: number; y: number; color: string; angle: number }[]>([]);
  const sparkIdRef = useRef(0);

  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  useEffect(() => {
    if (!successEffect) return;
    const t = setTimeout(onSuccessAnimEnd, ANIM_DURATION);
    return () => clearTimeout(t);
  }, [successEffect, onSuccessAnimEnd]);

  useEffect(() => {
    if (!dragging) return;
    const stillInList = items.some(i => i.inventoryId === dragging.item.inventoryId);
    if (!stillInList) {
      setDragging(null);
      setDragOverPet(false);
    }
  }, [items, dragging]);

  const animParticles = useMemo(() => {
    if (!successEffect) return [];
    const cfg = EFFECT_CONFIGS[successEffect.type];
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist  = 70 + Math.random() * 110;
      return {
        px: Math.cos(angle) * dist,
        py: Math.sin(angle) * dist,
        size: 5 + Math.random() * 8,
        delay: Math.random() * 0.2,
        color: cfg.particleColors[Math.floor(Math.random() * cfg.particleColors.length)],
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successEffect?.type]);

  // ── Use an item ────────────────────────────────────────────────────────────
  const useItem = useCallback((item: PowerUpItem) => {
    playPowerUpSound(itemSoundType(item));
    const color = itemColor(item);

    setPetGlow(color);
    setPetAnim("bounce");
    setTimeout(() => { setPetAnim("flash"); }, 300);
    setTimeout(() => { setPetAnim("none"); setPetGlow(null); }, 900);

    if (petZoneRef.current) {
      const rect = petZoneRef.current.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;
      const burst = Array.from({ length: 16 }, (_, i) => ({
        id: sparkIdRef.current++,
        x: cx, y: cy,
        color,
        angle: (i / 16) * 360,
      }));
      setSparkles(burst);
      setTimeout(() => setSparkles([]), 700);
    }

    onUseItem(item);
  }, [onUseItem]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleItemPointerDown = useCallback((e: React.PointerEvent, item: PowerUpItem) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ item, x: e.clientX, y: e.clientY });
  }, []);

  const handleItemPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const next = { ...draggingRef.current, x: e.clientX, y: e.clientY };
    setDragging(next);
    if (petZoneRef.current) {
      const r = petZoneRef.current.getBoundingClientRect();
      setDragOverPet(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    }
  }, []);

  const handleItemPointerUp = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    if (petZoneRef.current) {
      const r = petZoneRef.current.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        useItem(d.item);
      }
    }
    setDragging(null);
    setDragOverPet(false);
  }, [useItem]);

  const rarityStars = Array.from({ length: rarity }, (_, i) => i);
  const animCfg = successEffect ? EFFECT_CONFIGS[successEffect.type] : null;

  const slotsColor = itemsRemaining === Infinity ? "#fcd34d"
    : itemsRemaining > 0 ? "#86efac"
    : "#f87171";
  const slotsBorder = itemsRemaining === Infinity ? "rgba(240,192,64,0.5)"
    : itemsRemaining > 0 ? "rgba(134,239,172,0.5)"
    : "rgba(248,113,113,0.5)";
  const slotsBg = itemsRemaining === Infinity ? "rgba(30,20,5,0.85)"
    : itemsRemaining > 0 ? "rgba(10,25,12,0.85)"
    : "rgba(30,8,8,0.85)";

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ zIndex: myZ, maxWidth: "768px", margin: "0 auto", left: 0, right: 0, overscrollBehavior: "none" }}
    >
      <style>{`
        @keyframes puMBounce {
          0%  { transform: scale(1) translateY(0); }
          25% { transform: scale(1.12) translateY(-14px); }
          55% { transform: scale(0.93) translateY(6px); }
          75% { transform: scale(1.04) translateY(-4px); }
          100%{ transform: scale(1) translateY(0); }
        }
        @keyframes puMFlash {
          0%   { filter: brightness(1) saturate(1); }
          30%  { filter: brightness(2.8) saturate(0.3); }
          60%  { filter: brightness(1.6) saturate(0.7); }
          100% { filter: brightness(1) saturate(1); }
        }
        @keyframes puMSparkle {
          0%   { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) translate(var(--sx),var(--sy)) scale(0.2); opacity: 0; }
        }
        @keyframes puMItemPop {
          0%  { transform: scale(0.8); opacity:0; }
          70% { transform: scale(1.05); }
          100%{ transform: scale(1); opacity:1; }
        }
        @keyframes puMDropHint {
          0%,100%{ transform:scale(1); box-shadow: 0 0 32px var(--glow); }
          50%    { transform:scale(1.02); box-shadow: 0 0 64px var(--glow); }
        }
        @keyframes puMFloatCard {
          0%,100%{ transform:translate(-50%,-50%) rotate(-3deg) scale(1.05); }
          50%    { transform:translate(-50%,-50%) rotate(2deg) scale(1.08); }
        }
        @keyframes puMRingExpand {
          0%   { transform: scale(0.5); opacity: 0.9; }
          100% { transform: scale(6);   opacity: 0; }
        }
        @keyframes puMRayFade {
          0%   { opacity: 0.7; transform: scaleY(0.4) rotate(var(--r)); }
          60%  { opacity: 0.5; }
          100% { opacity: 0;   transform: scaleY(1.2) rotate(var(--r)); }
        }
        @keyframes puMParticle {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--px),var(--py)) scale(0.15); opacity: 0; }
        }
        @keyframes puMStar {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.3); }
          40%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(1.5); }
        }
        @keyframes puMContentPop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes puMOverlayFade {
          0%   { opacity: 1; }
          70%  { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes puMOrb {
          0%   { transform: translate(0, 0);    opacity: 0.2; }
          20%  { transform: translate(5px, -20px);  opacity: 0.9; }
          45%  { transform: translate(-6px, -38px); opacity: 0.5; }
          70%  { transform: translate(9px, -22px);  opacity: 0.85; }
          100% { transform: translate(0, 0);    opacity: 0.2; }
        }
        @keyframes puMOrbPulse {
          0%,100% { box-shadow: 0 0 3px 2px rgba(255,255,255,0.9), 0 0 10px 6px rgba(180,240,255,0.5), 0 0 28px 14px rgba(56,189,248,0.2), 0 0 52px 26px rgba(56,189,248,0.07); }
          50%     { box-shadow: 0 0 5px 3px rgba(255,255,255,1),   0 0 16px 9px rgba(180,240,255,0.7), 0 0 44px 22px rgba(56,189,248,0.3), 0 0 80px 40px rgba(56,189,248,0.12); }
        }
        @keyframes puMOrbWarm {
          0%,100% { box-shadow: 0 0 3px 2px rgba(255,255,220,0.9), 0 0 10px 6px rgba(255,220,100,0.5), 0 0 28px 14px rgba(240,180,40,0.2), 0 0 52px 26px rgba(240,160,20,0.07); }
          50%     { box-shadow: 0 0 5px 3px rgba(255,255,220,1),   0 0 16px 9px rgba(255,220,100,0.7), 0 0 44px 22px rgba(240,180,40,0.3), 0 0 80px 40px rgba(240,160,20,0.12); }
        }
      `}</style>

      {/* ── Forest background ── */}
      <div className="absolute inset-0 z-0">
        <img src={forestBg} alt="" className="w-full h-full object-cover" style={{ objectPosition: "center top" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(1,8,20,0.45) 0%, rgba(2,10,24,0.35) 40%, rgba(3,12,28,0.78) 75%, rgba(1,6,16,0.96) 100%)" }} />
      </div>

      {/* ── Floating lights ── */}
      {[
        { left: "10%",  top: "55%", delay: "0s",    dur: 5.2, warm: false },
        { left: "80%",  top: "48%", delay: "1.1s",  dur: 6.8, warm: true  },
        { left: "22%",  top: "30%", delay: "2.3s",  dur: 4.9, warm: false },
        { left: "68%",  top: "22%", delay: "0.6s",  dur: 7.1, warm: true  },
        { left: "45%",  top: "60%", delay: "1.8s",  dur: 5.6, warm: false },
        { left: "88%",  top: "35%", delay: "3.0s",  dur: 6.2, warm: true  },
        { left: "55%",  top: "15%", delay: "0.4s",  dur: 8.0, warm: false },
        { left: "32%",  top: "70%", delay: "2.7s",  dur: 5.0, warm: true  },
        { left: "15%",  top: "20%", delay: "1.5s",  dur: 6.0, warm: false },
        { left: "72%",  top: "65%", delay: "0.9s",  dur: 5.8, warm: true  },
      ].map((o, i) => (
        <div key={i} className="absolute z-[1] rounded-full pointer-events-none" style={{
          left: o.left, top: o.top,
          width: 4, height: 4,
          background: o.warm ? "rgba(255,250,200,1)" : "rgba(220,245,255,1)",
          filter: "blur(0.5px)",
          animation: `puMOrb ${o.dur}s ${o.delay} ease-in-out infinite, ${o.warm ? "puMOrbWarm" : "puMOrbPulse"} ${o.dur * 0.8}s ${o.delay} ease-in-out infinite`,
        }} />
      ))}

      {/* ── Inline success animation ── */}
      {successEffect && animCfg && (
        <div
          className="absolute inset-0 z-[50] pointer-events-none overflow-hidden flex items-center justify-center"
          style={{ animation: `puMOverlayFade ${ANIM_DURATION}ms ease-out forwards` }}
        >
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, rgba(${animCfg.rgb},0.22) 0%, rgba(0,0,0,0.5) 100%)` }} />
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, rgba(${animCfg.rgb},0.45) 0%, transparent 65%)`, animation: "puMFlash 0.5s ease-out forwards" }} />
          {[0, 0.15, 0.3].map((delay, i) => (
            <div key={i} className="absolute rounded-full" style={{ width: 60, height: 60, border: `3px solid rgba(${animCfg.rgb},${0.9 - i * 0.2})`, animation: `puMRingExpand 1.3s ${delay}s ease-out forwards`, opacity: 0 }} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="absolute" style={{ width: 2, height: 220, background: `linear-gradient(to bottom, transparent 0%, rgba(${animCfg.rgb},0.6) 40%, rgba(${animCfg.rgb},0.3) 70%, transparent 100%)`, ["--r" as any]: `${i * 36}deg`, transform: `rotate(${i * 36}deg)`, animation: `puMRayFade 1.0s ${i * 0.05}s ease-out forwards`, opacity: 0 }} />
          ))}
          {animParticles.map((p, i) => (
            <div key={i} className="absolute rounded-full" style={{ width: p.size, height: p.size, background: p.color, boxShadow: `0 0 ${p.size * 2}px ${p.color}`, ["--px" as any]: `${p.px}px`, ["--py" as any]: `${p.py}px`, animation: `puMParticle 1.1s ${p.delay}s ease-out forwards`, opacity: 0 }} />
          ))}
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const d = 55 + Math.random() * 50;
            return (
              <div key={`star-${i}`} className="absolute font-bold" style={{ fontSize: 12 + Math.random() * 10, color: animCfg.particleColors[i % animCfg.particleColors.length], left: `calc(50% + ${Math.cos(a) * d}px)`, top: `calc(50% + ${Math.sin(a) * d}px)`, animation: `puMStar 1.2s ${i * 0.07}s ease-out forwards`, opacity: 0, transform: "translate(-50%,-50%)", filter: `drop-shadow(0 0 6px ${animCfg.color})` }}>✦</div>
            );
          })}
          <div className="relative flex flex-col items-center gap-3 z-10" style={{ animation: "puMContentPop 0.6s ease-out both" }}>
            <div style={{ fontSize: 72, lineHeight: 1, filter: `drop-shadow(0 0 20px rgba(${animCfg.rgb},0.9))` }}>{animCfg.icon}</div>
            <div className="font-fantasy text-4xl font-bold tracking-wider" data-testid="text-power-up-success" style={{ color: animCfg.color, textShadow: `0 0 24px rgba(${animCfg.rgb},1), 0 0 48px rgba(${animCfg.rgb},0.5)` }}>{successEffect.label}</div>
            <div className="font-fantasy text-sm tracking-[0.3em] uppercase" style={{ color: `rgba(${animCfg.rgb},0.8)`, textShadow: `0 0 12px rgba(${animCfg.rgb},0.6)` }}>{animCfg.title}</div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="relative z-[10] flex items-center justify-between px-4 pt-[18%] pb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={powerupBagIcon} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div>
            <h2 className="font-fantasy text-[#fcd34d] text-xl tracking-widest leading-none"
              style={{ textShadow: "0 0 18px rgba(252,211,77,0.8), 0 0 40px rgba(252,211,77,0.3), 0 2px 8px rgba(0,0,0,0.9)" }}>
              {title}
            </h2>
            <p className="font-fantasy text-[#86efac] text-[11px] tracking-wide mt-0.5"
              style={{ textShadow: "0 0 10px rgba(134,239,172,0.5), 0 1px 4px rgba(0,0,0,0.9)" }}>
              {subtitle ?? `Choose an item below to strengthen ${petName}`}
            </p>
          </div>
        </div>
        <button
          data-testid="button-close-powerup-modal"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0"
          style={{ background: "rgba(10,20,10,0.85)", border: "1.5px solid rgba(134,239,172,0.35)", color: "#86efac", cursor: "pointer", boxShadow: "0 0 12px rgba(134,239,172,0.15)" }}
        >
          ✕
        </button>
      </div>

      {/* ── Slots remaining banner ── */}
      <div className="relative z-[10] flex justify-center px-4 pb-1 flex-shrink-0">
        <div className="px-5 py-1.5 rounded-full font-fantasy text-[11px] tracking-wider font-semibold"
          style={{
            background: slotsBg,
            border: `1.5px solid ${slotsBorder}`,
            color: slotsColor,
            boxShadow: `0 0 16px ${slotsBorder}40, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>
          {itemsRemaining === Infinity
            ? "✦ No limit — use as many as you like!"
            : itemsRemaining > 0
              ? `✦ ${itemsRemaining} slot${itemsRemaining === 1 ? "" : "s"} remaining this level`
              : "✕ No slots left — level up to continue!"}
        </div>
      </div>

      {/* ── Pet zone ── */}
      <div className="relative z-[10] flex flex-col items-center flex-shrink px-3 pb-1" style={{ flexShrink: 1, minHeight: 0 }}>
        <div
          ref={petZoneRef}
          data-testid="zone-pet-drop"
          className="relative flex items-center justify-center transition-all duration-300 w-full overflow-visible"
          style={{
            height: "min(340px, 42svh)",
            borderRadius: 20,
            background: dragOverPet
              ? `radial-gradient(ellipse at center, rgba(134,239,172,0.18) 0%, rgba(0,0,0,0.3) 100%)`
              : petGlow
              ? `radial-gradient(ellipse at center, ${petGlow}18 0%, transparent 70%)`
              : "transparent",
            border: dragOverPet
              ? `2px dashed rgba(134,239,172,0.7)`
              : petGlow
              ? `2px solid ${petGlow}60`
              : "2px solid transparent",
            boxShadow: petGlow
              ? `0 0 50px ${petGlow}50, 0 0 100px ${petGlow}20`
              : dragOverPet
              ? `0 0 40px rgba(134,239,172,0.3)`
              : "none",
            animation: dragOverPet ? "puMDropHint 1.2s ease-in-out infinite" : undefined,
            "--glow": dragging ? itemColor(dragging.item) + "50" : "#86efac50",
          } as any}
        >
          {petTemplateId ? (
            <PetAnimator
              petTemplateId={petTemplateId}
              mode="idle"
              view="front"
              size={1000}
              className="w-full"
              style={{
                aspectRatio: "1/1",
                pointerEvents: "none",
                animation: petAnim === "bounce" ? "puMBounce 0.6s ease-out forwards" :
                           petAnim === "flash"  ? "puMFlash 0.5s ease-out forwards" : undefined,
              }}
            />
          ) : petImage ? (
            <img src={petImage} alt={petName} style={{ width: "85%", height: "85%", objectFit: "contain" }} />
          ) : (
            <img src={petPawIcon} alt="" style={{ width: "65%", height: "65%", objectFit: "contain", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.8))" }} />
          )}

          {/* Drop hint overlay */}
          {dragging && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ borderRadius: 20, background: "rgba(0,20,5,0.5)" }}>
              <div className="font-fantasy text-base tracking-widest font-bold" style={{ color: "#86efac", textShadow: "0 0 16px rgba(134,239,172,0.9)" }}>
                ✦ DROP HERE ✦
              </div>
            </div>
          )}

          {/* Rarity stars */}
          <div className="absolute bottom-2 flex gap-0.5 justify-center">
            {rarityStars.map(i => (
              <span key={i} style={{ fontSize: 13, color: "#fcd34d", textShadow: "0 0 8px rgba(252,211,77,0.8)" }}>★</span>
            ))}
          </div>
        </div>

        {/* Pet name + level */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="font-fantasy text-[13px] tracking-wider" style={{ color: "#fcd34d", textShadow: "0 0 12px rgba(252,211,77,0.4)" }}>{petName}</div>
          <div className="font-fantasy text-[10px] px-2 py-0.5 rounded-full" style={{ color: "#86efac", background: "rgba(10,30,12,0.8)", border: "1px solid rgba(134,239,172,0.3)" }}>Lv.{petLevel}</div>
        </div>

        {/* Stat bars */}
        <div
          className="mt-2 w-full px-1 flex flex-col gap-1.5"
          style={{ maxWidth: 300 }}
          data-testid="section-pet-stats"
        >
          {([
            { label: "ATK", value: petAtk,    color: "#f87171", rgb: "248,113,113", max: 200 },
            { label: "DEF", value: petDef,    color: "#60a5fa", rgb: "96,165,250",  max: 200 },
            { label: "HP",  value: petHealth, color: "#4ade80", rgb: "74,222,128",  max: 2500 },
          ] as const).map(({ label, value, color, rgb, max }) => {
            const pct = Math.min(100, Math.round((value / max) * 100));
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="font-fantasy text-[10px] font-bold tracking-widest w-7 text-right flex-shrink-0"
                  style={{ color, textShadow: `0 0 8px rgba(${rgb},0.6)` }}
                >
                  {label}
                </span>
                <div
                  className="flex-1 rounded-full overflow-hidden"
                  style={{ height: 7, background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.25)` }}
                >
                  <div
                    data-testid={`bar-stat-${label.toLowerCase()}`}
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, rgba(${rgb},0.55) 0%, rgba(${rgb},1) 100%)`,
                      boxShadow: `0 0 6px rgba(${rgb},0.7)`,
                      borderRadius: "9999px",
                      transition: "width 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                  />
                </div>
                <span
                  className="font-fantasy text-[10px] tabular-nums w-10 flex-shrink-0"
                  style={{ color: `rgba(${rgb},0.9)`, textShadow: `0 0 6px rgba(${rgb},0.4)` }}
                  data-testid={`text-stat-${label.toLowerCase()}`}
                >
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Item grid ── */}
      <div className="relative z-[10] flex-1 min-h-0 overflow-y-auto px-3 pb-6" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(134,239,172,0.3) transparent" }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <img src={powerupBagIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />
            {showBuyButton && (
              <p className="font-fantasy text-[#86efac] text-sm text-center" style={{ textShadow: "0 0 8px rgba(134,239,172,0.3)" }}>You have no power-up items!</p>
            )}
            {showBuyButton && (
              <button
                data-testid="button-buy-powerups"
                onClick={() => {
                  onClose();
                  setTimeout(() => {
                    window.location.href = "/world/swamp?shopHint=a1b2c3d4-0004-4000-8000-000000000004";
                  }, 120);
                }}
                style={{
                  background: "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)",
                  border: "1px solid rgba(100,220,100,0.6)",
                  color: "#dcfce7",
                  fontFamily: "Lora, serif",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  borderRadius: 8,
                  padding: "8px 22px",
                  boxShadow: "0 0 12px rgba(60,180,60,0.4)",
                }}
              >
                Buy Power Ups
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Instruction strip */}
            <div className="flex items-center justify-center gap-2 mb-3 py-2 rounded-lg"
              style={{ background: "rgba(10,25,12,0.7)", border: "1px solid rgba(134,239,172,0.15)" }}>
              <span style={{ fontSize: 13, color: "#86efac" }}>✦</span>
              <p className="font-fantasy text-[#86efac] text-[11px] tracking-wider">
                Drag an item onto your pet to use it
              </p>
              <span style={{ fontSize: 13, color: "#86efac" }}>✦</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {items.map((item, idx) => {
                const color   = itemColor(item);
                const label   = itemLabel(item);
                const isSlotItem = item.type !== "special" && item.statBoostType !== "lvl";
                const locked  = isSlotItem && itemsRemaining !== Infinity && itemsRemaining <= 0;
                return (
                  <div
                    key={item.inventoryId}
                    data-testid={`item-powerup-${item.inventoryId}`}
                    style={{ animation: `puMItemPop 0.3s ${idx * 0.04}s ease-out both`, touchAction: "none" }}
                  >
                    <div
                      onPointerDown={locked || isPending ? undefined : (e) => handleItemPointerDown(e, item)}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      onPointerCancel={handleItemPointerUp}
                      className="relative rounded-xl flex flex-col items-center gap-1.5 select-none overflow-hidden"
                      style={{
                        cursor: locked || isPending ? "not-allowed" : "grab",
                        userSelect: "none",
                        opacity: locked ? 0.45 : 1,
                        padding: "10px 8px 8px",
                        background: `linear-gradient(160deg, rgba(8,22,10,0.95) 0%, rgba(12,28,14,0.95) 100%)`,
                        border: `1.5px solid ${locked ? "rgba(80,60,30,0.4)" : color + "55"}`,
                        boxShadow: locked ? "none" : `0 2px 12px ${color}20, inset 0 1px 0 rgba(255,255,255,0.04)`,
                      }}
                    >
                      {/* Item image */}
                      <div className="relative w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                        style={{ background: `radial-gradient(circle, ${color}22 0%, rgba(8,20,10,0.8) 100%)`, border: `1px solid ${color}40` }}>
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-0.5" />
                          : <img src={powerupBagIcon} alt="" className="w-full h-full object-contain p-1" />
                        }
                      </div>

                      {/* Name */}
                      <span className="relative font-fantasy text-[9px] tracking-wide text-center leading-tight w-full truncate"
                        style={{ color: "#d4b896" }}>
                        {item.name}
                      </span>

                      {/* Stat badge */}
                      <span className="relative font-fantasy text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full"
                        style={{ background: `${color}22`, color, border: `1px solid ${color}55`, textShadow: `0 0 8px ${color}80` }}>
                        {label}
                      </span>

                      {/* Locked indicator */}
                      {locked && (
                        <div className="relative w-full py-1.5 rounded-lg font-fantasy text-[10px] tracking-widest font-bold text-center"
                          style={{ background: "rgba(40,30,15,0.7)", border: "1px solid rgba(80,60,20,0.4)", color: "#4a4030" }}>
                          LOCKED
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Floating drag ghost ── */}
      {dragging && (
        <div
          className="fixed pointer-events-none z-[300] rounded-xl flex flex-col items-center gap-1.5"
          style={{
            left: dragging.x, top: dragging.y,
            transform: "translate(-50%, -50%)",
            background: `linear-gradient(160deg, rgba(8,22,10,0.97) 0%, rgba(12,30,14,0.97) 100%)`,
            border: `2px solid ${itemColor(dragging.item)}`,
            boxShadow: `0 0 24px ${itemColor(dragging.item)}80, 0 0 48px ${itemColor(dragging.item)}30`,
            width: 76,
            padding: "8px 6px 6px",
            animation: "puMFloatCard 0.6s ease-in-out infinite",
          }}
        >
          {dragging.item.imageUrl
            ? <img src={dragging.item.imageUrl} alt={dragging.item.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
            : <img src={powerupBagIcon} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
          }
          <span className="font-fantasy text-[9px] text-center leading-tight w-full font-bold" style={{ color: itemColor(dragging.item), textShadow: `0 0 8px ${itemColor(dragging.item)}` }}>
            {itemLabel(dragging.item)}
          </span>
        </div>
      )}

      {/* ── Sparkle burst ── */}
      {sparkles.map(s => (
        <div
          key={s.id}
          className="fixed pointer-events-none z-[250] rounded-full"
          style={{
            left: s.x, top: s.y,
            width: 8, height: 8,
            background: s.color,
            boxShadow: `0 0 8px ${s.color}`,
            ["--sx" as any]: `${Math.cos(s.angle * Math.PI / 180) * (60 + Math.random() * 60)}px`,
            ["--sy" as any]: `${Math.sin(s.angle * Math.PI / 180) * (60 + Math.random() * 60)}px`,
            animation: "puMSparkle 0.65s ease-out forwards",
          }}
        />
      ))}
    </div>
  );
}
