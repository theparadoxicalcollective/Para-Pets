import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, FlipHorizontal, Palette, MapPin, Minus, Store, Swords } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import { playShopBell } from "@/lib/sounds";
import PetAnimator from "@/components/PetAnimator";
import bgGround from "@assets/IMG_6459_1774675340089.jpeg";
import coinIconImg from "@assets/icon_coin.png";
import petHouseIconImg from "@assets/icon_pet_house.png";
import swordIconImg from "@assets/icon_attack_sword.png";

const WORLD_ID = "pet_world";
const ACCENT = "#7fffd4";
const MAP_W = 1080;
const MAP_H_DEFAULT = 700;

const FRAME_W = 390;
const FRAME_H = 844;

const LIGHT_ORB_SENTINEL        = "__light_orb__";
const LIGHT_ORB_BLUE_SENTINEL   = "__light_orb_blue__";
const LIGHT_ORB_GREEN_SENTINEL  = "__light_orb_green__";
const LIGHT_ORB_PURPLE_SENTINEL = "__light_orb_purple__";
const FIREFLIES_SENTINEL        = "__fireflies__";
const PASS_THROUGH_SENTINELS = new Set([
  LIGHT_ORB_SENTINEL, LIGHT_ORB_BLUE_SENTINEL,
  LIGHT_ORB_GREEN_SENTINEL, LIGHT_ORB_PURPLE_SENTINEL,
  FIREFLIES_SENTINEL,
]);

function getOrbGradient(s: string) {
  if (s === LIGHT_ORB_BLUE_SENTINEL)
    return "radial-gradient(circle, rgba(150,200,255,0.48) 0%, rgba(90,155,255,0.28) 20%, rgba(60,110,255,0.14) 45%, rgba(40,80,220,0.05) 65%, transparent 80%)";
  if (s === LIGHT_ORB_GREEN_SENTINEL)
    return "radial-gradient(circle, rgba(150,255,190,0.48) 0%, rgba(80,230,130,0.28) 20%, rgba(50,190,90,0.14) 45%, rgba(40,160,70,0.05) 65%, transparent 80%)";
  if (s === LIGHT_ORB_PURPLE_SENTINEL)
    return "radial-gradient(circle, rgba(220,150,255,0.48) 0%, rgba(175,95,252,0.28) 20%, rgba(140,65,225,0.14) 45%, rgba(110,45,205,0.05) 65%, transparent 80%)";
  return "radial-gradient(circle, rgba(255,235,150,0.48) 0%, rgba(255,200,70,0.28) 20%, rgba(255,145,10,0.14) 45%, rgba(255,110,0,0.05) 65%, transparent 80%)";
}

function seededRand(seed: string, n: number) {
  let h = (n + 1) * 2654435761;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

type DecorItem      = { id: string; worldId: string; name: string; imageUrl: string; createdAt: string };
type DecorPlacement = { id: string; worldId: string; decorItemId: string; name: string; imageUrl: string; posX: number; posY: number; size: number; flipped: boolean; message: string | null; createdAt: string };
type KCLocation     = { id: string; worldId: string; name: string; type: string; iconUrl: string | null; bgUrl: string | null; description: string | null; posX: number; posY: number; isShop: boolean; glowColor: string | null; iconSize: number; flipped: boolean; sortOrder: number; ownerImageUrl: string | null };
type KCShopItem     = { id: string; name: string; price: number; type: string; imageUrl: string | null; rarity: number | null; hatchTime: number | null; eggImageUrl: string | null; hatchedImageUrl: string | null; worldId: string; description?: string | null };
type WorldActivePet = {
  userId: string;
  username: string;
  profileImage: string | null;
  inventoryId: string;
  shopItemId: string;
  name: string;
  petNickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  petLevel: number;
  petHealth: number | null;
  petAtk: number | null;
  petDef: number | null;
  rarity: number | null;
  petTemplateId: string | null;
  posX: number | null;
  posY: number | null;
};

type KCSpawnedEnemy = {
  id: string;
  enemyId: string;
  spawnX: number;
  spawnY: number;
  enemyName: string;
  enemyImageUrl: string | null;
};

type GlobalEnemy = { id: string; name: string; imageUrl: string | null };

type LiveKCEnemy = {
  instanceId: string;
  enemyId: string;
  enemyName: string;
  enemyImageUrl: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  alive: boolean;
  nextDirChange: number;
  respawnAt?: number;
  retaliateUntil?: number;
};

function makeInstanceId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function spawnKCEnemy(template: KCSpawnedEnemy, index = 0, total = 1): LiveKCEnemy {
  const speed = 2.5 + Math.random() * 2.5;
  const angle = Math.random() * Math.PI * 2;
  // Grid-based placement so enemies spread across the full map area
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = 78 / cols;
  const cellH = 48 / rows;
  const x = Math.max(8, Math.min(90, 10 + col * cellW + Math.random() * cellW * 0.75));
  const y = Math.max(36, Math.min(86, 36 + row * cellH + Math.random() * cellH * 0.75));
  return {
    instanceId: makeInstanceId(),
    enemyId: template.enemyId,
    enemyName: template.enemyName,
    enemyImageUrl: template.enemyImageUrl,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed * 0.35,
    hp: 100,
    alive: true,
    nextDirChange: Date.now() + 1500 + Math.random() * 3000,
  };
}

interface PetWorldPageProps {
  user: { id: string; isAdmin: boolean };
  onClose: () => void;
}

export default function PetWorldPage({ user, onClose }: PetWorldPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // ── map pan state ──────────────────────────────────────────────────────────
  const [mapX, setMapX]         = useState(0);
  const [mapY, setMapY]         = useState(0);
  const [mapScale, setMapScale] = useState(1);
  const [mapH, setMapH]         = useState(MAP_H_DEFAULT);
  const mapHRef                 = useRef(MAP_H_DEFAULT);
  const mapTransformRef         = useRef({ x: 0, y: 0, scale: 1 });
  const mapPanPointersRef       = useRef(new Map<number, { x: number; y: number }>());
  const mapPanStartRef          = useRef<{ x: number; y: number; mapX: number; mapY: number } | null>(null);
  const mapPanningRef           = useRef(false);
  const mapJustPannedRef        = useRef(false);
  const pinchStartRef           = useRef<{ dist: number; scale: number; midX: number; midY: number; mapX: number; mapY: number } | null>(null);
  // Pet tap detection — set on pointer-down, consumed on pointer-up if no drag
  const petTapRef               = useRef<string | null>(null); // userId under the pointer

  // ── decor drag state ───────────────────────────────────────────────────────
  const areaRef          = useRef<HTMLDivElement>(null);
  const decorDragRef     = useRef<{ placementId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const decorDidDrag     = useRef(false);
  const panelDragRef     = useRef<{ item: DecorItem } | null>(null);

  const [decorDragPos,   setDecorDragPos]   = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [panelDragGhost, setPanelDragGhost] = useState<{ clientX: number; clientY: number; item: DecorItem } | null>(null);

  // ── layer order — tracks which item was most recently moved ────────────────
  // Most-recently-moved ID is last in the array → gets the highest z-index boost.
  const [locMoveOrder,   setLocMoveOrder]   = useState<string[]>([]);
  const [decorMoveOrder, setDecorMoveOrder] = useState<string[]>([]);

  // ── KC enemy state ─────────────────────────────────────────────────────────
  const [showEnemyPanel,      setShowEnemyPanel]      = useState(false);
  const [selectedEnemyToAdd,  setSelectedEnemyToAdd]  = useState<string>("");
  const [liveEnemies,         setLiveEnemies]          = useState<LiveKCEnemy[]>([]);
  const liveEnemiesRef = useRef<LiveKCEnemy[]>([]);
  const [enemiesInitialized,  setEnemiesInitialized]  = useState(false);
  const [swipeTarget,         setSwipeTarget]          = useState<string | null>(null);
  const [coinPops,            setCoinPops]             = useState<{ id: string; x: number; y: number; amount: number }[]>([]);
  const [dyingEnemies,        setDyingEnemies]         = useState<Set<string>>(new Set());
  const [petAttackMarks,      setPetAttackMarks]       = useState<{ id: string; x: number; y: number; angle: number }[]>([]);
  const [enemyProjectiles,    setEnemyProjectiles]     = useState<{ id: string; fromX: number; fromY: number; toX: number; toY: number }[]>([]);
  const [petHitFlash,         setPetHitFlash]          = useState(false);
  const [petIsMoving,         setPetIsMoving]          = useState(false);
  const [petPouncing,         setPetPouncing]          = useState(false);

  // ── panel state ────────────────────────────────────────────────────────────
  const [showDecorPanel,   setShowDecorPanel]   = useState(false);
  const [showAddDecorForm, setShowAddDecorForm] = useState(false);
  const [newDecorName,     setNewDecorName]     = useState("");
  const [newDecorImage,    setNewDecorImage]    = useState<string | null>(null);
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);

  // ── location state ─────────────────────────────────────────────────────────
  const [activeLocId,       setActiveLocId]       = useState<string | null>(null);
  const [showLocShop,       setShowLocShop]       = useState(false);
  const [showPlacesPanel,   setShowPlacesPanel]   = useState(false);
  const [showAddLocForm,    setShowAddLocForm]     = useState(false);
  const [newLocName,        setNewLocName]         = useState("");
  const [newLocType,        setNewLocType]         = useState("shop");
  const [newLocGlow,        setNewLocGlow]         = useState("#d4a017");
  const [newLocIcon,        setNewLocIcon]         = useState<string | null>(null);
  const [newLocOwner,       setNewLocOwner]        = useState<string | null>(null);
  const [selectedLocId,     setSelectedLocId]      = useState<string | null>(null);
  const [locDragPos,        setLocDragPos]         = useState<{ id: string; x: number; y: number } | null>(null);
  const locDragRef    = useRef<{ locId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const locDidDrag    = useRef(false);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: decorItems = [] } = useQuery<DecorItem[]>({
    queryKey: ["/api/world", WORLD_ID, "decor", "items"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/decor/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: decorPlacements = [] } = useQuery<DecorPlacement[]>({
    queryKey: ["/api/world", WORLD_ID, "decor", "placements"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/decor/placements`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // ── Online pets — driven entirely by SSE events, no polling ───────────────
  const [onlinePets, setOnlinePets] = useState<WorldActivePet[]>([]);
  const onlinePetsRef = useRef<WorldActivePet[]>([]);
  onlinePetsRef.current = onlinePets;

  const { data: me } = useQuery<{ profileImage: string | null; username: string; coins: number }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    enabled: showFriendsPanel,
    refetchInterval: showFriendsPanel ? 15000 : false,
  });

  const { data: friendRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    enabled: showFriendsPanel,
    refetchInterval: showFriendsPanel ? 15000 : false,
  });

  const { data: friendRequestCount = 0 } = useQuery<number>({
    queryKey: ["/api/friends/requests/count"],
    select: (d: any) => (typeof d === "number" ? d : d?.count ?? 0),
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not accept request.", variant: "destructive" }),
  });

  const declineRequestMutation = useMutation({
    mutationFn: (otherId: string) => apiRequest("DELETE", `/api/friends/${otherId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not decline request.", variant: "destructive" }),
  });

  // ── KC Enemies queries + mutations ─────────────────────────────────────────
  const { data: kcSpawnedEnemies = [] } = useQuery<KCSpawnedEnemy[]>({
    queryKey: ["/api/world/pet_world/kc-enemies"],
    queryFn: async () => {
      const res = await fetch("/api/world/pet_world/kc-enemies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: globalEnemies = [] } = useQuery<GlobalEnemy[]>({
    queryKey: ["/api/admin/enemies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/enemies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: user.isAdmin && showEnemyPanel,
  });

  const addKCEnemyMutation = useMutation({
    mutationFn: (enemyId: string) => apiRequest("POST", "/api/admin/kc-enemies", { enemyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world/pet_world/kc-enemies"] });
      setSelectedEnemyToAdd("");
      setEnemiesInitialized(false);
      toast({ title: "Enemy type added!" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add enemy type", variant: "destructive" }),
  });

  const removeKCEnemyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/kc-enemies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world/pet_world/kc-enemies"] });
    },
  });

  const killRewardMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/world/pet_world/kc-kill-reward"),
    onSuccess: (data: any) => {
      const coins = data?.coinsEarned ?? 1;
      toast({
        title: `+${coins} coin${coins > 1 ? "s" : ""} · +5 XP`,
        description: data?.petResult ? `Pet is now Level ${data.petResult.petLevel}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user/me"] });
    },
  });

  // ── Spawn pool initializer ─────────────────────────────────────────────────
  useEffect(() => {
    if (enemiesInitialized || kcSpawnedEnemies.length === 0) return;
    const count = 6 + Math.floor(Math.random() * 5); // 6–10
    const pool: LiveKCEnemy[] = [];
    for (let i = 0; i < count; i++) {
      const template = kcSpawnedEnemies[i % kcSpawnedEnemies.length];
      pool.push(spawnKCEnemy(template, i, count));
    }
    liveEnemiesRef.current = pool;
    setLiveEnemies(pool);
    setEnemiesInitialized(true);
  }, [kcSpawnedEnemies, enemiesInitialized]);

  // ── Enemy wander animation loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!enemiesInitialized || kcSpawnedEnemies.length === 0) return;
    let lastTime = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const prev = liveEnemiesRef.current;
      let changed = false;
      const next = prev.map(e => {
        // Respawn logic
        if (!e.alive) {
          if (e.respawnAt && now >= e.respawnAt) {
            const template = kcSpawnedEnemies[Math.floor(Math.random() * kcSpawnedEnemies.length)];
            changed = true;
            return spawnKCEnemy(template);
          }
          return e;
        }
        let { x, y, vx, vy, nextDirChange, retaliateUntil } = e;
        if (retaliateUntil && now < retaliateUntil) {
          // Charge toward pet instead of wandering
          const pet = localPetPosRef.current;
          if (pet) {
            const distX = pet.x - x;
            const distY = pet.y - y;
            const dist = Math.hypot(distX, distY) || 1;
            const speed = 7;
            vx = (distX / dist) * speed;
            vy = (distY / dist) * speed * 0.45;
            changed = true;
          }
        } else {
          // Clear expired retaliation
          if (retaliateUntil) { retaliateUntil = undefined; changed = true; }
          // Random direction change
          if (now >= nextDirChange) {
            const speed = 2.5 + Math.random() * 2.5;
            const angle = Math.random() * Math.PI * 2;
            vx = Math.cos(angle) * speed;
            vy = Math.sin(angle) * speed * 0.35;
            nextDirChange = now + 1500 + Math.random() * 3000;
            changed = true;
          }
        }
        let nx = x + vx * dt;
        let ny = y + vy * dt;
        let nvx = vx, nvy = vy;
        if (nx < 6)  { nx = 6;  nvx =  Math.abs(vx); changed = true; }
        if (nx > 91) { nx = 91; nvx = -Math.abs(vx); changed = true; }
        if (ny < 41) { ny = 41; nvy =  Math.abs(vy); changed = true; }
        if (ny > 87) { ny = 87; nvy = -Math.abs(vy); changed = true; }
        if (nx !== x || ny !== y) changed = true;
        return { ...e, x: nx, y: ny, vx: nvx, vy: nvy, nextDirChange, retaliateUntil };
      });
      if (changed) {
        liveEnemiesRef.current = next;
        setLiveEnemies([...next]);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enemiesInitialized, kcSpawnedEnemies]);

  // ── Attack handler ─────────────────────────────────────────────────────────
  const handleAttack = useCallback(() => {
    const pos = localPetPosRef.current;
    if (!pos) return;
    const enemies = liveEnemiesRef.current;
    let closest: { idx: number; e: LiveKCEnemy } | null = null;
    let closestDist = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dist = Math.hypot(pos.x - e.x, pos.y - e.y);
      if (dist < 18 && dist < closestDist) { closestDist = dist; closest = { idx: i, e }; }
    }
    if (!closest) return;
    const { idx, e: target } = closest;
    const dmg = 5 + Math.floor(Math.random() * 6);
    const newHp = Math.max(0, target.hp - dmg);
    const updated = [...liveEnemiesRef.current];

    // Pet attack: scratch marks appear on the enemy + pet lunges
    const markId = makeInstanceId();
    const scratchAngle = -25 + Math.random() * 50;
    setPetAttackMarks(prev => [...prev, { id: markId, x: target.x, y: target.y, angle: scratchAngle }]);
    setTimeout(() => setPetAttackMarks(prev => prev.filter(m => m.id !== markId)), 600);
    setPetPouncing(true);
    setTimeout(() => setPetPouncing(false), 300);

    if (newHp <= 0) {
      // Kill: immediately mark dead, play death animation
      updated[idx] = { ...target, hp: 0, alive: false, respawnAt: Date.now() + 6000 };
      liveEnemiesRef.current = updated;
      setLiveEnemies([...updated]);
      setDyingEnemies(prev => new Set([...prev, target.instanceId]));
      setTimeout(() => setDyingEnemies(prev => { const s = new Set(prev); s.delete(target.instanceId); return s; }), 1400);
      killRewardMutation.mutate();
      setCoinPops(prev => [...prev, { id: makeInstanceId(), x: target.x, y: target.y, amount: 1 + Math.floor(Math.random() * 2) }]);
      setTimeout(() => setCoinPops(prev => prev.slice(1)), 1500);
    } else {
      // Hit but alive: enemy charges at the pet and fires a green orb back
      updated[idx] = { ...target, hp: newHp, retaliateUntil: performance.now() + 1600 };
      liveEnemiesRef.current = updated;
      setLiveEnemies([...updated]);
      const projId = makeInstanceId();
      setEnemyProjectiles(prev => [...prev, { id: projId, fromX: target.x, fromY: target.y, toX: pos.x, toY: pos.y }]);
      setTimeout(() => {
        setEnemyProjectiles(prev => prev.filter(p => p.id !== projId));
        setPetHitFlash(true);
        setTimeout(() => setPetHitFlash(false), 280);
      }, 580);
    }

    setSwipeTarget(target.instanceId);
    setTimeout(() => setSwipeTarget(t => t === target.instanceId ? null : t), 350);
  }, [killRewardMutation]);

  const removeFriendMutation = useMutation({
    mutationFn: (friendId: string) => apiRequest("DELETE", `/api/friends/${friendId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    },
    onError: () => toast({ title: "Error", description: "Could not remove friend.", variant: "destructive" }),
  });

  // ── location queries ────────────────────────────────────────────────────────
  const { data: kcLocations = [] } = useQuery<KCLocation[]>({
    queryKey: ["/api/world", WORLD_ID, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: locShopItems = [] } = useQuery<KCShopItem[]>({
    queryKey: ["/api/location", activeLocId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeLocId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: showLocShop && !!activeLocId,
    staleTime: 30_000,
  });

  // ── location mutations ──────────────────────────────────────────────────────
  const addLocMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; iconData?: string | null; ownerImageData?: string | null; glowColor?: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/location`, { ...data, isShop: data.type === "shop" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] });
      setShowAddLocForm(false);
      setNewLocName(""); setNewLocType("shop"); setNewLocIcon(null); setNewLocOwner(null);
      toast({ title: "Place Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add place", variant: "destructive" }),
  });

  const deleteLocMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/location/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const updateLocPositionMutation = useMutation({
    mutationFn: async ({ locationId, posX, posY }: { locationId: string; posX: number; posY: number }) => {
      await apiRequest("PATCH", `/api/admin/world/location/${locationId}/position`, { posX, posY });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const updateLocSizeMutation = useMutation({
    mutationFn: async ({ locationId, iconSize }: { locationId: string; iconSize: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}`, { iconSize });
      return res.json();
    },
    onMutate: async ({ locationId, iconSize }) => {
      queryClient.setQueryData<KCLocation[]>(["/api/world", WORLD_ID, "locations"], old =>
        old?.map(l => l.id === locationId ? { ...l, iconSize } : l)
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const flipLocMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/admin/world/location/${id}/flip`, {}); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  // ── location drag handlers ──────────────────────────────────────────────────
  const handleLocPointerDown = useCallback((e: React.PointerEvent, loc: KCLocation) => {
    if (!user.isAdmin) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    locDidDrag.current = false;
    locDragRef.current = { locId: loc.id, startX: e.clientX, startY: e.clientY, origPosX: loc.posX, origPosY: loc.posY };
  }, [user.isAdmin]);

  const handleLocPointerMove = useCallback((e: React.PointerEvent) => {
    if (!locDragRef.current || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - locDragRef.current.startX;
    const dy = e.clientY - locDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) locDidDrag.current = true;
    const newX = Math.max(0, Math.min(85, locDragRef.current.origPosX + dx / (rect.width / 100)));
    const newY = Math.max(0, Math.min(85, locDragRef.current.origPosY + dy / (rect.height / 100)));
    setLocDragPos({ id: locDragRef.current.locId, x: newX, y: newY });
  }, []);

  const handleLocPointerUp = useCallback(() => {
    if (!locDragRef.current) return;
    const d = locDragRef.current;
    locDragRef.current = null;
    if (locDidDrag.current && locDragPos) {
      updateLocPositionMutation.mutate({ locationId: d.locId, posX: locDragPos.x, posY: locDragPos.y });
      setLocMoveOrder(prev => [...prev.filter(id => id !== d.locId), d.locId]);
    }
    locDidDrag.current = false;
    setLocDragPos(null);
  }, [locDragPos, updateLocPositionMutation]);

  const handleLocClick = useCallback((loc: KCLocation) => {
    if (locDidDrag.current || mapJustPannedRef.current) return;
    if (user.isAdmin) {
      setSelectedLocId(prev => {
        if (prev === loc.id) {
          if (loc.isShop) { setActiveLocId(loc.id); setShowLocShop(true); playShopBell(); }
          return null;
        }
        return loc.id;
      });
    } else {
      if (loc.isShop) { setActiveLocId(loc.id); setShowLocShop(true); playShopBell(); }
    }
  }, [user.isAdmin]);

  const [selectedPet, setSelectedPet] = useState<WorldActivePet | null>(null);

  // ── Joystick / walking state ────────────────────────────────────────────────
  const [localPetPos,    setLocalPetPos]    = useState<{ x: number; y: number } | null>(null);
  const localPetPosRef   = useRef<{ x: number; y: number } | null>(null);
  const joystickDirRef   = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const joystickActRef   = useRef(false);
  const rafRef           = useRef<number | null>(null);
  const lastRafTimeRef   = useRef<number | null>(null);
  const lastSaveRef      = useRef<number>(0);

  // ── seeded default positions — spread pets across the full map canvas ───────
  // Used as a fallback when a pet has no stored server position yet.
  const petDefaultPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    onlinePets.forEach((pet, idx) => {
      if (pet.posX !== null && pet.posY !== null) {
        map.set(pet.userId, { x: pet.posX, y: pet.posY });
      } else {
        const seed = (idx + 1) * 1337;
        const rng = (n: number) => {
          let h = Math.imul(Math.floor(seed * 10000 + n), 0x9e3779b9);
          h ^= h >>> 16;
          return (h >>> 0) / 4294967295;
        };
        map.set(pet.userId, {
          x: 10 + rng(1) * 75,
          y: 40 + rng(2) * 45,
        });
      }
    });
    return map;
  }, [onlinePets]);

  // ── Own pet + joystick movement ────────────────────────────────────────────
  const ownPet = useMemo(() => onlinePets.find(p => p.userId === user.id), [onlinePets, user.id]);

  // Seed localPetPos once the player's pet is known
  useEffect(() => {
    if (ownPet && localPetPosRef.current === null) {
      const stored = petDefaultPositions.get(ownPet.userId) ?? { x: 50, y: 70 };
      const init = { x: Math.max(5, Math.min(92, stored.x)), y: Math.max(38, Math.min(90, stored.y)) };
      localPetPosRef.current = init;
      setLocalPetPos(init);
    }
  }, [ownPet, petDefaultPositions]);

  // RAF movement loop — runs while joystick is active
  const startRaf = useCallback(() => {
    if (rafRef.current !== null) return;
    lastRafTimeRef.current = null;
    const loop = (now: number) => {
      const { dx, dy } = joystickDirRef.current;
      const dt = lastRafTimeRef.current === null ? 0 : Math.min((now - lastRafTimeRef.current) / 1000, 0.1);
      lastRafTimeRef.current = now;
      if (localPetPosRef.current && (dx !== 0 || dy !== 0)) {
        const nx = Math.max(5,  Math.min(92, localPetPosRef.current.x + dx * 6 * dt));
        const ny = Math.max(38, Math.min(90, localPetPosRef.current.y + dy * 4 * dt));
        localPetPosRef.current = { x: nx, y: ny };
        setLocalPetPos({ x: nx, y: ny });

        // ── Camera follow: pan map so pet stays within horizontal margins ──
        const { x: curMapX, y: curMapY, scale: sc } = mapTransformRef.current;
        const scaledMapW = MAP_W * sc;
        if (scaledMapW > FRAME_W) {
          const petScreenX = (nx / 100) * scaledMapW + curMapX;
          const EDGE = 110; // screen-px margin before camera starts panning
          let targetX = curMapX;
          if (petScreenX < EDGE) {
            targetX = EDGE - (nx / 100) * scaledMapW;
          } else if (petScreenX > FRAME_W - EDGE) {
            targetX = (FRAME_W - EDGE) - (nx / 100) * scaledMapW;
          }
          targetX = Math.max(FRAME_W - scaledMapW, Math.min(0, targetX));
          if (Math.abs(targetX - curMapX) > 0.5) {
            // Smooth lerp toward target — feels like a gentle follow-cam
            const newMapX = curMapX + (targetX - curMapX) * Math.min(1, dt * 8);
            mapTransformRef.current = { x: newMapX, y: curMapY, scale: sc };
            setMapX(newMapX);
          }
        }

        if (ownPet && now - lastSaveRef.current > 2000) {
          lastSaveRef.current = now;
          apiRequest("PATCH", "/api/world/pet_world/pet-position", { ownerUserId: ownPet.userId, posX: nx, posY: ny });
        }
      }
      if (joystickActRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [ownPet]);

  const handleJoystickChange = useCallback((dx: number, dy: number, active: boolean) => {
    joystickDirRef.current = { dx, dy };
    joystickActRef.current = active;
    setPetIsMoving(active);
    if (active) {
      startRaf();
    } else {
      // Save final position on release
      const pos = localPetPosRef.current;
      if (pos && ownPet) {
        apiRequest("PATCH", "/api/world/pet_world/pet-position", { ownerUserId: ownPet.userId, posX: pos.x, posY: pos.y });
      }
    }
  }, [ownPet, startRaf]);

  // Cleanup RAF on unmount
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  // ── SSE: full presence + live positions — roster/join/leave/move ──────────
  useEffect(() => {
    const es = new EventSource("/api/world/pet_world/position-stream");

    // Initial snapshot of everyone currently online (including self)
    es.addEventListener("roster", (e) => {
      try {
        const pets = JSON.parse(e.data) as WorldActivePet[];
        setOnlinePets(pets);
      } catch {}
    });

    // A new player entered the world
    es.addEventListener("join", (e) => {
      try {
        const pet = JSON.parse(e.data) as WorldActivePet;
        setOnlinePets(prev =>
          prev.some(p => p.userId === pet.userId)
            ? prev.map(p => p.userId === pet.userId ? pet : p)
            : [...prev, pet]
        );
      } catch {}
    });

    // A player left the world
    es.addEventListener("leave", (e) => {
      try {
        const { userId } = JSON.parse(e.data) as { userId: string };
        setOnlinePets(prev => prev.filter(p => p.userId !== userId));
      } catch {}
    });

    // Position update from another player
    es.addEventListener("move", (e) => {
      try {
        const { userId, posX, posY } = JSON.parse(e.data) as { userId: string; posX: number; posY: number };
        if (userId === user.id) return; // own pet is managed locally via RAF
        setOnlinePets(prev =>
          prev.map(p => p.userId === userId ? { ...p, posX, posY } : p)
        );
      } catch {}
    });

    return () => es.close();
  }, [user.id]);

  // ── mutations ──────────────────────────────────────────────────────────────
  const addDecorItemMutation = useMutation({
    mutationFn: async (data: { name: string; imageUrl: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/decor/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "items"] });
      setShowAddDecorForm(false);
      setNewDecorName("");
      setNewDecorImage(null);
      toast({ title: "Decor Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add decor", variant: "destructive" }),
  });

  const deleteDecorItemMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/decor/items/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] });
    },
  });

  const addDecorPlacementMutation = useMutation({
    mutationFn: async (data: { item: DecorItem; posX: number; posY: number }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/decor/placements`, {
        decorItemId: data.item.id, name: data.item.name, imageUrl: data.item.imageUrl,
        posX: data.posX, posY: data.posY,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
    onError: () => toast({ title: "Error", description: "Failed to place decor", variant: "destructive" }),
  });

  const updateDecorPlacementMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; posX?: number; posY?: number; size?: number; flipped?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/decor/placements/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
  });

  const deleteDecorPlacementMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/decor/placements/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
  });

  // ── map setup: compute height from background image aspect ratio ───────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        const h = Math.round(MAP_W * img.naturalHeight / img.naturalWidth);
        mapHRef.current = h;
        setMapH(h);
      }
    };
    img.src = bgGround;
  }, []);

  // ── initial centering on mount / mapH change ───────────────────────────────
  useEffect(() => {
    const coverSc = Math.max(FRAME_W / MAP_W, FRAME_H / mapHRef.current);
    // Start at cover scale so the world fills the frame
    const initSc  = coverSc;
    const ix = (FRAME_W - MAP_W * initSc) / 2;
    const iy = (FRAME_H - mapHRef.current * initSc) / 2;
    mapTransformRef.current = { x: ix, y: iy, scale: initSc };
    setMapX(ix); setMapY(iy); setMapScale(initSc);
  }, [mapH]);

  // ── clamp + apply (horizontal pan only, no zoom) ───────────────────────────
  const applyMapTransform = useCallback((x: number, _y: number, _sc: number) => {
    const coverSc = Math.max(FRAME_W / MAP_W, FRAME_H / mapHRef.current);
    const mw = MAP_W * coverSc;
    const mh = mapHRef.current * coverSc;
    // Lock scale to cover; lock Y to vertical center; only X scrolls
    const cx = mw <= FRAME_W ? (FRAME_W - mw) / 2 : Math.max(FRAME_W - mw, Math.min(0, x));
    const cy = (FRAME_H - mh) / 2;
    mapTransformRef.current = { x: cx, y: cy, scale: coverSc };
    setMapX(cx); setMapY(cy); setMapScale(coverSc);
  }, []);

  // ── horizontal pan only (no zoom, no vertical scroll) ─────────────────────
  const handleVpPointerDown = useCallback((e: React.PointerEvent) => {
    if (decorDragRef.current) return;
    // Only track the first finger; ignore any additional fingers
    if (mapPanPointersRef.current.size > 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mapPanStartRef.current = { x: e.clientX, y: e.clientY, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
    mapPanningRef.current = false;
    // Record if the tap started over another player's pet
    const petEl = (e.target as Element).closest("[data-petid]") as HTMLElement | null;
    petTapRef.current = petEl ? (petEl.getAttribute("data-petid") ?? null) : null;
  }, []);

  const handleVpPointerMove = useCallback((e: React.PointerEvent) => {
    if (!mapPanStartRef.current || !mapPanPointersRef.current.has(e.pointerId)) return;
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Horizontal drag only — ignore vertical delta
    const dx = e.clientX - mapPanStartRef.current.x;
    if (!mapPanningRef.current && Math.abs(dx) > 4) mapPanningRef.current = true;
    if (mapPanningRef.current) applyMapTransform(mapPanStartRef.current.mapX + dx, 0, 1);
  }, [applyMapTransform]);

  const handleVpPointerUp = useCallback((e: React.PointerEvent) => {
    mapPanPointersRef.current.delete(e.pointerId);
    const wasPan = mapPanningRef.current;
    if (wasPan) { mapJustPannedRef.current = true; setTimeout(() => { mapJustPannedRef.current = false; }, 80); }
    mapPanStartRef.current = null;
    mapPanningRef.current = false;
    // If the pointer went down and up on a pet without dragging, open their profile
    if (!wasPan && petTapRef.current) {
      const userId = petTapRef.current;
      const pet = onlinePetsRef.current.find(p => p.userId === userId);
      if (pet) setSelectedPet(pet);
    }
    petTapRef.current = null;
  }, []);

  // ── decor drag on map ──────────────────────────────────────────────────────
  const handleDecorPointerDown = useCallback((e: React.PointerEvent, p: { id: string; posX: number; posY: number }) => {
    if (!user.isAdmin) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    decorDidDrag.current = false;
    decorDragRef.current = { placementId: p.id, startX: e.clientX, startY: e.clientY, origPosX: p.posX, origPosY: p.posY };
  }, [user.isAdmin]);

  const handleDecorPointerMove = useCallback((e: React.PointerEvent) => {
    if (!decorDragRef.current || !areaRef.current) return;
    e.preventDefault();
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - decorDragRef.current.startX;
    const dy = e.clientY - decorDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) decorDidDrag.current = true;
    const newX = Math.max(0, Math.min(100, decorDragRef.current.origPosX + dx / (rect.width / 100)));
    const newY = Math.max(0, Math.min(100, decorDragRef.current.origPosY + dy / (rect.height / 100)));
    setDecorDragPos({ id: decorDragRef.current.placementId, x: newX, y: newY });
  }, []);

  const handleDecorPointerUp = useCallback(() => {
    if (!decorDragRef.current) return;
    const d = decorDragRef.current;
    decorDragRef.current = null;
    if (decorDidDrag.current && decorDragPos) {
      updateDecorPlacementMutation.mutate({ id: d.placementId, posX: Math.round(decorDragPos.x), posY: Math.round(decorDragPos.y) });
      setDecorMoveOrder(prev => [...prev.filter(id => id !== d.placementId), d.placementId]);
    }
    setDecorDragPos(null);
  }, [decorDragPos, updateDecorPlacementMutation]);


  // ── panel drag-to-map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!panelDragGhost) return;
    const onMove = (e: PointerEvent) => {
      setPanelDragGhost(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null);
    };
    const onUp = (e: PointerEvent) => {
      const item = panelDragRef.current?.item;
      panelDragRef.current = null;
      setPanelDragGhost(null);
      if (item && areaRef.current) {
        const rect = areaRef.current.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          addDecorPlacementMutation.mutate({ item, posX: x, posY: y });
        }
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
  }, [!!panelDragGhost]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, background: "#060e06" }}
    >
      {/* ══ Map canvas — single background, full pan + zoom ════════════════ */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: "none", userSelect: "none", zIndex: 3 }}
        onPointerDown={handleVpPointerDown}
        onPointerMove={handleVpPointerMove}
        onPointerUp={handleVpPointerUp}
        onPointerCancel={handleVpPointerUp}
      >
        <div
          ref={areaRef}
          style={{
            position: "absolute",
            width: MAP_W,
            height: mapH,
            transformOrigin: "0 0",
            transform: `translate(${mapX}px, ${mapY}px) scale(${mapScale})`,
            backgroundImage: `url(${bgGround})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
          onClick={() => { if (user.isAdmin) { setSelectedDecorId(null); setSelectedLocId(null); } }}
        >
          {/* ── Roaming pets — inside the map canvas so they pan with the world ── */}
          {onlinePets.map((pet, idx) => {
            const isOwn = pet.userId === user.id;
            // Own pet uses the locally-managed position for smooth joystick movement
            const rawPos = isOwn && localPetPos
              ? localPetPos
              : (petDefaultPositions.get(pet.userId) ?? { x: 50, y: 70 });
            const resolvedX = Math.max(5,  Math.min(92, rawPos.x));
            const resolvedY = Math.max(38, Math.min(90, rawPos.y));
            return (
              <WorldRoamingPet
                key={pet.userId}
                pet={pet}
                posX={resolvedX}
                posY={resolvedY}
                isOwn={isOwn}
                isMoving={isOwn ? petIsMoving : false}
                isPouncing={isOwn ? petPouncing : false}
                onTap={() => setSelectedPet(pet)}
              />
            );
          })}

          {/* ── KC Enemies on the map ─────────────────────────────────── */}
          {liveEnemies.map(enemy => {
            const defeated = !enemy.alive;
            const isDying = dyingEnemies.has(enemy.instanceId);
            const isSwipe = swipeTarget === enemy.instanceId;
            const facingLeft = enemy.vx < 0;
            // After the death animation ends, the enemy is fully invisible until respawn
            if (defeated && !isDying) return null;
            return (
              <div
                key={enemy.instanceId}
                data-testid={`enemy-on-map-${enemy.instanceId}`}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${enemy.x}%`,
                  top: `${enemy.y}%`,
                  transform: "translate(-50%, -100%)",
                  zIndex: 11 + Math.round((enemy.y / 100) * 60),
                  pointerEvents: "none",
                  userSelect: "none",
                  width: 44,
                  willChange: "left, top",
                }}
              >
                {/* HP bar — hidden when dying/defeated */}
                {!defeated && !isDying && (
                  <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(0,0,0,0.5)", marginBottom: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${enemy.hp}%`,
                      background: enemy.hp > 50 ? "#22c55e" : enemy.hp > 25 ? "#eab308" : "#ef4444",
                      borderRadius: 2,
                      transition: "width 0.15s, background 0.15s",
                    }} />
                  </div>
                )}
                {/* Enemy image */}
                <div className="relative" style={{ width: 34, height: 34 }}>
                  {/* Death ring burst */}
                  {isDying && (
                    <div style={{
                      position: "absolute",
                      left: "50%", top: "50%",
                      width: 44, height: 44,
                      borderRadius: "50%",
                      border: "3px solid rgba(255,160,0,0.9)",
                      boxShadow: "0 0 14px 4px rgba(255,80,0,0.7)",
                      animation: "kcDeathRing 0.7s ease-out forwards",
                      pointerEvents: "none",
                    }} />
                  )}
                  {/* Squish / death wrapper */}
                  <div style={{
                    width: 34, height: 34,
                    animation: isDying
                      ? "kcEnemyDeath 1.4s ease-out forwards"
                      : "kcSquish 0.9s ease-in-out infinite",
                    transformOrigin: "bottom center",
                  }}>
                  {enemy.enemyImageUrl ? (
                    <img
                      src={enemy.enemyImageUrl}
                      alt={enemy.enemyName}
                      draggable={false}
                      style={{
                        width: 34, height: 34, objectFit: "contain",
                        transform: facingLeft ? "scaleX(-1)" : undefined,
                        filter: isSwipe ? "brightness(1.6) saturate(0.6)" : undefined,
                        transition: "filter 0.12s",
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 34, height: 34, borderRadius: 6,
                      background: "rgba(239,68,68,0.3)", border: "1.5px solid #ef4444",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Swords className="w-4 h-4" style={{ color: "#ef4444" }} />
                    </div>
                  )}
                  </div>
                  {/* Hit flash — small ring */}
                  {isSwipe && (
                    <div style={{
                      position: "absolute", inset: -5, borderRadius: "50%",
                      border: "2px solid rgba(255,200,80,0.7)",
                      animation: "kcDeathRing 0.3s ease-out forwards",
                      pointerEvents: "none",
                    }} />
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Coin drop pops (map-space) ────────────────────────────── */}
          {coinPops.map(pop => (
            <div key={pop.id} style={{
              position: "absolute",
              left: `${pop.x}%`, top: `${pop.y}%`,
              transform: "translate(-50%, -120%)",
              pointerEvents: "none",
              zIndex: 50,
              display: "flex", alignItems: "center", gap: 3,
              fontFamily: "Cinzel, serif", fontSize: 13, fontWeight: 700,
              color: "#f6d860",
              textShadow: "0 0 8px rgba(246,216,96,0.8), 0 1px 3px rgba(0,0,0,0.9)",
              animation: "kcCoinPop 1.4s ease-out forwards",
              whiteSpace: "nowrap",
            }}>
              +{pop.amount}
              <img
                src={coinIconImg}
                alt="coin"
                draggable={false}
                style={{ width: 16, height: 16, objectFit: "contain", filter: "drop-shadow(0 0 4px rgba(246,216,96,0.9))" }}
              />
            </div>
          ))}

          {/* ── Pet attack scratch marks on enemy (map-space) ────────── */}
          {petAttackMarks.map(mark => (
            <div key={mark.id} style={{
              position: "absolute",
              left: `${mark.x}%`,
              top: `${mark.y}%`,
              pointerEvents: "none",
              zIndex: 46,
            }}>
              {([-9, 0, 9] as number[]).map((offset, i) => (
                <div key={i} style={{
                  position: "absolute",
                  left: `${offset}px`,
                  top: "-22px",
                  width: 4,
                  height: 44,
                  borderRadius: 3,
                  background: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.95) 25%, rgba(255,100,80,0.85) 65%, transparent 100%)",
                  boxShadow: "0 0 6px 2px rgba(255,60,60,0.55)",
                  transform: `translate(-50%, 0) rotate(${mark.angle}deg)`,
                  transformOrigin: "50% 50%",
                  animation: "kcScratch 0.55s ease-out forwards",
                  animationDelay: `${i * 45}ms`,
                }} />
              ))}
            </div>
          ))}

          {/* ── Enemy counter-attack green orb (map-space) ────────────── */}
          {enemyProjectiles.map(proj => {
            const dx = (proj.toX - proj.fromX) / 100 * MAP_W;
            const dy = (proj.toY - proj.fromY) / 100 * MAP_H_DEFAULT;
            return (
              <div
                key={proj.id}
                style={{
                  position: "absolute",
                  left: `${proj.fromX}%`,
                  top: `${proj.fromY}%`,
                  width: 18, height: 18,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #ccffcc 0%, #22cc44 50%, #006622 100%)",
                  boxShadow: "0 0 14px 6px rgba(34,200,68,0.8)",
                  pointerEvents: "none",
                  zIndex: 40,
                  transform: "translate(-50%, -50%)",
                  animation: "kcEnemyProj 0.58s ease-in forwards",
                  ["--px" as string]: `${dx}px`,
                  ["--py" as string]: `${dy}px`,
                }}
              />
            );
          })}

          {/* ── Locations (places) on the map ─────────────────────────── */}
          {[...kcLocations].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(loc => {
            const pos = locDragPos?.id === loc.id ? { x: locDragPos.x, y: locDragPos.y } : { x: loc.posX, y: loc.posY };
            const glow = loc.glowColor || "#d4a017";
            const sz = loc.iconSize || 160;
            return (
              <div
                key={loc.id}
                className="absolute flex flex-col items-center"
                draggable={false}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: sz,
                  cursor: user.isAdmin ? "grab" : (loc.isShop ? "pointer" : "default"),
                  zIndex: selectedLocId === loc.id ? 150 : locDragPos?.id === loc.id ? 200 : 10 + Math.round((pos.y / 100) * 60),
                  transform: "translate(-50%, -100%)",
                  touchAction: "none",
                  userSelect: "none",
                } as React.CSSProperties}
                onDragStart={e => e.preventDefault()}
                onPointerDown={e => handleLocPointerDown(e, loc)}
                onPointerMove={handleLocPointerMove}
                onPointerUp={handleLocPointerUp}
                onPointerCancel={() => { locDragRef.current = null; locDidDrag.current = false; setLocDragPos(null); }}
              >
                <div className="relative w-full" style={{ pointerEvents: "none" }}>
                  {loc.iconUrl ? (
                    <img
                      src={loc.iconUrl}
                      alt={loc.name}
                      draggable={false}
                      style={{
                        width: "100%",
                        objectFit: "contain",
                        transform: loc.flipped ? "scaleX(-1)" : undefined,
                        userSelect: "none",
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center" style={{ width: sz, height: sz, borderRadius: 16, background: "rgba(20,20,20,0.5)", border: "1.5px solid rgba(255,255,255,0.15)" }}>
                      <Store style={{ width: sz * 0.4, height: sz * 0.4, color: glow }} />
                    </div>
                  )}
                  {/* Click zone */}
                  <div
                    onClick={e => { e.stopPropagation(); handleLocClick(loc); }}
                    style={{ position: "absolute", inset: 0, pointerEvents: "auto", cursor: user.isAdmin ? "grab" : (loc.isShop ? "pointer" : "default"), zIndex: 20 }}
                  />
                  {/* Admin controls */}
                  {user.isAdmin && selectedLocId === loc.id && (
                    <div style={{ pointerEvents: "auto" }}>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (confirm(`Delete "${loc.name}"?`)) deleteLocMutation.mutate(loc.id); setSelectedLocId(null); }}
                        className="absolute -top-4 -left-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); flipLocMutation.mutate(loc.id); }}
                        className="absolute -top-4 -right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <FlipHorizontal className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateLocSizeMutation.mutate({ locationId: loc.id, iconSize: Math.max(60, sz - 10) }); }}
                        className="absolute -bottom-4 -left-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Minus className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateLocSizeMutation.mutate({ locationId: loc.id, iconSize: Math.min(400, sz + 10) }); }}
                        className="absolute -bottom-4 -right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Plus className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Decor placements */}
          {decorPlacements.map(p => {
            const dpos = decorDragPos?.id === p.id ? { x: decorDragPos.x, y: decorDragPos.y } : { x: p.posX, y: p.posY };
            const isPassThrough = PASS_THROUGH_SENTINELS.has(p.imageUrl);
            const isGlowOrb    = isPassThrough && p.imageUrl !== FIREFLIES_SENTINEL;
            const isFireflies  = p.imageUrl === FIREFLIES_SENTINEL;
            const FF_COUNT = 7;
            const FF_ANIMS = ["ffloat0", "ffloat1", "ffloat2"];
            return (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${dpos.x}%`, top: `${dpos.y}%`,
                  width: `${p.size}px`, height: `${p.size}px`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isPassThrough ? 300 : (decorDragPos?.id === p.id ? 200 : 10 + Math.round((Math.min(100, dpos.y + (p.size / 2 / mapH) * 100) / 100) * 60)),
                  cursor: user.isAdmin ? "grab" : "default",
                  touchAction: user.isAdmin ? "none" : "auto",
                  pointerEvents: (!user.isAdmin && isPassThrough) ? "none" : "auto",
                }}
                onPointerDown={e => handleDecorPointerDown(e, p)}
                onPointerMove={handleDecorPointerMove}
                onPointerUp={handleDecorPointerUp}
                onPointerCancel={() => { decorDragRef.current = null; decorDidDrag.current = false; setDecorDragPos(null); }}
                onClick={e => { if (user.isAdmin) { e.stopPropagation(); setSelectedDecorId(prev => prev === p.id ? null : p.id); } }}
              >
                {isGlowOrb ? (
                  <div style={{
                    width: "100%", height: "100%", borderRadius: "50%",
                    background: getOrbGradient(p.imageUrl),
                    mixBlendMode: "screen",
                    animation: "lightOrbPulse 2.4s ease-in-out infinite",
                    pointerEvents: "none",
                  }} />
                ) : isFireflies ? (
                  <div style={{ width: "100%", height: "100%", position: "relative", pointerEvents: "none" }}>
                    {Array.from({ length: FF_COUNT }, (_, i) => {
                      const fx  = seededRand(p.id, i * 3) * 80 + 10;
                      const fy  = seededRand(p.id, i * 3 + 1) * 80 + 10;
                      const fsz = 8 + seededRand(p.id, i * 3 + 2) * 6;
                      const dur = 2.8 + seededRand(p.id, i * 7 + 3) * 2.4;
                      const del = -(seededRand(p.id, i * 11 + 5) * 3);
                      return (
                        <div key={i} style={{
                          position: "absolute", left: `${fx}%`, top: `${fy}%`,
                          width: 3, height: 3, borderRadius: "50%",
                          background: "rgba(255,252,180,1)",
                          filter: "blur(0.4px)",
                          boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 10px 5px rgba(255,220,30,0.55), 0 0 24px 12px rgba(255,190,0,0.25), 0 0 48px 22px rgba(255,160,0,0.09)",
                          mixBlendMode: "screen",
                          animation: `${FF_ANIMS[i % 3]} ${dur}s ease-in-out ${del}s infinite`,
                        }} />
                      );
                    })}
                  </div>
                ) : (
                  <img
                    src={p.imageUrl} alt={p.name} draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", transform: p.flipped ? "scaleX(-1)" : undefined }}
                  />
                )}

                {user.isAdmin && selectedDecorId === p.id && (
                  <div onPointerDown={e => e.stopPropagation()} style={{ pointerEvents: "auto" }}>
                    <button onClick={e => { e.stopPropagation(); deleteDecorPlacementMutation.mutate(p.id); setSelectedDecorId(null); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ top: -16, left: -16, background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                    {!isPassThrough && (
                      <button onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, flipped: !p.flipped }); }}
                        className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ top: -16, right: -16, background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <FlipHorizontal className="w-3.5 h-3.5 text-white" />
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.max(20, p.size - 10) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -16, left: -16, background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", fontSize: 18, color: "#7fffd4" }}>
                      −
                    </button>
                    <button onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.min(600, p.size + 10) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -16, right: -16, background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", fontSize: 18, color: "#7fffd4" }}>
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── HUD overlay ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>

        {/* ── TopBar-style strip ── */}
        <div
          className="absolute left-0 right-0 pointer-events-auto flex items-start justify-between px-3 gap-3"
          style={{
            top: 0,
            paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
            paddingBottom: 8,
            background: "linear-gradient(180deg, rgba(4,10,6,0.88) 0%, rgba(4,10,6,0.55) 80%, transparent 100%)",
          }}
        >
          {/* LEFT: profile photo column + Friends btn below, then username/coins to the right */}
          <div className="flex items-start gap-2 min-w-0">
            {/* Profile photo column */}
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              {/* Profile photo */}
              <div
                className="relative"
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)",
                  flexShrink: 0,
                }}
              >
                {me?.profileImage ? (
                  <img
                    data-testid="img-kc-profile-avatar"
                    src={me.profileImage}
                    alt={me.username}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="font-fantasy font-bold" style={{ color: "#d4a017", fontSize: 18 }}>
                      {(me?.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {/* Friends button */}
              <div style={{ position: "relative" }}>
                <button
                  data-testid="button-friends-panel"
                  onClick={() => setShowFriendsPanel(p => !p)}
                  className="transition-transform active:scale-90"
                  style={{
                    width: 44, height: 36, borderRadius: 10,
                    background: showFriendsPanel ? "rgba(127,255,212,0.18)" : "rgba(4,10,6,0.82)",
                    border: `1.5px solid ${showFriendsPanel ? ACCENT + "88" : ACCENT + "44"}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${ACCENT}80)` }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </button>
                {friendRequestCount > 0 && !showFriendsPanel && (
                  <div style={{
                    position: "absolute", top: -4, right: -4,
                    width: 15, height: 15, borderRadius: "50%",
                    background: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
                    border: "1.5px solid rgba(4,10,6,0.9)",
                    boxShadow: "0 0 6px rgba(248,113,113,0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, fontWeight: "bold", color: "#fff",
                    pointerEvents: "none",
                  }}>
                    {friendRequestCount > 9 ? "9+" : friendRequestCount}
                  </div>
                )}
              </div>
            </div>

            {/* Username + coins stacked */}
            <div className="flex flex-col gap-1 min-w-0" style={{ paddingTop: 2 }}>
              <div
                className="px-2.5 py-1 rounded-md min-w-0"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.5)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,160,23,0.2)",
                  maxWidth: 120,
                }}
              >
                <p
                  className="font-fantasy text-[#f0c040] font-semibold tracking-widest truncate"
                  style={{ textShadow: "0 0 10px rgba(240,192,64,0.6)", fontSize: "clamp(9px, 2.5vw, 11px)" }}
                  data-testid="text-kc-username"
                >
                  {me?.username ?? ""}
                </p>
              </div>
              <button
                data-testid="button-kc-coin-shop"
                onClick={() => navigate("/coins")}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-transform active:scale-95 self-start"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.4)",
                  cursor: "pointer",
                }}
              >
                <img src={coinIconImg} alt="Coins" style={{ width: 14, height: 14, objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }} />
                <span
                  className="font-fantasy text-[#f0c040] font-semibold"
                  style={{ fontSize: "clamp(9px, 2.5vw, 11px)" }}
                  data-testid="text-kc-coins"
                >
                  {me?.coins ?? 0}
                </span>
                <span className="font-fantasy text-[#d4a017] text-[8px]">+</span>
              </button>
            </div>
          </div>

          {/* RIGHT: admin buttons */}
          {user.isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 2 }}>
              <button
                data-testid="button-world-places"
                onClick={() => { setShowPlacesPanel(p => !p); setShowDecorPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showPlacesPanel ? `rgba(212,160,23,0.22)` : "rgba(4,10,6,0.82)",
                  border: `2px solid #d4a01755`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <MapPin className="w-4 h-4" style={{ color: "#d4a017" }} />
              </button>
              <button
                data-testid="button-world-decor"
                onClick={() => { setShowDecorPanel(p => !p); setShowPlacesPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showDecorPanel ? `rgba(127,255,212,0.18)` : "rgba(4,10,6,0.82)",
                  border: `2px solid ${ACCENT}55`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Palette className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
              <button
                data-testid="button-world-enemies"
                onClick={() => { setShowEnemyPanel(p => !p); setShowDecorPanel(false); setShowPlacesPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showEnemyPanel ? "rgba(239,68,68,0.2)" : "rgba(4,10,6,0.82)",
                  border: "2px solid #ef444455",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Swords className="w-4 h-4" style={{ color: "#ef4444" }} />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Friends Panel ─────────────────────────────────────────────────── */}
      {showFriendsPanel && (
        <div
          className="absolute pointer-events-auto"
          style={{
            zIndex: 40,
            bottom: 0, left: 0, right: 0,
            background: "rgba(4,10,6,0.97)",
            border: `1.5px solid ${ACCENT}28`,
            borderRadius: "20px 20px 0 0",
            boxShadow: "0 -4px 40px rgba(0,0,0,0.8), 0 0 30px rgba(127,255,212,0.06)",
            maxHeight: "72vh",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 18px 12px",
            borderBottom: `1px solid ${ACCENT}18`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${ACCENT}80)` }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT }}>Friends</span>
            </div>
            <button
              data-testid="button-close-friends-panel"
              onClick={() => setShowFriendsPanel(false)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(127,255,212,0.07)",
                border: `1px solid ${ACCENT}30`,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: ACCENT,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ overflowY: "auto", padding: "12px 18px 24px", flex: 1 }}>

            {/* Pending requests */}
            {friendRequests.length > 0 && (
              <div className="space-y-2" style={{ marginBottom: 16 }}>
                <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: ACCENT, marginBottom: 8 }}>
                  Requests ({friendRequests.length})
                </p>
                {friendRequests.map((req: any) => (
                  <div
                    key={req.id}
                    data-testid={`friend-request-${req.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 10,
                      background: "rgba(127,255,212,0.06)",
                      border: "1px solid rgba(127,255,212,0.12)",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      {req.profileImage ? (
                        <img src={req.profileImage} alt={req.username}
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(127,255,212,0.3)" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(127,255,212,0.1)", border: "1px solid rgba(127,255,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: ACCENT, fontWeight: "bold" }}>{(req.username ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <span className="font-fantasy text-xs" style={{ color: "#d4e8da", flex: 1 }} data-testid={`text-request-username-${req.id}`}>{req.username}</span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        data-testid={`button-accept-request-${req.id}`}
                        onClick={() => acceptRequestMutation.mutate(req.id)}
                        disabled={acceptRequestMutation.isPending}
                        className="font-fantasy text-[10px] tracking-wider"
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80", cursor: "pointer" }}
                      >
                        Accept
                      </button>
                      <button
                        data-testid={`button-decline-request-${req.id}`}
                        onClick={() => declineRequestMutation.mutate(req.requesterId)}
                        disabled={declineRequestMutation.isPending}
                        className="font-fantasy text-[10px] tracking-wider"
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", cursor: "pointer" }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}30, transparent)`, margin: "8px 0" }} />
              </div>
            )}

            {/* Friends list */}
            <div>
              <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: ACCENT, marginBottom: 8 }}>
                My Friends ({friends.length})
              </p>
              {friends.length === 0 && friendRequests.length === 0 && (
                <p className="font-fantasy text-xs text-center" style={{ color: "#5a8070", padding: "16px 0" }} data-testid="text-no-friends">
                  No friends yet — explore the world and add some!
                </p>
              )}
              {friends.length === 0 && friendRequests.length > 0 && (
                <p className="font-fantasy text-xs text-center" style={{ color: "#5a8070", padding: "8px 0" }} data-testid="text-no-friends-yet">
                  No friends yet
                </p>
              )}
              <div className="space-y-2">
                {friends.map((f: any) => (
                  <div
                    key={f.id}
                    data-testid={`friend-row-${f.friendId}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 10,
                      background: "rgba(127,255,212,0.04)",
                      border: "1px solid rgba(127,255,212,0.1)",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      {f.profileImage ? (
                        <img src={f.profileImage} alt={f.username}
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(212,160,23,0.35)" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: "#d4a017", fontWeight: "bold" }}>{(f.username ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <span className="font-fantasy text-xs flex-1 truncate" style={{ color: "#d4e8da" }} data-testid={`text-friend-username-${f.friendId}`}>{f.username}</span>
                    <button
                      data-testid={`button-remove-friend-${f.friendId}`}
                      onClick={() => removeFriendMutation.mutate(f.friendId)}
                      disabled={removeFriendMutation.isPending}
                      className="font-fantasy text-[10px] tracking-wider"
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── World Decor Panel ────────────────────────────────────────────── */}
      {showDecorPanel && (
        <div
          className="fixed z-40 flex flex-col"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "58vh",
            background: "linear-gradient(180deg, rgba(4,10,6,0.97) 0%, rgba(6,14,7,0.99) 100%)",
            borderTop: `1.5px solid ${ACCENT}50`,
            borderLeft: `1.5px solid ${ACCENT}30`,
            borderRight: `1.5px solid ${ACCENT}30`,
            borderRadius: "16px 16px 0 0",
            boxShadow: `0 -8px 40px rgba(0,0,0,0.7), 0 0 40px ${ACCENT}15`,
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${ACCENT}25` }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}50` }}>
              World Decor
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-decor-item"
                onClick={() => setShowAddDecorForm(p => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: `${ACCENT}30`, border: `1.5px solid ${ACCENT}80`, cursor: "pointer" }}
                title="Upload custom decor"
              >
                <Plus className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
              <button onClick={() => { setShowDecorPanel(false); setShowAddDecorForm(false); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${ACCENT}88` }} />
              </button>
            </div>
          </div>

          {/* Light / effects quick-add row */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${ACCENT}18` }}>
            <span className="font-fantasy text-[9px] tracking-wider shrink-0" style={{ color: `${ACCENT}66` }}>Light:</span>
            {([
              { label: "Warm",   sentinel: LIGHT_ORB_SENTINEL,        bg: "radial-gradient(circle, rgba(255,220,100,0.75) 0%, rgba(255,150,0,0.4) 55%, transparent 80%)", border: "rgba(255,200,80,0.7)" },
              { label: "Blue",   sentinel: LIGHT_ORB_BLUE_SENTINEL,   bg: "radial-gradient(circle, rgba(120,190,255,0.75) 0%, rgba(60,120,255,0.4) 55%, transparent 80%)", border: "rgba(100,170,255,0.7)" },
              { label: "Green",  sentinel: LIGHT_ORB_GREEN_SENTINEL,  bg: "radial-gradient(circle, rgba(120,255,170,0.75) 0%, rgba(50,200,90,0.4) 55%, transparent 80%)",  border: "rgba(80,230,130,0.7)" },
              { label: "Purple", sentinel: LIGHT_ORB_PURPLE_SENTINEL, bg: "radial-gradient(circle, rgba(210,130,255,0.75) 0%, rgba(150,60,230,0.4) 55%, transparent 80%)", border: "rgba(190,100,255,0.7)" },
            ] as const).map(({ label, sentinel, bg, border }) => (
              <button key={sentinel}
                onClick={() => addDecorItemMutation.mutate({ name: `${label} Orb`, imageUrl: sentinel })}
                className="transition-transform active:scale-90"
                style={{ width: 26, height: 26, borderRadius: "50%", background: bg, border: `1.5px solid ${border}`, cursor: "pointer", flexShrink: 0 }}
                title={`Add ${label} orb`}
              />
            ))}
            {/* Fireflies */}
            <button onClick={() => addDecorItemMutation.mutate({ name: "Fireflies", imageUrl: FIREFLIES_SENTINEL })}
              className="transition-transform active:scale-90"
              style={{ width: 36, height: 26, borderRadius: 8, background: "rgba(20,20,8,0.85)", border: "1.5px solid rgba(255,220,0,0.45)", cursor: "pointer", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Add fireflies">
              {[0,1,2].map(i => (
                <div key={i} style={{
                  position: "absolute", left: `${[28,52,38][i]}%`, top: `${[40,25,62][i]}%`,
                  width: 3, height: 3, borderRadius: "50%",
                  background: "rgba(255,252,180,1)",
                  filter: "blur(0.4px)",
                  boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.6), 0 0 16px 7px rgba(255,190,0,0.25)",
                }} />
              ))}
            </button>
          </div>

          {/* Upload form */}
          {showAddDecorForm && (
            <div className="px-4 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: `1px solid ${ACCENT}18` }}>
              <input
                type="text"
                placeholder="Decor name…"
                value={newDecorName}
                onChange={e => setNewDecorName(e.target.value)}
                className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                style={{ background: "rgba(20,30,15,0.8)", border: `1px solid ${ACCENT}40`, color: ACCENT }}
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px] tracking-wider" style={{ color: `${ACCENT}80` }}>Image:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewDecorImage(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}>
                  {newDecorImage ? "✓ Loaded" : "Choose file"}
                </span>
              </label>
              <button
                onClick={() => { if (newDecorName.trim() && newDecorImage) addDecorItemMutation.mutate({ name: newDecorName.trim(), imageUrl: newDecorImage }); }}
                disabled={!newDecorName.trim() || !newDecorImage || addDecorItemMutation.isPending}
                className="font-fantasy text-xs py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: `${ACCENT}25`, border: `1.5px solid ${ACCENT}60`, color: ACCENT, cursor: "pointer" }}>
                {addDecorItemMutation.isPending ? "Saving…" : "Save Decor Item"}
              </button>
            </div>
          )}

          {/* Decor library */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {decorItems.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: `${ACCENT}55` }}>
                No decor yet — add items above then drag them onto the world
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {decorItems.map(item => {
                  const isPassThrough = PASS_THROUGH_SENTINELS.has(item.imageUrl);
                  return (
                    <div
                      key={item.id}
                      data-testid={`decor-item-${item.id}`}
                      className="relative flex flex-col items-center gap-1 rounded-xl p-2 cursor-grab active:cursor-grabbing transition-transform active:scale-95"
                      style={{ background: "rgba(10,22,12,0.8)", border: `1px solid ${ACCENT}25`, touchAction: "none" }}
                      onPointerDown={e => {
                        e.preventDefault();
                        panelDragRef.current = { item };
                        setPanelDragGhost({ clientX: e.clientX, clientY: e.clientY, item });
                      }}
                    >
                      {/* Preview */}
                      <div className="w-12 h-12 flex items-center justify-center overflow-hidden rounded-lg"
                        style={{ background: "rgba(6,14,8,0.7)" }}>
                        {isPassThrough ? (
                          item.imageUrl === FIREFLIES_SENTINEL ? (
                            <div className="relative w-10 h-10">
                              {[0,1,2,3].map(i => (
                                <div key={i} style={{
                                  position: "absolute", left: `${[20,55,35,65][i]}%`, top: `${[30,20,60,50][i]}%`,
                                  width: 3, height: 3, borderRadius: "50%",
                                  background: "rgba(255,252,180,1)",
                                  filter: "blur(0.4px)",
                                  boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.55), 0 0 18px 8px rgba(255,190,0,0.22)",
                                }} />
                              ))}
                            </div>
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: getOrbGradient(item.imageUrl) }} />
                          )
                        ) : (
                          <img src={item.imageUrl} alt={item.name} style={{ width: 44, height: 44, objectFit: "contain" }} draggable={false} />
                        )}
                      </div>
                      <span className="font-fantasy text-[9px] tracking-wide text-center leading-tight line-clamp-2"
                        style={{ color: `${ACCENT}cc` }}>
                        {item.name}
                      </span>
                      {/* Delete item */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteDecorItemMutation.mutate(item.id); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10"
                        style={{ background: "rgba(200,30,30,0.9)", border: "1.5px solid rgba(255,80,80,0.6)", cursor: "pointer" }}
                        onPointerDown={e => e.stopPropagation()}>
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Enemy Panel ─────────────────────────────────────────────── */}
      {showEnemyPanel && user.isAdmin && (
        <div
          className="fixed z-40 flex flex-col"
          style={{
            bottom: 0, left: 0, right: 0, maxHeight: "55vh",
            background: "linear-gradient(180deg, rgba(20,4,4,0.97) 0%, rgba(25,6,6,0.99) 100%)",
            borderTop: "1.5px solid #ef444450",
            borderLeft: "1.5px solid #ef444430",
            borderRight: "1.5px solid #ef444430",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 40px rgba(239,68,68,0.12)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #ef444420" }}>
            <span className="font-fantasy text-sm tracking-wider" style={{ color: "#ef4444" }}>
              <Swords className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Enemy Management
            </span>
            <button onClick={() => setShowEnemyPanel(false)} className="transition-transform active:scale-90">
              <X className="w-4 h-4" style={{ color: "#ef444499" }} />
            </button>
          </div>

          {/* Add enemy row */}
          <div className="px-4 py-3 shrink-0 flex gap-2" style={{ borderBottom: "1px solid #ef444415" }}>
            <select
              value={selectedEnemyToAdd}
              onChange={e => setSelectedEnemyToAdd(e.target.value)}
              data-testid="select-enemy-to-add"
              className="flex-1 font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
              style={{ background: "rgba(30,8,8,0.9)", border: "1px solid #ef444440", color: "#ef4444" }}
            >
              <option value="">Select enemy…</option>
              {globalEnemies.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button
              data-testid="button-spawn-enemy"
              onClick={() => selectedEnemyToAdd && addKCEnemyMutation.mutate(selectedEnemyToAdd)}
              disabled={!selectedEnemyToAdd || addKCEnemyMutation.isPending}
              className="font-fantasy text-xs px-3 py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.2)", border: "1.5px solid #ef444460", color: "#ef4444", cursor: "pointer" }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Spawned enemy list */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {kcSpawnedEnemies.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: "#ef444455" }}>
                No enemies spawned yet — select one above and press +
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {kcSpawnedEnemies.map(enemy => (
                  <div
                    key={enemy.id}
                    data-testid={`enemy-row-${enemy.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: "rgba(30,8,8,0.7)", border: "1px solid #ef444425" }}
                  >
                    {enemy.enemyImageUrl ? (
                      <img src={enemy.enemyImageUrl} alt={enemy.enemyName} style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: "#ef444430", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Swords className="w-4 h-4" style={{ color: "#ef4444" }} />
                      </div>
                    )}
                    <span className="font-fantasy text-xs flex-1" style={{ color: "#ef4444cc" }}>{enemy.enemyName}</span>
                    <span className="font-fantasy text-[10px]" style={{ color: "#ef444466" }}>
                      ({Math.round(enemy.spawnX)}%, {Math.round(enemy.spawnY)}%)
                    </span>
                    <button
                      data-testid={`button-remove-enemy-${enemy.id}`}
                      onClick={() => removeKCEnemyMutation.mutate(enemy.id)}
                      className="transition-transform active:scale-90"
                      style={{ padding: "4px 6px", borderRadius: 6, background: "rgba(200,30,30,0.25)", border: "1px solid #ef444440", cursor: "pointer" }}
                    >
                      <Trash2 className="w-3 h-3" style={{ color: "#ef4444" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Places Panel ────────────────────────────────────────────── */}
      {showPlacesPanel && user.isAdmin && (
        <div
          className="fixed z-40 flex flex-col"
          style={{
            bottom: 0, left: 0, right: 0, maxHeight: "58vh",
            background: "linear-gradient(180deg, rgba(8,7,2,0.97) 0%, rgba(12,10,3,0.99) 100%)",
            borderTop: "1.5px solid #d4a01750",
            borderLeft: "1.5px solid #d4a01730",
            borderRight: "1.5px solid #d4a01730",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 40px rgba(212,160,23,0.12)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #d4a01725" }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: "#d4a017", textShadow: "0 0 12px #d4a01750" }}>
              Places
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-place"
                onClick={() => setShowAddLocForm(p => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: "#d4a01730", border: "1.5px solid #d4a01780", cursor: "pointer" }}
                title="Add new place"
              >
                <Plus className="w-4 h-4" style={{ color: "#d4a017" }} />
              </button>
              <button onClick={() => { setShowPlacesPanel(false); setShowAddLocForm(false); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: "#d4a01788" }} />
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAddLocForm && (
            <div className="px-4 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #d4a01718" }}>
              <input
                type="text"
                placeholder="Place name…"
                value={newLocName}
                onChange={e => setNewLocName(e.target.value)}
                className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                style={{ background: "rgba(20,16,2,0.85)", border: "1px solid #d4a01740", color: "#d4a017" }}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 cursor-pointer font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>
                  Type:
                  <select
                    value={newLocType}
                    onChange={e => setNewLocType(e.target.value)}
                    className="font-fantasy text-[10px] rounded px-1 py-0.5 outline-none"
                    style={{ background: "rgba(20,16,2,0.85)", border: "1px solid #d4a01740", color: "#d4a017", cursor: "pointer" }}
                  >
                    <option value="shop">Shop</option>
                    <option value="landmark">Landmark</option>
                    <option value="battle">Battle</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 cursor-pointer font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>
                  Glow:
                  <input type="color" value={newLocGlow} onChange={e => setNewLocGlow(e.target.value)}
                    style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #d4a01750", cursor: "pointer", background: "none" }} />
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>Icon:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewLocIcon(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: "#d4a01722", border: "1px solid #d4a01750", color: "#d4a017", cursor: "pointer" }}>
                  {newLocIcon ? "✓ Loaded" : "Choose icon"}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>Owner:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewLocOwner(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: "#d4a01722", border: "1px solid #d4a01750", color: "#d4a017", cursor: "pointer" }}>
                  {newLocOwner ? "✓ Loaded" : "Owner image (optional)"}
                </span>
              </label>
              <button
                onClick={() => {
                  if (newLocName.trim()) addLocMutation.mutate({ name: newLocName.trim(), type: newLocType, iconData: newLocIcon, ownerImageData: newLocOwner, glowColor: newLocGlow });
                }}
                disabled={!newLocName.trim() || addLocMutation.isPending}
                className="font-fantasy text-xs py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: "#d4a01725", border: "1.5px solid #d4a01760", color: "#d4a017", cursor: "pointer" }}>
                {addLocMutation.isPending ? "Saving…" : "Add Place"}
              </button>
            </div>
          )}

          {/* Places list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-4" style={{ paddingRight: 80 }}>
            {kcLocations.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: "#d4a01755" }}>
                No places yet — add one above
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {kcLocations.map(loc => (
                  <div key={loc.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: "rgba(20,16,2,0.7)", border: "1px solid #d4a01725" }}>
                    {loc.iconUrl
                      ? <img src={loc.iconUrl} alt={loc.name} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, border: "1px solid #d4a01740" }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#d4a01720", border: "1px solid #d4a01740", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Store className="w-5 h-5" style={{ color: "#d4a017" }} />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-xs" style={{ color: "#d4a017" }}>{loc.name}</p>
                      <p className="font-fantasy text-[9px]" style={{ color: "#d4a01760" }}>{loc.type} · {loc.posX.toFixed(1)}%, {loc.posY.toFixed(1)}%</p>
                    </div>
                    <button onClick={() => deleteLocMutation.mutate(loc.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.8)", border: "1.5px solid rgba(255,80,80,0.6)", cursor: "pointer" }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Location Shop Panel ────────────────────────────────────────────── */}
      {showLocShop && activeLocId && (() => {
        const activeLoc = kcLocations.find(l => l.id === activeLocId);
        const glow = activeLoc?.glowColor || "#d4a017";
        return (
          <div
            className="fixed z-40 flex flex-col"
            style={{
              bottom: 0, left: 0, right: 0, maxHeight: "68vh",
              background: "linear-gradient(180deg, rgba(6,4,1,0.97) 0%, rgba(10,7,2,0.99) 100%)",
              borderTop: `1.5px solid ${glow}50`,
              borderLeft: `1.5px solid ${glow}30`,
              borderRight: `1.5px solid ${glow}30`,
              borderRadius: "16px 16px 0 0",
              boxShadow: `0 -8px 40px rgba(0,0,0,0.8), 0 0 40px ${glow}15`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${glow}25` }}>
              <div className="flex items-center gap-3">
                {activeLoc?.iconUrl && (
                  <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-lg object-contain" style={{ border: `1px solid ${glow}40` }} />
                )}
                <div>
                  <p className="font-fantasy text-sm tracking-wider" style={{ color: glow, textShadow: `0 0 10px ${glow}50` }}>
                    {activeLoc?.name || "Shop"}
                  </p>
                  {activeLoc?.description && (
                    <p className="font-fantasy text-[10px]" style={{ color: `${glow}70` }}>{activeLoc.description}</p>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowLocShop(false); setActiveLocId(null); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${glow}88` }} />
              </button>
            </div>

            {/* Shop owner */}
            {activeLoc?.ownerImageUrl && (
              <div className="flex justify-center py-3 shrink-0" style={{ borderBottom: `1px solid ${glow}18` }}>
                <img src={activeLoc.ownerImageUrl} alt="Shop Owner"
                  style={{ height: 90, objectFit: "contain", filter: `drop-shadow(0 2px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${glow}30)` }} />
              </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {locShopItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Store style={{ width: 36, height: 36, color: `${glow}50` }} />
                  <p className="font-fantasy text-xs text-center" style={{ color: `${glow}55` }}>
                    No items for sale yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {locShopItems.map(item => {
                    const img = item.hatchedImageUrl || item.eggImageUrl || item.imageUrl;
                    const rarityColor = ["", "#a0a0b0", "#4ade80", "#60a5fa", "#c084fc", "#f0c040"][Math.min(5, item.rarity ?? 0)];
                    return (
                      <div key={item.id}
                        data-testid={`shop-item-${item.id}`}
                        className="flex flex-col items-center gap-1 rounded-xl p-2 transition-transform active:scale-95 cursor-pointer"
                        style={{ background: `rgba(20,14,2,0.85)`, border: `1px solid ${glow}25`, boxShadow: rarityColor ? `0 0 8px ${rarityColor}25` : undefined }}>
                        <div className="w-14 h-14 flex items-center justify-center rounded-lg overflow-hidden"
                          style={{ background: "rgba(10,7,1,0.7)" }}>
                          {img ? <img src={img} alt={item.name} style={{ width: 52, height: 52, objectFit: "contain" }} draggable={false} />
                            : <Store style={{ width: 28, height: 28, color: `${glow}60` }} />}
                        </div>
                        <span className="font-fantasy text-[9px] tracking-wide text-center leading-tight line-clamp-2"
                          style={{ color: `${glow}cc` }}>{item.name}</span>
                        <div className="flex items-center gap-1">
                          <img src={coinIconImg} alt="coins" style={{ width: 10, height: 10, objectFit: "contain" }} />
                          <span className="font-fantasy text-[9px]" style={{ color: "#f0c040" }}>{item.price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Panel drag ghost ─────────────────────────────────────────────── */}
      {panelDragGhost && (
        <div className="fixed pointer-events-none z-50"
          style={{
            left: panelDragGhost.clientX - 28, top: panelDragGhost.clientY - 28,
            width: 56, height: 56,
            opacity: 0.85, transform: "scale(1.1)",
            filter: `drop-shadow(0 4px 14px ${ACCENT}60)`,
          }}>
          {PASS_THROUGH_SENTINELS.has(panelDragGhost.item.imageUrl) ? (
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: getOrbGradient(panelDragGhost.item.imageUrl) }} />
          ) : (
            <img src={panelDragGhost.item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
          )}
        </div>
      )}

      {/* ── Pet hit flash overlay ────────────────────────────────────────── */}
      {petHitFlash && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(220, 30, 10, 0.35)",
          pointerEvents: "none",
          zIndex: 55,
          animation: "kcHitFlash 0.28s ease-out forwards",
        }} />
      )}

      {/* ── Attack button — mirrors joystick at bottom-left ─────────────── */}
      {ownPet && liveEnemies.length > 0 && (
        <button
          data-testid="button-attack"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleAttack(); }}
          className="transition-transform active:scale-90"
          style={{
            position: "fixed",
            bottom: 108,
            left: 20,
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, rgba(30,22,6,0.9) 0%, rgba(10,8,2,0.85) 100%)",
            border: "2px solid rgba(212,160,23,0.55)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6), 0 0 12px rgba(127,255,212,0.12), inset 0 1px 0 rgba(212,160,23,0.12)",
            touchAction: "none",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            overflow: "hidden",
          }}
        >
          <img
            src={swordIconImg}
            alt="Attack"
            draggable={false}
            style={{
              width: 44, height: 44,
              objectFit: "contain",
              filter: "drop-shadow(0 0 5px rgba(127,255,212,0.6)) drop-shadow(0 0 3px rgba(212,160,23,0.7))",
              transform: "rotate(-30deg)",
            }}
          />
        </button>
      )}

      {/* ── Joystick — only shown when player has an active pet ─────────── */}
      {ownPet && (
        <Joystick onChange={handleJoystickChange} />
      )}

      {/* ── Pet detail modal ─────────────────────────────────────────────── */}
      {selectedPet && (
        <PetDetailModal
          pet={selectedPet}
          currentUserId={user.id}
          onClose={() => setSelectedPet(null)}
        />
      )}
    </div>
  );
}

// ── PetDetailModal ─────────────────────────────────────────────────────────
function PetDetailModal({
  pet,
  currentUserId,
  onClose,
}: {
  pet: WorldActivePet;
  currentUserId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const isOwnPet = pet.userId === currentUserId;

  const { data: friendStatus, isLoading: statusLoading } = useQuery<{ friendship: any | null }>({
    queryKey: ["/api/friends/status", pet.userId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/status/${pet.userId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isOwnPet,
  });

  const sendRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/request/${pet.userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", pet.userId] });
      toast({ title: "Friend request sent!", description: `Request sent to ${pet.username}.` });
    },
    onError: () => toast({ title: "Error", description: "Could not send friend request.", variant: "destructive" }),
  });

  const cancelRequestMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/friends/${pet.userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", pet.userId] });
      toast({ title: "Request cancelled", description: "Friend request unsent." });
    },
    onError: () => toast({ title: "Error", description: "Could not cancel request.", variant: "destructive" }),
  });

  const [pendingHover, setPendingHover] = useState(false);

  const rarityCount = Math.min(5, Math.max(0, pet.rarity ?? 0));
  const RARITY_COLOURS = ["", "#a0a0b0", "#4ade80", "#60a5fa", "#c084fc", "#f0c040"];
  const starColour = RARITY_COLOURS[rarityCount] ?? "#f0c040";

  const displayName = pet.petNickname || pet.name;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  const friendship = friendStatus?.friendship;
  const isFriend = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, padding: "0 24px" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div
        className="relative w-full rounded-2xl overflow-hidden animate-slide-up"
        style={{
          background: "linear-gradient(160deg, #0d1f10 0%, #0a1a0c 50%, #081408 100%)",
          border: "1.5px solid rgba(127,255,212,0.22)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.9), 0 0 60px rgba(127,255,212,0.04), inset 0 1px 0 rgba(127,255,212,0.12)",
          maxHeight: "86vh",
        }}
      >
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.45), transparent)" }} />

        {/* Close button */}
        <button
          data-testid="button-close-pet-detail"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full z-10 transition-transform active:scale-90"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(127,255,212,0.25)", color: ACCENT, fontSize: 16, cursor: "pointer" }}
        >
          ✕
        </button>

        <div className="flex flex-col items-center px-6 pt-7 pb-7 gap-4">

          {/* Pet image — large, centred */}
          <div style={{ width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {petImg ? (
              <img
                src={petImg}
                alt={displayName}
                style={{ width: 160, height: 160, objectFit: "contain", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.8)) drop-shadow(0 0 30px rgba(127,255,212,0.12))" }}
              />
            ) : (
              <div style={{ width: 160, height: 160, borderRadius: 16, background: "rgba(127,255,212,0.06)", border: "1px solid rgba(127,255,212,0.15)" }} />
            )}
          </div>

          {/* Pet name */}
          <div className="flex flex-col items-center gap-1.5">
            <p
              className="font-fantasy font-semibold text-center"
              style={{ fontSize: 20, color: ACCENT, textShadow: `0 0 16px ${ACCENT}55` }}
              data-testid="text-pet-detail-name"
            >
              {displayName}
            </p>
            {pet.petNickname && (
              <p className="font-fantasy text-[10px] tracking-widest" style={{ color: "rgba(127,255,212,0.45)" }}>{pet.name}</p>
            )}

            {/* Rarity stars */}
            {rarityCount > 0 && (
              <div className="flex gap-1 items-center">
                {Array.from({ length: rarityCount }).map((_, i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={starColour} style={{ filter: `drop-shadow(0 0 5px ${starColour}bb)` }}>
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.18), transparent)" }} />

          {/* Owner row */}
          <div className="flex flex-col items-center gap-2">
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid rgba(212,160,23,0.55)", overflow: "hidden", background: "rgba(212,160,23,0.12)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {pet.profileImage ? (
                <img src={pet.profileImage} alt={pet.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 20, color: "#d4a017", fontWeight: "bold" }}>{(pet.username ?? "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span className="font-fantasy text-sm" style={{ color: "#d4a017", textShadow: "0 0 10px rgba(212,160,23,0.35)" }} data-testid="text-pet-detail-owner">{pet.username}</span>
          </div>

          {/* Action buttons */}
          {isOwnPet ? (
            <p className="font-fantasy text-[11px] tracking-widest" style={{ color: "rgba(127,255,212,0.35)" }}>Your pet</p>
          ) : (
            <div className="flex items-center gap-3 w-full justify-center">
              {/* Add Friend / status */}
              {statusLoading ? (
                <div style={{ color: "rgba(127,255,212,0.5)", fontSize: 11 }} className="font-fantasy">Loading...</div>
              ) : isFriend ? (
                <div
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full"
                  style={{ background: "rgba(127,255,212,0.08)", border: "1px solid rgba(127,255,212,0.3)", color: ACCENT }}
                  data-testid="status-already-friends"
                >
                  ✓ Friends
                </div>
              ) : isPending ? (
                <button
                  data-testid="button-request-pending"
                  onClick={() => cancelRequestMutation.mutate()}
                  disabled={cancelRequestMutation.isPending}
                  onMouseEnter={() => setPendingHover(true)}
                  onMouseLeave={() => setPendingHover(false)}
                  onTouchStart={() => setPendingHover(true)}
                  onTouchEnd={() => setPendingHover(false)}
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: pendingHover ? "rgba(220,80,80,0.15)" : "rgba(240,192,64,0.08)",
                    border: `1px solid ${pendingHover ? "rgba(220,80,80,0.45)" : "rgba(240,192,64,0.3)"}`,
                    color: pendingHover ? "#f08080" : "#f0c040",
                    cursor: cancelRequestMutation.isPending ? "default" : "pointer",
                  }}
                >
                  {cancelRequestMutation.isPending ? "..." : pendingHover ? "✕ Unsend" : "⏳ Pending"}
                </button>
              ) : (
                <button
                  data-testid="button-add-friend"
                  onClick={() => sendRequestMutation.mutate()}
                  disabled={sendRequestMutation.isPending}
                  className="font-fantasy text-sm tracking-wider px-5 py-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(45,154,100,0.65) 0%, rgba(20,100,60,0.65) 100%)",
                    border: "1.5px solid rgba(127,255,212,0.45)",
                    color: ACCENT,
                    cursor: sendRequestMutation.isPending ? "default" : "pointer",
                    boxShadow: "0 0 14px rgba(127,255,212,0.1)",
                  }}
                >
                  {sendRequestMutation.isPending ? "Sending..." : "+ Add Friend"}
                </button>
              )}

              {/* Visit Pet House button */}
              <button
                data-testid="button-visit-pet-house"
                onClick={() => { onClose(); navigate(`/visit/${pet.userId}`); }}
                className="flex flex-col items-center gap-1 transition-transform active:scale-90"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "rgba(4,10,6,0.7)",
                  border: "1.5px solid rgba(212,160,23,0.4)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                }}>
                  <img src={petHouseIconImg} alt="Pet House" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(212,160,23,0.7)" }}>Pet House</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WorldRoamingPet ────────────────────────────────────────────────────────
// Renders a single user's active pet inside the map canvas so it pans with
// the world. posX/posY are percentages of the map canvas dimensions.
function WorldRoamingPet({
  pet,
  posX,
  posY,
  isOwn,
  isMoving,
  isPouncing,
  onTap,
}: {
  pet: WorldActivePet;
  posX: number;
  posY: number;
  isOwn: boolean;
  isMoving: boolean;
  isPouncing: boolean;
  onTap: () => void;
}) {
  const { data: templateData } = useQuery<{
    parts: Array<{ partType: string; posY: number; height: number; posX: number; width: number; view: string }>;
    facing: string;
    canFly: boolean;
  }>({
    queryKey: ["/api/pet-template-parts", pet.petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${pet.petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!pet.petTemplateId,
    staleTime: Infinity,
  });

  const hasWings = !!(templateData?.canFly);

  // Compute the tight bounding box of the pet's actual visible parts so we can
  // position the name badge exactly above the head and stars exactly below the feet.
  const CANVAS_SIZE = 1000;
  const facing = templateData?.facing ?? "front";
  const allParts = templateData?.parts ?? [];
  const frontCount = allParts.filter(p => p.view === "front").length;
  const backCount  = allParts.filter(p => p.view === "back").length;
  const resolvedView = facing === "back" ? "back" : (frontCount === 0 && backCount > 0) ? "back" : "front";
  const visibleParts = allParts.filter(p => p.view === resolvedView);

  // minTopFrac / maxBotFrac are fractions of sz (0–1) for the top and bottom
  // of the pet's actual visual body. Fall back to sensible defaults while loading.
  const rawMinTopFrac = visibleParts.length > 0
    ? Math.min(...visibleParts.map(p => p.posY / CANVAS_SIZE))
    : 0.15;
  const rawMaxBotFrac = visibleParts.length > 0
    ? Math.max(...visibleParts.map(p => (p.posY + p.height) / CANVAS_SIZE))
    : 0.85;

  // PetAnimator scales large-style parts (≥500px) at 0.3× from center center.
  // Apply the same correction here so badge/shadow track the visual body, not the raw coords.
  const isLargeStyle = visibleParts.some(p => p.width >= 500 || p.height >= 500);
  const partScale = isLargeStyle ? 0.3 : 1;
  const minTopFrac = 0.5 + (rawMinTopFrac - 0.5) * partScale;
  const maxBotFrac = 0.5 + (rawMaxBotFrac - 0.5) * partScale;

  // sz is in map-canvas pixels. Kept small so pets are always in reach.
  const sz     = 120;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const displayName = pet.petNickname || pet.name;

  // Seeded per-pet so each pet drifts and bobs at a unique phase/speed
  const seed = (pet.userId.charCodeAt(0) + pet.userId.charCodeAt(1) * 31) & 0xffff;
  const driftIdx           = seed % 6;
  const driftDuration      = `${90 + (seed % 50)}s`;
  const driftDelay         = `-${(seed % 80).toFixed(0)}s`;
  const floatDuration      = hasWings ? `${5 + (seed % 20) / 10}s` : `${2.8 + (seed % 30) / 30}s`;
  const floatDelay         = `-${((seed % 50) / 50 * 4.0).toFixed(2)}s`;
  const floatAnim          = hasWings ? "petFloatSmall" : "petGroundFloat";

  return (
    <div
      className="absolute"
      style={{
        left: `${posX}%`,
        top:  `${posY}%`,
        transform: "translate(-50%, -100%)",
        zIndex: 11 + Math.round((posY / 100) * 60),
        pointerEvents: "none",
        userSelect: "none",
        // Smooth glide between SSE position updates for other players' pets;
        // own pet is already smooth via RAF so no transition needed.
        transition: isOwn ? undefined : "left 1.8s linear, top 1.8s linear",
      }}
    >
      {/* Idle drift — wanders slowly around the map; linear so speed stays constant */}
      <div style={{ animation: isOwn ? undefined : `petWorldIdleDrift${driftIdx} ${driftDuration} ${driftDelay} linear infinite` }}>
      {/* Idle float — single up-down wave; own pet uses bounce/pounce instead */}
      <div style={{
        animation: isOwn
          ? isPouncing
            ? "kcPetPounce 0.3s ease-out"
            : isMoving
              ? "kcPetWalkBounce 0.32s ease-in-out infinite"
              : undefined
          : `${floatAnim} ${floatDuration} ease-in-out ${floatDelay} infinite ${hasWings ? "alternate" : ""}`,
      }}>
          {/* Single position:relative box (sz × sz map-pixels).
              Badge and stars are absolutely positioned using the pet's ACTUAL
              bounding box (minTopFrac / maxBotFrac) computed from the real part
              coordinates — no guessing, no invisible-box problem. */}
          <div style={{ position: "relative", width: sz, height: sz, pointerEvents: "none" }}>

            {/* Pet sprite */}
            {pet.petTemplateId ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="idle"
                size={sz}
                style={{
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              />
            ) : petImg ? (
              <img
                src={petImg}
                alt={displayName}
                draggable={false}
                style={{
                  width: sz, height: sz,
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {/* Username badge — sits just above the topmost visible part */}
            <span
              className="font-fantasy tracking-wide"
              style={{
                position: "absolute",
                top: Math.round(minTopFrac * sz) - 4,
                left: "50%",
                transform: "translate(-50%, -100%)",
                fontSize: Math.round(sz * 0.032),
                padding: `${Math.round(sz * 0.008)}px ${Math.round(sz * 0.022)}px`,
                borderRadius: 999,
                background: "rgba(4,10,6,0.82)",
                border: "1px solid rgba(127,255,212,0.30)",
                color: "#7fffd4",
                textShadow: "0 0 8px rgba(127,255,212,0.55)",
                backdropFilter: "blur(4px)",
                whiteSpace: "nowrap",
                zIndex: 2,
              }}
            >
              {pet.username}
            </span>


            {/* Ground shadow — at the very bottom of the visible body */}
            {!hasWings && (
              <div
                style={{
                  position: "absolute",
                  top: Math.round(maxBotFrac * sz) - Math.round(sz * 0.01),
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: Math.round(sz * 0.5),
                  height: Math.max(3, Math.round(sz * 0.04)),
                  background: "rgba(0,0,0,0.22)",
                  borderRadius: "50%",
                  filter: `blur(${Math.max(2, Math.round(sz * 0.03))}px)`,
                }}
              />
            )}

            {/* Tap zone — tapping a pet opens their profile.
                data-petid is read by the viewport pointer-up handler (setPointerCapture
                intercepts all pointer events on mobile, so onClick alone is unreliable). */}
            <div
              data-petid={pet.userId}
              onClick={onTap}
              style={{
                position: "absolute",
                left: "50%",
                top: Math.round(((minTopFrac + maxBotFrac) / 2) * sz),
                width: Math.round(sz * 0.7),
                height: Math.round((maxBotFrac - minTopFrac) * sz),
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                pointerEvents: "auto",
                cursor: "pointer",
              }}
            />
          </div>
      </div>
      </div>
    </div>
  );
}

// ── Joystick ────────────────────────────────────────────────────────────────
// Virtual analog stick for walking the player's pet around the map.
// Positioned bottom-left so it never overlaps the bottom-right FloatingNav button.
const BASE_R  = 52;
const THUMB_R = 22;

function Joystick({ onChange }: { onChange: (dx: number, dy: number, active: boolean) => void }) {
  const baseRef  = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const pidRef   = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const release = (pointerId: number) => {
    if (pidRef.current !== pointerId) return;
    pidRef.current = null;
    if (thumbRef.current) thumbRef.current.style.transform = "translate(-50%, -50%)";
    onChange(0, 0, false);
  };

  const move = (cx: number, cy: number) => {
    let dx = cx - centerRef.current.x;
    let dy = cy - centerRef.current.y;
    const dist   = Math.hypot(dx, dy);
    const maxDist = BASE_R - THUMB_R;
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    if (thumbRef.current) thumbRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onChange(dx / maxDist, dy / maxDist, true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pidRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pidRef.current = e.pointerId;
    const rect = baseRef.current!.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    move(e.clientX, e.clientY);
  };

  return (
    <div
      ref={baseRef}
      data-testid="joystick-base"
      onPointerDown={onPointerDown}
      onPointerMove={e => { if (e.pointerId === pidRef.current) move(e.clientX, e.clientY); }}
      onPointerUp={e => release(e.pointerId)}
      onPointerCancel={e => release(e.pointerId)}
      style={{
        position: "fixed",
        bottom: 108,
        right: 20,
        width: BASE_R * 2,
        height: BASE_R * 2,
        borderRadius: "50%",
        background: "rgba(4,12,6,0.52)",
        border: "2px solid rgba(127,255,212,0.35)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(127,255,212,0.1)",
        touchAction: "none",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Crosshair guides */}
      <div style={{ position: "absolute", width: "60%", height: 1, background: "rgba(127,255,212,0.15)" }} />
      <div style={{ position: "absolute", width: 1, height: "60%", background: "rgba(127,255,212,0.15)" }} />
      {/* Thumb */}
      <div
        ref={thumbRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: THUMB_R * 2,
          height: THUMB_R * 2,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, rgba(127,255,212,0.75) 0%, rgba(50,160,100,0.55) 60%, rgba(20,80,50,0.4) 100%)",
          border: "1.5px solid rgba(127,255,212,0.65)",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 2px 10px rgba(127,255,212,0.35)",
          pointerEvents: "none",
          transition: "box-shadow 0.1s",
        }}
      />
    </div>
  );
}
