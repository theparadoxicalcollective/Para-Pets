import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import casinoBackground from "@assets/uploads/HauntedCasinoMainBG.png";
import bingoBall from "@assets/uploads/BingoBall.png";
import bingoBallCage from "@assets/uploads/BingoBallCage.png";
import bingoBallCallStand from "@assets/uploads/BingoBallCallStand.png";
import blankBingoCard from "@assets/uploads/BlankBingoCard.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import { currencyAssets } from "@/lib/currencyAssets";
import "./HauntedBingoOverlay.css";
import "./HauntedBingoEconomy.css";

const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;
type BingoLetter = (typeof BINGO_LETTERS)[number];
type BingoCard = Array<Array<number | null>>;

interface BingoBonus {
  key: string;
  amount: number;
}

interface BingoRound {
  id: string;
  status: "active" | "won" | "forfeited";
  card: BingoCard;
  called: number[];
  current: number | null;
  marked: string[];
  bonuses: BingoBonus[];
  entryCost: number;
  freeEntry: boolean;
  remainingCalls: number;
  baseReward: number;
  bonusReward: number;
  createdAt: string | null;
}

interface BingoState {
  balances: { coins: number };
  entryCost: number;
  winReward: number;
  dailyFreeGames: number;
  freeGameAvailable: boolean;
  round: BingoRound | null;
}

interface BingoReward {
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  markedBonusCount: number;
}

type BingoMarkResponse = BingoState & { reward: BingoReward | null };

const EMPTY_CARD: BingoCard = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, column) => row === 2 && column === 2 ? null : 0),
);
const FREE_CELL_KEY = "2-2";
const MINIMUM_SHUFFLE_MS = 560;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bingoLetterFor(value: number): BingoLetter {
  return BINGO_LETTERS[Math.min(4, Math.floor((value - 1) / 15))];
}

function calledLabel(value: number): string {
  return `${bingoLetterFor(value)} ${value}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "Haunted Bingo could not complete that action");
  return payload as T;
}

export default function HauntedBingoOverlay({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<BingoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [autoCall, setAutoCall] = useState(false);
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [reward, setReward] = useState<BingoReward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const callInFlightRef = useRef(false);
  const currencyDirtyRef = useRef(false);

  const round = state?.round ?? null;
  const calledSet = useMemo(() => new Set(round?.called ?? []), [round?.called]);
  const markedSet = useMemo(() => new Set(round?.marked ?? [FREE_CELL_KEY]), [round?.marked]);
  const bonusMap = useMemo(() => {
    const map = new Map<string, BingoBonus>();
    for (const bonus of round?.bonuses ?? []) map.set(bonus.key, bonus);
    return map;
  }, [round?.bonuses]);
  const recentCalls = useMemo(() => [...(round?.called ?? [])].reverse().slice(0, 5), [round?.called]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    fetch("/api/haunted-casino/bingo", { credentials: "include" })
      .then((response) => readJson<BingoState>(response))
      .then((payload) => {
        if (cancelled) return;
        setState(payload);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Haunted Bingo could not be loaded");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const closeBingo = () => {
    setAutoCall(false);
    onClose();
    if (currencyDirtyRef.current) window.setTimeout(() => window.location.reload(), 0);
  };

  const startRound = async () => {
    if (starting) return;
    setStarting(true);
    setAutoCall(false);
    setReward(null);
    setError(null);
    try {
      const response = await fetch("/api/haunted-casino/bingo/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await readJson<BingoState>(response);
      if (!mountedRef.current) return;
      if ((payload.round?.entryCost ?? 0) > 0) currencyDirtyRef.current = true;
      setState(payload);
    } catch (reason) {
      if (mountedRef.current) setError(reason instanceof Error ? reason.message : "Your Bingo card could not be dealt");
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  const callBall = useCallback(async () => {
    const activeRound = state?.round;
    if (!activeRound || activeRound.status !== "active" || activeRound.remainingCalls <= 0 || callInFlightRef.current) return;
    callInFlightRef.current = true;
    setShuffling(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const response = await fetch(`/api/haunted-casino/bingo/${encodeURIComponent(activeRound.id)}/call`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await readJson<BingoState>(response);
      const remaining = Math.max(0, MINIMUM_SHUFFLE_MS - (Date.now() - startedAt));
      if (remaining) await sleep(remaining);
      if (mountedRef.current) setState(payload);
    } catch (reason) {
      if (mountedRef.current) {
        setAutoCall(false);
        setError(reason instanceof Error ? reason.message : "The Bingo cage jammed. Please try again.");
      }
    } finally {
      callInFlightRef.current = false;
      if (mountedRef.current) setShuffling(false);
    }
  }, [state?.round]);

  useEffect(() => {
    if (!autoCall || shuffling || !round || round.status !== "active" || round.remainingCalls <= 0) return;
    const timer = window.setTimeout(() => void callBall(), round.current == null ? 180 : 1900);
    return () => window.clearTimeout(timer);
  }, [autoCall, callBall, round, shuffling]);

  const setCellMarked = async (row: number, column: number, marked: boolean) => {
    if (!round || round.status !== "active") return;
    const key = `${row}-${column}`;
    if (markingKey) return;
    setMarkingKey(key);
    setError(null);
    try {
      const response = await fetch(`/api/haunted-casino/bingo/${encodeURIComponent(round.id)}/mark`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, column, marked }),
      });
      const payload = await readJson<BingoMarkResponse>(response);
      if (!mountedRef.current) return;
      setState(payload);
      if (payload.reward) {
        currencyDirtyRef.current = true;
        setReward(payload.reward);
        setAutoCall(false);
      }
    } catch (reason) {
      if (mountedRef.current) setError(reason instanceof Error ? reason.message : "That Bingo space could not be marked");
    } finally {
      if (mountedRef.current) setMarkingKey(null);
    }
  };

  const status = loading
    ? "Loading…"
    : round?.status === "won"
      ? "BINGO!"
      : shuffling
        ? "Shuffling…"
        : round == null
          ? state?.freeGameAvailable ? "Free game ready" : "Ready to play"
          : round.current == null
            ? "Ready to call"
            : `${round.called.length} of 75 called`;

  const entryDetail = round
    ? round.freeEntry ? "Daily free card" : `${round.entryCost} coin entry`
    : state?.freeGameAvailable
      ? "1 free game today"
      : `${state?.entryCost ?? 100} coins per card`;

  const canAffordNext = Boolean(state && (state.freeGameAvailable || state.balances.coins >= state.entryCost));
  const nextEntryLabel = state?.freeGameAvailable ? "Play Free Game" : `Play · ${state?.entryCost ?? 100} Coins`;
  const card = round?.card ?? EMPTY_CARD;

  return (
    <div
      className="haunted-bingo-overlay"
      data-testid="haunted-bingo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Haunted Bingo"
      style={{ pointerEvents: "auto", overscrollBehavior: "contain" }}
    >
      <div
        className="haunted-bingo-background"
        aria-hidden="true"
        data-testid="haunted-bingo-background"
        style={{ backgroundImage: `linear-gradient(180deg, rgba(8,4,13,.54), rgba(8,4,13,.82)), url(${casinoBackground})` }}
      />

      <button
        type="button"
        aria-label="Close Haunted Bingo"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); closeBingo(); }}
        className="haunted-bingo-close"
      >
        <img src={slotCloseButton} alt="" draggable={false} />
      </button>

      <main className="haunted-bingo-shell">
        <header className="haunted-bingo-header">
          <div>
            <div className="haunted-bingo-kicker">Haunted Casino</div>
            <h1>Haunted Bingo</h1>
          </div>
          <div className="haunted-bingo-status" role="status" aria-live="polite">
            <span>{status}</span>
            <small>{entryDetail}</small>
          </div>
        </header>

        <div className="haunted-bingo-economy-strip" aria-label="Bingo prizes and balance">
          <span className="haunted-bingo-wallet"><img src={currencyAssets.coin} alt="" />{state?.balances.coins ?? "—"}</span>
          <span className="haunted-bingo-prize-copy">Bingo pays <strong>{state?.winReward ?? 500}</strong> + marked card bonuses</span>
        </div>

        <div className="haunted-bingo-stage">
          <section className="haunted-bingo-cage-zone" aria-label="Bingo ball cage">
            <div className={`haunted-bingo-cage ${shuffling ? "is-shuffling" : ""}`}>
              <div className="haunted-bingo-cage-balls" aria-hidden="true">
                {Array.from({ length: 14 }, (_, index) => (
                  <img key={index} src={bingoBall} alt="" draggable={false} className="haunted-bingo-cage-ball" />
                ))}
              </div>
              <img src={bingoBallCage} alt="Bingo ball cage" draggable={false} className="haunted-bingo-cage-frame" />
            </div>
            <div className="haunted-bingo-history" aria-label="Recent calls">
              {recentCalls.length === 0 ? <span className="haunted-bingo-history-empty">Recent calls</span> : recentCalls.map((value) => (
                <span key={value} className="haunted-bingo-history-chip">{calledLabel(value)}</span>
              ))}
            </div>
          </section>

          <section className="haunted-bingo-card-zone" aria-label="Your bingo card">
            <div className="haunted-bingo-card" data-testid="haunted-bingo-card">
              <img src={blankBingoCard} alt="Bingo card" draggable={false} className="haunted-bingo-card-art" />
              <div className="haunted-bingo-card-grid">
                {card.flatMap((rowValues, rowIndex) => rowValues.map((value, columnIndex) => {
                  const key = `${rowIndex}-${columnIndex}`;
                  const isFree = key === FREE_CELL_KEY;
                  const hasNumber = value != null && value > 0;
                  const isCalled = hasNumber && calledSet.has(value);
                  const isMarked = markedSet.has(key);
                  const bonus = bonusMap.get(key);
                  const disabled = isFree || !round || round.status !== "active" || !isCalled || markingKey != null;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={isFree ? "Free space" : hasNumber ? `${BINGO_LETTERS[columnIndex]} ${value}${bonus ? `, ${bonus.amount} coin bonus` : ""}${isMarked ? ", marked" : isCalled ? ", called" : ""}` : "Empty Bingo space"}
                      aria-pressed={isMarked}
                      disabled={disabled}
                      onClick={() => void setCellMarked(rowIndex, columnIndex, !isMarked)}
                      className={`haunted-bingo-cell ${isFree ? "is-free" : ""} ${isCalled ? "is-called" : ""} ${isMarked ? "is-marked" : ""} ${bonus ? "has-bonus" : ""}`}
                    >
                      {!isFree && hasNumber && <span className="haunted-bingo-number">{value}</span>}
                      {bonus && (
                        <span className={`haunted-bingo-bonus ${isMarked ? "is-collected" : ""}`} aria-hidden="true">
                          <img src={currencyAssets.coin} alt="" draggable={false} />
                          <b>+{bonus.amount}</b>
                        </span>
                      )}
                    </button>
                  );
                }))}
              </div>
              {!round && !loading && (
                <div className="haunted-bingo-deal-overlay">
                  <strong>{state?.freeGameAvailable ? "FREE CARD READY" : "DEAL A NEW CARD"}</strong>
                  <span>{state?.freeGameAvailable ? "Your first Bingo game today is free." : `New cards cost ${state?.entryCost ?? 100} coins.`}</span>
                </div>
              )}
            </div>
          </section>

          <section className="haunted-bingo-call-zone" aria-label="Current bingo call">
            <div className={`haunted-bingo-call-stand ${shuffling ? "is-shuffling" : ""}`}>
              <img src={bingoBallCallStand} alt="Bingo call stand" draggable={false} className="haunted-bingo-call-stand-art" />
              {round?.current != null ? (
                <div className="haunted-bingo-called-ball" aria-live="polite">
                  <img src={bingoBall} alt="" draggable={false} />
                  <span>{calledLabel(round.current)}</span>
                </div>
              ) : (
                <div className="haunted-bingo-ready-call">{round ? "READY" : "PLAY"}</div>
              )}
            </div>
            <div className="haunted-bingo-call-caption">
              {shuffling ? "Mixing the cage…" : round?.current != null ? `Current call · ${calledLabel(round.current)}` : round ? "Call the first ball" : "Deal a card to begin"}
            </div>
          </section>
        </div>

        {error && <div className="haunted-bingo-error" role="alert">{error}</div>}

        <div className="haunted-bingo-controls">
          {!round || round.status !== "active" ? (
            <button
              type="button"
              onClick={() => void startRound()}
              disabled={loading || starting || !canAffordNext}
              className="haunted-bingo-primary-button haunted-bingo-start-button"
            >
              {starting ? "Dealing…" : nextEntryLabel}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void callBall()} disabled={shuffling || round.remainingCalls <= 0} className="haunted-bingo-primary-button">
                {shuffling ? "Shuffling…" : round.remainingCalls <= 0 ? "All balls called" : "Call Ball"}
              </button>
              <button
                type="button"
                aria-pressed={autoCall}
                onClick={() => setAutoCall((value) => !value)}
                disabled={round.remainingCalls <= 0}
                className={`haunted-bingo-secondary-button ${autoCall ? "is-active" : ""}`}
              >
                {autoCall ? "Pause Auto" : "Auto Call"}
              </button>
            </>
          )}
        </div>

        {!round && state && !state.freeGameAvailable && !canAffordNext && (
          <p className="haunted-bingo-help haunted-bingo-insufficient">You need {state.entryCost} coins for another card.</p>
        )}
        <p className="haunted-bingo-help">
          {round ? "Called numbers glow. Mark them before Bingo; gold coin bundles marked on your card are added to your win." : "One free Bingo game each casino day. Your active card is saved if you leave."}
        </p>
      </main>

      {reward && (
        <div className="haunted-bingo-win-layer" role="dialog" aria-modal="true" aria-label="Bingo win">
          <div className="haunted-bingo-win-card">
            <div className="haunted-bingo-win-spark" aria-hidden="true">✦</div>
            <div className="haunted-bingo-win-title">BINGO!</div>
            <div className="haunted-bingo-win-total">+{reward.totalCoins} coins</div>
            <p>{reward.baseCoins} coin Bingo prize{reward.bonusCoins > 0 ? ` + ${reward.bonusCoins} from ${reward.markedBonusCount} marked bonus bundle${reward.markedBonusCount === 1 ? "" : "s"}.` : "."}</p>
            <div className="haunted-bingo-win-balance"><img src={currencyAssets.coin} alt="" />Balance: {state?.balances.coins ?? "—"}</div>
            <button type="button" onClick={() => void startRound()} disabled={starting || !canAffordNext}>
              {starting ? "Dealing…" : state?.freeGameAvailable ? "Play Free Game" : canAffordNext ? `Play Again · ${state?.entryCost ?? 100}` : "Not enough coins"}
            </button>
            <button type="button" className="haunted-bingo-win-close" onClick={closeBingo}>Back to Casino</button>
          </div>
        </div>
      )}
    </div>
  );
}
