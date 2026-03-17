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
const REEL_DURATION = 4000;
const NIBBLE_TIMEOUT = 4000;
const GREEN_ZONE_SIZE = 0.28;

export default function FishingPage({ locationId, locationName, bgUrl, user, onClose }: FishingPageProps) {
  const [phase, setPhase] = useState<FishingPhase>("idle");
  const [showPolePanel, setShowPolePanel] = useState(false);
  const [showBaitPanel, setShowBaitPanel] = useState(false);
  const [showFishInv, setShowFishInv] = useState(false);
  const [showPondAdmin, setShowPondAdmin] = useState(false);
  const [reelPos, setReelPos] = useState(0.0);
  const [greenZoneCenter, setGreenZoneCenter] = useState(0.5);
  const [caughtItem, setCaughtItem] = useState<ShopItem | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgError, setBgError] = useState(false);
  const nibbleRarityRef = useRef<number>(1);
  const reelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nibbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const castingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reelCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<FishingPhase>("idle");
  const reelPosRef = useRef(0.0);
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
    if (reelIntervalRef.current) { clearInterval(reelIntervalRef.current); reelIntervalRef.current = null; }
    if (nibbleTimeoutRef.current) { clearTimeout(nibbleTimeoutRef.current); nibbleTimeoutRef.current = null; }
    if (castingTimeoutRef.current) { clearTimeout(castingTimeoutRef.current); castingTimeoutRef.current = null; }
    if (reelCompleteTimeoutRef.current) { clearTimeout(reelCompleteTimeoutRef.current); reelCompleteTimeoutRef.current = null; }
  }, []);

  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  const startCasting = useCallback(() => {
    if (!equipData?.poleItem) {
      toast({ title: "No pole equipped", description: "Equip a fishing pole first!", variant: "destructive" });
      return;
    }
    if (pondFish.length === 0) {
      toast({ title: "Empty pond", description: "No fish in this pond yet.", variant: "destructive" });
      return;
    }
    setPhase("casting");
    castingTimeoutRef.current = setTimeout(() => {
      setPhase("waiting");
      const waitTime = 1500 + Math.random() * 2500;
      nibbleTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === "waiting") {
          const randomFish = pondFish[Math.floor(Math.random() * pondFish.length)];
          nibbleRarityRef.current = randomFish?.item?.starRarity ?? 1;
          setPhase("nibble");
          nibbleTimeoutRef.current = setTimeout(() => {
            if (phaseRef.current === "nibble") {
              setPhase("missed");
            }
          }, NIBBLE_TIMEOUT);
        }
      }, waitTime);
    }, 1000);
  }, [equipData, pondFish, toast]);

  const startReeling = useCallback(() => {
    const center = 0.3 + Math.random() * 0.4;
    setGreenZoneCenter(center);
    setReelPos(0.0);
    reelPosRef.current = 0.0;
    setPhase("reeling");

    const rarity = Math.max(1, Math.min(5, nibbleRarityRef.current));
    const driftSpeed = 0.009 + (rarity - 1) * 0.003;

    if (reelIntervalRef.current) clearInterval(reelIntervalRef.current);
    reelIntervalRef.current = setInterval(() => {
      reelPosRef.current = Math.max(0, reelPosRef.current - driftSpeed);
      setReelPos(reelPosRef.current);
    }, 50);

    reelCompleteTimeoutRef.current = setTimeout(() => {
      if (reelIntervalRef.current) { clearInterval(reelIntervalRef.current); reelIntervalRef.current = null; }
      if (phaseRef.current === "reeling") {
        const finalPos = reelPosRef.current;
        const greenMin = center - GREEN_ZONE_SIZE / 2;
        const greenMax = center + GREEN_ZONE_SIZE / 2;
        const inGreen = finalPos >= greenMin && finalPos <= greenMax;
        if (inGreen) {
          const score = Math.round(70 + Math.random() * 30);
          catchMutation.mutate(score);
        } else {
          setPhase("missed");
        }
      }
    }, REEL_DURATION);
  }, [catchMutation]);

  useEffect(() => {
    if (phase === "nibble") {
      const timer = setTimeout(() => {
        if (phaseRef.current === "nibble") startReeling();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [phase, startReeling]);

  const handleReelTap = useCallback(() => {
    if (phase !== "reeling") return;
    reelPosRef.current = Math.min(1, reelPosRef.current + 0.07);
    setReelPos(reelPosRef.current);
  }, [phase]);

  const resetFishing = useCallback(() => {
    setPhase("idle");
    setCaughtItem(null);
    clearAllTimers();
  }, [clearAllTimers]);

  const poleIsBroken = equipData?.poleItem != null && equipData.poleUsesLeft !== null && equipData.poleUsesLeft !== undefined && equipData.poleUsesLeft <= 0;
  const hasPole = !!equipData?.poleItem && !poleIsBroken;
  const effectiveBg = (!bgUrl || bgError) ? fishingBg : bgUrl;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      data-testid="fishing-page"
    >
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
          onClick={() => { if (phase === "idle" && hasPole) startCasting(); }}
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
            pointerEvents: phase === "idle" ? "auto" : "none",
            cursor: phase === "idle" && hasPole ? "pointer" : "default",
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

      {equipData !== undefined && !equipData.poleItem && !user.isAdmin && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(4,2,12,0.82)", backdropFilter: "blur(6px)" }}>
          <div
            className="flex flex-col items-center gap-5 rounded-2xl px-8 py-8 mx-6 text-center"
            style={{
              background: "linear-gradient(145deg, rgba(10,5,20,0.97) 0%, rgba(18,8,35,0.97) 100%)",
              border: `1.5px solid ${ACCENT}40`,
              boxShadow: `0 8px 40px rgba(0,0,0,0.8), 0 0 30px ${ACCENT}15`,
            }}
          >
            <img src={poleIcon} alt="Fishing Pole" className="w-16 h-16 object-contain opacity-80" />
            <div>
              <p className="font-fantasy text-lg tracking-widest font-semibold mb-1" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}50` }}>
                No Pole Equipped
              </p>
              <p className="font-fantasy text-sm tracking-wide" style={{ color: `${ACCENT}99` }}>
                Equip a Fishing Pole to Fish
              </p>
            </div>
            <button
              data-testid="button-no-pole-back"
              onClick={onClose}
              className="font-fantasy text-sm tracking-[0.15em] px-6 py-2.5 rounded-xl transition-transform active:scale-95"
              style={{
                background: `linear-gradient(135deg, rgba(10,5,20,0.9) 0%, rgba(20,10,40,0.9) 100%)`,
                border: `1.5px solid ${ACCENT}60`,
                color: ACCENT,
                boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 16px ${ACCENT}20`,
              }}
            >
              ← Back to World
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
             phase === "nibble" ? "Something's biting!" :
             phase === "reeling" ? "Reel it in!" :
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

      <div className="absolute inset-0 z-10 pointer-events-none">
        {(phase === "waiting" || phase === "casting") && (
          <>
            <div className="absolute" style={{
              bottom: "32%", left: "50%", transform: "translate(-50%, 0)",
              width: 28, height: 28,
              borderRadius: "50%",
              border: `2px solid ${ACCENT}60`,
              animation: "rippleRing 2s ease-out infinite",
            }} />
            <div className="absolute" style={{
              bottom: "32%", left: "50%", transform: "translate(-50%, 0)",
              width: 12, height: 12,
              borderRadius: "50%",
              background: `${ACCENT}80`,
              animation: "bobFloat 1.2s ease-in-out infinite",
            }} />
          </>
        )}

        {phase === "nibble" && (
          <div className="absolute flex flex-col items-center" style={{ bottom: "36%", left: "50%", transform: "translate(-50%, 0)" }}>
            <div style={{
              width: 64, height: 28,
              background: "rgba(0,0,0,0.75)",
              borderRadius: "50%",
              filter: "blur(3px)",
              animation: "fishNibble 0.5s ease-in-out infinite",
            }} />
            <p className="font-fantasy text-sm mt-3 animate-bounce" style={{ color: "#fbbf24", textShadow: "0 0 10px rgba(251,191,36,0.7)" }}>
              Fish on!
            </p>
          </div>
        )}
      </div>

      {phase === "casting" && equipData?.poleItem?.imageUrl && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "38%", left: "28%",
          width: 80, height: 80,
          animation: "poleCast 1s ease-in-out forwards",
          transformOrigin: "bottom left",
        }}>
          <img src={equipData.poleItem.imageUrl} alt="" className="w-full h-full object-contain" style={{
            filter: `drop-shadow(0 0 8px ${ACCENT}80)`,
          }} />
        </div>
      )}

      {(phase === "waiting" || phase === "nibble") && equipData?.poleItem?.imageUrl && (
        <div className="absolute pointer-events-none z-[15]" style={{
          bottom: "42%", left: "22%",
          width: 80, height: 80,
          transform: "rotate(-30deg)",
          transformOrigin: "bottom left",
          animation: "poleHold 2s ease-in-out infinite",
        }}>
          <img src={equipData.poleItem.imageUrl} alt="" className="w-full h-full object-contain" style={{
            filter: `drop-shadow(0 0 6px ${ACCENT}60)`,
          }} />
        </div>
      )}

      {phase === "reeling" && (
        <RadialReelMechanic
          reelPos={reelPos}
          greenZoneCenter={greenZoneCenter}
          greenZoneSize={GREEN_ZONE_SIZE}
          onTap={handleReelTap}
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
          <EquipSlot
            label="Pole"
            defaultIcon={poleIcon}
            equippedItem={poleIsBroken ? equipData!.poleItem : (equipData?.poleItem || null)}
            isActive={showPolePanel}
            broken={poleIsBroken}
            usesLeft={equipData?.poleUsesLeft}
            maxUses={equipData?.poleItem?.poleMaxUses}
            onClick={() => { setShowPolePanel(!showPolePanel); setShowBaitPanel(false); setShowFishInv(false); }}
            testId="button-pole-slot"
          />
          <EquipSlot
            label="Bait"
            defaultIcon={baitIcon}
            equippedItem={equipData?.baitItem || null}
            isActive={showBaitPanel}
            onClick={() => { setShowBaitPanel(!showBaitPanel); setShowPolePanel(false); setShowFishInv(false); }}
            testId="button-bait-slot"
          />
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
    </div>
  );
}

function EquipSlot({
  label, defaultIcon, equippedItem, isActive, onClick, badgeCount, testId, noDim, broken, usesLeft, maxUses,
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
        background: broken ? "rgba(60,10,10,0.85)" : isActive ? `${ACCENT}20` : "rgba(5,20,15,0.85)",
        border: `2px solid ${broken ? "rgba(220,50,50,0.6)" : isActive ? ACCENT : `${ACCENT}40`}`,
        boxShadow: broken ? "0 0 12px rgba(200,30,30,0.25)" : isActive ? `0 0 16px ${ACCENT}30` : "0 2px 8px rgba(0,0,0,0.4)",
        transition: "all 0.15s ease",
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
        {!broken && usesLeft !== null && usesLeft !== undefined && maxUses != null && (
          <div className="absolute bottom-0.5 left-0 right-0 flex justify-center">
            <span className="font-fantasy text-[7px]" style={{ color: usesLeft <= 3 ? "#ff7777" : "rgba(94,234,212,0.8)" }}>
              {usesLeft}/{maxUses}
            </span>
          </div>
        )}
      </div>
      <span className="font-fantasy text-[9px] tracking-wider" style={{ color: broken ? "rgba(220,80,80,0.9)" : bright ? ACCENT : `${ACCENT}60` }}>
        {broken ? "BROKEN" : equippedItem ? equippedItem.name : label}
      </span>
    </button>
  );
}

function EquipPanel({
  title, items, equippedInventoryId, slot, onEquip, onUnequip, onClose, onDeleteItem,
}: {
  title: string;
  items: InventoryItem[];
  equippedInventoryId: string | null;
  slot: "pole" | "bait";
  onEquip: (inventoryId: string) => void;
  onUnequip: () => void;
  onClose: () => void;
  onDeleteItem?: (inventoryId: string) => void;
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
                    className="w-full flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all"
                    style={{
                      background: isBroken ? "rgba(50,10,10,0.6)" : isEquipped ? `${ACCENT}25` : "rgba(0,0,0,0.3)",
                      border: `1.5px solid ${isBroken ? "rgba(200,50,50,0.5)" : isEquipped ? ACCENT : `${ACCENT}20`}`,
                      cursor: isBroken ? "default" : "pointer",
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
                    <span className="font-fantasy text-[7px] text-center truncate w-full" style={{ color: isBroken ? "rgba(220,80,80,0.9)" : isEquipped ? ACCENT : `${ACCENT}80` }}>
                      {isBroken ? "BROKEN" : item.name}
                    </span>
                    {isEquipped && !isBroken && (
                      <span className="font-fantasy text-[6px]" style={{ color: "#fbbf24" }}>EQUIPPED</span>
                    )}
                    {!isBroken && item.poleMaxUses != null && item.poleUsesLeft != null && (
                      <span className="font-fantasy text-[6px]" style={{ color: item.poleUsesLeft <= 3 ? "#ff7777" : `${ACCENT}80` }}>
                        {item.poleUsesLeft}/{item.poleMaxUses}
                      </span>
                    )}
                  </button>
                  {isBroken && onDeleteItem && (
                    <button
                      data-testid={`button-delete-broken-pole-${item.inventoryId}`}
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item.inventoryId); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{ background: "rgba(180,20,20,0.9)", border: "1.5px solid rgba(255,80,80,0.6)", cursor: "pointer", zIndex: 10 }}
                    >
                      <Trash2 className="w-2.5 h-2.5" style={{ color: "#fca5a5" }} />
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

function RadialReelMechanic({
  reelPos, greenZoneCenter, greenZoneSize, onTap,
}: {
  reelPos: number;
  greenZoneCenter: number;
  greenZoneSize: number;
  onTap: () => void;
}) {
  const R = 70;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * R;

  const startAngle = -220;
  const totalArcDeg = 260;

  function polarToXY(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    };
  }

  function arcPath(fromDeg: number, toDeg: number) {
    const from = polarToXY(fromDeg);
    const to = polarToXY(toDeg);
    const span = toDeg - fromDeg;
    const largeArc = Math.abs(span) > 180 ? 1 : 0;
    const sweep = span > 0 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${R} ${R} 0 ${largeArc} ${sweep} ${to.x} ${to.y}`;
  }

  const trackFrom = startAngle;
  const trackTo = startAngle + totalArcDeg;

  const greenFrom = startAngle + (greenZoneCenter - greenZoneSize / 2) * totalArcDeg;
  const greenTo = startAngle + (greenZoneCenter + greenZoneSize / 2) * totalArcDeg;

  const indicatorAngle = startAngle + reelPos * totalArcDeg;
  const indicatorPt = polarToXY(indicatorAngle);

  const inGreen = reelPos >= (greenZoneCenter - greenZoneSize / 2) && reelPos <= (greenZoneCenter + greenZoneSize / 2);

  return (
    <div
      className="absolute flex flex-col items-center gap-3"
      style={{ right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 30 }}
    >
      <svg width={200} height={200} viewBox="0 0 200 200">
        <path
          d={arcPath(trackFrom, trackTo)}
          fill="none"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        <path
          d={arcPath(trackFrom, trackTo)}
          fill="none"
          stroke="rgba(94,234,212,0.2)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={arcPath(greenFrom, greenTo)}
          fill="none"
          stroke="rgba(74,222,128,0.7)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <circle
          cx={indicatorPt.x}
          cy={indicatorPt.y}
          r={9}
          fill={inGreen ? "#4ade80" : "#ef4444"}
          style={{ filter: inGreen ? "drop-shadow(0 0 8px rgba(74,222,128,0.9))" : "drop-shadow(0 0 8px rgba(239,68,68,0.9))" }}
        />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="font-fantasy"
          style={{ fontSize: 10, fill: inGreen ? "#4ade80" : "rgba(94,234,212,0.5)", fontFamily: "Cinzel, serif" }}
        >
          REEL
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          style={{ fontSize: 8, fill: "rgba(94,234,212,0.4)", fontFamily: "Cinzel, serif" }}
        >
          {inGreen ? "GOOD!" : "tap faster"}
        </text>
      </svg>

      <button
        data-testid="button-reel"
        onClick={onTap}
        onTouchStart={(e) => { e.preventDefault(); onTap(); }}
        className="w-16 h-16 rounded-full flex items-center justify-center font-fantasy text-xs tracking-wider transition-transform active:scale-90"
        style={{
          background: `linear-gradient(135deg, ${ACCENT}cc, ${ACCENT}88)`,
          border: `2px solid ${ACCENT}`,
          color: "#0a1a14",
          cursor: "pointer",
          boxShadow: `0 0 20px ${ACCENT}40`,
          fontFamily: "Cinzel, serif",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        REEL
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
`;
