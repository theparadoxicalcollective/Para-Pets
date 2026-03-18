import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Star, Trash2 } from "lucide-react";
import fishingBg from "@assets/fishing_bg_portrait.png";
import poleIcon from "@assets/icon_fishing_pole.png";
import baitIcon from "@assets/icon_fishing_bait.png";
import fishInvIcon from "@assets/icon_fish_inventory.png";
import brokenRodIcon from "@assets/broken_rod.svg";
import bobberIcon from "@assets/Photoroom_20260317_35839_PM_1773781228635.png";
import { playPlop, playCatch } from "@/lib/sounds";

interface FishingPageProps {
  locationId: string;
  locationName: string;
  bgUrl: string | null;
  user: {
    id: string;
    username: string;
    coins: number;
    isAdmin: boolean;
  };
  onClose: () => void;
}

interface ShopItem {
  id: string;
  name: string;
  imageUrl: string | null;
  hooklessImageUrl?: string | null;
  type: string;
  fishingType: string | null;
  starRarity: number | null;
  rareCatchBoostPercent: number | null;
  rarityBoostPercent: number | null;
  poleMaxUses?: number | null;
}

interface EquipmentData {
  equipment: { poleInventoryId: string | null; baitInventoryId: string | null } | null;
  poleItem: ShopItem | null;
  baitItem: ShopItem | null;
  poleUsesLeft: number | null;
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  fishingType?: string | null;
  poleMaxUses?: number | null;
  poleUsesLeft?: number | null;
}

interface PondFishEntry {
  id: string;
  shopItemId: string;
  item: ShopItem | null;
}

interface CaughtFish {
  id: string;
  shopItemId: string;
  caughtAt: string;
  item: ShopItem | null;
}

type FishingPhase = "idle" | "casting" | "waiting" | "nibble" | "reeling" | "caught" | "missed";

const ACCENT = "#5eead4";
const NIBBLE_TIMEOUT = 1200; // ms per nibble pulse (3 pulses = 3.6s total)
const FISH_ZONE_SIZE = 0.13;

export default function FishingPage({ locationId, locationName, bgUrl, user, onClose }: FishingPageProps) {
  const [phase, setPhase] = useState<FishingPhase>("idle");
  const [showPolePanel, setShowPolePanel] = useState(false);
  const [showBaitPanel, setShowBaitPanel] = useState(false);
  const [showFishInv, setShowFishInv] = useState(false);
  const [showPondAdmin, setShowPondAdmin] = useState(false);
  const [showNoPoleModal, setShowNoPoleModal] = useState(false);
  const [reelBarState, setReelBarState] = useState<{
    fishPos: number;
    catchZonePos: number;
    catchMeter: number;
    isOverlap: boolean;
    isSurging: boolean;
    catchZoneSize: number;
    timeLeft: number;
  } | null>(null);
  const [caughtItem, setCaughtItem] = useState<ShopItem | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgError, setBgError] = useState(false);
  const nibbleRarityRef = useRef<number>(1);
  const [nibbleCount, setNibbleCount] = useState(0);
  const nibbleCountRef = useRef(0);
  const nibbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const castingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<FishingPhase>("idle");
  const rafRef = useRef<number | null>(null);
  const catchZoneVelRef = useRef(0);
  const isHoldingRef = useRef(false);
  const poleSlotRef = useRef<HTMLDivElement>(null);
  const baitSlotRef = useRef<HTMLDivElement>(null);
  const pendingDragRef = useRef<{ item: InventoryItem; slot: "pole" | "bait"; startX: number; startY: number } | null>(null);
  const dragItemRef = useRef<{ item: InventoryItem; slot: "pole" | "bait" } | null>(null);
  const dropTargetRef = useRef<"pole" | "bait" | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; item: InventoryItem } | null>(null);
  const [dropTarget, setDropTarget] = useState<"pole" | "bait" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: equipData } = useQuery<EquipmentData>({
    queryKey: ["/api/fishing/equipment"],
    staleTime: 0,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const { data: fishInventory = [] } = useQuery<CaughtFish[]>({
    queryKey: ["/api/fishing/inventory"],
    staleTime: 0,
  });

  const { data: pondFish = [] } = useQuery<PondFishEntry[]>({
    queryKey: ["/api/location", locationId, "pond-fish"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${locationId}/pond-fish`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
  });

  const poles = inventory.filter(i => i.type === "fishing" && i.fishingType === "pole");
  const baits = inventory.filter(i => i.type === "fishing" && i.fishingType === "bait");

  const equipMutation = useMutation({
    mutationFn: async ({ inventoryId, slot }: { inventoryId: string; slot: "pole" | "bait" }) => {
      const res = await apiRequest("POST", "/api/fishing/equip", { inventoryId, slot });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/equipment"] });
    },
    onError: (err: Error) => {
      toast({ title: "Equip failed", description: err.message, variant: "destructive" });
    },
  });

  const unequipMutation = useMutation({
    mutationFn: async ({ slot }: { slot: "pole" | "bait" }) => {
      const res = await apiRequest("POST", "/api/fishing/unequip", { slot });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/equipment"] });
    },
    onError: (err: Error) => {
      toast({ title: "Unequip failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteInventoryItemMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      await apiRequest("DELETE", `/api/inventory/${inventoryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/equipment"] });
      toast({ title: "Removed", description: "Broken rod removed from inventory" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const catchMutation = useMutation({
    mutationFn: async (performanceScore: number) => {
      const res = await apiRequest("POST", "/api/fishing/catch", { locationId, performanceScore });
      return res.json();
    },
    onSuccess: (data: { caught: CaughtFish | null; item?: ShopItem; reason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/equipment"] });
      if (data.caught && data.item) {
        setCaughtItem(data.item);
        setPhase("caught");
        queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      } else {
        setPhase("missed");
      }
    },
    onError: () => {
      setPhase("missed");
    },
  });

  const addPondFishMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/pond-fish`, { shopItemId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "pond-fish"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const removePondFishMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/location/${locationId}/pond-fish/${shopItemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", locationId, "pond-fish"] });
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: allFishItems = [] } = useQuery<ShopItem[]>({
    queryKey: ["/api/admin/fish-items"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop-items-all", { credentials: "include" });
      if (!res.ok) return [];
      const items: ShopItem[] = await res.json();
      return items.filter(i => i.type === "fishing" && i.fishingType === "fish");
    },
    enabled: user.isAdmin && showPondAdmin,
    staleTime: 0,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearAllTimers = useCallback(() => {
    if (nibbleTimeoutRef.current) { clearTimeout(nibbleTimeoutRef.current); nibbleTimeoutRef.current = null; }
    if (castingTimeoutRef.current) { clearTimeout(castingTimeoutRef.current); castingTimeoutRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const equipMutateRef = useRef(equipMutation.mutate);
  useEffect(() => { equipMutateRef.current = equipMutation.mutate; });

  const catchMutateRef = useRef(catchMutation.mutate);
  useEffect(() => { catchMutateRef.current = catchMutation.mutate; });

  const startItemDrag = useCallback((item: InventoryItem, slot: "pole" | "bait", startX: number, startY: number) => {
    pendingDragRef.current = { item, slot, startX, startY };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !dragItemRef.current) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (dist > 8) {
          dragItemRef.current = { item: pending.item, slot: pending.slot };
          pendingDragRef.current = null;
          setGhostPos({ x: e.clientX, y: e.clientY, item: pending.item });
        }
      }
      if (dragItemRef.current) {
        setGhostPos(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        let target: "pole" | "bait" | null = null;
        if (poleSlotRef.current) {
          const r = poleSlotRef.current.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) target = "pole";
        }
        if (baitSlotRef.current) {
          const r = baitSlotRef.current.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) target = "bait";
        }
        dropTargetRef.current = target;
        setDropTarget(target);
      }
    };
    const onUp = () => {
      const drag = dragItemRef.current;
      const target = dropTargetRef.current;
      if (drag && target && target === drag.slot) {
        equipMutateRef.current({ inventoryId: drag.item.inventoryId, slot: target });
      }
      pendingDragRef.current = null;
      dragItemRef.current = null;
      dropTargetRef.current = null;
      setGhostPos(null);
      setDropTarget(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  const startCasting = useCallback(() => {
    if (!equipData?.poleItem || poleIsBroken) {
      setShowNoPoleModal(true);
      return;
    }
    if (pondFish.length === 0) {
      toast({ title: "Empty pond", description: "No fish in this pond yet.", variant: "destructive" });
      return;
    }
    playPlop();
    setPhase("casting");
    castingTimeoutRef.current = setTimeout(() => {
      setPhase("waiting");
      const waitTime = 1500 + Math.random() * 2500;
      nibbleTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === "waiting") {
          // Weighted selection — higher rarity fish appear less often
          const rarityWeights: Record<number, number> = { 1: 40, 2: 25, 3: 15, 4: 7, 5: 3 };
          const weights = pondFish.map(f => rarityWeights[f?.item?.starRarity ?? 1] ?? 20);
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          let roll = Math.random() * totalWeight;
          let randomFish = pondFish[pondFish.length - 1];
          for (let i = 0; i < pondFish.length; i++) {
            roll -= weights[i];
            if (roll <= 0) { randomFish = pondFish[i]; break; }
          }
          nibbleRarityRef.current = randomFish?.item?.starRarity ?? 1;
          // Start 3-nibble sequence
          nibbleCountRef.current = 1;
          setNibbleCount(1);
          setPhase("nibble");
          // Each nibble lasts 1.2s; after all 3 pass the fish escapes
          const scheduleNibble = () => {
            nibbleTimeoutRef.current = setTimeout(() => {
              if (phaseRef.current !== "nibble") return;
              const next = nibbleCountRef.current + 1;
              if (next > 3) {
                setPhase("missed");
                return;
              }
              nibbleCountRef.current = next;
              setNibbleCount(next);
              scheduleNibble();
            }, NIBBLE_TIMEOUT);
          };
          scheduleNibble();
        }
      }, waitTime);
    }, 1000);
  }, [equipData, pondFish, toast]);

  const startReeling = useCallback(() => {
    const rarity = Math.max(1, Math.min(5, nibbleRarityRef.current));

    // Per-rarity tuning — hold-to-rise mechanic; higher stars = faster fish + smaller zone
    //                         1★      2★      3★      4★      5★
    const speedByRarity   = [0.003,  0.006,  0.010,  0.014,  0.019];
    const fillByRarity    = [0.009,  0.008,  0.007,  0.006,  0.005];
    const drainByRarity   = [0.003,  0.004,  0.005,  0.006,  0.007];
    const zoneByRarity    = [0.30,   0.25,   0.21,   0.17,   0.14];
    // Surge frequency scales with rarity
    const surgeChance     = 0.006 + (rarity - 1) * 0.007;
    // Direction-change window (frames): wider = slower, narrower = more chaotic
    const dirBaseTimer    = Math.round(100 - (rarity - 1) * 16);

    const REEL_TIMEOUT_MS = 30000;

    const baseSpeed  = speedByRarity[rarity - 1];
    const fillRate   = fillByRarity[rarity - 1];
    const drainRate  = drainByRarity[rarity - 1];
    const czSize     = zoneByRarity[rarity - 1];

    // Zone starts at rest at the bottom; player holds to rise
    catchZoneVelRef.current = 0;
    isHoldingRef.current = false;

    let fishPos = 0.25 + Math.random() * 0.5;
    let fishDir = Math.random() > 0.5 ? 1 : -1;
    // Start catch zone near the bottom so there's room to hold-up into the fish
    let catchZonePos = Math.min(1 - czSize, 0.75);
    let catchMeter = 0.55;
    let surging = false;
    let surgeTimer = 0;
    let dirChangeTimer = dirBaseTimer + Math.floor(Math.random() * 40);
    let graceFrames = 90; // ~1.5s orientation window before drain starts

    const startTime = Date.now();

    // Set ref directly so the first RAF tick sees "reeling" before the useEffect updates it
    phaseRef.current = "reeling";
    setPhase("reeling");
    setReelBarState({ fishPos, catchZonePos, catchMeter, isOverlap: false, isSurging: false, catchZoneSize: czSize, timeLeft: 30 });

    const tick = () => {
      if (phaseRef.current !== "reeling") return;

      const elapsed = Date.now() - startTime;
      const timeLeft = Math.max(0, (REEL_TIMEOUT_MS - elapsed) / 1000);

      // 30-second timeout resolution
      if (timeLeft <= 0) {
        setReelBarState(null);
        if (catchMeter > 0.6) {
          // Meter is in the green — reward the player
          playCatch();
          catchMutateRef.current(100);
        } else {
          // Meter is red or yellow — fish escapes
          phaseRef.current = "missed";
          setPhase("missed");
        }
        return;
      }

      // Fish movement — surges move faster
      const fishSpeed = surging ? baseSpeed * 2.8 : baseSpeed;
      fishPos += fishDir * fishSpeed;
      if (fishPos <= 0) { fishPos = 0; fishDir = 1; surging = false; }
      if (fishPos >= 1 - FISH_ZONE_SIZE) { fishPos = 1 - FISH_ZONE_SIZE; fishDir = -1; surging = false; }

      // Direction flips — more frequent at higher rarity
      dirChangeTimer--;
      if (dirChangeTimer <= 0) {
        fishDir *= -1;
        dirChangeTimer = dirBaseTimer + Math.floor(Math.random() * 40);
      }

      // Surge logic — scales with rarity
      surgeTimer--;
      if (!surging && surgeTimer <= 0) {
        if (Math.random() < surgeChance) {
          surging = true;
          surgeTimer = 20 + Math.floor(Math.random() * 25);
        } else {
          surgeTimer = 10 + Math.floor(Math.random() * 15);
        }
      }
      if (surging && surgeTimer <= 0) surging = false;

      // Catch zone physics — HOLD-TO-RISE mechanic:
      // Holding lifts the zone up; releasing lets gravity pull it down.
      const GRAVITY   = 0.003;
      const LIFT      = 0.004;
      const MAX_RISE  = 0.022;
      const MAX_FALL  = 0.020;
      if (isHoldingRef.current) {
        catchZoneVelRef.current = Math.min(catchZoneVelRef.current + LIFT, MAX_RISE);
      } else {
        catchZoneVelRef.current = Math.max(catchZoneVelRef.current - GRAVITY, -MAX_FALL);
      }
      catchZonePos = Math.max(0, Math.min(1 - czSize, catchZonePos - catchZoneVelRef.current));

      // Overlap detection
      const overlap =
        fishPos < catchZonePos + czSize &&
        fishPos + FISH_ZONE_SIZE > catchZonePos;

      // Grace period — no draining for the first ~0.9s so the player can orient
      if (graceFrames > 0) graceFrames--;

      // Catch meter fills on overlap (green), drains slowly when not overlapping (red/yellow)
      if (overlap) {
        catchMeter = Math.min(1, catchMeter + fillRate);
      } else if (graceFrames === 0) {
        catchMeter = Math.max(0, catchMeter - drainRate);
      }

      setReelBarState({ fishPos, catchZonePos, catchMeter, isOverlap: overlap, isSurging: surging, catchZoneSize: czSize, timeLeft });

      // Instant win: meter fully filled
      if (catchMeter >= 1) {
        setReelBarState(null);
        playCatch();
        catchMutateRef.current(100);
        return;
      }
      // Instant loss: meter fully drained
      if (catchMeter <= 0 && graceFrames === 0) {
        setReelBarState(null);
        phaseRef.current = "missed";
        setPhase("missed");
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleNibbleTap = useCallback(() => {
    if (phaseRef.current !== "nibble") return;
    clearAllTimers();
    startReeling();
  }, [clearAllTimers, startReeling]);

  const resetFishing = useCallback(() => {
    setPhase("idle");
    setCaughtItem(null);
    setNibbleCount(0);
    nibbleCountRef.current = 0;
    clearAllTimers();
  }, [clearAllTimers]);

  const poleIsBroken = equipData?.poleItem != null && equipData.poleUsesLeft !== null && equipData.poleUsesLeft !== undefined && equipData.poleUsesLeft <= 0;
  const hasPole = !!equipData?.poleItem && !poleIsBroken;
  const effectiveBg = (!bgUrl || bgError) ? fishingBg : bgUrl;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, userSelect: "none", WebkitUserSelect: "none" }}
      data-testid="fishing-page"
    >
      {/* Full-screen tap layer — active only during nibble so player can tap anywhere */}
      {phase === "nibble" && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 50, cursor: "pointer" }}
          onClick={handleNibbleTap}
        />
      )}

      <img
        src={effectiveBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onLoad={() => setBgLoaded(true)}
        onError={() => { setBgError(true); setBgLoaded(true); }}
      />
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.7) 100%)",
      }} />

      {/* Magical pond surface — clickable cast zone */}
      <div
        className="absolute"
        style={{
          bottom: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "72%",
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {/* Outer glow ring */}
        <div style={{
          position: "absolute",
          inset: "-12px",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(94,234,212,0.12) 0%, rgba(56,189,248,0.06) 50%, transparent 75%)",
          animation: "pondGlow 4s ease-in-out infinite",
        }} />
        {/* Water surface oval — clickable cast target */}
        <div
          data-testid="button-cast-pond"
          onClick={() => {
            if (phase === "idle" && hasPole) startCasting();
            else if (phase === "nibble") handleNibbleTap();
          }}
          style={{
            width: "100%",
            paddingBottom: "38%",
            borderRadius: "50%",
            background: "radial-gradient(ellipse at 40% 38%, rgba(147,210,210,0.18) 0%, rgba(56,180,180,0.10) 40%, rgba(14,90,110,0.08) 70%, transparent 100%)",
            border: phase === "idle" && hasPole ? "1.5px solid rgba(94,234,212,0.55)" : "1.5px solid rgba(94,234,212,0.22)",
            boxShadow: phase === "idle" && hasPole
              ? "0 0 40px rgba(94,234,212,0.22), inset 0 0 24px rgba(94,234,212,0.10)"
              : "0 0 32px rgba(94,234,212,0.10), inset 0 0 24px rgba(94,234,212,0.05)",
            animation: "pondDrift 8s ease-in-out infinite",
            position: "relative",
            overflow: "hidden",
            pointerEvents: (phase === "idle" || phase === "nibble") ? "auto" : "none",
            cursor: (phase === "idle" && hasPole) || phase === "nibble" ? "pointer" : "default",
          }}
        >
          {/* shimmer streaks */}
          <div style={{
            position: "absolute", top: "28%", left: "20%", width: "22%", height: "2px",
            background: "rgba(200,240,240,0.25)", borderRadius: 4,
            animation: "shimmer1 5s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", top: "52%", left: "55%", width: "14%", height: "1.5px",
            background: "rgba(200,240,240,0.18)", borderRadius: 4,
            animation: "shimmer2 7s ease-in-out infinite",
          }} />
          {phase === "idle" && hasPole && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span className="font-fantasy text-[10px] tracking-widest animate-pulse" style={{
                color: "rgba(94,234,212,0.75)",
                textShadow: "0 0 8px rgba(94,234,212,0.5)",
                userSelect: "none",
              }}>TAP TO CAST</span>
            </div>
          )}
        </div>
        {/* Lily pad icon (decorative) */}
        <div style={{
          position: "absolute",
          top: "10%", left: "62%",
          width: 22, height: 22,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,200,130,0.55), rgba(34,140,80,0.30))",
          border: "1px solid rgba(100,220,140,0.35)",
          animation: "lilyFloat 6s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute",
          top: "38%", left: "15%",
          width: 14, height: 14,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,200,130,0.45), rgba(34,140,80,0.20))",
          border: "1px solid rgba(100,220,140,0.25)",
          animation: "lilyFloat 8s ease-in-out infinite 1s",
        }} />
      </div>

      {!bgLoaded && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(8,5,20,1)" }}>
          <div className="animate-spin rounded-full" style={{ width: 48, height: 48, border: `3px solid ${ACCENT}25`, borderTopColor: ACCENT }} />
        </div>
      )}

      {showNoPoleModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(4,2,12,0.75)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowNoPoleModal(false)}>
          <div
            className="flex flex-col items-center gap-5 rounded-2xl px-8 py-8 mx-6 text-center"
            style={{
              background: "linear-gradient(145deg, rgba(10,5,20,0.97) 0%, rgba(18,8,35,0.97) 100%)",
              border: `1.5px solid ${ACCENT}40`,
              boxShadow: `0 8px 40px rgba(0,0,0,0.8), 0 0 30px ${ACCENT}15`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={poleIcon} alt="Fishing Pole" className="w-16 h-16 object-contain opacity-80" />
            <div>
              <p className="font-fantasy text-lg tracking-widest font-semibold mb-1" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}50` }}>
                {poleIsBroken ? "Pole is Broken" : "No Pole Equipped"}
              </p>
              <p className="font-fantasy text-sm tracking-wide" style={{ color: `${ACCENT}99` }}>
                {poleIsBroken ? "Remove your broken pole and equip a new one" : "Equip a fishing pole to start fishing"}
              </p>
            </div>
            <button
              data-testid="button-no-pole-close"
              onClick={() => setShowNoPoleModal(false)}
              className="font-fantasy text-sm tracking-[0.15em] px-6 py-2.5 rounded-xl transition-transform active:scale-95"
              style={{
                background: `linear-gradient(135deg, rgba(10,5,20,0.9) 0%, rgba(20,10,40,0.9) 100%)`,
                border: `1.5px solid ${ACCENT}60`,
                color: ACCENT,
                boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 16px ${ACCENT}20`,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style>{FISHING_ANIMATIONS}</style>

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pb-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
        <div>
          <h3 className="font-fantasy text-base tracking-widest font-semibold" style={{ color: ACCENT, textShadow: `0 0 10px ${ACCENT}40` }} data-testid="text-fishing-location-name">
            {locationName}
          </h3>
          <p className="font-fantasy text-[10px] tracking-wider" style={{ color: `${ACCENT}88` }}>
            {phase === "idle" ? (poleIsBroken ? "Your pole broke! Remove it from the slot" : hasPole ? "Tap the water to cast" : "Equip a pole to fish") :
             phase === "casting" ? "Casting..." :
             phase === "waiting" ? "Waiting for a bite..." :
             phase === "nibble" ? "Something's biting — tap anywhere!" :
             phase === "reeling" ? "Hold to reel it in!" :
             phase === "caught" ? "You caught something!" : "It got away..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <button
              data-testid="button-pond-admin"
              onClick={() => setShowPondAdmin(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{ background: `${ACCENT}30`, border: `2px solid ${ACCENT}60`, color: ACCENT, cursor: "pointer" }}
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
          <button
            data-testid="button-close-fishing"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${ACCENT}40`, color: ACCENT, cursor: "pointer" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Ripple ring — waiting only, sized to match bobber */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {phase === "waiting" && (
          <div className="absolute" style={{
            bottom: "20%", left: "50%", transform: "translate(-50%, 50%)",
            width: 72, height: 36,
            borderRadius: "50%",
            border: `2px solid ${ACCENT}60`,
            animation: "rippleRing 2s ease-out infinite",
          }} />
        )}
      </div>

      {/* Bobber — waiting phase: gentle float, centered on ripple ring */}
      {phase === "waiting" && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "20%", left: "50%",
          animation: "bobFloat 1.2s ease-in-out infinite",
          transform: "translate(-50%, 0)",
          background: "transparent",
        }}>
          <img src={bobberIcon} alt="" style={{
            width: 70, height: 70,
            display: "block",
            background: "transparent",
            filter: "drop-shadow(0 0 8px rgba(94,234,212,0.85))",
          }} />
        </div>
      )}

      {/* Bobber — nibble phase: aggressive dip with ripples */}
      {phase === "nibble" && (
        <div className="absolute pointer-events-none z-[15]" style={{ bottom: "20%", left: "50%", background: "transparent" }}>
          {/* Expanding ripple rings */}
          <div style={{
            position: "absolute", width: 40, height: 20,
            borderRadius: "50%",
            border: `2px solid ${ACCENT}80`,
            animation: "nibbleRippleOut 0.7s ease-out infinite",
            left: "50%", top: "50%", marginLeft: -20, marginTop: -10,
          }} />
          <div style={{
            position: "absolute", width: 40, height: 20,
            borderRadius: "50%",
            border: `2px solid ${ACCENT}50`,
            animation: "nibbleRippleOut 0.7s ease-out infinite 0.35s",
            left: "50%", top: "50%", marginLeft: -20, marginTop: -10,
          }} />
          {/* Bobber dipping */}
          <img src={bobberIcon} alt="" style={{
            width: 70, height: 70,
            display: "block",
            background: "transparent",
            transform: "translate(-50%, 0)",
            animation: "nibbleDip 0.9s ease-in-out infinite",
            filter: "drop-shadow(0 0 10px rgba(94,234,212,0.9)) drop-shadow(0 0 16px rgba(109,40,217,0.5))",
          }} />
        </div>
      )}

      {phase === "casting" && equipData?.poleItem?.imageUrl && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "20%", left: "0%",
          width: 160, height: 160,
          animation: "poleCast 1s ease-in-out forwards",
          transformOrigin: "bottom left",
        }}>
          <img src={equipData.poleItem.imageUrl} alt="" className="w-full h-full object-contain" style={{
            filter: `drop-shadow(0 0 10px ${ACCENT}80)`,
          }} />
        </div>
      )}

      {(phase === "waiting" || phase === "nibble") && equipData?.poleItem?.imageUrl && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "20%", left: "0%",
          width: 160, height: 160,
          transform: "rotate(-52deg)",
          transformOrigin: "bottom left",
          animation: "poleHold 2s ease-in-out infinite",
        }}>
          <img
            src={equipData.poleItem.hooklessImageUrl || equipData.poleItem.imageUrl}
            alt=""
            className="w-full h-full object-contain"
            style={{ filter: `drop-shadow(0 0 10px ${ACCENT}70)` }}
          />
        </div>
      )}

      {phase === "reeling" && reelBarState && (
        <ReelBar
          fishPos={reelBarState.fishPos}
          catchZonePos={reelBarState.catchZonePos}
          catchMeter={reelBarState.catchMeter}
          isOverlap={reelBarState.isOverlap}
          isSurging={reelBarState.isSurging}
          catchZoneSize={reelBarState.catchZoneSize}
          timeLeft={reelBarState.timeLeft}
          onHoldChange={(holding) => { isHoldingRef.current = holding; }}
        />
      )}

      {phase === "caught" && caughtItem && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" onClick={resetFishing}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />
          <div className="relative z-10 flex flex-col items-center gap-4 p-6 rounded-2xl" style={{
            background: "linear-gradient(135deg, rgba(8,40,30,0.95), rgba(5,25,20,0.95))",
            border: `2px solid ${ACCENT}80`,
            boxShadow: `0 0 60px ${ACCENT}30`,
            animation: "catchPop 0.4s ease-out",
          }}>
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{
              background: `radial-gradient(circle, ${ACCENT}20, transparent)`,
              animation: "catchGlow 1.5s ease-in-out infinite",
            }}>
              {caughtItem.imageUrl ? (
                <img src={caughtItem.imageUrl} alt="" className="w-20 h-20 object-contain" data-testid="img-caught-fish" />
              ) : (
                <span className="text-5xl">🐟</span>
              )}
            </div>
            <h3 className="font-fantasy text-lg tracking-widest" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}60` }} data-testid="text-caught-fish-name">
              {caughtItem.name}
            </h3>
            {caughtItem.starRarity && (
              <div className="flex gap-0.5">
                {Array.from({ length: caughtItem.starRarity }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            )}
            <p className="font-fantasy text-[10px] tracking-wider" style={{ color: `${ACCENT}88` }}>Tap to continue</p>
          </div>
        </div>
      )}

      {phase === "missed" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" onClick={resetFishing}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
          <div className="relative z-10 flex flex-col items-center gap-3 p-6 rounded-2xl" style={{
            background: "linear-gradient(135deg, rgba(30,15,8,0.95), rgba(20,10,5,0.95))",
            border: "2px solid rgba(239,115,68,0.5)",
            animation: "catchPop 0.4s ease-out",
          }}>
            <span className="text-5xl" style={{ display: "block", animation: "missWiggle 0.6s ease-in-out" }}>💨</span>
            <h3 className="font-fantasy text-lg tracking-widest" style={{ color: "#ef7344" }}>
              It got away!
            </h3>
            <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(239,115,68,0.7)" }}>Tap to try again</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20" style={{
        background: "linear-gradient(0deg, rgba(5,15,12,0.95) 0%, rgba(5,15,12,0.8) 70%, transparent 100%)",
        paddingTop: 20,
        paddingBottom: 24,
      }}>
        <div className="flex items-end justify-center gap-4 px-4">
          <div ref={poleSlotRef}>
            <EquipSlot
              label="Pole"
              defaultIcon={poleIcon}
              equippedItem={poleIsBroken ? equipData!.poleItem : (equipData?.poleItem || null)}
              isActive={showPolePanel}
              broken={poleIsBroken}
              usesLeft={equipData?.poleUsesLeft}
              maxUses={equipData?.poleItem?.poleMaxUses}
              isDropTarget={dropTarget === "pole"}
              onClick={() => {
                setShowPolePanel(p => !p);
                setShowBaitPanel(false);
                setShowFishInv(false);
              }}
              testId="button-pole-slot"
            />
          </div>
          <div ref={baitSlotRef}>
            <EquipSlot
              label="Bait"
              defaultIcon={baitIcon}
              equippedItem={equipData?.baitItem || null}
              isActive={showBaitPanel}
              isDropTarget={dropTarget === "bait"}
              onClick={() => {
                if (equipData?.baitItem) {
                  unequipMutation.mutate({ slot: "bait" });
                  setShowBaitPanel(false);
                } else {
                  setShowBaitPanel(p => !p);
                  setShowPolePanel(false);
                  setShowFishInv(false);
                }
              }}
              testId="button-bait-slot"
            />
          </div>
          <EquipSlot
            label="Fish"
            defaultIcon={fishInvIcon}
            equippedItem={null}
            isActive={showFishInv}
            noDim
            onClick={() => { setShowFishInv(!showFishInv); setShowPolePanel(false); setShowBaitPanel(false); }}
            testId="button-fish-inventory"
          />
        </div>
      </div>

      {showPolePanel && (
        <EquipPanel
          title="Fishing Poles"
          items={poles}
          equippedInventoryId={equipData?.equipment?.poleInventoryId || null}
          slot="pole"
          onEquip={(invId) => equipMutation.mutate({ inventoryId: invId, slot: "pole" })}
          onUnequip={() => unequipMutation.mutate({ slot: "pole" })}
          onClose={() => setShowPolePanel(false)}
          onDeleteItem={(invId) => deleteInventoryItemMutation.mutate(invId)}
          onItemPointerDown={startItemDrag}
        />
      )}
      {showBaitPanel && (
        <EquipPanel
          title="Bait"
          items={baits}
          equippedInventoryId={equipData?.equipment?.baitInventoryId || null}
          slot="bait"
          onEquip={(invId) => equipMutation.mutate({ inventoryId: invId, slot: "bait" })}
          onUnequip={() => unequipMutation.mutate({ slot: "bait" })}
          onClose={() => setShowBaitPanel(false)}
          onItemPointerDown={startItemDrag}
        />
      )}
      {showFishInv && (
        <FishInventoryPanel
          fishInventory={fishInventory}
          onClose={() => setShowFishInv(false)}
        />
      )}

      {showPondAdmin && user.isAdmin && (
        <PondAdminPanel
          locationId={locationId}
          pondFish={pondFish}
          allFishItems={allFishItems}
          onAdd={(shopItemId) => addPondFishMutation.mutate(shopItemId)}
          onRemove={(shopItemId) => removePondFishMutation.mutate(shopItemId)}
          onClose={() => setShowPondAdmin(false)}
        />
      )}

      {ghostPos && (
        <div
          className="fixed pointer-events-none z-[9999] flex items-center justify-center rounded-xl"
          style={{
            left: ghostPos.x - 28,
            top: ghostPos.y - 28,
            width: 56,
            height: 56,
            background: "rgba(5,20,15,0.92)",
            border: `2px solid ${ACCENT}`,
            boxShadow: `0 0 18px ${ACCENT}60`,
            opacity: 0.9,
          }}
        >
          {ghostPos.item.imageUrl ? (
            <img src={ghostPos.item.imageUrl} alt="" className="w-10 h-10 object-contain" />
          ) : (
            <span className="text-2xl">{ghostPos.item.fishingType === "pole" ? "🎣" : "🪱"}</span>
          )}
        </div>
      )}
    </div>
  );
}

function EquipSlot({
  label, defaultIcon, equippedItem, isActive, onClick, badgeCount, testId, noDim, broken, usesLeft, maxUses, isDropTarget,
}: {
  label: string;
  defaultIcon: string;
  equippedItem: ShopItem | null;
  isActive: boolean;
  onClick: () => void;
  badgeCount?: number;
  testId: string;
  noDim?: boolean;
  broken?: boolean;
  usesLeft?: number | null;
  maxUses?: number | null;
  isDropTarget?: boolean;
}) {
  const imgSrc = broken ? brokenRodIcon : (equippedItem?.imageUrl || defaultIcon);
  const bright = noDim || !!equippedItem;
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 transition-transform active:scale-95"
      style={{ cursor: "pointer" }}
    >
      <div className="relative w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden" style={{
        background: broken ? "rgba(60,10,10,0.85)" : isDropTarget ? `${ACCENT}35` : isActive ? `${ACCENT}20` : "rgba(5,20,15,0.85)",
        border: `2px solid ${broken ? "rgba(220,50,50,0.6)" : isDropTarget ? "#ffffff" : isActive ? ACCENT : `${ACCENT}40`}`,
        boxShadow: broken ? "0 0 12px rgba(200,30,30,0.25)" : isDropTarget ? `0 0 24px ${ACCENT}80, 0 0 8px #fff4` : isActive ? `0 0 16px ${ACCENT}30` : "0 2px 8px rgba(0,0,0,0.4)",
        transition: "all 0.12s ease",
        transform: isDropTarget ? "scale(1.1)" : "scale(1)",
      }}>
        <img src={imgSrc} alt="" className="w-12 h-12 object-contain" style={{
          filter: broken ? "none" : bright ? "none" : "brightness(0.5) saturate(0.5)",
        }} />
        {badgeCount !== undefined && badgeCount > 0 && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: ACCENT, color: "#0a1a14" }}>
            {badgeCount}
          </div>
        )}
        {!broken && usesLeft !== null && usesLeft !== undefined && maxUses != null && (() => {
          const pct = Math.max(0, usesLeft / maxUses);
          const barColor = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
          return (
            <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5">
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.5)" }}>
                <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 2, background: barColor, transition: "width 0.3s ease" }} />
              </div>
            </div>
          );
        })()}
      </div>
      <span className="font-fantasy text-[9px] tracking-wider" style={{ color: broken ? "rgba(220,80,80,0.9)" : bright ? ACCENT : `${ACCENT}60` }}>
        {broken ? "BROKEN" : equippedItem ? equippedItem.name : label}
      </span>
    </button>
  );
}

function EquipPanel({
  title, items, equippedInventoryId, slot, onEquip, onUnequip, onClose, onDeleteItem, onItemPointerDown,
}: {
  title: string;
  items: InventoryItem[];
  equippedInventoryId: string | null;
  slot: "pole" | "bait";
  onEquip: (inventoryId: string) => void;
  onUnequip: () => void;
  onClose: () => void;
  onDeleteItem?: (inventoryId: string) => void;
  onItemPointerDown?: (item: InventoryItem, slot: "pole" | "bait", x: number, y: number) => void;
}) {
  return (
    <div className="absolute bottom-[140px] left-4 right-4 z-[25] rounded-xl overflow-hidden" style={{
      background: "rgba(5,20,15,0.95)",
      border: `1px solid ${ACCENT}40`,
      backdropFilter: "blur(8px)",
      maxHeight: 200,
      animation: "slideUp 0.2s ease-out",
    }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${ACCENT}20` }}>
        <h4 className="font-fantasy text-xs tracking-widest" style={{ color: ACCENT }}>{title}</h4>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center" style={{ color: `${ACCENT}80`, cursor: "pointer" }}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-2" style={{ maxHeight: 150, scrollbarWidth: "thin" }}>
        {items.length === 0 ? (
          <p className="font-fantasy text-[10px] text-center py-4" style={{ color: `${ACCENT}50` }}>
            No {slot}s in inventory. Buy some from a shop!
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {items.map(item => {
              const isEquipped = item.inventoryId === equippedInventoryId;
              const isBroken = slot === "pole" && item.poleUsesLeft !== null && item.poleUsesLeft !== undefined && item.poleUsesLeft <= 0;
              return (
                <div key={item.inventoryId} className="relative">
                  <button
                    data-testid={`button-equip-${slot}-${item.inventoryId}`}
                    onClick={() => {
                      if (isBroken) return;
                      isEquipped ? onUnequip() : onEquip(item.inventoryId);
                    }}
                    onPointerDown={(e) => {
                      if (isBroken) return;
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      onItemPointerDown?.(item, slot, e.clientX, e.clientY);
                    }}
                    className="w-full flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all"
                    style={{
                      background: isBroken ? "rgba(50,10,10,0.6)" : isEquipped ? `${ACCENT}25` : "rgba(0,0,0,0.3)",
                      border: `1.5px solid ${isBroken ? "rgba(200,50,50,0.5)" : isEquipped ? ACCENT : `${ACCENT}20`}`,
                      cursor: isBroken ? "default" : "grab",
                      touchAction: "none",
                    }}
                  >
                    <div className="w-10 h-10 flex items-center justify-center">
                      {isBroken ? (
                        <img src={brokenRodIcon} alt="broken" className="w-full h-full object-contain" />
                      ) : item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xl">{slot === "pole" ? "🎣" : "🪱"}</span>
                      )}
                    </div>
                    {slot === "pole" && !isBroken && item.poleMaxUses != null && item.poleUsesLeft != null && (() => {
                      const pct = Math.max(0, item.poleUsesLeft / item.poleMaxUses);
                      const barColor = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
                      return (
                        <div className="w-full px-0.5">
                          <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(0,0,0,0.5)" }}>
                            <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 2, background: barColor }} />
                          </div>
                        </div>
                      );
                    })()}
                    <span className="font-fantasy text-[7px] text-center truncate w-full" style={{ color: isBroken ? "rgba(220,80,80,0.9)" : isEquipped ? ACCENT : `${ACCENT}80` }}>
                      {isBroken ? "BROKEN" : item.name}
                    </span>
                    {isEquipped && !isBroken && (
                      <span className="font-fantasy text-[6px]" style={{ color: "#fbbf24" }}>EQUIPPED</span>
                    )}
                  </button>
                  {isBroken && onDeleteItem && (
                    <button
                      data-testid={`button-delete-broken-pole-${item.inventoryId}`}
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item.inventoryId); }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{ background: "rgba(200,30,30,0.95)", border: "2px solid rgba(255,100,100,0.8)", cursor: "pointer", zIndex: 10, boxShadow: "0 0 6px rgba(200,30,30,0.5)" }}
                    >
                      <X className="w-3.5 h-3.5" style={{ color: "#fff" }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FishInventoryPanel({
  fishInventory, onClose,
}: {
  fishInventory: CaughtFish[];
  onClose: () => void;
}) {
  const grouped = new Map<string, { item: ShopItem | null; count: number }>();
  for (const cf of fishInventory) {
    const existing = grouped.get(cf.shopItemId);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(cf.shopItemId, { item: cf.item, count: 1 });
    }
  }

  return (
    <div className="absolute bottom-[140px] left-4 right-4 z-[25] rounded-xl overflow-hidden" style={{
      background: "rgba(5,20,15,0.95)",
      border: `1px solid ${ACCENT}40`,
      backdropFilter: "blur(8px)",
      maxHeight: 240,
      animation: "slideUp 0.2s ease-out",
    }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${ACCENT}20` }}>
        <h4 className="font-fantasy text-xs tracking-widest" style={{ color: ACCENT }}>Fish Collection</h4>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center" style={{ color: `${ACCENT}80`, cursor: "pointer" }}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-2" style={{ maxHeight: 190, scrollbarWidth: "thin" }}>
        {fishInventory.length === 0 ? (
          <p className="font-fantasy text-[10px] text-center py-4" style={{ color: `${ACCENT}50` }}>
            No fish caught yet. Cast your line!
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Array.from(grouped.entries()).map(([shopItemId, { item, count }]) => (
              <div key={shopItemId} className="flex flex-col items-center gap-1 p-2 rounded-lg" style={{
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${ACCENT}20`,
              }}>
                <div className="w-12 h-12 flex items-center justify-center">
                  {item?.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl">🐟</span>
                  )}
                </div>
                <span className="font-fantasy text-[8px] text-center truncate w-full" style={{ color: `${ACCENT}cc` }}>
                  {item?.name || "Unknown"}
                </span>
                {item?.starRarity && (
                  <div className="flex gap-px">
                    {Array.from({ length: item.starRarity }).map((_, i) => (
                      <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                )}
                <span className="font-fantasy text-[7px]" style={{ color: `${ACCENT}70` }}>x{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PondAdminPanel({
  locationId, pondFish, allFishItems, onAdd, onRemove, onClose,
}: {
  locationId: string;
  pondFish: PondFishEntry[];
  allFishItems: ShopItem[];
  onAdd: (shopItemId: string) => void;
  onRemove: (shopItemId: string) => void;
  onClose: () => void;
}) {
  const stockedIds = new Set(pondFish.map(pf => pf.shopItemId));
  const availableToAdd = allFishItems.filter(fi => !stockedIds.has(fi.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[90%] max-w-sm rounded-xl overflow-hidden" style={{
        background: "linear-gradient(135deg, rgba(8,25,18,0.98), rgba(5,15,10,0.98))",
        border: `1px solid ${ACCENT}50`,
        maxHeight: "80vh",
      }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${ACCENT}20` }}>
          <h4 className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT }}>Pond Stock</h4>
          <button onClick={onClose} style={{ color: `${ACCENT}80`, cursor: "pointer" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-3" style={{ maxHeight: "65vh" }}>
          {pondFish.length > 0 && (
            <div className="mb-3">
              <p className="font-fantasy text-[9px] tracking-wider mb-2" style={{ color: `${ACCENT}70` }}>CURRENT STOCK</p>
              {pondFish.map(pf => (
                <div key={pf.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {pf.item?.imageUrl ? <img src={pf.item.imageUrl} alt="" className="w-full h-full object-contain" /> : <span>🐟</span>}
                  </div>
                  <span className="font-fantasy text-[10px] flex-1 truncate" style={{ color: `${ACCENT}cc` }}>{pf.item?.name || "Unknown"}</span>
                  {pf.item?.starRarity && (
                    <div className="flex gap-px">
                      {Array.from({ length: pf.item.starRarity }).map((_, i) => (
                        <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                  )}
                  <button
                    data-testid={`button-remove-pond-fish-${pf.shopItemId}`}
                    onClick={() => onRemove(pf.shopItemId)}
                    className="w-6 h-6 flex items-center justify-center rounded-full"
                    style={{ background: "rgba(239,68,68,0.3)", color: "#ef4444", cursor: "pointer" }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {availableToAdd.length > 0 && (
            <div>
              <p className="font-fantasy text-[9px] tracking-wider mb-2" style={{ color: `${ACCENT}70` }}>ADD FISH</p>
              {availableToAdd.map(fi => (
                <button
                  key={fi.id}
                  data-testid={`button-add-pond-fish-${fi.id}`}
                  onClick={() => onAdd(fi.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 w-full transition-colors"
                  style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${ACCENT}15`, cursor: "pointer" }}
                >
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {fi.imageUrl ? <img src={fi.imageUrl} alt="" className="w-full h-full object-contain" /> : <span>🐟</span>}
                  </div>
                  <span className="font-fantasy text-[10px] flex-1 text-left truncate" style={{ color: `${ACCENT}aa` }}>{fi.name}</span>
                  {fi.starRarity && (
                    <div className="flex gap-px">
                      {Array.from({ length: fi.starRarity }).map((_, i) => (
                        <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                  )}
                  <Plus className="w-4 h-4" style={{ color: ACCENT }} />
                </button>
              ))}
            </div>
          )}
          {allFishItems.length === 0 && pondFish.length === 0 && (
            <p className="font-fantasy text-[10px] text-center py-4" style={{ color: `${ACCENT}50` }}>
              No fish items yet. Create some in Admin &gt; Fishing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReelBar({
  fishPos, catchZonePos, catchMeter, isOverlap, isSurging, catchZoneSize, timeLeft, onHoldChange,
}: {
  fishPos: number;
  catchZonePos: number;
  catchMeter: number;
  isOverlap: boolean;
  isSurging: boolean;
  catchZoneSize: number;
  timeLeft: number;
  onHoldChange: (holding: boolean) => void;
}) {
  const [held, setHeld] = useState(false);
  const BAR_H = 260;
  const BAR_W = 52;

  const startHold = (e: React.PointerEvent) => {
    e.preventDefault();
    setHeld(true);
    onHoldChange(true);
  };
  const endHold = () => {
    setHeld(false);
    onHoldChange(false);
  };

  const czTop = catchZonePos * BAR_H;
  const czH = catchZoneSize * BAR_H;
  const fishTop = fishPos * BAR_H;
  const fishH = FISH_ZONE_SIZE * BAR_H;

  const showTimer = timeLeft <= 10;
  const timerSecs = Math.ceil(timeLeft);
  const timerUrgent = timeLeft <= 5;

  return (
    <div
      className="absolute flex flex-col items-center gap-3"
      style={{ right: 14, top: "50%", transform: "translateY(-55%)", zIndex: 30, userSelect: "none" }}
    >
      {/* Surge warning / countdown timer */}
      <div style={{
        height: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {isSurging ? (
          <span
            className="font-fantasy text-[10px] tracking-widest"
            style={{ color: "#f97316", textShadow: "0 0 10px rgba(249,115,22,0.9)", animation: "surgeFlash 0.4s ease-in-out infinite" }}
          >
            SURGE!
          </span>
        ) : showTimer ? (
          <span
            className="font-fantasy text-[11px] tracking-widest font-bold"
            style={{
              color: timerUrgent ? "#ef4444" : "#facc15",
              textShadow: timerUrgent ? "0 0 10px rgba(239,68,68,0.9)" : "0 0 8px rgba(250,204,21,0.7)",
              animation: timerUrgent ? "surgeFlash 0.4s ease-in-out infinite" : undefined,
            }}
          >
            {timerSecs}s
          </span>
        ) : null}
      </div>

      {/* Catch meter */}
      <div style={{ width: BAR_W, height: 10, borderRadius: 5, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(94,234,212,0.35)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${catchMeter * 100}%`,
          borderRadius: 5,
          background: catchMeter > 0.6
            ? "linear-gradient(90deg, #4ade80, #22c55e)"
            : catchMeter > 0.3
            ? "linear-gradient(90deg, #facc15, #eab308)"
            : "linear-gradient(90deg, #ef4444, #dc2626)",
          boxShadow: catchMeter > 0.6 ? "0 0 8px rgba(74,222,128,0.7)" : catchMeter > 0.3 ? "0 0 6px rgba(250,204,21,0.5)" : "0 0 6px rgba(239,68,68,0.4)",
        }} />
      </div>

      {/* Main reel bar */}
      <div style={{
        width: BAR_W,
        height: BAR_H,
        borderRadius: 12,
        background: "rgba(0,0,0,0.75)",
        border: `1.5px solid ${isOverlap ? "rgba(74,222,128,0.6)" : "rgba(94,234,212,0.25)"}`,
        boxShadow: isOverlap
          ? "0 0 18px rgba(74,222,128,0.35), inset 0 0 10px rgba(74,222,128,0.1)"
          : isSurging
          ? "0 0 18px rgba(249,115,22,0.35)"
          : "0 2px 12px rgba(0,0,0,0.6)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.1s ease, box-shadow 0.1s ease",
        animation: isSurging ? "surgeShake 0.15s ease-in-out infinite" : undefined,
      }}>
        {/* Subtle track lines */}
        {[0.25, 0.5, 0.75].map(p => (
          <div key={p} style={{
            position: "absolute",
            top: p * BAR_H,
            left: 6,
            right: 6,
            height: 1,
            background: "rgba(94,234,212,0.08)",
          }} />
        ))}

        {/* Catch zone (player-controlled) */}
        <div style={{
          position: "absolute",
          top: czTop,
          left: 5,
          right: 5,
          height: czH,
          borderRadius: 8,
          background: isOverlap
            ? "rgba(74,222,128,0.35)"
            : "rgba(94,234,212,0.2)",
          border: `1.5px solid ${isOverlap ? "rgba(74,222,128,0.8)" : "rgba(94,234,212,0.5)"}`,
          boxShadow: isOverlap ? "0 0 12px rgba(74,222,128,0.5)" : undefined,
          transition: "background 0.08s ease, border-color 0.08s ease",
        }} />

        {/* Fish indicator */}
        <div style={{
          position: "absolute",
          top: fishTop,
          left: 8,
          right: 8,
          height: fishH,
          borderRadius: 6,
          background: isSurging
            ? "linear-gradient(180deg, rgba(249,115,22,0.9), rgba(239,68,68,0.8))"
            : "linear-gradient(180deg, rgba(251,191,36,0.9), rgba(245,158,11,0.8))",
          boxShadow: isSurging
            ? "0 0 14px rgba(249,115,22,0.8)"
            : "0 0 10px rgba(251,191,36,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          transition: "background 0.1s ease",
        }}>
          🐟
        </div>
      </div>

      {/* Hold button */}
      <button
        data-testid="button-reel"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
        className="w-16 h-16 rounded-full flex flex-col items-center justify-center gap-0.5 select-none"
        style={{
          background: held
            ? `radial-gradient(circle, ${ACCENT}ff, ${ACCENT}cc)`
            : `linear-gradient(135deg, ${ACCENT}cc, ${ACCENT}88)`,
          border: `2px solid ${held ? ACCENT : ACCENT + "99"}`,
          color: "#0a1a14",
          cursor: "pointer",
          boxShadow: held
            ? `0 0 32px ${ACCENT}90, 0 0 12px ${ACCENT}60`
            : `0 0 14px ${ACCENT}40`,
          fontFamily: "Cinzel, serif",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTapHighlightColor: "transparent",
          outline: "none",
          transform: held ? "scale(0.92)" : "scale(1)",
          transition: "transform 0.08s ease, box-shadow 0.1s ease, background 0.1s ease",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", pointerEvents: "none" }}>
          {held ? "↑↑↑" : "HOLD"}
        </span>
        <span style={{ fontSize: 14, pointerEvents: "none" }}>🎣</span>
      </button>
    </div>
  );
}

const FISHING_ANIMATIONS = `
  @keyframes pondDrift {
    0%, 100% { transform: translateX(0) scale(1); }
    50% { transform: translateX(-6px) scale(1.015); }
  }
  @keyframes pondGlow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
  @keyframes shimmer1 {
    0%, 100% { opacity: 0.2; transform: scaleX(1); }
    50% { opacity: 0.5; transform: scaleX(1.15); }
  }
  @keyframes shimmer2 {
    0%, 100% { opacity: 0.15; transform: scaleX(1); }
    60% { opacity: 0.4; transform: scaleX(0.85); }
  }
  @keyframes lilyFloat {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-3px) rotate(4deg); }
  }
  @keyframes rippleRing {
    0% { width: 8px; height: 8px; opacity: 1; margin-left: -4px; margin-bottom: -4px; }
    100% { width: 80px; height: 40px; opacity: 0; margin-left: -40px; margin-bottom: -20px; }
  }
  @keyframes bobFloat {
    0%, 100% { transform: translate(-50%, 0) translateY(0); }
    50% { transform: translate(-50%, 0) translateY(-5px); }
  }
  @keyframes fishNibble {
    0%, 100% { transform: translateX(0) scaleX(1); }
    30% { transform: translateX(-6px) scaleX(0.9); }
    70% { transform: translateX(6px) scaleX(1.1); }
  }
  @keyframes poleCast {
    0% { transform: rotate(40deg) translateX(0); opacity: 1; }
    50% { transform: rotate(-20deg) translateX(30px); opacity: 1; }
    100% { transform: rotate(-30deg) translateX(20px); opacity: 0.9; }
  }
  @keyframes poleHold {
    0%, 100% { transform: rotate(-30deg) translateX(0); }
    50% { transform: rotate(-28deg) translateX(2px); }
  }
  @keyframes catchPop {
    0% { transform: scale(0.5); opacity: 0; }
    60% { transform: scale(1.08); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes catchGlow {
    0%, 100% { box-shadow: 0 0 20px rgba(94,234,212,0.3); }
    50% { box-shadow: 0 0 40px rgba(94,234,212,0.6); }
  }
  @keyframes missWiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-12deg); }
    75% { transform: rotate(12deg); }
  }
  @keyframes slideUp {
    0% { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes petBob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes nibbleDip {
    0%   { transform: translate(-50%, 0); }
    20%  { transform: translate(-50%, 10px); }
    38%  { transform: translate(-50%, -4px); }
    55%  { transform: translate(-50%, 8px); }
    72%  { transform: translate(-50%, 0); }
    100% { transform: translate(-50%, 0); }
  }
  @keyframes nibbleRippleOut {
    0%   { transform: scale(1); opacity: 1; }
    100% { transform: scale(3.5); opacity: 0; }
  }
  @keyframes surgeFlash {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
  }
  @keyframes surgeShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
`;
