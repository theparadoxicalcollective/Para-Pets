import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCostumeCanvasPosition, type CostumeAnchorGeometry } from "@/lib/costumePlacement";
import type { CostumePlacement } from "@shared/costumeFeature";
import {
  COSTUME_SLOT_COUNT,
  getCostumeSlotUnlockCost,
  getUnlockedCostumeSlotCount,
} from "@shared/costumeFeature";

interface InventoryCostume {
  inventoryId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  quantity: number;
}

interface EquippedCostume {
  id: string;
  slot: number;
  copyIndex: number;
  costumeInventoryId: string;
  name: string;
  imageUrl: string | null;
  placements: CostumePlacement[];
}

interface CostumeResponse {
  equipped: EquippedCostume[];
  anchors: Array<CostumeAnchorGeometry & { partType: string }>;
  extraSlots: number;
}

export function EquippedCostumePreview({ petInventoryId, depth }: { petInventoryId: string; depth: "front" | "back" }) {
  const { data } = useQuery<CostumeResponse>({
    queryKey: ["/api/pet", petInventoryId, "costumes"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/costumes`)).json(),
    staleTime: 0,
  });

  return <div aria-hidden data-testid={`costume-preview-${depth}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: depth === "front" ? 3 : 1 }}>
    {(data?.equipped ?? []).flatMap((costume) =>
      costume.placements
        .filter((placement) => placement.view === "front" && placement.depth === depth)
        .map((placement) => {
          const anchor = data?.anchors.find((item) => item.partType === placement.anchorPart);
          const position = getCostumeCanvasPosition(anchor, placement);
          if (!position || !costume.imageUrl) return null;
          const placementInstance = placement.instance ?? 1;
          return <img key={`${costume.id}-${depth}-${placementInstance}`} src={costume.imageUrl} alt="" className="absolute object-contain" style={{
            left: `${position.left / 10}%`,
            top: `${position.top / 10}%`,
            width: `${placement.width / 10}%`,
            height: `${placement.height / 10}%`,
            transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
            transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`,
          }} />;
        })
    )}
  </div>;
}

interface Props {
  petInventoryId: string;
  petName: string;
  rarityColor: string;
  userCoins: number;
}

export default function PetCostumeEquipmentSection({ petInventoryId, petName, rarityColor, userCoins }: Props) {
  const [removeCostume, setRemoveCostume] = useState<EquippedCostume | null>(null);
  const [unlockSlot, setUnlockSlot] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery<CostumeResponse>({
    queryKey: ["/api/pet", petInventoryId, "costumes"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/costumes`)).json(),
    staleTime: 0,
  });
  const equipped = data?.equipped ?? [];
  const unlockedCount = getUnlockedCostumeSlotCount(data?.extraSlots ?? 0);

  const { data: inventory = [] } = useQuery<InventoryCostume[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });
  const { data: equippedCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/user/equipped-costume-counts"],
    staleTime: 0,
  });
  const available = inventory.filter((item) => item.type === "costume" && item.quantity > (equippedCounts[item.inventoryId] ?? 0));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "costumes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user/equipped-costume-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  };

  const equip = useMutation({
    mutationFn: async ({ costumeInventoryId, slot }: { costumeInventoryId: string; slot: number }) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/equip`, { costumeInventoryId, slot })).json(),
    onSuccess: () => refresh(),
    onError: (error: any) => toast({
      title: "Could not equip costume",
      description: error?.message || "This costume could not be equipped.",
      variant: "destructive",
    }),
  });

  const unequip = useMutation({
    mutationFn: async (equippedCostumeId: string) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/unequip`, { equippedCostumeId })).json(),
    onSuccess: () => {
      setRemoveCostume(null);
      refresh();
    },
    onError: (error: any) => toast({
      title: "Could not unequip costume",
      description: error?.message || "This costume could not be removed.",
      variant: "destructive",
    }),
  });

  const unlock = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/unlock`, {})).json(),
    onSuccess: () => {
      setUnlockSlot(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refresh();
      toast({ title: "Costume slot unlocked!" });
    },
    onError: (error: any) => toast({
      title: "Could not unlock costume slot",
      description: error?.message || "The slot could not be unlocked.",
      variant: "destructive",
    }),
  });

  const nextEmptySlot = () => {
    for (let slot = 1; slot <= unlockedCount; slot += 1) {
      if (!equipped.some((costume) => costume.slot === slot)) return slot;
    }
    return null;
  };

  const requestLockedSlot = (slot: number) => {
    if (slot !== unlockedCount + 1) {
      toast({ title: "Unlock the previous costume slot first." });
      return;
    }
    setUnlockSlot(slot);
  };

  return (
    <section className="mx-5 rounded-2xl p-4 mb-8" data-testid="section-costume-equipment" style={{
      background: "linear-gradient(180deg, rgba(11,12,24,0.84) 0%, rgba(4,11,8,0.82) 100%)",
      border: "1px solid rgba(167,139,250,0.3)",
      boxShadow: "0 0 26px rgba(124,58,237,0.08), inset 0 0 20px rgba(0,0,0,0.52)",
      backdropFilter: "blur(6px)",
    }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(216,200,255,0.78)" }}>COSTUMES</p>
        <span className="font-fantasy text-[8px]" style={{ color: "rgba(160,220,140,0.48)" }}>{equipped.length}/{unlockedCount} EQUIPPED</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {Array.from({ length: COSTUME_SLOT_COUNT }, (_, index) => {
          const slot = index + 1;
          const locked = slot > unlockedCount;
          const costume = equipped.find((item) => item.slot === slot);
          const price = getCostumeSlotUnlockCost(slot);
          return (
            <button key={slot} type="button" data-testid={`slot-costume-${slot}`} onClick={() => locked ? requestLockedSlot(slot) : costume ? setRemoveCostume(costume) : undefined}
              className="rounded-xl min-h-[92px] p-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
              style={{
                background: costume ? "rgba(16,28,20,0.92)" : "rgba(3,10,7,0.78)",
                border: `1.5px solid ${locked ? "rgba(80,90,82,0.35)" : costume ? rarityColor + "88" : "rgba(139,92,246,0.32)"}`,
                boxShadow: costume ? `0 0 14px ${rarityColor}22` : "inset 0 0 12px rgba(0,0,0,.5)",
                cursor: "pointer",
              }}>
              {locked ? <>
                <Lock size={20} style={{ color: "rgba(167,139,250,.62)" }} />
                <span className="font-fantasy text-[7px]" style={{ color: "rgba(216,200,255,.6)" }}>LOCKED</span>
                <span className="font-fantasy text-[7px]" style={{ color: "#fbbf24" }}>{price.toLocaleString()}</span>
              </> : costume ? <>
                <div className="w-12 h-12 rounded-lg overflow-hidden grid place-items-center" style={{ background: "rgba(0,0,0,.45)" }}>
                  {costume.imageUrl ? <img src={costume.imageUrl} alt={costume.name} className="w-full h-full object-contain" /> : <Sparkles size={24} style={{ color: rarityColor }} />}
                </div>
                <span className="font-fantasy text-[7px] w-full truncate" style={{ color: rarityColor }}>{costume.name}</span>
              </> : <>
                <div className="w-12 h-12 rounded-lg grid place-items-center grayscale opacity-40" style={{ border: "1px solid rgba(167,139,250,.35)", background: "radial-gradient(circle,rgba(139,92,246,.18),transparent 70%)" }}>
                  <Sparkles size={22} style={{ color: "#c4b5fd" }} />
                </div>
                <span className="font-fantasy text-[7px]" style={{ color: "rgba(216,200,255,.48)" }}>EMPTY</span>
              </>}
            </button>
          );
        })}
      </div>

      <p className="font-fantasy text-[8px] tracking-widest mb-3" style={{ color: "rgba(216,200,255,.55)" }}>YOUR COSTUMES — TAP TO EQUIP</p>
      {available.length ? <div className="grid grid-cols-3 gap-2">
        {available.map((item) => <button key={item.inventoryId} type="button" data-testid={`bag-costume-${item.inventoryId}`} onClick={() => {
          const slot = nextEmptySlot();
          if (slot) equip.mutate({ costumeInventoryId: item.inventoryId, slot });
          else toast({ title: "All unlocked costume slots are full", description: "Remove a costume or unlock another slot." });
        }} className="rounded-xl p-2 flex flex-col items-center gap-1 active:scale-95" style={{
          background: "rgba(7,14,11,.9)",
          border: "1px solid rgba(139,92,246,.26)",
          cursor: "pointer",
        }}>
          <div className="w-12 h-12 rounded-lg overflow-hidden grid place-items-center" style={{ background: "rgba(0,0,0,.48)" }}>
            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" /> : <Sparkles size={24} style={{ color: "#c4b5fd" }} />}
          </div>
          <span className="font-fantasy text-[7px] w-full truncate" style={{ color: "rgba(230,220,255,.78)" }}>{item.name}</span>
          {item.quantity - (equippedCounts[item.inventoryId] ?? 0) > 1 && <span className="font-fantasy text-[7px]" style={{ color: "#a7f3d0" }}>×{item.quantity - (equippedCounts[item.inventoryId] ?? 0)}</span>}
        </button>)}
      </div> : <p className="font-fantasy text-[10px] text-center py-5" style={{ color: "rgba(255,255,255,.25)" }}>No available costumes in your bag</p>}

      {removeCostume && <div className="fixed inset-0 z-[260] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.94)" }}>
        <div className="w-full max-w-[320px] rounded-2xl p-6 text-center" style={{ background: "#07120d", border: "1px solid rgba(167,139,250,.45)" }}>
          <p className="font-fantasy text-sm mb-2" style={{ color: "#ddd6fe" }}>Unequip Costume?</p>
          <p className="font-fantasy text-[11px] mb-5" style={{ color: "rgba(200,220,200,.58)" }}>Remove {removeCostume.name} from {petName}?</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setRemoveCostume(null)} className="flex-1 py-3 rounded-xl" style={{ color: "#aaa", border: "1px solid #ffffff18" }}>CANCEL</button>
            <button type="button" onClick={() => unequip.mutate(removeCostume.id)} className="flex-1 py-3 rounded-xl" style={{ color: "#fca5a5", border: "1px solid #f8717155" }}>UNEQUIP</button>
          </div>
        </div>
      </div>}

      {unlockSlot && <div className="fixed inset-0 z-[260] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.94)" }}>
        <div className="w-full max-w-[320px] rounded-2xl p-6 text-center" style={{ background: "#07120d", border: "1px solid rgba(240,192,64,.42)" }}>
          <p className="font-fantasy text-sm mb-2" style={{ color: "#fde68a" }}>Unlock Costume Slot {unlockSlot}?</p>
          <p className="font-fantasy text-base font-bold mb-1" style={{ color: "#fbbf24" }}>{getCostumeSlotUnlockCost(unlockSlot).toLocaleString()} coins</p>
          {userCoins < getCostumeSlotUnlockCost(unlockSlot) && <p className="font-fantasy text-[10px] mb-3" style={{ color: "#f87171" }}>Not enough coins</p>}
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={() => setUnlockSlot(null)} className="flex-1 py-3 rounded-xl" style={{ color: "#aaa", border: "1px solid #ffffff18" }}>CANCEL</button>
            <button type="button" disabled={unlock.isPending || userCoins < getCostumeSlotUnlockCost(unlockSlot)} onClick={() => unlock.mutate()} className="flex-1 py-3 rounded-xl disabled:opacity-40" style={{ color: "#fde68a", border: "1px solid #fbbf2455" }}>UNLOCK</button>
          </div>
        </div>
      </div>}
    </section>
  );
}
