import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import blockI from "@assets/Photoroom_20260502_115639_PM_1777784698006.png";
import blockO from "@assets/Photoroom_20260503_120122_AM_1777784698006.png";
import blockT from "@assets/Photoroom_20260502_115749_PM_1777784698006.png";
import blockS from "@assets/Photoroom_20260502_115949_PM_1777784698006.png";
import blockZ from "@assets/Photoroom_20260502_115824_PM_1777784698006.png";
import blockL from "@assets/Photoroom_20260503_120218_AM_1777784698006.png";
import blockJ from "@assets/Photoroom_20260503_120311_AM_1777784698006.png";
import bgMolten from "@assets/shop_volcanic.png";

// ── Tetromino shapes (4-rotation matrices, SRS-style) ──────────────────────
type Piece = "I" | "O" | "T" | "S" | "Z" | "L" | "J";

const SHAPES: Record<Piece, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
};

const COLS = 10;
const ROWS = 18;

// Per-piece coloured glow rim drawn around each cell so the player can
// quickly tell pieces apart at a glance.
const PIECE_GLOW: Record<Piece, string> = {
  I: "rgba(255,140,40,0.9)",   // bubbly orange
  O: "rgba(255,200,40,0.95)",  // bright amber
  T: "rgba(200,90,255,0.9)",   // purple
  S: "rgba(120,255,90,0.9)",   // green
  Z: "rgba(255,60,60,0.95)",   // red lava
  L: "rgba(255,150,30,0.9)",   // black-orange lava
  J: "rgba(80,255,220,0.9)",   // teal swirl
};

// Solid base colour painted UNDER each tile texture so any transparent
// pixels at the rounded corners of the source PNG can never bleed through
// to the canvas background. Tuned to match the dominant tone of each tile.
const PIECE_BASE: Record<Piece, string> = {
  I: "#3a1f08",
  O: "#3a1f08",
  T: "#1f0d28",
  S: "#0c2010",
  Z: "#2a0808",
  L: "#0a0a0a",
  J: "#0a2228",
};

const PIECE_IMG_SRC: Record<Piece, string> = {
  I: blockI, O: blockO, T: blockT, S: blockS, Z: blockZ, L: blockL, J: blockJ,
};

// ── Board cell: 0 = empty, 'I'..'J' = locked piece type ─────────────────────
type Cell = 0 | Piece;
const emptyBoard = (): Cell[][] =>
  Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));

interface ActivePiece {
  type: Piece;
  x: number;       // col of top-left of bounding box
  y: number;       // row of top-left of bounding box
  rot: 0 | 1 | 2 | 3;
}

// ── 7-bag randomizer ───────────────────────────────────────────────────────
function makeBag(): Piece[] {
  const arr: Piece[] = ["I","O","T","S","Z","L","J"];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function spawn(type: Piece): ActivePiece {
  // Spawn pieces near the top-middle. Y is set so the piece appears just
  // peeking onto the board.
  const startX = type === "O" ? 4 : 3;
  return { type, x: startX, y: type === "I" ? -1 : 0, rot: 0 };
}

function collides(board: Cell[][], piece: ActivePiece, dx = 0, dy = 0, drot = 0): boolean {
  const shape = SHAPES[piece.type][((piece.rot + drot) % 4 + 4) % 4];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = piece.x + c + dx;
      const ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx] !== 0) return true;
    }
  }
  return false;
}

function lockPiece(board: Cell[][], piece: ActivePiece): Cell[][] {
  const next = board.map(row => row.slice());
  const shape = SHAPES[piece.type][piece.rot];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = piece.x + c;
      const ny = piece.y + r;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        next[ny][nx] = piece.type;
      }
    }
  }
  return next;
}

function clearLines(board: Cell[][]): { board: Cell[][]; cleared: number } {
  const remaining = board.filter(row => row.some(c => c === 0));
  const cleared = ROWS - remaining.length;
  const newRows: Cell[][] = Array.from({ length: cleared }, () => Array<Cell>(COLS).fill(0));
  return { board: [...newRows, ...remaining], cleared };
}

// Scoring rules per spec:
//   - 3 points awarded per cleared row (multi-row clears = n × 3)
//   - Every 35 points crossed grants 5 coins (credited to the player's
//     coin balance at the end of the run, batched in a single API call)
//   - 3 lives — each top-out costs one life; the board resets but score
//     and coins-earned carry over until all lives are gone
const POINTS_PER_ROW = 10;
const POINTS_PER_COIN_TIER = 100;   // every 100 score points → COINS_PER_TIER coins
const COINS_PER_TIER = 6;
const TETRIS_BONUS_COINS = 5;       // +5 coins for clearing 4+ rows in one drop
const STARTING_LIVES = 1;

export default function MoltenBlocksPage() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game state stored in refs so the rAF loop is stable; React state mirrors
  // the bits the UI needs to display (score, level, etc.) and triggers
  // re-renders for game-over / paused screens.
  const boardRef = useRef<Cell[][]>(emptyBoard());
  const bagRef = useRef<Piece[]>([]);
  const activeRef = useRef<ActivePiece | null>(null);
  const nextRef = useRef<Piece | null>(null);
  // Held piece — Tetris-style "hold" slot. Tap the HOLD box to stash the
  // currently-falling piece and pull the next; tap again to swap. There is
  // no once-per-piece restriction — the player can swap freely.
  const holdRef = useRef<Piece | null>(null);
  const [holdPiece, setHoldPiece] = useState<Piece | null>(null);
  const flashRef = useRef<{ rows: number[]; until: number } | null>(null);
  const lastDropRef = useRef<number>(0);
  const dropIntervalRef = useRef<number>(800);
  const softDropRef = useRef<boolean>(false);
  const runningRef = useRef<boolean>(true);
  const gameOverRef = useRef<boolean>(false);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [coinsEarned, setCoinsEarned] = useState(0);
  // Previous best, captured at mount, so the end-of-run screen can show
  // "NEW HIGH SCORE!" by comparing against the value before this run started.
  const [prevHi, setPrevHi] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("molten_blocks_hi") || "0", 10) || 0; } catch { return 0; }
  });
  const [hiScore, setHiScore] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("molten_blocks_hi") || "0", 10) || 0; } catch { return 0; }
  });
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [coinAward, setCoinAward] = useState<{ amount: number; status: "idle" | "submitting" | "done" | "error" }>({ amount: 0, status: "idle" });
  // Brief floating "+5 coins!" toast inside the game when a tier is hit
  const [coinFlash, setCoinFlash] = useState<{ amount: number; ts: number } | null>(null);
  // Pre-game intro overlay — shown once on mount; dismissed by Start button.
  // While true, startNewGame has run but we keep the loop paused so the
  // player can read the rules before the first piece begins to fall.
  const [showIntro, setShowIntro] = useState(true);

  // ── Preload block textures into HTMLImageElement refs ───────────────────
  const imgsRef = useRef<Record<Piece, HTMLImageElement>>({} as any);
  useEffect(() => {
    const types: Piece[] = ["I","O","T","S","Z","L","J"];
    let loaded = 0;
    types.forEach(t => {
      const img = new Image();
      img.onload = () => { loaded++; if (loaded === types.length) setImagesReady(true); };
      img.onerror = () => { loaded++; if (loaded === types.length) setImagesReady(true); };
      img.src = PIECE_IMG_SRC[t];
      imgsRef.current[t] = img;
    });
  }, []);

  // ── Pull next piece from the bag ────────────────────────────────────────
  const pullPiece = useCallback((): Piece => {
    if (bagRef.current.length === 0) bagRef.current = makeBag();
    return bagRef.current.shift()!;
  }, []);

  // Reset just the playfield (used both at the start of a brand-new game
  // and after losing a life). Score / coins / lives are NOT touched here.
  const resetBoard = useCallback(() => {
    boardRef.current = emptyBoard();
    bagRef.current = makeBag();
    activeRef.current = spawn(pullPiece());
    nextRef.current = pullPiece();
    flashRef.current = null;
    lastDropRef.current = performance.now();
    softDropRef.current = false;
    gameOverRef.current = false;
    runningRef.current = true;
  }, [pullPiece]);

  const startNewGame = useCallback(() => {
    // Snapshot the current persisted high score so the end screen can tell
    // the player whether THIS run beat it.
    try { setPrevHi(parseInt(localStorage.getItem("molten_blocks_hi") || "0", 10) || 0); } catch {}
    resetBoard();
    dropIntervalRef.current = 800;
    // Reset refs SYNCHRONOUSLY so the loop and finalize logic don't see
    // leftover values from a previous run before useEffect mirrors them.
    scoreRef.current = 0;
    livesRef.current = STARTING_LIVES;
    coinsEarnedRef.current = 0;
    setScore(0); setLines(0); setLevel(1);
    setLives(STARTING_LIVES); setCoinsEarned(0);
    setGameOver(false); setPaused(false);
    setCoinAward({ amount: 0, status: "idle" });
    setCoinFlash(null);
    holdRef.current = null;
    setHoldPiece(null);
  }, [resetBoard]);

  // Initialize on mount
  useEffect(() => { startNewGame(); /* eslint-disable-next-line */ }, []);

  // Refs are the AUTHORITATIVE source for score / lives / coins inside the
  // imperative game loop. We write them synchronously alongside React state
  // setters so that finalize-on-topout (which can fire in the same tick as
  // the line clear that completed the run) sees up-to-date totals — React
  // state setters batch and don't help here. The mirroring effects below
  // are belt-and-braces only.
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const coinsEarnedRef = useRef(0);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { coinsEarnedRef.current = coinsEarned; }, [coinsEarned]);

  // ── Submit earned coins to the server, persist hi-score ─────────────────
  // `finalizedAmountRef` tracks how many coins we've already submitted this
  // run so subsequent finalize calls (pause-cashout AND the eventual
  // game-over auto-finalize, or a stray unmount-cleanup) only POST the
  // delta — no double-crediting, no silent dropping of earnings.
  const finalizedAmountRef = useRef(0);
  const finalizeRun = useCallback(async () => {
    // Save high score locally
    setHiScore(prev => {
      const next = Math.max(prev, scoreRef.current);
      try { localStorage.setItem("molten_blocks_hi", String(next)); } catch {}
      return next;
    });
    const totalEarned = coinsEarnedRef.current;
    const delta = totalEarned - finalizedAmountRef.current;
    if (delta <= 0) {
      // Nothing new to award — leave coinAward state as-is so the previous
      // success message stays visible.
      if (totalEarned <= 0) setCoinAward({ amount: 0, status: "done" });
      return;
    }
    // Optimistically mark this delta as submitted so a rapid second call
    // (e.g. pause-cashout immediately followed by game-over) doesn't fire
    // a duplicate POST. We roll it back on error.
    finalizedAmountRef.current = totalEarned;
    setCoinAward({ amount: totalEarned, status: "submitting" });
    // Retry once on transient failure / cooldown (429) so leaving the
    // game early always credits the player.
    const submit = async () => {
      const res = await apiRequest("POST", "/api/games/molten-blocks/reward", { coins: delta });
      return await res.json();
    };
    try {
      let data: any;
      try {
        data = await submit();
      } catch (_first) {
        await new Promise(r => setTimeout(r, 1600));
        data = await submit();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setCoinAward({ amount: data?.awarded ?? delta, status: "done" });
    } catch (_err) {
      // Roll back the optimistic mark so a later finalize attempt can retry.
      finalizedAmountRef.current = totalEarned - delta;
      setCoinAward({ amount: delta, status: "error" });
    }
  }, []);

  // Safety-net: if the player navigates away (back button, route change,
  // closes the tab via SPA nav) without using "Return & Keep Earnings",
  // still try to credit any unsubmitted coins on unmount.
  useEffect(() => {
    return () => {
      if (coinsEarnedRef.current > finalizedAmountRef.current) {
        // Fire-and-forget; the component is gone but the request will
        // resolve on the server and credit the player's balance.
        finalizeRun();
      }
    };
  }, [finalizeRun]);

  // ── Spawn next piece; on top-out, lose a life or end the game ───────────
  const spawnNext = useCallback(() => {
    const t = nextRef.current!;
    const p = spawn(t);
    nextRef.current = pullPiece();
    if (collides(boardRef.current, p)) {
      // Topped out — costs a life. Reset the board if any lives remain;
      // otherwise the run is over and we settle up coins / hi-score.
      // Update the ref synchronously so any same-tick re-entry sees it.
      const remaining = livesRef.current - 1;
      livesRef.current = remaining;
      setLives(remaining);
      if (remaining > 0) {
        resetBoard();
      } else {
        gameOverRef.current = true;
        runningRef.current = false;
        activeRef.current = null;
        setGameOver(true);
        finalizeRun();
      }
    } else {
      activeRef.current = p;
    }
  }, [pullPiece, resetBoard, finalizeRun]);

  // ── Hold-piece swap ─────────────────────────────────────────────────────
  // Stash the current falling piece into the hold slot. If the slot is
  // empty, the next-queue piece begins falling. If a piece is already
  // held, the two are swapped. Each falling piece may only be hold-swapped
  // once, to prevent infinite stalling.
  const tryHold = useCallback(() => {
    if (gameOverRef.current || !runningRef.current) return;
    if (paused || showIntro) return;
    if (!activeRef.current || flashRef.current) return;
    // No once-per-piece restriction — the player can swap as often as they like.

    const currentType = activeRef.current.type;
    const stashed = holdRef.current;
    if (stashed == null) {
      // First hold this run — stash current and bring in the next-queue piece.
      holdRef.current = currentType;
      setHoldPiece(currentType);
      const nextType = nextRef.current!;
      const p = spawn(nextType);
      nextRef.current = pullPiece();
      if (collides(boardRef.current, p)) {
        // Top-out on the swapped-in piece — same handling as spawnNext().
        const remaining = livesRef.current - 1;
        livesRef.current = remaining;
        setLives(remaining);
        if (remaining > 0) {
          resetBoard();
        } else {
          gameOverRef.current = true;
          runningRef.current = false;
          activeRef.current = null;
          setGameOver(true);
          finalizeRun();
        }
      } else {
        activeRef.current = p;
      }
    } else {
      // Swap the held piece in for the falling one.
      holdRef.current = currentType;
      setHoldPiece(currentType);
      const p = spawn(stashed);
      if (collides(boardRef.current, p)) {
        // Swapping in the held piece would top out — same life/over flow.
        const remaining = livesRef.current - 1;
        livesRef.current = remaining;
        setLives(remaining);
        if (remaining > 0) {
          resetBoard();
        } else {
          gameOverRef.current = true;
          runningRef.current = false;
          activeRef.current = null;
          setGameOver(true);
          finalizeRun();
        }
      } else {
        activeRef.current = p;
      }
    }
  }, [paused, showIntro, pullPiece, resetBoard, finalizeRun]);

  // ── Lock current piece, clear lines, update score / level ───────────────
  const lockAndClear = useCallback(() => {
    if (!activeRef.current) return;
    const locked = lockPiece(boardRef.current, activeRef.current);
    // Detect cleared row indices for flash effect
    const clearedIdx: number[] = [];
    for (let r = 0; r < ROWS; r++) if (locked[r].every(c => c !== 0)) clearedIdx.push(r);
    if (clearedIdx.length > 0) {
      flashRef.current = { rows: clearedIdx, until: performance.now() + 180 };
      // Defer the actual line-clear until after the flash so the player
      // sees the rows light up first.
      boardRef.current = locked;
      activeRef.current = null;
      setTimeout(() => {
        const { board: cleared, cleared: n } = clearLines(boardRef.current);
        boardRef.current = cleared;
        flashRef.current = null;
        // Compute new totals SYNCHRONOUSLY against the refs so that if
        // spawnNext() immediately tops the player out, finalizeRun() reads
        // the values that include this final clear (React state setters
        // batch and would leave the refs stale).
        const prevScore = scoreRef.current;
        const nextScore = prevScore + n * POINTS_PER_ROW;
        // Tier coins — every full POINTS_PER_COIN_TIER points crossed grants COINS_PER_TIER.
        const tiersBefore = Math.floor(prevScore / POINTS_PER_COIN_TIER);
        const tiersAfter  = Math.floor(nextScore / POINTS_PER_COIN_TIER);
        const newTiers = tiersAfter - tiersBefore;
        const tierCoins = newTiers > 0 ? newTiers * COINS_PER_TIER : 0;
        // Tetris bonus — 4 or more rows cleared in a single lock awards a flat bonus.
        const bonusCoins = n >= 4 ? TETRIS_BONUS_COINS : 0;
        const coinsAdded = tierCoins + bonusCoins;
        scoreRef.current = nextScore;
        coinsEarnedRef.current = coinsEarnedRef.current + coinsAdded;
        setScore(nextScore);
        if (coinsAdded > 0) {
          setCoinsEarned(coinsEarnedRef.current);
          setCoinFlash({ amount: coinsAdded, ts: performance.now() });
        }
        setLines(prevLines => {
          const totalLines = prevLines + n;
          const newLevel = Math.floor(totalLines / 10) + 1;
          if (newLevel !== level) {
            setLevel(newLevel);
            // Speed curve: each level shaves ~15% off the drop interval.
            dropIntervalRef.current = Math.max(80, 800 * Math.pow(0.85, newLevel - 1));
          }
          return totalLines;
        });
        spawnNext();
      }, 180);
    } else {
      boardRef.current = locked;
      activeRef.current = null;
      spawnNext();
    }
  }, [level, spawnNext]);

  // ── Movement helpers (used by both gestures and the drop tick) ──────────
  const tryMove = useCallback((dx: number, dy: number): boolean => {
    if (!activeRef.current || flashRef.current) return false;
    if (collides(boardRef.current, activeRef.current, dx, dy, 0)) return false;
    activeRef.current = { ...activeRef.current, x: activeRef.current.x + dx, y: activeRef.current.y + dy };
    return true;
  }, []);

  const tryRotate = useCallback(() => {
    if (!activeRef.current || flashRef.current) return;
    // Try basic kicks: 0, ±1, ±2 horizontal offsets so rotation works near walls
    const kicks = [0, 1, -1, 2, -2];
    for (const k of kicks) {
      if (!collides(boardRef.current, activeRef.current, k, 0, 1)) {
        activeRef.current = {
          ...activeRef.current,
          x: activeRef.current.x + k,
          rot: ((activeRef.current.rot + 1) % 4) as 0 | 1 | 2 | 3,
        };
        return;
      }
    }
  }, []);

  const hardDrop = useCallback(() => {
    if (!activeRef.current || flashRef.current) return;
    let dy = 0;
    while (!collides(boardRef.current, activeRef.current, 0, dy + 1, 0)) dy++;
    if (dy > 0) {
      activeRef.current = { ...activeRef.current, y: activeRef.current.y + dy };
      // Score is awarded ONLY on line clears — no per-cell hard-drop bonus.
    }
    lockAndClear();
  }, [lockAndClear]);

  // ── Game loop (single rAF, gravity drop + redraw) ───────────────────────
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      // Drop tick
      if (runningRef.current && !paused && !showIntro && activeRef.current && !flashRef.current) {
        const interval = softDropRef.current ? Math.min(60, dropIntervalRef.current) : dropIntervalRef.current;
        if (t - lastDropRef.current >= interval) {
          lastDropRef.current = t;
          // Score is awarded ONLY on line clears — soft drop just falls faster.
          if (!tryMove(0, 1)) lockAndClear();
        }
      }
      drawBoard();
      drawSide();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, showIntro, lockAndClear, tryMove, imagesReady]);

  // ── Drawing ────────────────────────────────────────────────────────────
  const drawCell = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: Piece, ghost = false) => {
    const img = imgsRef.current[type];
    if (img && img.complete && img.naturalWidth > 0) {
      // 1) Solid base fill — last-line defence against any transparent
      //    pixel ever revealing the playfield background through the cell.
      //    Overdraw by 1px on the right/bottom so adjacent cells visually
      //    seal together with no subpixel hairline gaps.
      if (!ghost) {
        ctx.fillStyle = PIECE_BASE[type];
        ctx.fillRect(x, y, size + 1, size + 1);
      }
      // 2) Source-crop the PNG deep inside the artwork: these textures
      //    fade from solid in the centre to a soft alpha edge, so we
      //    sample only the dense inner ~52% of each axis (24% inset on
      //    every edge) to grab the most opaque, saturated region and
      //    stretch it across the entire cell — no transparent corners,
      //    no rounded edges, no fade-to-background halos.
      ctx.save();
      if (ghost) ctx.globalAlpha = 0.22;
      // Crisp pixel sampling — bilinear smoothing was washing out the
      //    inner texture and re-introducing semi-transparent edges.
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      const nW = img.naturalWidth, nH = img.naturalHeight;
      const sInsetX = nW * 0.24;
      const sInsetY = nH * 0.24;
      ctx.drawImage(
        img,
        sInsetX, sInsetY, nW - sInsetX * 2, nH - sInsetY * 2,
        x, y, size + 1, size + 1,
      );
      ctx.imageSmoothingEnabled = prevSmoothing;
      ctx.restore();
      // 3) Coloured glow rim so each piece is identifiable at a glance.
      if (!ghost) {
        ctx.save();
        ctx.shadowColor = PIECE_GLOW[type];
        ctx.shadowBlur = Math.max(4, size * 0.25);
        ctx.strokeStyle = PIECE_GLOW[type];
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        ctx.restore();
      }
    } else {
      // Fallback solid colour cell
      ctx.fillStyle = ghost ? PIECE_GLOW[type].replace(/[\d.]+\)$/, "0.18)") : PIECE_GLOW[type];
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  };

  const drawBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cell = Math.floor(Math.min(W / COLS, H / ROWS));
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const offX = Math.floor((W - boardW) / 2);
    const offY = Math.floor((H - boardH) / 2);

    // Background — clear so the page-level Molten icon image shows through
    // behind the playfield, then paint a translucent dark wash inside the
    // bordered play area only, for block legibility.
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(8,3,1,0.55)";
    ctx.fillRect(offX, offY, boardW, boardH);

    // Subtle grid
    ctx.strokeStyle = "rgba(255,140,50,0.07)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(offX + c * cell + 0.5, offY);
      ctx.lineTo(offX + c * cell + 0.5, offY + boardH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(offX, offY + r * cell + 0.5);
      ctx.lineTo(offX + boardW, offY + r * cell + 0.5);
      ctx.stroke();
    }

    // Border — gold rim
    ctx.strokeStyle = "rgba(251,191,36,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(offX - 1, offY - 1, boardW + 2, boardH + 2);

    // Locked cells
    const board = boardRef.current;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cellVal = board[r][c];
        if (cellVal !== 0) {
          drawCell(ctx, offX + c * cell, offY + r * cell, cell, cellVal);
        }
      }
    }

    // Ghost piece (where it would land)
    const active = activeRef.current;
    if (active && !flashRef.current) {
      let gy = 0;
      while (!collides(board, active, 0, gy + 1, 0)) gy++;
      const shape = SHAPES[active.type][active.rot];
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const x = active.x + c;
          const y = active.y + r + gy;
          if (y >= 0) drawCell(ctx, offX + x * cell, offY + y * cell, cell, active.type, true);
        }
      }
      // Active piece on top
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const x = active.x + c;
          const y = active.y + r;
          if (y >= 0) drawCell(ctx, offX + x * cell, offY + y * cell, cell, active.type);
        }
      }
    }

    // Line-clear flash overlay
    if (flashRef.current) {
      const alpha = Math.max(0, (flashRef.current.until - performance.now()) / 180);
      ctx.fillStyle = `rgba(255,220,80,${0.7 * alpha})`;
      for (const r of flashRef.current.rows) {
        ctx.fillRect(offX, offY + r * cell, boardW, cell);
      }
    }
  };

  // Render a single piece centred inside the given canvas. Used by both the
  // NEXT and HOLD side panels.
  const drawPieceCanvas = (canvas: HTMLCanvasElement | null, t: Piece | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (t == null) return;
    const shape = SHAPES[t][0];
    const cell = Math.floor(Math.min(W / 5, H / 4));
    const w = shape[0].length * cell;
    const h = shape.length * cell;
    const offX = Math.floor((W - w) / 2);
    const offY = Math.floor((H - h) / 2);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        drawCell(ctx, offX + c * cell, offY + r * cell, cell, t);
      }
    }
  };

  const drawSide = () => {
    drawPieceCanvas(sideCanvasRef.current, nextRef.current);
    drawPieceCanvas(holdCanvasRef.current, holdRef.current);
  };

  // ── Resize canvases to their container, accounting for DPR ──────────────
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      if (c) {
        const rect = c.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.floor(rect.width * dpr);
        c.height = Math.floor(rect.height * dpr);
      }
      const s = sideCanvasRef.current;
      if (s) {
        const rect = s.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        s.width = Math.floor(rect.width * dpr);
        s.height = Math.floor(rect.height * dpr);
      }
      const h = holdCanvasRef.current;
      if (h) {
        const rect = h.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        h.width = Math.floor(rect.width * dpr);
        h.height = Math.floor(rect.height * dpr);
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Touch / pointer controls ────────────────────────────────────────────
  // Gesture model (designed for thumbs on a phone):
  //   - Quick tap (< 240 ms, small movement) → rotate
  //   - Horizontal swipe → step left/right one cell per ~STEP_PX of travel
  //   - HOLD finger still on screen for HOLD_MS → soft drop (faster fall)
  //   - Hard, fast downward flick → hard drop
  //
  // The hold-to-soft-drop only engages once the finger has been planted
  // for HOLD_MS without moving much, so a tap or a swipe never accidentally
  // triggers it. Releasing the finger always cancels soft drop.
  const gestureRef = useRef<{
    active: boolean;
    primaryId: number;
    startX: number; startY: number;
    lastStepX: number;
    startTime: number;
    movedH: number;
    movedV: number;
    holdTimer: number | null;     // setTimeout id that arms soft-drop
    softDropArmed: boolean;       // true once the hold-timer has fired
  }>({ active: false, primaryId: -1, startX: 0, startY: 0, lastStepX: 0, startTime: 0, movedH: 0, movedV: 0, holdTimer: null, softDropArmed: false });

  const STEP_PX = 28;     // px of travel to step the piece one cell sideways
  const HOLD_MS = 220;    // hold this long without moving → soft drop engages
  const HOLD_MOVE_TOL = 10; // pixels of movement that cancel the hold-arm

  const cancelHoldTimer = () => {
    if (gestureRef.current.holdTimer != null) {
      clearTimeout(gestureRef.current.holdTimer);
      gestureRef.current.holdTimer = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (gameOver || paused || showIntro) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // Ignore additional fingers while a primary gesture is active.
    if (gestureRef.current.active) return;
    cancelHoldTimer();
    gestureRef.current = {
      active: true, primaryId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      lastStepX: e.clientX, startTime: performance.now(),
      movedH: 0, movedV: 0,
      holdTimer: window.setTimeout(() => {
        // Finger has stayed put long enough — engage soft drop.
        if (gestureRef.current.active) {
          gestureRef.current.softDropArmed = true;
          softDropRef.current = true;
        }
      }, HOLD_MS),
      softDropArmed: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.active || e.pointerId !== g.primaryId || gameOver || paused) return;
    const dx = e.clientX - g.lastStepX;
    const totalDx = e.clientX - g.startX;
    const totalDy = e.clientY - g.startY;
    g.movedH = Math.max(g.movedH, Math.abs(totalDx));
    g.movedV = Math.max(g.movedV, Math.abs(totalDy));

    // Any meaningful movement before soft drop arms cancels the hold —
    // the user is swiping, not holding.
    if (!g.softDropArmed && (g.movedH > HOLD_MOVE_TOL || g.movedV > HOLD_MOVE_TOL)) {
      cancelHoldTimer();
    }

    // Horizontal stepping — step once per STEP_PX of travel since last step
    if (Math.abs(dx) >= STEP_PX) {
      const steps = Math.trunc(dx / STEP_PX);
      for (let i = 0; i < Math.abs(steps); i++) {
        if (!tryMove(steps > 0 ? 1 : -1, 0)) break;
      }
      g.lastStepX = g.lastStepX + steps * STEP_PX;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.active || e.pointerId !== g.primaryId) return;
    cancelHoldTimer();
    softDropRef.current = false;
    const wasSoftDropping = g.softDropArmed;
    g.active = false;
    g.primaryId = -1;
    g.softDropArmed = false;
    if (gameOver || paused) return;
    const dt = performance.now() - g.startTime;
    const totalDy = e.clientY - g.startY;
    const totalDx = e.clientX - g.startX;
    // Hard drop: fast downward flick (>120 px in <300 ms, mostly vertical).
    // Skipped if the user was already soft-dropping — they meant to hold.
    if (!wasSoftDropping && dt < 300 && totalDy > 120 && Math.abs(totalDy) > Math.abs(totalDx) * 1.5) {
      hardDrop();
      return;
    }
    // Tap: small movement, short duration → rotate. Skipped during a hold
    // so releasing a soft-drop never accidentally rotates.
    if (!wasSoftDropping && g.movedH < 12 && g.movedV < 12 && dt < 240) {
      tryRotate();
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (gestureRef.current.primaryId !== e.pointerId) return;
    cancelHoldTimer();
    gestureRef.current.active = false;
    gestureRef.current.primaryId = -1;
    gestureRef.current.softDropArmed = false;
    softDropRef.current = false;
  };

  // Keyboard controls (handy on desktop; harmless on mobile)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOver) return;
      if (e.key === "ArrowLeft")        { e.preventDefault(); tryMove(-1, 0); }
      else if (e.key === "ArrowRight")  { e.preventDefault(); tryMove(1, 0); }
      else if (e.key === "ArrowDown")   { e.preventDefault(); softDropRef.current = true; }
      else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") { e.preventDefault(); tryRotate(); }
      else if (e.key === " ")           { e.preventDefault(); hardDrop(); }
      else if (e.key === "p" || e.key === "P") { setPaused(p => !p); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") softDropRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [tryMove, tryRotate, hardDrop, gameOver]);

  const accent = "#fbbf24"; // volcanic gold

  return (
    <div
      data-testid="page-molten-blocks"
      style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${bgMolten})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex", flexDirection: "column",
        userSelect: "none", touchAction: "none", overflow: "hidden",
        fontFamily: "Lora, serif", color: "#f5d589",
      }}
    >
      {/* Translucent black overlay so foreground game UI stays legible */}
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.62)",
        pointerEvents: "none", zIndex: 0,
      }} />
      {/* Top accent line */}
      <div style={{ height: 2, flexShrink: 0, position: "relative", zIndex: 1, background: "linear-gradient(90deg,transparent,#d97706,#fbbf24,#d97706,transparent)" }} />

      {/* Header — score / level / next.
          Top padding honours the device safe-area (iOS notch / Android status bar)
          so the score and lives are never clipped on mobile. */}
      <div style={{ flexShrink: 0, position: "relative", zIndex: 1, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 12px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button
          data-testid="button-exit-molten-blocks"
          onClick={() => navigate("/world/volcanic")}
          style={{
            background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}55`,
            color: accent, padding: "6px 12px", borderRadius: 8,
            fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
          }}
        >← Exit</button>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Stat label="SCORE" value={score} testId="text-score" />
          <Stat label="LVL" value={level} testId="text-level" />
          <div style={{ textAlign: "center", minWidth: 64 }} data-testid="text-lives">
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#7a5530" }}>LIVES</div>
            <div style={{ fontSize: 18, lineHeight: 1.1, letterSpacing: "0.1em" }}>
              {Array.from({ length: STARTING_LIVES }).map((_, i) => (
                <span key={i} style={{ color: i < lives ? "#ff5a1f" : "#3a1a0a", textShadow: i < lives ? "0 0 6px rgba(255,90,30,0.7)" : "none" }}>♥</span>
              ))}
            </div>
          </div>
        </div>

        <button
          data-testid="button-pause"
          onClick={() => setPaused(p => !p)}
          style={{
            background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}55`,
            color: accent, padding: "6px 12px", borderRadius: 8,
            fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
          }}
        >{paused ? "▶" : "II"}</button>
      </div>

      {/* Main playfield + top strip (NEXT/BEST/COINS) + bottom strip (HOLD) */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", padding: "4px 8px 8px", gap: 6 }}>

        {/* TOP STRIP — NEXT preview · BEST · COINS, sitting just above the playfield */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "stretch", gap: 6, height: 42 }}>
          <div style={{
            flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6,
            background: "rgba(20,8,4,0.85)", border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 8, padding: "2px 8px 2px 6px",
            boxShadow: "0 0 12px rgba(217,119,6,0.15) inset",
          }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#a06a30" }}>NEXT</div>
            <canvas
              ref={sideCanvasRef}
              data-testid="canvas-next"
              style={{ width: 56, height: 36, display: "block" }}
            />
          </div>
          <MiniStat label="BEST" value={hiScore.toLocaleString()} color={accent} testId="text-hi-score" />
          <MiniStat label="COINS" value={coinsEarned.toLocaleString()} color="#ffd166" testId="text-coins-earned" />
        </div>

        {/* PLAYFIELD — full width, fills remaining vertical space */}
        <div
          style={{ flex: 1, minHeight: 0, position: "relative" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <canvas
            ref={canvasRef}
            data-testid="canvas-board"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
          />
        </div>

        {/* BOTTOM STRIP — gesture hint on the left, HOLD slot pinned bottom-right */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 9, lineHeight: 1.4, color: "#7a5530", letterSpacing: "0.06em", flex: 1 }}>
            TAP rotate · SWIPE move · HOLD soft drop · FLICK ↓ slam
          </div>
          <button
            data-testid="button-hold"
            onClick={tryHold}
            disabled={paused || showIntro || gameOver}
            style={{
              background: "rgba(20,8,4,0.85)",
              border: `1px solid ${holdPiece ? "rgba(251,191,36,0.55)" : "rgba(251,191,36,0.25)"}`,
              borderRadius: 8,
              padding: "3px 8px 4px 6px",
              cursor: "pointer",
              outline: "none",
              fontFamily: "inherit",
              color: "inherit",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 0 12px rgba(217,119,6,0.15) inset",
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#a06a30" }}>HOLD</div>
            <canvas
              ref={holdCanvasRef}
              data-testid="canvas-hold"
              style={{ width: 56, height: 34, display: "block" }}
            />
          </button>
        </div>
      </div>

      {/* Pre-game intro: title + tutorial + Start button (mount-only) */}
      {showIntro && !gameOver && (
        <Overlay>
          <div style={{ fontSize: 11, letterSpacing: "0.32em", color: "#a06a30" }}>THE MOLTEN BASTION</div>
          <h2 style={{
            margin: "6px 0 4px", fontSize: 34, color: accent, letterSpacing: "0.16em",
            textShadow: "0 0 18px rgba(255,140,30,0.6), 0 0 6px rgba(255,200,40,0.5)",
          }}>MOLTEN BLOCKS</h2>
          <div style={{ fontSize: 12, color: "#7a5530", marginBottom: 16, letterSpacing: "0.06em", fontStyle: "italic" }}>
            Stack the lava-stone before the bastion fills.
          </div>

          <div style={{
            background: "rgba(20,8,4,0.85)", border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 16, maxWidth: 320,
            textAlign: "left", lineHeight: 1.55, fontSize: 12, color: "#f5d589",
          }}>
            <TutoLine icon="↺" text="TAP to rotate the falling piece." />
            <TutoLine icon="↔" text="SWIPE left or right to move." />
            <TutoLine icon="●" text="HOLD your finger still to soft drop." />
            <TutoLine icon="↓" text="FLICK down hard to slam the piece." />
          </div>

          <button
            data-testid="button-start-game"
            onClick={() => {
              // Reset the drop clock so the first piece doesn't fall the
              // instant the player taps Start (the loop was paused while
              // the intro was up, so `lastDropRef` is stale).
              lastDropRef.current = performance.now();
              setShowIntro(false);
            }}
            style={{ ...overlayBtnStyle(accent), fontSize: 15, padding: "12px 32px", letterSpacing: "0.18em" }}
          >START</button>
        </Overlay>
      )}

      {/* Pause overlay */}
      {paused && !gameOver && !showIntro && (
        <Overlay>
          <h2 style={{ margin: 0, fontSize: 28, color: accent, letterSpacing: "0.18em" }}>PAUSED</h2>
          {coinsEarned > 0 && (
            <div style={{ fontSize: 12, color: "#ffd166", letterSpacing: "0.06em", marginTop: 4 }}>
              {coinsEarned.toLocaleString()} coin{coinsEarned === 1 ? "" : "s"} earned this run
            </div>
          )}
          <button
            data-testid="button-resume"
            onClick={() => setPaused(false)}
            style={overlayBtnStyle(accent)}
          >Resume</button>
          <button
            data-testid="button-return-cashout"
            onClick={async () => {
              // Cash out whatever the player has earned, then leave the game.
              await finalizeRun();
              navigate("/world/volcanic");
            }}
            style={{ ...overlayBtnStyle(accent), background: "rgba(20,8,4,0.85)" }}
          >Return &amp; Keep Earnings</button>
        </Overlay>
      )}

      {/* Coin-tier flash inside the game */}
      {coinFlash && performance.now() - coinFlash.ts < 1400 && !gameOver && (
        <div
          data-testid="text-coin-flash"
          style={{
            position: "absolute", top: "30%", left: "50%",
            transform: "translate(-50%, -50%)", zIndex: 5,
            pointerEvents: "none",
            fontSize: 28, fontFamily: "Lora, serif",
            color: "#ffd166", letterSpacing: "0.1em",
            textShadow: "0 0 18px rgba(255,200,40,0.8), 0 0 6px rgba(255,140,30,0.9)",
            animation: "moltenCoinPop 1.4s ease-out forwards",
          }}
        >+{coinFlash.amount} coins!</div>
      )}
      <style>{`
        @keyframes moltenCoinPop {
          0%   { opacity: 0; transform: translate(-50%, -30%) scale(0.7); }
          18%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
          70%  { opacity: 1; transform: translate(-50%, -60%) scale(1.0); }
          100% { opacity: 0; transform: translate(-50%, -90%) scale(0.95); }
        }
      `}</style>

      {/* Game over overlay — "You didn't make it" + run summary */}
      {gameOver && (
        <Overlay>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#a06a30" }}>THE FLAMES CONSUME ALL</div>
          <h2 style={{ margin: "8px 0 2px", fontSize: 28, color: accent, letterSpacing: "0.16em" }}>YOU DIDN'T MAKE IT</h2>
          <div style={{ fontSize: 12, color: "#7a5530", marginBottom: 14, letterSpacing: "0.05em" }}>
            The bastion's fire has claimed your stack.
          </div>

          {/* New high-score badge — only when this run beat the prior best */}
          {score > prevHi && score > 0 && (
            <div
              data-testid="text-new-high-score"
              style={{
                fontSize: 13, letterSpacing: "0.22em", color: "#fff5a0",
                background: "linear-gradient(90deg, rgba(217,119,6,0.0), rgba(251,191,36,0.25), rgba(217,119,6,0.0))",
                padding: "6px 14px", borderRadius: 9999, marginBottom: 12,
                textShadow: "0 0 14px rgba(255,220,80,0.8)",
                border: "1px solid rgba(251,191,36,0.5)",
              }}
            >
              ✦ NEW HIGH SCORE ✦
            </div>
          )}

          {/* Run summary card */}
          <div style={{
            background: "rgba(20,8,4,0.85)", border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 10, padding: "12px 18px", marginBottom: 14, minWidth: 220,
          }}>
            <SummaryRow label="Score"         value={score.toLocaleString()}        testId="text-final-score" highlight />
            <SummaryRow label="Lines cleared" value={lines.toLocaleString()}        testId="text-final-lines" />
            <SummaryRow label="Coins earned"  value={`+${coinsEarned.toLocaleString()}`} testId="text-final-coins" coinColor />
            <SummaryRow label="Best"          value={hiScore.toLocaleString()}      testId="text-final-best" muted />
          </div>

          {/* Coin-credit status note (so the player sees the deposit happen) */}
          <div data-testid="text-coin-status" style={{ fontSize: 11, color: "#a06a30", marginBottom: 14, letterSpacing: "0.06em", minHeight: 14 }}>
            {coinAward.status === "submitting" && "Adding coins to your purse…"}
            {coinAward.status === "done" && coinAward.amount > 0 && `${coinAward.amount} coins added to your balance.`}
            {coinAward.status === "done" && coinAward.amount === 0 && "No coins this run — try clearing more rows!"}
            {coinAward.status === "error" && (
              <span style={{ color: "#ff8a5a" }}>
                Couldn't credit coins — they'll be saved next time.
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              data-testid="button-restart"
              onClick={startNewGame}
              style={overlayBtnStyle(accent)}
            >Restart</button>
            <button
              data-testid="button-return"
              onClick={() => navigate("/world/volcanic")}
              style={overlayBtnStyle("#a06a30")}
            >Return</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────
function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 58 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#7a5530" }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: 20, color: "#fbbf24", fontWeight: 600, lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, testId }: { label: string; value: string; color: string; testId?: string }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
      background: "rgba(20,8,4,0.85)", border: "1px solid rgba(251,191,36,0.35)",
      borderRadius: 8, padding: "2px 8px",
      boxShadow: "0 0 12px rgba(217,119,6,0.15) inset",
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#a06a30" }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: 15, color, fontWeight: 600, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(20,8,4,0.85)",
      border: "1px solid rgba(251,191,36,0.35)",
      borderRadius: 8, padding: "6px",
      boxShadow: "0 0 12px rgba(217,119,6,0.15) inset",
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#a06a30", textAlign: "center", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      background: "rgba(8,3,1,0.82)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 8, padding: 20, textAlign: "center",
    }}>
      {children}
    </div>
  );
}

function TutoLine({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "2px 0" }}>
      <span style={{ color: "#fbbf24", fontSize: 12, minWidth: 16, textAlign: "center" }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function SummaryRow({ label, value, testId, highlight, muted, coinColor }: { label: string; value: string; testId?: string; highlight?: boolean; muted?: boolean; coinColor?: boolean }) {
  const valColor = coinColor ? "#ffd166" : highlight ? "#fbbf24" : muted ? "#a06a30" : "#f5d589";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", gap: 18 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.18em", color: "#7a5530", textTransform: "uppercase" }}>{label}</span>
      <span data-testid={testId} style={{ fontSize: highlight ? 18 : 14, color: valColor, fontWeight: highlight ? 600 : 500 }}>{value}</span>
    </div>
  );
}

function overlayBtnStyle(color: string): React.CSSProperties {
  return {
    background: "rgba(20,8,4,0.95)",
    border: `1.5px solid ${color}`,
    color, padding: "10px 22px", borderRadius: 9999,
    fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.16em",
    cursor: "pointer",
  };
}
