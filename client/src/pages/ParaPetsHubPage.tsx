import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, X, Eye, EyeOff, Loader2, Maximize2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";

import heroBanner        from "@assets/hub_hero_banner.png";
import mascot            from "@assets/Photoroom_20260502_90936_AM_1777731667331.png";
import runeCircle        from "@assets/hub_rune_circle.png";
import eggsImg           from "@assets/hub_eggs.png";
import iconGlobeWorld    from "@assets/icon_globe_world.png";
import iconCrossedSwords from "@assets/icon_battle_crossed_swords.png";
import iconPets          from "@assets/icon_pets.png";
import iconMarket        from "@assets/icon_market.png";
import iconFriends       from "@assets/icon_friends_inventory.png";
import iconPetHouse      from "@assets/icon_pet_house.png";
import iconPvp           from "@assets/icon_pvp_new.png";
import iconFishingPole   from "@assets/icon_fishing_pole.png";
import iconQuest         from "@assets/icon_quest_v5.png";
import iconBadges        from "@assets/icon_badges_new.png";
import iconBag           from "@assets/icon_bag.png";
import podiumImg         from "@assets/hub_podium.png";
import rankCrowns        from "@assets/hub_rank_crowns.png";
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
import worldHaunted      from "@assets/bg_haunted_woods_v2.png";
import worldDesert       from "@assets/bg_desert_map.png";
import worldSky          from "@assets/bg_sky_realm_map.png";
import worldIsland       from "@assets/bg_island_map.png";
import worldSwamp        from "@assets/bg_swamp_map.png";
import worldVolcanic     from "@assets/bg_volcanic_map.png";
import worldSnowy        from "@assets/bg_snowy_mountain_map.png";
import DailyClaimCard from "@/components/DailyClaimCard";

import hubParaPet    from "@assets/generated_images/hub_para_pet_transparent.png";
import paradoxStatue from "@assets/Photoroom_20260619_64226_PM_1781913135212.png";
import noticeGoFishing from "@assets/64255BCE-2B6A-4A95-8654-145262B126FA_1781352994250.png";
import noticeLimited   from "@assets/66A982C2-2B49-4DE0-8EE6-79C542E3351B_1781303706759.png";
import noticeExplore   from "@assets/49FB9020-1DB5-487E-9B92-EC15E9240ABD_1781303869686.png";

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
  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.abs(Math.sin(i * 137.508) * 100),
    y: Math.abs(Math.cos(i * 97.3)    * 100),
    size: ((i % 3) + 1) * 0.7,
    opacity: 0.1 + (i % 5) * 0.06,
    dur: 2.5 + (i % 4) * 0.9,
    gold: i % 3 === 0,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {particles.map(s => (
        <div key={s.id} className="absolute rounded-full"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            background: s.gold ? "#d4a843" : "#7fbfb0",
            opacity: s.opacity,
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
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(212,168,67,0.25))" }} />
      <img src={runeCircle} alt="" className="w-7 h-7 object-contain opacity-35"
        style={{ filter: "drop-shadow(0 0 6px rgba(212,168,67,0.5))" }} />
      <div style={{ height: 1, flex: 1, background: "linear-gradient(270deg,transparent,rgba(212,168,67,0.25))" }} />
    </div>
  );
}

function GoldDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-8">
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(212,168,67,0.4))" }} />
      <span style={{ color: "#d4a843", fontSize: 11, opacity: 0.7, lineHeight: 1 }}>✦</span>
      <div style={{ height: 1, flex: 1, background: "linear-gradient(270deg,transparent,rgba(212,168,67,0.4))" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notice carousel
// ─────────────────────────────────────────────────────────────────────────────
const NOTICES = [
  { img: noticeGoFishing, label: "Go Fishing",     href: "/world/swamp?fishHint=1" },
  { img: noticeLimited,   label: "Limited Event",  href: "/coins" },
  { img: noticeExplore,   label: "Explore Worlds", href: "/map" },
];

function NoticeCarousel() {
  const [idx, setIdx] = useState(0);
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"], retry: false, staleTime: 30_000 });
  const ptrRef   = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % NOTICES.length), 4200);
  }, []);

  useEffect(() => {
    restartTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restartTimer]);

  const goTo = (i: number) => {
    setIdx(((i % NOTICES.length) + NOTICES.length) % NOTICES.length);
    restartTimer();
  };

  return (
    <div data-testid="notice-carousel">
      <h2 className="font-fantasy text-center text-xs tracking-widest mb-4"
        style={{ color: "rgba(212,168,67,0.7)", letterSpacing: "0.25em" }}>
        WHAT'S HAPPENING
      </h2>

      <div
        style={{ position: "relative", borderRadius: 18, overflow: "hidden", touchAction: "pan-y", cursor: "grab" }}
        onPointerDown={e => { ptrRef.current = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerUp={e => {
          if (ptrRef.current === null) return;
          const dx = e.clientX - ptrRef.current;
          ptrRef.current = null;
          if (Math.abs(dx) > 28) {
            goTo(idx + (dx < 0 ? 1 : -1));
          } else if (user && NOTICES[idx].href) {
            navigate(NOTICES[idx].href);
          }
        }}
        onPointerLeave={() => { ptrRef.current = null; }}
      >
        <img
          src={NOTICES[idx].img}
          alt={NOTICES[idx].label}
          data-testid={`notice-img-${idx}`}
          style={{
            width: "100%",
            maxHeight: 468,
            objectFit: "cover",
            objectPosition: "top",
            display: "block",
            border: "1.5px solid rgba(212,168,67,0.3)",
            borderRadius: 18,
            boxShadow: "0 0 28px rgba(212,168,67,0.12), 0 10px 30px rgba(0,0,0,0.65)",
          }}
        />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 72,
          background: "linear-gradient(to top,rgba(3,14,5,0.75),transparent)",
          borderRadius: "0 0 18px 18px",
          pointerEvents: "none",
        }} />
      </div>

      {/* Pill indicators */}
      <div className="flex justify-center gap-2 mt-3">
        {NOTICES.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} data-testid={`notice-dot-${i}`}
            style={{
              width: i === idx ? 22 : 7, height: 7, borderRadius: 3.5, border: "none", padding: 0,
              background: i === idx ? "#d4a843" : "rgba(212,168,67,0.18)",
              cursor: "pointer",
              transition: "width 0.32s ease, background 0.32s ease",
            }} />
        ))}
      </div>
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
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: "calc(92*var(--vw))" }}
            >
              <img
                src={ls.img}
                alt={ls.label}
                data-testid="lightbox-image"
                style={{
                  maxWidth: "100%",
                  maxHeight: "calc(78*var(--vh))",
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
const EGG_W     = 150;
const EGG_H     = 220;
const EGG_GAP   = 18;
const EGG_STEP  = EGG_W + EGG_GAP;
const EGG_INTERVAL = 2600;

const BANNER_TILE = 58;
const BANNER_GAP  = 8;
const BANNER_STEP = BANNER_TILE + BANNER_GAP;

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

  const stripOffset = containerW / 2 - (activeIdx * EGG_STEP + EGG_W / 2);

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
                  width: EGG_W, height: EGG_H,
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
                  style={{ width: 120, height: 185, objectFit: "contain",
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

function PetsBanner() {
  const { data: pets = [] } = useQuery<{ id: string; name: string; imageUrl: string }[]>({
    queryKey: ["/api/public/pets"],
    staleTime: 300_000,
    retry: false,
  });

  if (pets.length === 0) return null;

  // Duplicate the list so the marquee loops seamlessly: when the first copy
  // scrolls fully off-screen, the second copy is already in place and the
  // animation restarts invisibly.
  const loop = [...pets, ...pets];
  const oneSetW  = pets.length * BANNER_STEP;
  const duration = Math.max(10, oneSetW / 45); // ~45 px/s

  return (
    <div data-testid="pets-banner" style={{ marginBottom: 0 }}>
      {/* Label */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(212,168,67,0.25))" }} />
        <span
          className="font-fantasy tracking-[0.2em]"
          style={{ fontSize: 9, color: "rgba(212,168,67,0.5)", whiteSpace: "nowrap" }}
        >
          PETS OF THE REALM
        </span>
        <div style={{ height: 1, flex: 1, background: "linear-gradient(270deg,transparent,rgba(212,168,67,0.25))" }} />
      </div>

      {/* Scrolling strip */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        {/* Fade edges so tiles disappear cleanly */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: "linear-gradient(90deg,rgba(5,10,6,1) 0%,transparent 7%,transparent 93%,rgba(5,10,6,1) 100%)",
        }} />

        <style>{`
          @keyframes petsBannerScroll {
            from { transform: translateX(0); }
            to   { transform: translateX(-${oneSetW}px); }
          }
        `}</style>

        <div style={{
          display: "flex",
          gap: BANNER_GAP,
          width: "max-content",
          animation: `petsBannerScroll ${duration}s linear infinite`,
          willChange: "transform",
        }}>
          {loop.map((pet, i) => (
            <div
              key={`${pet.id}-${i}`}
              data-testid={i < pets.length ? `pet-banner-${i}` : undefined}
              style={{
                flexShrink: 0,
                width: BANNER_TILE,
                height: BANNER_TILE,
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(10,20,12,0.75)",
                border: "1px solid rgba(212,168,67,0.18)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
              }}
            >
              <img
                src={pet.imageUrl}
                alt={pet.name}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// About the game section
// ─────────────────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <div className="flex flex-col items-center text-center gap-5" data-testid="section-about">
      <div>
        <h2
          className="font-fantasy text-2xl tracking-widest mb-2"
          style={{
            color: "#f0d770",
            textShadow: "0 0 22px rgba(232,200,88,0.45), 0 2px 10px rgba(0,0,0,0.9)",
            letterSpacing: "0.18em",
          }}
        >
          Welcome to Para Pets
        </h2>
        <p
          className="font-fantasy text-[11px] tracking-wider leading-relaxed"
          style={{ color: "rgba(200,220,180,0.75)", maxWidth: 340, margin: "0 auto" }}
        >
          Hatch rare creatures from ancient eggs, explore hidden worlds, and forge your own legend across realms beyond imagination.
        </p>
      </div>

      {/* Three pillars */}
      <div className="flex gap-3 w-full">
        {[
          { img: eggsImg,           label: "Hatch",   desc: "Rare eggs from across the realm",   glow: "rgba(240,215,112,0.18)" },
          { img: iconGlobeWorld,    label: "Explore", desc: "8 mystical worlds to discover",     glow: "rgba(127,191,176,0.18)" },
          { img: iconCrossedSwords, label: "Conquer", desc: "Battle, quest & rise to glory",     glow: "rgba(248,113,113,0.18)" },
        ].map(p => (
          <div
            key={p.label}
            className="flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-4 px-2"
            style={{
              background: "linear-gradient(160deg, rgba(15,35,20,0.88) 0%, rgba(10,28,16,0.92) 100%)",
              border: "1px solid rgba(127,191,176,0.14)",
              boxShadow: `0 4px 14px rgba(0,0,0,0.35), 0 0 10px ${p.glow}`,
            }}
          >
            <img
              src={p.img}
              alt={p.label}
              style={{
                width: 42, height: 42, objectFit: "contain",
                filter: `drop-shadow(0 0 6px ${p.glow})`,
              }}
            />
            <p className="font-fantasy text-[11px] tracking-widest" style={{ color: "#f0d770" }}>
              {p.label}
            </p>
            <p className="font-fantasy text-[9px] leading-relaxed text-center" style={{ color: "rgba(160,200,160,0.6)" }}>
              {p.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity bulletin — what players can do
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITIES = [
  {
    img: iconPets,
    color: "#4ade80",
    glow: "rgba(74,222,128,0.22)",
    title: "Collect",
    desc: "Hatch & collect over 100 rare fantasy pets from magical eggs found across every world.",
  },
  {
    img: iconGlobeWorld,
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.22)",
    title: "Explore",
    desc: "Roam 8 living worlds — enchanted groves, haunted woods, volcanic craters & more — each packed with hidden shops and secrets.",
  },
  {
    img: iconMarket,
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.22)",
    title: "Buy & Sell",
    desc: "Haggle in player-run marketplaces, equip accessories, and trade rare finds to build your fortune.",
  },
  {
    img: iconFriends,
    color: "#c084fc",
    glow: "rgba(192,132,252,0.22)",
    title: "Add & Visit Friends",
    desc: "Connect with other tamers, visit their worlds, leave gifts, and see their legendary pets up close.",
  },
  {
    img: iconPetHouse,
    color: "#34d399",
    glow: "rgba(52,211,153,0.22)",
    title: "Care for Pets",
    desc: "Feed, train, and level your companions. Give them gifts to earn loyalty and unlock their true potential.",
  },
  {
    img: iconPvp,
    color: "#f87171",
    glow: "rgba(248,113,113,0.22)",
    title: "PvP Battles",
    desc: "Enter the Veridia Arena and pit your pets against other tamers in turn-based combat for glory and rewards.",
  },
  {
    img: iconFishingPole,
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.22)",
    title: "Mini Games & Fishing",
    desc: "Cast a line in magical fishing spots, reel in rare sea creatures, and top the leaderboards to earn extra coins.",
  },
  {
    img: iconQuest,
    color: "#fb923c",
    glow: "rgba(251,146,60,0.22)",
    title: "Quests",
    desc: "Take on daily and seasonal quests that send you across the realm, earning exclusive items and bragging rights.",
  },
  {
    img: iconBadges,
    color: "#f472b6",
    glow: "rgba(244,114,182,0.22)",
    title: "Events",
    desc: "Limited-time world events, holiday celebrations, and surprise drops keep the realm alive and ever-changing.",
  },
  {
    img: iconBag,
    color: "#f0d770",
    glow: "rgba(240,215,112,0.22)",
    title: "And So Much More…",
    desc: "Aquariums, badges, leaderboards, lore, world chat — your adventure is just beginning.",
  },
];

function ActivityBulletin() {
  return (
    <div data-testid="section-activity-bulletin">
      <div className="text-center mb-5">
        <h2
          className="font-fantasy text-lg tracking-widest mb-1"
          style={{
            color: "#7fbfb0",
            textShadow: "0 0 18px rgba(127,191,176,0.4)",
            letterSpacing: "0.18em",
          }}
        >
          What Awaits You
        </h2>
        <p className="font-fantasy text-[10px]" style={{ color: "rgba(127,191,176,0.45)" }}>
          A realm full of wonders — dive in
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {ACTIVITIES.map((a) => (
          <div
            key={a.title}
            className="flex items-start gap-3 rounded-2xl p-3"
            style={{
              background: `linear-gradient(135deg, rgba(10,22,14,0.92) 0%, rgba(14,28,18,0.88) 100%)`,
              border: `1px solid ${a.color}22`,
              boxShadow: `0 0 12px ${a.glow}, 0 3px 10px rgba(0,0,0,0.35)`,
            }}
          >
            {/* Icon bubble */}
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-xl"
              style={{
                width: 42, height: 42,
                background: `radial-gradient(circle at 35% 30%, ${a.color}28 0%, ${a.color}0a 100%)`,
                border: `1px solid ${a.color}40`,
                boxShadow: `0 0 10px ${a.glow}`,
              }}
            >
              <img
                src={a.img}
                alt={a.title}
                style={{
                  width: 26, height: 26, objectFit: "contain",
                  filter: `drop-shadow(0 0 5px ${a.glow})`,
                }}
              />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p
                className="font-fantasy text-[12px] tracking-wider mb-0.5"
                style={{ color: a.color, textShadow: `0 0 8px ${a.glow}` }}
              >
                {a.title}
              </p>
              <p
                className="font-fantasy text-[10px] leading-relaxed"
                style={{ color: "rgba(180,210,190,0.65)" }}
              >
                {a.desc}
              </p>
            </div>

            {/* Accent line */}
            <div
              className="flex-shrink-0 self-stretch w-0.5 rounded-full"
              style={{ background: `linear-gradient(to bottom, ${a.color}50, transparent)` }}
            />
          </div>
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
function useSeoMeta() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Para Pets — Free Fantasy Pet Adventure Game";

    const setMeta = (attr: string, key: string, value: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", value);
    };

    const desc = "Para Pets is a free browser-based fantasy pet game for older teens and up. Collect and name magical companions, level them up, and battle rivals in PvP arenas. Trade on the player marketplace, fish magical ponds, play Molten Blocks, explore enchanted worlds, add friends, and climb the leaderboards.";
    const img  = `${window.location.origin}/logo_parapets.png`;
    const url  = "https://www.parapets.net/hub";

    setMeta("name",     "description",          desc);
    setMeta("name",     "robots",               "index, follow");
    setMeta("property", "og:title",             "Para Pets — Free Fantasy Pet Adventure Game");
    setMeta("property", "og:description",       desc);
    setMeta("property", "og:url",               url);
    setMeta("property", "og:image",             img);
    setMeta("property", "og:type",              "website");
    setMeta("name",     "twitter:card",         "summary_large_image");
    setMeta("name",     "twitter:title",        "Para Pets — Free Fantasy Pet Adventure Game");
    setMeta("name",     "twitter:description",  desc);
    setMeta("name",     "twitter:image",        img);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = url;

    return () => { document.title = prev; };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contribution leaderboard — top coin bundle purchasers (admins excluded, mods shown)
// ─────────────────────────────────────────────────────────────────────────────
type LeaderboardEntry = { rank: number; userId: string; username: string; profileImage: string | null; isModerator?: boolean; points: number };

function ContributionLeaderboard() {
  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/public/leaderboard"],
    staleTime: 60_000,
    retry: false,
  });

  // Same player card the world chat opens. Only logged-in viewers can open it
  // (the profile endpoint requires auth), and never your own avatar.
  const { data: viewer } = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 30_000,
  });
  const currentUserId = viewer?.id;
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(212,168,67,0.3)", borderTopColor: "#d4a843", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
  if (entries.length === 0) return null;

  const rankColors: Record<number, string> = { 1: "#ffd700", 2: "#c0c0c0", 3: "#cd7f32" };

  return (
    <div data-testid="contribution-leaderboard">
      <div className="flex flex-col items-center gap-0.5 mb-5">
        <h2 className="font-fantasy text-base tracking-widest"
          style={{ color: "#d4a843", textShadow: "0 0 18px rgba(212,168,67,0.45)", letterSpacing: "0.2em" }}>
          Realm Benefactors
        </h2>
      </div>

      <div
        style={{
          maxHeight: 560,
          overflowY: entries.length > 10 ? "auto" : "visible",
          paddingRight: entries.length > 10 ? 4 : 0,
        }}
        className="flex flex-col gap-2"
      >
        {entries.map((e) => {
          const isTop3 = e.rank <= 3;
          const rankColor = rankColors[e.rank] ?? "rgba(212,168,67,0.45)";
          return (
            <div
              key={e.rank}
              data-testid={`leaderboard-row-${e.rank}`}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                borderRadius: 14,
                background: isTop3
                  ? "linear-gradient(90deg,rgba(212,168,67,0.1) 0%,rgba(10,18,14,0.8) 100%)"
                  : "rgba(10,18,14,0.55)",
                border: `1px solid ${isTop3 ? "rgba(212,168,67,0.28)" : "rgba(212,168,67,0.08)"}`,
                boxShadow: isTop3 ? "0 0 14px rgba(212,168,67,0.1), 0 2px 8px rgba(0,0,0,0.5)" : "none",
              }}
            >
              {/* Rank number */}
              <span className="font-fantasy"
                style={{
                  minWidth: 26, textAlign: "center",
                  fontSize: isTop3 ? "1rem" : "0.8rem",
                  color: rankColor,
                  textShadow: isTop3 ? `0 0 10px ${rankColor}80` : "none",
                  fontWeight: isTop3 ? 700 : 400,
                  flexShrink: 0,
                }}
              >
                {e.rank}
              </span>

              {/* Avatar — opens the same player card the world chat does */}
              {(() => {
                const canView = !!currentUserId && currentUserId !== e.userId && !!e.userId;
                return (
                  <div
                    data-testid={`button-leaderboard-avatar-${e.rank}`}
                    onClick={() => canView && setViewingPlayerId(e.userId)}
                    style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      overflow: "hidden",
                      border: `1.5px solid ${isTop3 ? rankColor + "60" : "rgba(212,168,67,0.12)"}`,
                      background: "rgba(10,18,14,0.8)",
                      cursor: canView ? "pointer" : "default",
                    }}>
                    {e.profileImage ? (
                      <img src={e.profileImage} alt={e.username}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.85rem",
                        color: "rgba(212,168,67,0.5)", fontFamily: "serif",
                      }}>
                        {e.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Username + optional mod badge */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="font-fantasy text-sm truncate"
                  style={{ color: isTop3 ? "#f0e0a0" : "rgba(240,224,160,0.65)", letterSpacing: "0.04em" }}>
                  {e.username}
                </span>
                {e.isModerator && (
                  <span className="font-fantasy flex-shrink-0"
                    style={{
                      fontSize: "8px", letterSpacing: "0.12em",
                      padding: "1px 5px", borderRadius: 4,
                      background: "rgba(127,191,176,0.1)",
                      border: "1px solid rgba(127,191,176,0.38)",
                      color: "#7fbfb0",
                      textTransform: "uppercase",
                    }}>
                    Mod
                  </span>
                )}
              </div>

              {/* Points */}
              <span className="font-fantasy text-xs flex-shrink-0"
                style={{ color: rankColor, textShadow: isTop3 ? `0 0 8px ${rankColor}60` : "none", letterSpacing: "0.06em" }}>
                {e.points.toLocaleString()} pts
              </span>
            </div>
          );
        })}
      </div>

      {viewingPlayerId && (
        <PlayerDetailPanel
          userId={viewingPlayerId}
          currentUserId={currentUserId}
          onClose={() => setViewingPlayerId(null)}
        />
      )}
    </div>
  );
}

export default function ParaPetsHubPage() {
  useSeoMeta();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showClaimHint, setShowClaimHint] = useState(() =>
    new URLSearchParams(window.location.search).get("claimHint") === "1"
  );
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
          background: "#030e05",
          backgroundImage: [
            "radial-gradient(ellipse 85% 45% at 10% 5%,  rgba(8,50,15,0.7) 0%,transparent 55%)",
            "radial-gradient(ellipse 70% 45% at 90% 88%, rgba(15,65,12,0.55) 0%,transparent 55%)",
            "radial-gradient(ellipse 50% 35% at 50% 45%, rgba(180,140,30,0.05) 0%,transparent 55%)",
          ].join(","),
        }}
      >
        <StarField />

        {/* ── Hero: Title + Pet + Buttons ───────────────────────────────────── */}
        <div className="relative flex flex-col items-center px-5 pt-10 pb-4 text-center overflow-hidden">
          {/* Soft ambient glow behind the pet */}
          <div style={{
            position: "absolute", top: "12%", left: "50%", transform: "translateX(-50%)",
            width: 280, height: 280, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,168,67,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <h1
            className="font-fantasy tracking-widest select-none relative"
            style={{
              fontSize: "clamp(2.4rem, calc(11*var(--vw)), 3.6rem)",
              color: "#f0d060",
              textShadow: "0 0 28px rgba(212,168,67,0.65), 0 0 56px rgba(212,168,67,0.25), 0 4px 18px rgba(0,0,0,0.9)",
              letterSpacing: "0.18em",
              zIndex: 1,
            }}
            data-testid="text-hub-title"
          >
            Para Pets
          </h1>

          <p className="font-fantasy text-sm tracking-widest mt-1 mb-1 relative"
            style={{ color: "rgba(160,200,120,0.65)", textShadow: "0 2px 10px rgba(0,0,0,0.8)", zIndex: 1 }}>
            Hatch. Explore. Collect. Conquer.
          </p>

          {/* Para Pet mascot */}
          <img
            src={hubParaPet}
            alt="Para Pet"
            data-testid="img-hub-mascot"
            style={{
              width: 110, height: 110, objectFit: "contain",
              filter: "drop-shadow(0 0 16px rgba(127,191,176,0.55)) drop-shadow(0 0 32px rgba(212,168,67,0.15))",
              animation: "float 3.2s ease-in-out infinite",
              position: "relative", zIndex: 1,
            }}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-2 relative" style={{ zIndex: 1 }}>
            {!user && (
              <button
                data-testid="button-hub-hero-signin"
                onClick={() => setShowSignIn(true)}
                className="font-fantasy tracking-widest transition-all active:scale-95"
                style={{
                  padding: "11px 26px", borderRadius: 14,
                  background: "rgba(212,168,67,0.08)",
                  border: "1.5px solid rgba(212,168,67,0.45)",
                  color: "#d4a843",
                  textShadow: "0 0 10px rgba(212,168,67,0.4)",
                  fontSize: "0.82rem", letterSpacing: "0.1em",
                }}
              >
                Sign In
              </button>
            )}
            <Link
              href={user ? "/" : "/auth"}
              data-testid="button-hero-play-game"
              className="font-fantasy tracking-widest transition-all active:scale-95"
              style={{
                padding: "12px 32px", borderRadius: 14,
                background: "linear-gradient(135deg,#3a7a20 0%,#1a5010 60%,#2a6818 100%)",
                border: "2px solid rgba(212,168,67,0.55)",
                color: "#f0d060",
                boxShadow: "0 0 22px rgba(46,160,46,0.28), inset 0 1px 0 rgba(255,220,80,0.12), 0 4px 14px rgba(0,0,0,0.7)",
                textShadow: "0 0 12px rgba(212,168,67,0.7)",
                fontSize: "0.92rem", letterSpacing: "0.12em",
                textDecoration: "none",
              }}
            >
              ✦ Play Game ✦
            </Link>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="relative max-w-3xl mx-auto px-5 pb-28" data-testid="hub-main" style={{ zIndex: 1 }}>

          {/* ── Pets of the Realm banner ───────────────────────────────────── */}
          <div className="pt-6 pb-2">
            <PetsBanner />
          </div>

          <GoldDivider />

          {/* ── Notice carousel ───────────────────────────────────────────── */}
          <NoticeCarousel />

          <GoldDivider />

          {/* ── Founders button ───────────────────────────────────────────── */}
          <Link
            href="/founders"
            data-testid="link-founders"
            className="flex flex-col items-center gap-1 transition-all active:scale-[0.97] cursor-pointer"
            style={{ textDecoration: "none" }}
          >
            <img
              src={paradoxStatue}
              alt="Founder's Wall"
              style={{
                width: 130,
                height: "auto",
                filter: "drop-shadow(0 0 22px rgba(212,168,67,0.55)) drop-shadow(0 6px 18px rgba(0,0,0,0.65))",
              }}
            />
            <span
              className="font-fantasy tracking-widest"
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#f5d560",
                textShadow: "0 0 18px rgba(212,168,67,0.65), 0 2px 8px rgba(0,0,0,0.9)",
                letterSpacing: "0.14em",
              }}
            >
              Founder's Wall
            </span>
          </Link>

          <GoldDivider />

          {/* ── Realm Benefactors leaderboard ─────────────────────────────── */}
          <ContributionLeaderboard />

          <GoldDivider />

          {/* ── Game Guardians ─────────────────────────────────────────────── */}
          {team && team.length > 0 && (
            <div data-testid="team-section" className="flex flex-col items-center gap-4 mb-2">
              <div className="flex flex-col items-center gap-0.5">
                <h2 className="font-fantasy text-sm tracking-widest"
                  style={{ color: "#d4a843", textShadow: "0 0 12px rgba(212,168,67,0.4)", letterSpacing: "0.2em" }}>
                  Game Guardians
                </h2>
                <p className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(212,168,67,0.38)" }}>
                  The team behind Para Pets
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-5">
                {[...team].sort((a, b) => (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0)).map(member => {
                  const isAdmin   = member.isAdmin;
                  const roleLabel = isAdmin ? "Realm Admin" : "Moderator";
                  const roleColor = isAdmin ? "#d4a843" : "#7fbfb0";
                  const roleBorder = isAdmin ? "rgba(212,168,67,0.48)" : "rgba(127,191,176,0.38)";
                  const roleGlow   = isAdmin ? "rgba(212,168,67,0.28)" : "rgba(127,191,176,0.22)";

                  return (
                    <div
                      key={member.id}
                      data-testid={`team-card-${member.id}`}
                      className="flex flex-col items-center gap-1.5"
                      style={{ minWidth: 72 }}
                    >
                      <div
                        className="relative"
                        style={{
                          width: isAdmin ? 58 : 50,
                          height: isAdmin ? 58 : 50,
                          borderRadius: "50%",
                          border: `2px solid ${roleBorder}`,
                          boxShadow: `0 0 16px ${roleGlow}, 0 3px 10px rgba(0,0,0,0.7)`,
                          overflow: "hidden",
                          background: isAdmin
                            ? "linear-gradient(135deg,#1a1000,#3a2800)"
                            : "linear-gradient(135deg,#041208,#081e10)",
                        }}
                      >
                        {member.profileImage ? (
                          <img src={member.profileImage} alt={member.username}
                            data-testid={`img-team-${member.id}`}
                            className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-fantasy font-bold"
                            style={{ color: roleColor, fontSize: isAdmin ? 20 : 17 }}>
                            {member.username[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ boxShadow: `inset 0 0 10px ${roleGlow}` }} />
                      </div>

                      <p className="font-fantasy text-[10px] text-center tracking-wide"
                        style={{ color: roleColor, maxWidth: 76 }}
                        data-testid={`text-team-name-${member.id}`}>
                        {member.username}
                      </p>
                      <span className="font-fantasy text-[8px] tracking-widest px-2 py-0.5 rounded-full"
                        style={{
                          background: isAdmin ? "rgba(212,168,67,0.1)" : "rgba(127,191,176,0.07)",
                          border: `1px solid ${roleBorder}`,
                          color: roleColor,
                        }}>
                        {roleLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


        </main>

        {showSignIn && (
          <SignInModal onClose={() => setShowSignIn(false)} onSuccess={handleSignInSuccess} />
        )}
      </div>
    </>
  );
}
