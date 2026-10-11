import { useEffect, useRef, useState } from "react";
import PetPageOvalPlacement from "@/components/PetPageOvalPlacement";
import { Lock, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { currencyAssets } from "@/lib/currencyAssets";
import PetAnimator from "@/components/PetAnimator";
import ErrorBoundary from "@/components/ErrorBoundary";
import { detectRuntimeMode } from "@/lib/runtimeMode";
import { shouldUseLowMemoryPetRenderer } from "@/lib/petRenderSafety";
import { clientPointInRenderedElement, clientToStagePortal, getStagePortalTarget } from "@/lib/stage";
import { useStageSurroundings } from "@/lib/stageSurroundings";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import ViewportBackdropPortal from "@/components/ViewportBackdropPortal";
import PetCostumeEquipmentSection from "@/components/PetCostumeEquipmentSection";
import MiniPetRenderer, { type EquippedMiniPet } from "@/components/MiniPetRenderer";
import gemCrystalIcon from "@assets/generated_images/icon_gem_crystal.png";
import closetBackground from "@assets/uploads/NewActivePetBG.png";
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
  isAdmin?: boolean;
}

interface AccessoriesResponse {
  equipped: EquippedAccessory[];
  extraSlots: number;
}

interface MiniPetInventoryItem {
  inventoryId: string; name: string; imageUrl: string | null; rarity: number;
  atkBoost: number; healthBoost: number; defBoost: number;
  animationStyle: "breath" | "float"; isListed: boolean; isEquipped: boolean;
}

interface Props {
  petInventoryId: string;
  petName: string;
  petImage: string | null;
  petTemplateId: string | null;
  rarity: number;
  onClose: () => void;
  deviceSurface?: boolean;
}

const PET_PREVIEW_DROPSHADOW_STYLE: React.CSSProperties = {
  filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.72)) drop-shadow(0 0 14px rgba(91,235,176,0.22))",
};

const RARITY_COLOR: Record<number, string> = {
  1: "#a89878", 2: "#c8a84b", 3: "#ddb840", 4: "#f0c040", 5: "#ffd700",
};

const SLOT_COST = 3000;
const TOTAL_SLOTS = 5;

export default function PetEquipAccessoriesPage({ petInventoryId, petName, petImage, petTemplateId, rarity, onClose, deviceSurface = false }: Props) {
  const [lowMemory] = useState(() => shouldUseLowMemoryPetRenderer(detectRuntimeMode()));
  useStageSurroundings({
    enabled: !deviceSurface,
    imageUrl: closetBackground,
    backgroundPosition: "center center",
    overlayAlpha: 0.28,
    priority: 30,
  });
  const [unequipConfirm, setUnequipConfirm] = useState<EquippedAccessory | null>(null);
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [miniPetOpen, setMiniPetOpen] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const touchDragIdRef = useRef<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), [petInventoryId]);

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
  const { data: miniPetInventory = [], isLoading: miniPetsLoading } = useQuery<MiniPetInventoryItem[]>({
    queryKey: ["/api/mini-pets/inventory"],
    staleTime: 0,
  });
  const { data: equippedMiniPetData } = useQuery<{ equipped: EquippedMiniPet | null }>({
    queryKey: ["/api/pet", petInventoryId, "mini-pet"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/mini-pet`)).json(),
    staleTime: 0,
  });
  const {
    data: allEquippedIds = [],
    isLoading: equippedIdsLoading,
    isFetching: equippedIdsFetching,
    isError: equippedIdsError,
    isRefetchError: equippedIdsRefetchError,
    refetch: refetchEquippedIds,
  } = useQuery<string[]>({
    queryKey: ["/api/user/equipped-accessory-ids"],
    queryFn: async () => (await apiRequest("GET", "/api/user/equipped-accessory-ids")).json(),
    staleTime: 0,
    refetchOnMount: "always",
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
  const bagLoading = accessoriesLoading || inventoryLoading || equippedIdsLoading || equippedIdsFetching;
  const bagError = accessoriesError || inventoryError || equippedIdsError || equippedIdsRefetchError;

  const openAccessoryBag = () => {
    setBagOpen(true);
    void refetchEquippedIds();
  };

  const refreshAccessories = () => {
    qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "accessories"] });
    qc.invalidateQueries({ queryKey: ["/api/user/equipped-accessory-ids"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory"] });
  };

  const refreshMiniPets = () => {
    qc.invalidateQueries({ queryKey: ["/api/mini-pets/inventory"] });
    qc.invalidateQueries({ queryKey: ["/api/pet", petInventoryId, "mini-pet"] });
    qc.invalidateQueries({ queryKey: ["/api/inventory"] });
  };
  const equipMiniPet = useMutation({
    mutationFn: async (miniPetInventoryId: string) =>
      (await apiRequest("POST", `/api/pet/${petInventoryId}/mini-pet/equip`, { miniPetInventoryId })).json(),
    onSuccess: refreshMiniPets,
    onError: (error: any) => toast({ title: "Could not equip Mini Pet", description: error.message, variant: "destructive" }),
  });
  const unequipMiniPet = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/pet/${petInventoryId}/mini-pet`)).json(),
    onSuccess: refreshMiniPets,
    onError: (error: any) => toast({ title: "Could not unequip Mini Pet", description: error.message, variant: "destructive" }),
  });

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
      refreshAccessories();
      openAccessoryBag();
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
    else openAccessoryBag();
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
    const touch = event.touches[0];
    if (!touch) return;
    dragCleanupRef.current?.();
    touchDragIdRef.current = inventoryId;
    setDraggingId(inventoryId);

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
    const ghostTarget = deviceSurface
      ? document.getElementById("game-viewport-hud") ?? document.body
      : getStagePortalTarget();
    const ghostPointForClient = (clientX: number, clientY: number) => {
      if (!deviceSurface) return clientToStagePortal(clientX, clientY);
      if (ghostTarget === document.body) return { x: clientX, y: clientY };
      return clientPointInRenderedElement(ghostTarget.getBoundingClientRect(), clientX, clientY, ghostTarget.clientWidth, ghostTarget.clientHeight);
    };
    ghost.style.position = ghostTarget === document.body ? "fixed" : "absolute";
    const startPoint = ghostPointForClient(touch.clientX, touch.clientY);
    ghost.style.left = `${startPoint.x}px`;
    ghost.style.top = `${startPoint.y}px`;
    ghostTarget.appendChild(ghost);
    ghostRef.current = ghost;

    const onMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      const point = moveEvent.touches[0];
      if (!point) return;
      if (ghostRef.current) {
        const ghostPoint = ghostPointForClient(point.clientX, point.clientY);
        ghostRef.current.style.left = `${ghostPoint.x}px`;
        ghostRef.current.style.top = `${ghostPoint.y}px`;
      }
      const target = document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-slot-index]") as HTMLElement | null;
      setDragOverSlot(target?.dataset.slotIndex === undefined ? null : Number(target.dataset.slotIndex));
    };

    const onEnd = (endEvent: TouchEvent) => {
      setDraggingId(null);
      setDragOverSlot(null);
      const draggedId = touchDragIdRef.current;
      cleanup();
      const point = endEvent.changedTouches[0];
      if (!point) return;
      const target = document.elementFromPoint(point.clientX, point.clientY)?.closest("[data-slot-index]") as HTMLElement | null;
      if (target?.dataset.slotIndex !== undefined) {
        const slot = Number(target.dataset.slotIndex);
        if (slot >= maxSlots) setUnlockConfirm(true);
        else {
          const occupied = equippedAccessories.find((item) => item.slot === slot);
          if (occupied) setUnequipConfirm(occupied);
          else if (draggedId) equipMutation.mutate(draggedId);
        }
      }
    };
    const cleanup = () => {
      ghost.remove();
      ghostRef.current = null;
      touchDragIdRef.current = null;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
      dragCleanupRef.current = null;
    };
    const onCancel = () => { cleanup(); setDraggingId(null); setDragOverSlot(null); };
    dragCleanupRef.current = cleanup;

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { once: true });
    document.addEventListener("touchcancel", onCancel, { once: true });
  }

  return (
    <>

      <div
        data-testid="closet-authored-template"
        data-responsive-closet="true"
        data-device-closet={deviceSurface ? "true" : undefined}
        data-stage-coordinate-space={deviceSurface ? "viewport" : "canonical"}
        data-viewport-visual-owner="scene"
        className="absolute inset-0 z-[200] h-full w-full overflow-hidden"
        style={{ background: "transparent" }}
      >


      {deviceSurface ? (
        <div
          data-testid="closet-viewport-environment"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: "#020503",
            backgroundImage: `url(${closetBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : (
      <ViewportBackdropPortal>
        <div
          data-testid="closet-viewport-environment"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: "#020503",
            backgroundImage: `url(${closetBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      </ViewportBackdropPortal>

      )}
      {!deviceSurface && <div data-testid="closet-authored-background" className="absolute inset-0 pointer-events-none" style={{
        zIndex: 0,
        backgroundImage: `url(${closetBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        WebkitMaskImage: "linear-gradient(90deg,transparent,black 8%,black 92%,transparent)",
        maskImage: "linear-gradient(90deg,transparent,black 8%,black 92%,transparent)",
      }} />}

      <header className="absolute left-1/2 z-[4] -translate-x-1/2 text-center" style={{ top: "11.2%", width: "76%", maxWidth: 390, pointerEvents: "none" }}>
        <h1 data-testid="closet-pet-name" className="truncate font-fantasy font-bold tracking-[0.08em]" style={{ display: "inline-block", maxWidth: "100%", color: "#ffe7a4", fontSize: "clamp(15px, 4.2vw, 21px)", lineHeight: 1.35, textShadow: "0 2px 4px #000, 0 0 10px #000", background: "rgba(3,19,14,.76)", border: "1px solid rgba(245,209,123,.48)", borderRadius: 999, padding: "3px 14px", boxShadow: "0 3px 10px rgba(0,0,0,.4)" }}>{petName}</h1>
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

      <div data-testid="closet-pet-preview" className="absolute z-[2]" style={{ left: "5%", top: "28%", width: "90%", aspectRatio: "1" }}>
        <PetPageOvalPlacement page="closet" admin={user?.isAdmin === true} petTemplateId={petTemplateId} petInventoryId={petInventoryId}>
          {petTemplateId ? (
            <ErrorBoundary
              context="PetEquipAccessoriesPage.PetAnimator"
              resetKey={`${petInventoryId}:${petTemplateId}`}
              fallback={petImage ? <img src={petImage} alt={petName} className="h-full w-full object-contain" style={PET_PREVIEW_DROPSHADOW_STYLE} /> : null}
            >
              <PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId} mode="idle" size={390} fillContainer lowMemory={lowMemory} className="w-full h-full" style={{ ...PET_PREVIEW_DROPSHADOW_STYLE, width: "100%", height: "100%", pointerEvents: "none" }} />
            </ErrorBoundary>
          ) : petImage ? (
            <img src={petImage} alt={petName} className="h-full w-full object-contain" style={PET_PREVIEW_DROPSHADOW_STYLE} />
          ) : null}
        </PetPageOvalPlacement>
      </div>

      <button type="button" data-testid="button-open-mini-pets" aria-label="Open Mini Pets inventory" onClick={() => setMiniPetOpen(true)}
        className="absolute z-[5] closet-mini-pet-trigger grid place-items-center rounded-full transition-transform active:scale-90"
        style={{ left: "7.5%", top: "55%", width: "13%", aspectRatio: "1", border: "1.5px solid rgba(161,255,209,.86)", background: "radial-gradient(circle,rgba(24,110,79,.86),rgba(3,28,20,.92) 72%)", boxShadow: "0 3px 9px rgba(0,0,0,.7),0 0 9px rgba(74,255,177,.3)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        {equippedMiniPetData?.equipped ? (
          <MiniPetRenderer petInventoryId={petInventoryId} style={{ width: "88%", height: "88%" }} />
        ) : (
          <><span className="font-fantasy text-xl" style={{ color: "#86efac", textShadow: "0 0 10px rgba(74,255,177,.9)" }}>✦</span><span className="absolute -bottom-5 whitespace-nowrap rounded-md px-1 font-fantasy text-[9px] tracking-wider" style={{ color: "#eafff0", background: "rgba(1,24,14,.9)", textShadow: "0 1px 3px #000" }}>MINI PET</span></>
        )}
      </button>

      <section className="absolute z-[4] closet-accessory-slots" aria-label="Accessory slots" style={{ left: "8%", top: "20%", width: "84%", height: "9.2%", borderRadius: 10, background: "rgba(2,18,13,.63)", border: "1px solid rgba(96,233,160,.43)", padding: 2, boxShadow: "0 3px 9px rgba(0,0,0,.6)" }}>
        <button type="button" onClick={openAccessoryBag} className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-fantasy tracking-[0.16em]" style={{ bottom: "104%", color: "#e8ffef", fontSize: "clamp(9px, 2.2vw, 11px)", textShadow: "0 2px 4px #000", background: "rgba(2,21,14,.85)", border: "1px solid rgba(97,202,144,.45)", borderRadius: 999, padding: "3px 9px", cursor: "pointer", letterSpacing: "0.06em" }}>
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
        deviceSurface={deviceSurface}
        closetMode
      />

      {miniPetOpen && (
        <aside className="absolute inset-x-[5%] top-[14%] z-[35] closet-mini-pet-panel flex max-h-[72%] flex-col overflow-hidden rounded-2xl" data-testid="mini-pet-inventory"
          style={{ background: "linear-gradient(180deg,rgba(7,30,20,.985),rgba(2,10,7,.99))", border: "1.5px solid rgba(112,240,174,.5)", boxShadow: "0 16px 40px rgba(0,0,0,.82),0 0 24px rgba(50,220,145,.14)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "rgba(112,240,174,.18)" }}>
            <div><p className="font-fantasy text-xs tracking-[.14em]" style={{ color: "#a7f3d0" }}>MINI PETS</p><p className="font-fantasy text-[8px]" style={{ color: "rgba(210,235,218,.5)" }}>Choose one companion for {petName}</p></div>
            <button type="button" aria-label="Close Mini Pets inventory" onClick={() => setMiniPetOpen(false)} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: "#a7f3d0", border: "1px solid rgba(112,240,174,.3)" }}><X size={16} /></button>
          </div>
          <div className="overflow-y-auto p-3">
            {equippedMiniPetData?.equipped && (
              <button type="button" disabled={unequipMiniPet.isPending} onClick={() => unequipMiniPet.mutate()} className="mb-3 w-full rounded-lg py-2 font-fantasy text-[9px] tracking-wider" style={{ color: "#fca5a5", border: "1px solid rgba(248,113,113,.3)", background: "rgba(127,29,29,.14)" }}>UNEQUIP {equippedMiniPetData.equipped.name.toUpperCase()}</button>
            )}
            {miniPetsLoading ? <p className="py-8 text-center text-xs text-stone-400">Loading Mini Pets…</p> : miniPetInventory.length === 0 ? (
              <p className="py-10 text-center font-fantasy text-[10px]" style={{ color: "rgba(215,235,220,.45)" }}>You do not own any Mini Pets yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {miniPetInventory.map(item => {
                  const active = equippedMiniPetData?.equipped?.inventoryId === item.inventoryId;
                  const unavailable = item.isListed || (item.isEquipped && !active);
                  return (
                    <button key={item.inventoryId} type="button" disabled={active || unavailable || equipMiniPet.isPending} onClick={() => equipMiniPet.mutate(item.inventoryId)}
                      data-testid={`mini-pet-option-${item.inventoryId}`} className="flex min-w-0 flex-col items-center rounded-xl p-2 disabled:opacity-45"
                      style={{ border: active ? "1px solid #6ee7b7" : "1px solid rgba(110,231,183,.2)", background: active ? "rgba(16,120,82,.2)" : "rgba(0,0,0,.3)" }}>
                      <img src={item.imageUrl ?? ""} alt={item.name} className="h-20 w-20 object-contain" />
                      <span className="w-full truncate font-fantasy text-[9px]" style={{ color: active ? "#a7f3d0" : "#e7e5e4" }}>{item.name}</span>
                      <span className="text-[8px] text-amber-300">{"★".repeat(item.rarity)}</span>
                      <span className="mt-1 text-[7px] text-stone-400">+{item.atkBoost || 0} ATK · +{item.healthBoost || 0} HP · +{item.defBoost || 0} DEF</span>
                      <span className="mt-1 font-fantasy text-[7px] text-emerald-300/70">{active ? "EQUIPPED" : unavailable ? "ON ANOTHER PET" : "TAP TO EQUIP"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}


      {bagOpen && (
        <aside className="absolute bottom-[1.4%] left-[3.5%] right-[3.5%] z-[12] closet-accessory-drawer flex h-[26%] flex-col overflow-hidden rounded-2xl" data-testid="accessory-bag-drawer" style={{ background: "linear-gradient(180deg,rgba(7,24,16,.97),rgba(3,12,8,.98))", border: "1.5px solid rgba(202,164,76,.5)", boxShadow: "0 -8px 28px rgba(0,0,0,.7), inset 0 0 24px rgba(0,0,0,.45)" }}>
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
        <ClosetDialog deviceSurface={deviceSurface} title="Unequip Accessory?" color={rc}>
          <img src={unequipConfirm.imageUrl || gemCrystalIcon} alt={unequipConfirm.name} className="h-16 w-16 object-contain" />
          <p className="text-center font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(207,226,207,.65)" }}>Remove <span style={{ color: "white" }}>{unequipConfirm.name}</span> from {petName}?</p>
          <div className="flex w-full gap-3">
            <DialogButton testId="button-cancel-unequip" onClick={() => setUnequipConfirm(null)}>CANCEL</DialogButton>
            <DialogButton testId="button-confirm-unequip" danger disabled={unequipMutation.isPending} onClick={() => unequipMutation.mutate(unequipConfirm.accessoryInventoryId)}>{unequipMutation.isPending ? "REMOVING…" : "UNEQUIP"}</DialogButton>
          </div>
        </ClosetDialog>
      )}

      {unlockConfirm && (
        <ClosetDialog deviceSurface={deviceSurface} title="Unlock Accessory Slot?" color="#e8bc52">
          <Lock size={34} style={{ color: "#e8bc52" }} />
          <p className="text-center font-fantasy text-[11px] leading-relaxed" style={{ color: "rgba(207,226,207,.65)" }}>Add another accessory slot for {petName}.</p>
          <p className="inline-flex items-center justify-center gap-1 font-fantasy font-bold" style={{ color: "#fbbf24" }}><img src={currencyAssets.coin} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />3,000</p>
          {(user?.coins ?? 0) < SLOT_COST && <p className="font-fantasy text-[10px]" style={{ color: "#f87171" }}>Not enough coins</p>}
          <div className="flex w-full gap-3">
            <DialogButton testId="button-cancel-unlock" onClick={() => setUnlockConfirm(false)}>CANCEL</DialogButton>
            <DialogButton testId="button-confirm-unlock" disabled={unlockMutation.isPending || (user?.coins ?? 0) < SLOT_COST} onClick={() => unlockMutation.mutate()}>{unlockMutation.isPending ? "UNLOCKING…" : "UNLOCK"}</DialogButton>
          </div>
        </ClosetDialog>
      )}

      {equipMutation.isPending && <div className="absolute inset-0 z-[30] grid place-items-center" style={{ background: "rgba(2,5,3,.62)" }}><p className="animate-pulse font-fantasy text-sm" style={{ color: rc }}>Equipping…</p></div>}
      </div>
    </>
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
      style={{ background: isOver && draggingId && !locked ? "rgba(39,180,117,.7)" : "rgba(2,18,13,.88)", border: isOver && draggingId && !locked ? `2px solid ${rarityColor}` : "1px solid rgba(128,225,173,.65)", boxShadow: isOver && draggingId && !locked ? `0 0 18px ${rarityColor}88` : "inset 0 0 10px rgba(6,40,28,.75),0 2px 4px rgba(0,0,0,.65)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {locked ? (
        <><Lock size={18} style={{ color: "rgba(218,181,92,.82)", filter: "drop-shadow(0 2px 3px #000)" }} /><span data-testid={`accessory-slot-price-${slot}`} className="mt-1 inline-flex items-center justify-center gap-[2px] font-fantasy" style={{ color: "#e6c873", fontSize: 7, textShadow: "0 1px 2px #000" }}><img src={currencyAssets.coin} alt="" aria-hidden="true" className="h-[11px] w-[11px] shrink-0 object-contain" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.8))" }} />{SLOT_COST.toLocaleString()}</span></>
      ) : acc ? (
        <><img src={acc.imageUrl || gemCrystalIcon} alt={acc.name} className="h-[68%] w-[82%] object-contain" style={{ filter: `drop-shadow(0 3px 6px #000) drop-shadow(0 0 6px ${rarityColor}55)` }} /><span className="absolute bottom-[6%] max-w-[88%] truncate rounded px-1 font-fantasy" style={{ color: rarityColor, background: "rgba(0,5,3,.62)", fontSize: 6 }}>{acc.name}</span></>
      ) : (
        <><span className="font-fantasy" style={{ color: "#8cf9be", fontSize: 20, textShadow: "0 0 8px rgba(44,220,151,.38)" }}>✦</span><span className="font-fantasy tracking-wider" style={{ color: "#d8ffe8", fontSize: 9 }}>TAP</span></>
      )}
    </button>
  );
}

function ClosetDialog({ title, color, children, deviceSurface }: { title: string; color: string; children: React.ReactNode; deviceSurface?: boolean }) {
  return <ViewportModalPortal enabled={deviceSurface ?? false}><div className="absolute inset-0 z-[40] grid place-items-center px-8" style={{ background: "rgba(2,5,3,.93)" }}><div className="flex w-full max-w-[320px] flex-col items-center gap-4 rounded-2xl p-6" style={{ background: "linear-gradient(180deg,#07170f,#030b07)", border: `1.5px solid ${color}66`, boxShadow: "0 12px 38px rgba(0,0,0,.72)" }}><p className="font-fantasy text-sm font-bold tracking-wider" style={{ color }}>{title}</p>{children}</div></div></ViewportModalPortal>;
}

function DialogButton({ testId, danger, disabled, onClick, children }: { testId: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className="flex-1 rounded-xl py-3 font-fantasy text-sm tracking-wider disabled:opacity-40" style={{ color: danger ? "#fca5a5" : "#d9bd72", border: `1px solid ${danger ? "#f8717155" : "#d9bd7244"}`, background: "rgba(255,255,255,.035)" }}>{children}</button>;
}
