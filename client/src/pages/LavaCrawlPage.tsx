import { useRef, useEffect, useState, useCallback } from "react";
import { useLocation as useWouter } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
const LAVA_CAVE_BG = "/world-assets/AAC47494-B2BD-4B73-B01A-769E2C589AD7_1783461445112.png?w=1080";

// ─── Game constants ─────────────────────────────────────────────────────────
const LEVEL_W = 6400;
const GRAVITY = 0.52;
const JUMP_VEL = -13.5;
const P_SPEED = 4.2;
const PW = 28, PH = 36;
const EW = 32, EH = 28;
const CR = 10;
const COIN_SCORE = 10;
const ENEMY_SCORE = 25;
const FINISH_BONUS = 200;
const MAX_LIVES = 3;

// Ground is always at (canvasH * GR) from the top
const GR = 0.80;

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = "start" | "playing" | "paused" | "gameover" | "victory" | "leaderboard";

interface Plat { x: number; y: number; w: number; h: number; }

interface Enemy {
  x: number; y: number;
  vx: number; lx: number; rx: number;
  alive: boolean;
  stompY: number; stompTimer: number;
}

interface Coin {
  x: number; y: number;
  collected: boolean;
}

interface GState {
  px: number; py: number;
  pvx: number; pvy: number;
  onGround: boolean;
  facingR: boolean;
  alive: boolean;
  respawnTimer: number;
  enemies: Enemy[];
  coins: Coin[];
  cameraX: number;
  score: number;
  coinsCollected: number;
  lives: number;
  finishReached: boolean;
  lavaY: number;   // current canvas-height for ground
}

// ─── Level data builders (called fresh each new game) ────────────────────────
function buildGrounds(gY: number, ch: number): Plat[] {
  const h = ch - gY + 2;
  const segs: [number, number][] = [
    [0,    700],
    [800,  420],
    [1330, 230],
    [1680, 460],
    [2270, 300],
    [2700, 340],
    [3180, 200],
    [3530, 360],
    [4060, 280],
    [4520, 300],
    [5020, 250],
    [5440, 960],
  ];
  return segs.map(([x, w]) => ({ x, y: gY, w, h }));
}

function buildFloats(gY: number): Plat[] {
  const fy = (off: number) => gY - 55 + off;
  return [
    // Bridge gap 700-800
    { x: 710, y: fy(0), w: 90, h: 14 },
    // Bridge gap 1220-1330
    { x: 1230, y: fy(5), w: 90, h: 14 },
    { x: 1150, y: fy(-28), w: 75, h: 14 },
    // Bridge gap 1560-1680
    { x: 1565, y: fy(0), w: 90, h: 14 },
    // Bridge gap 2140-2270
    { x: 2150, y: fy(5), w: 90, h: 14 },
    { x: 2050, y: fy(-25), w: 75, h: 14 },
    // Bridge gap 2570-2700
    { x: 2575, y: fy(0), w: 90, h: 14 },
    // Bridge gap 3040-3180
    { x: 3050, y: fy(5), w: 80, h: 14 },
    { x: 3110, y: fy(-28), w: 70, h: 14 },
    // Bridge gap 3380-3530
    { x: 3385, y: fy(0), w: 90, h: 14 },
    // Bridge gap 3890-4060
    { x: 3900, y: fy(5), w: 80, h: 14 },
    { x: 3965, y: fy(-28), w: 75, h: 14 },
    // Bridge gap 4340-4520
    { x: 4345, y: fy(0), w: 90, h: 14 },
    { x: 4415, y: fy(-28), w: 80, h: 14 },
    // Bridge gap 4820-5020
    { x: 4830, y: fy(5), w: 85, h: 14 },
    { x: 4910, y: fy(-25), w: 80, h: 14 },
    // Bridge gap 5270-5440
    { x: 5280, y: fy(0), w: 90, h: 14 },
    { x: 5360, y: fy(-28), w: 80, h: 14 },
    // Bonus coin platforms
    { x: 250,  y: gY - 100, w: 70, h: 14 },
    { x: 600,  y: gY - 90,  w: 65, h: 14 },
    { x: 950,  y: gY - 100, w: 70, h: 14 },
    { x: 1750, y: gY - 100, w: 70, h: 14 },
    { x: 2350, y: gY - 95,  w: 65, h: 14 },
    { x: 2820, y: gY - 100, w: 70, h: 14 },
    { x: 3600, y: gY - 95,  w: 65, h: 14 },
    { x: 4150, y: gY - 100, w: 70, h: 14 },
    { x: 4700, y: gY - 95,  w: 65, h: 14 },
    { x: 5100, y: gY - 100, w: 70, h: 14 },
    { x: 5800, y: gY - 90,  w: 65, h: 14 },
    { x: 6050, y: gY - 100, w: 70, h: 14 },
  ];
}

function buildCoins(gY: number): Coin[] {
  const pts: [number, number][] = [
    // Ground level coins
    [120, gY - 30], [280, gY - 30], [480, gY - 30],
    [850, gY - 30], [1000, gY - 30], [1100, gY - 30],
    [1400, gY - 30], [1550, gY - 30],
    [1800, gY - 30], [2050, gY - 30], [2200, gY - 30],
    [2750, gY - 30], [2900, gY - 30], [3050, gY - 30],
    [3600, gY - 30], [3720, gY - 30], [3900, gY - 30],
    [4100, gY - 30], [4200, gY - 30],
    [4600, gY - 30], [4750, gY - 30], [4900, gY - 30],
    [5100, gY - 30], [5200, gY - 30],
    [5500, gY - 30], [5700, gY - 30], [5900, gY - 30],
    [6100, gY - 30], [6300, gY - 30],
    // High platform coins
    [255,  gY - 120], [600,  gY - 108], [955,  gY - 118],
    [1755, gY - 118], [2355, gY - 112], [2825, gY - 118],
    [3605, gY - 112], [4155, gY - 118], [4705, gY - 112],
    [5105, gY - 118], [5805, gY - 108], [6055, gY - 118],
    // Bridge coins
    [715,  gY - 72], [1235, gY - 68], [1568, gY - 72],
    [2155, gY - 68], [2580, gY - 72], [3055, gY - 68],
    [3388, gY - 72], [3902, gY - 68], [4348, gY - 72],
    [4832, gY - 68], [5283, gY - 72],
  ];
  return pts.map(([x, y]) => ({ x, y, collected: false }));
}

function buildEnemies(gY: number): Enemy[] {
  const e = (x: number, lx: number, rx: number): Enemy => ({
    x, y: gY - EH, vx: 1.5, lx, rx, alive: true, stompY: gY - EH, stompTimer: 0,
  });
  return [
    e(870,  800,  1150),
    e(1400, 1330, 1550),
    e(1800, 1680, 2000),
    e(2300, 2270, 2500),
    e(2780, 2700, 2980),
    e(3200, 3180, 3380),
    e(3650, 3530, 3800),
    e(4150, 4060, 4300),
    e(4600, 4520, 4760),
    e(5100, 5020, 5270),
    e(5600, 5440, 5800),
    e(6000, 5440, 6250),
  ];
}

// ─── AABB overlap test ───────────────────────────────────────────────────────
function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ─── Resolve player vs rect collision, return adjusted position ──────────────
function resolveCollision(
  px: number, py: number, pvx: number, pvy: number,
  rx: number, ry: number, rw: number, rh: number,
): { px: number; py: number; pvx: number; pvy: number; onGround: boolean } {
  let onGround = false;
  if (!overlaps(px, py, PW, PH, rx, ry, rw, rh)) return { px, py, pvx, pvy, onGround };

  const overlapL = px + PW - rx;
  const overlapR = rx + rw - px;
  const overlapT = py + PH - ry;
  const overlapB = ry + rh - py;
  const minX = Math.min(overlapL, overlapR);
  const minY = Math.min(overlapT, overlapB);

  if (minY <= minX) {
    if (overlapT < overlapB) {
      py = ry - PH;
      pvy = 0;
      onGround = true;
    } else {
      py = ry + rh;
      pvy = Math.abs(pvy) * 0.3;
    }
  } else {
    if (overlapL < overlapR) {
      px = rx - PW;
      pvx = 0;
    } else {
      px = rx + rw;
      pvx = 0;
    }
  }
  return { px, py, pvx, pvy, onGround };
}

// ─── Input state (shared across renders) ─────────────────────────────────────
const input = { left: false, right: false, jump: false, jumpQueued: false };

// ─── Main page component ─────────────────────────────────────────────────────
export default function LavaCrawlPage() {
  const [, navigate] = useWouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GState | null>(null);
  const rafRef = useRef<number | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const screenRef = useRef<Screen>("start");

  const [screen, setScreen] = useState<Screen>("start");
  const [endScore, setEndScore] = useState(0);
  const [endCoins, setEndCoins] = useState(0);
  const [endLives, setEndLives] = useState(MAX_LIVES);
  const [newBest, setNewBest] = useState(false);

  const { data: myBest } = useQuery<{ best: number; bestCoins: number }>({
    queryKey: ["/api/lava-crawl/my-best"],
  });

  const { data: leaderboard, refetch: refetchLB } = useQuery<any[]>({
    queryKey: ["/api/lava-crawl/leaderboard"],
    enabled: false,
  });

  const completeMutation = useMutation({
    mutationFn: (data: { score: number; coinsCollected: number }) =>
      apiRequest("POST", "/api/lava-crawl/complete", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setNewBest(data.isNewBest ?? false);
      if (data.newCoins !== undefined) {
        queryClient.setQueryData(["/api/auth/me"], (old: any) =>
          old ? { ...old, coins: data.newCoins } : old
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/lava-crawl/my-best"] });
    },
  });

  // Preload background image
  useEffect(() => {
    const img = new Image();
    img.src = LAVA_CAVE_BG;
    img.onload = () => { bgImgRef.current = img; };
  }, []);

  // ─── Build fresh game state ────────────────────────────────────────────────
  const buildState = useCallback((ch: number): GState => {
    const gY = ch * GR;
    const grounds = buildGrounds(gY, ch);
    const floats = buildFloats(gY);
    const allPlats = [...grounds, ...floats];
    const startX = 60, startY = gY - PH;
    return {
      px: startX, py: startY,
      pvx: 0, pvy: 0,
      onGround: false, facingR: true,
      alive: true, respawnTimer: 0,
      enemies: buildEnemies(gY),
      coins: buildCoins(gY),
      cameraX: 0,
      score: 0, coinsCollected: 0,
      lives: MAX_LIVES,
      finishReached: false,
      lavaY: gY,
    };
  }, []);

  const showScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreen(s);
  }, []);

  // ─── Game loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    let lastTime = 0;
    let allPlats: Plat[] = [];

    const loop = (ts: number) => {
      if (screenRef.current !== "playing") return;
      rafRef.current = requestAnimationFrame(loop);

      const dt = Math.min((ts - lastTime) / 16.67, 3);
      lastTime = ts;

      // Sync canvas to physical size
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        ctx.scale(dpr, dpr);
      }
      const VW = cw, VH = ch;

      // Init state if fresh
      if (!stateRef.current) {
        stateRef.current = buildState(VH);
        const gY = stateRef.current.lavaY;
        allPlats = [...buildGrounds(gY, VH), ...buildFloats(gY)];
      }

      const s = stateRef.current;
      const gY = s.lavaY;

      // ── Update ──────────────────────────────────────────────────────────
      if (!s.alive) {
        s.respawnTimer -= dt;
        if (s.respawnTimer <= 0) {
          if (s.lives <= 0) {
            // Game over — stop loop and change screen
            setEndScore(s.score);
            setEndCoins(s.coinsCollected);
            setEndLives(0);
            showScreen("gameover");
            completeMutation.mutate({ score: s.score, coinsCollected: s.coinsCollected });
            return;
          }
          // Respawn
          s.px = 60; s.py = gY - PH;
          s.pvx = 0; s.pvy = 0;
          s.alive = true; s.cameraX = 0;
        }
      } else {
        // Input
        const moveX = (input.left ? -1 : 0) + (input.right ? 1 : 0);
        s.pvx = moveX * P_SPEED;
        if (moveX > 0) s.facingR = true;
        if (moveX < 0) s.facingR = false;

        if ((input.jump || input.jumpQueued) && s.onGround) {
          s.pvy = JUMP_VEL;
          s.onGround = false;
          input.jumpQueued = false;
        }
        input.jumpQueued = false;

        // Physics
        s.pvy += GRAVITY * dt;
        s.px += s.pvx * dt;
        s.py += s.pvy * dt;
        s.onGround = false;

        // Platform collision
        for (const p of allPlats) {
          const r = resolveCollision(s.px, s.py, s.pvx, s.pvy, p.x, p.y, p.w, p.h);
          s.px = r.px; s.py = r.py; s.pvx = r.pvx; s.pvy = r.pvy;
          if (r.onGround) s.onGround = true;
        }

        // Clamp to level bounds
        if (s.px < 0) { s.px = 0; s.pvx = 0; }
        if (s.px + PW > LEVEL_W) { s.px = LEVEL_W - PW; s.pvx = 0; }

        // Lava death (fall off screen bottom or into gap below ground)
        if (s.py > VH + 40) {
          s.alive = false;
          s.lives = Math.max(0, s.lives - 1);
          s.respawnTimer = 90;
        }

        // Enemy update + collision
        for (const e of s.enemies) {
          if (!e.alive) {
            if (e.stompTimer > 0) e.stompTimer -= dt;
            continue;
          }
          e.x += e.vx * dt;
          if (e.x <= e.lx) { e.x = e.lx; e.vx = Math.abs(e.vx); }
          if (e.x + EW >= e.rx) { e.x = e.rx - EW; e.vx = -Math.abs(e.vx); }

          // Stomp check — player falls on top of enemy
          const stomped =
            s.pvy > 0 &&
            s.py + PH <= e.y + EH * 0.4 &&
            overlaps(s.px, s.py, PW, PH, e.x, e.y, EW, EH);

          if (stomped) {
            e.alive = false;
            e.stompTimer = 20;
            s.pvy = JUMP_VEL * 0.55;
            s.score += ENEMY_SCORE;
          } else if (s.alive && overlaps(s.px, s.py, PW - 4, PH - 4, e.x + 2, e.y + 2, EW - 4, EH - 4)) {
            // Side/bottom collision → hurt
            s.alive = false;
            s.lives = Math.max(0, s.lives - 1);
            s.respawnTimer = 90;
          }
        }

        // Coin collection
        for (const c of s.coins) {
          if (c.collected) continue;
          const dx = c.x - (s.px + PW / 2);
          const dy = c.y - (s.py + PH / 2);
          if (Math.sqrt(dx * dx + dy * dy) < CR + 14) {
            c.collected = true;
            s.coinsCollected++;
            s.score += COIN_SCORE;
          }
        }

        // Finish portal check
        const finishX = LEVEL_W - 220;
        if (!s.finishReached && s.px + PW > finishX && s.px < finishX + 80 && s.py + PH > gY - 80) {
          s.finishReached = true;
          s.score += FINISH_BONUS;
          setEndScore(s.score);
          setEndCoins(s.coinsCollected);
          setEndLives(s.lives);
          showScreen("victory");
          completeMutation.mutate({ score: s.score, coinsCollected: s.coinsCollected });
          return;
        }

        // Camera follow
        const targetCam = s.px - VW / 2 + PW / 2;
        s.cameraX += (targetCam - s.cameraX) * 0.12 * dt;
        s.cameraX = Math.max(0, Math.min(LEVEL_W - VW, s.cameraX));
      }

      // ── Draw ────────────────────────────────────────────────────────────
      const cx = s.cameraX;

      // Background (parallax)
      if (bgImgRef.current) {
        const bw = bgImgRef.current.width, bh = bgImgRef.current.height;
        const scale = VH / bh;
        const scaledW = bw * scale;
        const totalScrollable = LEVEL_W - VW;
        const bgOffset = totalScrollable > 0 ? -(cx * 0.35) : 0;
        ctx.drawImage(bgImgRef.current, bgOffset % scaledW, 0, scaledW, VH);
        if (bgOffset % scaledW + scaledW < VW) {
          ctx.drawImage(bgImgRef.current, bgOffset % scaledW + scaledW, 0, scaledW, VH);
        }
      } else {
        ctx.fillStyle = "#1a0a05";
        ctx.fillRect(0, 0, VW, VH);
      }

      // Lava (animated fill in gaps)
      const lavaT = ts * 0.001;
      const lavaGrad = ctx.createLinearGradient(0, gY, 0, VH);
      lavaGrad.addColorStop(0, `rgba(255,${80 + Math.sin(lavaT * 3) * 20},0,0.95)`);
      lavaGrad.addColorStop(0.4, "#cc2200");
      lavaGrad.addColorStop(1, "#660800");
      ctx.fillStyle = lavaGrad;
      ctx.fillRect(0, gY, VW, VH - gY);

      // Lava surface glow
      ctx.strokeStyle = `rgba(255,${140 + Math.sin(lavaT * 4) * 40},0,0.8)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let lx = 0; lx <= VW; lx += 6) {
        const waveY = gY + Math.sin((lx + cx * 0.5 + lavaT * 120) * 0.04) * 4;
        lx === 0 ? ctx.moveTo(lx, waveY) : ctx.lineTo(lx, waveY);
      }
      ctx.stroke();

      // Platforms
      for (const p of allPlats) {
        const px2 = p.x - cx, py2 = p.y;
        if (px2 + p.w < -10 || px2 > VW + 10) continue;

        const isGround = p.h > 20;
        // Stone texture
        const grad = ctx.createLinearGradient(px2, py2, px2, py2 + p.h);
        if (isGround) {
          grad.addColorStop(0, "#5a3520");
          grad.addColorStop(0.3, "#3d2010");
          grad.addColorStop(1, "#200a00");
        } else {
          grad.addColorStop(0, "#6b4030");
          grad.addColorStop(1, "#3d2010");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(px2, py2, p.w, p.h);

        // Top edge highlight
        ctx.fillStyle = isGround ? "#7a4a30" : "#8a5540";
        ctx.fillRect(px2, py2, p.w, 3);

        // Lava cracks on ground
        if (isGround && p.w > 80) {
          ctx.strokeStyle = "rgba(255,80,0,0.25)";
          ctx.lineWidth = 1;
          for (let ci = 1; ci < Math.floor(p.w / 80); ci++) {
            const cx2 = px2 + ci * 80 + Math.sin(ci * 3.7) * 20;
            ctx.beginPath();
            ctx.moveTo(cx2, py2 + 4);
            ctx.lineTo(cx2 + 10, py2 + 14);
            ctx.lineTo(cx2 + 5, py2 + 24);
            ctx.stroke();
          }
        }
      }

      // Coins
      for (const c of s.coins) {
        if (c.collected) continue;
        const cx2 = c.x - cx;
        if (cx2 < -20 || cx2 > VW + 20) continue;
        const bounce = Math.sin(lavaT * 4 + c.x * 0.01) * 3;
        ctx.save();
        ctx.shadowColor = "gold";
        ctx.shadowBlur = 8;
        ctx.fillStyle = `hsl(${45 + Math.sin(lavaT * 3 + c.x) * 10}, 100%, ${55 + Math.sin(lavaT * 5) * 10}%)`;
        ctx.beginPath();
        ctx.arc(cx2, c.y - bounce, CR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.arc(cx2 - 3, c.y - bounce - 3, CR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Finish portal
      const finishX = LEVEL_W - 220;
      const fx = finishX - cx;
      if (fx > -100 && fx < VW + 100 && !s.finishReached) {
        const portalPulse = 0.85 + Math.sin(lavaT * 3) * 0.15;
        ctx.save();
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 30;
        const portalGrad = ctx.createRadialGradient(fx + 40, gY - 40, 5, fx + 40, gY - 40, 48 * portalPulse);
        portalGrad.addColorStop(0, "rgba(0,255,136,0.95)");
        portalGrad.addColorStop(0.5, "rgba(0,200,100,0.7)");
        portalGrad.addColorStop(1, "rgba(0,150,60,0)");
        ctx.fillStyle = portalGrad;
        ctx.fillRect(fx, gY - 80, 80, 80);
        ctx.fillStyle = "#00ff88";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("EXIT", fx + 40, gY - 5);
        ctx.restore();
      }

      // Enemies
      for (const e of s.enemies) {
        const ex = e.x - cx;
        if (ex < -50 || ex > VW + 50) continue;
        const ey2 = e.alive ? e.y : e.stompY + (1 - e.stompTimer / 20) * EH;
        const alpha = e.alive ? 1 : e.stompTimer / 20;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Body
        const enemyGrad = ctx.createLinearGradient(ex, ey2, ex, ey2 + EH);
        enemyGrad.addColorStop(0, "#cc2020");
        enemyGrad.addColorStop(1, "#660808");
        ctx.fillStyle = enemyGrad;
        ctx.fillRect(ex, ey2, EW, EH);
        // Eyes
        ctx.fillStyle = "#ffcc00";
        ctx.fillRect(ex + 5, ey2 + 6, 8, 7);
        ctx.fillRect(ex + EW - 13, ey2 + 6, 8, 7);
        ctx.fillStyle = "#000";
        const eyeOff = e.vx > 0 ? 3 : 1;
        ctx.fillRect(ex + 5 + eyeOff, ey2 + 8, 4, 4);
        ctx.fillRect(ex + EW - 13 + eyeOff, ey2 + 8, 4, 4);
        // Horns
        ctx.fillStyle = "#ff6600";
        ctx.beginPath();
        ctx.moveTo(ex + 7, ey2); ctx.lineTo(ex + 4, ey2 - 8); ctx.lineTo(ex + 10, ey2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex + EW - 7, ey2); ctx.lineTo(ex + EW - 4, ey2 - 8); ctx.lineTo(ex + EW - 10, ey2); ctx.fill();
        ctx.restore();
      }

      // Player
      if (s.alive) {
        const ppx = s.px - cx;
        // Glow
        ctx.save();
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 12;

        // Body (orange adventurer)
        ctx.fillStyle = "#e06820";
        if (!s.facingR) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-ppx * 2 - PW, 0);
        }
        // Legs
        ctx.fillStyle = "#6a3010";
        ctx.fillRect(ppx + 4, s.py + PH - 12, 8, 12);
        ctx.fillRect(ppx + PW - 12, s.py + PH - 12, 8, 12);
        // Body
        ctx.fillStyle = "#e06820";
        ctx.fillRect(ppx, s.py + 10, PW, PH - 22);
        // Head
        ctx.fillStyle = "#f0a060";
        ctx.fillRect(ppx + 4, s.py, PW - 8, 14);
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.fillRect(ppx + 7, s.py + 3, 6, 5);
        ctx.fillStyle = "#000";
        ctx.fillRect(ppx + 9, s.py + 4, 3, 3);
        // Arm
        ctx.fillStyle = "#e06820";
        ctx.fillRect(ppx - 4, s.py + 10, 6, 10);
        ctx.fillRect(ppx + PW - 2, s.py + 10, 6, 10);
        if (!s.facingR) ctx.restore();
        ctx.restore();
      } else if (s.respawnTimer > 60) {
        // Flash death indicator
        const ppx = 80 - s.cameraX;
        ctx.save();
        ctx.globalAlpha = (s.respawnTimer % 10 < 5) ? 0.8 : 0.2;
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 24px serif";
        ctx.textAlign = "center";
        ctx.fillText("✦", VW / 2, VH / 2);
        ctx.restore();
      }

      // ── HUD ─────────────────────────────────────────────────────────────
      ctx.save();

      // Top bar background
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, VW, 40);

      // Lives (hearts)
      ctx.font = "18px serif";
      ctx.textAlign = "left";
      for (let i = 0; i < MAX_LIVES; i++) {
        ctx.fillStyle = i < s.lives ? "#ff4444" : "rgba(255,100,100,0.25)";
        ctx.fillText("♥", 10 + i * 24, 26);
      }

      // Score
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${s.score}`, VW / 2, 26);

      // Coins
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`🪙 ${s.coinsCollected}`, VW - 10, 26);

      // Progress bar
      const prog = Math.min(s.px / (LEVEL_W - 100), 1);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(VW * 0.25, 33, VW * 0.5, 4);
      ctx.fillStyle = "#ff8800";
      ctx.fillRect(VW * 0.25, 33, VW * 0.5 * prog, 4);

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [buildState, showScreen, completeMutation]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Start/stop loop based on screen
  useEffect(() => {
    if (screen === "playing") {
      startLoop();
    } else {
      stopLoop();
    }
    return stopLoop;
  }, [screen, startLoop, stopLoop]);

  // ─── Keyboard controls ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) input.left = down;
      if (["ArrowRight", "d", "D"].includes(e.key)) input.right = down;
      if (["ArrowUp", "w", "W", " "].includes(e.key)) {
        if (down) input.jumpQueued = true;
        input.jump = down;
      }
      if (e.key === "Escape" && down && screenRef.current === "playing") {
        showScreen("paused");
      }
    };
    window.addEventListener("keydown", e => onKey(e, true));
    window.addEventListener("keyup", e => onKey(e, false));
    return () => {
      window.removeEventListener("keydown", e => onKey(e, true));
      window.removeEventListener("keyup", e => onKey(e, false));
    };
  }, [showScreen]);

  const startGame = useCallback(() => {
    stateRef.current = null; // will be rebuilt with current canvas dimensions
    input.left = false; input.right = false; input.jump = false; input.jumpQueued = false;
    showScreen("playing");
  }, [showScreen]);

  const goLeaderboard = useCallback(() => {
    refetchLB();
    showScreen("leaderboard");
  }, [refetchLB, showScreen]);

  // ─── Touch button handlers ───────────────────────────────────────────────
  const makeTouch = (field: "left" | "right" | "jump") => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      input[field] = true;
      if (field === "jump") input.jumpQueued = true;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      input[field] = false;
    },
    onMouseDown: () => { input[field] = true; if (field === "jump") input.jumpQueued = true; },
    onMouseUp: () => { input[field] = false; },
    onMouseLeave: () => { input[field] = false; },
  });

  // ─── Overlay panels (non-playing screens) ────────────────────────────────
  const panelStyle: React.CSSProperties = {
    position: "absolute", inset: 0,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "rgba(10,3,0,0.82)",
    backdropFilter: "blur(4px)",
    zIndex: 30,
    padding: "24px 20px",
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    padding: "12px 28px",
    borderRadius: "10px",
    fontFamily: "serif",
    fontSize: "17px",
    fontWeight: "bold",
    cursor: "pointer",
    border: `2px solid ${color}`,
    background: `${color}22`,
    color: color,
    margin: "6px",
    minWidth: "160px",
    letterSpacing: "0.5px",
    transition: "background 0.15s",
  });

  const titleStyle: React.CSSProperties = {
    fontFamily: "Lora, serif",
    fontSize: "34px",
    fontWeight: "bold",
    color: "#ff8800",
    textShadow: "0 2px 20px rgba(255,100,0,0.7)",
    letterSpacing: "2px",
    marginBottom: "4px",
  };

  const subStyle: React.CSSProperties = {
    fontFamily: "Lora, serif",
    color: "#ffd080",
    fontSize: "13px",
    marginBottom: "20px",
    textAlign: "center",
    opacity: 0.85,
    maxWidth: "280px",
    lineHeight: "1.5",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#1a0a05", overflow: "hidden" }}>

      {/* ── Game Canvas ─────────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", width: "100%", touchAction: "none" }}
      />

      {/* ── Touch controls (shown only when playing or paused) ──────────────── */}
      {(screen === "playing" || screen === "paused") && (
        <div style={{ height: "108px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "rgba(10,3,0,0.85)", borderTop: "1px solid rgba(255,100,0,0.25)", userSelect: "none", flexShrink: 0 }}>
          {/* Left */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              data-testid="button-lava-left"
              {...makeTouch("left")}
              style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,120,0,0.18)", border: "2px solid rgba(255,120,0,0.5)", color: "#ff8800", fontSize: "26px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >◀</button>
            <button
              data-testid="button-lava-right"
              {...makeTouch("right")}
              style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,120,0,0.18)", border: "2px solid rgba(255,120,0,0.5)", color: "#ff8800", fontSize: "26px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >▶</button>
          </div>
          {/* Pause */}
          <button
            data-testid="button-lava-pause"
            onMouseDown={() => screen === "playing" ? showScreen("paused") : showScreen("playing")}
            onTouchStart={(e) => { e.preventDefault(); screen === "playing" ? showScreen("paused") : showScreen("playing"); }}
            style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >{screen === "playing" ? "⏸" : "▶"}</button>
          {/* Jump */}
          <button
            data-testid="button-lava-jump"
            {...makeTouch("jump")}
            style={{ width: 82, height: 82, borderRadius: "50%", background: "rgba(255,80,0,0.22)", border: "3px solid rgba(255,100,0,0.7)", color: "#ff8800", fontSize: "14px", fontWeight: "bold", fontFamily: "serif", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", letterSpacing: "0.5px" }}
          >JUMP</button>
        </div>
      )}

      {/* ── START screen ────────────────────────────────────────────────────── */}
      {screen === "start" && (
        <div style={panelStyle}>
          <div style={titleStyle}>🌋 LAVA CRAWL</div>
          <div style={subStyle}>
            Run & jump through the volcanic cavern.<br />
            Collect coins, stomp enemies, reach the exit!
          </div>
          {myBest && myBest.best > 0 && (
            <div style={{ color: "#ffd080", fontSize: "13px", marginBottom: "16px", fontFamily: "monospace" }}>
              Your best: <strong>{myBest.best}</strong> pts · <strong>{myBest.bestCoins}</strong> 🪙
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button data-testid="button-lava-start" style={btnStyle("#ff8800")} onClick={startGame}>▶  Play</button>
            <button data-testid="button-lava-leaderboard-start" style={btnStyle("#ffd080")} onClick={goLeaderboard}>🏆  Leaderboard</button>
            <button data-testid="button-lava-back-start" style={btnStyle("rgba(255,200,100,0.5)")} onClick={() => navigate("/world/volcanic")}>← Volcanic Isle</button>
          </div>
          <div style={{ marginTop: "20px", color: "rgba(255,200,100,0.45)", fontSize: "11px", textAlign: "center", fontFamily: "monospace" }}>
            Arrow keys / WASD to move · Space / Up to jump<br />Esc to pause
          </div>
        </div>
      )}

      {/* ── PAUSED screen ───────────────────────────────────────────────────── */}
      {screen === "paused" && (
        <div style={{ ...panelStyle, height: "auto", top: "auto", bottom: 108, borderRadius: "16px 16px 0 0" }}>
          <div style={{ ...titleStyle, fontSize: "26px", marginBottom: "16px" }}>⏸ Paused</div>
          <button data-testid="button-lava-resume" style={btnStyle("#ff8800")} onClick={() => showScreen("playing")}>▶  Resume</button>
          <button data-testid="button-lava-restart-pause" style={btnStyle("#ffd080")} onClick={startGame}>↺  Restart</button>
          <button data-testid="button-lava-back-pause" style={btnStyle("rgba(255,200,100,0.5)")} onClick={() => navigate("/world/volcanic")}>← Exit Game</button>
        </div>
      )}

      {/* ── GAME OVER screen ─────────────────────────────────────────────────── */}
      {screen === "gameover" && (
        <div style={panelStyle}>
          <div style={{ ...titleStyle, color: "#ff3030", fontSize: "30px" }}>💀 GAME OVER</div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "15px", marginBottom: "8px" }}>Score: <strong>{endScore}</strong></div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "14px", marginBottom: "20px" }}>Coins earned: <strong>{endCoins}</strong> 🪙</div>
          {newBest && <div style={{ color: "#ffd700", fontSize: "14px", marginBottom: "12px", fontFamily: "serif", textShadow: "0 0 10px gold" }}>⭐ New Personal Best!</div>}
          <button data-testid="button-lava-restart-gameover" style={btnStyle("#ff8800")} onClick={startGame}>↺  Try Again</button>
          <button data-testid="button-lava-leaderboard-gameover" style={btnStyle("#ffd080")} onClick={goLeaderboard}>🏆  Leaderboard</button>
          <button data-testid="button-lava-back-gameover" style={btnStyle("rgba(255,200,100,0.5)")} onClick={() => navigate("/world/volcanic")}>← Volcanic Isle</button>
        </div>
      )}

      {/* ── VICTORY screen ──────────────────────────────────────────────────── */}
      {screen === "victory" && (
        <div style={panelStyle}>
          <div style={{ ...titleStyle, color: "#00ff88", fontSize: "30px" }}>🏆 VICTORY!</div>
          <div style={subStyle}>You escaped the lava cavern!</div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "15px", marginBottom: "4px" }}>Score: <strong>{endScore}</strong></div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "14px", marginBottom: "4px" }}>Coins earned: <strong>{endCoins}</strong> 🪙 added to balance</div>
          <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: "12px", marginBottom: "20px" }}>Lives remaining: <strong>{endLives}</strong></div>
          {newBest && <div style={{ color: "#ffd700", fontSize: "14px", marginBottom: "12px", fontFamily: "serif", textShadow: "0 0 10px gold" }}>⭐ New Personal Best!</div>}
          <button data-testid="button-lava-restart-victory" style={btnStyle("#ff8800")} onClick={startGame}>↺  Play Again</button>
          <button data-testid="button-lava-leaderboard-victory" style={btnStyle("#ffd080")} onClick={goLeaderboard}>🏆  Leaderboard</button>
          <button data-testid="button-lava-back-victory" style={btnStyle("rgba(255,200,100,0.5)")} onClick={() => navigate("/world/volcanic")}>← Volcanic Isle</button>
        </div>
      )}

      {/* ── LEADERBOARD screen ──────────────────────────────────────────────── */}
      {screen === "leaderboard" && (
        <div style={panelStyle}>
          <div style={{ ...titleStyle, fontSize: "26px", marginBottom: "16px" }}>🏆 Leaderboard</div>
          {!leaderboard ? (
            <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "13px" }}>Loading…</div>
          ) : leaderboard.length === 0 ? (
            <div style={{ color: "rgba(255,200,100,0.5)", fontFamily: "monospace", fontSize: "13px" }}>No scores yet — be the first!</div>
          ) : (
            <div style={{ width: "100%", maxWidth: "320px" }}>
              {leaderboard.map((row: any, i: number) => (
                <div
                  key={i}
                  data-testid={`row-leaderboard-${i}`}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", marginBottom: "6px", background: i === 0 ? "rgba(255,215,0,0.12)" : i === 1 ? "rgba(192,192,192,0.1)" : i === 2 ? "rgba(205,127,50,0.1)" : "rgba(255,255,255,0.04)" }}
                >
                  <span style={{ fontSize: "18px", width: "28px", textAlign: "center" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                  </span>
                  <span style={{ flex: 1, color: "#ffd080", fontFamily: "monospace", fontSize: "13px" }}>{row.username}</span>
                  <span style={{ color: "#ff8800", fontFamily: "monospace", fontSize: "13px", fontWeight: "bold" }}>{row.best_score}</span>
                  <span style={{ color: "#ffd700", fontFamily: "monospace", fontSize: "12px" }}>🪙{row.best_coins}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "16px" }}>
            <button data-testid="button-lava-play-lb" style={btnStyle("#ff8800")} onClick={startGame}>▶  Play</button>
            <button data-testid="button-lava-back-lb" style={btnStyle("rgba(255,200,100,0.5)")} onClick={() => showScreen("start")}>← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
