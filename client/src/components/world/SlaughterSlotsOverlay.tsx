import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import casinoBackground from "@assets/uploads/HauntedCasinoMainBG.png";
import slaughterSlotsLogo from "@assets/uploads/SlaughterSlotsLogo.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import slotMachine from "@assets/uploads/SlotMachine.png";
import slotMachineHandle from "@assets/uploads/SlotMachineHandle.png";
import slotMinusButton from "@assets/uploads/SlotMinusButton.png";
import slotPlusButton from "@assets/uploads/SlotPlusButton.png";
import { currencyAssets } from "@/lib/currencyAssets";
import SlotPrizeAdminDialog from "./SlotPrizeAdminDialog";
import SlotPrizeStrip from "./SlotPrizeStrip";
import { queryClient } from "@/lib/queryClient";
import type { HauntedSlotPrizePreview, HauntedSlotSymbolId } from "@shared/hauntedCasino";

interface SlotSymbol {
  id: HauntedSlotSymbolId;
  label: string;
  imageUrl: string | null;
}

interface SlotState {
  balances: { coins: number; essence: number };
  betOptions: number[];
  symbols: SlotSymbol[];
  prizes?: HauntedSlotPrizePreview[];
}

interface SpinResult {
  symbols: SlotSymbol[];
  bet: number;
  reels: [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId];
  reward: {
    tier: "jackpot" | "triple" | "pair" | "combo" | "miss";
    message: string;
    coins: number;
    essence: number;
    pvpTickets: number;
    itemGranted: { id: string; name: string; imageUrl: string | null } | null;
    usedFallbackEssence: boolean;
  };
  balances: { coins: number; essence: number };
}

interface SlaughterSlotsOverlayProps {
  isAdmin?: boolean;
  onClose: () => void;
  onCurrencyChanged: () => void;
}

const DEFAULT_REELS: [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId] = [
  "coin",
  "essence",
  "skull",
];

const STATIC_FALLBACKS: Partial<Record<HauntedSlotSymbolId, string>> = {
  coin: currencyAssets.coin,
  essence: currencyAssets.essenceToken,
};

const REEL_TICK_MS = 150;
const MINIMUM_ROLL_MS = 2200;
const REEL_STOP_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SymbolFace({ symbol, spinning }: { symbol: SlotSymbol | undefined; spinning: boolean }) {
  if (!symbol) return <span className="text-white/40 text-xs">?</span>;
  const src = symbol.imageUrl || STATIC_FALLBACKS[symbol.id];
  return (
    <div
      className="relative h-full w-full flex items-center justify-center p-1.5 sm:p-2"
      style={{ animation: spinning ? "slaughterSymbolRoll .32s linear infinite" : undefined }}
    >
      {src ? (
        <img
          src={src}
          alt={symbol.label}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
          style={{ filter: symbol.id === "egg" ? "grayscale(1) brightness(.65) drop-shadow(0 2px 4px #000)" : "drop-shadow(0 2px 4px rgba(0,0,0,.82)) drop-shadow(0 0 7px rgba(168,85,247,.18))" }}
        />
      ) : (
        <span className="font-fantasy text-center text-[9px] sm:text-xs leading-tight text-violet-50 px-1">
          {symbol.label}
        </span>
      )}
      {symbol.id === "egg" && <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center font-fantasy text-[clamp(26px,7vw,44px)] font-bold text-white" style={{ textShadow: "0 2px 5px #000" }}>?</span>}
    </div>
  );
}

export default function SlaughterSlotsOverlay({
  isAdmin = false,
  onClose,
  onCurrencyChanged,
}: SlaughterSlotsOverlayProps) {
  const [prizeEditor, setPrizeEditor] = useState<"items" | "eggs" | null>(null);
  const [state, setState] = useState<SlotState | null>(null);
  const [betIndex, setBetIndex] = useState(0);
  const [reels, setReels] = useState(DEFAULT_REELS);
  const [spinning, setSpinning] = useState(false);
  const [settledReels, setSettledReels] = useState(3);
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spinTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const holdGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const stateRef = useRef<SlotState | null>(null);
  const betRef = useRef(10);
  const holdingRef = useRef(false);
  const spinInFlightRef = useRef(false);

  const applyState = (next: SlotState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;
    fetch("/api/haunted-casino/slots", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Slots could not be loaded");
        return response.json() as Promise<SlotState>;
      })
      .then((data) => {
        if (cancelled) return;
        applyState(data);
        const affordable = data.betOptions.findIndex((amount) => amount <= data.balances.coins);
        const initialBetIndex = affordable >= 0 ? affordable : 0;
        setBetIndex(initialBetIndex);
        betRef.current = data.betOptions[initialBetIndex] ?? 10;
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Slots could not be loaded");
      });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      holdingRef.current = false;
      holdGenerationRef.current++;
      if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const stopForBackground = () => {
      stopHold();
    };
    const onVisibility = () => {
      if (document.hidden) stopForBackground();
    };
    window.addEventListener("blur", stopForBackground);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", stopForBackground);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const symbolMap = useMemo(() => {
    const map = new Map<HauntedSlotSymbolId, SlotSymbol>();
    for (const symbol of state?.symbols ?? []) map.set(symbol.id, symbol);
    return map;
  }, [state]);

  const bet = state?.betOptions[betIndex] ?? 10;
  betRef.current = bet;
  const canSpin = Boolean(state && !spinInFlightRef.current && state.balances.coins >= bet);
  const canStartHold = holding || canSpin;

  const moveBet = (delta: number) => {
    if (!state || spinning || holding) return;
    setResult(null);
    setError(null);
    setBetIndex((current) => Math.max(0, Math.min(state.betOptions.length - 1, current + delta)));
  };

  const refreshAuthoritativeState = async () => {
    try {
      const response = await fetch("/api/haunted-casino/slots", { credentials: "include" });
      if (!response.ok) return null;
      const data = await response.json() as SlotState;
      if (mountedRef.current) applyState(data);
      return data;
    } catch {
      return null;
    }
  };

  const spinOnce = async (): Promise<boolean> => {
    const currentState = stateRef.current;
    const currentBet = betRef.current;
    if (!mountedRef.current || !currentState || spinInFlightRef.current || currentState.balances.coins < currentBet) return false;

    spinInFlightRef.current = true;
    setSpinning(true);
    setSettledReels(0);
    // Keep the last result readable while the next automatic spin runs.
    setError(null);
    const startedAt = Date.now();
    const ids = currentState.symbols.map((symbol) => symbol.id);

    spinTimerRef.current = window.setInterval(() => {
      if (!ids.length) return;
      setReels([
        ids[Math.floor(Math.random() * ids.length)],
        ids[Math.floor(Math.random() * ids.length)],
        ids[Math.floor(Math.random() * ids.length)],
      ] as [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId]);
    }, REEL_TICK_MS);

    try {
      const response = await fetch("/api/haunted-casino/slots/spin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet: currentBet }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "The reels jammed. Please try again.");

      const final = payload as SpinResult;
      // A completed paid spin still refreshes ownership if the viewer closed mid-animation.
      onCurrencyChanged();
      if (final.reward.itemGranted) void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });

      const remainingAnimation = Math.max(0, MINIMUM_ROLL_MS - (Date.now() - startedAt));
      if (remainingAnimation) await sleep(remainingAnimation);
      if (!mountedRef.current) return false;
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;

      // Stop the reels from left to right so the result lands with readable
      // slot-machine pacing instead of flashing all three symbols at once.
      setReels((current) => [final.reels[0], current[1], current[2]]);
      setSettledReels(1);
      await sleep(REEL_STOP_DELAY_MS);
      if (!mountedRef.current) return false;
      setReels((current) => [final.reels[0], final.reels[1], current[2]]);
      setSettledReels(2);
      await sleep(REEL_STOP_DELAY_MS);
      if (!mountedRef.current) return false;
      setReels(final.reels);
      setSettledReels(3);
      setResult(final);
      const nextState: SlotState = { ...currentState, balances: final.balances, symbols: final.symbols ?? currentState.symbols };
      applyState(nextState);
      return true;
    } catch (reason) {
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
      if (mountedRef.current) {
        setResult(null);
        setSettledReels(3);
        setError(reason instanceof Error ? reason.message : "The reels jammed. Please try again.");
      }
      await refreshAuthoritativeState();
      return false;
    } finally {
      spinInFlightRef.current = false;
      if (mountedRef.current) setSpinning(false);
    }
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const stopHold = () => {
    clearHoldTimer();
    holdGenerationRef.current++;
    holdingRef.current = false;
    setHolding(false);
  };

  const runHoldLoop = async (generation: number) => {
    while (mountedRef.current && holdingRef.current && generation === holdGenerationRef.current) {
      const completed = await spinOnce();
      if (!completed || !holdingRef.current || generation !== holdGenerationRef.current) break;
      await sleep(180);
    }
    if (generation === holdGenerationRef.current) stopHold();
  };

  const beginHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    suppressClickRef.current = false;
    if (holdingRef.current) {
      suppressClickRef.current = true;
      stopHold();
      return;
    }
    if (!canSpin) return;
    clearHoldTimer();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      suppressClickRef.current = true;
      holdingRef.current = true;
      setHolding(true);
      const generation = ++holdGenerationRef.current;
      void runHoldLoop(generation);
    }, 450);
  };

  const finishHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearHoldTimer();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    // Releasing a long press leaves automatic spins running until the next tap.
  };

  const clickSpin = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (holdingRef.current) stopHold();
    else void spinOnce();
  };

  const rewardTone = result?.reward.tier === "jackpot"
    ? "text-yellow-200 border-yellow-300/70 shadow-[0_0_28px_rgba(250,204,21,.35)]"
    : result?.reward.tier === "miss"
      ? "text-violet-100 border-violet-300/25"
      : "text-emerald-100 border-emerald-300/45 shadow-[0_0_20px_rgba(52,211,153,.15)]";

  return (
    <div
      className="fixed inset-0 z-[96] overflow-hidden bg-[#08040d] text-white"
      data-testid="slaughter-slots-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Slaughter Slots"
      style={{ pointerEvents: "auto", overscrollBehavior: "contain" }}
    >
      <style>{`
        @keyframes slaughterHandlePull {
          0% { transform: rotate(0deg) translateY(0); }
          35% { transform: rotate(18deg) translateY(12px); }
          62% { transform: rotate(13deg) translateY(9px); }
          100% { transform: rotate(0deg) translateY(0); }
        }
        @keyframes slaughterReelGlow {
          0%,100% { box-shadow: inset 0 0 20px rgba(24,5,43,.82), 0 0 9px rgba(168,85,247,.22); }
          50% { box-shadow: inset 0 0 28px rgba(20,3,39,.94), 0 0 20px rgba(192,132,252,.52); }
        }
        @keyframes slaughterHoldPulse {
          0%,100% { filter: brightness(.96) saturate(.96); }
          50% { filter: brightness(1.12) saturate(1.08); }
        }
        @keyframes slaughterSymbolRoll {
          0% { transform: translateY(-8%); }
          50% { transform: translateY(7%); }
          100% { transform: translateY(-8%); }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        data-testid="slaughter-slots-background"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(8,4,13,.68), rgba(8,4,13,.82)), url(${casinoBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <button
        type="button"
        aria-label="Close Slaughter Slots"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); stopHold(); onClose(); }}
        className="fixed right-3 z-[105] active:scale-95 transition-transform"
        style={{
          top: "max(24px, calc(env(safe-area-inset-top) + 12px))",
          width: "clamp(48px, 13vw, 62px)",
          background: "transparent",
          border: 0,
          padding: 0,
        }}
      >
        <img src={slotCloseButton} alt="" draggable={false} className="block w-full h-auto select-none" />
      </button>

      {isAdmin && <div className="absolute left-3 z-[106] flex gap-2" style={{ top: "max(72px, calc(env(safe-area-inset-top) + 60px))" }}>
        {(["items", "eggs"] as const).map(kind => <button key={kind} type="button" disabled={spinning} onClick={() => { stopHold(); setPrizeEditor(kind); }}
          className="min-h-11 rounded-lg border border-amber-300/50 bg-black/80 px-3 text-xs text-amber-100 disabled:opacity-40" aria-label={`Edit slot ${kind} prizes`}>
          <span aria-hidden="true">＋</span> {kind === "eggs" ? "Pet eggs" : "Items"}
        </button>)}
      </div>}
      {isAdmin && prizeEditor && <SlotPrizeAdminDialog kind={prizeEditor} onClose={() => setPrizeEditor(null)} onSaved={refreshAuthoritativeState} />}

      <div className="relative z-[98] h-full min-h-0 w-full max-w-[720px] mx-auto flex flex-col items-center overflow-hidden px-3 pb-2" style={{ paddingTop: "max(24px, calc(env(safe-area-inset-top) + 12px))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div data-testid="slaughter-slots-balances" className="relative z-[12] flex shrink-0 self-start flex-wrap items-center justify-start gap-2 rounded-full border border-amber-300/25 bg-black/60 px-3 py-1.5 text-xs backdrop-blur-sm" style={{ maxWidth: "calc(100% - 72px)" }}>
          <span className="flex items-center gap-1.5"><img src={currencyAssets.coin} alt="Coins" className="h-5 w-5 object-contain" />{state?.balances.coins ?? "—"}</span>
          <span className="h-4 w-px bg-white/15" />
          <span className="flex items-center gap-1.5"><img src={currencyAssets.essenceToken} alt="Essence" className="h-5 w-5 object-contain" />{state?.balances.essence ?? "—"}</span>
        </div>

        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        {/* Keep the logo, machine, reels and controls together above a reserved winnings area.
            Use logical stage height so tablets scale the same composition as phones. */}
        <div data-testid="slaughter-slots-machine-stage" className="relative w-full shrink-0" style={{ maxWidth: 520, width: "min(100%, calc((var(--fh, 100dvh) - 228px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) * .67))" }}>
          <img
            src={slaughterSlotsLogo}
            alt="Slaughter Slots"
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-0 z-[5] select-none object-contain"
            style={{ width: "94%", maxHeight: "calc(var(--fh, 100dvh) * .19)", transform: "translate(-50%, -8%)" }}
          />
          <img
            src={slotMachineHandle}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute select-none"
            style={{
              right: "-3%",
              top: "28%",
              width: "27%",
              zIndex: 0,
              transformOrigin: "42% 82%",
              animation: spinning ? "slaughterHandlePull .78s cubic-bezier(.25,.8,.25,1) 1" : undefined,
            }}
          />
          <img
            src={slotMachine}
            alt="Slaughter Slots machine"
            draggable={false}
            className="relative z-[2] block w-full h-auto select-none"
            style={{ filter: "drop-shadow(0 18px 32px rgba(0,0,0,.65))" }}
          />

          <div
            className="absolute z-[4] grid grid-cols-3 gap-[2.5%]"
            style={{ left: "19%", top: "28%", width: "62%", height: "22%" }}
          >
            {reels.map((symbolId, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[10%] border border-violet-200/35 backdrop-blur-[3px]"
                style={{
                  transform: index === 0 ? "translateX(-4%)" : index === 2 ? "translateX(4%)" : undefined,
                  background: "linear-gradient(180deg, rgba(105,45,158,.52) 0%, rgba(60,20,102,.42) 48%, rgba(27,7,48,.48) 100%)",
                  boxShadow: "inset 0 0 24px rgba(18,3,34,.78), inset 0 0 9px rgba(216,180,254,.18), 0 0 12px rgba(147,51,234,.18)",
                  animation: spinning && index >= settledReels ? "slaughterReelGlow .42s ease-in-out infinite" : undefined,
                }}
              >
                <SymbolFace symbol={symbolMap.get(symbolId)} spinning={spinning && index >= settledReels} />
              </div>
            ))}
          </div>

          {/* Fit the bet controls inside the wide upper inset panel. */}
          <div
            data-testid="slaughter-slots-bet-control"
            className="absolute z-[7] flex items-center justify-between gap-[2.5%] px-[2%]"
            style={{ left: "20%", top: "63%", width: "60%", height: "6.4%" }}
          >
            <button type="button" aria-label="Decrease bet" onClick={() => moveBet(-1)} disabled={!state || spinning || holding || betIndex <= 0} className="h-full aspect-square shrink-0 disabled:opacity-40 active:scale-90 transition-transform" style={{ background: "transparent", border: 0, padding: "2%" }}>
              <img src={slotMinusButton} alt="" className="block h-full w-full object-contain" draggable={false} />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1 leading-none">
              <span className="text-[clamp(7px,1.7vw,10px)] font-semibold uppercase tracking-[.2em] text-amber-100/90">Bet</span>
              <span className="flex items-center justify-center gap-0.5 font-fantasy text-[clamp(10px,2.8vw,16px)] text-amber-50">
                <img src={currencyAssets.coin} alt="" className="h-[1.05em] w-[1.05em] object-contain" />{bet}
              </span>
            </div>
            <button type="button" aria-label="Increase bet" onClick={() => moveBet(1)} disabled={!state || spinning || holding || betIndex >= (state?.betOptions.length ?? 1) - 1} className="h-full aspect-square shrink-0 disabled:opacity-40 active:scale-90 transition-transform" style={{ background: "transparent", border: 0, padding: "2%" }}>
              <img src={slotPlusButton} alt="" className="block h-full w-full object-contain" draggable={false} />
            </button>
          </div>

          {/* Spin now occupies the centered lower control panel. */}
          <button
            data-testid="slaughter-slots-spin-control"
            type="button"
            aria-label={holding ? "Stop automatic spins" : "Spin once, or hold to keep spinning"}
            aria-pressed={holding}
            onPointerDown={beginHold}
            onPointerUp={finishHold}
            onPointerCancel={() => { suppressClickRef.current = true; stopHold(); }}
            onLostPointerCapture={clearHoldTimer}
            onClick={clickSpin}
            onContextMenu={event => event.preventDefault()}
            disabled={!canStartHold}
            className="absolute z-[7] flex flex-col items-center justify-center overflow-hidden rounded-[18%] border border-amber-300/55 bg-gradient-to-b from-emerald-950/95 to-black/85 px-1 disabled:opacity-40 select-none active:scale-[.98] transition-transform"
            style={{
              left: "26.5%",
              top: "72.5%",
              width: "47%",
              height: "7.7%",
              touchAction: "none",
              boxShadow: holding
                ? "inset 0 0 20px rgba(34,197,94,.4), 0 0 15px rgba(250,204,21,.3)"
                : "inset 0 0 16px rgba(0,0,0,.7), 0 0 8px rgba(250,204,21,.14)",
              animation: holding ? "slaughterHoldPulse .86s ease-in-out infinite" : undefined,
            }}
          >
            <span className="font-fantasy text-[clamp(11px,2.9vw,17px)] leading-none tracking-[.16em] text-amber-100">{holding ? "STOP AUTO" : spinning ? "SPINNING" : "SPIN"}</span>
            <span className="mt-1 text-[clamp(5px,1.35vw,8px)] font-semibold uppercase tracking-[.08em] text-emerald-100/80">{holding ? "Tap to stop" : "Tap once · hold for auto"}</span>
          </button>
        </div>

        </div>

        {/* Keep the original 112px footer footprint so prizes never shrink or
            reposition the machine. Winnings float just above the decorative strip. */}
        <div data-testid="slaughter-slots-footer" className="relative w-full shrink-0" style={{ height: 112 }}>
        <div data-testid="slaughter-slots-winnings-area" className="absolute inset-x-0 bottom-20 z-[10] w-full overflow-y-auto" style={{ maxHeight: 112, overscrollBehavior: "contain" }} role="status" aria-live="polite" aria-atomic="true">
        <div className="mt-0 min-h-[16px] shrink-0 text-center text-[9px] sm:text-xs text-violet-100/80" aria-live="polite">
          {holding ? "Auto spin active — tap STOP AUTO to stop" : null}
        </div>

        {!spinning && state && state.balances.coins < bet && (
          <div className="mt-0 text-xs text-rose-200">Not enough coins for this bet.</div>
        )}
        {error && <div className="mt-1 max-w-md rounded-lg border border-rose-300/30 bg-rose-950/45 px-3 py-1.5 text-center text-xs text-rose-100">{error}</div>}

        {result && (
          <div className={`mx-auto mt-1 w-full max-w-[480px] shrink-0 rounded-xl border bg-black/55 px-3 py-1.5 text-center ${rewardTone}`}>
            {spinning && <div className="text-[9px] uppercase tracking-wider text-amber-100/70">Last spin</div>}
            <div className="font-fantasy text-sm sm:text-base">{result.reward.message}</div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              {result.reward.coins > 0 && <span>+{result.reward.coins} coins</span>}
              {result.reward.essence > 0 && <span>+{result.reward.essence} essence</span>}
              {result.reward.pvpTickets > 0 && <span>+{result.reward.pvpTickets} PvP ticket{result.reward.pvpTickets === 1 ? "" : "s"}</span>}
              {result.reward.itemGranted && (
                <span className="inline-flex items-center gap-1">
                  {result.reward.itemGranted.imageUrl && <img src={result.reward.itemGranted.imageUrl} alt="" className="h-6 w-6 object-contain" />}
                  +1 {result.reward.itemGranted.name}
                </span>
              )}
              {result.reward.tier === "miss" && <span>No prize this spin</span>}
            </div>
          </div>
        )}

        </div>

        <SlotPrizeStrip prizes={state?.prizes ?? []} loaded={Boolean(state)} />
        </div>

        <p className="sr-only">
          Bets and winnings use the normal Para Pets coin balance. Tap SPIN once, or hold briefly to start automatic spins. Tap STOP AUTO to stop.
        </p>
      </div>
    </div>
  );
}
