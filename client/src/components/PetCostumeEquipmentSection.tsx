import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CostumePlacement } from "@shared/costumeFeature";
import { COSTUME_SLOT_COUNT, getCostumeSlotUnlockCost, getUnlockedCostumeSlotCount } from "@shared/costumeFeature";

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
  extraSlots: number;
}

interface Props {
  petInventoryId: string;
  petName: string;
  rarityColor: string;
  userCoins: number;
  closetMode?: boolean;
}

export default function PetCostumeEquipmentSection({ petInventoryId, petName, rarityColor, userCoins, closetMode = false }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
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

  const { data: inventory = [] } = useQuery<InventoryCostume[]>({ queryKey: ["/api/inventory"], staleTime: 0 });
  const { data: equippedCounts = {} } = useQuery<Record<string, number>>({ queryKey: ["/api/user/equipped-costume-counts"], staleTime: 0 });
  const available = inventory.filter((item) => item.type === "costume" && item.quantity > (equippedCounts[item.inventoryId] ?? 0));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "costumes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user/equipped-costume-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  };

  const equip = useMutation({
    mutationFn: async ({ costumeInventoryId, slot }: { costumeInventoryId: string; slot: number }) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/equip`, { costumeInventoryId, slot })).json(),
    onSuccess: () => { setSelectedSlot(null); refresh(); toast({ title: "Costume equipped!" }); },
    onError: (error: any) => toast({ title: "Could not equip costume", description: error?.message || "This costume could not be equipped.", variant: "destructive" }),
  });

  const unequip = useMutation({
    mutationFn: async (equippedCostumeId: string) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/unequip`, { equippedCostumeId })).json(),
    onSuccess: () => { setRemoveCostume(null); refresh(); },
    onError: (error: any) => toast({ title: "Could not unequip costume", description: error?.message || "This costume could not be removed.", variant: "destructive" }),
  });

  const unlock = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/pet/${petInventoryId}/costumes/unlock`, {})).json(),
    onSuccess: () => { setUnlockSlot(null); queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); refresh(); toast({ title: "Costume slot unlocked!" }); },
    onError: (error: any) => toast({ title: "Could not unlock costume slot", description: error?.message || "The slot could not be unlocked.", variant: "destructive" }),
  });

  const requestLockedSlot = (slot: number) => {
    if (slot !== unlockedCount + 1) {
      toast({ title: "Unlock the previous costume slot first." });
      return;
    }
    setUnlockSlot(slot);
  };

  return (
    <section
      data-testid="section-costume-equipment"
      aria-label="Costume slots"
      className={closetMode ? "absolute z-[4]" : "mx-5 mb-8 rounded-2xl p-4"}
      style={closetMode ? { left: "11.5%", top: "80.1%", width: "77%", height: "11.8%" } : { background: "rgba(4,11,8,.88)", border: "1px solid rgba(167,139,250,.3)" }}
    >
      <div className={closetMode ? "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center" : "mb-3 flex items-center justify-between"} style={closetMode ? { bottom: "104%" } : undefined}>
        <p className="font-fantasy tracking-[0.16em]" style={{ color: "rgba(226,207,157,.82)", fontSize: closetMode ? "clamp(7px, 1.9vw, 10px)" : 9, textShadow: "0 2px 4px #000" }}>COSTUMES · {equipped.length}/{unlockedCount}</p>
      </div>

      <div className={closetMode ? "grid h-full grid-cols-5" : "grid grid-cols-3 gap-2"} style={closetMode ? { gap: "1.7%" } : undefined}>
        {Array.from({ length: COSTUME_SLOT_COUNT }, (_, index) => {
          const slot = index + 1;
          const locked = slot > unlockedCount;
          const costume = equipped.find((item) => item.slot === slot);
          const price = getCostumeSlotUnlockCost(slot);
          return (
            <button
              key={slot}
              type="button"
              data-testid={`slot-costume-${slot}`}
              aria-label={locked ? `Unlock costume slot ${slot}` : costume ? `Unequip ${costume.name}` : `Choose costume for slot ${slot}`}
              onClick={() => locked ? requestLockedSlot(slot) : costume ? setRemoveCostume(costume) : setSelectedSlot(slot)}
              className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-transform active:scale-95"
              style={closetMode ? { gridColumnStart: index + 2, background: "transparent", border: "2px solid transparent", padding: 3, cursor: "pointer" } : { minHeight: 92, padding: 8, background: costume ? "rgba(16,28,20,.92)" : "rgba(3,10,7,.78)", border: `1.5px solid ${locked ? "rgba(80,90,82,.35)" : costume ? rarityColor + "88" : "rgba(139,92,246,.32)"}`, cursor: "pointer" }}
            >
              {locked ? <><Lock size={closetMode ? 18 : 20} style={{ color: "rgba(218,181,92,.82)", filter: "drop-shadow(0 2px 3px #000)" }} /><span className="mt-1 font-fantasy" style={{ color: "#e6c873", fontSize: 7, textShadow: "0 1px 2px #000" }}>{price.toLocaleString()}</span></>
                : costume ? <><div className={closetMode ? "grid h-[72%] w-[86%] place-items-center overflow-hidden" : "grid h-12 w-12 place-items-center overflow-hidden rounded-lg"}>{costume.imageUrl ? <img src={costume.imageUrl} alt={costume.name} className="h-full w-full object-contain" style={{ filter: `drop-shadow(0 3px 6px #000) drop-shadow(0 0 6px ${rarityColor}55)` }} /> : <Sparkles size={24} style={{ color: rarityColor }} />}</div><span className={closetMode ? "absolute bottom-[5%] max-w-[88%] truncate rounded px-1 font-fantasy" : "w-full truncate font-fantasy"} style={{ color: rarityColor, fontSize: 7, background: closetMode ? "rgba(0,5,3,.62)" : undefined }}>{costume.name}</span></>
                : <><Sparkles size={closetMode ? 21 : 24} style={{ color: "rgba(100,221,158,.58)", filter: "drop-shadow(0 0 7px rgba(52,220,145,.36))" }} /><span className="mt-1 font-fantasy" style={{ color: "rgba(190,225,198,.48)", fontSize: 6 }}>TAP</span></>}
            </button>
          );
        })}
      </div>

      <p className={closetMode ? "sr-only" : "mt-4 text-center font-fantasy text-[8px] tracking-widest"} style={{ color: "rgba(216,200,255,.55)" }}>TAP AN EMPTY SLOT TO CHOOSE A COSTUME</p>

      {selectedSlot && <div className="fixed inset-0 z-[260] grid place-items-center px-5 py-8" style={{ background: "rgba(2,5,3,.94)" }}>
        <div className="max-h-full w-full max-w-[380px] overflow-y-auto rounded-2xl p-5" style={{ background: "#07120d", border: "1px solid rgba(202,164,76,.48)", boxShadow: "0 0 30px rgba(0,0,0,.72)" }}>
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-fantasy text-sm" style={{ color: "#ead9a8" }}>Choose Costume</p><p className="mt-1 font-fantasy text-[9px]" style={{ color: "rgba(200,220,200,.58)" }}>Equip to slot {selectedSlot}</p></div><button type="button" aria-label="Close costume inventory" onClick={() => setSelectedSlot(null)} className="rounded-lg px-3 py-2 text-xs" style={{ color: "#dfc27d", border: "1px solid rgba(202,164,76,.32)" }}>CLOSE</button></div>
          {available.length ? <div className="grid grid-cols-3 gap-2" data-testid="costume-slot-inventory">{available.map((item) => {
            const remaining = item.quantity - (equippedCounts[item.inventoryId] ?? 0);
            return <button key={item.inventoryId} type="button" data-testid={`bag-costume-${item.inventoryId}`} disabled={equip.isPending} onClick={() => equip.mutate({ costumeInventoryId: item.inventoryId, slot: selectedSlot })} className="flex flex-col items-center gap-1 rounded-xl p-2 active:scale-95 disabled:opacity-45" style={{ background: "rgba(7,14,11,.9)", border: "1px solid rgba(202,164,76,.26)" }}><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg" style={{ background: "rgba(0,0,0,.48)" }}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" /> : <Sparkles size={24} style={{ color: "#dfc27d" }} />}</div><span className="w-full truncate font-fantasy text-[7px]" style={{ color: "rgba(239,226,194,.8)" }}>{item.name}</span>{remaining > 1 && <span className="font-fantasy text-[7px]" style={{ color: "#a7f3d0" }}>×{remaining}</span>}</button>;
          })}</div> : <p className="py-8 text-center font-fantasy text-[10px]" style={{ color: "rgba(255,255,255,.32)" }}>No available costumes in your bag</p>}
        </div>
      </div>}

      {removeCostume && <div className="fixed inset-0 z-[260] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.94)" }}><div className="w-full max-w-[320px] rounded-2xl p-6 text-center" style={{ background: "#07120d", border: "1px solid rgba(202,164,76,.46)" }}><p className="mb-2 font-fantasy text-sm" style={{ color: "#ead9a8" }}>Unequip Costume?</p><p className="mb-5 font-fantasy text-[11px]" style={{ color: "rgba(200,220,200,.58)" }}>Remove {removeCostume.name} from {petName}?</p><div className="flex gap-3"><button type="button" onClick={() => setRemoveCostume(null)} className="flex-1 rounded-xl py-3" style={{ color: "#aaa", border: "1px solid #ffffff18" }}>CANCEL</button><button type="button" disabled={unequip.isPending} onClick={() => unequip.mutate(removeCostume.id)} className="flex-1 rounded-xl py-3 disabled:opacity-40" style={{ color: "#fca5a5", border: "1px solid #f8717155" }}>UNEQUIP</button></div></div></div>}

      {unlockSlot && <div className="fixed inset-0 z-[260] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.94)" }}><div className="w-full max-w-[320px] rounded-2xl p-6 text-center" style={{ background: "#07120d", border: "1px solid rgba(240,192,64,.42)" }}><p className="mb-2 font-fantasy text-sm" style={{ color: "#fde68a" }}>Unlock Costume Slot {unlockSlot}?</p><p className="mb-1 font-fantasy text-base font-bold" style={{ color: "#fbbf24" }}>{getCostumeSlotUnlockCost(unlockSlot).toLocaleString()} coins</p>{userCoins < getCostumeSlotUnlockCost(unlockSlot) && <p className="mb-3 font-fantasy text-[10px]" style={{ color: "#f87171" }}>Not enough coins</p>}<div className="mt-5 flex gap-3"><button type="button" onClick={() => setUnlockSlot(null)} className="flex-1 rounded-xl py-3" style={{ color: "#aaa", border: "1px solid #ffffff18" }}>CANCEL</button><button type="button" disabled={unlock.isPending || userCoins < getCostumeSlotUnlockCost(unlockSlot)} onClick={() => unlock.mutate()} className="flex-1 rounded-xl py-3 disabled:opacity-40" style={{ color: "#fde68a", border: "1px solid #fbbf2455" }}>UNLOCK</button></div></div></div>}
    </section>
  );
}
