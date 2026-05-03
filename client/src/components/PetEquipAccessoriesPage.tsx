import { useState } from "react";
import { X, ShieldPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";
import enchantedGroveBg from "@assets/bg_enchanted_grove_map.webp";

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

const PET_PREVIEW_DROPSHADOW_STYLE: React.CSSProperties = {
  filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.65)) drop-shadow(0 0 14px rgba(94,234,212,0.18))",
};

const RARITY_COLOR: Record<number, string> = {
  1: "#a89878", 2: "#c8a84b", 3: "#ddb840", 4: "#f0c040", 5: "#ffd700",
};

export default function PetEquipAccessoriesPage({ petInventoryId, petName, petImage, petTemplateId, rarity, onClose }: Props) {
  const [unequipConfirm, setUnequipConfirm] = useState<EquippedAccessory | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const rc = RARITY_COLOR[rarity] ?? "#a89878";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: equippedAccessories = [] } = useQuery<EquippedAccessory[]>({
    queryKey: ["/api/pet", petInventoryId, "accessories"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pet/${petInventoryId}/accessories`);
      return res.json();
    },
    staleTime: 0,
  });

  const { data: allEquippedIds = [] } = useQuery<string[]>({
    queryKey: ["/api/user/equipped-accessory-ids"],
    staleTime: 0,
  });

  const { data: inventory = [] } = useQuery<BagItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const bagAccessories = inventory.filter(
    i => i.type === "accessory" && !allEquippedIds.includes(i.inventoryId)
  );

  const equipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${petInventoryId}/equip`, { accessoryInventoryId });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
      qc.invalidateQueries({ queryKey: ["/api/user/equipped-accessory-ids"] });
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
      qc.invalidateQueries({ queryKey: ["/api/user/equipped-accessory-ids"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      toast({ title: "Failed to unequip", description: "Could not remove that accessory", variant: "destructive" });
    },
  });

  function handleSlotClick(slot: number) {
    const occupied = equippedAccessories.find(e => e.slot === slot);
    if (occupied) setUnequipConfirm(occupied);
  }

  function handleDragStart(e: React.DragEvent, invId: string) {
    e.dataTransfer.setData("accessoryInvId", invId);
    setDraggingId(invId);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  function handleDrop(e: React.DragEvent, slot: number) {
    e.preventDefault();
    setDragOverSlot(null);
    const occupied = equippedAccessories.find(en => en.slot === slot);
    if (occupied) {
      setUnequipConfirm(occupied);
      return;
    }
    const invId = e.dataTransfer.getData("accessoryInvId");
    if (invId) equipMutation.mutate(invId);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
        backgroundImage: `linear-gradient(180deg, rgba(4,18,12,0.78) 0%, rgba(4,14,10,0.92) 60%, rgba(2,10,6,0.98) 100%), url(${enchantedGroveBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          paddingBottom: 14,
          borderBottom: "1px solid rgba(94,234,212,0.18)",
          background: "linear-gradient(180deg, rgba(4,18,12,0.65) 0%, rgba(4,18,12,0.25) 100%)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div className="flex items-center gap-3">
          <ShieldPlus size={20} style={{ color: rc, filter: `drop-shadow(0 0 6px ${rc}88)` }} />
          <div>
            <p
              className="font-fantasy font-bold tracking-wider text-sm"
              style={{ color: rc, textShadow: `0 0 10px ${rc}66, 0 2px 4px rgba(0,0,0,0.7)` }}
            >
              EQUIP ACCESSORIES
            </p>
            <p className="font-fantasy text-[10px] tracking-wide" style={{ color: "rgba(220,255,225,0.55)" }}>{petName}</p>
          </div>
        </div>
        <button
          data-testid="button-close-equip-accessories"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{
            width: 44, height: 44,
            background: "linear-gradient(180deg, rgba(20,46,30,0.85) 0%, rgba(10,28,18,0.85) 100%)",
            border: "1.5px solid rgba(94,234,212,0.45)",
            color: "#dfffe8",
            cursor: "pointer",
            boxShadow: "0 0 14px rgba(94,234,212,0.25), inset 0 0 8px rgba(0,0,0,0.4)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <X size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full flex items-center justify-center pt-8 pb-4">
          <div
            style={{
              width: "min(70vw, 240px)",
              aspectRatio: "1 / 1",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: "-8%",
                borderRadius: "50%",
                background: `radial-gradient(circle at center, ${rc}44 0%, ${rc}1a 35%, rgba(60,200,140,0.08) 60%, transparent 78%)`,
                filter: "blur(2px)",
                animation: "feed-halo-pulse 4s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            {petTemplateId ? (
              <PetAnimator
                petTemplateId={petTemplateId}
                mode="idle"
                size={240}
                fillContainer
                style={PET_PREVIEW_DROPSHADOW_STYLE}
              />
            ) : petImage ? (
              <img
                src={petImage}
                alt={petName}
                className="w-full h-full object-contain"
                style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.65)) drop-shadow(0 0 14px rgba(94,234,212,0.18))" }}
              />
            ) : (
              <div className="w-full h-full rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            )}
          </div>
        </div>

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
                      ? "linear-gradient(180deg, rgba(12,38,24,0.85) 0%, rgba(6,22,14,0.85) 100%)"
                      : isOver && draggingId
                      ? `rgba(${rarity >= 4 ? "240,192,64" : "94,234,212"},0.18)`
                      : "linear-gradient(180deg, rgba(8,22,14,0.55) 0%, rgba(4,12,8,0.55) 100%)",
                    border: acc
                      ? `1.5px solid ${rc}66`
                      : isOver && draggingId
                      ? `1.5px dashed ${rc}99`
                      : draggingId
                      ? `1.5px dashed ${rc}55`
                      : "1.5px dashed rgba(94,234,212,0.22)",
                    boxShadow: acc
                      ? `0 0 16px ${rc}22, inset 0 0 14px rgba(94,234,212,0.06)`
                      : "inset 0 0 12px rgba(0,0,0,0.4)",
                    backdropFilter: "blur(4px)",
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
                    </>
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                      <span style={{ fontSize: 22, color: "rgba(255,255,255,0.15)" }}>+</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="mx-5 rounded-2xl p-4 mb-6"
          style={{
            background: "linear-gradient(180deg, rgba(8,24,16,0.7) 0%, rgba(4,14,9,0.7) 100%)",
            border: "1px solid rgba(94,234,212,0.18)",
            boxShadow: "0 0 22px rgba(94,234,212,0.06), inset 0 0 18px rgba(0,0,0,0.4)",
            backdropFilter: "blur(6px)",
          }}
        >
          <p className="font-fantasy text-[9px] tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            YOUR ACCESSORIES — DRAG TO EQUIP
          </p>
          {bagAccessories.length === 0 ? (
            <p className="font-fantasy text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.25)" }}>
              No accessories in your bag
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {bagAccessories.map(item => {
                const isDragging = draggingId === item.inventoryId;
                return (
                  <div
                    key={item.inventoryId}
                    data-testid={`bag-accessory-${item.inventoryId}`}
                    draggable
                    onDragStart={e => handleDragStart(e, item.inventoryId)}
                    onDragEnd={handleDragEnd}
                    className="rounded-xl p-2 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(180deg, rgba(10,28,18,0.78) 0%, rgba(4,14,9,0.78) 100%)",
                      border: "1px solid rgba(94,234,212,0.18)",
                      boxShadow: "inset 0 0 8px rgba(0,0,0,0.35)",
                      opacity: isDragging ? 0.4 : 1,
                    }}
                  >
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        : <img src={gemCrystalIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                    </div>
                    <span className="font-fantasy text-[7px] tracking-wider text-center w-full truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{item.name}</span>
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

      {equipMutation.isPending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: "rgba(4,8,5,0.6)" }}>
          <p className="font-fantasy text-sm animate-pulse" style={{ color: rc }}>Equipping...</p>
        </div>
      )}
    </div>
  );
}
