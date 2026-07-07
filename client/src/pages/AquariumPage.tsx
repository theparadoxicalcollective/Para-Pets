import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import aquariumBg from "@assets/bg_aquarium.png";
import bayouAquariumBg from "@assets/C98FF13A-0E53-4BA8-9036-24139DA75818_1783394294636.png";
import closeIcon from "@assets/Photoroom_20260706_95641_PM_1783394294636.png";
import arrowIcon from "@assets/Photoroom_20260706_94656_PM_1783394294636.png";
import lockIcon from "@assets/Photoroom_20260706_104316_PM_1783395823714.png";
import fishCommonIconPH from "@assets/generated_images/icon_fish_common.png";
import fishInvIconPH from "@assets/icon_fish_inventory.png";

interface AqCaughtFish {
  id: string;
  shopItemId: string;
  caughtAt: string;
  inAquarium: boolean;
  aquariumSlot: string;
  item: { id: string; name: string; imageUrl: string | null; starRarity: number | null; facingDirection: string | null; fishSwimZone?: string | null; hasParts?: boolean; isSeaAnimal?: boolean } | null;
}

interface AqFishEntry {
  id: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  starRarity: number | null;
  facingDirection: string | null;
  fishSwimZone?: string | null;
  hasParts?: boolean;
  isSeaAnimal?: boolean;
}

interface SwimmingFish extends AqFishEntry {
  x: number;
  y: number;
  vx: number;
  targetVx: number;
  wobble: number;
  wobbleSpeed: number;
  facingRight: boolean;
  baseSpeed: number;
  state: "normal" | "fast" | "chasing" | "fleeing";
  stateTimer: number;
  chaseTargetId?: string;
  targetY?: number;
  targetYTimer?: number;
}

const BOTTOM_FLOOR_MIN = 76;
const BOTTOM_FLOOR_MAX = 94;
const BOTTOM_VISIT_MIN = 50;
const BOTTOM_VISIT_MAX = 65;
const BOTTOM_HARD_MIN = BOTTOM_VISIT_MIN;
const BOTTOM_HARD_MAX = BOTTOM_FLOOR_MAX;

const AQ_MAX = 30;
const AQ_TEAL = "#5eead4";
const BAYOU_PRICE = 20000;

type AquariumSlot = "main" | "bayou";

function makeSwimmer(entry: AqFishEntry, x?: number, y?: number): SwimmingFish {
  const tier = Math.random();
  const isBottom = entry.fishSwimZone === "bottom";
  const speedMultiplier = isBottom ? 0.55 : 0.70;
  const rawSpeed = tier < 0.33
    ? 0.050 + Math.random() * 0.020
    : tier < 0.67
    ? 0.085 + Math.random() * 0.030
    : 0.130 + Math.random() * 0.035;
  const baseSpeed = rawSpeed * speedMultiplier;
  const startsRight = entry.facingDirection !== "left";
  const defaultY = isBottom
    ? BOTTOM_FLOOR_MIN + Math.random() * (BOTTOM_FLOOR_MAX - BOTTOM_FLOOR_MIN)
    : 26 + Math.random() * 44;
  const initialVx = startsRight ? baseSpeed : -baseSpeed;
  return {
    ...entry,
    x: x ?? (Math.random() * 80),
    y: y ?? defaultY,
    vx: initialVx,
    targetVx: initialVx,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.022 + Math.random() * 0.014,
    facingRight: startsRight,
    baseSpeed,
    state: "normal",
    stateTimer: 60 + Math.floor(Math.random() * 120),
    targetY: isBottom
      ? BOTTOM_FLOOR_MIN + Math.random() * (BOTTOM_FLOOR_MAX - BOTTOM_FLOOR_MIN)
      : undefined,
    targetYTimer: isBottom ? 200 + Math.floor(Math.random() * 400) : undefined,
  };
}

const FISH_PARTS_CANVAS = 500;
const FISH_RENDER_SIZE = 220;

const FISH_PART_ANIM: Record<string, { anim: string; duration: string; origin: string }> = {
  tail:           { anim: "fishTailWag",    duration: "0.55s", origin: "15% 50%" },
  top_fin:        { anim: "fishTopFinSway", duration: "2.6s",  origin: "50% 95%" },
  side_fin:       { anim: "fishSideFin",    duration: "1.5s",  origin: "10% 50%" },
  bottom_fin_1:   { anim: "fishFinDown",    duration: "1.4s",  origin: "50% 5%"  },
  bottom_fin_2:   { anim: "fishFinDown",    duration: "1.6s",  origin: "50% 5%"  },
  bottom_fin:     { anim: "fishFinDown",    duration: "1.4s",  origin: "50% 5%"  },
  head_fin:       { anim: "fishHeadFin",    duration: "1.8s",  origin: "50% 50%" },
  front_arm:      { anim: "fishLimbSwayA",  duration: "1.7s",  origin: "50% 0%"  },
  front_leg:      { anim: "fishLimbSwayB",  duration: "1.9s",  origin: "50% 0%"  },
  back_arm:       { anim: "fishLimbSwayA",  duration: "2.1s",  origin: "50% 0%"  },
  back_leg:       { anim: "fishLimbSwayB",  duration: "2.3s",  origin: "50% 0%"  },
  tail_1:         { anim: "fishTailSegA",   duration: "1.8s",  origin: "50% 0%"  },
  tail_2:         { anim: "fishTailSegB",   duration: "2.0s",  origin: "50% 0%"  },
  tail_3:         { anim: "fishTailSegA",   duration: "2.4s",  origin: "50% 0%"  },
  eyes_open:      { anim: "fishBlink",      duration: "3.4s",  origin: "50% 50%" },
};

const FISH_LAYER_ORDER_NORMAL: Record<string, number> = {
  tail: 1, body: 2, bottom_fin_2: 3, bottom_fin_1: 4, bottom_fin: 4,
  accessory: 5, side_fin: 6, top_fin: 7, head: 8, head_accessory: 9, head_fin: 9,
};
const FISH_LAYER_ORDER_SEA_ANIMAL: Record<string, number> = {
  tail_3: 1, tail_2: 2, tail_1: 3, back_accessory: 4, back_leg: 5, back_arm: 6,
  body: 7, front_leg: 8, front_arm: 9, head: 10, eyes_open: 11, head_accessory: 12, tail: 1,
};
const fishEffectiveZ = (partType: string, fallbackZ: number, isSeaAnimal: boolean): number => {
  const table = isSeaAnimal ? FISH_LAYER_ORDER_SEA_ANIMAL : FISH_LAYER_ORDER_NORMAL;
  return table[partType] ?? fallbackZ;
};

interface FishPartData {
  id: string;
  partType: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
}

function FishPartsView({ fishItemId, size, flipped, isSeaAnimal }: { fishItemId: string; size: number; flipped: boolean; isSeaAnimal: boolean }) {
  const { data: parts = [] } = useQuery<FishPartData[]>({
    queryKey: ["/api/fish-parts", fishItemId],
    queryFn: async () => {
      const res = await fetch(`/api/fish-parts/${fishItemId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load fish parts");
      return res.json();
    },
    staleTime: Infinity,
  });

  const scale = size / FISH_RENDER_SIZE;

  return (
    <div style={{ position: "relative", width: size, height: size, overflow: "visible", transform: flipped ? "scaleX(-1)" : undefined }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: FISH_RENDER_SIZE, height: FISH_RENDER_SIZE, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {[...parts]
          .sort((a, b) => fishEffectiveZ(a.partType, a.zIndex, isSeaAnimal) - fishEffectiveZ(b.partType, b.zIndex, isSeaAnimal))
          .map(part => {
            const anim = FISH_PART_ANIM[part.partType];
            const layerZ = fishEffectiveZ(part.partType, part.zIndex, isSeaAnimal);
            return (
              <img
                key={part.id}
                src={part.imageUrl}
                alt={part.partType}
                draggable={false}
                style={{
                  position: "absolute",
                  left: `${(part.posX / FISH_PARTS_CANVAS) * 100}%`,
                  top: `${(part.posY / FISH_PARTS_CANVAS) * 100}%`,
                  width: `${(part.width / FISH_PARTS_CANVAS) * 100}%`,
                  height: `${(part.height / FISH_PARTS_CANVAS) * 100}%`,
                  zIndex: layerZ,
                  objectFit: "contain",
                  pointerEvents: "none",
                  userSelect: "none",
                  ...(anim ? { animation: `${anim.anim} ${anim.duration} ease-in-out infinite alternate`, transformOrigin: anim.origin } : {}),
                }}
              />
            );
          })}
      </div>
    </div>
  );
}

export function AquariumPage({ onClose, userId }: { onClose: () => void; userId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [activeAquarium, setActiveAquarium] = useState<AquariumSlot>("main");
  const [showPanel, setShowPanel] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<AqFishEntry | null>(null);
  const [dragging, setDragging] = useState<{ fish: AqFishEntry; gx: number; gy: number } | null>(null);
  const draggingRef = useRef<typeof dragging>(null);
  draggingRef.current = dragging;
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Purchase modal states
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { data: fishInventory = [] } = useQuery<AqCaughtFish[]>({
    queryKey: ["/api/fishing/inventory"],
    staleTime: 30000,
  });

  const { data: unlocksData } = useQuery<{ unlocks: string[] }>({
    queryKey: ["/api/aquarium/unlocks"],
    staleTime: 60000,
  });

  const { data: currentUser } = useQuery<{ coins: number }>({
    queryKey: ["/api/auth/me"],
    staleTime: 30000,
  });

  const unlocks = unlocksData?.unlocks ?? [];
  const bayouUnlocked = unlocks.includes("bayou");

  const aquariumFish = React.useMemo<AqFishEntry[]>(() =>
    fishInventory
      .filter(f => f.inAquarium && f.item && (f.aquariumSlot ?? "main") === activeAquarium)
      .map(f => ({
        id: f.id,
        shopItemId: f.shopItemId,
        name: f.item?.name ?? "Fish",
        imageUrl: f.item?.imageUrl ?? null,
        starRarity: f.item?.starRarity ?? null,
        facingDirection: f.item?.facingDirection ?? null,
        fishSwimZone: f.item?.fishSwimZone ?? null,
        hasParts: f.item?.hasParts ?? false,
        isSeaAnimal: f.item?.isSeaAnimal ?? false,
      })),
  [fishInventory, activeAquarium]);

  const [swimmers, setSwimmers] = useState<SwimmingFish[]>([]);
  const aquariumFishRef = useRef(aquariumFish);
  aquariumFishRef.current = aquariumFish;
  const swimZoneRef = useRef<Map<string, string | null>>(new Map());

  const addFishMutation = useMutation({
    mutationFn: async ({ shopItemId, slot }: { shopItemId: string; slot: AquariumSlot }) => {
      const res = await apiRequest("POST", "/api/fishing/aquarium/add", { shopItemId, slot });
      return res.json() as Promise<{ ok: boolean; fishId: string }>;
    },
    onMutate: async ({ shopItemId, slot }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/fishing/inventory"] });
      const prev = queryClient.getQueryData<AqCaughtFish[]>(["/api/fishing/inventory"]);
      queryClient.setQueryData<AqCaughtFish[]>(["/api/fishing/inventory"], old => {
        if (!old) return old;
        let marked = false;
        return old.map(f => {
          if (!marked && f.shopItemId === shopItemId && !f.inAquarium) {
            marked = true;
            return { ...f, inAquarium: true, aquariumSlot: slot };
          }
          return f;
        });
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/fishing/inventory"], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
    },
  });

  const removeFishMutation = useMutation({
    mutationFn: async ({ shopItemId, slot }: { shopItemId: string; slot: AquariumSlot }) => {
      const res = await apiRequest("POST", "/api/fishing/aquarium/remove", { shopItemId, slot });
      return res.json();
    },
    onMutate: async ({ shopItemId, slot }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/fishing/inventory"] });
      const prev = queryClient.getQueryData<AqCaughtFish[]>(["/api/fishing/inventory"]);
      queryClient.setQueryData<AqCaughtFish[]>(["/api/fishing/inventory"], old => {
        if (!old) return old;
        let unmarked = false;
        return old.map(f => {
          if (!unmarked && f.shopItemId === shopItemId && f.inAquarium && (f.aquariumSlot ?? "main") === slot) {
            unmarked = true;
            return { ...f, inAquarium: false, aquariumSlot: "main" };
          }
          return f;
        });
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/fishing/inventory"], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
    },
  });

  const unlockBayouMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/aquarium/unlock", { aquariumId: "bayou" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? "Failed to unlock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aquarium/unlocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowConfirmModal(false);
      setShowBuyModal(false);
    },
  });

  useEffect(() => {
    const itemByShopId = new Map(fishInventory.map(f => [f.shopItemId, f.item]));
    const newZoneMap = new Map<string, string | null>();
    itemByShopId.forEach((item, id) => {
      newZoneMap.set(id, item?.fishSwimZone ?? null);
    });
    swimZoneRef.current = newZoneMap;
    setSwimmers(prev => prev.map(s => {
      const item = itemByShopId.get(s.shopItemId);
      if (!item) return s;
      const zone = item.fishSwimZone ?? s.fishSwimZone ?? null;
      const isBottom = zone === "bottom";
      const yMin = isBottom ? BOTTOM_HARD_MIN : 22;
      const yMax = isBottom ? BOTTOM_HARD_MAX : 71;
      return { ...s, name: item.name ?? s.name, imageUrl: item.imageUrl ?? s.imageUrl, starRarity: item.starRarity ?? s.starRarity, facingDirection: item.facingDirection ?? s.facingDirection, fishSwimZone: zone, hasParts: item.hasParts ?? s.hasParts, isSeaAnimal: item.isSeaAnimal ?? s.isSeaAnimal, y: Math.max(yMin, Math.min(yMax, s.y)) };
    }));
  }, [fishInventory]);

  useEffect(() => {
    setSwimmers(prev => {
      const existingMap = new Map(prev.map(s => [s.id, s]));
      const aquariumIds = new Set(aquariumFish.map(f => f.id));
      const result: SwimmingFish[] = aquariumFish.map(f => {
        const existing = existingMap.get(f.id);
        if (!existing) return makeSwimmer(f);
        const isBottom = (existing.fishSwimZone ?? f.fishSwimZone) === "bottom";
        const yMin = isBottom ? BOTTOM_HARD_MIN : 22;
        const yMax = isBottom ? BOTTOM_HARD_MAX : 71;
        return { ...existing, fishSwimZone: f.fishSwimZone, y: Math.max(yMin, Math.min(yMax, existing.y)) };
      });
      return result.filter(s => aquariumIds.has(s.id));
    });
  }, [aquariumFish]);

  useEffect(() => {
    const id = setInterval(() => {
      setSwimmers(prev => {
        const posMap = new Map(prev.map(f => [f.id, { x: f.x, y: f.y }]));
        let updated = prev.map(f => {
          let { x, y, vx, targetVx, wobble, wobbleSpeed, facingRight, baseSpeed, state, stateTimer, chaseTargetId } = f;
          stateTimer = Math.max(0, stateTimer - 1);
          if (stateTimer === 0) {
            if (state === "chasing") {
              facingRight = !facingRight;
              targetVx = (facingRight ? 1 : -1) * baseSpeed;
              state = "normal"; chaseTargetId = undefined;
              stateTimer = 80 + Math.floor(Math.random() * 120);
            } else if (state === "fleeing") {
              targetVx = (facingRight ? 1 : -1) * baseSpeed;
              state = "normal"; chaseTargetId = undefined;
              stateTimer = 80 + Math.floor(Math.random() * 120);
            } else if (state === "fast") {
              state = "normal";
              targetVx = (facingRight ? 1 : -1) * baseSpeed;
              stateTimer = 80 + Math.floor(Math.random() * 140);
            } else {
              if (Math.random() < 0.20) {
                state = "fast";
                targetVx = (facingRight ? 1 : -1) * baseSpeed * 1.8;
                stateTimer = 20 + Math.floor(Math.random() * 35);
              } else {
                stateTimer = 100 + Math.floor(Math.random() * 160);
              }
            }
          }
          if (state === "chasing" && chaseTargetId) {
            const target = posMap.get(chaseTargetId);
            if (target) {
              const chaseSpeed = baseSpeed * 1.8;
              const dx = target.x - x;
              if (dx > 2)       { targetVx = chaseSpeed;  facingRight = true; }
              else if (dx < -2) { targetVx = -chaseSpeed; facingRight = false; }
            }
          }
          if (state === "fleeing" && chaseTargetId) {
            const target = posMap.get(chaseTargetId);
            if (target) {
              const fleeSpeed = baseSpeed * 3.4;
              const dx = target.x - x;
              if (dx > 2)       { targetVx = -fleeSpeed; facingRight = false; }
              else if (dx < -2) { targetVx = fleeSpeed;  facingRight = true; }
            }
          }
          vx += (targetVx - vx) * 0.08;
          wobble = (wobble + wobbleSpeed) % (Math.PI * 2);
          const sineY = Math.sin(wobble) * 0.012;
          x += vx;
          const zone = swimZoneRef.current.get(f.shopItemId) ?? f.fishSwimZone ?? null;
          const isBottom = zone === "bottom";
          const yMin = isBottom ? BOTTOM_HARD_MIN : 22;
          const yMax = isBottom ? BOTTOM_HARD_MAX : 71;
          let { targetY, targetYTimer } = f;
          if (isBottom) {
            targetYTimer = (targetYTimer ?? 0) - 1;
            if (targetY === undefined || targetYTimer <= 0) {
              const goVisit = Math.random() < 0.15;
              if (goVisit) {
                targetY = BOTTOM_VISIT_MIN + Math.random() * (BOTTOM_VISIT_MAX - BOTTOM_VISIT_MIN);
                targetYTimer = 120 + Math.floor(Math.random() * 180);
              } else {
                targetY = BOTTOM_FLOOR_MIN + Math.random() * (BOTTOM_FLOOR_MAX - BOTTOM_FLOOR_MIN);
                targetYTimer = 300 + Math.floor(Math.random() * 600);
              }
            }
            const dy = (targetY ?? y) - y;
            y = y + dy * 0.012 + sineY;
            y = Math.max(yMin, Math.min(yMax, y));
          } else {
            y = Math.max(yMin, Math.min(yMax, y + sineY));
          }
          if (x < 5)  { x = 5;  vx = Math.abs(vx);  facingRight = true; }
          if (x > 91) { x = 91; vx = -Math.abs(vx); facingRight = false; }
          if (x <= 5 || x >= 91) targetVx = vx;
          return { ...f, x, y, vx, targetVx, wobble, wobbleSpeed, facingRight, baseSpeed, state, stateTimer, chaseTargetId, targetY, targetYTimer };
        });

        const activeChasers = updated.filter(f => f.state === "chasing").length;
        if (activeChasers < 1) {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].state !== "normal") continue;
            const iRarity = updated[i].starRarity ?? 1;
            if (iRarity < 3) continue;
            for (let j = 0; j < updated.length; j++) {
              if (i === j || updated[j].state !== "normal") continue;
              const jRarity = updated[j].starRarity ?? 1;
              if (iRarity < jRarity) continue;
              if (iRarity === jRarity && Math.random() < 0.5) continue;
              const dx = updated[i].x - updated[j].x;
              const dy = (updated[i].y - updated[j].y) * 1.5;
              if (Math.hypot(dx, dy) < 12) {
                if (Math.random() < 0.002) {
                  const chaseTimer = 150 + Math.floor(Math.random() * 100);
                  updated[i] = { ...updated[i], state: "chasing", chaseTargetId: updated[j].id, stateTimer: chaseTimer };
                  updated[j] = { ...updated[j], state: "fleeing",  chaseTargetId: updated[i].id, stateTimer: chaseTimer };
                }
                break;
              }
            }
          }
        }
        return updated;
      });
    }, 20);
    return () => clearInterval(id);
  }, []);

  const addFish = useCallback((fish: Omit<AqFishEntry, "id">) => {
    const current = aquariumFishRef.current;
    if (current.length >= AQ_MAX) return;
    addFishMutation.mutate({ shopItemId: fish.shopItemId, slot: activeAquarium });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFishMutation, activeAquarium]);

  const removeFish = useCallback((shopItemId: string) => {
    removeFishMutation.mutate({ shopItemId, slot: activeAquarium });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeFishMutation, activeAquarium]);

  const onFishPointerDown = useCallback((e: React.PointerEvent, fish: Omit<AqFishEntry, "id">) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragging({ fish: { ...fish, id: "drag" }, gx: e.clientX, gy: e.clientY });
  }, []);

  const onContainerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    if (!dragMovedRef.current && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 8) dragMovedRef.current = true;
    }
    setDragging(prev => prev ? { ...prev, gx: e.clientX, gy: e.clientY } : null);
  }, []);

  const onContainerPointerUp = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && dragMovedRef.current) {
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      if (py < 78) addFish(d.fish);
    }
    dragMovedRef.current = false;
    dragStartRef.current = null;
    setDragging(null);
  }, [addFish]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, { item: AqCaughtFish["item"]; count: number }>();
    for (const cf of fishInventory) {
      if (cf.inAquarium) continue;
      const ex = map.get(cf.shopItemId);
      if (ex) ex.count++; else map.set(cf.shopItemId, { item: cf.item, count: 1 });
    }
    return Array.from(map.entries());
  }, [fishInventory]);

  const currentBg = activeAquarium === "bayou" ? bayouAquariumBg : aquariumBg;
  const title = activeAquarium === "bayou" ? "BAYOU AQUARIUM" : "AQUARIUM";
  const isLocked = activeAquarium === "bayou" && !bayouUnlocked;
  const userCoins = currentUser?.coins ?? 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 overflow-hidden"
      style={{ background: "#010810", touchAction: "none" }}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
    >
      <style>{`
        @keyframes aqSlideIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes aqPanelUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes aquaBubbleRise {
          0%   { transform: translateY(0)    translateX(0px);   opacity: 0;    }
          8%   { opacity: 0.55; }
          45%  { transform: translateY(calc(-38*var(--vh))) translateX(4px);  opacity: 0.45; }
          55%  { transform: translateY(calc(-46*var(--vh))) translateX(-3px); opacity: 0.38; }
          80%  { transform: translateY(calc(-66*var(--vh))) translateX(2px);  opacity: 0.22; }
          100% { transform: translateY(calc(-84*var(--vh))) translateX(0px);  opacity: 0;    }
        }
        @keyframes fishTailWag   { from { transform: scaleX(0.95); } to { transform: scaleX(1.0); } }
        @keyframes fishFinUp     { from { transform: rotate(-3deg); } to { transform: rotate(2deg);  } }
        @keyframes fishFinDown   { from { transform: rotate(0deg);  } to { transform: rotate(2.5deg); } }
        @keyframes fishHeadFin   { from { transform: rotate(-3deg) translateY(-1px); } to { transform: rotate(2deg) translateY(2px); } }
        @keyframes fishTopFinSway { from { transform: rotate(-1deg); } to { transform: rotate(0.5deg); } }
        @keyframes fishSideFin    { from { transform: rotate(-6deg); } to { transform: rotate(8deg);  } }
        @keyframes fishLimbSwayA  { from { transform: rotate(-7deg); } to { transform: rotate(7deg);  } }
        @keyframes fishLimbSwayB  { from { transform: rotate(6deg);  } to { transform: rotate(-6deg); } }
        @keyframes fishTailSegA   { from { transform: rotate(-5deg); } to { transform: rotate(5deg);  } }
        @keyframes fishTailSegB   { from { transform: rotate(4deg);  } to { transform: rotate(-4deg); } }
        @keyframes fishBlink      { 0%,92%,100% { opacity:1; } 95%,97% { opacity:0; } }
        @keyframes aqLockPulse    { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:1; transform:scale(1.04); } }
      `}</style>

      {/* Background */}
      <img
        src={currentBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
        style={{ transition: "opacity 0.4s ease" }}
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg,rgba(1,8,16,0.55) 0%,transparent 25%,transparent 72%,rgba(1,8,16,0.65) 100%)",
      }}/>

      {/* Rising bubbles (hidden when locked) */}
      {!isLocked && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 5 }}>
          {([
            { left: "8%",  size: 5,  dur: "6.2s", delay: "0s"    },
            { left: "14%", size: 4,  dur: "7.8s", delay: "1.4s"  },
            { left: "21%", size: 7,  dur: "5.5s", delay: "0.6s"  },
            { left: "28%", size: 4,  dur: "8.4s", delay: "3.1s"  },
            { left: "34%", size: 6,  dur: "6.9s", delay: "0.2s"  },
            { left: "40%", size: 5,  dur: "7.3s", delay: "4.8s"  },
            { left: "47%", size: 9,  dur: "5.8s", delay: "1.9s"  },
            { left: "53%", size: 4,  dur: "9.1s", delay: "0.4s"  },
            { left: "58%", size: 6,  dur: "6.6s", delay: "5.5s"  },
            { left: "64%", size: 5,  dur: "7.0s", delay: "2.7s"  },
            { left: "70%", size: 4,  dur: "8.7s", delay: "0.9s"  },
            { left: "75%", size: 7,  dur: "6.1s", delay: "3.8s"  },
            { left: "81%", size: 5,  dur: "7.5s", delay: "1.1s"  },
            { left: "87%", size: 4,  dur: "9.3s", delay: "6.2s"  },
            { left: "11%", size: 6,  dur: "8.0s", delay: "7.0s"  },
            { left: "44%", size: 4,  dur: "6.4s", delay: "2.3s"  },
            { left: "61%", size: 5,  dur: "7.9s", delay: "4.1s"  },
            { left: "90%", size: 6,  dur: "5.6s", delay: "0.7s"  },
          ] as const).map((b, i) => (
            <div key={i} style={{
              position: "absolute", bottom: "5%", left: b.left,
              width: b.size, height: b.size, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.75), rgba(94,234,212,0.25))",
              border: "0.5px solid rgba(94,234,212,0.35)",
              animation: `aquaBubbleRise ${b.dur} ease-in infinite`,
              animationDelay: b.delay,
            }}/>
          ))}
        </div>
      )}

      {/* Swimming fish */}
      {!isLocked && swimmers.map(f => {
        const rarity = f.starRarity ?? 1;
        const fishSize = f.hasParts
          ? (rarity >= 5 ? 160 : rarity === 4 ? 145 : 130)
          : (rarity >= 5 ? 78  : rarity === 4 ? 65  : 54);
        return (
          <button
            key={f.id}
            onClick={() => setPendingRemove(f)}
            title="Tap fish"
            style={{
              position: "absolute",
              left: `${f.x}%`, top: `${f.y}%`,
              width: fishSize, height: fishSize,
              transform: "translate(-50%,-50%)",
              background: "none", border: "none", outline: "none",
              WebkitTapHighlightColor: "transparent",
              cursor: "pointer", padding: 0, zIndex: 10,
            }}
          >
            {f.hasParts
              ? <FishPartsView fishItemId={f.shopItemId} size={fishSize} flipped={((f.facingDirection !== "left") !== f.facingRight)} isSeaAnimal={f.isSeaAnimal ?? false} />
              : f.imageUrl
                ? <img src={f.imageUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none", transform: ((f.facingDirection !== "left") !== f.facingRight) ? "scaleX(-1)" : undefined }} draggable={false} />
                : <img src={fishCommonIconPH} alt="" style={{ width: 34, height: 34, objectFit: "contain", opacity: 0.7, pointerEvents: "none", userSelect: "none" }} draggable={false} />}
          </button>
        );
      })}

      {/* Locked overlay for Bayou */}
      {isLocked && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20 cursor-pointer"
          style={{ background: "rgba(1,8,16,0.72)", backdropFilter: "blur(2px)" }}
          onClick={() => setShowBuyModal(true)}
        >
          <img
            src={lockIcon}
            alt="Locked"
            style={{ width: 200, height: "auto", objectFit: "contain", animation: "aqLockPulse 3s ease-in-out infinite", filter: "drop-shadow(0 0 18px rgba(212,168,67,0.55))" }}
            draggable={false}
          />
          <p className="font-fantasy text-sm tracking-widest mt-5" style={{ color: "rgba(212,168,67,0.9)", textShadow: "0 0 12px rgba(212,168,67,0.5)" }}>
            Tap to unlock
          </p>
        </div>
      )}

      {/* Header title */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", marginTop: 16, animation: "aqSlideIn 0.5s ease-out" }}>
        <h2 className="font-fantasy text-base tracking-[0.3em]" style={{ color: AQ_TEAL, textShadow: "0 0 16px rgba(94,234,212,0.7),0 0 32px rgba(94,234,212,0.3)" }}>{title}</h2>
        <div style={{ height: 1, width: 80, marginTop: 4, background: "linear-gradient(90deg,transparent,rgba(94,234,212,0.5),transparent)" }}/>
      </div>

      {/* Close button — custom X icon */}
      <button
        data-testid="button-close-aquarium"
        onClick={onClose}
        className="absolute z-50 active:scale-90 transition-transform"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)", right: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <img src={closeIcon} alt="Close" style={{ width: 44, height: 44, objectFit: "contain" }} draggable={false} />
      </button>

      {/* Right arrow — navigate to Bayou (shown only on main) */}
      {activeAquarium === "main" && (
        <button
          data-testid="button-aquarium-next"
          onClick={() => setActiveAquarium("bayou")}
          className="absolute z-30 active:scale-90 transition-transform"
          style={{ right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <img
            src={arrowIcon}
            alt="Next aquarium"
            style={{ width: 64, height: "auto", objectFit: "contain", transform: "scaleX(-1)", filter: "drop-shadow(0 0 8px rgba(94,234,212,0.4))" }}
            draggable={false}
          />
        </button>
      )}

      {/* Left arrow — navigate back to main (shown only on bayou) */}
      {activeAquarium === "bayou" && (
        <button
          data-testid="button-aquarium-prev"
          onClick={() => { setActiveAquarium("main"); setShowPanel(false); }}
          className="absolute z-30 active:scale-90 transition-transform"
          style={{ left: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <img
            src={arrowIcon}
            alt="Previous aquarium"
            style={{ width: 64, height: "auto", objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(94,234,212,0.4))" }}
            draggable={false}
          />
        </button>
      )}

      {/* Empty hint */}
      {aquariumFish.length === 0 && !showPanel && !isLocked && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: "48%" }}>
          <p className="font-fantasy text-xs text-center tracking-wider px-8 leading-relaxed" style={{ color: "rgba(94,234,212,0.4)" }}>
            Open your fish bag and drag or tap a fish to add it to your aquarium
          </p>
        </div>
      )}

      {/* Fish count */}
      {aquariumFish.length > 0 && !isLocked && (
        <div className="absolute pointer-events-none" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,234,212,0.45)" }}>
            {aquariumFish.length}/{AQ_MAX} fish · tap a fish to release it
          </span>
        </div>
      )}

      {/* Fish bag button (hidden when locked) */}
      {!isLocked && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center z-30"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)", paddingTop: 8 }}>
          <button
            data-testid="button-aquarium-fish-bag"
            onClick={() => setShowPanel(p => !p)}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{
              background: showPanel ? "rgba(94,234,212,0.18)" : "rgba(1,12,30,0.88)",
              border: `2px solid ${showPanel ? "rgba(94,234,212,0.75)" : "rgba(94,234,212,0.38)"}`,
              boxShadow: showPanel ? "0 0 14px rgba(94,234,212,0.35)" : "0 2px 10px rgba(0,0,0,0.6)",
            }}>
              <img src={fishInvIconPH} alt="Fish Bag" style={{ width: 34, height: 34, objectFit: "contain" }} />
            </div>
            <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,234,212,0.7)" }}>FISH BAG</span>
          </button>
        </div>
      )}

      {/* Fish bag panel */}
      {showPanel && !isLocked && (
        <div
          className="absolute left-0 right-0 z-40 rounded-t-2xl"
          style={{
            bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 88px)",
            background: "rgba(2,10,24,0.97)",
            border: "1px solid rgba(94,234,212,0.28)",
            backdropFilter: "blur(14px)",
            animation: "aqPanelUp 0.25s ease-out",
            maxHeight: "calc(46*var(--vh))",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(94,234,212,0.18)" }}>
            <div>
              <h4 className="font-fantasy text-xs tracking-widest" style={{ color: AQ_TEAL }}>Fish Collection</h4>
              <p className="font-fantasy text-[9px] mt-0.5" style={{ color: "rgba(94,234,212,0.42)" }}>
                {aquariumFish.length}/{AQ_MAX} in aquarium · drag or tap to place
              </p>
            </div>
            <button onClick={() => setShowPanel(false)} style={{ color: "rgba(94,234,212,0.55)", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
          <div className="overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
            {grouped.length === 0 ? (
              <p className="font-fantasy text-[10px] text-center py-6" style={{ color: "rgba(94,234,212,0.38)" }}>
                No fish caught yet — cast your line!
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {grouped.map(([shopItemId, { item, count }]) => {
                  const inTank = aquariumFish.filter(f => f.shopItemId === shopItemId).length;
                  const canAdd = aquariumFish.length < AQ_MAX && inTank < count;
                  return (
                    <div
                      key={shopItemId}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl select-none"
                      style={{
                        background: inTank > 0 ? "rgba(94,234,212,0.1)" : "rgba(0,0,0,0.28)",
                        border: `1.5px solid ${inTank > 0 ? "rgba(94,234,212,0.45)" : "rgba(94,234,212,0.14)"}`,
                        opacity: canAdd ? 1 : 0.4,
                        touchAction: "none",
                        cursor: canAdd ? "grab" : "default",
                      }}
                      onPointerDown={canAdd ? (e) => onFishPointerDown(e, { shopItemId, name: item?.name || "Fish", imageUrl: item?.imageUrl || null, starRarity: item?.starRarity || null, facingDirection: item?.facingDirection || null, fishSwimZone: item?.fishSwimZone ?? null, hasParts: item?.hasParts ?? false }) : undefined}
                      onClick={canAdd ? () => addFish({ shopItemId, name: item?.name || "Fish", imageUrl: item?.imageUrl || null, starRarity: item?.starRarity || null, facingDirection: item?.facingDirection || null, fishSwimZone: item?.fishSwimZone ?? null, hasParts: item?.hasParts ?? false }) : undefined}
                    >
                      <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        {item?.imageUrl
                          ? <img src={item.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          : <img src={fishCommonIconPH} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} />}
                      </div>
                      <span className="font-fantasy text-[8px] text-center leading-tight w-full truncate" style={{ color: "rgba(94,234,212,0.82)" }}>{item?.name || "Unknown"}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-fantasy text-[7px]" style={{ color: "rgba(94,234,212,0.48)" }}>×{count}</span>
                        {inTank > 0 && <span className="font-fantasy text-[7px]" style={{ color: "rgba(94,234,212,0.6)", fontWeight: "bold" }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove fish modal */}
      {pendingRemove && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(1,8,16,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setPendingRemove(null)}
        >
          <div
            className="rounded-2xl overflow-hidden flex flex-col items-center"
            style={{
              background: "linear-gradient(160deg, rgba(3,14,32,0.98), rgba(2,10,24,0.98))",
              border: "1.5px solid rgba(94,234,212,0.35)",
              boxShadow: "0 0 32px rgba(94,234,212,0.15), 0 8px 32px rgba(0,0,0,0.7)",
              width: 220, padding: "22px 20px 18px",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 60, height: 60, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 10px rgba(94,234,212,0.5))" }}>
              {pendingRemove.imageUrl
                ? <img src={pendingRemove.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                : <img src={fishCommonIconPH} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} draggable={false} />}
            </div>
            <p className="font-fantasy text-[11px] tracking-wider text-center mb-1" style={{ color: AQ_TEAL }}>{pendingRemove.name}</p>
            {pendingRemove.starRarity && pendingRemove.starRarity > 0 && (
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: pendingRemove.starRarity }).map((_, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#f0c040", textShadow: "0 0 6px rgba(240,192,64,0.7)" }}>★</span>
                ))}
              </div>
            )}
            <p className="font-fantasy text-[9px] tracking-widest text-center mb-5" style={{ color: "rgba(94,234,212,0.45)" }}>
              Return this fish to your bag?
            </p>
            <button
              data-testid="button-return-fish-to-bag"
              onClick={() => { removeFish(pendingRemove.shopItemId); setPendingRemove(null); }}
              className="w-full rounded-xl py-2.5 font-fantasy text-xs tracking-widest transition-transform active:scale-95 mb-2"
              style={{ background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(56,189,248,0.18))", border: "1.5px solid rgba(94,234,212,0.55)", color: AQ_TEAL, cursor: "pointer", boxShadow: "0 0 12px rgba(94,234,212,0.2)" }}
            >
              Return to Bag
            </button>
            <button
              data-testid="button-keep-fish-in-aquarium"
              onClick={() => setPendingRemove(null)}
              className="w-full rounded-xl py-2 font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{ background: "transparent", border: "1px solid rgba(94,234,212,0.18)", color: "rgba(94,234,212,0.45)", cursor: "pointer" }}
            >
              Keep Swimming
            </button>
          </div>
        </div>
      )}

      {/* Buy modal */}
      {showBuyModal && !showConfirmModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(1,8,16,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowBuyModal(false)}
        >
          <div
            className="rounded-2xl flex flex-col items-center"
            style={{
              background: "linear-gradient(160deg, rgba(3,14,32,0.99), rgba(2,10,24,0.99))",
              border: "1.5px solid rgba(94,234,212,0.35)",
              boxShadow: "0 0 40px rgba(94,234,212,0.15), 0 8px 40px rgba(0,0,0,0.8)",
              width: 260, padding: "28px 24px 22px",
            }}
            onClick={e => e.stopPropagation()}
          >
            <img src={bayouAquariumBg} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, marginBottom: 14, filter: "brightness(0.85)" }} draggable={false} />
            <p className="font-fantasy text-sm tracking-widest text-center mb-1" style={{ color: AQ_TEAL }}>Bayou Aquarium</p>
            <p className="font-fantasy text-[9px] tracking-wider text-center mb-4 px-2" style={{ color: "rgba(94,234,212,0.5)" }}>A second tank — 30 fish capacity</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-fantasy text-xl" style={{ color: "#ffd700", textShadow: "0 0 10px rgba(255,215,0,0.6)" }}>🪙</span>
              <span className="font-fantasy text-lg" style={{ color: "#ffd700" }}>20,000</span>
            </div>
            <p className="font-fantasy text-[9px] mb-5" style={{ color: userCoins >= BAYOU_PRICE ? "rgba(94,234,212,0.55)" : "rgba(220,80,80,0.8)" }}>
              Your balance: {userCoins.toLocaleString()} coins
            </p>
            <button
              data-testid="button-buy-bayou-aquarium"
              disabled={userCoins < BAYOU_PRICE}
              onClick={() => { setShowBuyModal(false); setShowConfirmModal(true); }}
              className="w-full rounded-xl py-2.5 font-fantasy text-xs tracking-widest transition-transform active:scale-95 mb-2"
              style={{
                background: userCoins >= BAYOU_PRICE ? "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(56,189,248,0.2))" : "rgba(40,40,60,0.8)",
                border: `1.5px solid ${userCoins >= BAYOU_PRICE ? "rgba(94,234,212,0.6)" : "rgba(94,234,212,0.2)"}`,
                color: userCoins >= BAYOU_PRICE ? AQ_TEAL : "rgba(94,234,212,0.3)",
                cursor: userCoins >= BAYOU_PRICE ? "pointer" : "not-allowed",
                boxShadow: userCoins >= BAYOU_PRICE ? "0 0 12px rgba(94,234,212,0.2)" : "none",
              }}
            >
              {userCoins >= BAYOU_PRICE ? "Buy" : "Not Enough Coins"}
            </button>
            <button
              onClick={() => setShowBuyModal(false)}
              className="w-full rounded-xl py-2 font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{ background: "transparent", border: "1px solid rgba(94,234,212,0.18)", color: "rgba(94,234,212,0.45)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm purchase modal */}
      {showConfirmModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(1,8,16,0.65)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="rounded-2xl flex flex-col items-center"
            style={{
              background: "linear-gradient(160deg, rgba(3,14,32,0.99), rgba(2,10,24,0.99))",
              border: "1.5px solid rgba(94,234,212,0.35)",
              boxShadow: "0 0 40px rgba(94,234,212,0.15), 0 8px 40px rgba(0,0,0,0.8)",
              width: 260, padding: "28px 24px 22px",
            }}
          >
            <p className="font-fantasy text-base tracking-widest text-center mb-2" style={{ color: AQ_TEAL }}>Are you sure?</p>
            <p className="font-fantasy text-[10px] text-center mb-2 px-2" style={{ color: "rgba(94,234,212,0.55)" }}>
              This will spend
            </p>
            <div className="flex items-center gap-2 mb-5">
              <span className="font-fantasy text-lg" style={{ color: "#ffd700" }}>🪙 20,000 coins</span>
            </div>
            {unlockBayouMutation.isError && (
              <p className="font-fantasy text-[9px] text-center mb-3" style={{ color: "rgba(220,80,80,0.9)" }}>
                {(unlockBayouMutation.error as Error)?.message ?? "Something went wrong"}
              </p>
            )}
            <button
              data-testid="button-confirm-buy-bayou"
              disabled={unlockBayouMutation.isPending}
              onClick={() => unlockBayouMutation.mutate()}
              className="w-full rounded-xl py-2.5 font-fantasy text-xs tracking-widest transition-transform active:scale-95 mb-2"
              style={{
                background: "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(56,189,248,0.2))",
                border: "1.5px solid rgba(94,234,212,0.6)",
                color: AQ_TEAL, cursor: unlockBayouMutation.isPending ? "wait" : "pointer",
                boxShadow: "0 0 12px rgba(94,234,212,0.2)",
                opacity: unlockBayouMutation.isPending ? 0.6 : 1,
              }}
            >
              {unlockBayouMutation.isPending ? "Purchasing…" : "Confirm"}
            </button>
            <button
              onClick={() => { setShowConfirmModal(false); setShowBuyModal(true); }}
              disabled={unlockBayouMutation.isPending}
              className="w-full rounded-xl py-2 font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{ background: "transparent", border: "1px solid rgba(94,234,212,0.18)", color: "rgba(94,234,212,0.45)", cursor: "pointer" }}
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Dragging ghost */}
      {dragging && (
        <div className="fixed pointer-events-none" style={{
          zIndex: 9999,
          left: dragging.gx - 27, top: dragging.gy - 27,
          width: 54, height: 54,
          background: "rgba(1,12,30,0.92)",
          border: "2px solid rgba(94,234,212,0.7)",
          borderRadius: 12,
          boxShadow: "0 0 18px rgba(94,234,212,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {dragging.fish.imageUrl
            ? <img src={dragging.fish.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} draggable={false} />
            : <img src={fishCommonIconPH} alt="" style={{ width: 40, height: 40, objectFit: "contain", opacity: 0.7 }} draggable={false} />}
        </div>
      )}
    </div>
  );
}
