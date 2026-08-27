import { useEffect, useMemo, useRef, useState } from "react";
import slaughterSlotsLogo from "@assets/uploads/SlaughterSlotsLogo.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import slotMachine from "@assets/uploads/SlotMachine.png";
import slotMachineHandle from "@assets/uploads/SlotMachineHandle.png";
import slotMinusButton from "@assets/uploads/SlotMinusButton.png";
import slotPlusButton from "@assets/uploads/SlotPlusButton.png";
import slotSpinButton from "@assets/uploads/SlotSpinButton.png";
import coinIcon from "@assets/icon_coin.png";
import essenceIcon from "@assets/Photoroom_20260709_24152_PM_1783626130265.png";
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
  coin: coinIcon,
  essence: essenceIcon,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
          style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.7))" }}
        />
      ) : (
        <span className="font-fantasy text-center text-[10px] sm:text-xs leading-tight text-amber-100 px-1">
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
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spinTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/haunted-casino/slots", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Slots could not be loaded");
        return response.json() as Promise<SlotState>;
      })
      .then((data) => {
        if (cancelled) return;
        setState(data);
        const affordable = data.betOptions.findIndex((amount) => amount <= data.balances.coins);
        setBetIndex(affordable >= 0 ? affordable : 0);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Slots could not be loaded");
      });
    return () => {
      cancelled = true;
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
    };
  }, []);

  const symbolMap = useMemo(() => {
    const map = new Map<HauntedSlotSymbolId, SlotSymbol>();
    for (const symbol of state?.symbols ?? []) map.set(symbol.id, symbol);
    return map;
  }, [state]);

  const bet = state?.betOptions[betIndex] ?? 10;
  const canSpin = Boolean(state && !spinning && state.balances.coins >= bet);

  const moveBet = (delta: number) => {
    if (!state || spinning) return;
    setResult(null);
    setError(null);
    setBetIndex((current) => Math.max(0, Math.min(state.betOptions.length - 1, current + delta)));
  };

  const spin = async () => {
    if (!state || !canSpin) return;
    setSpinning(true);
    setResult(null);
    setError(null);
    const startedAt = Date.now();
    const ids = state.symbols.map((symbol) => symbol.id);

    spinTimerRef.current = window.setInterval(() => {
      if (!ids.length) return;
      setReels([
        ids[Math.floor(Math.random() * ids.length)],
        ids[Math.floor(Math.random() * ids.length)],
        ids[Math.floor(Math.random() * ids.length)],
      ] as [HauntedSlotSymbolId, HauntedSlotSymbolId, HauntedSlotSymbolId]);
    }, 75);

    try {
      const response = await fetch("/api/haunted-casino/slots/spin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "The reels jammed. Please try again.");
      const remaining = Math.max(0, 950 - (Date.now() - startedAt));
      if (remaining) await sleep(remaining);
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
      const final = payload as SpinResult;
      setReels(final.reels);
      setResult(final);
      setState((previous) => previous ? { ...previous, balances: final.balances } : previous);
      onCurrencyChanged();
    } catch (reason) {
      if (spinTimerRef.current != null) window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
      setError(reason instanceof Error ? reason.message : "The reels jammed. Please try again.");
      // Refresh authoritative balances after any rejected/failed request.
      fetch("/api/haunted-casino/slots", { credentials: "include" })
        .then((response) => response.ok ? response.json() : null)
        .then((data: SlotState | null) => data && setState(data))
        .catch(() => undefined);
    } finally {
      setSpinning(false);
    }
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
          0%,100% { box-shadow: inset 0 0 13px rgba(16,8,25,.88), 0 0 9px rgba(168,85,247,.14); }
          50% { box-shadow: inset 0 0 16px rgba(16,8,25,.95), 0 0 18px rgba(168,85,247,.48); }
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
        onClick={onClose}
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
          <span className="flex items-center gap-1.5"><img src={coinIcon} alt="Coins" className="h-5 w-5 object-contain" />{state?.balances.coins ?? "—"}</span>
          <span className="h-4 w-px bg-white/15" />
          <span className="flex items-center gap-1.5"><img src={essenceIcon} alt="Essence" className="h-5 w-5 object-contain" />{state?.balances.essence ?? "—"}</span>
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

          {/* Reel windows intentionally use percentage anchors so the blank
              SlotMachine artwork can be retuned without changing game logic. */}
          <div
            className="absolute z-[4] grid grid-cols-3 gap-[2.5%]"
            style={{ left: "19%", top: "31%", width: "62%", height: "22%" }}
          >
            {reels.map((symbolId, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[10%] border border-violet-100/25 bg-[#e8dcc6]/95"
                style={{ animation: spinning ? "slaughterReelGlow .42s ease-in-out infinite" : undefined }}
              >
                <SymbolFace symbol={symbolMap.get(symbolId)} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-1 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Decrease bet"
            onClick={() => moveBet(-1)}
            disabled={!state || spinning || betIndex <= 0}
            className="disabled:opacity-35 active:scale-95 transition-transform"
            style={{ width: "clamp(44px, 12vw, 58px)", background: "transparent", border: 0, padding: 0 }}
          >
            <img src={slotMinusButton} alt="" className="block w-full h-auto" draggable={false} />
          </button>

          <div className="min-w-[105px] rounded-xl border border-amber-300/40 bg-black/65 px-4 py-2 text-center shadow-[inset_0_0_14px_rgba(168,85,247,.15)]">
            <div className="text-[10px] uppercase tracking-[.2em] text-amber-100/70">Bet</div>
            <div className="font-fantasy text-lg text-amber-100 flex items-center justify-center gap-1"><img src={coinIcon} alt="" className="h-5 w-5 object-contain" />{bet}</div>
          </div>

          <button
            type="button"
            aria-label="Increase bet"
            onClick={() => moveBet(1)}
            disabled={!state || spinning || betIndex >= (state?.betOptions.length ?? 1) - 1}
            className="disabled:opacity-35 active:scale-95 transition-transform"
            style={{ width: "clamp(44px, 12vw, 58px)", background: "transparent", border: 0, padding: 0 }}
          >
            <img src={slotPlusButton} alt="" className="block w-full h-auto" draggable={false} />
          </button>
        </div>

        <button
          type="button"
          aria-label="Spin Slaughter Slots"
          onClick={spin}
          disabled={!canSpin}
          className="mt-2 disabled:opacity-45 active:scale-95 transition-transform"
          style={{ width: "min(48vw, 210px)", background: "transparent", border: 0, padding: 0 }}
        >
          <img src={slotSpinButton} alt="Spin" className="block w-full h-auto" draggable={false} />
        </button>

        {!spinning && state && state.balances.coins < bet && (
          <div className="mt-2 text-xs text-rose-200">Not enough coins for this bet.</div>
        )}
        {spinning && <div className="mt-2 text-xs uppercase tracking-[.25em] text-violet-200">The house is spinning…</div>}
        {error && <div className="mt-2 max-w-md rounded-lg border border-rose-300/30 bg-rose-950/45 px-3 py-2 text-center text-sm text-rose-100">{error}</div>}

        {result && !spinning && (
          <div className={`mt-3 w-full max-w-[480px] rounded-xl border bg-black/55 px-4 py-3 text-center ${rewardTone}`}>
            <div className="font-fantasy text-base sm:text-lg">{result.reward.message}</div>
            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              {result.reward.coins > 0 && <span>+{result.reward.coins} coins</span>}
              {result.reward.essence > 0 && <span>+{result.reward.essence} essence</span>}
              {result.reward.pvpTickets > 0 && <span>+{result.reward.pvpTickets} PvP ticket{result.reward.pvpTickets === 1 ? "" : "s"}</span>}
              {result.reward.itemGranted && <span>+1 {result.reward.itemGranted.name}</span>}
              {result.reward.tier === "miss" && <span>No prize this spin</span>}
            </div>
          </div>
        )}

        <div className="mt-4 w-full max-w-[500px] rounded-xl border border-violet-200/15 bg-black/35 px-3 py-2 text-center text-[10px] sm:text-xs leading-relaxed text-violet-100/75">
          Three matching symbols pay the largest prizes. Two matching symbols can still pay. Three skulls are the jackpot; three koi or three potions award the matching item. Coin + essence + skull is a hidden Haunted Trio. Bets are capped and there is no auto-spin.
        </div>
      </div>
    </div>
  );
}
