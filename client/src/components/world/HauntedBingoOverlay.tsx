import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import casinoBackground from "@assets/uploads/HauntedCasinoMainBG.png";
import bingoBall from "@assets/uploads/BingoBall.png";
import bingoBallCage from "@assets/uploads/BingoBallCage.png";
import bingoBallCallStand from "@assets/uploads/BingoBallCallStand.png";
import blankBingoCard from "@assets/uploads/BlankBingoCard.png";
import slotCloseButton from "@assets/uploads/SlotCloseButton.png";
import "./HauntedBingoOverlay.css";

const BINGO_LETTERS = ["B", "I", "N", "G", "O"] as const;
type BingoLetter = (typeof BINGO_LETTERS)[number];
type BingoCard = Array<Array<number | null>>;

const ALL_BALLS = Array.from({ length: 75 }, (_, index) => index + 1);
const FREE_CELL_KEY = "2-2";

function shuffled<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function createBingoCard(): BingoCard {
  const columns = BINGO_LETTERS.map((_, columnIndex) => {
    const start = columnIndex * 15 + 1;
    return shuffled(Array.from({ length: 15 }, (_, index) => start + index)).slice(0, 5);
  });

  return Array.from({ length: 5 }, (_, rowIndex) =>
    Array.from({ length: 5 }, (_, columnIndex) =>
      rowIndex === 2 && columnIndex === 2 ? null : columns[columnIndex][rowIndex],
    ),
  );
}

function bingoLetterFor(value: number): BingoLetter {
  return BINGO_LETTERS[Math.min(4, Math.floor((value - 1) / 15))];
}

function calledLabel(value: number): string {
  return `${bingoLetterFor(value)} ${value}`;
}

function hasBingo(marked: ReadonlySet<string>): boolean {
  for (let index = 0; index < 5; index++) {
    if (Array.from({ length: 5 }, (_, column) => `${index}-${column}`).every(key => marked.has(key))) return true;
    if (Array.from({ length: 5 }, (_, row) => `${row}-${index}`).every(key => marked.has(key))) return true;
  }
  if (Array.from({ length: 5 }, (_, index) => `${index}-${index}`).every(key => marked.has(key))) return true;
  if (Array.from({ length: 5 }, (_, index) => `${index}-${4 - index}`).every(key => marked.has(key))) return true;
  return false;
}

export default function HauntedBingoOverlay({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState<BingoCard>(() => createBingoCard());
  const [deck, setDeck] = useState<number[]>(() => shuffled(ALL_BALLS));
  const [called, setCalled] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [marked, setMarked] = useState<Set<string>>(() => new Set([FREE_CELL_KEY]));
  const [shuffling, setShuffling] = useState(false);
  const [autoCall, setAutoCall] = useState(false);
  const [won, setWon] = useState(false);
  const drawTimerRef = useRef<number | null>(null);

  const calledSet = useMemo(() => new Set(called), [called]);
  const recentCalls = useMemo(() => [...called].reverse().slice(0, 5), [called]);

  const callBall = useCallback(() => {
    if (shuffling || won || deck.length === 0) return;
    setShuffling(true);
    if (drawTimerRef.current != null) window.clearTimeout(drawTimerRef.current);
    drawTimerRef.current = window.setTimeout(() => {
      setDeck((currentDeck) => {
        const next = currentDeck[0];
        if (next == null) {
          setAutoCall(false);
          return currentDeck;
        }
        setCurrent(next);
        setCalled((previous) => [...previous, next]);
        return currentDeck.slice(1);
      });
      setShuffling(false);
      drawTimerRef.current = null;
    }, 680);
  }, [deck.length, shuffling, won]);

  useEffect(() => {
    if (!autoCall || won || shuffling || deck.length === 0) return;
    const timer = window.setTimeout(callBall, current == null ? 140 : 1900);
    return () => window.clearTimeout(timer);
  }, [autoCall, callBall, current, deck.length, shuffling, won]);

  useEffect(() => () => {
    if (drawTimerRef.current != null) window.clearTimeout(drawTimerRef.current);
  }, []);

  const resetRound = () => {
    if (drawTimerRef.current != null) window.clearTimeout(drawTimerRef.current);
    drawTimerRef.current = null;
    setCard(createBingoCard());
    setDeck(shuffled(ALL_BALLS));
    setCalled([]);
    setCurrent(null);
    setMarked(new Set([FREE_CELL_KEY]));
    setShuffling(false);
    setAutoCall(false);
    setWon(false);
  };

  const toggleMark = (row: number, column: number, value: number | null) => {
    if (won || value == null || !calledSet.has(value)) return;
    const key = `${row}-${column}`;
    setMarked((currentMarks) => {
      const next = new Set(currentMarks);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      next.add(FREE_CELL_KEY);
      if (hasBingo(next)) {
        setWon(true);
        setAutoCall(false);
      }
      return next;
    });
  };

  const status = won
    ? "BINGO!"
    : shuffling
      ? "Shuffling…"
      : current == null
        ? "Ready to call"
        : `${called.length} of 75 called`;

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
        style={{ backgroundImage: `linear-gradient(180deg, rgba(8,4,13,.58), rgba(8,4,13,.84)), url(${casinoBackground})` }}
      />

      <button
        type="button"
        aria-label="Close Haunted Bingo"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAutoCall(false); onClose(); }}
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
            <small>Free play</small>
          </div>
        </header>

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
              {recentCalls.length === 0 ? <span className="haunted-bingo-history-empty">Recent calls appear here</span> : recentCalls.map((value) => (
                <span key={value} className="haunted-bingo-history-chip">{calledLabel(value)}</span>
              ))}
            </div>
          </section>

          <section className="haunted-bingo-card-zone" aria-label="Your bingo card">
            <div className="haunted-bingo-card" data-testid="haunted-bingo-card">
              <img src={blankBingoCard} alt="Bingo card" draggable={false} className="haunted-bingo-card-art" />
              <div className="haunted-bingo-card-grid">
                {card.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
                  const key = `${rowIndex}-${columnIndex}`;
                  const isFree = key === FREE_CELL_KEY;
                  const isCalled = value != null && calledSet.has(value);
                  const isMarked = marked.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={isFree ? "Free space" : `${BINGO_LETTERS[columnIndex]} ${value}${isMarked ? ", marked" : isCalled ? ", called" : ""}`}
                      aria-pressed={isMarked}
                      disabled={isFree || !isCalled || won}
                      onClick={() => toggleMark(rowIndex, columnIndex, value)}
                      className={`haunted-bingo-cell ${isFree ? "is-free" : ""} ${isCalled ? "is-called" : ""} ${isMarked ? "is-marked" : ""}`}
                    >
                      {!isFree && <span>{value}</span>}
                    </button>
                  );
                }))}
              </div>
            </div>
          </section>

          <section className="haunted-bingo-call-zone" aria-label="Current bingo call">
            <div className={`haunted-bingo-call-stand ${shuffling ? "is-shuffling" : ""}`}>
              <img src={bingoBallCallStand} alt="Bingo call stand" draggable={false} className="haunted-bingo-call-stand-art" />
              {current != null ? (
                <div className="haunted-bingo-called-ball" aria-live="polite">
                  <img src={bingoBall} alt="" draggable={false} />
                  <span>{calledLabel(current)}</span>
                </div>
              ) : (
                <div className="haunted-bingo-ready-call">READY</div>
              )}
            </div>
            <div className="haunted-bingo-call-caption">
              {shuffling ? "Mixing the cage…" : current != null ? `Current call · ${calledLabel(current)}` : "Call the first ball when you're ready"}
            </div>
          </section>
        </div>

        <div className="haunted-bingo-controls">
          <button type="button" onClick={callBall} disabled={shuffling || won || deck.length === 0} className="haunted-bingo-primary-button">
            {shuffling ? "Shuffling…" : deck.length === 0 ? "All balls called" : "Call Ball"}
          </button>
          <button
            type="button"
            aria-pressed={autoCall}
            onClick={() => setAutoCall(value => !value)}
            disabled={won || deck.length === 0}
            className={`haunted-bingo-secondary-button ${autoCall ? "is-active" : ""}`}
          >
            {autoCall ? "Pause Auto" : "Auto Call"}
          </button>
          <button type="button" onClick={resetRound} className="haunted-bingo-secondary-button">New Card</button>
        </div>

        <p className="haunted-bingo-help">Called numbers glow on your card. Tap them to mark your spaces; the center gem is your free space.</p>
      </main>

      {won && (
        <div className="haunted-bingo-win-layer" role="dialog" aria-modal="true" aria-label="Bingo win">
          <div className="haunted-bingo-win-card">
            <div className="haunted-bingo-win-spark" aria-hidden="true">✦</div>
            <div className="haunted-bingo-win-title">BINGO!</div>
            <p>You completed a line in {called.length} calls.</p>
            <button type="button" onClick={resetRound}>Play Another Card</button>
          </div>
        </div>
      )}
    </div>
  );
}
