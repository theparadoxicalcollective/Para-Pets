import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { bjGetStep, bjSetStep, bjGetStatus, BJ_EVENT } from "@/lib/beginJourney";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

// ── Config ───────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 7;
const OVERLAY_BG  = "rgba(0,0,0,0.74)";
const PAD         = 14; // spotlight padding around target (px)

const STEP_LABELS = [
  "Open the navigation menu!",
  "Go to your Pet collection!",
  "Select your egg as your companion!",
  "Head back home!",
  "Tap your egg!",
  "Drag a hatch potion onto your egg to hatch it!",
  "Open your Quest log!",
];

// Required URL path for each step (null = any)
const STEP_REQUIRED_PATH: (string | null)[] = [
  null,    // 0 – any game page
  null,    // 1 – any (nav opened by previous step)
  "/pets", // 2
  "/pets", // 3
  "/",     // 4
  "/pets", // 5
  null,    // 6 – any (after hatch, quest icon)
];

// DOM selectors per step (null = handled inline)
const STEP_SELECTORS: (string | null)[] = [
  '[data-testid="button-floating-nav"]',   // 0
  '[data-testid="nav-item-inventory"]',     // 1
  '[data-testid^="button-select-pet-"]',   // 2 – first select button
  '[data-testid="button-close-inventory"]', // 3
  '[data-testid="button-egg-tap"]',         // 4
  null,                                      // 5 – free mode
  null,                                      // 6 – dynamic (nav btn or quest btn)
];

const FREE_STEP = 5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface TargetRect {
  top: number; left: number; right: number; bottom: number;
  width: number; height: number;
}

interface Props {
  user?: { activePetId?: string | null } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BeginJourneyOverlay({ user }: Props) {
  const [step, setStep]               = useState<number | "done" | null>(() => bjGetStep());
  const [targetRect, setTargetRect]   = useState<TargetRect | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantLoading, setGrantLoading]    = useState(false);
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync step when changed externally (FloatingNav GO button, WelcomeGift, etc.)
  useEffect(() => {
    const handler = () => {
      const s = bjGetStep();
      setStep(s);
      if (s === 0) setShowGrantModal(false);
    };
    window.addEventListener(BJ_EVENT, handler);
    return () => window.removeEventListener(BJ_EVENT, handler);
  }, []);

  // ── Poll DOM for spotlight target ─────────────────────────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (step === null || step === "done") { setTargetRect(null); return; }

    const stepNum = step as number;
    const reqPath = STEP_REQUIRED_PATH[stepNum];
    if (reqPath && location !== reqPath) { setTargetRect(null); return; }

    const poll = () => {
      // Step 6: quest nav item if visible, else main nav button
      if (stepNum === 6) {
        const questEl = document.querySelector('[data-testid="nav-item-quest"]') as HTMLElement | null;
        if (questEl) {
          const cs = window.getComputedStyle(questEl);
          if (cs.pointerEvents !== "none" && cs.opacity !== "0") {
            const r = questEl.getBoundingClientRect();
            if (r.width > 0) { setTargetRect(r); return; }
          }
        }
        const navBtn = document.querySelector('[data-testid="button-floating-nav"]') as HTMLElement | null;
        if (navBtn) { const r = navBtn.getBoundingClientRect(); if (r.width > 0) { setTargetRect(r); return; } }
        setTargetRect(null); return;
      }

      // Step 5 (free): arrow on first pet card on /pets
      if (stepNum === 5) {
        if (location !== "/pets") { setTargetRect(null); return; }
        const card = document.querySelector('[data-testid^="card-pet-"]') as HTMLElement | null;
        if (card) { const r = card.getBoundingClientRect(); if (r.width > 0) { setTargetRect(r); return; } }
        setTargetRect(null); return;
      }

      // All other steps
      const sel = STEP_SELECTORS[stepNum];
      if (!sel) { setTargetRect(null); return; }
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) { setTargetRect(null); return; }
      const cs = window.getComputedStyle(el);
      if (cs.pointerEvents === "none" || cs.opacity === "0" || cs.display === "none") { setTargetRect(null); return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { setTargetRect(null); return; }
      setTargetRect(r);
    };

    poll();
    pollRef.current = setInterval(poll, 200);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, location]);

  // ── Check for egg at step 2 ───────────────────────────────────────────────
  const { data: invCheck } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    enabled: step === 2 && location === "/pets",
    staleTime: 10_000,
  });

  useEffect(() => {
    if (step !== 2 || location !== "/pets" || !invCheck) return;
    const hasEgg = invCheck.some(i => i.isHatched === false && i.type === "pet");
    if (!hasEgg) setShowGrantModal(true);
  }, [step, location, invCheck]);

  // ── Poll inventory for hatch at step 5 ────────────────────────────────────
  const { data: invHatch } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    enabled: step === 5,
    refetchInterval: step === 5 ? 2500 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (step !== 5 || !invHatch || !user?.activePetId) return;
    const activePet = invHatch.find(
      i => i.inventoryId === user!.activePetId || i.id === user!.activePetId
    );
    if (activePet?.isHatched === true) {
      bjSetStep(6);
      setStep(6);
    }
  }, [step, invHatch, user?.activePetId]);

  // ── Grant starter egg ─────────────────────────────────────────────────────
  const handleGrantEgg = async () => {
    setGrantLoading(true);
    try {
      await apiRequest("POST", "/api/tutorial/grant-starter-egg", {});
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setShowGrantModal(false);
    } catch { /* silent */ }
    setGrantLoading(false);
  };

  // ── Handle forwarder click ────────────────────────────────────────────────
  const handleForwarderClick = useCallback(() => {
    if (step === null || step === "done") return;
    const stepNum = step as number;

    if (stepNum === 4) {
      // Egg on main page: navigate to /pets (don't call egg's click)
      navigate("/pets");
      bjSetStep(5);
      setStep(5);
      return;
    }

    if (stepNum === 6) {
      const questEl = document.querySelector('[data-testid="nav-item-quest"]') as HTMLElement | null;
      const isVisible = questEl && window.getComputedStyle(questEl).pointerEvents !== "none";
      if (!isVisible) {
        // Open nav first
        const navBtn = document.querySelector('[data-testid="button-floating-nav"]') as HTMLElement | null;
        navBtn?.click();
        return;
      }
      questEl?.click();
      bjSetStep("done");
      setStep("done");
      return;
    }

    // Default: click target then advance
    const sel = STEP_SELECTORS[stepNum];
    if (sel) {
      const el = document.querySelector(sel) as HTMLElement | null;
      el?.click();
    }

    const next = stepNum + 1;
    if (next >= TOTAL_STEPS) {
      bjSetStep("done");
      setStep("done");
    } else {
      bjSetStep(next);
      setStep(next);
    }
  }, [step, navigate]);

  // ── Render guard ──────────────────────────────────────────────────────────
  if (step === null || step === "done") return null;

  const stepNum  = step as number;
  const isFree   = stepNum === FREE_STEP;
  const label    = STEP_LABELS[stepNum];

  // Padded rect for spotlight
  const pr = targetRect ? {
    top:    Math.max(0, targetRect.top    - PAD),
    left:   Math.max(0, targetRect.left   - PAD),
    right:  Math.min(window.innerWidth,  targetRect.right  + PAD),
    bottom: Math.min(window.innerHeight, targetRect.bottom + PAD),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  } : null;

  const arrowW = 56, arrowH = 70;
  const arrowTop  = pr ? Math.max(8, pr.top - arrowH - 4) : undefined;
  const arrowLeft = pr ? pr.left + pr.width / 2 - arrowW / 2 : undefined;
  const arrowFilter = "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))";

  return (
    <>
      <style>{`
        @keyframes bj-bounce {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
      `}</style>

      {/* Hint label — always at top */}
      <div style={{
        position: "fixed", top: 36, left: "50%", transform: "translateX(-50%)",
        zIndex: 99004, pointerEvents: "none", textAlign: "center",
        maxWidth: 300, width: "90vw",
      }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(8,18,8,0.97) 0%, rgba(15,30,15,0.97) 100%)",
          border: "1.5px solid rgba(212,168,67,0.55)", borderRadius: 18,
          padding: "10px 18px",
          boxShadow: "0 0 20px rgba(212,168,67,0.2), 0 8px 30px rgba(0,0,0,0.75)",
        }}>
          <p style={{
            fontFamily: "Lora, Georgia, serif", fontSize: 13, fontWeight: 600,
            color: "#f0d060", letterSpacing: "0.04em", lineHeight: 1.45, margin: 0,
          }}>{label}</p>
        </div>
      </div>

      {/* Spotlight blocking divs — skip for free mode */}
      {!isFree && (pr ? (
        <>
          {pr.top > 0 && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: pr.top, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
          )}
          {pr.bottom < window.innerHeight && (
            <div style={{ position: "fixed", top: pr.bottom, left: 0, right: 0, bottom: 0, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
          )}
          {pr.left > 0 && (
            <div style={{ position: "fixed", top: pr.top, left: 0, width: pr.left, height: pr.height, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
          )}
          {pr.right < window.innerWidth && (
            <div style={{ position: "fixed", top: pr.top, left: pr.right, right: 0, height: pr.height, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
          )}
        </>
      ) : (
        <div style={{ position: "fixed", inset: 0, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
      ))}

      {/* Transparent click forwarder over spotlight — skip for free mode */}
      {!isFree && pr && (
        <div
          onClick={handleForwarderClick}
          style={{
            position: "fixed", top: pr.top, left: pr.left,
            width: pr.width, height: pr.height,
            zIndex: 99001, cursor: "pointer", pointerEvents: "all",
            background: "transparent",
          }}
        />
      )}

      {/* Bouncing arrow above target */}
      {pr && (
        <img
          src={tutorialArrow}
          alt=""
          style={{
            position: "fixed",
            top:  arrowTop,
            left: arrowLeft,
            width: arrowW, height: arrowH,
            objectFit: "contain",
            zIndex: 99003, pointerEvents: "none",
            filter: arrowFilter,
            animation: "bj-bounce 0.7s ease-in-out infinite",
          }}
        />
      )}

      {/* Grant Egg modal (step 2, no eggs found) */}
      {showGrantModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99010, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          <div style={{
            background: "linear-gradient(160deg, rgba(8,18,8,0.99) 0%, rgba(15,30,15,0.99) 100%)",
            border: "1.5px solid rgba(212,168,67,0.5)", borderRadius: 20,
            padding: "28px 24px", maxWidth: 320, width: "100%",
            boxShadow: "0 0 40px rgba(212,168,67,0.15), 0 24px 60px rgba(0,0,0,0.85)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🥚</div>
            <h3 style={{ fontFamily: "Lora, Georgia, serif", color: "#f0d060", fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: "0.05em" }}>
              You Need an Egg!
            </h3>
            <p style={{ fontFamily: "Lora, Georgia, serif", color: "rgba(200,220,180,0.8)", fontSize: 13, lineHeight: 1.55, marginBottom: 20 }}>
              Every tamer starts with a companion! Claim your very own Grassland Cow Egg to begin your journey.
            </p>
            <button
              onClick={handleGrantEgg}
              disabled={grantLoading}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12,
                background: grantLoading ? "rgba(30,60,20,0.7)" : "linear-gradient(135deg, #3a7a20 0%, #1a5010 100%)",
                border: "2px solid rgba(212,168,67,0.55)", color: "#f0d060",
                fontFamily: "Lora, Georgia, serif", fontSize: 14, fontWeight: 700,
                letterSpacing: "0.08em", cursor: grantLoading ? "wait" : "pointer",
                boxShadow: "0 0 16px rgba(46,160,46,0.3), 0 4px 14px rgba(0,0,0,0.6)",
              }}
            >
              {grantLoading ? "Claiming…" : "🌱 Claim Your Egg"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
