import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import casinoBackground from "@assets/uploads/HauntedCasinoMainBG.png";
import bingoBall from "@assets/uploads/BingoBall.png";
import bingoBallCage from "@assets/uploads/BingoBallCage.png";
import bingoBallCallStand from "@assets/uploads/BingoBallCallStand.png";
import blankBingoCard from "@assets/uploads/BlankBingoCard.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import { currencyAssets } from "@/lib/currencyAssets";
import { queryClient } from "@/lib/queryClient";
import "./HauntedBingoOverlay.css";
import "./HauntedBingoEconomy.css";
import "./HauntedBingoPolish.css";

const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;
type BingoLetter = (typeof BINGO_LETTERS)[number];
type BingoCard = Array<Array<number | null>>;

interface BingoBonus {
  key: string;
  amount: number;
}

interface BingoRival {
  id: string;
  name: string;
  kind: "bot";
  card: BingoCard;
  marked: string[];
  status: "playing" | "won";
  placement: number | null;
  reactionDelay: number;
}

interface BingoWinner {
  kind: "player" | "bot";
  id: string;
  name: string;
  placement: number;
  callIndex: number;
}

interface BingoRound {
  id: string;
  status: "active" | "won" | "lost" | "forfeited";
  card: BingoCard;
  called: number[];
  current: number | null;
  marked: string[];
  bonuses: BingoBonus[];
  rivals: BingoRival[];
  winners: BingoWinner[];
  placement: number | null;
  winnerSlotsRemaining: number;
  entryCost: number;
  freeEntry: boolean;
  remainingCalls: number;
  baseReward: number;
  bonusReward: number;
  createdAt: string | null;
  expiresAt: string;
  secondsRemaining: number;
}

interface BingoState {
  balances: { coins: number };
  entryCost: number;
  winReward: number;
  dailyFreeGames: number;
  freeGameAvailable: boolean;
  winnerLimit: number;
  rivalCount: number;
  round: BingoRound | null;
}

interface BingoReward {
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  markedBonusCount: number;
  placement: number;
}

type BingoMarkResponse = BingoState & { reward: BingoReward | null };

const EMPTY_CARD: BingoCard = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 5 }, (_, column) => row === 2 && column === 2 ? null : 0),
);
const FREE_CELL_KEY = "2-2";
const CAGE_DISPLAY_BALLS = 14;
const MINIMUM_SHUFFLE_MS = 560;
const AUTO_CALL_START_MS = 3200;
const AUTO_CALL_END_MS = 2200;
const AUTO_CALL_RAMP_CALLS = 42;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bingoLetterFor(value: number): BingoLetter {
  return BINGO_LETTERS[Math.min(4, Math.floor((value - 1) / 15))];
}

function calledLabel(value: number): string {
  return `${bingoLetterFor(value)} ${value}`;
}

function ordinal(value: number): string {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function autoCallDelay(calledCount: number): number {
  const progress = Math.max(0, Math.min(1, calledCount / AUTO_CALL_RAMP_CALLS));
  return Math.round(AUTO_CALL_START_MS - ((AUTO_CALL_START_MS - AUTO_CALL_END_MS) * progress));
}

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatRoundTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function bingoMarksNeeded(marked: ReadonlySet<string>): number {
  const lines: string[][] = [];
  for (let index = 0; index < 5; index++) {
    lines.push(Array.from({ length: 5 }, (_, column) => `${index}-${column}`));
    lines.push(Array.from({ length: 5 }, (_, row) => `${row}-${index}`));
  }
  lines.push(Array.from({ length: 5 }, (_, index) => `${index}-${index}`));
  lines.push(Array.from({ length: 5 }, (_, index) => `${index}-${4 - index}`));
  return Math.min(...lines.map((line) => line.filter((key) => !marked.has(key)).length));
}

function syncCoinBalance(coins: number): void {
  queryClient.setQueryData(["/api/auth/me"], (current: any) =>
    current ? { ...current, coins } : current,
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "Haunted Bingo could not complete that action");
  return payload as T;
}

function RivalMiniCard({ rival }: { rival: BingoRival }) {
  const marked = useMemo(() => new Set(rival.marked), [rival.marked]);
  const threatening = rival.status === "playing" && bingoMarksNeeded(marked) === 1;
  return (
    <div className={`haunted-bingo-rival ${rival.status === "won" ? "is-won" : ""} ${threatening ? "is-threatening" : ""}`}>
      <div className="haunted-bingo-rival-meta">
        <span className="haunted-bingo-rival-name">{rival.name}</span>
        <span className="haunted-bingo-rival-kind">{threatening ? "1 AWAY" : "BOT"}</span>
      </div>
      <div className="haunted-bingo-rival-card" aria-hidden="true">
        {rival.card.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
          const key = `${rowIndex}-${columnIndex}`;
          const isFree = key === FREE_CELL_KEY;
          return (
            <span
              key={key}
              className={`${isFree ? "is-free" : ""} ${marked.has(key) ? "is-marked" : ""}`}
            >
              {isFree ? "✦" : value}
            </span>
          );
        }))}
      </div>
      {rival.placement != null && (
        <div className="haunted-bingo-rival-place">{ordinal(rival.placement)}</div>
      )}
    </div>
  );
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
  const [roundSecondsRemaining, setRoundSecondsRemaining] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const callInFlightRef = useRef(false);
  const expiryRefreshInFlightRef = useRef(false);

  const round = state?.round ?? null;
  const calledSet = useMemo(() => new Set(round?.called ?? []), [round?.called]);
  const markedSet = useMemo(() => new Set(round?.marked ?? [FREE_CELL_KEY]), [round?.marked]);
  const bonusMap = useMemo(() => {
    const map = new Map<string, BingoBonus>();
    for (const bonus of round?.bonuses ?? []) map.set(bonus.key, bonus);
    return map;
  }, [round?.bonuses]);
  const recentCalls = useMemo(() => (round?.called ?? []).slice(-8), [round?.called]);
  const cageBallPool = round ? round.called.length + round.remainingCalls : 0;
  const cageBallFill = round
    ? (cageBallPool > 0 ? CAGE_DISPLAY_BALLS * (round.remainingCalls / cageBallPool) : 0)
    : CAGE_DISPLAY_BALLS;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    fetch("/api/haunted-casino/bingo", { credentials: "include" })
      .then((response) => readJson<BingoState>(response))
      .then((payload) => {
        if (cancelled) return;
        setState(payload);
        syncCoinBalance(payload.balances.coins);
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

  useEffect(() => {
    if (!round || round.status !== "active") {
      setRoundSecondsRemaining(null);
      return;
    }

    let cancelled = false;
    const tick = () => {
      const seconds = secondsUntil(round.expiresAt);
      if (!cancelled) setRoundSecondsRemaining(seconds);
      if (seconds > 0 || expiryRefreshInFlightRef.current) return;

      expiryRefreshInFlightRef.current = true;
      setAutoCall(false);
      fetch("/api/haunted-casino/bingo", { credentials: "include" })
        .then((response) => readJson<BingoState>(response))
        .then((payload) => {
          if (cancelled || !mountedRef.current) return;
          setState(payload);
          syncCoinBalance(payload.balances.coins);
          if (!payload.round) setError("Time’s up — that Bingo round has ended.");
        })
        .catch((reason) => {
          if (!cancelled && mountedRef.current) setError(reason instanceof Error ? reason.message : "The finished Bingo round could not be refreshed.");
        })
        .finally(() => { expiryRefreshInFlightRef.current = false; });
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [round?.id, round?.expiresAt, round?.status]);

  const closeBingo = () => {
    setAutoCall(false);
    onClose();
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
      setState(payload);
      syncCoinBalance(payload.balances.coins);
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
      if (mountedRef.current) {
        setState(payload);
        syncCoinBalance(payload.balances.coins);
        if (payload.round?.status !== "active") setAutoCall(false);
        if (!payload.round && activeRound.status === "active") setError("That Bingo round has ended.");
      }
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
    const delay = round.current == null ? 350 : autoCallDelay(round.called.length);
    const timer = window.setTimeout(() => void callBall(), delay);
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
      syncCoinBalance(payload.balances.coins);
      if (!payload.round && round.status === "active") setError("That Bingo round has ended.");
      if (payload.reward) {
        setReward(payload.reward);
        setAutoCall(false);
      }
    } catch (reason) {
      if (mountedRef.current) setError(reason instanceof Error ? reason.message : "That Bingo space could not be marked");
    } finally {
      if (mountedRef.current) setMarkingKey(null);
    }
  };

  const canAffordNext = Boolean(state && (state.freeGameAvailable || state.balances.coins >= state.entryCost));
  const nextEntryLabel = state?.freeGameAvailable ? "Play Free Game" : `Play · ${state?.entryCost ?? 100} Coins`;
  const card = round?.card ?? EMPTY_CARD;
  const winnerLimit = state?.winnerLimit ?? 3;
  const rivalCount = state?.rivalCount ?? 5;
  const playerMarksNeeded = round?.status === "active" ? bingoMarksNeeded(markedSet) : null;
  const calledUnmarkedCount = round?.status === "active"
    ? card.flat().filter((value, index) => {
        if (value == null || value <= 0 || !calledSet.has(value)) return false;
        const rowIndex = Math.floor(index / 5);
        const columnIndex = index % 5;
        return !markedSet.has(`${rowIndex}-${columnIndex}`);
      }).length
    : 0;

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
        <header className="haunted-bingo-header haunted-bingo-header-spacer" aria-hidden="true" />

        <div className={`haunted-bingo-stage ${round ? "is-active-round" : "is-idle"}`}>
          <section className="haunted-bingo-cage-zone" aria-label="Bingo ball cage">
            <div className={`haunted-bingo-cage ${shuffling ? "is-shuffling" : ""}`}>
              <div className="haunted-bingo-cage-balls" aria-hidden="true">
                {Array.from({ length: CAGE_DISPLAY_BALLS }, (_, index) => {
                  const cageBallOpacity = Math.max(0, Math.min(1, cageBallFill - index));
                  return (
                    <img
                      key={index}
                      src={bingoBall}
                      alt=""
                      draggable={false}
                      className="haunted-bingo-cage-ball"
                      style={{ opacity: cageBallOpacity }}
                    />
                  );
                })}
              </div>
              <img src={bingoBallCage} alt="Bingo ball cage" draggable={false} className="haunted-bingo-cage-frame" />
            </div>
            <div className="haunted-bingo-cage-wallet" aria-label="Coin balance">
              <span className="haunted-bingo-wallet"><img src={currencyAssets.coin} alt="" />{state?.balances.coins ?? "—"}</span>
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
                <div className={`haunted-bingo-deal-overlay ${state?.freeGameAvailable ? "is-free-entry" : "is-paid-entry"}`}>
                  <strong>{state?.freeGameAvailable ? "FREE GAME" : `PLAY FOR ${state?.entryCost ?? 100} COINS`}</strong>
                </div>
              )}
            </div>

            {round && round.rivals.length > 0 && (
              <aside className="haunted-bingo-rivals" aria-label="Casino rivals">
                <div className="haunted-bingo-rivals-title">
                  <span>RIVALS</span>
                  <small>TOP {winnerLimit} WIN</small>
                </div>
                {round.rivals.map((rival) => <RivalMiniCard key={rival.id} rival={rival} />)}
                <div className="haunted-bingo-rival-slots">
                  {round.winnerSlotsRemaining > 0 ? `${round.winnerSlotsRemaining} prize spot${round.winnerSlotsRemaining === 1 ? "" : "s"} left` : "Prize spots filled"}
                </div>
              </aside>
            )}
          </section>

          <section className="haunted-bingo-call-zone" aria-label="Current bingo call">
            <div className={`haunted-bingo-call-stand ${shuffling ? "is-shuffling" : ""}`}>
              <img src={bingoBallCallStand} alt="Bingo call stand" draggable={false} className="haunted-bingo-call-stand-art" />
              {round?.current != null ? (
                <div className="haunted-bingo-called-ball" aria-live="polite">
                  <img src={bingoBall} alt="" draggable={false} />
                  <span>{calledLabel(round.current)}</span>
                </div>
              ) : round ? (
                <div className="haunted-bingo-ready-call">READY</div>
              ) : null}
            </div>
            {round?.status === "active" && roundSecondsRemaining != null && (
              <div className="haunted-bingo-round-timer" aria-live="polite">TIME {formatRoundTime(roundSecondsRemaining)}</div>
            )}
          </section>
        </div>

        {error && <div className="haunted-bingo-error" role="alert">{error}</div>}

        {round?.status === "active" && (playerMarksNeeded === 1 || calledUnmarkedCount > 0) && (
          <div className={`haunted-bingo-pressure-status ${playerMarksNeeded === 1 ? "is-one-away" : ""}`} aria-live="polite">
            {playerMarksNeeded === 1 && <strong>ONE AWAY</strong>}
            {calledUnmarkedCount > 0 && (
              <span>{calledUnmarkedCount} called space{calledUnmarkedCount === 1 ? "" : "s"} ready to mark</span>
            )}
          </div>
        )}

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
          {round
            ? `Race ${rivalCount} casino rivals before the five-minute clock runs out. The clock keeps running if you leave, and the round ends when time expires, the prize spots fill, or all balls are called. Auto Call gradually speeds up, while sparkling numbers remain ready to mark and ghost coin spaces add to a winning payout when covered.`
            : `One free Bingo game each casino day. Each card races ${rivalCount} casino rivals, so every round has a real finish line.`}
        </p>
      </main>

      {reward && (
        <div className="haunted-bingo-win-layer" role="dialog" aria-modal="true" aria-label="Bingo win">
          <div className="haunted-bingo-win-card">
            <div className="haunted-bingo-win-spark" aria-hidden="true">✦</div>
            <div className="haunted-bingo-placement">{ordinal(reward.placement)} PLACE</div>
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

      {round?.status === "lost" && !reward && (
        <div className="haunted-bingo-win-layer" role="dialog" aria-modal="true" aria-label="Bingo round finished">
          <div className="haunted-bingo-win-card haunted-bingo-loss-card">
            <div className="haunted-bingo-loss-icon" aria-hidden="true">☾</div>
            <div className="haunted-bingo-placement">OUT OF PRIZE SPOTS</div>
            <div className="haunted-bingo-win-title">SO CLOSE</div>
            <p>The three prize spots filled before your card reached Bingo. Your next card starts a fresh race.</p>
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
