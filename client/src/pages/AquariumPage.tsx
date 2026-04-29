import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import aquariumBg from "@assets/bg_aquarium.png";
import fishCommonIconPH from "@assets/generated_images/icon_fish_common.png";
import fishInvIconPH from "@assets/icon_fish_inventory.png";

interface AqCaughtFish {
  id: string;
  shopItemId: string;
  caughtAt: string;
  inAquarium: boolean;
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
  // Target horizontal velocity that vx eases toward each frame. Setting a
  // command-velocity (e.g. when entering chase / flee / fast / wall-bounce)
  // updates targetVx and the swim loop lerps vx toward it (~0.08/frame),
  // so direction reversals and speed changes ramp smoothly instead of
  // snapping — that's most of the new "fluid" feel.
  targetVx: number;
  wobble: number;
  // Per-fish wobble phase speed. Was a hard-coded 0.032 for every fish;
  // randomising it (0.022–0.034) means each fish has its own breathing
  // rhythm, so a school of fish never pulses up/down in unison.
  wobbleSpeed: number;
  facingRight: boolean;
  baseSpeed: number;
  state: "normal" | "fast" | "chasing" | "fleeing";
  stateTimer: number;
  chaseTargetId?: string;
  // Vertical bias used by bottom-zone fish: they drift toward this Y. Most of
  // the time it's near the floor; occasionally it retargets up toward mid so
  // the fish makes a short trip up and back down.
  targetY?: number;
  targetYTimer?: number;
}

// Bottom-zone Y bands: most of the time the fish lives in BOTTOM_FLOOR; every
// so often it drifts up to BOTTOM_VISIT (mid) before settling back down.
// The floor band is intentionally tall so bottom-roaming fish have meaningful
// vertical room to wander instead of being pinned to a thin strip near the
// substrate. The Y value is the fish's center, so even at 94 the bottom of a
// 130–160px fish still reaches the visible gravel.
const BOTTOM_FLOOR_MIN = 76;
const BOTTOM_FLOOR_MAX = 94;
const BOTTOM_VISIT_MIN = 50;
const BOTTOM_VISIT_MAX = 65;
// Hard clamp for bottom fish: from the floor up to the top of the mid visit.
const BOTTOM_HARD_MIN = BOTTOM_VISIT_MIN;
const BOTTOM_HARD_MAX = BOTTOM_FLOOR_MAX;

const AQ_MAX = 30;
const AQ_TEAL = "#5eead4";

function makeSwimmer(entry: AqFishEntry, x?: number, y?: number): SwimmingFish {
  const tier = Math.random();
  const isBottom = entry.fishSwimZone === "bottom";
  // Per request: slow ALL fish down a notch, with bottom-zone fish slightly
  // slower than full-page (upper) swimmers. Multipliers applied to the raw
  // tiered baseSpeed so the slow/medium/fast personality spread is preserved.
  //   full-page fish: ×0.70  (≈30% slower than the original swim speeds)
  //   bottom fish:    ×0.55  (≈21% slower than the new full-page speed)
  // Bottom fish hover near the floor and only occasionally drift up — the
  // additional slow-down sells "settled on the seabed" rather than "patrol".
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
    // Per-fish wobble speed: small random spread around the old fixed
    // 0.032 so different fish breathe at different rates instead of
    // pulsing in lockstep.
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

// Per-part-type animation map. Includes:
//  - the standard fish layer set (tail, top_fin, side_fin, bottom_fin_1/2)
//  - the renamed head_accessory (was head_fin), kept STATIC since accessories
//    like hats / crowns shouldn't bob
//  - the legacy keys (head_fin, bottom_fin) so previously uploaded parts still
//    animate correctly after the rename / split
//  - the Sea Animal extended set (eyes_open blinks, limbs sway, tail_1/2/3
//    each get a slightly out-of-phase sway so multi-tentacle critters look
//    alive instead of moving in lockstep)
// Top fin sliding motion was tuned DOWN per request:
//   - rotation amplitude: 5° → 1.5° (-1° to 0.5°)
//   - duration: 1.6s → 2.6s (slower, so it reads as a gentle drift, not a slide)
const FISH_PART_ANIM: Record<string, { anim: string; duration: string; origin: string }> = {
  tail:           { anim: "fishTailWag",    duration: "0.55s", origin: "15% 50%" },
  top_fin:        { anim: "fishTopFinSway", duration: "2.6s",  origin: "50% 95%" },
  side_fin:       { anim: "fishSideFin",    duration: "1.5s",  origin: "10% 50%" },
  bottom_fin_1:   { anim: "fishFinDown",    duration: "1.4s",  origin: "50% 5%"  },
  bottom_fin_2:   { anim: "fishFinDown",    duration: "1.6s",  origin: "50% 5%"  },
  // Legacy aliases — keep so existing fish keep animating after the rename:
  bottom_fin:     { anim: "fishFinDown",    duration: "1.4s",  origin: "50% 5%"  },
  head_fin:       { anim: "fishHeadFin",    duration: "1.8s",  origin: "50% 50%" },
  // Sea Animal limbs / tails — independent sway periods so they don't sync.
  front_arm:      { anim: "fishLimbSwayA",  duration: "1.7s",  origin: "50% 0%"  },
  front_leg:      { anim: "fishLimbSwayB",  duration: "1.9s",  origin: "50% 0%"  },
  back_arm:       { anim: "fishLimbSwayA",  duration: "2.1s",  origin: "50% 0%"  },
  back_leg:       { anim: "fishLimbSwayB",  duration: "2.3s",  origin: "50% 0%"  },
  tail_1:         { anim: "fishTailSegA",   duration: "1.8s",  origin: "50% 0%"  },
  tail_2:         { anim: "fishTailSegB",   duration: "2.0s",  origin: "50% 0%"  },
  tail_3:         { anim: "fishTailSegA",   duration: "2.4s",  origin: "50% 0%"  },
  // Eyes_open blinks every ~3s by briefly hiding (no closed-eye art needed
  // — the head art doubles as the closed-eye state).
  eyes_open:      { anim: "fishBlink",      duration: "3.4s",  origin: "50% 50%" },
};

// Canonical fish layer order — kept in lockstep with the editor's
// FISH_PART_TYPES_NORMAL / FISH_PART_TYPES_SEA_ANIMAL tables so the
// in-aquarium render and the admin part editor stack identically.
// Higher value = drawn on top.
const FISH_LAYER_ORDER_NORMAL: Record<string, number> = {
  tail: 1,
  body: 2,
  bottom_fin_2: 3,
  bottom_fin_1: 4,
  bottom_fin: 4,         // legacy
  accessory: 5,
  side_fin: 6,
  top_fin: 7,
  head: 8,
  head_accessory: 9,
  head_fin: 9,           // legacy alias for head_accessory
};
const FISH_LAYER_ORDER_SEA_ANIMAL: Record<string, number> = {
  tail_3: 1, tail_2: 2, tail_1: 3,
  back_accessory: 4,
  back_leg: 5,
  back_arm: 6,
  body: 7,
  front_leg: 8,
  front_arm: 9,
  head: 10,
  eyes_open: 11,
  head_accessory: 12,
  // Tail (legacy single tail) and other legacy keys fall back to the
  // standard set so a fish migrated from "normal" to "sea animal" keeps
  // a sensible order until the admin re-uploads the new tail segments.
  tail: 1,
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
    <div style={{
      position: "relative",
      width: size,
      height: size,
      overflow: "visible",
      transform: flipped ? "scaleX(-1)" : undefined,
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: FISH_RENDER_SIZE,
        height: FISH_RENDER_SIZE,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}>
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
                ...(anim ? {
                  animation: `${anim.anim} ${anim.duration} ease-in-out infinite alternate`,
                  transformOrigin: anim.origin,
                } : {}),
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

  const { data: fishInventory = [] } = useQuery<AqCaughtFish[]>({
    queryKey: ["/api/fishing/inventory"],
    staleTime: 30000,
  });

  const aquariumFish = React.useMemo<AqFishEntry[]>(() =>
    fishInventory
      .filter(f => f.inAquarium && f.item)
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
  [fishInventory]);

  const [swimmers, setSwimmers] = useState<SwimmingFish[]>([]);

  const aquariumFishRef = useRef(aquariumFish);
  aquariumFishRef.current = aquariumFish;

  const [showPanel, setShowPanel] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<AqFishEntry | null>(null);
  const [dragging, setDragging] = useState<{ fish: AqFishEntry; gx: number; gy: number } | null>(null);
  const draggingRef = useRef<typeof dragging>(null);
  draggingRef.current = dragging;
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const swimZoneRef = useRef<Map<string, string | null>>(new Map());

  const addFishMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest("POST", "/api/fishing/aquarium/add", { shopItemId });
      return res.json() as Promise<{ ok: boolean; fishId: string }>;
    },
    onMutate: async (shopItemId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/fishing/inventory"] });
      const prev = queryClient.getQueryData<AqCaughtFish[]>(["/api/fishing/inventory"]);
      queryClient.setQueryData<AqCaughtFish[]>(["/api/fishing/inventory"], old => {
        if (!old) return old;
        let marked = false;
        return old.map(f => {
          if (!marked && f.shopItemId === shopItemId && !f.inAquarium) {
            marked = true;
            return { ...f, inAquarium: true };
          }
          return f;
        });
      });
      return { prev };
    },
    onError: (_err, _shopItemId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/fishing/inventory"], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
    },
  });

  const removeFishMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest("POST", "/api/fishing/aquarium/remove", { shopItemId });
      return res.json();
    },
    onMutate: async (shopItemId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/fishing/inventory"] });
      const prev = queryClient.getQueryData<AqCaughtFish[]>(["/api/fishing/inventory"]);
      queryClient.setQueryData<AqCaughtFish[]>(["/api/fishing/inventory"], old => {
        if (!old) return old;
        let unmarked = false;
        return old.map(f => {
          if (!unmarked && f.shopItemId === shopItemId && f.inAquarium) {
            unmarked = true;
            return { ...f, inAquarium: false };
          }
          return f;
        });
      });
      return { prev };
    },
    onError: (_err, _shopItemId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/fishing/inventory"], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
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
      return {
        ...s,
        name: item.name ?? s.name,
        imageUrl: item.imageUrl ?? s.imageUrl,
        starRarity: item.starRarity ?? s.starRarity,
        facingDirection: item.facingDirection ?? s.facingDirection,
        fishSwimZone: zone,
        hasParts: item.hasParts ?? s.hasParts,
        isSeaAnimal: item.isSeaAnimal ?? s.isSeaAnimal,
        y: Math.max(yMin, Math.min(yMax, s.y)),
      };
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
              state = "normal";
              chaseTargetId = undefined;
              stateTimer = 80 + Math.floor(Math.random() * 120);
            } else if (state === "fleeing") {
              targetVx = (facingRight ? 1 : -1) * baseSpeed;
              state = "normal";
              chaseTargetId = undefined;
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

          // Bottom-zone vertical drift: ~85% of the time the fish targets the
          // floor band; ~15% it picks a "visit mid" target for a brief trip up
          // before naturally returning to the floor on the next retarget.
          let { targetY, targetYTimer } = f;
          if (isBottom) {
            targetYTimer = (targetYTimer ?? 0) - 1;
            if (targetY === undefined || targetYTimer <= 0) {
              const goVisit = Math.random() < 0.15;
              if (goVisit) {
                targetY = BOTTOM_VISIT_MIN + Math.random() * (BOTTOM_VISIT_MAX - BOTTOM_VISIT_MIN);
                targetYTimer = 120 + Math.floor(Math.random() * 180); // shorter visit
              } else {
                targetY = BOTTOM_FLOOR_MIN + Math.random() * (BOTTOM_FLOOR_MAX - BOTTOM_FLOOR_MIN);
                targetYTimer = 300 + Math.floor(Math.random() * 600); // long settle
              }
            }
            // Ease toward target Y; combined with the gentle sine wobble this
            // produces a natural "rise then sink" arc.
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

  const addFish = useCallback((fish: Omit<AqFishEntry, "id">, px?: number, py?: number) => {
    const current = aquariumFishRef.current;
    // Total tank cap is the only limit — players may stock as many of any one
    // species as they own, up to AQ_MAX combined.
    if (current.length >= AQ_MAX) return;
    addFishMutation.mutate(fish.shopItemId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFishMutation]);

  const removeFish = useCallback((shopItemId: string) => {
    removeFishMutation.mutate(shopItemId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeFishMutation]);

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
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      if (py < 78) addFish(d.fish, px, py);
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
      `}</style>

      <img src={aquariumBg} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg,rgba(1,8,16,0.55) 0%,transparent 25%,transparent 72%,rgba(1,8,16,0.65) 100%)",
      }}/>

      {swimmers.map(f => {
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
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: fishSize,
            height: fishSize,
            transform: `translate(-50%,-50%)`,
            background: "none",
            border: "none",
            outline: "none",
            WebkitTapHighlightColor: "transparent",
            cursor: "pointer",
            padding: 0,
            zIndex: 10,
          }}
        >
          {f.hasParts
            ? <FishPartsView
                fishItemId={f.shopItemId}
                size={fishSize}
                flipped={((f.facingDirection !== "left") !== f.facingRight)}
                isSeaAnimal={f.isSeaAnimal ?? false}
              />
            : f.imageUrl
              ? <img src={f.imageUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none", transform: ((f.facingDirection !== "left") !== f.facingRight) ? "scaleX(-1)" : undefined }} draggable={false} />
              : <img src={fishCommonIconPH} alt="" style={{ width: 34, height: 34, objectFit: "contain", opacity: 0.7, pointerEvents: "none", userSelect: "none" }} draggable={false} />}
        </button>
        );
      })}

      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", marginTop: 16, animation: "aqSlideIn 0.5s ease-out" }}>
        <h2 className="font-fantasy text-base tracking-[0.3em]" style={{ color: AQ_TEAL, textShadow: "0 0 16px rgba(94,234,212,0.7),0 0 32px rgba(94,234,212,0.3)" }}>AQUARIUM</h2>
        <div style={{ height: 1, width: 80, marginTop: 4, background: "linear-gradient(90deg,transparent,rgba(94,234,212,0.5),transparent)" }}/>
      </div>

      <button
        data-testid="button-close-aquarium"
        onClick={onClose}
        className="absolute z-50 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm active:scale-90 transition-transform"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 12, background: "rgba(2,9,20,0.85)", border: `1.5px solid rgba(94,234,212,0.45)`, color: AQ_TEAL, cursor: "pointer", boxShadow: "0 0 10px rgba(94,234,212,0.2)" }}
      >✕</button>

      {aquariumFish.length === 0 && !showPanel && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: "48%" }}>
          <p className="font-fantasy text-xs text-center tracking-wider px-8 leading-relaxed" style={{ color: "rgba(94,234,212,0.4)" }}>
            Open your fish bag and drag or tap a fish to add it to your aquarium
          </p>
        </div>
      )}

      {aquariumFish.length > 0 && (
        <div className="absolute pointer-events-none" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,234,212,0.45)" }}>
            {aquariumFish.length}/{AQ_MAX} fish · tap a fish to release it
          </span>
        </div>
      )}

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

      {showPanel && (
        <div
          className="absolute left-0 right-0 z-40 rounded-t-2xl"
          style={{
            bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 88px)",
            background: "rgba(2,10,24,0.97)",
            border: "1px solid rgba(94,234,212,0.28)",
            backdropFilter: "blur(14px)",
            animation: "aqPanelUp 0.25s ease-out",
            maxHeight: "46vh",
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
                  // Player can keep adding as long as they own un-placed fish
                  // of this species and the tank isn't full overall.
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
              width: 220,
              padding: "22px 20px 18px",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 60, height: 60, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center",
              filter: "drop-shadow(0 0 10px rgba(94,234,212,0.5))" }}>
              {pendingRemove.imageUrl
                ? <img src={pendingRemove.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                : <img src={fishCommonIconPH} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} draggable={false} />}
            </div>

            <p className="font-fantasy text-[11px] tracking-wider text-center mb-1" style={{ color: AQ_TEAL }}>
              {pendingRemove.name}
            </p>
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
              style={{
                background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(56,189,248,0.18))",
                border: "1.5px solid rgba(94,234,212,0.55)",
                color: AQ_TEAL,
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(94,234,212,0.2)",
              }}
            >
              Return to Bag
            </button>
            <button
              data-testid="button-keep-fish-in-aquarium"
              onClick={() => setPendingRemove(null)}
              className="w-full rounded-xl py-2 font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{
                background: "transparent",
                border: "1px solid rgba(94,234,212,0.18)",
                color: "rgba(94,234,212,0.45)",
                cursor: "pointer",
              }}
            >
              Keep Swimming
            </button>
          </div>
        </div>
      )}

      {dragging && (
        <div className="fixed pointer-events-none" style={{
          zIndex: 9999,
          left: dragging.gx - 27,
          top: dragging.gy - 27,
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
