import { useState } from "react";
import { X, ShieldPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";

interface AccessoryItem {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface EquippedAccessory {
  id: string;
  slot: number;
  accessoryInventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface BagItem {
  inventoryId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

interface Props {
  petInventoryId: string;
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  rarity: number;
  onClose: () => void;
}

const RARITY_COLOR: Record<number, string> = {
  1: "#a89878", 2: "#c8a84b", 3: "#ddb840", 4: "#f0c040", 5: "#ffd700",
};

export default function PetEquipAccessoriesPage({ petInventoryId, petName, petImage, petTemplateId, rarity, onClose }: Props) {
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [unequipConfirm, setUnequipConfirm] = useState<EquippedAccessory | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const rc = RARITY_COLOR[rarity] ?? "#a89878";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: equippedAccessories = [], isLoading: equippedLoading } = useQuery<EquippedAccessory[]>({
    queryKey: ["/api/pet", petInventoryId, "accessories"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pet/${petInventoryId}/accessories`);
      return res.json();
    },
    staleTime: 0,
  });

  const { data: inventory = [] } = useQuery<BagItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const equippedIds = equippedAccessories.map(e => e.accessoryInventoryId);
  const bagAccessories = inventory.filter(i => i.type === "accessory" && !equippedIds.includes(i.inventoryId));

  const equipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${petInventoryId}/equip`, { accessoryInventoryId });
      return res.json();
    },
    onSuccess: () => {
      setSelectedInvId(null);
      qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      toast({ title: "Failed to equip", description: "Could not equip that accessory", variant: "destructive" });
    },
  });

  const unequipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${petInventoryId}/unequip`, { accessoryInventoryId });
      return res.json();
    },
    onSuccess: () => {
      setUnequipConfirm(null);
      qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      toast({ title: "Failed to unequip", description: "Could not remove that accessory", variant: "destructive" });
    },
  });

  function handleSlotClick(slot: number) {
    const occupied = equippedAccessories.find(e => e.slot === slot);
    if (occupied) {
      setUnequipConfirm(occupied);
      return;
    }
    if (selectedInvId) {
      equipMutation.mutate(selectedInvId);
    }
  }

  function handleDragStart(e: React.DragEvent, invId: string) {
    e.dataTransfer.setData("accessoryInvId", invId);
    setSelectedInvId(invId);
  }

  function handleDrop(e: React.DragEvent, slot: number) {
    e.preventDefault();
    setDragOverSlot(null);
    const occupied = equippedAccessories.find(en => en.slot === slot);
    if (occupied) {
      setUnequipConfirm(occupied);
      return;
    }
    const invId = e.dataTransfer.getData("accessoryInvId") || selectedInvId;
    if (invId) equipMutation.mutate(invId);
  }

  function handleInvItemClick(invId: string) {
    setSelectedInvId(prev => prev === invId ? null : invId);
  }

  const selectedBag = bagAccessories.find(i => i.inventoryId === selectedInvId);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
        background: "linear-gradient(180deg, rgba(6,12,8,0.99) 0%, rgba(4,8,5,0.99) 100%)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(74,222,128,0.12)" }}
      >
        <div className="flex items-center gap-3">
          <ShieldPlus size={18} style={{ color: rc }} />
          <div>
            <p className="font-fantasy font-bold tracking-wider text-sm" style={{ color: rc }}>EQUIP ACCESSORIES</p>
            <p className="font-fantasy text-[10px] tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>{petName}</p>
          </div>
        </div>
        <button
          data-testid="button-close-equip-accessories"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pet display */}
        <div className="flex justify-center pt-6 pb-3">
          <div style={{ width: 130, height: 130, position: "relative" }}>
            {petTemplateId ? (
              <PetAnimator petTemplateId={petTemplateId} mode="idle" view="front" size={512} className="w-full h-full" style={{ aspectRatio: "1/1" }} />
            ) : petImage ? (
              <img src={petImage} alt={petName} className="w-full h-full object-contain" style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.7))" }} />
            ) : (
              <div className="w-full h-full rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            )}
          </div>
        </div>

        {/* Accessory slots */}
        <div className="px-5 pb-4">
          <p className="font-fantasy text-[9px] tracking-widest mb-3 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            ACCESSORY SLOTS — {equippedAccessories.length}/3 EQUIPPED
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(slot => {
              const acc = equippedAccessories.find(e => e.slot === slot);
              const isOver = dragOverSlot === slot;
              return (
                <div
                  key={slot}
                  data-testid={`slot-accessory-${slot}`}
                  onClick={() => handleSlotClick(slot)}
                  onDragOver={e => { e.preventDefault(); setDragOverSlot(slot); }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={e => handleDrop(e, slot)}
                  className="rounded-2xl flex flex-col items-center gap-1.5 p-3 transition-all cursor-pointer"
                  style={{
                    minHeight: 100,
                    background: acc
                      ? "rgba(30,15,5,0.85)"
                      : isOver && selectedInvId
                      ? `rgba(${rarity >= 4 ? "240,192,64" : "74,222,128"},0.15)`
                      : "rgba(0,0,0,0.25)",
                    border: acc
                      ? `1.5px solid ${rc}55`
                      : isOver && selectedInvId
                      ? `1.5px dashed ${rc}99`
                      : selectedInvId
                      ? `1.5px dashed ${rc}44`
                      : "1.5px dashed rgba(255,255,255,0.1)",
                    boxShadow: acc ? `0 0 14px ${rc}18` : "none",
                  }}
                >
                  {acc ? (
                    <>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
                        {acc.imageUrl
                          ? <img src={acc.imageUrl} alt={acc.name} className="w-full h-full object-contain" />
                          : <img src={gemCrystalIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />}
                      </div>
                      <span className="font-fantasy text-[8px] tracking-wider text-center w-full truncate" style={{ color: rc }}>{acc.name}</span>
                      <div className="flex flex-col items-center gap-0.5">
                        {(acc.atkBoost ?? 0) > 0 && <span className="font-fantasy text-[7px]" style={{ color: "#f87171" }}>+{acc.atkBoost} ATK</span>}
                        {(acc.defBoost ?? 0) > 0 && <span className="font-fantasy text-[7px]" style={{ color: "#60a5fa" }}>+{acc.defBoost} DEF</span>}
                        {(acc.healthBoost ?? 0) > 0 && <span className="font-fantasy text-[7px]" style={{ color: "#4ade80" }}>+{acc.healthBoost} HP</span>}
                      </div>
                      <span className="font-fantasy text-[6px] tracking-wider mt-auto" style={{ color: "rgba(248,113,113,0.5)" }}>TAP TO UNEQUIP</span>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                        <span style={{ fontSize: 22, color: "rgba(255,255,255,0.15)" }}>+</span>
                      </div>
                      <span className="font-fantasy text-[8px] tracking-wider" style={{ color: "rgba(255,255,255,0.2)" }}>
                        {selectedInvId ? "TAP TO EQUIP" : "EMPTY"}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected item hint */}
        {selectedBag && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-xl flex items-center gap-3" style={{ background: `rgba(${rarity >= 4 ? "240,192,64" : "74,222,128"},0.08)`, border: `1px solid ${rc}33` }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: "rgba(0,0,0,0.4)" }}>
              {selectedBag.imageUrl
                ? <img src={selectedBag.imageUrl} alt={selectedBag.name} className="w-full h-full object-contain" />
                : <img src={gemCrystalIcon} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
            </div>
            <div className="min-w-0">
              <p className="font-fantasy text-[9px] tracking-wider truncate" style={{ color: rc }}>{selectedBag.name} selected</p>
              <p className="font-fantasy text-[8px]" style={{ color: "rgba(255,255,255,0.35)" }}>Tap an empty slot to equip</p>
            </div>
            <button
              onClick={() => setSelectedInvId(null)}
              className="ml-auto flex-shrink-0 font-fantasy text-[8px] px-2 py-1 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", cursor: "pointer", border: "none" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Inventory */}
        <div
          className="mx-5 rounded-2xl p-4 mb-6"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="font-fantasy text-[9px] tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            YOUR ACCESSORIES
          </p>
          {bagAccessories.length === 0 ? (
            <p className="font-fantasy text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.25)" }}>
              No accessories in your bag
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {bagAccessories.map(item => {
                const isSelected = selectedInvId === item.inventoryId;
                return (
                  <div
                    key={item.inventoryId}
                    data-testid={`bag-accessory-${item.inventoryId}`}
                    draggable
                    onDragStart={e => handleDragStart(e, item.inventoryId)}
                    onClick={() => handleInvItemClick(item.inventoryId)}
                    className="rounded-xl p-2 flex flex-col items-center gap-1 cursor-pointer transition-all active:scale-95"
                    style={{
                      background: isSelected ? `${rc}18` : "rgba(20,10,3,0.7)",
                      border: isSelected ? `1.5px solid ${rc}77` : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: isSelected ? `0 0 12px ${rc}22` : "none",
                    }}
                  >
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        : <img src={gemCrystalIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                    </div>
                    <span className="font-fantasy text-[7px] tracking-wider text-center w-full truncate" style={{ color: isSelected ? rc : "rgba(255,255,255,0.65)" }}>{item.name}</span>
                    <div className="flex flex-col items-center gap-0.5">
                      {(item.atkBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#f87171" }}>+{item.atkBoost} ATK</span>}
                      {(item.defBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#60a5fa" }}>+{item.defBoost} DEF</span>}
                      {(item.healthBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#4ade80" }}>+{item.healthBoost} HP</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Unequip confirmation overlay */}
      {unequipConfirm && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-8"
          style={{ background: "rgba(4,8,5,0.92)" }}
        >
          <div
            className="w-full rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "rgba(20,10,3,0.95)", border: `1.5px solid ${rc}44`, maxWidth: 320 }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${rc}44` }}>
              {unequipConfirm.imageUrl
                ? <img src={unequipConfirm.imageUrl} alt={unequipConfirm.name} className="w-full h-full object-contain" />
                : <img src={gemCrystalIcon} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />}
            </div>
            <div className="text-center">
              <p className="font-fantasy font-bold tracking-wider text-sm mb-1" style={{ color: rc }}>Unequip Accessory?</p>
              <p className="font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Remove <span style={{ color: "rgba(255,255,255,0.8)" }}>{unequipConfirm.name}</span> from {petName}? It will go back to your bag.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                data-testid="button-cancel-unequip"
                onClick={() => setUnequipConfirm(null)}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
              >
                CANCEL
              </button>
              <button
                data-testid="button-confirm-unequip"
                onClick={() => unequipMutation.mutate(unequipConfirm.accessoryInventoryId)}
                disabled={unequipMutation.isPending}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, rgba(248,113,113,0.3) 0%, rgba(200,60,60,0.3) 100%)", border: "1.5px solid rgba(248,113,113,0.5)", color: "#f87171", cursor: "pointer" }}
              >
                {unequipMutation.isPending ? "REMOVING..." : "UNEQUIP"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equip loading overlay */}
      {equipMutation.isPending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: "rgba(4,8,5,0.6)" }}>
          <p className="font-fantasy text-sm animate-pulse" style={{ color: rc }}>Equipping...</p>
        </div>
      )}
    </div>
  );
}
