import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronUp, X, Eye, EyeOff, Loader2, Coins, Maximize2, Heart } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import heroBanner        from "@assets/hub_hero_banner.png";
import mascot            from "@assets/Photoroom_20260502_90936_AM_1777731667331.png";
import runeCircle        from "@assets/hub_rune_circle.png";
import eggsImg           from "@assets/hub_eggs.png";
import podiumImg         from "@assets/hub_podium.png";
import rankCrowns        from "@assets/hub_rank_crowns.png";
import iconBadges        from "@assets/admin_icon_badges.png";
import iconMap           from "@assets/nav_icon_map_nobg.png";
import hsPhone           from "@assets/hs_icon_phone.png";
import hsBrowser         from "@assets/hs_icon_browser.png";
import hsShare           from "@assets/hs_icon_share.png";
import hsPlus            from "@assets/hs_icon_plus.png";
import ss1               from "@assets/IMG_3026_1774876682518.jpeg";
import ss2               from "@assets/IMG_3028_1774876682518.jpeg";
import ss3               from "@assets/IMG_3029_1774876682518.png";
import ss4               from "@assets/IMG_3030_1774876682518.png";
import ss5               from "@assets/IMG_3031_1774876682518.jpeg";
import ss6               from "@assets/IMG_3032_1774876682518.jpeg";
import ss7               from "@assets/IMG_3035_1774876682518.jpeg";
import hsCheck           from "@assets/hs_icon_check.png";
import hsGlobe           from "@assets/hs_icon_globe.png";
import hsMenu            from "@assets/hs_icon_menu.png";

import worldEnchanted    from "@assets/bg_enchanted_grove_map.png";
import worldHaunted      from "@assets/bg_haunted_woods_map.png";
import worldDesert       from "@assets/bg_desert_map.png";
import worldSky          from "@assets/bg_sky_realm_map.png";
import worldIsland       from "@assets/bg_island_map.png";
import worldSwamp        from "@assets/bg_swamp_map.png";
import worldVolcanic     from "@assets/bg_volcanic_map.png";
import worldSnowy        from "@assets/bg_snowy_mountain_map.png";
import DailyClaimCard from "@/components/DailyClaimCard";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const WORLDS = [
  { name: "Enchanted Grove",  img: worldEnchanted,  color: "#1a7a50" },
  { name: "Haunted Woods",    img: worldHaunted,     color: "#6a3a8a" },
  { name: "Sky Realm",        img: worldSky,         color: "#2a60a0" },
  { name: "Desert Sands",     img: worldDesert,      color: "#b07020" },
  { name: "Island Paradise",  img: worldIsland,      color: "#1a8a70" },
  { name: "Volcanic Crater",  img: worldVolcanic,    color: "#c04020" },
  { name: "Swamp Hollow",     img: worldSwamp,       color: "#3a6030" },
  { name: "Snowy Peak",       img: worldSnowy,       color: "#4a7090" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Star field background
// ─────────────────────────────────────────────────────────────────────────────
function StarField() {
  const stars = Array.from({ length: 70 }, (_, i) => ({
    id: i,
    x: Math.abs(Math.sin(i * 137.508) * 100),
    y: Math.abs(Math.cos(i * 97.3)    * 100),
    size: ((i % 3) + 1) * 0.65,
    opacity: 0.12 + (i % 6) * 0.06,
    dur: 2.5 + (i % 4) * 0.8,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            background: "#a5f3fc", opacity: s.opacity,
            animation: `pp-glow-pulse ${s.dur}s ease-in-out infinite alternate`,
          }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────────────────────────────────────
function RuneDivider() {
  return (
    <div className="flex items-center justify-center gap-4 my-10">
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(127,191,176,0.2))" }} />
      <img src={runeCircle} alt="" className="w-8 h-8 object-contain opacity-40"
        style={{ filter: "drop-shadow(0 0 6px rgba(127,191,176,0.5))" }} />
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,rgba(127,191,176,0.2),transparent)" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gameplay screenshots showcase
// ─────────────────────────────────────────────────────────────────────────────
const SCREENSHOTS = [
  { img: ss1, label: "Your Pet",    accent: "#7fbfb0", tilt: -3,  pos: "top center" },
  { img: ss7, label: "Epic Battles",accent: "#bf6aaa", tilt:  2,  pos: "top center" },
  { img: ss2, label: "Open World",  accent: "#4a9b6a", tilt: -2,  pos: "top center" },
  { img: ss3, label: "Companions",  accent: "#9b7abf", tilt:  3,  pos: "top center" },
  { img: ss4, label: "Fishing",     accent: "#4a8aab", tilt: -1,  pos: "top center" },
  { img: ss6, label: "Aquarium",    accent: "#4a6abf", tilt:  2,  pos: "top center" },
  { img: ss5, label: "Fish Book",   accent: "#4a9b7a", tilt: -2,  pos: "top center" },
];

const SS_FRAME_W  = 118;
const SS_FRAME_H  = 210;
const SS_GAP      = 22;
const SS_STEP     = SS_FRAME_W + SS_GAP;
const SS_INTERVAL = 3400;

function GameplayShowcase() {
  const [activeIdx, setActiveIdx]   = useState(0);
  const [lightbox, setLightbox]     = useState<number | null>(null);
  const [containerW, setContainerW] = useState(360);
  const containerRef  = useRef<HTMLDivElement>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const ptrStartX     = useRef<number | null>(null);
  const ptrStartY     = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerW(containerRef.current.offsetWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const restartTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % SCREENSHOTS.length);
    }, SS_INTERVAL);
  }, []);

  useEffect(() => {
    restartTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [restartTimer]);

  const goTo = useCallback((idx: number) => {
    setActiveIdx(((idx % SCREENSHOTS.length) + SCREENSHOTS.length) % SCREENSHOTS.length);
    restartTimer();
  }, [restartTimer]);

  // Translate strip so activeIdx is always centred in the container
  const stripOffset = containerW / 2 - (activeIdx * SS_STEP + SS_FRAME_W / 2);

  const onPtrDown = (e: React.PointerEvent) => {
    ptrStartX.current = e.clientX;
    ptrStartY.current = e.clientY;
  };
  const onPtrUp = (e: React.PointerEvent) => {
    if (ptrStartX.current === null) return;
    const dx = e.clientX - ptrStartX.current;
    const dy = e.clientY - (ptrStartY.current ?? e.clientY);
    ptrStartX.current = null;
    ptrStartY.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) goTo(activeIdx + (dx < 0 ? 1 : -1));
  };

  return (
    <div className="mb-2" data-testid="gameplay-showcase">
      <h2
        className="font-fantasy text-center text-sm tracking-widest mb-1"
        style={{ color: "#7fbfb0", textShadow: "0 0 12px rgba(127,191,176,0.3)" }}
      >
        See It in Action
      </h2>
      <p className="font-fantasy text-center text-[10px] mb-5" style={{ color: "#2a4a38" }}>
        Real gameplay — tap to view full screen
      </p>

      {/* ── Carousel strip ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{ overflow: "hidden", position: "relative", touchAction: "none" }}
        onPointerDown={onPtrDown}
        onPointerUp={onPtrUp}
        onPointerLeave={() => { ptrStartX.current = null; }}
      >
        <div
          style={{
            display: "flex",
            gap: SS_GAP,
            transform: `translateX(${stripOffset}px)`,
            transition: "transform 0.52s cubic-bezier(0.25,0.46,0.45,0.94)",
            willChange: "transform",
            paddingTop: 14,
            paddingBottom: 28,
          }}
        >
          {SCREENSHOTS.map((sc, i) => {
            const active = i === activeIdx;
            return (
              <div
                key={sc.label}
                data-testid={`screenshot-card-${i}`}
                onClick={() => active ? setLightbox(i) : goTo(i)}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  opacity: active ? 1 : 0.38,
                  transform: `scale(${active ? 1 : 0.86}) rotate(${active ? 0 : sc.tilt}deg)`,
                  transition: "opacity 0.42s ease, transform 0.42s ease",
                  cursor: active ? "zoom-in" : "pointer",
                  userSelect: "none",
                }}
              >
                {/* Phone frame */}
                <div
                  style={{
                    width: SS_FRAME_W,
                    height: SS_FRAME_H,
                    borderRadius: 20,
                    overflow: "hidden",
                    border: `2px solid ${active ? sc.accent + "88" : sc.accent + "28"}`,
                    boxShadow: active
                      ? [`0 0 24px ${sc.accent}32`, `0 0 2px ${sc.accent}66`, "0 14px 36px rgba(0,0,0,0.72)", "inset 0 0 0 1px rgba(255,255,255,0.04)"].join(", ")
                      : "0 6px 18px rgba(0,0,0,0.4)",
                    background: "#04080c",
                    position: "relative",
                    transition: "border-color 0.42s, box-shadow 0.42s",
                  }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg,transparent,${sc.accent}18,transparent)`, zIndex: 2 }} />
                  <img
                    src={sc.img}
                    alt={sc.label}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                  />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "linear-gradient(to top,rgba(4,8,12,0.5),transparent)", zIndex: 2 }} />
                  {/* Zoom hint */}
                  {active && (
                    <div style={{ position: "absolute", bottom: 9, right: 9, zIndex: 3, width: 24, height: 24, borderRadius: "50%", background: "rgba(4,8,12,0.75)", border: `1px solid ${sc.accent}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Maximize2 size={10} color={sc.accent} />
                    </div>
                  )}
                </div>

                {/* Label */}
                <span
                  className="font-fantasy text-[9px] tracking-widest"
                  style={{
                    color: active ? sc.accent : "#1a3028",
                    textShadow: active ? `0 0 8px ${sc.accent}55` : "none",
                    transition: "color 0.42s, text-shadow 0.42s",
                    letterSpacing: "0.18em",
                  }}
                >
                  {sc.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Dot indicators ─────────────────────────────────────────────────── */}
      <div className="flex justify-center gap-1.5 mt-0">
        {SCREENSHOTS.map((sc, i) => (
          <button
            key={i}
            data-testid={`gallery-dot-${i}`}
            onClick={() => goTo(i)}
            style={{
              width: i === activeIdx ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background: i === activeIdx ? sc.accent : "rgba(127,191,176,0.15)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.38s ease, background 0.38s ease",
            }}
          />
        ))}
      </div>

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightbox !== null && (() => {
        const ls = SCREENSHOTS[lightbox];
        return (
          <div
            data-testid="lightbox-overlay"
            onClick={() => setLightbox(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 10000,
              background: "rgba(3,6,10,0.93)",
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: "92vw" }}
            >
              <img
                src={ls.img}
                alt={ls.label}
                data-testid="lightbox-image"
                style={{
                  maxWidth: "100%",
                  maxHeight: "78vh",
                  objectFit: "contain",
                  borderRadius: 26,
                  border: `2px solid ${ls.accent}50`,
                  boxShadow: `0 0 70px ${ls.accent}28, 0 28px 80px rgba(0,0,0,0.92)`,
                  display: "block",
                }}
              />
              <span className="font-fantasy text-sm tracking-widest" style={{ color: ls.accent, textShadow: `0 0 10px ${ls.accent}55` }}>
                {ls.label}
              </span>

              {/* Prev / Next */}
              <div style={{ display: "flex", gap: 12, position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)" }}>
                <button
                  data-testid="lightbox-prev"
                  onClick={() => setLightbox(i => i !== null ? ((i - 1 + SCREENSHOTS.length) % SCREENSHOTS.length) : null)}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(6,10,16,0.85)", border: `1px solid ${ls.accent}40`, color: ls.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <ChevronDown size={16} style={{ transform: "rotate(90deg)" }} />
                </button>
                <button
                  data-testid="lightbox-next"
                  onClick={() => setLightbox(i => i !== null ? ((i + 1) % SCREENSHOTS.length) : null)}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(6,10,16,0.85)", border: `1px solid ${ls.accent}40`, color: ls.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <ChevronDown size={16} style={{ transform: "rotate(-90deg)" }} />
                </button>
              </div>

              {/* Close */}
              <button
                data-testid="button-close-lightbox"
                onClick={() => setLightbox(null)}
                style={{ position: "absolute", top: -14, right: -14, width: 34, height: 34, borderRadius: "50%", background: "rgba(6,10,16,0.92)", border: "1px solid rgba(127,191,176,0.22)", color: "#7fbfb0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add to Homescreen modal
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreenModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const IOS_STEPS = [
    { img: hsBrowser, title: "Open in Safari", desc: "Open parapets.net in Safari — it must be Safari, not Chrome or another browser." },
    { img: hsShare,   title: "Tap the Share button", desc: "At the bottom of the screen, tap the box with an arrow pointing up." },
    { img: hsPlus,    title: '"Add to Home Screen"', desc: 'Scroll down the share sheet and tap "Add to Home Screen".' },
    { img: hsCheck,   title: "Tap Add", desc: 'Tap "Add" in the top-right corner. Para Pets will appear on your home screen.' },
  ];

  const ANDROID_STEPS = [
    { img: hsGlobe,   title: "Open in Chrome", desc: "Go to parapets.net in Chrome — make sure you're using Chrome on your Android device." },
    { img: hsMenu,    title: "Tap the menu", desc: "Tap the three-dot menu (⋮) in the top-right corner of Chrome." },
    { img: hsPlus,    title: '"Add to Home Screen"', desc: 'Tap "Add to Home Screen" or "Install App" from the menu.' },
    { img: hsCheck,   title: "Tap Add", desc: 'Confirm by tapping "Add". The Para Pets icon will appear on your home screen.' },
  ];

  const steps = tab === "ios" ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 99999, background: "rgba(4,6,12,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="homescreen-modal-backdrop"
    >
      <div
        className="w-full rounded-t-3xl overflow-hidden"
        style={{
          maxWidth: 480, margin: "0 auto",
          background: "linear-gradient(160deg,rgba(8,16,22,0.99),rgba(5,11,8,0.99))",
          border: "1px solid rgba(127,191,176,0.18)",
          borderBottom: "none",
          boxShadow: "0 -8px 60px rgba(34,211,238,0.07), 0 -4px 32px rgba(0,0,0,0.7)",
        }}
        data-testid="homescreen-modal"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(127,191,176,0.2)" }} />
        </div>

        {/* Header */}
        <div className="relative flex flex-col items-center px-6 pt-3 pb-4"
          style={{ borderBottom: "1px solid rgba(127,191,176,0.07)" }}>
          <img src={hsPhone} alt="" className="w-10 h-10 object-contain"
            style={{ filter: "drop-shadow(0 0 10px rgba(127,191,176,0.5))" }} />
          <h2 className="font-fantasy text-base tracking-widest mt-1" style={{ color: "#7fbfb0" }}>
            Add to Home Screen
          </h2>
          <p className="font-fantasy text-[10px] mt-0.5 text-center" style={{ color: "#2a5040" }}>
            Play Para Pets like a native app — no app store needed
          </p>
          <button data-testid="button-close-homescreen-modal" onClick={onClose}
            className="absolute top-4 right-5 rounded-full p-1.5"
            style={{ background: "rgba(127,191,176,0.08)", color: "#3a6050" }}>
            <X size={16} />
          </button>
        </div>

        {/* OS tabs */}
        <div className="flex gap-2 px-6 pt-4">
          {(["ios", "android"] as const).map(t => (
            <button
              key={t}
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
              className="flex-1 rounded-xl py-2.5 font-fantasy text-xs tracking-widest transition-all"
              style={{
                background: tab === t
                  ? "linear-gradient(135deg,rgba(127,191,176,0.18),rgba(26,155,112,0.15))"
                  : "rgba(127,191,176,0.04)",
                border: tab === t
                  ? "1px solid rgba(127,191,176,0.35)"
                  : "1px solid rgba(127,191,176,0.08)",
                color: tab === t ? "#7fbfb0" : "#2a5040",
              }}>
              {t === "ios" ? "iPhone / iPad" : "Android"}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="px-6 py-5 flex flex-col gap-3 pb-10">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3"
              data-testid={`homescreen-step-${tab}-${i}`}>
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(127,191,176,0.07)", border: "1px solid rgba(127,191,176,0.12)" }}>
                <img src={s.img} alt="" className="w-6 h-6 object-contain"
                  style={{ filter: "drop-shadow(0 0 6px rgba(127,191,176,0.4))" }} />
              </div>
              <div className="flex-1 pt-0.5">
                <p className="font-fantasy text-xs tracking-wide" style={{ color: "#7fbfb0" }}>{s.title}</p>
                <p className="font-fantasy text-[10px] leading-relaxed mt-0.5" style={{ color: "#2a4a38" }}>{s.desc}</p>
              </div>
              <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-1"
                style={{ background: "rgba(127,191,176,0.07)", border: "1px solid rgba(127,191,176,0.1)" }}>
                <span className="font-fantasy text-[9px]" style={{ color: "#2a5040" }}>{i + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Egg showcase carousel (public, no names)
// ─────────────────────────────────────────────────────────────────────────────
const EGG_SIZE  = 130;
const EGG_GAP   = 18;
const EGG_STEP  = EGG_SIZE + EGG_GAP;
const EGG_INTERVAL = 2600;

function EggShowcase() {
  const { data: eggs = [] } = useQuery<{ id: string; eggImageUrl: string }[]>({
    queryKey: ["/api/public/eggs"],
    staleTime: 300_000,
    retry: false,
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [containerW, setContainerW] = useState(360);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const ptrStartX    = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => { if (containerRef.current) setContainerW(containerRef.current.offsetWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const restartTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (eggs.length < 2) return;
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % eggs.length);
    }, EGG_INTERVAL);
  }, [eggs.length]);

  useEffect(() => {
    restartTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [restartTimer]);

  const goTo = useCallback((idx: number) => {
    setActiveIdx(((idx % (eggs.length || 1)) + (eggs.length || 1)) % (eggs.length || 1));
    restartTimer();
  }, [eggs.length, restartTimer]);

  if (eggs.length === 0) return null;

  const stripOffset = containerW / 2 - (activeIdx * EGG_STEP + EGG_SIZE / 2);

  return (
    <div className="mb-2" data-testid="egg-showcase">
      <h2 className="font-fantasy text-center text-sm tracking-widest mb-1"
        style={{ color: "#7fbfb0", textShadow: "0 0 12px rgba(127,191,176,0.3)" }}>
        Eggs of the Realm
      </h2>
      <p className="font-fantasy text-center text-[10px] mb-4" style={{ color: "#2a4a38" }}>
        What mysteries lie within?
      </p>

      <div
        ref={containerRef}
        style={{ overflow: "hidden", position: "relative", touchAction: "none" }}
        onPointerDown={e => { ptrStartX.current = e.clientX; }}
        onPointerUp={e => {
          if (ptrStartX.current === null) return;
          const dx = e.clientX - ptrStartX.current;
          ptrStartX.current = null;
          if (Math.abs(dx) > 24) goTo(activeIdx + (dx < 0 ? 1 : -1));
        }}
        onPointerLeave={() => { ptrStartX.current = null; }}
      >
        <div style={{
          display: "flex", gap: EGG_GAP,
          transform: `translateX(${stripOffset}px)`,
          transition: "transform 0.48s cubic-bezier(0.25,0.46,0.45,0.94)",
          willChange: "transform",
          paddingTop: 18, paddingBottom: 28,
        }}>
          {eggs.map((egg, i) => {
            const active = i === activeIdx;
            return (
              <div
                key={egg.id}
                data-testid={`egg-card-${i}`}
                onClick={() => !active && goTo(i)}
                style={{
                  flexShrink: 0,
                  width: EGG_SIZE, height: EGG_SIZE,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 20,
                  background: active ? "rgba(127,191,176,0.07)" : "rgba(10,18,14,0.5)",
                  border: `1.5px solid ${active ? "rgba(127,191,176,0.35)" : "rgba(127,191,176,0.08)"}`,
                  boxShadow: active ? "0 0 22px rgba(127,191,176,0.18), 0 6px 20px rgba(0,0,0,0.6)" : "0 3px 10px rgba(0,0,0,0.4)",
                  opacity: active ? 1 : 0.38,
                  transform: `scale(${active ? 1 : 0.82})`,
                  transition: "opacity 0.4s ease, transform 0.4s ease, border-color 0.4s, box-shadow 0.4s",
                  cursor: active ? "default" : "pointer",
                }}
              >
                <img
                  src={egg.eggImageUrl}
                  alt="Mystery Egg"
                  style={{ width: 92, height: 92, objectFit: "contain",
                    filter: active ? "drop-shadow(0 0 10px rgba(127,191,176,0.5))" : "none",
                    transition: "filter 0.4s" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-0">
        {eggs.map((_, i) => (
          <button
            key={i}
            data-testid={`egg-dot-${i}`}
            onClick={() => goTo(i)}
            style={{
              width: i === activeIdx ? 18 : 5, height: 5,
              borderRadius: 3,
              background: i === activeIdx ? "#7fbfb0" : "rgba(127,191,176,0.15)",
              border: "none", padding: 0, cursor: "pointer",
              transition: "width 0.35s ease, background 0.35s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in modal
// ─────────────────────────────────────────────────────────────────────────────
function SignInModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password, rememberMe: false });
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onSuccess();
    },
    onError: (err: any) => {
      const raw = err.message ?? "";
      const body = raw.includes(":") ? raw.split(": ").slice(1).join(": ") : raw;
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(body); } catch {}
      toast({ title: "Login Failed", description: parsed.message || "Invalid username or password", variant: "destructive" });
    },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5"
      style={{ zIndex: 99999, background: "rgba(4,6,12,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="signin-modal-backdrop"
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg,rgba(8,16,22,0.99) 0%,rgba(5,11,8,0.99) 100%)",
          border: "1px solid rgba(127,191,176,0.22)",
          boxShadow: "0 0 70px rgba(34,211,238,0.07), 0 24px 60px rgba(0,0,0,0.75)",
        }}
        data-testid="signin-modal"
      >
        <div className="relative flex flex-col items-center pt-8 pb-5 px-6"
          style={{ borderBottom: "1px solid rgba(127,191,176,0.07)" }}>
          <img src={mascot} alt="Para Pets" className="w-14 h-14 object-contain"
            style={{ filter: "drop-shadow(0 0 14px rgba(127,191,176,0.55))" }} />
          <h2 className="font-fantasy text-lg tracking-widest mt-2" style={{ color: "#7fbfb0", textShadow: "0 0 20px rgba(127,191,176,0.4)" }}>
            Welcome Back
          </h2>
          <p className="font-fantasy text-[10px] tracking-widest mt-0.5" style={{ color: "#2a5040" }}>
            Sign in to continue your journey
          </p>
          <button data-testid="button-close-signin-modal" onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5"
            style={{ background: "rgba(127,191,176,0.08)", color: "#3a6050" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#3a6050" }}>Username</label>
            <input data-testid="input-signin-username" type="text" value={username}
              onChange={e => setUsername(e.target.value)} placeholder="Your username"
              autoComplete="username" autoCapitalize="none"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: "rgba(127,191,176,0.05)", border: "1px solid rgba(127,191,176,0.16)", color: "#c8d8b0", fontFamily: "inherit" }}
              onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#3a6050" }}>Password</label>
            <div className="relative">
              <input data-testid="input-signin-password" type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Your password" autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none"
                style={{ background: "rgba(127,191,176,0.05)", border: "1px solid rgba(127,191,176,0.16)", color: "#c8d8b0", fontFamily: "inherit" }}
                onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }} />
              <button data-testid="button-toggle-password" type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#3a6050" }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button data-testid="button-signin-submit" onClick={() => loginMutation.mutate()}
            disabled={loginMutation.isPending || !username || !password}
            className="w-full rounded-xl py-3 font-fantasy text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#7fbfb0 0%,#1a9b70 100%)",
              color: "#060a10", opacity: (!username || !password) ? 0.5 : 1,
              boxShadow: loginMutation.isPending ? "none" : "0 0 22px rgba(127,191,176,0.3)",
            }}>
            {loginMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {loginMutation.isPending ? "Signing in..." : "Sign In"}
          </button>

          <div className="flex items-center justify-between">
            <Link href="/auth?mode=forgot" data-testid="link-forgot-password"
              className="font-fantasy text-[10px] tracking-wide" style={{ color: "#2a4a38" }}>
              Forgot password?
            </Link>
            <Link href="/auth?mode=register" data-testid="link-create-account"
              className="font-fantasy text-[10px] tracking-wide" style={{ color: "#7fbfb0" }}>
              Create account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ParaPetsHubPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const { toast }                   = useToast();

  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"], retry: false });

  const { data: team } = useQuery<{ id: string; username: string; profileImage: string | null; isAdmin: boolean; isModerator: boolean }[]>({
    queryKey: ["/api/team"],
    retry: false,
    staleTime: 60_000,
  });

  const handleSignInSuccess = () => {
    setShowSignIn(false);
    toast({ title: "Welcome back!", description: "You're now signed in. Hit Play Game to enter the realm." });
  };

  return (
    <>
      <div
        data-testid="para-pets-hub-page"
        className="fixed inset-0 overflow-y-auto"
        style={{
          zIndex: 9000,
          background: "#060a10",
          backgroundImage: [
            "radial-gradient(ellipse 90% 55% at 10% 5%,  rgba(48,20,80,0.6) 0%,transparent 55%)",
            "radial-gradient(ellipse 75% 50% at 90% 85%, rgba(10,65,50,0.5) 0%,transparent 55%)",
            "radial-gradient(ellipse 55% 40% at 55% 35%, rgba(20,90,75,0.12) 0%,transparent 50%)",
          ].join(","),
        }}
      >
        <StarField />

        {/* ── Sticky nav ────────────────────────────────────────────────────── */}
        <div className="sticky top-0 w-full" data-testid="hub-action-bar"
          style={{
            zIndex: 50,
            background: "rgba(6,10,16,0.9)",
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(127,191,176,0.07)",
            paddingTop: "env(safe-area-inset-top)",
          }}>
          <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={mascot} alt="Para Pets" className="w-6 h-6 object-contain opacity-80" />
              <span className="font-fantasy text-xs tracking-widest" style={{ color: "#2a5040", letterSpacing: "0.22em" }}>
                PARA PETS
              </span>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <span className="font-fantasy text-xs tracking-wide" style={{ color: "#7fbfb0" }}>
                  {user.username}
                </span>
              ) : (
                <button data-testid="button-hub-signin" onClick={() => setShowSignIn(true)}
                  className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                  style={{
                    color: "#7fbfb0", border: "1px solid rgba(127,191,176,0.25)",
                    borderRadius: 9999, padding: "7px 18px", background: "rgba(127,191,176,0.06)",
                  }}>
                  Sign In
                </button>
              )}
              <Link href={user ? "/" : "/auth"} data-testid="button-play-game"
                className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                style={{
                  color: "#060a10", borderRadius: 9999, padding: "8px 22px",
                  background: "linear-gradient(135deg,#7fbfb0 0%,#1a9b70 100%)",
                  boxShadow: "0 0 18px rgba(127,191,176,0.32), 0 2px 8px rgba(0,0,0,0.5)",
                  letterSpacing: "0.08em",
                }}>
                Play Game
              </Link>
            </div>
          </div>
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="relative w-full overflow-hidden" style={{ maxHeight: 400 }}>
          <img src={heroBanner} alt="Para Pets world" className="w-full object-cover"
            style={{ display: "block", maxHeight: 400, objectPosition: "center 30%",
              filter: "brightness(0.72) saturate(1.25)" }}
            data-testid="img-hub-hero" />
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom,rgba(6,10,16,0.5) 0%,transparent 20%,rgba(6,10,16,0.6) 70%,rgba(6,10,16,1) 100%)" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 px-5">
            <img src={mascot} alt="mascot" className="w-20 h-20 object-contain mb-3"
              style={{ filter: "drop-shadow(0 0 20px rgba(127,191,176,0.8)) drop-shadow(0 0 50px rgba(80,180,210,0.4))" }}
              data-testid="img-hub-mascot" />
            <h1 className="font-fantasy text-5xl tracking-widest text-center"
              style={{ color: "#fff", letterSpacing: "0.15em",
                textShadow: "0 0 40px rgba(127,191,176,0.65), 0 0 80px rgba(127,191,176,0.25), 0 4px 20px rgba(0,0,0,0.9)" }}
              data-testid="text-hub-title">
              Para Pets
            </h1>
            <p className="font-fantasy text-sm tracking-widest mt-2 text-center"
              style={{ color: "rgba(200,220,190,0.7)", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
              Hatch. Explore. Collect. Conquer.
            </p>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="relative max-w-3xl mx-auto px-5 py-8 pb-28" data-testid="hub-main" style={{ zIndex: 1 }}>

          {/* Daily Reward */}
          <DailyClaimCard
            user={user}
            onSignInRequest={() => setShowSignIn(true)}
          />

          {/* ── Founders gateway ──────────────────────────────────────────── */}
          <RuneDivider />
          <Link
            href="/founders"
            data-testid="link-founders"
            className="rounded-3xl px-6 py-7 flex flex-col items-center text-center transition-all active:scale-[0.98] cursor-pointer"
            style={{
              background: "linear-gradient(135deg,rgba(12,20,12,0.92) 0%,rgba(20,28,14,0.88) 100%)",
              border: "1px solid rgba(232,200,88,0.28)",
              boxShadow:
                "0 0 40px rgba(232,200,88,0.12), inset 0 1px 0 rgba(232,200,88,0.10), 0 12px 30px rgba(0,0,0,0.45)",
              textDecoration: "none",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full mb-3"
              style={{
                width: 52, height: 52,
                background: "radial-gradient(circle at 30% 25%, #f6dc8a 0%, #c8a93a 50%, #6e561a 100%)",
                boxShadow:
                  "0 0 24px rgba(232,200,88,0.45), 0 0 50px rgba(127,191,176,0.15), inset 0 -2px 5px rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,235,160,0.55)",
              }}
            >
              <Heart size={22} fill="#3a2a08" stroke="#3a2a08" strokeWidth={1.5} />
            </div>
            <h2
              className="font-fantasy text-base tracking-widest mb-1"
              style={{ color: "#f0d770", textShadow: "0 0 14px rgba(232,200,88,0.45)", letterSpacing: "0.18em" }}
            >
              Our Founders
            </h2>
            <p className="font-fantasy text-[10px] mb-4" style={{ color: "#8a7a3a", letterSpacing: "0.2em" }}>
              The lantern bearers who made this world possible
            </p>
            <span
              className="font-fantasy text-xs tracking-widest rounded-2xl px-6 py-2.5"
              style={{
                background: "linear-gradient(135deg,#f6dc8a 0%,#c8a93a 100%)",
                color: "#3a2a08",
                boxShadow: "0 0 16px rgba(232,200,88,0.32)",
                letterSpacing: "0.14em",
              }}
            >
              Visit the Wall
            </span>
          </Link>

          {/* ── Meet the Team ─────────────────────────────────────────────── */}
          {team && team.length > 0 && (
            <>
              <RuneDivider />
              <div data-testid="team-section" className="flex flex-col items-center gap-5 mb-2">
                <div className="flex flex-col items-center gap-1">
                  <h2 className="font-fantasy text-lg tracking-widest"
                    style={{ color: "#c084fc", textShadow: "0 0 18px rgba(192,132,252,0.5), 0 2px 10px rgba(0,0,0,0.9)" }}>
                    The Guardians
                  </h2>
                  <p className="font-fantasy text-[10px] tracking-widest" style={{ color: "rgba(192,132,252,0.45)" }}>
                    The team behind Para Pets
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-5">
                  {[...team].sort((a, b) => (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0)).map(member => {
                    const isAdmin = member.isAdmin;
                    const roleLabel = isAdmin ? "Realm Admin" : "Moderator";
                    const roleColor = isAdmin ? "#f0c040" : "#c084fc";
                    const roleBorder = isAdmin ? "rgba(240,192,64,0.5)" : "rgba(192,132,252,0.4)";
                    const roleGlow  = isAdmin ? "rgba(240,192,64,0.35)" : "rgba(192,132,252,0.3)";
                    const statusLabel = isAdmin ? "Online & Watching" : "Moderating";

                    return (
                      <div
                        key={member.id}
                        data-testid={`team-card-${member.id}`}
                        className="flex flex-col items-center gap-2"
                        style={{ minWidth: 90 }}
                      >
                        <div
                          className="relative"
                          style={{
                            width: isAdmin ? 72 : 60,
                            height: isAdmin ? 72 : 60,
                            borderRadius: "50%",
                            border: `2.5px solid ${roleBorder}`,
                            boxShadow: `0 0 20px ${roleGlow}, 0 4px 12px rgba(0,0,0,0.7)`,
                            overflow: "hidden",
                            background: isAdmin
                              ? "linear-gradient(135deg, #2a1a00, #4a3000)"
                              : "linear-gradient(135deg, #1a0a2a, #2a1040)",
                          }}
                        >
                          {member.profileImage ? (
                            <img
                              src={member.profileImage}
                              alt={member.username}
                              data-testid={`img-team-${member.id}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-fantasy font-bold"
                              style={{ color: roleColor, fontSize: isAdmin ? 24 : 20 }}>
                              {member.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ boxShadow: `inset 0 0 12px ${roleGlow}` }} />
                        </div>

                        <p className="font-fantasy text-xs text-center tracking-wide"
                          style={{ color: roleColor, textShadow: `0 0 8px ${roleGlow}`, maxWidth: 90 }}
                          data-testid={`text-team-name-${member.id}`}>
                          {member.username}
                        </p>

                        <div
                          className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl"
                          style={{
                            background: isAdmin
                              ? "linear-gradient(135deg, rgba(40,24,0,0.9), rgba(60,36,0,0.9))"
                              : "linear-gradient(135deg, rgba(20,8,36,0.9), rgba(30,10,52,0.9))",
                            border: `1px solid ${roleBorder}`,
                            boxShadow: `0 2px 8px rgba(0,0,0,0.5)`,
                          }}
                        >
                          <span className="font-fantasy text-[9px] tracking-widest" style={{ color: roleColor }}>
                            {roleLabel}
                          </span>
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#4ade80", boxShadow: "0 0 4px rgba(74,222,128,0.8)" }} />
                            <span className="font-fantasy text-[8px] tracking-wider" style={{ color: "rgba(180,220,180,0.7)" }}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

        </main>

        {showSignIn && (
          <SignInModal onClose={() => setShowSignIn(false)} onSuccess={handleSignInSuccess} />
        )}
      </div>
    </>
  );
}
