import { useRef, useEffect, useState, useCallback } from "react";
import { useLocation as useWouter } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import WorldLoadingScreen from "@/components/WorldLoadingScreen";
import lavaCrawlTitleImg from "@assets/lava_crawl_title.webp";
import btnPlayImg from "@assets/lava_crawl_btn_play.webp";
import btnLeaderboardImg from "@assets/lava_crawl_btn_leaderboard.webp";
import btnBackToWorldImg from "@assets/lava_crawl_btn_back.webp";
import btnLeftImg from "@assets/Photoroom_20260707_92022_PM_1783477769862.png";
import btnRightImg from "@assets/Photoroom_20260707_92153_PM_1783477769862.png";
import btnPauseImg from "@assets/Photoroom_20260707_92309_PM_1783477809830.png";
import btnJumpImg from "@assets/Photoroom_20260707_95354_PM_1783479266963.png";
import hudBarImg from "@assets/Photoroom_20260707_94710_PM_1783478966948.png";
import heartImg from "@assets/Photoroom_20260707_94648_PM_1783478966948.png";
import skullImg from "@assets/Photoroom_20260705_103527_PM_1783426783499.png";
import coinIconImg from "@assets/icon_coin.webp";
import lavaCaveBg from "@assets/bg_lava_crawl.webp";
import slabImg1 from "@assets/lava_slab_1.webp";
import slabImg2 from "@assets/lava_slab_2.webp";
import slabImg3 from "@assets/lava_slab_3.webp";
import lavaTexImg from "@assets/lava_texture.webp";
import lavaGroundTileImg from "@assets/lava_ground_tile.webp";
import lavaGroundCapImg from "@assets/lava_ground_cap.webp";
import lavaPillarImg from "@assets/lava_pillar.webp";
const LAVA_CAVE_BG = lavaCaveBg;

// Pre-load canvas images at module level
const _coinImg = new Image(); _coinImg.src = coinIconImg;
const _slabImgs = [new Image(), new Image(), new Image()];
_slabImgs[0].src = slabImg1; _slabImgs[1].src = slabImg2; _slabImgs[2].src = slabImg3;
const _lavaTexImg = new Image(); _lavaTexImg.src = lavaTexImg;
const _lavaGroundTileImg = new Image(); _lavaGroundTileImg.src = lavaGroundTileImg;
const _lavaGroundCapImg = new Image(); _lavaGroundCapImg.src = lavaGroundCapImg;
const _lavaPillarImg = new Image(); _lavaPillarImg.src = lavaPillarImg;
const _hudBarImg = new Image(); _hudBarImg.src = hudBarImg;
const _heartImg = new Image(); _heartImg.src = heartImg;
const _skullImg = new Image(); _skullImg.src = skullImg;

// ─── Game constants ─────────────────────────────────────────────────────────
const LEVEL_W = 8000;
const GRAVITY = 0.52;
const JUMP_VEL = -13.5;
const P_SPEED = 4.2;
const PW = 28, PH = 36;
const EW = 32, EH = 28;
const CR = 10;
const COIN_SCORE = 10;
const ORB_SCORE = 5;
const ENEMY_SCORE = 25;
const FINISH_BONUS = 200;
const MAX_LIVES = 3;

// Ground is always at (canvasH * GR) from the top — 0.76 keeps lava fully under ground tile
const GR = 0.76;

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
  type: "coin" | "orb";
}

interface FloatParticle {
  x: number; y: number;
  text: string; color: string;
  life: number; maxLife: number;
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
  floats: FloatParticle[];
  cameraX: number;
  score: number;
  coinsCollected: number;
  lives: number;
  finishReached: boolean;
  lavaY: number;
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
    [5440,  460],
    [6020,  390],
    [6510,  330],
    [6940,  420],
    [7460,  540],
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
    // New section 6400-8000
    { x: 5920, y: fy(0),  w: 85, h: 14 },  // bridge gap 5900-6020
    { x: 5980, y: fy(-28), w: 75, h: 14 },
    { x: 6415, y: fy(5),  w: 80, h: 14 },  // bridge gap 6300-6510 (narrower)
    { x: 6490, y: fy(-22), w: 60, h: 14 },
    { x: 6845, y: fy(0),  w: 85, h: 14 },  // bridge gap 6840-6940
    { x: 7235, y: fy(0),  w: 90, h: 14 },  // bridge gap 7360-7460
    { x: 7310, y: fy(-30), w: 70, h: 14 },
    // High bonus platforms
    { x: 6280, y: gY - 100, w: 70, h: 14 },
    { x: 6700, y: gY - 95,  w: 65, h: 14 },
    { x: 7150, y: gY - 100, w: 70, h: 14 },
    { x: 7650, y: gY - 90,  w: 65, h: 14 },
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
    // Extended section 6400-7800
    [6100, gY - 30], [6200, gY - 30], [6500, gY - 30], [6600, gY - 30],
    [6700, gY - 30], [6950, gY - 30], [7050, gY - 30],
    [7150, gY - 30], [7300, gY - 30], [7500, gY - 30], [7700, gY - 30],
    // High platform coins
    [255,  gY - 120], [600,  gY - 108], [955,  gY - 118],
    [1755, gY - 118], [2355, gY - 112], [2825, gY - 118],
    [3605, gY - 112], [4155, gY - 118], [4705, gY - 112],
    [5105, gY - 118], [5805, gY - 108], [6055, gY - 118],
    [6285, gY - 118], [6705, gY - 112], [7155, gY - 118], [7655, gY - 108],
    // Bridge coins
    [715,  gY - 72], [1235, gY - 68], [1568, gY - 72],
    [2155, gY - 68], [2580, gY - 72], [3055, gY - 68],
    [3388, gY - 72], [3902, gY - 68], [4348, gY - 72],
    [4832, gY - 68], [5283, gY - 72],
    [5920, gY - 70], [6420, gY - 68], [6850, gY - 70], [7240, gY - 68],
  ];
  // Randomise each collectible: ~20% chance of real coin, rest are orbs.
  // Using Math.random() so the mix varies every run (not a fixed pattern).
  return pts.map(([x, y]) => ({
    x, y, collected: false,
    type: (Math.random() < 0.20) ? "coin" as const : "orb" as const,
  }));
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
    e(6350, 6020, 6510),
    e(6720, 6510, 6940),
    e(7100, 6940, 7360),
    e(7600, 7460, 7900),
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
  const petImgRef = useRef<HTMLImageElement | null>(null);
  const screenRef = useRef<Screen>("start");

  const [screen, setScreen] = useState<Screen>("start");
  const [endScore, setEndScore] = useState(0);
  const [endCoins, setEndCoins] = useState(0);
  const [endLives, setEndLives] = useState(MAX_LIVES);
  const [newBest, setNewBest] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  // Get active pet's hatched image for the player sprite
  const { data: authMe } = useQuery<{ activePetId: string | null }>({ queryKey: ["/api/auth/me"] });
  const { data: inventoryItems } = useQuery<Array<{ inventoryId: string; type: string; hatchedImageUrl: string | null; imageUrl: string | null }>>({
    queryKey: ["/api/inventory"],
    enabled: !!authMe?.activePetId,
  });

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

  const gainExpMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/lava-crawl/gain-exp", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.petResult?.leveledUp) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      }
    },
  });

  // Load active pet image for player sprite
  useEffect(() => {
    if (!authMe?.activePetId || !inventoryItems) return;
    const pet = inventoryItems.find(i => i.inventoryId === authMe.activePetId && i.type === "pet");
    const url = pet?.hatchedImageUrl || pet?.imageUrl;
    if (!url) return;
    const img = new Image();
    img.onload = () => { petImgRef.current = img; };
    img.src = url;
  }, [authMe?.activePetId, inventoryItems]);

  // Preload background image; signal ready for the loading screen
  useEffect(() => {
    const img = new Image();
    img.src = LAVA_CAVE_BG;
    img.onload = () => { bgImgRef.current = img; setBgLoaded(true); };
    img.onerror = () => setBgLoaded(true); // don't hang forever
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
      floats: [],
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
      // Skip frames before the browser has laid out the canvas
      if (!cw || !ch) { rafRef.current = requestAnimationFrame(loop); return; }
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
            e.stompTimer = 30;
            s.pvy = JUMP_VEL * 0.55;
            s.score += ENEMY_SCORE;
            // Float particle: XP gain
            s.floats.push({ x: e.x + EW / 2 - s.cameraX, y: e.y - 10, text: "+8 XP", color: "#a0ff80", life: 55, maxLife: 55 });
            gainExpMutation.mutate();
          } else if (s.alive && overlaps(s.px, s.py, PW - 4, PH - 4, e.x + 2, e.y + 2, EW - 4, EH - 4)) {
            // Side/bottom collision → hurt
            s.alive = false;
            s.lives = Math.max(0, s.lives - 1);
            s.respawnTimer = 90;
          }
        }

        // Coin / orb collection
        for (const c of s.coins) {
          if (c.collected) continue;
          const dx = c.x - (s.px + PW / 2);
          const dy = c.y - (s.py + PH / 2);
          if (Math.sqrt(dx * dx + dy * dy) < CR + 14) {
            c.collected = true;
            if (c.type === "coin") {
              s.coinsCollected++;
              s.score += COIN_SCORE;
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: "+10", color: "#ffd700", life: 45, maxLife: 45 });
            } else {
              s.score += ORB_SCORE;
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: "+5", color: "#ff9933", life: 45, maxLife: 45 });
            }
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
        const tile0X = bgOffset % scaledW;
        ctx.drawImage(bgImgRef.current, tile0X, 0, scaledW, VH);
        const tile1X = tile0X + scaledW;
        if (tile1X < VW) {
          ctx.drawImage(bgImgRef.current, tile1X, 0, scaledW, VH);
        }
        // Pillar at every bg seam to hide the tile join
        if (_lavaPillarImg.complete && _lavaPillarImg.naturalWidth > 0) {
          const pAspect = _lavaPillarImg.naturalWidth / _lavaPillarImg.naturalHeight;
          const pDrawH = VH;
          const pDrawW = pDrawH * pAspect;
          // Draw pillar centered on the seam between tile0 and tile1
          if (tile1X > -pDrawW / 2 && tile1X < VW + pDrawW / 2) {
            ctx.drawImage(_lavaPillarImg, tile1X - pDrawW / 2, 0, pDrawW, pDrawH);
          }
        }
      } else {
        ctx.fillStyle = "#1a0a05";
        ctx.fillRect(0, 0, VW, VH);
      }

      // Lava (tiled texture, scrolls slowly)
      const lavaT = ts * 0.001;
      if (_lavaTexImg.complete && _lavaTexImg.naturalWidth > 0) {
        const lavaH = VH - gY;
        const tileAspect = _lavaTexImg.width / _lavaTexImg.height;
        const tileH = lavaH;
        const tileW = tileH * tileAspect;
        const scrollX = (lavaT * 25) % tileW;
        let drawX = -scrollX;
        while (drawX < VW) {
          ctx.drawImage(_lavaTexImg, drawX, gY, tileW, tileH);
          drawX += tileW;
        }
        // Darken bottom slightly for depth
        const depthGrad = ctx.createLinearGradient(0, gY, 0, VH);
        depthGrad.addColorStop(0, "rgba(0,0,0,0)");
        depthGrad.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = depthGrad;
        ctx.fillRect(0, gY, VW, lavaH);
      } else {
        // Fallback gradient
        const lavaGrad = ctx.createLinearGradient(0, gY, 0, VH);
        lavaGrad.addColorStop(0, "#ff5000");
        lavaGrad.addColorStop(1, "#660800");
        ctx.fillStyle = lavaGrad;
        ctx.fillRect(0, gY, VW, VH - gY);
      }

      // Platforms
      for (const p of allPlats) {
        const px2 = p.x - cx, py2 = p.y;
        if (px2 + p.w < -10 || px2 > VW + 10) continue;

        const isGround = p.h > 20;
        if (isGround) {
          // Seamless ground tile — tile across the full ground area
          if (_lavaGroundTileImg.complete && _lavaGroundTileImg.naturalWidth > 0) {
            const tileAspect = _lavaGroundTileImg.naturalWidth / _lavaGroundTileImg.naturalHeight;
            const tileH = Math.min(p.h, 90);
            const tileW = tileH * tileAspect;
            ctx.save();
            ctx.beginPath();
            ctx.rect(px2, py2, p.w, tileH);
            ctx.clip();
            let dx = px2;
            while (dx < px2 + p.w) {
              ctx.drawImage(_lavaGroundTileImg, dx, py2, tileW, tileH);
              dx += tileW;
            }
            ctx.restore();
          }
          // Cap at each end of the ground segment (where ground breaks)
          if (_lavaGroundCapImg.complete && _lavaGroundCapImg.naturalWidth > 0) {
            const capAspect = _lavaGroundCapImg.naturalWidth / _lavaGroundCapImg.naturalHeight;
            const capH = Math.min(p.h + 40, VH - py2);
            const capW = capH * capAspect;
            // Left cap — center aligned with ground left edge
            ctx.drawImage(_lavaGroundCapImg, px2 - capW * 0.5, py2 - 20, capW, capH);
            // Right cap — mirror, center aligned with ground right edge
            ctx.save();
            ctx.translate(px2 + p.w, py2 - 20);
            ctx.scale(-1, 1);
            ctx.drawImage(_lavaGroundCapImg, -capW * 0.5, 0, capW, capH);
            ctx.restore();
          }
        } else {
          // Floating slab: pick one of 3 images, preserve natural aspect ratio
          const slabIdx = Math.abs(Math.floor(p.x / 120)) % 3;
          const slab = _slabImgs[slabIdx];
          if (slab.complete && slab.naturalWidth > 0) {
            const aspect = slab.naturalWidth / slab.naturalHeight;
            // Width = platform width, height scaled proportionally (extends below hit rect)
            const drawH = p.w / aspect;
            ctx.drawImage(slab, px2, py2, p.w, drawH);
          } else {
            ctx.fillStyle = "#6b4030";
            ctx.fillRect(px2, py2, p.w, p.h);
          }
        }
      }

      // Coins and Orbs
      for (const c of s.coins) {
        if (c.collected) continue;
        const cx2 = c.x - cx;
        if (cx2 < -20 || cx2 > VW + 20) continue;
        const bounce = Math.sin(lavaT * 4 + c.x * 0.01) * 3;
        ctx.save();
        if (c.type === "coin") {
          const coinSize = CR * 2.4;
          ctx.shadowColor = "gold";
          ctx.shadowBlur = 10;
          if (_coinImg.complete && _coinImg.naturalWidth > 0) {
            ctx.drawImage(_coinImg, cx2 - coinSize / 2, c.y - bounce - coinSize / 2, coinSize, coinSize);
          } else {
            ctx.fillStyle = "#ffd700";
            ctx.beginPath();
            ctx.arc(cx2, c.y - bounce, CR, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Orb — glowing fire orb (orange/yellow)
          const orbR = CR * 1.2;
          const orbY = c.y - bounce;
          const pulse = 0.6 + Math.sin(lavaT * 5 + c.x * 0.02) * 0.4;
          // Outer glow
          ctx.shadowColor = "#ff8800";
          ctx.shadowBlur = 20 * pulse;
          // Core radial gradient — white center → orange → deep amber
          const orbGrad = ctx.createRadialGradient(cx2, orbY, 0, cx2, orbY, orbR);
          orbGrad.addColorStop(0, `rgba(255,255,220,${0.98 * pulse})`);
          orbGrad.addColorStop(0.3, `rgba(255,200,60,${0.95 * pulse})`);
          orbGrad.addColorStop(0.65, `rgba(255,110,10,${0.85 * pulse})`);
          orbGrad.addColorStop(1, `rgba(180,40,0,0)`);
          ctx.fillStyle = orbGrad;
          ctx.beginPath();
          ctx.arc(cx2, orbY, orbR, 0, Math.PI * 2);
          ctx.fill();
          // Sparkle highlight at top-left
          ctx.fillStyle = `rgba(255,255,200,${0.8 * pulse})`;
          ctx.beginPath();
          ctx.arc(cx2 - orbR * 0.3, orbY - orbR * 0.35, orbR * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
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
        ctx.save();
        if (!e.alive) {
          // Dead: show skull image rising + fading out
          const t = e.stompTimer / 30;
          ctx.globalAlpha = t;
          const rise = (1 - t) * 22;
          const skullSize = 44;
          if (_skullImg.complete && _skullImg.naturalWidth > 0) {
            ctx.drawImage(_skullImg, ex + EW / 2 - skullSize / 2, e.stompY - rise - skullSize * 0.3, skullSize, skullSize);
          }
          ctx.restore();
          continue;
        }
        // Body
        const ey2 = e.y;
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

      // Float particles (XP gains, coin pops)
      ctx.save();
      for (let i = s.floats.length - 1; i >= 0; i--) {
        const fp = s.floats[i];
        const t = fp.life / fp.maxLife;
        fp.life -= dt;
        if (fp.life <= 0) { s.floats.splice(i, 1); continue; }
        const rise = (1 - t) * 34;
        ctx.globalAlpha = t * (t < 0.25 ? t / 0.25 : 1); // fade in then out
        ctx.font = `bold ${13 + (1 - t) * 4}px monospace`;
        ctx.textAlign = "center";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillStyle = fp.color;
        ctx.fillText(fp.text, fp.x, fp.y - rise);
      }
      ctx.restore();

      // Player
      if (s.alive) {
        const ppx = s.px - cx;
        const PET_SIZE = 64;
        // Bottom of pet image aligned with bottom of collision box
        const petDrawY = s.py + PH - PET_SIZE;
        ctx.save();
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 14;
        if (petImgRef.current) {
          // Pet images face LEFT by default — flip when moving right
          const centerX = ppx + PW / 2;
          const centerY = petDrawY + PET_SIZE / 2;
          ctx.translate(centerX, centerY);
          if (s.facingR) ctx.scale(-1, 1);
          ctx.drawImage(petImgRef.current, -PET_SIZE / 2, -PET_SIZE / 2, PET_SIZE, PET_SIZE);
        } else {
          // Fallback pixel adventurer
          if (!s.facingR) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-ppx * 2 - PW, 0);
          }
          ctx.fillStyle = "#6a3010";
          ctx.fillRect(ppx + 4, s.py + PH - 12, 8, 12);
          ctx.fillRect(ppx + PW - 12, s.py + PH - 12, 8, 12);
          ctx.fillStyle = "#e06820";
          ctx.fillRect(ppx, s.py + 10, PW, PH - 22);
          ctx.fillStyle = "#f0a060";
          ctx.fillRect(ppx + 4, s.py, PW - 8, 14);
          ctx.fillStyle = "#fff";
          ctx.fillRect(ppx + 7, s.py + 3, 6, 5);
          ctx.fillStyle = "#000";
          ctx.fillRect(ppx + 9, s.py + 4, 3, 3);
          ctx.fillStyle = "#e06820";
          ctx.fillRect(ppx - 4, s.py + 10, 6, 10);
          ctx.fillRect(ppx + PW - 2, s.py + 10, 6, 10);
          if (!s.facingR) ctx.restore();
        }
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
      const HUD_TOP = Math.round(VH * 0.025);
      const HUD_H = 58;

      // Toolbar image background (lava-stone bar)
      if (_hudBarImg.complete && _hudBarImg.naturalWidth > 0) {
        ctx.drawImage(_hudBarImg, 0, HUD_TOP - 4, VW, HUD_H + 8);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.70)";
        ctx.fillRect(0, HUD_TOP, VW, HUD_H);
      }

      const textY = HUD_TOP + 37;
      const HEART_SIZE = 28;
      const HEART_GAP = 32;

      // Lives (lava-stone heart images)
      for (let i = 0; i < MAX_LIVES; i++) {
        const hx = 8 + i * HEART_GAP;
        const hy = HUD_TOP + (HUD_H - HEART_SIZE) / 2;
        if (_heartImg.complete && _heartImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = i < s.lives ? 1.0 : 0.25;
          ctx.drawImage(_heartImg, hx, hy, HEART_SIZE, HEART_SIZE);
          ctx.restore();
        } else {
          ctx.fillStyle = i < s.lives ? "#ff4444" : "rgba(255,100,100,0.25)";
          ctx.font = "22px serif";
          ctx.textAlign = "left";
          ctx.fillText("♥", hx, textY);
        }
      }

      // Score
      ctx.fillStyle = "#fff8e0";
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 6;
      ctx.fillText(`${s.score}`, VW / 2, textY);
      ctx.shadowBlur = 0;

      // Coins
      ctx.fillStyle = "#fff8e0";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "right";
      const coinCountStr = ` ${s.coinsCollected}`;
      ctx.fillText(coinCountStr, VW - 12, textY);
      if (_coinImg.complete && _coinImg.naturalWidth > 0) {
        const textW = ctx.measureText(coinCountStr).width;
        ctx.drawImage(_coinImg, VW - 12 - textW - 24, HUD_TOP + 16, 24, 24);
      }

      // Progress bar below the text
      const prog = Math.min(s.px / (LEVEL_W - 100), 1);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(VW * 0.22, HUD_TOP + HUD_H - 7, VW * 0.56, 5);
      ctx.fillStyle = "#ff8800";
      ctx.fillRect(VW * 0.22, HUD_TOP + HUD_H - 7, VW * 0.56 * prog, 5);

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [buildState, showScreen, completeMutation, gainExpMutation]);

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

      {/* ── Volcanic loading screen — covers initial flash while assets load ── */}
      {showLoadingScreen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50 }}>
          <WorldLoadingScreen
            worldId="volcanic"
            pageReady={bgLoaded}
            onReady={() => setShowLoadingScreen(false)}
          />
        </div>
      )}

      {/* ── Game Canvas ─────────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", width: "100%", touchAction: "none" }}
      />

      {/* ── Touch controls (shown only when playing or paused) ──────────────── */}
      {(screen === "playing" || screen === "paused") && (
        <div style={{ height: "108px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "rgba(10,3,0,0.85)", borderTop: "1px solid rgba(255,100,0,0.25)", userSelect: "none", flexShrink: 0 }}>
          {/* Left / Right arrows */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              data-testid="button-lava-left"
              {...makeTouch("left")}
              style={{ width: 76, height: 56, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><img src={btnLeftImg} alt="Left" draggable={false} style={{ width: 76, height: "auto", objectFit: "contain" }} /></button>
            <button
              data-testid="button-lava-right"
              {...makeTouch("right")}
              style={{ width: 76, height: 56, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><img src={btnRightImg} alt="Right" draggable={false} style={{ width: 76, height: "auto", objectFit: "contain" }} /></button>
          </div>
          {/* Pause */}
          <button
            data-testid="button-lava-pause"
            onMouseDown={() => screen === "playing" ? showScreen("paused") : showScreen("playing")}
            onTouchStart={(e) => { e.preventDefault(); screen === "playing" ? showScreen("paused") : showScreen("playing"); }}
            style={{ width: 64, height: 64, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><img src={btnPauseImg} alt="Pause" draggable={false} style={{ width: 64, height: 64, objectFit: "contain" }} /></button>
          {/* Jump */}
          <button
            data-testid="button-lava-jump"
            {...makeTouch("jump")}
            style={{ width: 82, height: 82, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          ><img src={btnJumpImg} alt="Jump" draggable={false} style={{ width: 82, height: 82, objectFit: "contain" }} /></button>
        </div>
      )}

      {/* ── START screen ────────────────────────────────────────────────────── */}
      {screen === "start" && (
        <div style={panelStyle}>
          <img src={lavaCrawlTitleImg} alt="Lava Crawl" draggable={false} style={{ width: "min(300px, 85vw)", height: "auto", marginBottom: "4px" }} />
          <div style={subStyle}>
            Run & jump through the volcanic cavern.<br />
            Collect coins, stomp enemies, reach the exit!
          </div>
          {myBest && myBest.best > 0 && (
            <div style={{ color: "#ffd080", fontSize: "13px", marginBottom: "16px", fontFamily: "monospace" }}>
              Your best: <strong>{myBest.best}</strong> pts
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button data-testid="button-lava-start" onClick={startGame} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnPlayImg} alt="Play" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
            <button data-testid="button-lava-leaderboard-start" onClick={goLeaderboard} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnLeaderboardImg} alt="Leaderboard" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
            <button data-testid="button-lava-back-start" onClick={() => navigate("/world/volcanic")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnBackToWorldImg} alt="Back to World" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
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
          <button data-testid="button-lava-quit-pause" style={btnStyle("rgba(255,200,100,0.45)")} onClick={() => navigate("/world/volcanic")}>← Quit to World</button>
        </div>
      )}

      {/* ── GAME OVER screen ─────────────────────────────────────────────────── */}
      {screen === "gameover" && (
        <div style={panelStyle}>
          <div style={{ ...titleStyle, color: "#ff3030", fontSize: "30px" }}>💀 GAME OVER</div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "15px", marginBottom: "8px" }}>Score: <strong>{endScore}</strong></div>
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "14px", marginBottom: "20px" }}>Coins earned: <strong>{endCoins}</strong> <img src={coinIconImg} alt="coins" style={{ width: 14, height: 14, objectFit: "contain", verticalAlign: "middle" }} /></div>
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
          <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "14px", marginBottom: "4px" }}>Coins earned: <strong>{endCoins}</strong> <img src={coinIconImg} alt="coins" style={{ width: 14, height: 14, objectFit: "contain", verticalAlign: "middle" }} /> added to balance</div>
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
                  <span style={{ color: "#ffd700", fontFamily: "monospace", fontSize: "12px", display: "flex", alignItems: "center", gap: "2px" }}><img src={coinIconImg} alt="coins" style={{ width: 12, height: 12, objectFit: "contain" }} />{row.best_coins}</span>
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
