import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import PetAnimator from "@/components/PetAnimator";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";

// ── Inline success-animation configs (mirrors PowerUpOverlay) ──────────────
const EFFECT_CONFIGS = {
  stat:  { color: "#4ade80", rgb: "74,222,128",  icon: "💪", title: "POWER UP!", particleColors: ["#4ade80","#86efac","#bbf7d0","#22c55e","#fff"] },
  level: { color: "#f0c040", rgb: "240,192,64",  icon: "⭐", title: "LEVEL UP!",  particleColors: ["#f0c040","#fbbf24","#fde68a","#fcd34d","#fff"] },
  hatch: { color: "#38bdf8", rgb: "56,189,248",  icon: "⏰", title: "SPEED UP!",  particleColors: ["#38bdf8","#7dd3fc","#bae6fd","#0ea5e9","#c4b5fd"] },
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
  itemsRemaining: number;
  items: PowerUpItem[];
  isPending: boolean;
  title?: string;
  subtitle?: string;
  successEffect?: { type: "stat" | "level" | "hatch"; label: string } | null;
  onUseItem: (item: PowerUpItem) => void;
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

    // Shimmer overtone
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
    case "lvl":    return `+${amt} LVL`;
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
  petLevel, itemsRemaining, items, isPending,
  title = "POWER UP", subtitle,
  successEffect,
  onUseItem, onClose,
}: PetPowerUpModalProps) {
  const petZoneRef    = useRef<HTMLDivElement>(null);
  const draggingRef   = useRef<{ item: PowerUpItem; x: number; y: number } | null>(null);

  const [dragging,    setDragging]    = useState<{ item: PowerUpItem; x: number; y: number } | null>(null);
  const [dragOverPet, setDragOverPet] = useState(false);
  const [petAnim,     setPetAnim]     = useState<"none" | "bounce" | "flash">("none");
  const [petGlow,     setPetGlow]     = useState<string | null>(null);
  const [sparkles,    setSparkles]    = useState<{ id: number; x: number; y: number; color: string; angle: number }[]>([]);
  const sparkIdRef = useRef(0);

  // Keep dragging ref synced
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  // Auto-close after animation completes when a success effect fires
  useEffect(() => {
    if (!successEffect) return;
    const t = setTimeout(onClose, ANIM_DURATION);
    return () => clearTimeout(t);
  }, [successEffect, onClose]);

  // Pre-generate particles for the inline animation (stable across renders)
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

    // Pet reaction: bounce + glow + sparkle burst
    setPetGlow(color);
    setPetAnim("bounce");
    setTimeout(() => { setPetAnim("flash"); }, 300);
    setTimeout(() => { setPetAnim("none"); setPetGlow(null); }, 900);

    // Sparkle burst from pet zone center
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

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(6px)", paddingTop: "8%" }}
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
          0%,100%{ transform:scale(1); box-shadow: 0 0 24px var(--glow); }
          50%    { transform:scale(1.03); box-shadow: 0 0 48px var(--glow); }
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
      `}</style>

      {/* ── Inline success animation — shown after item use, while modal stays open ── */}
      {successEffect && animCfg && (
        <div
          className="absolute inset-0 z-[50] pointer-events-none overflow-hidden flex items-center justify-center"
          style={{ animation: `puMOverlayFade ${ANIM_DURATION}ms ease-out forwards` }}
        >
          {/* Colour wash */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse at center, rgba(${animCfg.rgb},0.18) 0%, rgba(0,0,0,0.5) 100%)`,
          }} />
          {/* Flash */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(circle at center, rgba(${animCfg.rgb},0.45) 0%, transparent 65%)`,
            animation: "puMFlash 0.5s ease-out forwards",
          }} />
          {/* Expanding rings */}
          {[0, 0.15, 0.3].map((delay, i) => (
            <div key={i} className="absolute rounded-full" style={{
              width: 60, height: 60,
              border: `3px solid rgba(${animCfg.rgb},${0.9 - i * 0.2})`,
              animation: `puMRingExpand 1.3s ${delay}s ease-out forwards`,
              opacity: 0,
            }} />
          ))}
          {/* Rays */}
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="absolute" style={{
              width: 2, height: 220,
              background: `linear-gradient(to bottom, transparent 0%, rgba(${animCfg.rgb},0.6) 40%, rgba(${animCfg.rgb},0.3) 70%, transparent 100%)`,
              ["--r" as any]: `${i * 36}deg`,
              transform: `rotate(${i * 36}deg)`,
              animation: `puMRayFade 1.0s ${i * 0.05}s ease-out forwards`,
              opacity: 0,
            }} />
          ))}
          {/* Particles */}
          {animParticles.map((p, i) => (
            <div key={i} className="absolute rounded-full" style={{
              width: p.size, height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              ["--px" as any]: `${p.px}px`,
              ["--py" as any]: `${p.py}px`,
              animation: `puMParticle 1.1s ${p.delay}s ease-out forwards`,
              opacity: 0,
            }} />
          ))}
          {/* Stars */}
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const d = 55 + Math.random() * 50;
            return (
              <div key={`star-${i}`} className="absolute font-bold" style={{
                fontSize: 12 + Math.random() * 10,
                color: animCfg.particleColors[i % animCfg.particleColors.length],
                left: `calc(50% + ${Math.cos(a) * d}px)`,
                top:  `calc(50% + ${Math.sin(a) * d}px)`,
                animation: `puMStar 1.2s ${i * 0.07}s ease-out forwards`,
                opacity: 0,
                transform: "translate(-50%,-50%)",
                filter: `drop-shadow(0 0 6px ${animCfg.color})`,
              }}>✦</div>
            );
          })}
          {/* Center content */}
          <div className="relative flex flex-col items-center gap-3 z-10" style={{ animation: "puMContentPop 0.6s ease-out both" }}>
            <div style={{ fontSize: 72, lineHeight: 1, filter: `drop-shadow(0 0 20px rgba(${animCfg.rgb},0.9))` }}>
              {animCfg.icon}
            </div>
            <div className="font-fantasy text-4xl font-bold tracking-wider"
              data-testid="text-power-up-success"
              style={{ color: animCfg.color, textShadow: `0 0 24px rgba(${animCfg.rgb},1), 0 0 48px rgba(${animCfg.rgb},0.5)` }}>
              {successEffect.label}
            </div>
            <div className="font-fantasy text-sm tracking-[0.3em] uppercase"
              style={{ color: `rgba(${animCfg.rgb},0.8)`, textShadow: `0 0 12px rgba(${animCfg.rgb},0.6)` }}>
              {animCfg.title}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
        <div>
          <h2 className="font-fantasy text-[#f0c040] text-base tracking-widest">{title}</h2>
          <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider mt-0.5">
            {subtitle ?? `Drag an item onto ${petName} · or tap to use`}
          </p>
        </div>
        <button
          data-testid="button-close-powerup-modal"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
          style={{ background: "rgba(90,50,10,0.8)", border: "1px solid rgba(212,160,23,0.5)", color: "#f0c040", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Pet display zone */}
      <div className="flex flex-col items-center flex-shrink-0 pb-3 relative">
        {/* Slots remaining */}
        <div className="mb-2 px-3 py-1 rounded-full font-fantasy text-[10px] tracking-wider"
          style={{
            background: itemsRemaining === Infinity ? "rgba(240,192,64,0.12)" : itemsRemaining > 0 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${itemsRemaining === Infinity ? "rgba(240,192,64,0.3)" : itemsRemaining > 0 ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            color: itemsRemaining === Infinity ? "#f0c040" : itemsRemaining > 0 ? "#4ade80" : "#f87171",
          }}>
          {itemsRemaining === Infinity
            ? "No use limit — use as many as you want!"
            : itemsRemaining > 0
              ? `${itemsRemaining} power-up slot${itemsRemaining === 1 ? "" : "s"} remaining`
              : "No slots — level up first!"}
        </div>

        {/* Pet zone — the drop target */}
        <div
          ref={petZoneRef}
          data-testid="zone-pet-drop"
          className="relative flex items-center justify-center rounded-2xl transition-all duration-200"
          style={{
            width: 240, height: 240,
            background: dragOverPet
              ? `radial-gradient(ellipse at center, rgba(${dragging ? itemColor(dragging.item).replace("#","") : "240,192,64"},0.25) 0%, rgba(0,0,0,0.6) 100%)`
              : "radial-gradient(ellipse at center, rgba(45,122,79,0.18) 0%, rgba(0,0,0,0.5) 100%)",
            border: dragOverPet
              ? `2px solid ${dragging ? itemColor(dragging.item) : "#f0c040"}`
              : `2px solid rgba(127,255,212,${petAnim !== "none" ? "0.9" : "0.25"})`,
            boxShadow: petGlow
              ? `0 0 40px ${petGlow}80, 0 0 80px ${petGlow}30`
              : dragOverPet
              ? `0 0 32px ${dragging ? itemColor(dragging.item) : "#f0c040"}60`
              : "0 0 20px rgba(45,122,79,0.15)",
            animation: dragOverPet ? "puMDropHint 1s ease-in-out infinite" : undefined,
            "--glow": dragging ? itemColor(dragging.item) + "60" : "#f0c04060",
          } as any}
        >
          {/* Pet image/animator */}
          <div
            style={{
              animation: petAnim === "bounce" ? "puMBounce 0.6s ease-out forwards" :
                         petAnim === "flash"  ? "puMFlash 0.5s ease-out forwards" : undefined,
            }}
          >
            {petTemplateId ? (
              <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={230} />
            ) : petImage ? (
              <img src={petImage} alt={petName} style={{ width: 220, height: 220, objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 110 }}>🐾</span>
            )}
          </div>

          {/* Drop hint overlay */}
          {dragging && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl pointer-events-none"
              style={{ background: "rgba(0,0,0,0.35)" }}>
              <div className="font-fantasy text-xs tracking-widest" style={{ color: itemColor(dragging.item), textShadow: `0 0 12px ${itemColor(dragging.item)}` }}>
                DROP HERE
              </div>
            </div>
          )}

          {/* Rarity stars */}
          <div className="absolute bottom-2 flex gap-0.5 justify-center">
            {rarityStars.map(i => (
              <span key={i} style={{ fontSize: 12, color: "#f0c040", textShadow: "0 0 6px rgba(240,192,64,0.7)" }}>★</span>
            ))}
          </div>
        </div>

        {/* Pet name */}
        <div className="mt-2 font-fantasy text-sm tracking-wider" style={{ color: "#f0c040" }}>{petName}</div>
        <div className="font-fantasy text-[10px]" style={{ color: "#a89878" }}>Lv.{petLevel}</div>
      </div>

      {/* Item grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ scrollbarWidth: "thin" }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <img src={powerupBagIcon} alt="" style={{ width: 80, height: 80, objectFit: "contain", filter: "drop-shadow(0 0 12px rgba(240,192,64,0.5))" }} />
            <p className="font-fantasy text-[#a89878] text-sm text-center">No power-up items in your bag</p>
            <p className="font-fantasy text-[#6a5840] text-[10px] text-center">Visit the shop to stock up!</p>
          </div>
        ) : (
          <>
            <p className="font-fantasy text-[#6a5840] text-[9px] tracking-widest text-center mb-3">
              DRAG ONTO PET — OR TAP TO USE
            </p>
            <div className="grid grid-cols-3 gap-3">
              {items.map((item, idx) => {
                const color   = itemColor(item);
                const label   = itemLabel(item);
                const isSlotItem = item.type !== "special" && item.statBoostType !== "lvl";
                const locked  = isSlotItem && itemsRemaining !== Infinity && itemsRemaining <= 0;
                return (
                  <div
                    key={item.inventoryId}
                    data-testid={`item-powerup-${item.inventoryId}`}
                    style={{
                      animation: `puMItemPop 0.3s ${idx * 0.04}s ease-out both`,
                      opacity: locked ? 0.4 : 1,
                      touchAction: "none",
                    }}
                  >
                    {/* Draggable handle */}
                    <div
                      onPointerDown={locked || isPending ? undefined : (e) => handleItemPointerDown(e, item)}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      onPointerCancel={handleItemPointerUp}
                      className="rounded-xl p-3 flex flex-col items-center gap-1.5 select-none"
                      style={{
                        background: `radial-gradient(ellipse at 50% 0%, ${color}18 0%, rgba(20,10,5,0.95) 100%)`,
                        border: `1px solid ${color}40`,
                        boxShadow: `0 0 12px ${color}15`,
                        cursor: locked || isPending ? "not-allowed" : "grab",
                        userSelect: "none",
                      }}
                    >
                      {/* Item image */}
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden"
                        style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                          : <img src={powerupBagIcon} alt="" className="w-full h-full object-contain" />
                        }
                      </div>

                      {/* Name */}
                      <span className="font-fantasy text-[9px] tracking-wider text-center leading-tight w-full truncate"
                        style={{ color: "#f0c040" }}>
                        {item.name}
                      </span>

                      {/* Stat badge */}
                      <span className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                        {label}
                      </span>

                      {/* Tap to use button */}
                      <button
                        data-testid={`button-tap-use-${item.inventoryId}`}
                        onClick={locked || isPending ? undefined : () => useItem(item)}
                        disabled={locked || isPending}
                        className="w-full mt-0.5 py-1 rounded-lg font-fantasy text-[8px] tracking-wider transition-transform active:scale-95 disabled:opacity-30"
                        style={{
                          background: locked ? "rgba(80,40,10,0.5)" : `linear-gradient(135deg, ${color}25, ${color}10)`,
                          border: `1px solid ${color}35`,
                          color: locked ? "#6a5840" : color,
                          cursor: locked ? "not-allowed" : "pointer",
                        }}
                      >
                        {locked ? "LOCKED" : isPending ? "..." : "USE"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Floating drag ghost */}
      {dragging && (
        <div
          className="fixed pointer-events-none z-[300] rounded-xl p-2 flex flex-col items-center gap-1"
          style={{
            left: dragging.x,
            top: dragging.y,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(ellipse at 50% 0%, ${itemColor(dragging.item)}30 0%, rgba(20,10,5,0.95) 100%)`,
            border: `2px solid ${itemColor(dragging.item)}`,
            boxShadow: `0 0 20px ${itemColor(dragging.item)}80`,
            width: 72,
            animation: "puMFloatCard 0.6s ease-in-out infinite",
          }}
        >
          {dragging.item.imageUrl
            ? <img src={dragging.item.imageUrl} alt={dragging.item.name} style={{ width: 40, height: 40, objectFit: "contain" }} />
            : <img src={powerupBagIcon} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
          }
          <span className="font-fantasy text-[8px] text-center leading-tight w-full" style={{ color: itemColor(dragging.item) }}>
            {itemLabel(dragging.item)}
          </span>
        </div>
      )}

      {/* Sparkle burst particles */}
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
