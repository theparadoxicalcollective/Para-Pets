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
import enemy1Img from "@assets/Photoroom_20260707_102745_PM_1783481611016.png";
import enemy2Img from "@assets/Photoroom_20260707_102936_PM_1783481611016.png";
import enemy3Img from "@assets/Photoroom_20260708_34527_PM_1783543636588.png";
import enemy4Img from "@assets/Photoroom_20260708_34404_PM_1783543636588.png";
import doubleOrbImg from "@assets/Photoroom_20260708_40336_PM_1783544889601.png";
import coinOrbImg from "@assets/Photoroom_20260708_40401_PM_1783544889601.png";
import coinIconImg from "@assets/icon_coin.webp";
import lavaCaveBg from "@assets/bg_lava_crawl.webp";
import slabImg1 from "@assets/lava_slab_1.webp";
import slabImg2 from "@assets/lava_slab_2.webp";
import slabImg3 from "@assets/lava_slab_3.webp";
import lavaTexImg from "@assets/lava_texture.webp";
import lavaGroundTileImg from "@assets/lava_ground_tile.webp";
import lavaGroundCapImg from "@assets/lava_ground_cap.webp";
import lavaPillarImg from "@assets/lava_pillar.webp";
import lavaCrawlGemImg from "@assets/lava_crawl_gem.webp";
import lavaCrawlLbFrameImg from "@assets/lava_crawl_lb_frame.webp";
import lavaCrawlLbBtnPlayImg from "@assets/lava_crawl_lb_btn_play.webp";
import lavaCrawlLbBtnBackImg from "@assets/lava_crawl_lb_btn_back.webp";
import gameOverTitleImg from "@assets/Photoroom_20260708_113712_AM_1783534774669.png";
import trophy1st from "@assets/Photoroom_20260616_71127_PM_1781655109379.png";
import trophy2nd from "@assets/Photoroom_20260616_71053_PM_1781655109379.png";
import trophy3rd from "@assets/Photoroom_20260616_70844_PM_1781655109379.png";
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
const _enemy1Img = new Image(); _enemy1Img.src = enemy1Img;
const _enemy2Img = new Image(); _enemy2Img.src = enemy2Img;
const _enemy3Img = new Image(); _enemy3Img.src = enemy3Img; // bat-dragon (float)
const _enemy4Img = new Image(); _enemy4Img.src = enemy4Img; // lizard (ground)
const _doubleOrbImg = new Image(); _doubleOrbImg.src = doubleOrbImg;
const _coinOrbImg = new Image(); _coinOrbImg.src = coinOrbImg;
const _gemImg = new Image(); _gemImg.src = lavaCrawlGemImg;

// ─── Game constants ─────────────────────────────────────────────────────────
const LEVEL_W = 80_000;          // very long; game ends by lives, not a finish line
const GRAVITY = 0.52;
const JUMP_VEL = -13.5;
const P_SPEED = 4.2;
const PW = 28, PH = 36;
const EW = 32, EH = 28;
const CR = 10;
const COIN_SCORE = 10;
const ORB_SCORE = 5;
const ENEMY_SCORE = 25;
const MAX_LIVES = 3;
const MAX_HEART_SLOTS = 5;
const RESPAWN_BACK_OFFSET = 170;
const BACKTRACK_LIMIT = 320;
const LIFE_DROP_CHANCE = 0.07;
const SHIELD_FRAMES = 90;        // ~1.5s invincibility after first hit
const DOUBLE_DURATION = 600;     // x2 orb lasts ~10s at 60fps
const COIN_ORB_AMOUNT = 10;      // coins granted by coin-orb pickup

// Ground is always at (canvasH * GR) from the top — 0.76 keeps lava fully under ground tile
const GR = 0.76;
// Visual lift: draw ground tiles this many px above gY so they sit on top of lava, not flush with it
const GROUND_LIFT = 12;

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = "start" | "playing" | "paused" | "gameover" | "victory" | "leaderboard";

interface Plat { x: number; y: number; w: number; h: number; }

interface Enemy {
  x: number; y: number;
  vx: number; lx: number; rx: number;
  alive: boolean;
  stompY: number; stompTimer: number;
  type: "ground" | "float";
  variant: 1 | 2;  // 1=original sprites, 2=new sprites
}

interface Coin {
  x: number; y: number;
  collected: boolean;
  type: "coin" | "orb" | "double" | "coinBonus";
}

interface FloatParticle {
  x: number; y: number;
  text: string; color: string;
  life: number; maxLife: number;
}

interface LifeHeart {
  x: number; y: number;
  collected: boolean;
}

interface GState {
  px: number; py: number;
  pvx: number; pvy: number;
  onGround: boolean;
  jumpCount: number;
  facingR: boolean;
  alive: boolean;
  respawnTimer: number;
  squishX: number; squishY: number; squishTimer: number; squishDuration: number;
  enemies: Enemy[];
  coins: Coin[];
  lifeHearts: LifeHeart[];
  floats: FloatParticle[];
  cameraX: number;
  score: number;
  coinsCollected: number;
  lives: number;
  finishReached: boolean;
  lavaY: number;
  plats: Plat[];
  checkpointX: number;
  groundSegs: Plat[];      // ground platforms only, for respawn logic
  hitShield: boolean;      // true = first hit taken, invincible until timer expires
  hitShieldTimer: number;  // frames left of shield (flash red)
  doubleActive: boolean;   // x2 score/XP multiplier active
  doubleTimer: number;     // frames remaining on the x2 effect
}

// ─── Level data builders (procedural — called fresh each new game) ───────────

// Pick a random coin type: 73% orb, 16% coin, 3% coinBonus, 6% double (coinBonus rare)
function pickCoinType(): Coin["type"] {
  const r = Math.random();
  if (r < 0.06) return "double";
  if (r < 0.09) return "coinBonus";
  if (r < 0.25) return "coin";
  return "orb";
}

// Procedurally generate ground segments for the whole LEVEL_W.
// Returns an array of ground Plats (h >> 20 so the draw code recognises them as ground).
function buildGrounds(gY: number, ch: number): Plat[] {
  const h = ch - gY + 2;
  const segs: Plat[] = [{ x: 0, y: gY, w: 800, h }]; // safe starting platform
  let x = 800;
  while (x < LEVEL_W - 900) {
    const gap = 160 + Math.floor(Math.random() * 160);  // 160–320px gap (wider minimum)
    x += gap;
    if (x + 300 >= LEVEL_W - 200) break;
    const w = 280 + Math.floor(Math.random() * 500);   // 280–780px wide
    segs.push({ x, y: gY, w, h });
    x += w;
  }
  segs.push({ x: LEVEL_W - 800, y: gY, w: 800, h });  // far-end safe pad
  return segs;
}

// Build floating bridge/bonus platforms above the gaps between ground segments.
function buildFloats(gY: number, groundSegs: Plat[]): Plat[] {
  const fy = (off: number) => gY - 55 + off;
  const floats: Plat[] = [];
  for (let i = 0; i < groundSegs.length - 1; i++) {
    const curr = groundSegs[i];
    const next = groundSegs[i + 1];
    const gapX = curr.x + curr.w;
    const gapW = next.x - gapX;
    const center = gapX + gapW / 2;
    const bridgeW = 90;
    if (gapW >= 180 || Math.random() < 0.62) {
      floats.push({ x: center - bridgeW / 2, y: fy(0), w: bridgeW, h: 14 });
    }
    if (Math.random() < 0.4) {
      const xOff = Math.random() < 0.5 ? -48 : 48;
      floats.push({ x: center - 32 + xOff, y: fy(-30), w: 65, h: 14 });
    }
    // Mid-segment bonus platform every other seg
    if (i % 2 === 1 && curr.w > 320) {
      floats.push({ x: curr.x + curr.w * 0.5 - 32, y: gY - 100, w: 65, h: 14 });
    }
  }
  return floats;
}

// Build coins / orbs / special pickups spread across the level.
function buildCoins(gY: number, groundSegs: Plat[]): Coin[] {
  const coins: Coin[] = [];
  for (let i = 0; i < groundSegs.length; i++) {
    const seg = groundSegs[i];
    if (i === 0) continue; // no coins on starting platform
    const count = Math.max(2, Math.round(seg.w / 200));
    for (let j = 0; j < count; j++) {
      const frac = (j + 1) / (count + 1);
      coins.push({ x: seg.x + seg.w * frac, y: gY - 30, collected: false, type: pickCoinType() });
    }
    // Coin arcing over gap into next segment
    if (i < groundSegs.length - 1) {
      const next = groundSegs[i + 1];
      const gapCenter = seg.x + seg.w + (next.x - (seg.x + seg.w)) / 2;
      coins.push({ x: gapCenter, y: gY - 68, collected: false, type: pickCoinType() });
    }
    // High bonus coin above bonus platform on every other seg
    if (i % 2 === 1 && seg.w > 320) {
      coins.push({ x: seg.x + seg.w * 0.5, y: gY - 118, collected: false, type: pickCoinType() });
    }
  }
  return coins;
}

// Build enemies across all ground segments (skipping the starting one).
function buildEnemies(gY: number, groundSegs: Plat[]): Enemy[] {
  const ENEMY_POOL: Array<{ type: "ground" | "float"; variant: 1 | 2 }> = [
    { type: "ground", variant: 1 },
    { type: "ground", variant: 2 },
    { type: "float",  variant: 1 },
    { type: "float",  variant: 2 },
  ];
  const enemies: Enemy[] = [];
  for (let i = 0; i < groundSegs.length; i++) {
    if (i === 0) continue;
    const seg = groundSegs[i];
    const inset = 40;
    const lx = seg.x + inset;
    const rx = seg.x + seg.w - inset;
    if (rx - lx < 60) continue;
    const pick = () => ENEMY_POOL[Math.floor(Math.random() * ENEMY_POOL.length)];
    const makeEnemy = (xPos: number, et: { type: "ground" | "float"; variant: 1 | 2 }): Enemy => {
      const yOff = et.type === "float" ? -50 : 0;
      return {
        x: xPos, y: gY - EH + yOff,
        vx: (1.3 + Math.random() * 0.9) * (Math.random() < 0.5 ? 1 : -1),
        lx, rx, alive: true,
        stompY: gY - EH + yOff, stompTimer: 0,
        type: et.type, variant: et.variant,
      };
    };
    enemies.push(makeEnemy(seg.x + seg.w * 0.42, pick()));
    if (seg.w > 500) enemies.push(makeEnemy(seg.x + seg.w * 0.72, pick()));
  }
  return enemies;
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
  // Stable refs so mutations can be called from the game loop without being in startLoop's deps.
  // Every mutation state change (idle→pending→success) creates a new completeMutation/gainExpMutation
  // object, which would give startLoop a new reference → useEffect re-runs → fresh closure with
  // empty allPlats → ground disappears. Refs break that cycle entirely.
  const gainExpRef = useRef(gainExpMutation.mutate);
  useEffect(() => { gainExpRef.current = gainExpMutation.mutate; }, [gainExpMutation.mutate]);
  const completeMutateRef = useRef(completeMutation.mutate);
  useEffect(() => { completeMutateRef.current = completeMutation.mutate; }, [completeMutation.mutate]);

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
    const floats = buildFloats(gY, grounds);
    const allPlats = [...grounds, ...floats];
    const startX = 60, startY = gY - PH;
    return {
      px: startX, py: startY,
      pvx: 0, pvy: 0,
      onGround: false, jumpCount: 0, facingR: true,
      alive: true, respawnTimer: 0,
      squishX: 1, squishY: 1, squishTimer: 0, squishDuration: 1,
      enemies: buildEnemies(gY, grounds),
      coins: buildCoins(gY, grounds),
      lifeHearts: [],
      floats: [],
      cameraX: 0,
      score: 0, coinsCollected: 0,
      lives: MAX_LIVES,
      finishReached: false,
      lavaY: gY,
      plats: allPlats,
      checkpointX: startX,
      groundSegs: grounds,
      hitShield: false,
      hitShieldTimer: 0,
      doubleActive: false,
      doubleTimer: 0,
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

      // Init state if fresh. Also rebuild allPlats if empty (happens when startLoop re-runs
      // mid-game due to any re-render — new closure starts with allPlats=[] but stateRef still live).
      if (!stateRef.current) {
        stateRef.current = buildState(VH);
      }
      if (allPlats.length === 0) {
        // Reuse the platforms generated once at game start (buildFloats randomizes which
        // bridges appear) instead of recomputing — recomputing here would re-roll the
        // randomization mid-run and could remove a platform the player is standing on.
        allPlats = stateRef.current.plats;
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
            completeMutateRef.current({ score: s.score, coinsCollected: s.coinsCollected });
            return;
          }
          // Respawn near last safe checkpoint — land on a ground segment, never in a gap
          const respawnTargetX = Math.max(0, s.checkpointX - RESPAWN_BACK_OFFSET);
          const landSeg = s.groundSegs
            .filter(p => p.x <= respawnTargetX + PW)
            .sort((a, b) => b.x - a.x)[0];
          if (landSeg) {
            s.px = Math.min(Math.max(respawnTargetX, landSeg.x + 20), landSeg.x + landSeg.w - PW - 20);
            s.py = landSeg.y - PH;
          } else {
            s.px = respawnTargetX;
            s.py = gY - PH;
          }
          s.hitShield = false;
          s.hitShieldTimer = 0;
          s.pvx = 0; s.pvy = 0;
          s.alive = true;
          s.cameraX = Math.max(0, Math.min(LEVEL_W - VW, s.px - VW / 2 + PW / 2));
        }
      } else {
        // Input
        const moveX = (input.left ? -1 : 0) + (input.right ? 1 : 0);
        s.pvx = moveX * P_SPEED;
        if (moveX > 0) s.facingR = true;
        if (moveX < 0) s.facingR = false;

        // Ground jump: held button OR fresh tap. Double-jump: fresh tap ONLY.
        // Without this distinction the double-jump fires the frame after the first jump
        // while the button is still held — consuming itself before the player can react.
        const wantsJump = input.jumpQueued || (s.onGround && input.jump);
        if (wantsJump && (s.onGround || s.jumpCount < 2)) {
          s.pvy = s.onGround ? JUMP_VEL : JUMP_VEL * 0.82;
          if (s.onGround) {
            s.jumpCount = 1;
            s.squishX = 0.72; s.squishY = 1.38; s.squishTimer = 14; s.squishDuration = 14;
          } else {
            s.jumpCount = 2;
            s.squishX = 1.3; s.squishY = 0.72; s.squishTimer = 10; s.squishDuration = 10;
          }
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
          if (r.onGround) { s.onGround = true; s.jumpCount = 0; } // landing resets double-jump
        }

        // Checkpoint tracking — only advances while standing on solid main ground (not a
        // floating bridge), so respawns and the backtrack limit always land somewhere safe.
        if (s.onGround && Math.abs((s.py + PH) - gY) < 4) {
          s.checkpointX = Math.max(s.checkpointX, s.px);
        }

        // Clamp to level bounds
        if (s.px < 0) { s.px = 0; s.pvx = 0; }
        if (s.px + PW > LEVEL_W) { s.px = LEVEL_W - PW; s.pvx = 0; }

        // Prevent backtracking/scrolling too far behind the checkpoint once you've moved forward.
        const minX = Math.max(0, s.checkpointX - BACKTRACK_LIMIT);
        if (s.px < minX) { s.px = minX; if (s.pvx < 0) s.pvx = 0; }

        // Lava death (fall off screen bottom or into gap below ground)
        if (s.py > VH + 40) {
          s.alive = false;
          s.hitShield = false;
          s.hitShieldTimer = 0;
          s.lives = Math.max(0, s.lives - 1);
          s.respawnTimer = 90;
        }

        // Hit-shield timer (flash red after first hit)
        if (s.hitShieldTimer > 0) {
          s.hitShieldTimer -= dt;
          if (s.hitShieldTimer <= 0) {
            s.hitShield = false;
            s.hitShieldTimer = 0;
          }
        }

        // x2 orb timer
        if (s.doubleActive) {
          s.doubleTimer -= dt;
          if (s.doubleTimer <= 0) {
            s.doubleActive = false;
            s.doubleTimer = 0;
          }
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

          // Collision hitbox is a bit larger than the raw EW/EH box and centered on the
          // enemy sprite's visual center — the drawn image (52-60px) is noticeably bigger
          // than the old 32x28 hit box, so hits near the edges of the sprite were silently
          // missed. Widening the hitbox to better match what the player actually sees fixes
          // the "collision doesn't register" complaint without changing movement/AI logic.
          const hitScale = e.type === "float" ? 1.25 : 1.35;
          const hw = EW * hitScale, hh = EH * hitScale;
          const ecx = e.x + EW / 2, ecy = e.y + EH / 2;
          const hx = ecx - hw / 2, hy = ecy - hh / 2;

          // Stomp check — player falls on top of enemy
          const stomped =
            s.pvy > 0 &&
            s.py + PH <= ecy + hh * 0.2 &&
            overlaps(s.px, s.py, PW, PH, hx, hy, hw, hh);

          if (stomped) {
            e.alive = false;
            e.stompTimer = 30;
            s.pvy = JUMP_VEL * 0.55;
            const mult = s.doubleActive ? 2 : 1;
            s.score += ENEMY_SCORE * mult;
            s.squishX = 1.45; s.squishY = 0.58; s.squishTimer = 16; s.squishDuration = 16;
            const xpText = s.doubleActive ? "+16 XP ×2" : "+8 XP";
            s.floats.push({ x: e.x + EW / 2 - s.cameraX, y: e.y - 10, text: xpText, color: "#a0ff80", life: 55, maxLife: 55 });
            gainExpRef.current();
            if (s.doubleActive) gainExpRef.current(); // double XP
            if (s.lives < MAX_HEART_SLOTS && Math.random() < LIFE_DROP_CHANCE) {
              s.lifeHearts.push({ x: e.x + EW / 2, y: gY - 38, collected: false });
            }
          } else if (s.alive && !s.hitShield && overlaps(s.px, s.py, PW - 2, PH - 2, hx, hy, hw, hh)) {
            // First hit — activate invincibility shield and flash red
            s.hitShield = true;
            s.hitShieldTimer = SHIELD_FRAMES;
            s.squishX = 1.15; s.squishY = 0.85; s.squishTimer = 12; s.squishDuration = 12;
            s.floats.push({ x: s.px + PW / 2 - s.cameraX, y: s.py - 6, text: "!", color: "#ff4444", life: 30, maxLife: 30 });
          } else if (s.alive && s.hitShield && overlaps(s.px, s.py, PW - 2, PH - 2, hx, hy, hw, hh)) {
            // Second hit while shield is up — lose a life
            s.hitShield = false;
            s.hitShieldTimer = 0;
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
            const mult = s.doubleActive ? 2 : 1;
            if (c.type === "coin") {
              s.coinsCollected++;
              s.score += COIN_SCORE * mult;
              const txt = s.doubleActive ? "+1 ×2" : "+1";
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: txt, color: "#ffd700", life: 45, maxLife: 45 });
            } else if (c.type === "orb") {
              s.score += ORB_SCORE * mult;
              const txt = s.doubleActive ? `+${ORB_SCORE * 2} ×2` : "+5";
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: txt, color: "#ff9933", life: 45, maxLife: 45 });
            } else if (c.type === "double") {
              s.doubleActive = true;
              s.doubleTimer = DOUBLE_DURATION;
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: "×2 ACTIVE!", color: "#ff6600", life: 70, maxLife: 70 });
            } else if (c.type === "coinBonus") {
              s.coinsCollected += COIN_ORB_AMOUNT;
              s.floats.push({ x: c.x - s.cameraX, y: c.y - 8, text: `+${COIN_ORB_AMOUNT} coins`, color: "#ffe066", life: 55, maxLife: 55 });
            }
          }
        }

        // Life heart pickups
        for (const lh of s.lifeHearts) {
          if (lh.collected) continue;
          const dx = lh.x - (s.px + PW / 2);
          const dy = lh.y - (s.py + PH / 2);
          if (Math.sqrt(dx * dx + dy * dy) < CR + 18) {
            if (s.lives < MAX_HEART_SLOTS) {
              lh.collected = true;
              s.lives = Math.min(MAX_HEART_SLOTS, s.lives + 1);
              s.floats.push({ x: lh.x - s.cameraX, y: lh.y - 12, text: "+1 ♥", color: "#ff6699", life: 60, maxLife: 60 });
            }
          }
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

      // Slight overall darkening so gems/coins pop more against the background
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, VW, VH);

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
          // Seamless ground tile — drawn GROUND_LIFT px above the physics y so it sits visually on lava
          const visualY = py2 - GROUND_LIFT;
          if (_lavaGroundTileImg.complete && _lavaGroundTileImg.naturalWidth > 0) {
            const tileAspect = _lavaGroundTileImg.naturalWidth / _lavaGroundTileImg.naturalHeight;
            const tileH = Math.min(p.h + GROUND_LIFT, 90);
            const tileW = tileH * tileAspect;
            ctx.save();
            ctx.beginPath();
            ctx.rect(px2, visualY, p.w, tileH);
            ctx.clip();
            let dx = px2;
            while (dx < px2 + p.w) {
              ctx.drawImage(_lavaGroundTileImg, dx, visualY, tileW, tileH);
              dx += tileW;
            }
            ctx.restore();
          }
          // Cap at each end of the ground segment (where ground breaks)
          if (_lavaGroundCapImg.complete && _lavaGroundCapImg.naturalWidth > 0) {
            const capAspect = _lavaGroundCapImg.naturalWidth / _lavaGroundCapImg.naturalHeight;
            const capH = Math.min(p.h + 40 + GROUND_LIFT, VH - visualY);
            const capW = capH * capAspect;
            // Left cap — center aligned with ground left edge
            ctx.drawImage(_lavaGroundCapImg, px2 - capW * 0.5, visualY - 20, capW, capH);
            // Right cap — mirror, center aligned with ground right edge
            ctx.save();
            ctx.translate(px2 + p.w, visualY - 20);
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
        } else if (c.type === "orb") {
          const gemSize = CR * 2.8;
          const orbY = c.y - bounce;
          const pulse = 0.6 + Math.sin(lavaT * 5 + c.x * 0.02) * 0.4;
          if (_gemImg.complete && _gemImg.naturalWidth > 0) {
            ctx.shadowColor = "#ff5522";
            ctx.shadowBlur = 10 * pulse;
            ctx.drawImage(_gemImg, cx2 - gemSize / 2, orbY - gemSize / 2, gemSize, gemSize);
            ctx.shadowColor = "#ffaa55";
            ctx.shadowBlur = 6 * pulse;
            ctx.drawImage(_gemImg, cx2 - gemSize / 2, orbY - gemSize / 2, gemSize, gemSize);
          } else {
            const orbR = CR * 1.2;
            const orbGrad = ctx.createRadialGradient(cx2, orbY, 0, cx2, orbY, orbR);
            orbGrad.addColorStop(0, `rgba(255,255,220,0.98)`);
            orbGrad.addColorStop(0.65, `rgba(255,110,10,0.85)`);
            orbGrad.addColorStop(1, `rgba(180,40,0,0)`);
            ctx.fillStyle = orbGrad;
            ctx.beginPath();
            ctx.arc(cx2, orbY, orbR, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (c.type === "double") {
          // x2 multiplier orb — orange-gold double icon
          const sz = CR * 3.2;
          const orbY = c.y - bounce;
          const pulse = 0.7 + Math.sin(lavaT * 6 + c.x * 0.02) * 0.3;
          if (_doubleOrbImg.complete && _doubleOrbImg.naturalWidth > 0) {
            ctx.shadowColor = "#ff6600";
            ctx.shadowBlur = 14 * pulse;
            ctx.drawImage(_doubleOrbImg, cx2 - sz / 2, orbY - sz / 2, sz, sz);
          } else {
            ctx.fillStyle = "#ff8800";
            ctx.font = `bold ${Math.round(CR * 1.5)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("×2", cx2, orbY);
          }
        } else if (c.type === "coinBonus") {
          // Coin-orb — gold coin shower
          const sz = CR * 3.0;
          const orbY = c.y - bounce;
          const pulse = 0.7 + Math.sin(lavaT * 5 + c.x * 0.03) * 0.3;
          if (_coinOrbImg.complete && _coinOrbImg.naturalWidth > 0) {
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 14 * pulse;
            ctx.drawImage(_coinOrbImg, cx2 - sz / 2, orbY - sz / 2, sz, sz);
          } else {
            ctx.fillStyle = "#ffd700";
            ctx.font = `bold ${Math.round(CR * 1.4)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+10", cx2, orbY);
          }
        }
        ctx.restore();
      }

      // Life heart pickups (draw in world)
      for (const lh of s.lifeHearts) {
        if (lh.collected) continue;
        const lhx = lh.x - cx;
        if (lhx < -30 || lhx > VW + 30) continue;
        const bounce = Math.sin(lavaT * 3.5 + lh.x * 0.01) * 3;
        const PICKUP_SIZE = 28;
        ctx.save();
        ctx.shadowColor = "#ff3366";
        ctx.shadowBlur = 14 + Math.sin(lavaT * 4) * 6;
        if (_heartImg.complete && _heartImg.naturalWidth > 0) {
          ctx.drawImage(_heartImg, lhx - PICKUP_SIZE / 2, lh.y - bounce - PICKUP_SIZE / 2, PICKUP_SIZE, PICKUP_SIZE);
        } else {
          ctx.fillStyle = "#ff4477";
          ctx.font = "22px serif";
          ctx.textAlign = "center";
          ctx.fillText("♥", lhx, lh.y - bounce + 7);
        }
        ctx.restore();
      }

      // Enemies
      for (const e of s.enemies) {
        const ex = e.x - cx;
        if (ex < -80 || ex > VW + 80) continue;
        ctx.save();
        if (!e.alive) {
          // Dead: show skull image rising + fading out
          const t = e.stompTimer / 30;
          if (t > 0) {
            ctx.globalAlpha = t;
            const rise = (1 - t) * 22;
            const skullSize = 44;
            if (_skullImg.complete && _skullImg.naturalWidth > 0) {
              ctx.drawImage(_skullImg, ex + EW / 2 - skullSize / 2, e.stompY - rise - skullSize * 0.3, skullSize, skullSize);
            }
          }
          ctx.restore();
          continue;
        }
        // Draw enemy image — two ground variants (1=lava demon, 2=lizard) and two float variants (1=fireball, 2=bat)
        let eImg: HTMLImageElement;
        let drawSize: number;
        if (e.type === "float") {
          eImg = e.variant === 2 ? _enemy3Img : _enemy2Img;
          drawSize = 54;
        } else {
          eImg = e.variant === 2 ? _enemy4Img : _enemy1Img;
          drawSize = 60;
        }
        // Float enemies drift up/down slowly; ground enemies bounce with each step (position-based)
        const floatBob = e.type === "float" ? Math.sin(ts * 0.003 + e.x * 0.01) * 5 : 0;
        const walkBob  = e.type === "ground" ? -Math.abs(Math.sin(e.x * 0.09)) * 1.5 : 0; // upward
        const centerX = ex + EW / 2;
        const centerY = e.y + EH / 2 + floatBob + walkBob;
        ctx.translate(centerX, centerY);
        if (e.vx > 0) ctx.scale(-1, 1); // images face left; flip when moving right
        if (eImg.complete && eImg.naturalWidth > 0) {
          const aspect = eImg.naturalWidth / eImg.naturalHeight;
          const dw = aspect >= 1 ? drawSize : drawSize * aspect;
          const dh = aspect >= 1 ? drawSize / aspect : drawSize;
          ctx.drawImage(eImg, -dw / 2, -dh / 2, dw, dh);
        } else {
          // Fallback rectangle
          ctx.fillStyle = e.type === "float" ? "#ff6600" : "#cc2020";
          ctx.fillRect(-EW / 2, -EH / 2, EW, EH);
        }
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
        const PET_SIZE = 84;

        // Decay squish toward 1.0 each frame
        if (s.squishTimer > 0) {
          s.squishTimer -= dt;
          if (s.squishTimer <= 0) {
            s.squishX = 1; s.squishY = 1;
          }
        }
        const squishT = s.squishDuration > 0 ? Math.max(0, s.squishTimer / s.squishDuration) : 0;
        const ease = squishT * squishT;
        const curScaleX = 1 + (s.squishX - 1) * ease;
        const curScaleY = 1 + (s.squishY - 1) * ease;

        const isWalking = s.onGround && Math.abs(s.pvx) > 0.2;
        const walkSin = Math.sin(s.px * 0.055);
        const walkBobY = isWalking ? Math.abs(walkSin) * -0.8 : 0;
        const walkScaleX = isWalking ? 1 - Math.abs(walkSin) * 0.006 : 1;
        const walkScaleY = isWalking ? 1 + Math.abs(walkSin) * 0.01 : 1;

        const finalScaleX = curScaleX * walkScaleX;
        const finalScaleY = curScaleY * walkScaleY;

        ctx.save();
        // Hit-shield: flicker player and tint red
        if (s.hitShieldTimer > 0) {
          const flashOn = Math.floor(s.hitShieldTimer / 7) % 2 === 0;
          ctx.globalAlpha = flashOn ? 1.0 : 0.3;
          ctx.shadowColor = "#ff0000";
          ctx.shadowBlur = 22;
        } else {
          ctx.shadowColor = "#ff6600";
          ctx.shadowBlur = 14;
        }
        if (petImgRef.current) {
          // Pet images face LEFT by default — flip when moving right.
          // All transforms pivot from the feet so the sprite doesn't float off the ground.
          const centerX = ppx + PW / 2;
          const feetY = s.py + PH + walkBobY;
          ctx.translate(centerX, feetY);
          if (s.facingR) ctx.scale(-1, 1);
          ctx.scale(finalScaleX, finalScaleY);
          ctx.drawImage(petImgRef.current, -PET_SIZE / 2, -PET_SIZE, PET_SIZE, PET_SIZE);
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
      const HUD_TOP = Math.round(VH * 0.05);
      const HUD_H = 56;
      const HEART_SIZE = 24;
      const HEART_ROW_Y = HUD_TOP + HUD_H + 6;   // hearts sit just below the bar
      const HUD_TOTAL_H = HUD_H + HEART_SIZE + 14; // bar + gap + hearts

      // Dark gradient behind the whole header zone (bar + hearts beneath)
      const headerGrad = ctx.createLinearGradient(0, 0, 0, HUD_TOP + HUD_TOTAL_H + 10);
      headerGrad.addColorStop(0,   "rgba(0,0,0,0.72)");
      headerGrad.addColorStop(0.6, "rgba(0,0,0,0.45)");
      headerGrad.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = headerGrad;
      ctx.fillRect(0, 0, VW, HUD_TOP + HUD_TOTAL_H + 10);

      // Toolbar image background (lava-stone bar)
      if (_hudBarImg.complete && _hudBarImg.naturalWidth > 0) {
        ctx.drawImage(_hudBarImg, 0, HUD_TOP - 4, VW, HUD_H + 8);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.70)";
        ctx.fillRect(0, HUD_TOP, VW, HUD_H);
      }

      // Vertical center of the toolbar image
      const textY = HUD_TOP + HUD_H / 2;
      ctx.textBaseline = "middle";

      // Score cluster — "SCORE" label immediately LEFT of the number, drawn as one unit
      // and centered as a group within the left half of the toolbar.
      ctx.font = "bold 20px monospace";
      const scoreValueStr = `${s.score}`;
      const scoreValueW = ctx.measureText(scoreValueStr).width;
      ctx.font = "bold 11px monospace";
      const scoreLabelStr = "SCORE";
      const scoreLabelW = ctx.measureText(scoreLabelStr).width;
      const scoreGap = 6;
      const scoreClusterW = scoreLabelW + scoreGap + scoreValueW;
      const scoreClusterCenterX = VW * 0.36;
      const scoreLeft = scoreClusterCenterX - scoreClusterW / 2;

      ctx.textAlign = "left";
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#ffcc44";
      ctx.font = "bold 11px monospace";
      ctx.fillText(scoreLabelStr, scoreLeft, textY);
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#fff8e0";
      ctx.font = "bold 20px monospace";
      ctx.fillText(scoreValueStr, scoreLeft + scoreLabelW + scoreGap, textY);
      ctx.shadowBlur = 0;

      // Coin cluster — icon immediately LEFT of the amount, drawn as one unit
      // and centered as a group within the right half of the toolbar.
      const COIN_ICON = 18;
      const coinGap = 5;
      ctx.font = "bold 16px monospace";
      const coinValueStr = `${s.coinsCollected}`;
      const coinValueW = ctx.measureText(coinValueStr).width;
      const coinClusterW = COIN_ICON + coinGap + coinValueW;
      const coinClusterCenterX = VW * 0.64;
      const coinLeft = coinClusterCenterX - coinClusterW / 2;

      if (_coinImg.complete && _coinImg.naturalWidth > 0) {
        ctx.drawImage(_coinImg, coinLeft, HUD_TOP + (HUD_H - COIN_ICON) / 2, COIN_ICON, COIN_ICON);
      }
      ctx.fillStyle = "#fff8e0";
      ctx.textAlign = "left";
      ctx.fillText(coinValueStr, coinLeft + COIN_ICON + coinGap, textY);

      ctx.textBaseline = "alphabetic";

      // x2 multiplier indicator — replaces the (now-meaningless) progress bar
      if (s.doubleActive) {
        const barW = VW * 0.44;
        const barX = VW * 0.28;
        const barY = HUD_TOP + HUD_H - 8;
        const barH = 5;
        const prog2x = Math.max(0, s.doubleTimer / DOUBLE_DURATION);
        ctx.fillStyle = "rgba(255,120,0,0.22)";
        ctx.fillRect(barX, barY, barW, barH);
        const g2x = ctx.createLinearGradient(barX, 0, barX + barW * prog2x, 0);
        g2x.addColorStop(0, "#ff8800");
        g2x.addColorStop(1, "#ffee44");
        ctx.fillStyle = g2x;
        ctx.fillRect(barX, barY, barW * prog2x, barH);
        // "×2" label
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 6;
        ctx.fillStyle = "#ffcc44";
        ctx.fillText("×2 ACTIVE", VW / 2, barY - 6);
        ctx.shadowBlur = 0;
      }

      // Lives — row of hearts just below the toolbar, left-aligned
      const HEART_GAP = 27;
      const HEARTS_START_X = 12;
      const totalHudSlots = Math.max(MAX_LIVES, s.lives);
      for (let i = 0; i < totalHudSlots; i++) {
        const hx = HEARTS_START_X + i * HEART_GAP;
        ctx.save();
        ctx.globalAlpha = i < s.lives ? 1.0 : 0.25;
        if (_heartImg.complete && _heartImg.naturalWidth > 0) {
          ctx.drawImage(_heartImg, hx, HEART_ROW_Y, HEART_SIZE, HEART_SIZE);
        } else {
          ctx.fillStyle = i < s.lives ? "#ff4444" : "rgba(120,30,30,0.4)";
          ctx.font = "18px serif";
          ctx.textAlign = "left";
          ctx.fillText("♥", hx, HEART_ROW_Y + 18);
        }
        ctx.restore();
      }

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [buildState, showScreen]);

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

      {/* ── Lava Crawl loading screen — covers initial flash while assets load ── */}
      {showLoadingScreen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50 }}>
          <WorldLoadingScreen
            worldId="lava_crawl"
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

      {/* ── Pause button — overlaid in the top-right of the canvas (opposite hearts) ── */}
      {(screen === "playing" || screen === "paused") && (
        <button
          data-testid="button-lava-pause"
          onMouseDown={() => screen === "playing" ? showScreen("paused") : showScreen("playing")}
          onTouchStart={(e) => { e.preventDefault(); screen === "playing" ? showScreen("paused") : showScreen("playing"); }}
          style={{
            position: "absolute",
            top: "12%",
            right: "8px",
            width: 52,
            height: 52,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <img src={btnPauseImg} alt="Pause" draggable={false} style={{ width: 52, height: 52, objectFit: "contain" }} />
        </button>
      )}

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
            Collect coins, stomp enemies, survive as long as you can!
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
          <img src={gameOverTitleImg} alt="Game Over" draggable={false} style={{ width: "min(280px, 78vw)", height: "auto", marginBottom: "10px" }} />

          {/* Themed stat plate — replaces plain monospace lines with a lava-stone panel */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: "1px",
              background: "rgba(255,120,20,0.35)",
              border: "1px solid rgba(255,150,60,0.5)",
              borderRadius: "12px",
              overflow: "hidden",
              marginBottom: "18px",
              boxShadow: "0 4px 18px rgba(0,0,0,0.5), inset 0 0 12px rgba(255,90,0,0.15)",
            }}
          >
            <div style={{ background: "rgba(20,6,2,0.78)", padding: "10px 22px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: "108px" }}>
              <span style={{ color: "#ffcc44", fontFamily: "monospace", fontSize: "10px", letterSpacing: "1.5px", opacity: 0.85 }}>SCORE</span>
              <span style={{ color: "#fff8e0", fontFamily: "monospace", fontSize: "22px", fontWeight: "bold", textShadow: "0 0 10px rgba(255,120,0,0.7)" }} data-testid="text-gameover-score">{endScore}</span>
            </div>
            <div style={{ background: "rgba(20,6,2,0.78)", padding: "10px 22px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: "108px" }}>
              <span style={{ color: "#ffcc44", fontFamily: "monospace", fontSize: "10px", letterSpacing: "1.5px", opacity: 0.85 }}>COINS</span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#fff8e0", fontFamily: "monospace", fontSize: "22px", fontWeight: "bold", textShadow: "0 0 10px rgba(255,120,0,0.7)" }} data-testid="text-gameover-coins">
                <img src={coinIconImg} alt="coins" style={{ width: 18, height: 18, objectFit: "contain" }} />
                {endCoins}
              </span>
            </div>
          </div>

          {newBest && <div style={{ color: "#ffd700", fontSize: "14px", marginBottom: "12px", marginTop: "-10px", fontFamily: "serif", textShadow: "0 0 10px gold" }}>⭐ New Personal Best!</div>}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button data-testid="button-lava-restart-gameover" onClick={startGame} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnPlayImg} alt="Try Again" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
            <button data-testid="button-lava-leaderboard-gameover" onClick={goLeaderboard} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnLeaderboardImg} alt="Leaderboard" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
            <button data-testid="button-lava-back-gameover" onClick={() => navigate("/world/volcanic")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
              <img src={btnBackToWorldImg} alt="Back to World" draggable={false} style={{ width: "min(220px, 70vw)", height: "auto" }} />
            </button>
          </div>
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
        <div style={{ ...panelStyle, justifyContent: "flex-start", overflowY: "auto", padding: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "24px 20px" }}>
            <div style={{ position: "relative", width: "min(300px, 82vw)" }}>
              <img src={lavaCrawlLbFrameImg} alt="Leaderboard" draggable={false} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "21%", left: "13%", right: "13%", bottom: "9%", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {!leaderboard ? (
                  <div style={{ color: "#ffd080", fontFamily: "monospace", fontSize: "12px", textAlign: "center", marginTop: "12px" }}>Loading…</div>
                ) : leaderboard.length === 0 ? (
                  <div style={{ color: "rgba(255,200,100,0.6)", fontFamily: "monospace", fontSize: "12px", textAlign: "center", marginTop: "12px" }}>No scores yet — be the first!</div>
                ) : (
                  leaderboard.map((row: any, i: number) => (
                    <div
                      key={i}
                      data-testid={`row-leaderboard-${i}`}
                      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "8px", background: i === 0 ? "rgba(255,215,0,0.16)" : i === 1 ? "rgba(192,192,192,0.14)" : i === 2 ? "rgba(205,127,50,0.14)" : "rgba(0,0,0,0.22)" }}
                    >
                      <span style={{ width: "22px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {i === 0 ? <img src={trophy1st} alt="1st" style={{ width: 20, height: 20, objectFit: "contain" }} />
                          : i === 1 ? <img src={trophy2nd} alt="2nd" style={{ width: 20, height: 20, objectFit: "contain" }} />
                          : i === 2 ? <img src={trophy3rd} alt="3rd" style={{ width: 20, height: 20, objectFit: "contain" }} />
                          : <span style={{ color: "rgba(255,208,128,0.7)", fontFamily: "monospace", fontSize: "12px" }}>{i + 1}.</span>}
                      </span>
                      <span style={{ flex: 1, color: "#ffd080", fontFamily: "monospace", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.username}</span>
                      <span style={{ color: "#ff8800", fontFamily: "monospace", fontSize: "12px", fontWeight: "bold" }}>{row.best_score}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "16px" }}>
              <button data-testid="button-lava-play-lb" onClick={startGame} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
                <img src={lavaCrawlLbBtnPlayImg} alt="Play" draggable={false} style={{ width: "min(190px, 60vw)", height: "auto" }} />
              </button>
              <button data-testid="button-lava-back-lb" onClick={() => showScreen("start")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, margin: "6px" }}>
                <img src={lavaCrawlLbBtnBackImg} alt="Back" draggable={false} style={{ width: "min(190px, 60vw)", height: "auto" }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
