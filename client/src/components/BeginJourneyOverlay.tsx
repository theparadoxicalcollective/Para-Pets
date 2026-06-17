import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { bjGetStep, bjSetStep, bjGetStatus, BJ_EVENT, bjSetStep5FakeMode, bjSetStep5TapMode, bjIsStep5FakeMode } from "@/lib/beginJourney";
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
  "Drag a hatch potion onto your egg to reduce hatch time!",
  "Tap to finish your journey!",
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

const FREE_STEP = -1; // no step is "free" — step 5 uses dark overlay with elevated sheet

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
  const [potionRect, setPotionRect]           = useState<TargetRect | null>(null);
  const [eggOnHomeRect, setEggOnHomeRect]     = useState<TargetRect | null>(null);
  const [eggReadyToHatch, setEggReadyToHatch] = useState(false);
  const [step5TapMode,    setStep5TapMode]    = useState(false);
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

      // Step 5: spotlight the egg + track potions for ghost animation.
      // Sheet is elevated (z-99002) above overlay; backdrop has pointer-events:none
      // so it can't close the sheet. Potions are directly interactive.
      if (stepNum === 5) {
        const potionEl = document.querySelector('[data-testid^="button-speedup-"]') as HTMLElement | null;
        const eggEl    = document.querySelector('[data-testid="button-egg-tap"]')    as HTMLElement | null;
        setPotionRect(potionEl ? (() => { const r = potionEl.getBoundingClientRect(); return r.width > 0 ? r : null; })() : null);
        setEggOnHomeRect(eggEl  ? (() => { const r = eggEl.getBoundingClientRect();   return r.width > 0 ? r : null; })() : null);
        // Spotlight the egg so it's visible through the dark overlay
        if (eggEl) {
          const r = eggEl.getBoundingClientRect();
          if (r.width > 0) { setTargetRect(r); return; }
        }
        setTargetRect(null);
        return;
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

  // ── Step 5: check for hatching potions; auto-grant if none ───────────────
  useEffect(() => {
    if (step !== 5 || location !== "/" || !invHatch) return;
    const hasHatchPotions = (invHatch as any[]).some(i => i.type === "special" && i.specialType === "hatch_time");
    if (hasHatchPotions || potionsGranted) {
      setShowPotionModal(false);
      return;
    }
    // No potions: silently attempt auto-grant first.
    // Only show the modal (as fallback) if grant has already been claimed.
    if (!grantPotionsMutation.isPending && !grantPotionsMutation.isSuccess) {
      grantPotionsMutation.mutate(undefined, {
        onError: () => {
          // Grant already claimed — show modal so player sees "No More Free Potions"
          setShowPotionModal(true);
        },
      });
    }
  }, [step, location, invHatch, potionsGranted]);

  // ── Step 5: detect egg ready to hatch ────────────────────────────────────
  useEffect(() => {
    if (step !== 5 || !invHatch || !user?.activePetId) { setEggReadyToHatch(false); return; }
    const egg = (invHatch as any[]).find(
      (i: any) => (i.inventoryId === user!.activePetId || i.id === user!.activePetId) && i.isHatched === false
    );
    if (!egg) { setEggReadyToHatch(false); return; }
    // Only ready when hatch has STARTED and elapsed time has passed.
    // An egg with no hatchStartedAt / hatchTime has NOT started hatching — not ready.
    const ready = !!(egg.hatchStartedAt && egg.hatchTime &&
      (Date.now() - new Date(egg.hatchStartedAt).getTime()) >= egg.hatchTime * 3_600_000);
    setEggReadyToHatch(ready);
  }, [step, invHatch, user?.activePetId]);

  // ── Step 5 → 6: advance when player uses a real speed-up potion ─────────
  useEffect(() => {
    const handler = () => {
      if (bjGetStep() === 5) { bjSetStep(6); setStep(6); }
    };
    window.addEventListener("bj_speedup_used", handler);
    return () => window.removeEventListener("bj_speedup_used", handler);
  }, []);

  // ── Step 5: if egg already ready, mark fake mode (keep sheet open) ────────
  useEffect(() => {
    if (step === 5 && eggReadyToHatch) {
      bjSetStep5FakeMode(true);
    }
    return () => { bjSetStep5FakeMode(false); };
  }, [step, eggReadyToHatch]);

  // ── Step 5: reset tap-mode when leaving step 5 ───────────────────────────
  useEffect(() => {
    if (step !== 5) { setStep5TapMode(false); bjSetStep5FakeMode(false); }
  }, [step]);

  // ── Step 5 fake speedup done → lift overlay, close sheet, enter tap mode ──
  useEffect(() => {
    const handler = () => {
      bjSetStep5FakeMode(false);
      bjSetStep5TapMode(true);
      setStep5TapMode(true);
      window.dispatchEvent(new CustomEvent("bj_close_speedup"));
    };
    window.addEventListener("bj_fake_speedup_done", handler);
    return () => window.removeEventListener("bj_fake_speedup_done", handler);
  }, []);

  // ── Step 5: add body class to hide egg-drop-zone in speed-up sheet ────────
  useEffect(() => {
    if (step === 5) document.body.classList.add("bj-step5");
    else { document.body.classList.remove("bj-step5"); bjSetStep5TapMode(false); }
    return () => { document.body.classList.remove("bj-step5"); bjSetStep5TapMode(false); };
  }, [step]);

  // ── Step 5: ensure speed-up sheet is open whenever this step is active ────
  useEffect(() => {
    if (step !== 5) return;
    // Dispatch after a short delay to let the page finish rendering
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("bj_open_speedup"));
    }, 150);
    return () => clearTimeout(t);
  }, [step]);

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
      // Quest icon visible — mark complete; player navigates to quest log themselves
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
  const label    = step5TapMode
    ? "Your egg is ready — tap it to hatch!"
    : STEP_LABELS[stepNum];

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
        @keyframes bj-drag-ghost {
          0%   { opacity: 0;    transform: translate(0, 0) scale(0.7); }
          12%  { opacity: 1;    transform: translate(0, 0) scale(1); }
          70%  { opacity: 0.85; transform: translate(0, var(--bj-drag-dy)) scale(1.15); }
          88%  { opacity: 0;    transform: translate(0, var(--bj-drag-dy)) scale(0.9); }
          100% { opacity: 0;    transform: translate(0, 0) scale(0.7); }
        }
        .bj-step5 [data-bj="egg-drop-zone"]   { display: none !important; }
        .bj-step5 [data-bj="speedup-sheet"]   { z-index: 99002 !important; }
        .bj-step5 [data-bj="speedup-backdrop"] { pointer-events: none !important; opacity: 0 !important; }
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

      {/* Circle spotlight — skip for free mode and step-5 tap mode */}
      {!isFree && !step5TapMode && (pr ? (
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

      {/* Circular click forwarder over spotlight — skip for free mode and step 5 (potions are the target) */}
      {!isFree && stepNum !== 5 && pr && (
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

      {/* Step 5 drag-ghost animation: arrow sweeps from LEFT of potion card up to egg.
          No static bounce-arrow on top of the potion — just this sweeping ghost to the left. */}
      {stepNum === 5 && potionRect && eggOnHomeRect && !step5TapMode && (() => {
        // Start the ghost 54px to the LEFT of the potion card's left edge, vertically centered
        const fromCx = potionRect.left - 54;
        const fromCy = potionRect.top  + potionRect.height / 2;
        const dy = (eggOnHomeRect.top + eggOnHomeRect.height / 2) - fromCy;
        return (
          <div style={{
            position: "fixed",
            left: fromCx - 17,
            top:  fromCy - 22,
            width: 34, height: 44,
            zIndex: 99006,
            pointerEvents: "none",
            animation: "bj-drag-ghost 2.3s ease-in-out infinite",
            ["--bj-drag-dy" as string]: `${dy}px`,
          } as React.CSSProperties}>
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              width: 50, height: 50, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(212,168,67,0.65) 0%, rgba(212,168,67,0.2) 50%, transparent 72%)",
              pointerEvents: "none",
            }} />
            <img src={tutorialArrow} alt="" style={{
              width: "100%", height: "100%",
              objectFit: "contain",
              transform: "rotate(-90deg)",
              display: "block",
              position: "relative",
            }} />
          </div>
        );
      })()}

      {/* Step 5 — single tutorial potion card rendered INSIDE the overlay at z-99003.
          This is the only interactive potion; the speed-up sheet is hidden during step 5.
          Positioned at the bottom-center so the ghost arrow sweeps straight up to the egg. */}
      {stepNum === 5 && !step5TapMode && (() => {
        const invHatchArr = (invHatch as any[] | undefined) ?? [];
        const tutPotion = invHatchArr.find(
          (i: any) => i.type === "special" && i.specialType === "hatch_time"
        );
        if (!tutPotion) return null;

        // The mutation expects the pet's INVENTORY row ID (inventoryId on the egg row),
        // NOT user.activePetId (which is the pet template/selection ID).
        // Find the egg row in invHatch so we get the correct inventoryId.
        const eggRow = invHatchArr.find(
          (i: any) =>
            (i.inventoryId === user?.activePetId || i.id === user?.activePetId) &&
            i.isHatched === false
        );
        const petInvId = eggRow?.inventoryId ?? user?.activePetId;

        const onPotionDown = (e: React.PointerEvent<HTMLDivElement>) => {
          e.preventDefault();
          const pid = e.pointerId;
          const onUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pid) return;
            document.removeEventListener("pointerup",     onUp);
            document.removeEventListener("pointercancel", onUp);
            if (bjIsStep5FakeMode()) {
              // Egg already ready — just simulate the use and show tap-egg step
              window.dispatchEvent(new CustomEvent("bj_fake_speedup_done"));
            } else {
              // Fire the real speed-up mutation via HomePage's event listener
              window.dispatchEvent(new CustomEvent("bj_step5_use_potion", {
                detail: {
                  petInvId,
                  itemInvId:     tutPotion.inventoryId,
                  specialAmount: tutPotion.specialAmount,
                },
              }));
            }
          };
          document.addEventListener("pointerup",     onUp);
          document.addEventListener("pointercancel", onUp);
        };

        return (
          <div
            key="tutorial-potion"
            data-testid="button-speedup-tutorial"
            style={{
              position:  "fixed",
              bottom:    48,
              left:      "50%",
              transform: "translateX(-50%)",
              zIndex:    99003,
              touchAction: "none",
              userSelect:  "none",
              cursor:      "grab",
            }}
            onPointerDown={onPotionDown}
          >
            <div style={{
              background:   "linear-gradient(135deg,rgba(28,13,3,0.97) 0%,rgba(16,7,1,0.99) 100%)",
              border:       "2px solid rgba(240,192,64,0.95)",
              borderRadius: 20,
              padding:      "20px 28px",
              display:      "flex",
              flexDirection:"column",
              alignItems:   "center",
              gap:          10,
              boxShadow:    "0 0 48px rgba(240,192,64,0.5),0 0 90px rgba(240,192,64,0.15),0 14px 40px rgba(0,0,0,0.9)",
              minWidth:     120,
            }}>
              {tutPotion.imageUrl
                ? <img src={tutPotion.imageUrl} alt={tutPotion.name}
                    style={{ width: 64, height: 64, objectFit: "contain",
                             filter: "drop-shadow(0 0 10px rgba(240,192,64,0.7))" }} />
                : <span style={{ fontSize: 40 }}>🧪</span>
              }
              <span style={{
                fontFamily: "Lora,Georgia,serif", color: "#f0d060",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textAlign: "center",
              }}>
                {tutPotion.name}
              </span>
              <span style={{
                background: "rgba(240,192,64,0.18)", color: "#f0c040",
                fontFamily: "Lora,Georgia,serif", fontSize: 10, fontWeight: 600,
                padding: "3px 10px", borderRadius: 99, letterSpacing: "0.06em",
              }}>
                -{tutPotion.specialAmount ?? "?"}min
              </span>
            </div>
          </div>
        );
      })()}

      {/* Step 5 tap-mode: bouncing arrow above the egg guides the player to hatch */}
      {stepNum === 5 && step5TapMode && pr && (
        <div style={{
          position: "fixed",
          top:  Math.max(8, cy - radius - 80),
          left: cx - 17,
          width: 34, height: 44,
          zIndex: 99003, pointerEvents: "none",
          animation: "bj-bounce 0.7s ease-in-out infinite",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 44, height: 44, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,168,67,0.6) 0%, rgba(212,168,67,0.15) 55%, transparent 75%)",
            pointerEvents: "none",
          }} />
          <img src={tutorialArrow} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", position: "relative" }} />
        </div>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 99010, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", pointerEvents: "none" }}>
          <div style={{
            background: "linear-gradient(160deg, rgba(8,18,8,0.99) 0%, rgba(15,30,15,0.99) 100%)",
            border: "1.5px solid rgba(212,168,67,0.5)", borderRadius: 20,
            padding: "28px 24px", maxWidth: 320, width: "100%",
            boxShadow: "0 0 40px rgba(212,168,67,0.15), 0 24px 60px rgba(0,0,0,0.85)",
            textAlign: "center", pointerEvents: "auto",
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
        <div style={{ position: "fixed", inset: 0, zIndex: 99010, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px", pointerEvents: "none" }}>
          <div style={{
            background: "linear-gradient(160deg, rgba(8,18,8,0.99) 0%, rgba(15,30,15,0.99) 100%)",
            border: "1.5px solid rgba(212,168,67,0.5)", borderRadius: 20,
            padding: "28px 24px", maxWidth: 320, width: "100%",
            boxShadow: "0 0 40px rgba(212,168,67,0.15), 0 24px 60px rgba(0,0,0,0.85)",
            textAlign: "center", pointerEvents: "auto",
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
