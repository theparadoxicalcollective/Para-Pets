import { useRef, useState } from "react";
import { X, ShieldPlus, Lock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";
import homeBg from "@assets/bg_home_v2.png";

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

interface AuthUser {
  id: string;
  coins: number;
}

interface AccessoriesResponse {
  equipped: EquippedAccessory[];
  extraSlots: number;
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
  filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.65)) drop-shadow(0 0 14px rgba(34,197,94,0.2))",
};

const RARITY_COLOR: Record<number, string> = {
  1: "#a89878", 2: "#c8a84b", 3: "#ddb840", 4: "#f0c040", 5: "#ffd700",
};

const SLOT_COST = 3000;
const TOTAL_SLOTS = 5;

export default function PetEquipAccessoriesPage({ petInventoryId, petName, petImage, petTemplateId, rarity, onClose }: Props) {
  const [unequipConfirm, setUnequipConfirm] = useState<EquippedAccessory | null>(null);
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const touchDragIdRef = useRef<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const rc = RARITY_COLOR[rarity] ?? "#a89878";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user } = useQuery<AuthUser>({ queryKey: ["/api/auth/me"], staleTime: 0 });

  const { data: accessoriesData } = useQuery<AccessoriesResponse>({
    queryKey: ["/api/pet", petInventoryId, "accessories"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pet/${petInventoryId}/accessories`);
      return res.json();
    },
    staleTime: 0,
  });
  const equippedAccessories: EquippedAccessory[] = accessoriesData?.equipped ?? [];
  const extraSlots = accessoriesData?.extraSlots ?? 0;
  const maxSlots = 3 + extraSlots;

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

  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pet/${petInventoryId}/unlock-accessory-slot`, {});
      return res.json();
    },
    onSuccess: () => {
      setUnlockConfirm(false);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
      toast({ title: "Slot unlocked!", description: "A new accessory slot has been added for this pet." });
    },
    onError: (err: any) => {
      setUnlockConfirm(false);
      toast({ title: "Could not unlock", description: err?.message || "Not enough coins", variant: "destructive" });
    },
  });

  function handleSlotClick(slot: number) {
    if (slot >= maxSlots) {
      setUnlockConfirm(true);
      return;
    }
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
    if (slot >= maxSlots) return;
    const occupied = equippedAccessories.find(en => en.slot === slot);
    if (occupied) {
      setUnequipConfirm(occupied);
      return;
    }
    const invId = e.dataTransfer.getData("accessoryInvId");
    if (invId) equipMutation.mutate(invId);
  }

  function handleTouchStart(e: React.TouchEvent, invId: string, imageUrl: string | null) {
    touchDragIdRef.current = invId;
    setDraggingId(invId);

    const t = e.touches[0];
    const ghost = document.createElement("div");
    ghost.style.cssText = [
      "position:fixed", "z-index:9999", "width:64px", "height:64px",
      "border-radius:18px", `background:rgba(10,20,16,0.95)`,
      `border:2px solid ${rc}`, "pointer-events:none",
      "display:flex", "align-items:center", "justify-content:center",
      "transform:translate(-50%,-65%)", "opacity:0.92",
      `box-shadow:0 0 22px ${rc}66,0 8px 24px rgba(0,0,0,0.6)`,
    ].join(";");
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.style.cssText = "width:46px;height:46px;object-fit:contain;";
      ghost.appendChild(img);
    }
    ghost.style.left = t.clientX + "px";
    ghost.style.top = t.clientY + "px";
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const touch = ev.touches[0];
      if (ghostRef.current) {
        ghostRef.current.style.left = touch.clientX + "px";
        ghostRef.current.style.top = touch.clientY + "px";
      }
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const slotEl = el?.closest("[data-slot-index]") as HTMLElement | null;
      if (slotEl?.dataset.slotIndex !== undefined) {
        setDragOverSlot(parseInt(slotEl.dataset.slotIndex));
      } else {
        setDragOverSlot(null);
      }
    };

    const onEnd = (ev: TouchEvent) => {
      const touch = ev.changedTouches[0];
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current);
        ghostRef.current = null;
      }
      document.removeEventListener("touchmove", onMove);

      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const slotEl = el?.closest("[data-slot-index]") as HTMLElement | null;
      if (slotEl?.dataset.slotIndex !== undefined) {
        const slotIdx = parseInt(slotEl.dataset.slotIndex);
        if (slotIdx >= maxSlots) {
          setUnlockConfirm(true);
        } else {
          const occupied = equippedAccessories.find(en => en.slot === slotIdx);
          if (occupied) {
            setUnequipConfirm(occupied);
          } else {
            const draggedId = touchDragIdRef.current;
            if (draggedId) equipMutation.mutate(draggedId);
          }
        }
      }

      touchDragIdRef.current = null;
      setDraggingId(null);
      setDragOverSlot(null);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { once: true });
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
        backgroundImage: `linear-gradient(180deg, rgba(4,8,5,0.50) 0%, rgba(3,7,4,0.68) 50%, rgba(2,5,3,0.86) 100%), url(${homeBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          paddingBottom: 14,
          borderBottom: "1px solid rgba(34,197,94,0.2)",
          background: "linear-gradient(180deg, rgba(4,8,5,0.72) 0%, rgba(4,8,5,0.2) 100%)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center gap-3">
          <ShieldPlus size={20} style={{ color: rc, filter: `drop-shadow(0 0 8px ${rc}88)` }} />
          <div>
            <p
              className="font-fantasy font-bold tracking-wider text-sm"
              style={{ color: rc, textShadow: `0 0 12px ${rc}66, 0 2px 4px rgba(0,0,0,0.8)` }}
            >
              EQUIP ACCESSORIES
            </p>
            <p className="font-fantasy text-[10px] tracking-wide" style={{ color: "rgba(160,220,140,0.55)" }}>{petName}</p>
          </div>
        </div>
        <button
          data-testid="button-close-equip-accessories"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{
            width: 44, height: 44,
            background: "linear-gradient(180deg, rgba(6,18,10,0.9) 0%, rgba(4,12,7,0.9) 100%)",
            border: "1.5px solid rgba(34,197,94,0.35)",
            color: "#c8f0c0",
            cursor: "pointer",
            boxShadow: "0 0 14px rgba(34,197,94,0.15), inset 0 0 8px rgba(0,0,0,0.5)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <X size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full flex items-center justify-center pt-6 pb-3">
          <div
            style={{
              width: "min(calc(65*var(--vw)), 220px)",
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
                inset: "-10%",
                borderRadius: "50%",
                background: `radial-gradient(circle at center, ${rc}38 0%, ${rc}14 35%, rgba(22,163,74,0.08) 60%, transparent 75%)`,
                filter: "blur(3px)",
                animation: "feed-halo-pulse 4s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            {petTemplateId ? (
              <PetAnimator petTemplateId={petTemplateId} mode="idle" size={220} fillContainer style={PET_PREVIEW_DROPSHADOW_STYLE} />
            ) : petImage ? (
              <img src={petImage} alt={petName} className="w-full h-full object-contain" style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.7)) drop-shadow(0 0 14px rgba(22,163,74,0.22))" }} />
            ) : (
              <div className="w-full h-full rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            )}
          </div>
        </div>

        <div className="px-5 pb-4">
          <p className="font-fantasy text-[9px] tracking-widest mb-3 text-center" style={{ color: "rgba(160,220,140,0.45)" }}>
            ACCESSORY SLOTS — {equippedAccessories.length}/{maxSlots} EQUIPPED
          </p>

          <div className="grid grid-cols-5 gap-1.5">
            {slots.map(slot => (
              <SlotCell
                key={slot}
                slot={slot}
                maxSlots={maxSlots}
                acc={equippedAccessories.find(e => e.slot === slot) ?? null}
                isOver={dragOverSlot === slot}
                draggingId={draggingId}
                rc={rc}
                onClick={() => handleSlotClick(slot)}
                onDragOver={e => { e.preventDefault(); setDragOverSlot(slot); }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={e => handleDrop(e, slot)}
              />
            ))}
          </div>

          {extraSlots < 2 && (
            <p className="font-fantasy text-[8px] tracking-widest text-center mt-3" style={{ color: "rgba(160,220,140,0.32)" }}>
              Tap a locked slot to unlock it for {SLOT_COST.toLocaleString()} coins
            </p>
          )}
        </div>

        <div
          className="mx-5 rounded-2xl p-4 mb-8"
          style={{
            background: "linear-gradient(180deg, rgba(4,14,8,0.75) 0%, rgba(3,10,6,0.75) 100%)",
            border: "1px solid rgba(34,197,94,0.18)",
            boxShadow: "0 0 24px rgba(22,163,74,0.06), inset 0 0 20px rgba(0,0,0,0.5)",
            backdropFilter: "blur(6px)",
          }}
        >
          <p className="font-fantasy text-[9px] tracking-widest mb-3" style={{ color: "rgba(160,220,140,0.45)" }}>
            YOUR ACCESSORIES — DRAG OR TAP TO EQUIP
          </p>
          {bagAccessories.length === 0 ? (
            <p className="font-fantasy text-[11px] text-center py-6" style={{ color: "rgba(255,255,255,0.22)" }}>
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
                    onTouchStart={e => handleTouchStart(e, item.inventoryId, item.imageUrl)}
                    onClick={() => {
                      if (draggingId) return;
                      const firstEmpty = slots.find(s => s < maxSlots && !equippedAccessories.find(e => e.slot === s));
                      if (firstEmpty !== undefined) equipMutation.mutate(item.inventoryId);
                      else toast({ title: "All slots full", description: "Unequip something first or unlock a new slot." });
                    }}
                    className="rounded-xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(180deg, rgba(4,16,8,0.85) 0%, rgba(3,10,6,0.85) 100%)",
                      border: "1px solid rgba(34,197,94,0.2)",
                      boxShadow: "inset 0 0 10px rgba(0,0,0,0.4)",
                      opacity: isDragging ? 0.35 : 1,
                      cursor: isDragging ? "grabbing" : "grab",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.45)" }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        : <img src={gemCrystalIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />}
                    </div>
                    <span className="font-fantasy text-[7px] tracking-wider text-center w-full truncate" style={{ color: "rgba(200,230,180,0.75)" }}>{item.name}</span>
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
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8" style={{ background: "rgba(2,5,3,0.93)" }}>
          <div
            className="w-full rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "rgba(4,14,8,0.98)", border: `1.5px solid ${rc}44`, maxWidth: 320 }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${rc}44` }}>
              {unequipConfirm.imageUrl
                ? <img src={unequipConfirm.imageUrl} alt={unequipConfirm.name} className="w-full h-full object-contain" />
                : <img src={gemCrystalIcon} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />}
            </div>
            <div className="text-center">
              <p className="font-fantasy font-bold tracking-wider text-sm mb-1" style={{ color: rc }}>Unequip Accessory?</p>
              <p className="font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(180,220,160,0.55)" }}>
                Remove <span style={{ color: "rgba(255,255,255,0.85)" }}>{unequipConfirm.name}</span> from {petName}? It will go back to your bag.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                data-testid="button-cancel-unequip"
                onClick={() => setUnequipConfirm(null)}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
              >CANCEL</button>
              <button
                data-testid="button-confirm-unequip"
                onClick={() => unequipMutation.mutate(unequipConfirm.accessoryInventoryId)}
                disabled={unequipMutation.isPending}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, rgba(248,113,113,0.3) 0%, rgba(200,60,60,0.3) 100%)", border: "1.5px solid rgba(248,113,113,0.5)", color: "#f87171", cursor: "pointer" }}
              >{unequipMutation.isPending ? "REMOVING..." : "UNEQUIP"}</button>
            </div>
          </div>
        </div>
      )}

      {unlockConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8" style={{ background: "rgba(2,5,3,0.93)" }}>
          <div
            className="w-full rounded-2xl p-6 flex flex-col items-center gap-4"
            style={{ background: "rgba(4,14,8,0.98)", border: "1.5px solid rgba(240,192,64,0.4)", maxWidth: 320 }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(30,22,4,0.9) 0%, rgba(20,14,3,0.9) 100%)", border: "2px solid rgba(240,192,64,0.4)", boxShadow: "0 0 24px rgba(240,192,64,0.2)" }}
            >
              <Lock size={28} style={{ color: "rgba(240,192,64,0.9)" }} />
            </div>
            <div className="text-center">
              <p className="font-fantasy font-bold tracking-wider text-sm mb-1" style={{ color: "rgba(240,192,64,0.95)" }}>Unlock Accessory Slot?</p>
              <p className="font-fantasy text-[11px] leading-relaxed mb-2" style={{ color: "rgba(160,220,140,0.55)" }}>
                Add a new slot so {petName} can wear one more accessory.
              </p>
              <p className="font-fantasy text-base font-bold" style={{ color: "#fbbf24" }}>
                3,000 coins
              </p>
              {(user?.coins ?? 0) < SLOT_COST && (
                <p className="font-fantasy text-[10px] mt-1" style={{ color: "#f87171" }}>Not enough coins</p>
              )}
            </div>
            <div className="flex gap-3 w-full">
              <button
                data-testid="button-cancel-unlock"
                onClick={() => setUnlockConfirm(false)}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
              >CANCEL</button>
              <button
                data-testid="button-confirm-unlock"
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending || (user?.coins ?? 0) < SLOT_COST}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, rgba(180,140,20,0.35) 0%, rgba(140,100,10,0.35) 100%)", border: "1.5px solid rgba(240,192,64,0.55)", color: "rgba(240,192,64,0.95)", cursor: "pointer" }}
              >{unlockMutation.isPending ? "UNLOCKING..." : "UNLOCK"}</button>
            </div>
          </div>
        </div>
      )}

      {equipMutation.isPending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: "rgba(2,5,3,0.65)" }}>
          <p className="font-fantasy text-sm animate-pulse" style={{ color: rc }}>Equipping…</p>
        </div>
      )}
    </div>
  );
}

interface SlotCellProps {
  slot: number;
  maxSlots: number;
  acc: EquippedAccessory | null;
  isOver: boolean;
  draggingId: string | null;
  rc: string;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function SlotCell({ slot, maxSlots, acc, isOver, draggingId, rc, onClick, onDragOver, onDragLeave, onDrop }: SlotCellProps) {
  const locked = slot >= maxSlots;

  const borderColor = locked
    ? "rgba(30,80,50,0.3)"
    : acc
    ? `${rc}88`
    : isOver && draggingId
    ? `${rc}cc`
    : "rgba(34,197,94,0.28)";

  const bg = locked
    ? "linear-gradient(160deg, rgba(4,10,6,0.7) 0%, rgba(2,6,4,0.7) 100%)"
    : acc
    ? "linear-gradient(160deg, rgba(4,18,10,0.92) 0%, rgba(3,12,7,0.92) 100%)"
    : isOver && draggingId
    ? `linear-gradient(160deg, rgba(${rc === "#ffd700" ? "80,60,10" : "10,40,20"},0.5) 0%, rgba(${rc === "#ffd700" ? "50,35,5" : "5,24,12"},0.5) 100%)`
    : "linear-gradient(160deg, rgba(4,14,8,0.6) 0%, rgba(3,10,6,0.6) 100%)";

  const boxShadow = locked
    ? "inset 0 0 14px rgba(0,0,0,0.6)"
    : acc
    ? `0 0 18px ${rc}22, inset 0 0 16px rgba(22,163,74,0.08)`
    : isOver && draggingId
    ? `0 0 22px ${rc}44, inset 0 0 18px rgba(22,163,74,0.15)`
    : "inset 0 0 14px rgba(0,0,0,0.5)";

  return (
    <div
      data-testid={`slot-accessory-${slot}`}
      data-slot-index={slot}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="rounded-xl flex flex-col items-center gap-1 p-1.5 transition-all cursor-pointer"
      style={{
        minHeight: 82,
        background: bg,
        border: `2px solid ${borderColor}`,
        boxShadow,
        backdropFilter: "blur(6px)",
        transform: isOver && draggingId && !locked ? "scale(1.03)" : "scale(1)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {locked ? (
        <div className="flex flex-col items-center justify-center h-full gap-1.5 py-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(10,26,16,0.8)", border: "1.5px solid rgba(34,120,70,0.35)", boxShadow: "inset 0 0 8px rgba(0,0,0,0.5)" }}
          >
            <Lock size={14} style={{ color: "rgba(34,197,94,0.7)" }} />
          </div>
          <div className="text-center">
            <p className="font-fantasy text-[6px] tracking-wider" style={{ color: "rgba(34,197,94,0.6)" }}>LOCKED</p>
            <p className="font-fantasy text-[6px]" style={{ color: "rgba(251,191,36,0.6)" }}>3,000</p>
          </div>
        </div>
      ) : acc ? (
        <>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ background: "rgba(0,0,0,0.45)", border: `1px solid ${rc}44`, boxShadow: `0 0 8px ${rc}22` }}
          >
            {acc.imageUrl
              ? <img src={acc.imageUrl} alt={acc.name} className="w-full h-full object-contain" />
              : <img src={gemCrystalIcon} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />}
          </div>
          <span className="font-fantasy text-[6px] tracking-wider text-center w-full truncate" style={{ color: rc }}>{acc.name}</span>
          <div className="flex flex-col items-center gap-0.5">
            {(acc.atkBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#f87171" }}>+{acc.atkBoost} ATK</span>}
            {(acc.defBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#60a5fa" }}>+{acc.defBoost} DEF</span>}
            {(acc.healthBoost ?? 0) > 0 && <span className="font-fantasy text-[6px]" style={{ color: "#4ade80" }}>+{acc.healthBoost} HP</span>}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1.5 py-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at center, rgba(22,163,74,0.12) 0%, rgba(10,80,35,0.06) 60%, transparent 100%)",
              border: `1.5px solid rgba(34,197,94,0.2)`,
              boxShadow: "inset 0 0 10px rgba(0,0,0,0.5), 0 0 6px rgba(22,163,74,0.1)",
            }}
          >
            <span style={{ fontSize: 14, color: "rgba(34,197,94,0.35)", lineHeight: 1 }}>✦</span>
          </div>
          <span className="font-fantasy text-[6px] tracking-wider" style={{ color: "rgba(34,197,94,0.3)" }}>EMPTY</span>
        </div>
      )}
    </div>
  );
}
