import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import blockI from "@assets/molten_block_I.png";
import blockO from "@assets/molten_block_O.png";
import blockT from "@assets/molten_block_T.png";
import blockS from "@assets/molten_block_S.png";
import blockZ from "@assets/molten_block_Z.png";
import blockL from "@assets/molten_block_L.png";
import blockJ from "@assets/molten_block_J.png";

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
const ROWS = 20;

const PIECE_GLOW: Record<Piece, string> = {
  I: "rgba(255,200,40,0.85)",
  O: "rgba(255,160,40,0.85)",
  T: "rgba(190,80,255,0.85)",
  S: "rgba(120,255,90,0.85)",
  Z: "rgba(255,60,60,0.9)",
  L: "rgba(255,120,30,0.9)",
  J: "rgba(80,140,255,0.85)",
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

const SCORE_BY_LINES = [0, 100, 300, 500, 800];

export default function MoltenBlocksPage() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sideCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game state stored in refs so the rAF loop is stable; React state mirrors
  // the bits the UI needs to display (score, level, etc.) and triggers
  // re-renders for game-over / paused screens.
  const boardRef = useRef<Cell[][]>(emptyBoard());
  const bagRef = useRef<Piece[]>([]);
  const activeRef = useRef<ActivePiece | null>(null);
  const nextRef = useRef<Piece | null>(null);
  const flashRef = useRef<{ rows: number[]; until: number } | null>(null);
  const lastDropRef = useRef<number>(0);
  const dropIntervalRef = useRef<number>(800);
  const softDropRef = useRef<boolean>(false);
  const runningRef = useRef<boolean>(true);
  const gameOverRef = useRef<boolean>(false);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [hiScore, setHiScore] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("molten_blocks_hi") || "0", 10) || 0; } catch { return 0; }
  });
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);

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

  const startNewGame = useCallback(() => {
    boardRef.current = emptyBoard();
    bagRef.current = makeBag();
    activeRef.current = spawn(pullPiece());
    nextRef.current = pullPiece();
    flashRef.current = null;
    lastDropRef.current = performance.now();
    dropIntervalRef.current = 800;
    softDropRef.current = false;
    gameOverRef.current = false;
    runningRef.current = true;
    setScore(0); setLines(0); setLevel(1); setGameOver(false); setPaused(false);
  }, [pullPiece]);

  // Initialize on mount
  useEffect(() => { startNewGame(); /* eslint-disable-next-line */ }, []);

  // ── Spawn next piece, detect game over ──────────────────────────────────
  const spawnNext = useCallback(() => {
    const t = nextRef.current!;
    const p = spawn(t);
    nextRef.current = pullPiece();
    if (collides(boardRef.current, p)) {
      gameOverRef.current = true;
      runningRef.current = false;
      setGameOver(true);
      setHiScore(prev => {
        const next = Math.max(prev, scoreRef.current);
        try { localStorage.setItem("molten_blocks_hi", String(next)); } catch {}
        return next;
      });
      activeRef.current = null;
    } else {
      activeRef.current = p;
    }
  }, [pullPiece]);

  // Keep a ref of score for the game-over hi-score callback above
  const scoreRef = useRef(0);
  useEffect(() => { scoreRef.current = score; }, [score]);

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
        setScore(s => s + SCORE_BY_LINES[n] * level);
        setLines(prevLines => {
          const totalLines = prevLines + n;
          const newLevel = Math.floor(totalLines / 10) + 1;
          if (newLevel !== level) {
            setLevel(newLevel);
            // Speed curve: each level shaves ~12% off the drop interval.
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
      setScore(s => s + dy * 2);
    }
    lockAndClear();
  }, [lockAndClear]);

  // ── Game loop (single rAF, gravity drop + redraw) ───────────────────────
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      // Drop tick
      if (runningRef.current && !paused && activeRef.current && !flashRef.current) {
        const interval = softDropRef.current ? Math.min(60, dropIntervalRef.current) : dropIntervalRef.current;
        if (t - lastDropRef.current >= interval) {
          lastDropRef.current = t;
          if (!tryMove(0, 1)) lockAndClear();
          else if (softDropRef.current) setScore(s => s + 1);
        }
      }
      drawBoard();
      drawSide();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, lockAndClear, tryMove, imagesReady]);

  // ── Drawing ────────────────────────────────────────────────────────────
  const drawCell = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: Piece, ghost = false) => {
    const img = imgsRef.current[type];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      if (ghost) ctx.globalAlpha = 0.22;
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      // Subtle glow rim for solid pieces
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

    // Background — molten obsidian gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a0a06");
    bg.addColorStop(0.5, "#0d0503");
    bg.addColorStop(1, "#1f0a04");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

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

  const drawSide = () => {
    const canvas = sideCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!nextRef.current) return;
    const t = nextRef.current;
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
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Touch / pointer controls ────────────────────────────────────────────
  // Gesture model (designed for thumbs on a phone):
  //   - Tap (small movement, < 220 ms) → rotate
  //   - Horizontal swipe → step left/right one cell per ~CELL of travel
  //   - Downward swipe held → soft drop (faster fall)
  //   - Hard, fast downward flick → hard drop
  const gestureRef = useRef<{
    active: boolean;
    startX: number; startY: number;
    lastStepX: number;
    startTime: number;
    movedH: number;
    movedV: number;
    softDropTriggered: boolean;
  }>({ active: false, startX: 0, startY: 0, lastStepX: 0, startTime: 0, movedH: 0, movedV: 0, softDropTriggered: false });

  const STEP_PX = 28; // px the finger must travel to step the piece by 1 cell

  const onPointerDown = (e: React.PointerEvent) => {
    if (gameOver || paused) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    gestureRef.current = {
      active: true, startX: e.clientX, startY: e.clientY,
      lastStepX: e.clientX, startTime: performance.now(),
      movedH: 0, movedV: 0, softDropTriggered: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.active || gameOver || paused) return;
    const dx = e.clientX - g.lastStepX;
    const totalDx = e.clientX - g.startX;
    const totalDy = e.clientY - g.startY;
    g.movedH = Math.max(g.movedH, Math.abs(totalDx));
    g.movedV = Math.max(g.movedV, Math.abs(totalDy));

    // Horizontal stepping — step once per STEP_PX of travel since last step
    if (Math.abs(dx) >= STEP_PX) {
      const steps = Math.trunc(dx / STEP_PX);
      for (let i = 0; i < Math.abs(steps); i++) {
        if (!tryMove(steps > 0 ? 1 : -1, 0)) break;
      }
      g.lastStepX = g.lastStepX + steps * STEP_PX;
    }

    // Soft-drop while finger is held downward past a threshold
    if (totalDy > 24 && Math.abs(totalDy) > Math.abs(totalDx)) {
      softDropRef.current = true;
      g.softDropTriggered = true;
    } else if (totalDy < 12) {
      softDropRef.current = false;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;
    softDropRef.current = false;
    if (gameOver || paused) return;
    const dt = performance.now() - g.startTime;
    const totalDy = e.clientY - g.startY;
    const totalDx = e.clientX - g.startX;
    // Hard drop: fast downward flick (>120 px in <300 ms, mostly vertical)
    if (dt < 300 && totalDy > 120 && Math.abs(totalDy) > Math.abs(totalDx) * 1.5) {
      hardDrop();
      return;
    }
    // Tap: small movement, short duration → rotate
    if (g.movedH < 12 && g.movedV < 12 && dt < 240) {
      tryRotate();
    }
  };

  const onPointerCancel = () => {
    gestureRef.current.active = false;
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
        background: "radial-gradient(ellipse at 50% 30%, #2a0d04 0%, #120602 55%, #050201 100%)",
        display: "flex", flexDirection: "column",
        userSelect: "none", touchAction: "none", overflow: "hidden",
        fontFamily: "Lora, serif", color: "#f5d589",
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, flexShrink: 0, background: "linear-gradient(90deg,transparent,#d97706,#fbbf24,#d97706,transparent)" }} />

      {/* Header — score / level / next */}
      <div style={{ flexShrink: 0, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button
          data-testid="button-exit-molten-blocks"
          onClick={() => navigate("/world/volcanic")}
          style={{
            background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}55`,
            color: accent, padding: "6px 12px", borderRadius: 8,
            fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
          }}
        >← Exit</button>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Stat label="SCORE" value={score} testId="text-score" />
          <Stat label="LINES" value={lines} testId="text-lines" />
          <Stat label="LVL" value={level} testId="text-level" />
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

      {/* Title strip */}
      <div style={{ flexShrink: 0, textAlign: "center", padding: "0 12px 6px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#a06a30", textTransform: "uppercase" }}>The Molten Bastion</div>
        <h1 style={{ margin: "2px 0 0", fontSize: 22, color: accent, letterSpacing: "0.1em", textShadow: "0 0 18px rgba(251,191,36,0.4)" }}>
          MOLTEN BLOCKS
        </h1>
      </div>

      {/* Main playfield + side panel */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", padding: "4px 8px 8px", gap: 8 }}>
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

        {/* Side panel — Next + best */}
        <div style={{ width: 86, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <Panel label="NEXT">
            <canvas
              ref={sideCanvasRef}
              data-testid="canvas-next"
              style={{ width: "100%", height: 78, display: "block" }}
            />
          </Panel>
          <Panel label="BEST">
            <div data-testid="text-hi-score" style={{ textAlign: "center", padding: "6px 0", fontSize: 16, color: accent, fontWeight: 600 }}>
              {hiScore.toLocaleString()}
            </div>
          </Panel>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 9, lineHeight: 1.4, color: "#7a5530", textAlign: "center", letterSpacing: "0.08em" }}>
            TAP rotate<br/>SWIPE move<br/>HOLD ↓ drop<br/>FLICK ↓ slam
          </div>
        </div>
      </div>

      {/* Pause overlay */}
      {paused && !gameOver && (
        <Overlay>
          <h2 style={{ margin: 0, fontSize: 28, color: accent, letterSpacing: "0.18em" }}>PAUSED</h2>
          <button
            data-testid="button-resume"
            onClick={() => setPaused(false)}
            style={overlayBtnStyle(accent)}
          >Resume</button>
        </Overlay>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <Overlay>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#a06a30" }}>THE FLAMES CONSUME ALL</div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 32, color: accent, letterSpacing: "0.18em" }}>GAME OVER</h2>
          <div data-testid="text-final-score" style={{ fontSize: 18, color: "#f5d589", marginBottom: 4 }}>Score: <span style={{ color: accent, fontWeight: 600 }}>{score.toLocaleString()}</span></div>
          <div style={{ fontSize: 13, color: "#a06a30", marginBottom: 18 }}>Best: {hiScore.toLocaleString()}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button data-testid="button-play-again" onClick={startNewGame} style={overlayBtnStyle(accent)}>Play Again</button>
            <button data-testid="button-back-to-bastion" onClick={() => navigate("/world/volcanic")} style={overlayBtnStyle("#a06a30")}>Leave</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────
function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 50 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#7a5530" }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: 16, color: "#fbbf24", fontWeight: 600, lineHeight: 1.1 }}>
        {value.toLocaleString()}
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
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#a06a30", textAlign: "center", marginBottom: 2 }}>{label}</div>
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

function overlayBtnStyle(color: string): React.CSSProperties {
  return {
    background: "rgba(20,8,4,0.95)",
    border: `1.5px solid ${color}`,
    color, padding: "10px 22px", borderRadius: 9999,
    fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.16em",
    cursor: "pointer",
  };
}
