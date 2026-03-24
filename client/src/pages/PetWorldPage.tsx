import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, FlipHorizontal, Palette } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import PetAnimator from "@/components/PetAnimator";
import bgGround from "@assets/pw_ground_layer.png";

const WORLD_ID = "pet_world";
const ACCENT = "#7fffd4";
const MAP_W = 1080;
const MAP_H_DEFAULT = 1920;

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

interface PetWorldPageProps {
  user: { id: string; isAdmin: boolean };
  onClose: () => void;
}

export default function PetWorldPage({ user, onClose }: PetWorldPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // ── decor drag state ───────────────────────────────────────────────────────
  const areaRef          = useRef<HTMLDivElement>(null);
  const decorDragRef     = useRef<{ placementId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const decorDidDrag     = useRef(false);
  const panelDragRef     = useRef<{ item: DecorItem } | null>(null);

  const [decorDragPos,   setDecorDragPos]   = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [panelDragGhost, setPanelDragGhost] = useState<{ clientX: number; clientY: number; item: DecorItem } | null>(null);

  // ── panel state ────────────────────────────────────────────────────────────
  const [showDecorPanel,   setShowDecorPanel]   = useState(false);
  const [showAddDecorForm, setShowAddDecorForm] = useState(false);
  const [newDecorName,     setNewDecorName]     = useState("");
  const [newDecorImage,    setNewDecorImage]    = useState<string | null>(null);

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

  const { data: worldPets = [] } = useQuery<WorldActivePet[]>({
    queryKey: ["/api/world/pet_world/active-pets"],
    queryFn: async () => {
      const res = await fetch(`/api/world/pet_world/active-pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
  });

  const [selectedPet, setSelectedPet] = useState<WorldActivePet | null>(null);

  // ── pet drag on the map canvas ─────────────────────────────────────────────
  const petDragRef  = useRef<{ userId: string; startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const petDidDrag  = useRef(false);
  const [petDragPos, setPetDragPos] = useState<{ userId: string; posX: number; posY: number } | null>(null);

  const savePetPositionMutation = useMutation({
    mutationFn: async (data: { ownerUserId: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", "/api/world/pet_world/pet-position", data);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      // Update cache optimistically so position is stable on next refetch
      queryClient.setQueryData<WorldActivePet[]>(["/api/world/pet_world/active-pets"], old =>
        old ? old.map(p => p.userId === vars.ownerUserId ? { ...p, posX: vars.posX, posY: vars.posY } : p) : old
      );
    },
  });

  // ── seeded default positions — spread pets across the full map canvas ───────
  const petDefaultPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    worldPets.forEach((pet, idx) => {
      // If server gave us a stored position, use it; otherwise seed a default
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
          x: 8 + rng(1) * 80,   // 8% – 88% across the map width
          y: 30 + rng(2) * 38,  // 30% – 68% — spread across the visible portion
        });
      }
    });
    return map;
  }, [worldPets]);

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
    // Start at cover scale so the world fills the frame without zooming in extra
    const initSc  = coverSc;
    const ix = (FRAME_W - MAP_W * initSc) / 2;
    const iy = (FRAME_H - mapHRef.current * initSc) / 2;
    mapTransformRef.current = { x: ix, y: iy, scale: initSc };
    setMapX(ix); setMapY(iy); setMapScale(initSc);
  }, [mapH]);

  // ── clamp + apply ──────────────────────────────────────────────────────────
  const applyMapTransform = useCallback((x: number, y: number, sc: number) => {
    const coverSc  = Math.max(FRAME_W / MAP_W, FRAME_H / mapHRef.current);
    // Minimum is cover scale (background always fills the frame), max 2.5x zoom in
    const clampedSc = Math.max(coverSc, Math.min(coverSc * 2.5, sc));
    const mw = MAP_W * clampedSc;
    const mh = mapHRef.current * clampedSc;
    const cx = mw <= FRAME_W ? (FRAME_W - mw) / 2 : Math.max(FRAME_W - mw, Math.min(0, x));
    const cy = mh <= FRAME_H ? (FRAME_H - mh) / 2 : Math.max(FRAME_H - mh, Math.min(0, y));
    mapTransformRef.current = { x: cx, y: cy, scale: clampedSc };
    setMapX(cx); setMapY(cy); setMapScale(clampedSc);
  }, []);

  // ── pan + pinch-to-zoom pointer handlers ──────────────────────────────────
  const handleVpPointerDown = useCallback((e: React.PointerEvent) => {
    if (decorDragRef.current) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (mapPanPointersRef.current.size === 1) {
      // Single finger — prepare for pan
      mapPanStartRef.current = { x: e.clientX, y: e.clientY, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
      mapPanningRef.current = false;
      pinchStartRef.current = null;
    } else if (mapPanPointersRef.current.size === 2) {
      // Second finger joined — switch to pinch mode
      mapPanStartRef.current = null;
      const pts = Array.from(mapPanPointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchStartRef.current = {
        dist,
        scale: mapTransformRef.current.scale,
        midX, midY,
        mapX: mapTransformRef.current.x,
        mapY: mapTransformRef.current.y,
      };
    }
  }, []);

  const handleVpPointerMove = useCallback((e: React.PointerEvent) => {
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (mapPanPointersRef.current.size === 2 && pinchStartRef.current) {
      // Pinch-to-zoom
      const pts = Array.from(mapPanPointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const newScale = pinchStartRef.current.scale * (dist / pinchStartRef.current.dist);
      // Keep the pinch midpoint anchored in world space
      const { midX, midY, mapX, mapY, scale: startScale } = pinchStartRef.current;
      const curMidX = (pts[0].x + pts[1].x) / 2;
      const curMidY = (pts[0].y + pts[1].y) / 2;
      const newX = curMidX - (midX - mapX) * (newScale / startScale);
      const newY = curMidY - (midY - mapY) * (newScale / startScale);
      applyMapTransform(newX, newY, newScale);
      mapJustPannedRef.current = true;
    } else if (mapPanPointersRef.current.size === 1 && mapPanStartRef.current) {
      // Single-finger pan
      const dx = e.clientX - mapPanStartRef.current.x;
      const dy = e.clientY - mapPanStartRef.current.y;
      if (!mapPanningRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) mapPanningRef.current = true;
      if (mapPanningRef.current) applyMapTransform(mapPanStartRef.current.mapX + dx, mapPanStartRef.current.mapY + dy, mapTransformRef.current.scale);
    }
  }, [applyMapTransform]);

  const handleVpPointerUp = useCallback((e: React.PointerEvent) => {
    mapPanPointersRef.current.delete(e.pointerId);
    if (mapPanPointersRef.current.size === 0) {
      if (mapPanningRef.current) { mapJustPannedRef.current = true; setTimeout(() => { mapJustPannedRef.current = false; }, 80); }
      mapPanStartRef.current = null;
      mapPanningRef.current = false;
      pinchStartRef.current = null;
    } else if (mapPanPointersRef.current.size === 1) {
      // One finger lifted — resume single-finger pan from current position
      pinchStartRef.current = null;
      const [pt] = Array.from(mapPanPointersRef.current.values());
      mapPanStartRef.current = { x: pt.x, y: pt.y, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
      mapPanningRef.current = false;
      setTimeout(() => { mapJustPannedRef.current = false; }, 80);
    }
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
    }
    setDecorDragPos(null);
  }, [decorDragPos, updateDecorPlacementMutation]);

  // ── pet drag on map canvas ────────────────────────────────────────────────
  const handlePetPointerDown = useCallback((e: React.PointerEvent, pet: WorldActivePet, resolvedPosX: number, resolvedPosY: number) => {
    e.stopPropagation();
    e.preventDefault();
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    petDidDrag.current = false;
    petDragRef.current = { userId: pet.userId, startX: e.clientX, startY: e.clientY, startPosX: resolvedPosX, startPosY: resolvedPosY };
  }, []);

  const handlePetPointerMove = useCallback((e: React.PointerEvent) => {
    if (!petDragRef.current) return;
    e.stopPropagation();
    const sc = mapTransformRef.current.scale;
    const dx = e.clientX - petDragRef.current.startX;
    const dy = e.clientY - petDragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) petDidDrag.current = true;
    const newPosX = Math.max(2, Math.min(97, petDragRef.current.startPosX + (dx / sc) / MAP_W * 100));
    const newPosY = Math.max(3, Math.min(95, petDragRef.current.startPosY + (dy / sc) / mapHRef.current * 100));
    setPetDragPos({ userId: petDragRef.current.userId, posX: newPosX, posY: newPosY });
  }, []);

  const handlePetPointerUp = useCallback((e: React.PointerEvent, pet: WorldActivePet) => {
    if (!petDragRef.current || petDragRef.current.userId !== pet.userId) return;
    e.stopPropagation();
    const wasDrag = petDidDrag.current;
    const finalPos = petDragPos && petDragPos.userId === pet.userId ? { ...petDragPos } : null;
    petDragRef.current = null;
    petDidDrag.current = false;
    if (wasDrag && finalPos) {
      savePetPositionMutation.mutate({ ownerUserId: pet.userId, posX: finalPos.posX, posY: finalPos.posY });
    } else if (!wasDrag) {
      setSelectedPet(pet);
    }
    setPetDragPos(null);
  }, [petDragPos, savePetPositionMutation]);

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
          onClick={() => { if (user.isAdmin) setSelectedDecorId(null); }}
        >
          {/* ── Roaming pets — inside the map canvas so they pan with the world ── */}
          {worldPets.map((pet, idx) => {
            const stored = petDefaultPositions.get(pet.userId) ?? { x: 50, y: 70 };
            const drag = petDragPos?.userId === pet.userId ? petDragPos : null;
            const resolvedX = drag ? drag.posX : stored.x;
            const resolvedY = drag ? drag.posY : stored.y;
            const isDragging = drag !== null;
            return (
              <WorldRoamingPet
                key={pet.userId}
                pet={pet}
                index={idx}
                posX={resolvedX}
                posY={resolvedY}
                isDragging={isDragging}
                onPointerDown={e => handlePetPointerDown(e, pet, stored.x, stored.y)}
                onPointerMove={handlePetPointerMove}
                onPointerUp={e => handlePetPointerUp(e, pet)}
              />
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
                  zIndex: isPassThrough ? 300 : (decorDragPos?.id === p.id ? 200 : 8),
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
                          width: fsz, height: fsz, borderRadius: "50%",
                          background: "radial-gradient(circle, rgba(255,230,30,0.48) 0%, rgba(255,210,0,0.1) 52%, transparent 72%)",
                          boxShadow: `0 0 ${fsz}px ${fsz * 0.5}px rgba(255,215,0,0.2)`,
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
        {/* Close button — top-left */}
        <button
          data-testid="button-close-pet-world"
          onClick={onClose}
          className="absolute pointer-events-auto transition-transform active:scale-90"
          style={{
            top: "max(14px, env(safe-area-inset-top, 14px))",
            left: 14,
            width: 40, height: 40, borderRadius: 12,
            background: "rgba(4,10,6,0.88)",
            border: "1.5px solid rgba(127,255,212,0.35)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.7), inset 0 0 8px rgba(127,255,212,0.06)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X className="w-5 h-5" style={{ color: ACCENT }} />
        </button>

        {/* Title — top-center */}
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}>
          <div className="px-4 py-1.5 rounded-xl font-fantasy text-xs tracking-widest"
            style={{
              background: "rgba(4,10,6,0.85)",
              border: "1.5px solid rgba(127,255,212,0.28)",
              boxShadow: "0 2px 16px rgba(0,0,0,0.7), 0 0 20px rgba(127,255,212,0.08)",
              color: ACCENT,
              textShadow: `0 0 14px ${ACCENT}60`,
            }}>
            Keeper's Central
          </div>
        </div>

        {/* Admin: World Decor button — top-right */}
        {user.isAdmin && (
          <button
            data-testid="button-world-decor"
            onClick={() => setShowDecorPanel(p => !p)}
            className="absolute pointer-events-auto transition-transform active:scale-90"
            style={{
              top: "max(14px, env(safe-area-inset-top, 14px))",
              right: 14,
              width: 40, height: 40, borderRadius: 12,
              background: showDecorPanel ? `rgba(127,255,212,0.18)` : "rgba(4,10,6,0.88)",
              border: `1.5px solid ${ACCENT}55`,
              boxShadow: "0 2px 12px rgba(0,0,0,0.7)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Palette className="w-5 h-5" style={{ color: ACCENT }} />
          </button>
        )}

        {/* Depth hint — small indicator at bottom centre */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <div className="font-fantasy text-[9px] tracking-widest px-3 py-1 rounded-full"
            style={{
              color: `${ACCENT}55`,
              background: "rgba(4,10,6,0.55)",
              border: `1px solid ${ACCENT}20`,
            }}>
            drag to explore · pinch to zoom
          </div>
        </div>
      </div>

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
                  width: 4, height: 4, borderRadius: "50%",
                  background: "rgba(255,228,30,0.6)",
                  boxShadow: "0 0 4px 2px rgba(255,210,0,0.3)",
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
                                  width: 5, height: 5, borderRadius: "50%",
                                  background: "rgba(255,228,30,0.7)", boxShadow: "0 0 6px 2px rgba(255,210,0,0.4)",
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

  const { data: ownerBadges } = useQuery<Array<{ badgeId: string; name: string; imageUrl: string }>>({
    queryKey: ["/api/users", pet.userId, "badges"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${pet.userId}/badges`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sendRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/request/${pet.userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", pet.userId] });
      toast({ title: "Friend request sent!", description: `Request sent to ${pet.username}.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not send friend request.", variant: "destructive" });
    },
  });

  const rarityCount = Math.min(5, Math.max(0, pet.rarity ?? 0));
  const starColour =
    rarityCount >= 5 ? "#e040fb" :
    rarityCount >= 4 ? "#ff9800" :
    rarityCount >= 3 ? "#7fffd4" :
    "#f0c040";

  const displayName = pet.petNickname || pet.name;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  const friendship = friendStatus?.friendship;
  const isFriend = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl animate-slide-up overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0b1a0d 0%, #122015 60%, #0b1a0d 100%)",
          border: "1px solid rgba(127,255,212,0.3)",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(127,255,212,0.2)",
          maxHeight: "70vh",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl" style={{ background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.5), transparent)" }} />

        <button
          data-testid="button-close-pet-detail"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full z-10"
          style={{ background: "rgba(127,255,212,0.12)", border: "1px solid rgba(127,255,212,0.35)", color: ACCENT, fontSize: 18, cursor: "pointer" }}
        >
          ✕
        </button>

        <div className="px-6 pt-6 pb-8 flex flex-col gap-4">
          {/* Pet sprite — large, centred */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative flex-shrink-0" style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {petImg ? (
                <img src={petImg} alt={displayName} style={{ width: 200, height: 200, objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.7))" }} />
              ) : (
                <div style={{ width: 200, height: 200, borderRadius: 16, background: "rgba(127,255,212,0.08)", border: "1px solid rgba(127,255,212,0.2)" }} />
              )}
            </div>

            {/* Name */}
            <p
              className="font-fantasy text-[#7fffd4] font-semibold text-center"
              style={{ fontSize: 18, textShadow: "0 0 12px rgba(127,255,212,0.6)" }}
              data-testid="text-pet-detail-name"
            >
              {displayName}
            </p>
            {pet.petNickname && (
              <p className="font-fantasy text-[#a89878] text-xs text-center -mt-2">{pet.name}</p>
            )}

            {/* Rarity stars */}
            {rarityCount > 0 && (
              <div className="flex gap-1 items-center justify-center">
                {Array.from({ length: rarityCount }).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={starColour} style={{ filter: `drop-shadow(0 0 4px ${starColour}99)` }}>
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                ))}
              </div>
            )}

            {/* Owner */}
            <div className="flex items-center gap-2">
              {pet.profileImage ? (
                <img src={pet.profileImage} alt={pet.username} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(212,160,23,0.5)" }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(212,160,23,0.2)", border: "2px solid rgba(212,160,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 15, color: "#d4a017", fontWeight: "bold" }}>{pet.username.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <span className="font-fantasy text-[#d4a017] text-sm" data-testid="text-pet-detail-owner">{pet.username}</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.25), transparent)" }} />

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Level", value: pet.petLevel ?? 1, colour: "#f0c040" },
              { label: "HP", value: pet.petHealth ?? "—", colour: "#4ade80" },
              { label: "ATK", value: pet.petAtk ?? "—", colour: "#f87171" },
              { label: "DEF", value: pet.petDef ?? "—", colour: "#60a5fa" },
            ].map(({ label, value, colour }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 py-2 rounded-xl"
                style={{ background: "rgba(127,255,212,0.05)", border: "1px solid rgba(127,255,212,0.12)" }}
                data-testid={`stat-${label.toLowerCase()}`}
              >
                <span className="font-fantasy font-bold" style={{ fontSize: 16, color: colour, textShadow: `0 0 8px ${colour}80` }}>{value}</span>
                <span className="font-fantasy text-[#7a9080] uppercase tracking-widest" style={{ fontSize: 9 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Owner badges */}
          {ownerBadges && ownerBadges.length > 0 && (
            <>
              <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.25), transparent)" }} />
              <div className="flex flex-col gap-2">
                <p className="font-fantasy text-[#7a9080] uppercase tracking-widest text-center" style={{ fontSize: 9 }}>Badges</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {ownerBadges.map((badge) => (
                    <div key={badge.badgeId} className="flex flex-col items-center gap-1" style={{ maxWidth: 52 }}>
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: "rgba(127,255,212,0.07)",
                          border: "1.5px solid rgba(127,255,212,0.28)",
                          boxShadow: "0 0 10px rgba(127,255,212,0.12)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img src={badge.imageUrl} alt={badge.name} style={{ width: 36, height: 36, objectFit: "contain" }} />
                      </div>
                      <span className="font-fantasy text-[#7fffd4] text-center leading-tight" style={{ fontSize: 8, opacity: 0.75 }}>{badge.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Add Friend / Friend status button */}
          {!isOwnPet && (
            <div className="flex justify-center mt-1">
              {statusLoading ? (
                <div style={{ color: "#7fffd4", fontSize: 12 }} className="font-fantasy">Loading...</div>
              ) : isFriend ? (
                <div
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full"
                  style={{ background: "rgba(127,255,212,0.1)", border: "1px solid rgba(127,255,212,0.35)", color: "#7fffd4" }}
                  data-testid="status-already-friends"
                >
                  ✓ Friends
                </div>
              ) : isPending ? (
                <div
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full"
                  style={{ background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.35)", color: "#f0c040" }}
                  data-testid="status-request-pending"
                >
                  Request Pending
                </div>
              ) : (
                <button
                  data-testid="button-add-friend"
                  onClick={() => sendRequestMutation.mutate()}
                  disabled={sendRequestMutation.isPending}
                  className="font-fantasy text-sm tracking-wider px-6 py-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: sendRequestMutation.isPending
                      ? "rgba(127,255,212,0.08)"
                      : "linear-gradient(135deg, rgba(45,154,100,0.7) 0%, rgba(20,100,60,0.7) 100%)",
                    border: "1.5px solid rgba(127,255,212,0.5)",
                    color: "#7fffd4",
                    cursor: sendRequestMutation.isPending ? "default" : "pointer",
                    boxShadow: "0 0 12px rgba(127,255,212,0.15)",
                  }}
                >
                  {sendRequestMutation.isPending ? "Sending..." : "+ Add Friend"}
                </button>
              )}
            </div>
          )}
          {isOwnPet && (
            <p className="font-fantasy text-center text-[#6a8a78] text-xs tracking-wider">Your pet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WorldRoamingPet ────────────────────────────────────────────────────────
// Renders a single user's active pet inside the map canvas so it pans with
// the world. posX/posY are percentages of the map canvas dimensions.
// The wander animation applies a small wandering offset around the base
// position; dragging lets the owner reposition their pet anywhere on the map.
function WorldRoamingPet({
  pet,
  index,
  posX,
  posY,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pet: WorldActivePet;
  index: number;
  posX: number;
  posY: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
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
  const minTopFrac = visibleParts.length > 0
    ? Math.min(...visibleParts.map(p => p.posY / CANVAS_SIZE))
    : 0.15;
  const maxBotFrac = visibleParts.length > 0
    ? Math.max(...visibleParts.map(p => (p.posY + p.height) / CANVAS_SIZE))
    : 0.85;

  // Use a deterministic per-pet animation variant based on the index
  const wanderIdx = index % 6;
  const wanderPrefix = hasWings ? "petWander" : "petWorldGroundWander";
  const floatAnim   = hasWings ? "petFloatSmall" : "petGroundFloat";

  // Seeded timing so each pet has a slightly different wander cadence
  const seedBase = (index + 1) * 2741;
  const rng = (n: number) => {
    let h = Math.imul(Math.floor(seedBase * 10000 + n), 0x9e3779b9);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  const duration = `${34 + rng(3) * 16}s`;
  const delay    = `-${rng(4) * 20}s`;

  // sz is in map-canvas pixels. At typical map scale (≈0.44–0.78×) this
  // renders the pet at a comfortable 150–270 px on screen.
  const sz     = 185;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const displayName = pet.petNickname || pet.name;

  return (
    <div
      className="absolute"
      style={{
        left: `${posX}%`,
        top:  `${posY}%`,
        transform: "translate(-50%, -100%)",
        zIndex: hasWings ? 15 : 10,
        pointerEvents: "none",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Wander animation — suppressed while dragging */}
      <div
        style={{
          animation: isDragging ? "none" : `${wanderPrefix}${wanderIdx} ${duration} ${delay} ease-in-out infinite`,
          transformOrigin: "bottom center",
        }}
      >
        <div style={hasWings && !isDragging ? { animation: `${floatAnim} 3.2s ease-in-out infinite` } : undefined}>

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
                  filter: `drop-shadow(0 ${Math.round(sz * 0.04)}px ${Math.round(sz * 0.06)}px rgba(0,0,0,0.55))`,
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
                  filter: `drop-shadow(0 ${Math.round(sz * 0.03)}px ${Math.round(sz * 0.05)}px rgba(0,0,0,0.5))`,
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

            {/* Hit-zone oval — only this element is pointer-interactive.
                The outer wrapper is pointer-events:none so empty space around
                the pet cannot be accidentally clicked or dragged. */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: Math.round(((minTopFrac + maxBotFrac) / 2) * sz),
                width: Math.round(sz * 0.38),
                height: Math.round((maxBotFrac - minTopFrac) * sz * 0.75),
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                pointerEvents: "auto",
                touchAction: "none",
                cursor: isDragging ? "grabbing" : "grab",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
