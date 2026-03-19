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
  poleSlowdown3?: number | null;
  poleSlowdown4?: number | null;
  poleSlowdown5?: number | null;
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

export default function FishingPage({ locationId, locationName, bgUrl, user, onClose }: FishingPageProps) {
  const [phase, setPhase] = useState<FishingPhase>("idle");
  const [showPolePanel, setShowPolePanel] = useState(false);
  const [showBaitPanel, setShowBaitPanel] = useState(false);
  const [showFishInv, setShowFishInv] = useState(false);
  const [showPondAdmin, setShowPondAdmin] = useState(false);
  const [showNoPoleModal, setShowNoPoleModal] = useState(false);
  const [tensionState, setTensionState] = useState<{
    catchProgress: number;
    tension: number;
    isSurging: boolean;
    timeLeft: number;
    snapEffect: boolean;
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
  const equipDataRef = useRef<EquipmentData | undefined>(undefined);
  equipDataRef.current = equipData;

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

    // Per-rarity tuning for tension/reeling mechanic
    const poleItem = equipDataRef.current?.poleItem;
    const slowdownFactor = (pct: number | null | undefined) => pct != null ? Math.max(0, 1 - pct / 100) : 1;

    // Rate of catch progress gain per frame while holding
    const reelRates       = [0.0090, 0.0075, 0.0062, 0.0050, 0.0040];
    // Rate of tension rise per frame while holding (pole slowdowns reduce tension for high-rarity fish)
    const tensionRiseBase = [0.0055, 0.0075, 0.0095, 0.0120, 0.0150];
    const tensionRise     = [
      tensionRiseBase[0],
      tensionRiseBase[1],
      tensionRiseBase[2] * slowdownFactor(poleItem?.poleSlowdown3),
      tensionRiseBase[3] * slowdownFactor(poleItem?.poleSlowdown4),
      tensionRiseBase[4] * slowdownFactor(poleItem?.poleSlowdown5),
    ];
    // Rate of tension fall per frame while NOT holding
    const tensionFalls    = [0.0110, 0.0095, 0.0080, 0.0065, 0.0050];
    // Rate catch progress drains per frame while NOT holding (fish pulling back)
    const progressDrags   = [0.0018, 0.0026, 0.0036, 0.0048, 0.0062];
    // Probability per frame a surge begins
    const surgeChances    = [0.0030, 0.0045, 0.0060, 0.0080, 0.0105];
    // Instant tension spike on surge
    const surgeTSpikes    = [0.10,   0.14,   0.18,   0.23,   0.29  ];
    // Instant progress drop on surge
    const surgePDrops     = [0.05,   0.08,   0.11,   0.15,   0.20  ];

    const reelRate     = reelRates[rarity - 1];
    const tRise        = tensionRise[rarity - 1];
    const tFall        = tensionFalls[rarity - 1];
    const pDrag        = progressDrags[rarity - 1];
    const surgeChance  = surgeChances[rarity - 1];
    const surgeTSpike  = surgeTSpikes[rarity - 1];
    const surgePDrop   = surgePDrops[rarity - 1];

    const REEL_TIMEOUT_MS = 30000;

    isHoldingRef.current = false;

    let catchProgress = 0;
    let tension       = 0;
    let surging       = false;
    let surgeTimer    = 0;
    const startTime   = Date.now();

    phaseRef.current = "reeling";
    setPhase("reeling");
    setTensionState({ catchProgress, tension, isSurging: false, timeLeft: 30, snapEffect: false });

    const tick = () => {
      if (phaseRef.current !== "reeling") return;

      const elapsed = Date.now() - startTime;
      const timeLeft = Math.max(0, (REEL_TIMEOUT_MS - elapsed) / 1000);

      if (timeLeft <= 0) {
        setTensionState(null);
        if (catchProgress >= 0.5) {
          playCatch();
          catchMutateRef.current(100);
        } else {
          phaseRef.current = "missed";
          setPhase("missed");
        }
        return;
      }

      if (isHoldingRef.current) {
        // Reeling: progress fills, tension rises
        catchProgress = Math.min(1, catchProgress + reelRate);
        tension       = Math.min(1, tension + tRise);
      } else {
        // Resting: tension drops, fish drags progress back
        tension       = Math.max(0, tension - tFall);
        catchProgress = Math.max(0, catchProgress - pDrag);
      }

      // Surge logic — random fish resistance
      surgeTimer--;
      if (!surging && surgeTimer <= 0) {
        if (Math.random() < surgeChance) {
          surging = true;
          tension       = Math.min(1, tension + surgeTSpike);
          catchProgress = Math.max(0, catchProgress - surgePDrop);
          surgeTimer    = 22 + Math.floor(Math.random() * 18);
        } else {
          surgeTimer = 12 + Math.floor(Math.random() * 18);
        }
      }
      if (surging && surgeTimer <= 0) surging = false;

      setTensionState({ catchProgress, tension, isSurging: surging, timeLeft, snapEffect: false });

      // Line snap — tension maxed
      if (tension >= 1) {
        setTensionState({ catchProgress, tension: 1, isSurging: false, timeLeft, snapEffect: true });
        setTimeout(() => {
          setTensionState(null);
          phaseRef.current = "missed";
          setPhase("missed");
        }, 600);
        return;
      }

      // Win — progress filled
      if (catchProgress >= 1) {
        setTensionState(null);
        playCatch();
        catchMutateRef.current(100);
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
    setTensionState(null);
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
             phase === "reeling" ? (tensionState?.isSurging ? "It's surging — ease off!" : tensionState && tensionState.tension > 0.7 ? "Tension critical — release!" : "Hold to reel, ease off if line tightens!") :
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

      {phase === "reeling" && equipData?.poleItem?.imageUrl && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "20%", left: "0%",
          width: 160, height: 160,
          transformOrigin: "bottom left",
          animation: tensionState && tensionState.tension > 0.6
            ? "poleBendHigh 0.3s ease-in-out infinite"
            : "poleBendLow 1.5s ease-in-out infinite",
        }}>
          <img
            src={equipData.poleItem.hooklessImageUrl || equipData.poleItem.imageUrl}
            alt=""
            className="w-full h-full object-contain"
            style={{ filter: `drop-shadow(0 0 ${tensionState && tensionState.tension > 0.6 ? "16px rgba(239,68,68,0.8)" : "10px rgba(94,234,212,0.7)"})` }}
          />
        </div>
      )}

      {phase === "reeling" && tensionState && (
        <TensionReel
          catchProgress={tensionState.catchProgress}
          tension={tensionState.tension}
          isSurging={tensionState.isSurging}
          timeLeft={tensionState.timeLeft}
          snapEffect={tensionState.snapEffect}
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

function TensionReel({
  catchProgress, tension, isSurging, timeLeft, snapEffect, onHoldChange,
}: {
  catchProgress: number;
  tension: number;
  isSurging: boolean;
  timeLeft: number;
  snapEffect: boolean;
  onHoldChange: (holding: boolean) => void;
}) {
  const [held, setHeld] = useState(false);

  const startHold = (e: React.PointerEvent) => {
    e.preventDefault();
    setHeld(true);
    onHoldChange(true);
  };
  const endHold = () => {
    setHeld(false);
    onHoldChange(false);
  };

  const showTimer = timeLeft <= 10;
  const timerSecs = Math.ceil(timeLeft);
  const timerUrgent = timeLeft <= 5;

  const tensionPct = Math.round(tension * 100);
  const progressPct = Math.round(catchProgress * 100);

  const tensionColor = tension > 0.75 ? "#ef4444" : tension > 0.45 ? "#f59e0b" : "#4ade80";
  const tensionBg = tension > 0.75
    ? "linear-gradient(90deg, #7f1d1d, #dc2626, #ef4444)"
    : tension > 0.45
    ? "linear-gradient(90deg, #78350f, #d97706, #f59e0b)"
    : "linear-gradient(90deg, #14532d, #16a34a, #4ade80)";
  const tensionGlow = tension > 0.75
    ? "0 0 16px rgba(239,68,68,0.9)"
    : tension > 0.45
    ? "0 0 12px rgba(245,158,11,0.7)"
    : "0 0 8px rgba(74,222,128,0.5)";

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-end pointer-events-none"
      style={{
        zIndex: 30,
        paddingBottom: 148,
        animation: snapEffect ? "snapShake 0.5s ease-in-out" : (isSurging ? "surgeShake 0.15s ease-in-out infinite" : undefined),
      }}
    >
      <div
        className="flex flex-col items-center gap-2 w-full px-5"
        style={{ maxWidth: 320, userSelect: "none" }}
      >
        {/* Alert / timer strip */}
        <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {snapEffect ? (
            <span className="font-fantasy text-sm tracking-widest" style={{ color: "#ef4444", textShadow: "0 0 12px rgba(239,68,68,1)", animation: "surgeFlash 0.2s ease-in-out infinite" }}>
              💥 LINE SNAPPED!
            </span>
          ) : isSurging ? (
            <span className="font-fantasy text-xs tracking-widest" style={{ color: "#f97316", textShadow: "0 0 10px rgba(249,115,22,0.9)", animation: "surgeFlash 0.35s ease-in-out infinite" }}>
              ⚡ SURGE — RELEASE NOW! ⚡
            </span>
          ) : showTimer ? (
            <span className="font-fantasy text-[11px] tracking-widest font-bold" style={{
              color: timerUrgent ? "#ef4444" : "#facc15",
              textShadow: timerUrgent ? "0 0 10px rgba(239,68,68,0.9)" : "0 0 8px rgba(250,204,21,0.7)",
              animation: timerUrgent ? "surgeFlash 0.4s ease-in-out infinite" : undefined,
            }}>
              {timerSecs}s left
            </span>
          ) : (
            <span className="font-fantasy text-[9px] tracking-wider" style={{ color: "rgba(94,234,212,0.55)" }}>
              {held ? "Reeling…" : "Hold the button to reel"}
            </span>
          )}
        </div>

        {/* ── TENSION BAR ── */}
        <div style={{ width: "100%" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10 }}>🌿</span>
              <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(200,150,70,0.9)" }}>LINE TENSION</span>
              <span className="font-fantasy text-[8px]" style={{ color: "rgba(200,150,70,0.55)" }}>— keep this low!</span>
            </div>
            <span className="font-fantasy text-[9px] font-bold" style={{ color: tensionColor, textShadow: tension > 0.6 ? `0 0 8px ${tensionColor}` : undefined }}>
              {tensionPct}%
            </span>
          </div>
          {/* Track */}
          <div style={{
            width: "100%", height: 20, borderRadius: 10,
            background: "rgba(15,8,3,0.92)",
            border: tension > 0.75 ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(80,50,20,0.65)",
            boxShadow: tension > 0.75 ? "0 0 12px rgba(239,68,68,0.3)" : "inset 0 2px 6px rgba(0,0,0,0.5)",
            position: "relative", overflow: "hidden",
            transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          }}>
            {/* Fill — no negative-width calc, just direct % */}
            <div style={{
              height: "100%",
              width: `${tensionPct}%`,
              borderRadius: 10,
              background: tensionBg,
              boxShadow: tensionGlow,
              transition: "width 0.06s ease, background 0.25s ease",
              position: "relative",
            }}>
              {/* Vine knot bumps */}
              {tensionPct > 25 && (
                <div style={{ position: "absolute", top: "50%", left: "25%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.18)" }} />
              )}
              {tensionPct > 50 && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.18)" }} />
              )}
              {tensionPct > 75 && (
                <div style={{ position: "absolute", top: "50%", left: "75%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.18)" }} />
              )}
            </div>
            {/* Danger zone marker at 80% */}
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: "80%", width: 2,
              background: "rgba(239,68,68,0.5)",
              boxShadow: "0 0 6px rgba(239,68,68,0.4)",
            }} />
            {/* Pulsing overlay at high tension */}
            {tension > 0.6 && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 10,
                background: "linear-gradient(90deg, transparent 60%, rgba(239,68,68,0.2) 100%)",
                animation: "tensionPulse 0.5s ease-in-out infinite",
              }} />
            )}
          </div>
        </div>

        {/* ── CATCH PROGRESS BAR ── */}
        <div style={{ width: "100%" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10 }}>✨</span>
              <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,210,190,0.9)" }}>CATCH PROGRESS</span>
              <span className="font-fantasy text-[8px]" style={{ color: "rgba(94,210,190,0.55)" }}>— fill to 100%!</span>
            </div>
            <span className="font-fantasy text-[9px] font-bold" style={{ color: ACCENT, textShadow: catchProgress > 0.6 ? `0 0 8px ${ACCENT}` : undefined }}>
              {progressPct}%
            </span>
          </div>
          {/* Track */}
          <div style={{
            width: "100%", height: 20, borderRadius: 10,
            background: "rgba(4,14,16,0.92)",
            border: `1.5px solid rgba(94,234,212,0.3)`,
            boxShadow: catchProgress > 0.7 ? "0 0 14px rgba(94,234,212,0.35)" : "inset 0 2px 6px rgba(0,0,0,0.5)",
            position: "relative", overflow: "hidden",
            transition: "box-shadow 0.3s ease",
          }}>
            {/* Fill */}
            <div style={{
              height: "100%",
              width: `${progressPct}%`,
              borderRadius: 10,
              background: "linear-gradient(90deg, #0d4a3a, #0db889, #5eead4)",
              boxShadow: "0 0 14px rgba(94,234,212,0.7)",
              transition: "width 0.06s ease",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Shimmer flow */}
              {progressPct > 5 && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
                  animation: "energyFlow 1.1s linear infinite",
                }} />
              )}
            </div>
            {/* Glowing leading edge orb */}
            {progressPct > 3 && progressPct < 100 && (
              <div style={{
                position: "absolute", top: "50%",
                left: `${Math.min(progressPct, 97)}%`,
                transform: "translate(-50%, -50%)",
                width: 14, height: 14, borderRadius: "50%",
                background: "#5eead4",
                boxShadow: "0 0 14px rgba(94,234,212,1), 0 0 28px rgba(94,234,212,0.6)",
                animation: "sparkleOrb 0.75s ease-in-out infinite",
                pointerEvents: "none",
              }} />
            )}
          </div>
        </div>

        {/* ── REEL BUTTON ── */}
        <button
          data-testid="button-reel"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
          className="pointer-events-auto select-none"
          style={{
            marginTop: 4,
            width: 88, height: 88, borderRadius: "50%",
            position: "relative",
            background: held
              ? "radial-gradient(circle at 40% 35%, #7a5230, #3d2512)"
              : "radial-gradient(circle at 40% 35%, #5c3d1e, #2a1a0a)",
            border: held
              ? "3px solid rgba(94,234,212,0.95)"
              : "3px solid rgba(130,90,40,0.85)",
            boxShadow: held
              ? "0 0 36px rgba(94,234,212,0.75), 0 0 64px rgba(94,234,212,0.3), inset 0 0 20px rgba(94,234,212,0.15)"
              : "0 4px 18px rgba(0,0,0,0.75), inset 0 1px 3px rgba(255,200,100,0.1)",
            cursor: "pointer",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
            WebkitTouchCallout: "none",
            outline: "none",
            transform: held ? "scale(0.88)" : "scale(1)",
            transition: "transform 0.08s ease, box-shadow 0.12s ease, border-color 0.12s ease",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          }}
        >
          {/* Rune ring */}
          <div style={{ position: "absolute", inset: 7, borderRadius: "50%", border: held ? "1px solid rgba(94,234,212,0.5)" : "1px solid rgba(160,110,50,0.4)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 15, borderRadius: "50%", border: held ? "1px dashed rgba(94,234,212,0.35)" : "1px dashed rgba(120,80,30,0.3)", pointerEvents: "none", animation: held ? "runeRotate 2s linear infinite" : undefined }} />
          <span style={{ fontSize: held ? 11 : 9, fontWeight: 700, letterSpacing: "0.12em", color: held ? "#5eead4" : "rgba(200,160,80,0.9)", fontFamily: "Cinzel, serif", textShadow: held ? "0 0 8px rgba(94,234,212,0.9)" : "0 1px 2px rgba(0,0,0,0.8)", pointerEvents: "none", transition: "font-size 0.1s ease" }}>
            {held ? "REELING" : "HOLD"}
          </span>
          <span style={{ fontSize: 20, pointerEvents: "none", filter: held ? "drop-shadow(0 0 8px rgba(94,234,212,0.9))" : undefined, transition: "filter 0.1s ease" }}>🎣</span>
        </button>

        {/* Hint label below button */}
        <span className="font-fantasy text-[8px] tracking-wider" style={{ color: "rgba(94,234,212,0.4)", marginTop: -2 }}>
          {held ? "release if tension gets high" : "hold & release to reel in"}
        </span>
      </div>
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
  @keyframes poleBendLow {
    0%, 100% { transform: rotate(-42deg) skewY(-2deg); }
    50% { transform: rotate(-40deg) skewY(-4deg); }
  }
  @keyframes poleBendHigh {
    0%, 100% { transform: rotate(-50deg) skewY(-8deg); }
    50% { transform: rotate(-47deg) skewY(-10deg); }
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
    25% { transform: translateX(-3px) translateY(-1px); }
    75% { transform: translateX(3px) translateY(1px); }
  }
  @keyframes snapShake {
    0%  { transform: translateX(0) scale(1); }
    10% { transform: translateX(-8px) scale(1.02); }
    20% { transform: translateX(8px) scale(0.98); }
    30% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    50% { transform: translateX(-4px); }
    60% { transform: translateX(4px); }
    70% { transform: translateX(-2px); }
    85% { transform: translateX(2px); }
    100% { transform: translateX(0) scale(1); }
  }
  @keyframes tensionPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.9; }
  }
  @keyframes energyFlow {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes sparkleOrb {
    0%, 100% { transform: translateY(-50%) scale(1); opacity: 1; }
    50% { transform: translateY(-50%) scale(1.4); opacity: 0.7; }
  }
  @keyframes runeRotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
