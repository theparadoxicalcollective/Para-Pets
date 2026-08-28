import { useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PetAnimator from "@/components/PetAnimator";
import PetCostumeEquipmentSection from "@/components/PetCostumeEquipmentSection";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";
import closetBackground from "@assets/uploads/ClosetBG.png";
import closetCloseButton from "@assets/uploads/ClosetCloseButton.png";

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

interface InventoryAccessory {
  inventoryId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  isListed: boolean;
  quantity: number;
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
  filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.72)) drop-shadow(0 0 14px rgba(91,235,176,0.22))",
};

const RARITY_COLOR: Record<number, string> = {
  1: "#a89878", 2: "#c8a84b", 3: "#ddb840", 4: "#f0c040", 5: "#ffd700",
};

const SLOT_COST = 3000;
const TOTAL_SLOTS = 5;

export default function PetEquipAccessoriesPage({ petInventoryId, petName, petImage, petTemplateId, rarity, onClose }: Props) {
  const [unequipConfirm, setUnequipConfirm] = useState<EquippedAccessory | null>(null);
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const touchDragIdRef = useRef<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const rc = RARITY_COLOR[rarity] ?? "#a89878";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user } = useQuery<AuthUser>({ queryKey: ["/api/auth/me"], staleTime: 0 });
  const {
    data: accessoriesData,
    isLoading: accessoriesLoading,
    isError: accessoriesError,
  } = useQuery<AccessoriesResponse>({
    queryKey: ["/api/pet", petInventoryId, "accessories"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/accessories`)).json(),
    staleTime: 0,
  });
  const { data: inventory = [], isLoading: inventoryLoading, isError: inventoryError } = useQuery<InventoryAccessory[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });
  const { data: allEquippedIds = [], isLoading: equippedIdsLoading, isError: equippedIdsError } = useQuery<string[]>({
    queryKey: ["/api/user/equipped-accessory-ids"],
    staleTime: 0,
  });

  const equippedAccessories = accessoriesData?.equipped ?? [];
  const extraSlots = accessoriesData?.extraSlots ?? 0;
  const maxSlots = 3 + extraSlots;
  const equippedAccessoryIdSet = new Set(allEquippedIds);
  const bagAccessories = inventory.filter((item) =>
    !item.isListed &&
    item.type?.trim().toLowerCase() === "accessory" &&
    !equippedAccessoryIdSet.has(item.inventoryId),
  );
  const bagLoading = accessoriesLoading || inventoryLoading || equippedIdsLoading;
  const bagError = accessoriesError || inventoryError || equippedIdsError;

  const refreshAccessories = () => {
    qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
    qc.invalidateQueries({ queryKey: ["/api/user/equipped-accessory-ids"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory"] });
  };

  const equipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/equip`, { accessoryInventoryId })).json(),
    onSuccess: () => {
      refreshAccessories();
    },
    onError: () => toast({ title: "Failed to equip", description: "Could not equip that accessory", variant: "destructive" }),
  });

  const unequipMutation = useMutation({
    mutationFn: async (accessoryInventoryId: string) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/unequip`, { accessoryInventoryId })).json(),
    onSuccess: (_data, accessoryInventoryId) => {
      qc.setQueryData<string[]>(["/api/user/equipped-accessory-ids"], (current = []) =>
        current.filter((id) => id !== accessoryInventoryId),
      );
      qc.setQueryData<AccessoriesResponse>(["/api/pet", petInventoryId, "accessories"], (current) =>
        current
          ? {
              ...current,
              equipped: current.equipped.filter((item) => item.accessoryInventoryId !== accessoryInventoryId),
            }
          : current,
      );
      setUnequipConfirm(null);
      setBagOpen(true);
      refreshAccessories();
    },
    onError: () => toast({ title: "Failed to unequip", description: "Could not remove that accessory", variant: "destructive" }),
  });

  const unlockMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/pet/${petInventoryId}/unlock-accessory-slot`, {})).json(),
    onSuccess: () => {
      setUnlockConfirm(false);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refreshAccessories();
      toast({ title: "Slot unlocked!", description: "A new accessory slot has been added for this pet." });
    },
    onError: (error: any) => {
      setUnlockConfirm(false);
      toast({ title: "Could not unlock", description: error?.message || "Not enough coins", variant: "destructive" });
    },
  });

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, index) => index);

  function handleSlotClick(slot: number) {
    if (slot >= maxSlots) {
      setUnlockConfirm(true);
      return;
    }
    const occupied = equippedAccessories.find((item) => item.slot === slot);
    if (occupied) setUnequipConfirm(occupied);
    else setBagOpen(true);
  }

  function handleDrop(event: React.DragEvent, slot: number) {
    event.preventDefault();
    setDragOverSlot(null);
    if (slot >= maxSlots) {
      setUnlockConfirm(true);
      return;
    }
    const occupied = equippedAccessories.find((item) => item.slot === slot);
    if (occupied) {
      setUnequipConfirm(occupied);
      return;
    }
    const inventoryId = event.dataTransfer.getData("accessoryInvId");
    if (inventoryId) equipMutation.mutate(inventoryId);
  }

  function equipFirstAvailable(inventoryId: string) {
    const firstEmpty = slots.find((slot) => slot < maxSlots && !equippedAccessories.some((item) => item.slot === slot));
    if (firstEmpty === undefined) {
      toast({ title: "All slots full", description: "Unequip something first or unlock a new slot." });
      return;
    }
    equipMutation.mutate(inventoryId);
  }

  function handleTouchStart(event: React.TouchEvent, inventoryId: string, imageUrl: string | null) {
    touchDragIdRef.current = inventoryId;
    setDraggingId(inventoryId);

    const touch = event.touches[0];
    const ghost = document.createElement("div");
    ghost.style.cssText = [
      "position:fixed", "z-index:9999", "width:64px", "height:64px", "border-radius:16px",
      "background:rgba(4,18,13,0.96)", `border:2px solid ${rc}`, "pointer-events:none",
      "display:flex", "align-items:center", "justify-content:center", "transform:translate(-50%,-70%)",
      `box-shadow:0 0 22px ${rc}66,0 8px 24px rgba(0,0,0,0.7)`,
    ].join(";");
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.style.cssText = "width:48px;height:48px;object-fit:contain;";
      ghost.appendChild(image);
    }
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY}px`;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const onMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      const point = moveEvent.touches[0];
      if (ghostRef.current) {
        ghostRef.current.style.left = `${point.clientX}px`;
        ghostRef.current.style.top = `${point.clientY}px`;
      }
      const target = document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-slot-index]") as HTMLElement | null;
      setDragOverSlot(target?.dataset.slotIndex === undefined ? null : Number(target.dataset.slotIndex));
    };

    const onEnd = (endEvent: TouchEvent) => {
      ghostRef.current?.remove();
      ghostRef.current = null;
      document.removeEventListener("touchmove", onMove);
      const point = endEvent.changedTouches[0];
      const target = document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-slot-index]") as HTMLElement | null;
      if (target?.dataset.slotIndex !== undefined) {
        const slot = Number(target.dataset.slotIndex);
        if (slot >= maxSlots) setUnlockConfirm(true);
        else {
          const occupied = equippedAccessories.find((item) => item.slot === slot);
          if (occupied) setUnequipConfirm(occupied);
          else if (touchDragIdRef.current) equipMutation.mutate(touchDragIdRef.current);
        }
      }
      touchDragIdRef.current = null;
      setDraggingId(null);
      setDragOverSlot(null);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { once: true });
  }

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden" style={{ maxWidth: 768, margin: "0 auto", background: "#020503" }}>
      <img src={closetBackground} alt="" aria-hidden className="absolute inset-0 h-full w-full" style={{ objectFit: "fill", pointerEvents: "none", userSelect: "none" }} />

      <header className="absolute left-1/2 z-[4] -translate-x-1/2 text-center" style={{ top: "5.4%", width: "64%" }}>
        <h1 data-testid="closet-pet-name" className="truncate font-fantasy font-bold tracking-[0.14em]" style={{ color: "#d4a94c", fontSize: "clamp(15px, 4.8vw, 23px)", textShadow: "0 2px 3px #000, 0 0 12px rgba(29,225,170,.28)" }}>{petName}</h1>
      </header>

      <button
        type="button"
        data-testid="button-close-equip-accessories"
        aria-label="Close The Closet"
        onClick={onClose}
        className="absolute z-[6] transition-transform active:scale-90"
        style={{ top: "3.1%", right: "3.2%", width: "11.5%", aspectRatio: "1", background: "transparent", border: 0, padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      >
        <img src={closetCloseButton} alt="" className="h-full w-full object-contain" style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,.75))" }} />
      </button>

      <div className="absolute z-[2] flex items-end justify-center" style={{ left: "22%", top: "18.2%", width: "56%", height: "39.5%" }}>
        <div className="relative" style={{ width: "90%", height: "84%" }}>
          {petTemplateId ? (
            <PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId} mode="idle" size={250} fillContainer style={{ ...PET_PREVIEW_DROPSHADOW_STYLE, position: "relative", zIndex: 2 }} />
          ) : petImage ? (
            <img src={petImage} alt={petName} className="h-full w-full object-contain" style={PET_PREVIEW_DROPSHADOW_STYLE} />
          ) : null}
        </div>
      </div>

      <section className="absolute z-[4]" aria-label="Accessory slots" style={{ left: "5.5%", top: "60.1%", width: "89%", height: "12.2%" }}>
        <button type="button" onClick={() => setBagOpen(true)} className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-fantasy tracking-[0.16em]" style={{ bottom: "102%", color: "rgba(215,239,213,.78)", fontSize: "clamp(7px, 1.9vw, 10px)", textShadow: "0 2px 4px #000", background: "rgba(2,12,8,.48)", border: "1px solid rgba(97,202,144,.18)", borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>
          ACCESSORIES · {equippedAccessories.length}/{maxSlots} · OPEN BAG
        </button>
        <div className="grid h-full grid-cols-5" style={{ gap: "1.7%" }}>
          {slots.map((slot) => (
            <SlotCell
              key={slot}
              slot={slot}
              maxSlots={maxSlots}
              acc={equippedAccessories.find((item) => item.slot === slot) ?? null}
              isOver={dragOverSlot === slot}
              draggingId={draggingId}
              rarityColor={rc}
              onClick={() => handleSlotClick(slot)}
              onDragOver={(event) => { event.preventDefault(); setDragOverSlot(slot); }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(event) => handleDrop(event, slot)}
            />
          ))}
        </div>
      </section>

      <PetCostumeEquipmentSection
        petInventoryId={petInventoryId}
        petName={petName}
        rarityColor={rc}
        userCoins={user?.coins ?? 0}
        closetMode
      />


      {bagOpen && (
        <aside className="absolute bottom-[1.4%] left-[3.5%] right-[3.5%] z-[12] flex h-[26%] flex-col overflow-hidden rounded-2xl" data-testid="accessory-bag-drawer" style={{ background: "linear-gradient(180deg,rgba(7,24,16,.97),rgba(3,12,8,.98))", border: "1.5px solid rgba(202,164,76,.5)", boxShadow: "0 -8px 28px rgba(0,0,0,.7), inset 0 0 24px rgba(0,0,0,.45)" }}>
          <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "rgba(202,164,76,.18)" }}>
            <div>
              <p className="font-fantasy tracking-[0.14em]" style={{ color: "#d8ba72", fontSize: "clamp(8px, 2.3vw, 11px)" }}>YOUR ACCESSORIES</p>
              <p className="font-fantasy" style={{ color: "rgba(195,226,202,.46)", fontSize: "clamp(6px, 1.7vw, 8px)" }}>Tap to equip, or drag to an empty slot</p>
            </div>
            <button type="button" aria-label="Close accessory bag" onClick={() => setBagOpen(false)} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: "#d8ba72", border: "1px solid rgba(202,164,76,.3)", background: "rgba(0,0,0,.22)" }}><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {bagLoading ? (
              <p className="grid h-full place-items-center text-center font-fantasy" style={{ color: "rgba(215,235,220,.52)", fontSize: 10 }}>Loading accessories…</p>
            ) : bagError ? (
              <p className="grid h-full place-items-center px-4 text-center font-fantasy" style={{ color: "rgba(255,190,170,.72)", fontSize: 10 }}>Could not load accessories. Close and reopen the Closet to retry.</p>
            ) : bagAccessories.length === 0 ? (
              <p className="grid h-full place-items-center text-center font-fantasy" style={{ color: "rgba(215,235,220,.38)", fontSize: 10 }}>No available accessories in your bag</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {bagAccessories.map((item) => (
                  <button
                    key={item.inventoryId}
                    type="button"
                    data-testid={`bag-accessory-${item.inventoryId}`}
                    draggable
                    disabled={equipMutation.isPending}
                    onDragStart={(event) => { event.dataTransfer.setData("accessoryInvId", item.inventoryId); setDraggingId(item.inventoryId); }}
                    onDragEnd={() => setDraggingId(null)}
                    onTouchStart={(event) => handleTouchStart(event, item.inventoryId, item.imageUrl)}
                    onClick={() => { if (!draggingId) equipFirstAvailable(item.inventoryId); }}
                    className="flex min-w-0 flex-col items-center gap-1 rounded-xl p-1.5 transition-transform active:scale-95 disabled:opacity-40"
                    style={{ minHeight: 76, background: "rgba(1,9,6,.72)", border: "1px solid rgba(99,187,137,.24)", boxShadow: "inset 0 0 10px rgba(0,0,0,.45)", opacity: draggingId === item.inventoryId ? .35 : 1, cursor: "grab" }}
                  >
                    <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg" style={{ background: "rgba(0,0,0,.36)" }}>
                      <img src={item.imageUrl || gemCrystalIcon} alt={item.name} className="h-full w-full object-contain" />
                    </div>
                    <span className="w-full truncate text-center font-fantasy" style={{ color: "rgba(224,238,219,.76)", fontSize: 7 }}>{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {unequipConfirm && (
        <ClosetDialog title="Unequip Accessory?" color={rc}>
          <img src={unequipConfirm.imageUrl || gemCrystalIcon} alt={unequipConfirm.name} className="h-16 w-16 object-contain" />
          <p className="text-center font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(207,226,207,.65)" }}>Remove <span style={{ color: "white" }}>{unequipConfirm.name}</span> from {petName}?</p>
          <div className="flex w-full gap-3">
            <DialogButton testId="button-cancel-unequip" onClick={() => setUnequipConfirm(null)}>CANCEL</DialogButton>
            <DialogButton testId="button-confirm-unequip" danger disabled={unequipMutation.isPending} onClick={() => unequipMutation.mutate(unequipConfirm.accessoryInventoryId)}>{unequipMutation.isPending ? "REMOVING…" : "UNEQUIP"}</DialogButton>
          </div>
        </ClosetDialog>
      )}

      {unlockConfirm && (
        <ClosetDialog title="Unlock Accessory Slot?" color="#e8bc52">
          <Lock size={34} style={{ color: "#e8bc52" }} />
          <p className="text-center font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(207,226,207,.65)" }}>Add another accessory slot for {petName}.</p>
          <p className="font-fantasy font-bold" style={{ color: "#fbbf24" }}>3,000 coins</p>
          {(user?.coins ?? 0) < SLOT_COST && <p className="font-fantasy text-[10px]" style={{ color: "#f87171" }}>Not enough coins</p>}
          <div className="flex w-full gap-3">
            <DialogButton testId="button-cancel-unlock" onClick={() => setUnlockConfirm(false)}>CANCEL</DialogButton>
            <DialogButton testId="button-confirm-unlock" disabled={unlockMutation.isPending || (user?.coins ?? 0) < SLOT_COST} onClick={() => unlockMutation.mutate()}>{unlockMutation.isPending ? "UNLOCKING…" : "UNLOCK"}</DialogButton>
          </div>
        </ClosetDialog>
      )}

      {equipMutation.isPending && <div className="absolute inset-0 z-[30] grid place-items-center" style={{ background: "rgba(2,5,3,.62)" }}><p className="animate-pulse font-fantasy text-sm" style={{ color: rc }}>Equipping…</p></div>}
    </div>
  );
}

interface SlotCellProps {
  slot: number;
  maxSlots: number;
  acc: EquippedAccessory | null;
  isOver: boolean;
  draggingId: string | null;
  rarityColor: string;
  onClick: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
}

function SlotCell({ slot, maxSlots, acc, isOver, draggingId, rarityColor, onClick, onDragOver, onDragLeave, onDrop }: SlotCellProps) {
  const locked = slot >= maxSlots;
  return (
    <button
      type="button"
      data-testid={`slot-accessory-${slot}`}
      data-slot-index={slot}
      aria-label={locked ? `Unlock accessory slot ${slot + 1}` : acc ? `Unequip ${acc.name}` : `Choose accessory for slot ${slot + 1}`}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl p-1 transition-all active:scale-95"
      style={{ background: isOver && draggingId && !locked ? "rgba(39,180,117,.22)" : "transparent", border: isOver && draggingId && !locked ? `2px solid ${rarityColor}` : "2px solid transparent", boxShadow: isOver && draggingId && !locked ? `0 0 18px ${rarityColor}88` : "none", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {locked ? (
        <><Lock size={18} style={{ color: "rgba(218,181,92,.82)", filter: "drop-shadow(0 2px 3px #000)" }} /><span className="mt-1 font-fantasy" style={{ color: "#e6c873", fontSize: 7, textShadow: "0 1px 2px #000" }}>3,000</span></>
      ) : acc ? (
        <><img src={acc.imageUrl || gemCrystalIcon} alt={acc.name} className="h-[68%] w-[82%] object-contain" style={{ filter: `drop-shadow(0 3px 6px #000) drop-shadow(0 0 6px ${rarityColor}55)` }} /><span className="absolute bottom-[6%] max-w-[88%] truncate rounded px-1 font-fantasy" style={{ color: rarityColor, background: "rgba(0,5,3,.62)", fontSize: 6 }}>{acc.name}</span></>
      ) : (
        <><span className="font-fantasy" style={{ color: "rgba(93,211,153,.5)", fontSize: 18, textShadow: "0 0 8px rgba(44,220,151,.38)" }}>✦</span><span className="font-fantasy tracking-wider" style={{ color: "rgba(183,225,198,.46)", fontSize: 6 }}>TAP</span></>
      )}
    </button>
  );
}

function ClosetDialog({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return <div className="absolute inset-0 z-[40] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.93)" }}><div className="flex w-full max-w-[320px] flex-col items-center gap-4 rounded-2xl p-6" style={{ background: "linear-gradient(180deg,#07170f,#030b07)", border: `1.5px solid ${color}66`, boxShadow: "0 12px 38px rgba(0,0,0,.72)" }}><p className="font-fantasy text-sm font-bold tracking-wider" style={{ color }}>{title}</p>{children}</div></div>;
}

function DialogButton({ testId, danger, disabled, onClick, children }: { testId: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className="flex-1 rounded-xl py-3 font-fantasy text-sm tracking-wider disabled:opacity-40" style={{ color: danger ? "#fca5a5" : "#d9bd72", border: `1px solid ${danger ? "#f8717155" : "#d9bd7244"}`, background: "rgba(255,255,255,.035)" }}>{children}</button>;
}
