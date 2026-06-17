import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
  "/",     // 5 – drag potion onto egg on home page
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
  user?: { activePetId?: string | null; tutorial_hatch_potions_claimed?: boolean } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BeginJourneyOverlay({ user }: Props) {
  const [step, setStep]               = useState<number | "done" | null>(() => bjGetStep());
  const [targetRect, setTargetRect]   = useState<TargetRect | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantLoading, setGrantLoading]    = useState(false);
  const [showReward, setShowReward]        = useState(false);
  const [showPotionModal, setShowPotionModal] = useState(false);
  const [potionsGranted, setPotionsGranted]   = useState(false);
  const [showRescue, setShowRescue]           = useState(false);
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Claim 1500-coin completion reward ─────────────────────────────────────
  const claimRewardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tutorial/claim-reward", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowReward(true);
      setTimeout(() => {
        setShowReward(false);
        bjSetStep("done");
        setStep("done");
      }, 2200);
    },
    onError: () => {
      bjSetStep("done");
      setStep("done");
    },
  });

  // ── Grant 3 free hatching potions (one-time) ──────────────────────────────
  const grantPotionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tutorial/grant-hatch-potions", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setPotionsGranted(true);
      setShowPotionModal(false);
    },
  });

  // Sync step when changed externally (FloatingNav GO button, WelcomeGift, etc.)
  useEffect(() => {
    const handler = () => {
      const s = bjGetStep();
      setStep(s);
      if (s === 0) { setShowGrantModal(false); setShowPotionModal(false); setPotionsGranted(false); setShowRescue(false); }
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

      // Step 5 (free): arrow on active egg card on /pets
      if (stepNum === 5) {
        if (location !== "/pets") { setTargetRect(null); return; }
        // Prefer the active egg card
        if (user?.activePetId) {
          const activeCard = document.querySelector(`[data-pet-inv-id="${user.activePetId}"]`) as HTMLElement | null;
          if (activeCard) { const r = activeCard.getBoundingClientRect(); if (r.width > 0) { setTargetRect(r); return; } }
        }
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
      (i: any) => i.inventoryId === user!.activePetId || i.id === user!.activePetId
    );
    if (activePet?.isHatched === true) {
      bjSetStep(6);
      setStep(6);
    }
  }, [step, invHatch, user?.activePetId]);

  // ── Step 5: check for hatching potions, show modal if none ────────────────
  useEffect(() => {
    if (step !== 5 || location !== "/" || !invHatch) return;
    const hasHatchPotions = (invHatch as any[]).some(i => i.type === "special" && i.specialType === "hatch_time");
    if (!hasHatchPotions && !potionsGranted) {
      const t = setTimeout(() => setShowPotionModal(true), 700);
      return () => clearTimeout(t);
    } else {
      setShowPotionModal(false);
    }
  }, [step, location, invHatch, potionsGranted]);

  // ── Step 4 rescue: show "Select Egg" if player has no active egg ──────────
  useEffect(() => {
    if (step !== 4 || location !== "/") { setShowRescue(false); return; }
    if (targetRect !== null) { setShowRescue(false); return; }
    // No egg-tap target found — show rescue button after 1s
    const t = setTimeout(() => setShowRescue(true), 1000);
    return () => clearTimeout(t);
  }, [step, location, targetRect]);

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

    if (stepNum === 2) {
      // If the active pet is already an unhatched egg, don't click the toggle
      // (clicking would deactivate it and break the rest of the flow).
      const eggAlreadyActive = user?.activePetId && invCheck &&
        (invCheck as any[]).some((i: any) => i.inventoryId === user!.activePetId && i.isHatched === false);
      if (!eggAlreadyActive) {
        const sel = STEP_SELECTORS[2];
        if (sel) { (document.querySelector(sel) as HTMLElement | null)?.click(); }
      }
      bjSetStep(3);
      setStep(3);
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
      claimRewardMutation.mutate();
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
      claimRewardMutation.mutate();
    } else {
      bjSetStep(next);
      setStep(next);
    }
  }, [step, navigate]);

  // ── Render guard ──────────────────────────────────────────────────────────
  // Keep mounted during reward flash even after step → "done"
  if ((step === null || step === "done") && !showReward) return null;

  // ── Reward flash (shown for 2.2 s after tutorial completes) ─────────────
  if (showReward) {
    return (
      <>
        <style>{`
          @keyframes bj-reward-rise {
            0%   { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.85); }
            15%  { opacity: 1; transform: translateX(-50%) translateY(0px)  scale(1.08); }
            75%  { opacity: 1; transform: translateX(-50%) translateY(0px)  scale(1); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(0.9); }
          }
          @keyframes bj-coin-spin {
            0%   { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
          }
        `}</style>
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 99020, pointerEvents: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            position: "absolute", top: "38%", left: "50%",
            animation: "bj-reward-rise 2.2s ease-out forwards",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 52, display: "inline-block", animation: "bj-coin-spin 0.7s linear infinite" }}>🪙</div>
            <div style={{
              fontFamily: "Lora, Georgia, serif", fontSize: 28, fontWeight: 800,
              color: "#f0d060", letterSpacing: "0.06em",
              textShadow: "0 0 24px rgba(212,168,67,0.9), 0 0 50px rgba(212,168,67,0.5)",
              marginTop: 6,
            }}>+1,500</div>
            <div style={{
              fontFamily: "Lora, Georgia, serif", fontSize: 12, color: "rgba(240,208,96,0.75)",
              letterSpacing: "0.12em", marginTop: 4,
            }}>JOURNEY COMPLETE</div>
          </div>
        </div>
      </>
    );
  }

  const stepNum  = step as number;
  const isFree   = stepNum === FREE_STEP;
  const label    = STEP_LABELS[stepNum];

  // Padded rect for circle spotlight
  const pr = targetRect ? {
    top:    Math.max(0, targetRect.top    - PAD),
    left:   Math.max(0, targetRect.left   - PAD),
    right:  Math.min(window.innerWidth,  targetRect.right  + PAD),
    bottom: Math.min(window.innerHeight, targetRect.bottom + PAD),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  } : null;

  // Circle geometry
  const cx      = pr ? pr.left + pr.width  / 2 : 0;
  const cy      = pr ? pr.top  + pr.height / 2 : 0;
  const radius  = pr ? Math.max(pr.width, pr.height) / 2 : 0;

  const arrowW = 56, arrowH = 70;
  const arrowTop  = pr ? Math.max(8, cy - radius - arrowH - 4) : undefined;
  const arrowLeft = pr ? cx - arrowW / 2 : undefined;
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

      {/* Circle spotlight — skip for free mode */}
      {!isFree && (pr ? (
        <div style={{
          position: "fixed", inset: 0,
          background: `radial-gradient(circle ${radius}px at ${cx}px ${cy}px, transparent ${radius}px, ${OVERLAY_BG} ${radius + 1}px)`,
          zIndex: 99000, pointerEvents: "all",
        }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: OVERLAY_BG, zIndex: 99000, pointerEvents: "all" }} />
      ))}

      {/* Step 4 rescue: "Select Egg" button when no active egg is found */}
      {showRescue && (
        <div style={{
          position: "fixed", bottom: "28%", left: "50%", transform: "translateX(-50%)",
          zIndex: 99005, pointerEvents: "all",
        }}>
          <button
            onClick={() => {
              setShowRescue(false);
              navigate("/pets");
              bjSetStep(2);
              setStep(2);
            }}
            style={{
              background: "linear-gradient(135deg, #1a3d1a 0%, #2a6e2a 100%)",
              border: "2px solid rgba(100,210,100,0.55)",
              color: "#dcfce7",
              fontFamily: "Lora, Georgia, serif",
              fontSize: 15, fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: "pointer",
              padding: "14px 32px",
              borderRadius: 16,
              boxShadow: "0 0 22px rgba(60,180,60,0.45), 0 6px 24px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap",
            }}
          >
            🥚 Select Egg
          </button>
        </div>
      )}

      {/* Circular click forwarder over spotlight — skip for free mode */}
      {!isFree && pr && (
        <div
          onClick={handleForwarderClick}
          style={{
            position: "fixed",
            top: cy - radius, left: cx - radius,
            width: radius * 2, height: radius * 2,
            borderRadius: "50%",
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

      {/* Potion modal (step 5, no hatch-time items) */}
      {showPotionModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99010, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          <div style={{
            background: "linear-gradient(160deg, rgba(8,18,8,0.99) 0%, rgba(15,30,15,0.99) 100%)",
            border: "1.5px solid rgba(212,168,67,0.5)", borderRadius: 20,
            padding: "28px 24px", maxWidth: 320, width: "100%",
            boxShadow: "0 0 40px rgba(212,168,67,0.15), 0 24px 60px rgba(0,0,0,0.85)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧪</div>
            <h3 style={{ fontFamily: "Lora, Georgia, serif", color: "#f0d060", fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: "0.05em" }}>
              {user?.tutorial_hatch_potions_claimed ? "No More Free Potions" : "You Need a Hatching Potion!"}
            </h3>
            <p style={{ fontFamily: "Lora, Georgia, serif", color: "rgba(200,220,180,0.8)", fontSize: 13, lineHeight: 1.55, marginBottom: 20 }}>
              {user?.tutorial_hatch_potions_claimed
                ? "You've already received your free hatching potions. Visit the shop to get more speed-up items!"
                : "Drag a potion onto your egg to speed up hatching. Claim 3 free Small Hatching Potions to get started!"}
            </p>
            {!user?.tutorial_hatch_potions_claimed ? (
              <button
                onClick={() => grantPotionsMutation.mutate()}
                disabled={grantPotionsMutation.isPending}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12,
                  background: grantPotionsMutation.isPending ? "rgba(30,60,20,0.7)" : "linear-gradient(135deg, #3a7a20 0%, #1a5010 100%)",
                  border: "2px solid rgba(212,168,67,0.55)", color: "#f0d060",
                  fontFamily: "Lora, Georgia, serif", fontSize: 14, fontWeight: 700,
                  letterSpacing: "0.08em", cursor: grantPotionsMutation.isPending ? "wait" : "pointer",
                  boxShadow: "0 0 16px rgba(46,160,46,0.3), 0 4px 14px rgba(0,0,0,0.6)",
                }}
              >
                {grantPotionsMutation.isPending ? "Claiming…" : "🧪 Claim 3 Free Potions"}
              </button>
            ) : (
              <button
                onClick={() => setShowPotionModal(false)}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12,
                  background: "linear-gradient(135deg, #3a4a50 0%, #2a3a40 100%)",
                  border: "2px solid rgba(180,140,60,0.4)", color: "#f0d060",
                  fontFamily: "Lora, Georgia, serif", fontSize: 14, fontWeight: 700,
                  letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                Got It
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
