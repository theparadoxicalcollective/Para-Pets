import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import slaughterSlotsLogo from "@assets/uploads/SlaughterSlotsLogo.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import slotMachine from "@assets/uploads/SlotMachine.png";
import slotMachineHandle from "@assets/uploads/SlotMachineHandle.png";
import slotMinusButton from "@assets/uploads/SlotMinusButton.png";
import slotPlusButton from "@assets/uploads/SlotPlusButton.png";
import slotSpinButton from "@assets/uploads/SlotSpinButton.png";
import { currencyAssets } from "@/lib/currencyAssets";
import type { HauntedSlotSymbolId } from "@shared/hauntedCasino";

interface SlotSymbol {
  id: HauntedSlotSymbolId;
  label: string;
  imageUrl: string | null;
}

interface SlotState {
  balances: { coins: number; essence: number };
  betOptions: number[];
  symbols: SlotSymbol[];
}

interface SpinResult {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseBudget(value: string): number {
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function SymbolFace({ symbol }: { symbol: SlotSymbol | undefined }) {
  if (!symbol) return <span className="text-white/40 text-xs">?</span>;
  const src = symbol.imageUrl || STATIC_FALLBACKS[symbol.id];
  return (
    <div className="h-full w-full flex items-center justify-center p-1.5 sm:p-2">
      {src ? (
        <img
          src={src}
          alt={symbol.label}
          draggable={false}
          className="max-h-full max-w-full object-contain select-none"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,.82)) drop-shadow(0 0 7px rgba(168,85,247,.18))" }}
        />
      ) : (
        <span className="font-fantasy text-center text-[9px] sm:text-xs leading-tight text-violet-50 px-1">
          {symbol.label}
        </span>
      )}
    </div>
  );
}

export default function SlaughterSlotsOverlay({
  onClose,
  onCurrencyChanged,
}: SlaughterSlotsOverlayProps) {
  const [state, setState] = useState<SlotState | null>(null);
  const [betIndex, setBetIndex] = useState(0);
  const [reels, setReels] = useState(DEFAULT_REELS);
  const [spinning, setSpinning] = useState(false);
  const [holding, setHolding] = useState(false);
  const [holdSpent, setHoldSpent] = useState(0);
  const [budgetInput, setBudgetInput] = useState("0");
  const [holdNotice, setHoldNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spinTimerRef = useRef<number | null>(null);
  const stateRef = useRef<SlotState | null>(null);
  const betRef = useRef(10);
  const budgetLimitRef = useRef(0);
  const holdSpentRef = useRef(0);
  const holdingRef = useRef(false);
  const spinInFlightRef = useRef(false);

  const applyState = (next: SlotState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
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
        const defaultBudget = Math.min(data.balances.coins, 250);
        setBudgetInput(String(defaultBudget));
        budgetLimitRef.current = defaultBudget;
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Slots could not be loaded");
      });
    return () => {
      cancelled = true;
      holdingRef.current = false;
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const stopForBackground = () => {
      holdingRef.current = false;
      setHolding(false);
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
  const enteredBudget = parseBudget(budgetInput);
  budgetLimitRef.current = enteredBudget;
  const remainingHoldBudget = Math.max(0, enteredBudget - holdSpent);
  const canSpin = Boolean(state && !spinInFlightRef.current && state.balances.coins >= bet);
  const canStartHold = canSpin && enteredBudget >= bet;

  const moveBet = (delta: number) => {
    if (!state || spinning || holding) return;
    setResult(null);
    setError(null);
    setHoldNotice(null);
    setBetIndex((current) => Math.max(0, Math.min(state.betOptions.length - 1, current + delta)));
  };

  const refreshAuthoritativeState = async () => {
    try {
      const response = await fetch("/api/haunted-casino/slots", { credentials: "include" });
      if (!response.ok) return null;
      const data = await response.json() as SlotState;
      applyState(data);
      return data;
    } catch {
      return null;
    }
  };

  const spinOnce = async (): Promise<boolean> => {
    const currentState = stateRef.current;
    const currentBet = betRef.current;
    if (!currentState || spinInFlightRef.current || currentState.balances.coins < currentBet) return false;

    spinInFlightRef.current = true;
    setSpinning(true);
    setResult(null);
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
    }, 72);

    try {
      const response = await fetch("/api/haunted-casino/slots/spin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet: currentBet }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "The reels jammed. Please try again.");

      const remainingAnimation = Math.max(0, 900 - (Date.now() - startedAt));
      if (remainingAnimation) await sleep(remainingAnimation);
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;

      const final = payload as SpinResult;
      setReels(final.reels);
      setResult(final);
      const nextState: SlotState = { ...currentState, balances: final.balances };
      applyState(nextState);
      onCurrencyChanged();
      return true;
    } catch (reason) {
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
      setError(reason instanceof Error ? reason.message : "The reels jammed. Please try again.");
      await refreshAuthoritativeState();
      return false;
    } finally {
      spinInFlightRef.current = false;
      setSpinning(false);
    }
  };

  const stopHold = () => {
    holdingRef.current = false;
    setHolding(false);
  };

  const runHoldLoop = async () => {
    while (holdingRef.current) {
      const stake = betRef.current;
      const limit = budgetLimitRef.current;
      const wallet = stateRef.current?.balances.coins ?? 0;

      if (holdSpentRef.current + stake > limit) {
        setHoldNotice("Max wager reached — release and set a new limit to continue.");
        break;
      }
      if (wallet < stake) {
        setHoldNotice("Your coin balance is below the current bet.");
        break;
      }

      const completed = await spinOnce();
      if (!completed) break;

      // The hold cap is a gross-wager safety limit. Winnings do not reset or
      // increase it, so holding the button can never silently spend more than
      // the exact amount the player chose for this hold session.
      holdSpentRef.current += stake;
      setHoldSpent(holdSpentRef.current);
      if (!holdingRef.current) break;
      await sleep(180);
    }
    holdingRef.current = false;
    setHolding(false);
  };

  const beginHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const currentWallet = stateRef.current?.balances.coins ?? 0;
    const requestedLimit = parseBudget(budgetInput);
    const safeLimit = Math.min(requestedLimit, currentWallet);
    if (safeLimit !== requestedLimit) setBudgetInput(String(safeLimit));
    budgetLimitRef.current = safeLimit;
    if (safeLimit < betRef.current || currentWallet < betRef.current || holdingRef.current) return;

    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    setHoldNotice(null);
    holdSpentRef.current = 0;
    setHoldSpent(0);
    holdingRef.current = true;
    setHolding(true);
    void runHoldLoop();
  };

  const finishHold = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (event) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    stopHold();
  };

  const clampBudgetToWallet = () => {
    const wallet = stateRef.current?.balances.coins ?? 0;
    const next = Math.min(parseBudget(budgetInput), wallet);
    setBudgetInput(String(next));
    budgetLimitRef.current = next;
  };

  const rewardTone = result?.reward.tier === "jackpot"
    ? "text-yellow-200 border-yellow-300/70 shadow-[0_0_28px_rgba(250,204,21,.35)]"
    : result?.reward.tier === "miss"
      ? "text-violet-100 border-violet-300/25"
      : "text-emerald-100 border-emerald-300/45 shadow-[0_0_20px_rgba(52,211,153,.15)]";

  return (
    <div
      className="fixed inset-0 z-[96] overflow-y-auto bg-[#08040d] text-white"
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
          0%,100% { filter: brightness(.92) saturate(.9); }
          50% { filter: brightness(1.18) saturate(1.15); }
        }
      `}</style>

      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background: "radial-gradient(circle at 50% 24%, rgba(87,28,117,.38), transparent 42%), radial-gradient(circle at 50% 90%, rgba(20,83,45,.24), transparent 48%), linear-gradient(180deg,#08040d 0%,#13091e 55%,#07050b 100%)",
        }}
      />

      <button
        type="button"
        aria-label="Close Slaughter Slots"
        onClick={() => { stopHold(); onClose(); }}
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

      <div className="relative z-[98] min-h-full w-full max-w-[720px] mx-auto flex flex-col items-center px-3 pb-8" style={{ paddingTop: "max(20px, env(safe-area-inset-top))" }}>
        <img
          src={slaughterSlotsLogo}
          alt="Slaughter Slots"
          draggable={false}
          className="select-none object-contain mt-1"
          style={{ width: "min(72vw, 430px)", maxHeight: "18vh" }}
        />

        <div className="mt-1 flex items-center justify-center gap-3 sm:gap-5 rounded-full border border-amber-300/25 bg-black/45 px-4 py-1.5 text-xs sm:text-sm backdrop-blur-sm">
          <span className="flex items-center gap-1.5"><img src={currencyAssets.coin} alt="Coins" className="h-5 w-5 object-contain" />{state?.balances.coins ?? "—"}</span>
          <span className="h-4 w-px bg-white/15" />
          <span className="flex items-center gap-1.5"><img src={currencyAssets.essenceToken} alt="Essence" className="h-5 w-5 object-contain" />{state?.balances.essence ?? "—"}</span>
        </div>

        <div className="relative mt-2 w-full" style={{ maxWidth: 520 }}>
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
              animation: spinning ? "slaughterHandlePull .78s cubic-bezier(.25,.8,.25,1) infinite" : undefined,
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
            style={{ left: "19%", top: "31%", width: "62%", height: "22%" }}
          >
            {reels.map((symbolId, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[10%] border border-violet-200/35 backdrop-blur-[3px]"
                style={{
                  background: "linear-gradient(180deg, rgba(105,45,158,.52) 0%, rgba(60,20,102,.42) 48%, rgba(27,7,48,.48) 100%)",
                  boxShadow: "inset 0 0 24px rgba(18,3,34,.78), inset 0 0 9px rgba(216,180,254,.18), 0 0 12px rgba(147,51,234,.18)",
                  animation: spinning ? "slaughterReelGlow .42s ease-in-out infinite" : undefined,
                }}
              >
                <SymbolFace symbol={symbolMap.get(symbolId)} />
              </div>
            ))}
          </div>

          {/* Long blank machine bar: tap once for one spin, or physically hold
              it for repeat spins. The MAX field is a gross-wager safety cap. */}
          <div
            className="absolute z-[6] flex items-stretch gap-[2%]"
            style={{ left: "18%", top: "60.2%", width: "64%", height: "8.8%" }}
          >
            <button
              type="button"
              aria-label="Tap once to spin or hold to keep spinning"
              onPointerDown={beginHold}
              onPointerUp={finishHold}
              onPointerCancel={finishHold}
              onLostPointerCapture={() => stopHold()}
              disabled={!canStartHold}
              className="relative flex flex-[1.35] items-center justify-center overflow-hidden rounded-[14%] border border-emerald-300/35 bg-black/30 disabled:opacity-40 select-none"
              style={{
                touchAction: "none",
                boxShadow: holding ? "inset 0 0 18px rgba(34,197,94,.35), 0 0 12px rgba(168,85,247,.36)" : "inset 0 0 15px rgba(0,0,0,.62)",
                animation: holding ? "slaughterHoldPulse .72s ease-in-out infinite" : undefined,
              }}
            >
              <img
                src={slotSpinButton}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain opacity-20"
              />
              <span className="relative z-[1] text-center leading-none">
                <span className="block font-fantasy text-[clamp(10px,2.5vw,15px)] tracking-[.13em] text-emerald-100">{holding ? "HOLDING" : "HOLD"}</span>
                <span className="mt-0.5 block text-[clamp(6px,1.55vw,9px)] uppercase tracking-[.08em] text-violet-100/75">tap = 1 spin</span>
              </span>
            </button>

            <label className="flex flex-1 flex-col items-center justify-center rounded-[14%] border border-violet-200/25 bg-black/40 px-1 shadow-[inset_0_0_12px_rgba(88,28,135,.35)]">
              <span className="text-[clamp(6px,1.55vw,9px)] uppercase tracking-[.12em] text-violet-100/65">Max coins</span>
              <input
                aria-label="Maximum coins to spend while holding"
                inputMode="numeric"
                pattern="[0-9]*"
                type="number"
                min={0}
                max={state?.balances.coins ?? 0}
                step={1}
                value={budgetInput}
                disabled={!state || holding || spinning}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setBudgetInput(event.target.value.replace(/[^0-9]/g, ""))}
                onBlur={clampBudgetToWallet}
                className="w-full min-w-0 bg-transparent text-center font-fantasy text-[clamp(9px,2.5vw,14px)] text-amber-100 outline-none disabled:opacity-70"
              />
            </label>
          </div>

          {/* Small blank machine bar: compact - / BET / + controls live here. */}
          <div
            className="absolute z-[7] flex items-center justify-center"
            style={{ left: "28%", top: "71.7%", width: "44%", height: "7.4%" }}
          >
            <button
              type="button"
              aria-label="Decrease bet"
              onClick={() => moveBet(-1)}
              disabled={!state || spinning || holding || betIndex <= 0}
              className="h-full aspect-square disabled:opacity-30 active:scale-95 transition-transform"
              style={{ background: "transparent", border: 0, padding: "1%" }}
            >
              <img src={slotMinusButton} alt="" className="block h-full w-full object-contain" draggable={false} />
            </button>

            <div className="flex min-w-0 flex-1 flex-col items-center justify-center leading-none">
              <span className="text-[clamp(6px,1.55vw,9px)] uppercase tracking-[.18em] text-amber-100/65">Bet</span>
              <span className="mt-0.5 flex items-center justify-center gap-0.5 font-fantasy text-[clamp(9px,2.7vw,15px)] text-amber-100">
                <img src={currencyAssets.coin} alt="" className="h-[1.05em] w-[1.05em] object-contain" />{bet}
              </span>
            </div>

            <button
              type="button"
              aria-label="Increase bet"
              onClick={() => moveBet(1)}
              disabled={!state || spinning || holding || betIndex >= (state?.betOptions.length ?? 1) - 1}
              className="h-full aspect-square disabled:opacity-30 active:scale-95 transition-transform"
              style={{ background: "transparent", border: 0, padding: "1%" }}
            >
              <img src={slotPlusButton} alt="" className="block h-full w-full object-contain" draggable={false} />
            </button>
          </div>
        </div>

        <div className="mt-1 min-h-[18px] text-center text-[10px] sm:text-xs text-violet-100/80">
          {holding
            ? `Hold wager: ${holdSpent} / ${enteredBudget} coins · ${remainingHoldBudget} remaining`
            : `Hold limit: ${enteredBudget} coins · change MAX before holding`}
        </div>

        {!spinning && state && state.balances.coins < bet && (
          <div className="mt-1 text-xs text-rose-200">Not enough coins for this bet.</div>
        )}
        {!spinning && state && enteredBudget < bet && (
          <div className="mt-1 text-xs text-amber-200">MAX must be at least the current bet to spin.</div>
        )}
        {holdNotice && <div className="mt-1 text-xs text-amber-100">{holdNotice}</div>}
        {spinning && <div className="mt-1 text-xs uppercase tracking-[.25em] text-violet-200">The house is spinning…</div>}
        {error && <div className="mt-2 max-w-md rounded-lg border border-rose-300/30 bg-rose-950/45 px-3 py-2 text-center text-sm text-rose-100">{error}</div>}

        {result && !spinning && (
          <div className={`mt-3 w-full max-w-[480px] rounded-xl border bg-black/55 px-4 py-3 text-center ${rewardTone}`}>
            <div className="font-fantasy text-base sm:text-lg">{result.reward.message}</div>
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

        <div className="mt-4 w-full max-w-[500px] rounded-xl border border-violet-200/15 bg-black/35 px-3 py-2 text-center text-[10px] sm:text-xs leading-relaxed text-violet-100/75">
          Bets and winnings use your normal Para Pets coin balance. Tap HOLD for one spin or keep it pressed to repeat; MAX is the most total coins that hold session may wager, even if you win coins back. Three edible, fish, or mystery symbols can award real non-pet catalog items. Higher-rarity and higher-value items have sharply lower prize weights.
        </div>
      </div>
    </div>
  );
}
