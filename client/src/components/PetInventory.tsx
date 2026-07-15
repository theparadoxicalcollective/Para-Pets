import { useState, useEffect, useRef } from "react";
import { bjGetStatus } from "@/lib/beginJourney";
import { playSpeedUp, playPowerUp } from "@/lib/sounds";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
const recipeScrollIcon = "/recipe-scroll-icon.png";
import bagIconImg from "@assets/icon_bag.png";
import tabIconAll from "@assets/icon_bag.png";
import tabIconPotion from "@assets/potion_health.png";
import tabIconItem from "@assets/item_crystal_charm.png";
import tabIconAccessory from "@assets/acc_gem_amulet.png";
import tabIconSpecial from "@assets/generated_images/icon_egg_magic.png";
import forestBg from "@assets/generated_images/powerup_forest_bg.png";
import petInvForestBg from "@assets/generated_images/pet_inventory_bg.png";
import statAtkIcon from "@assets/generated_images/icon_stat_atk.png";
import statDefIcon from "@assets/generated_images/icon_stat_def.png";
import statHpIcon from "@assets/generated_images/icon_stat_hp.png";
import petCardFrameImg from "@assets/generated_images/pet_card_frame.png";
import petCardTextureImg from "@assets/generated_images/pet_card_texture.png";
import petInvDividerImg from "@assets/generated_images/pet_inventory_divider.png";
import PetDetailPage from "./PetDetailPage";

function getRarityStyle(rarity: number | null): { border: string; glow: string; bg: string; starColor: string; borderOpacity: number; glowStrength: number } {
  // Unified gold palette — intensity scales with rarity, no rainbow colors
  const r = Math.min(5, Math.max(1, rarity ?? 1));
  const borderOpacity = [0.22, 0.34, 0.50, 0.66, 0.86][r - 1];
  const glowStrength  = [0.09, 0.14, 0.20, 0.28, 0.42][r - 1];
  const glowRadius    = [8, 11, 15, 19, 25][r - 1];
  return {
    border:        `1.5px solid rgba(240,192,64,${borderOpacity})`,
    glow:          `0 0 ${glowRadius}px rgba(240,192,64,${glowStrength})`,
    bg:            "linear-gradient(160deg, rgba(14,10,3,0.97) 0%, rgba(22,14,4,0.97) 100%)",
    starColor:     "#f0c040",
    borderOpacity,
    glowStrength,
  };
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  acquiredAt: string;
  name: string;
  type: string;
  imageUrl: string | null;
  worldId: string;
  rarity: number | null;
  hatchTime: number | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  petTemplateId: string | null;
  petNickname: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
  specialSkill: string | null;
  skillType: string | null;
  skillAffects: string | null;
  healthRestored: number | null;
  hatchStartedAt: string | null;
  isHatched: boolean;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  petLevelPoints: number;
  itemsUsedThisLevel: number;
  fishingType: string | null;
  quantity: number;
}

interface PetInventoryProps {
  user: {
    id: string;
    username: string;
    coins: number;
    activePetId: string | null;
    isAdmin: boolean;
  };
  onClose: () => void;
  onUserUpdate: (user: any) => void;
  defaultTab?: "pets" | "bag";
  pageMode?: boolean;
}

export default function PetInventory({ user, onClose, onUserUpdate, defaultTab, pageMode }: PetInventoryProps) {
  const [showBag, setShowBag] = useState(defaultTab === "bag");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const frozenSelectedPetRef = useRef<any | null>(null);
  const [speedUpTargetId, setSpeedUpTargetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const [sheetDragOver, setSheetDragOver] = useState(false);
  const eggDropRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: Event) => {
      const invId = (e as CustomEvent).detail?.inventoryId;
      if (invId) setSpeedUpTargetId(invId);
    };
    window.addEventListener("bj_open_speedup", handler);
    return () => window.removeEventListener("bj_open_speedup", handler);
  }, []);
  const queryClient = useQueryClient();

  const { data: inventory = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const setActivePetMutation = useMutation({
    mutationFn: async (petId: string | null) => {
      const res = await apiRequest("PATCH", "/api/user/active-pet", { activePetId: petId });
      return res.json();
    },
    onSuccess: (data: any) => {
      // Only propagate the field that actually changed — spreading the full
      // server user into the cache can silently overwrite fields like
      // emailVerified (if stored as NULL in the DB) and cause the email-gate
      // or other AppRouter guards to flash for one render cycle.
      onUserUpdate({ activePetId: data.activePetId ?? null });
      // Suppress toast during tutorial — the overlay guides the player and a
      // "Pet Selected" popup mid-quest is jarring / breaks immersion.
      if (bjGetStatus() !== "active") {
        toast({
          title: data.activePetId ? "Pet Selected" : "Pet Deselected",
          description: data.activePetId ? "Your companion has been chosen!" : "No active pet",
        });
      }
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not update active pet", variant: "destructive" });
    },
  });

  const speedUpMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId }: { petInvId: string; itemInvId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      playSpeedUp();
      const item = inventory.find(i => i.inventoryId === variables.itemInvId);
      setSpeedUpTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "⏩ Hatching Boosted!", description: item ? `-${item.specialAmount ?? "?"}min` : "Hatching time reduced!" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not use item", variant: "destructive" });
    },
  });

  const useItemOnPetMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId }: { petInvId: string; itemInvId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: () => {
      playPowerUp();
      setDragging(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "✓ Item Used!", description: "Item applied to your pet!" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not use item", variant: "destructive" });
      setDragging(null);
    },
  });

  const handleSheetItemPointerDown = (e: React.PointerEvent, item: InventoryItem, petInvId: string) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let dragActive = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > 6 && !dragActive) {
        dragActive = true;
        setDragging({ item, x: ev.clientX, y: ev.clientY });
      }
      if (dragActive) {
        setDragging(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null);
        // Check if hovering over egg drop zone
        const dropRect = eggDropRef.current?.getBoundingClientRect();
        if (dropRect) {
          const over = ev.clientX >= dropRect.left && ev.clientX <= dropRect.right &&
                       ev.clientY >= dropRect.top  && ev.clientY <= dropRect.bottom;
          setSheetDragOver(over);
        }
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setSheetDragOver(false);
      if (dragActive) {
        const dropRect = eggDropRef.current?.getBoundingClientRect();
        const overDrop = dropRect &&
          ev.clientX >= dropRect.left && ev.clientX <= dropRect.right &&
          ev.clientY >= dropRect.top  && ev.clientY <= dropRect.bottom;
        if (overDrop) {
          speedUpMutation.mutate({ petInvId, itemInvId: item.inventoryId });
        }
        setDragging(null);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const handleItemPointerDown = (e: React.PointerEvent, item: InventoryItem) => {
    if (item.type !== "special") return;
    const startX = e.clientX, startY = e.clientY;
    let dragActive = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > 10 && !dragActive) {
        dragActive = true;
        setDragging({ item, x: ev.clientX, y: ev.clientY });
        setShowBag(false);
      }
      if (dragActive) {
        setDragging(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null);
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (dragActive) {
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const petEl = target?.closest("[data-pet-inv-id]") as HTMLElement | null;
        const petInvId = petEl?.dataset.petInvId;
        if (petInvId) {
          useItemOnPetMutation.mutate({ petInvId, itemInvId: item.inventoryId });
        } else {
          setDragging(null);
        }
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const pets = inventory.filter((item) => item.type === "pet");
  const bagItems = inventory.filter((item) => item.type !== "pet" && item.fishingType !== "fish");
  const hatchTimeItems = inventory.filter(i => i.type === "special" && i.specialType === "hatch_time");
  const livePet = selectedPetId ? (inventory.find((item) => item.inventoryId === selectedPetId) ?? null) : null;
  if (livePet) frozenSelectedPetRef.current = livePet;
  const selectedPet = selectedPetId ? (frozenSelectedPetRef.current ?? livePet) : null;
  const speedUpTargetPet = speedUpTargetId ? (inventory.find(i => i.inventoryId === speedUpTargetId) ?? null) : null;

  const handlePetToggle = (inventoryId: string) => {
    if (user.activePetId === inventoryId) {
      setActivePetMutation.mutate(null);
    } else {
      setActivePetMutation.mutate(inventoryId);
    }
  };

  return (
    <>
      <div className={pageMode ? "absolute inset-0 flex flex-col" : "fixed inset-0 z-40 flex flex-col"} style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
        {/* Background */}
        <div className="absolute inset-0" onClick={pageMode ? undefined : onClose}>
          <img
            src={pageMode ? petInvForestBg : forestBg}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: "center top" }}
          />
          <div className="absolute inset-0" style={{ background: pageMode ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.78)" }} />
        </div>

        <div className="relative z-10 flex flex-col h-full overflow-hidden">

          {/* Header */}
          <div className="px-4 pb-0" style={{ paddingTop: pageMode && !showBag ? 8 : 56 }}>
            <div className="flex items-center justify-between mb-3">
              {pageMode ? (
                /* Page mode: slim count row */
                <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                  {showBag
                    ? `${bagItems.length} ${bagItems.length === 1 ? "item" : "items"}`
                    : `${pets.length} ${pets.length === 1 ? "companion" : "companions"}`}
                </p>
              ) : (
                /* Overlay mode: full icon + title */
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                      border: "1.5px solid rgba(127,255,212,0.5)",
                      boxShadow: "0 0 12px rgba(127,255,212,0.15)",
                    }}
                  >
                    <img src={showBag ? bagIconImg : petPawIcon} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
                  </div>
                  <div>
                    <h3
                      className="font-fantasy text-[#f0c040] text-lg tracking-widest font-semibold"
                      style={{ textShadow: "0 0 14px rgba(240,192,64,0.45)" }}
                    >
                      {showBag ? "Adventurer's Bag" : "Pet Companions"}
                    </h3>
                    <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                      {showBag ? `${bagItems.length} ${bagItems.length === 1 ? "item" : "items"}` : `${pets.length} ${pets.length === 1 ? "pet" : "pets"}`}
                    </p>
                  </div>
                </div>
              )}
              {!pageMode && (
                <button
                  data-testid="button-close-inventory"
                  onClick={onClose}
                  className="flex items-center justify-center transition-transform active:scale-90"
                  style={{
                    background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                    border: "2px solid rgba(212,160,23,0.6)",
                    color: "#f0c040",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                    borderRadius: "50%",
                    width: "36px",
                    height: "36px",
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Tabs — hidden in page mode */}
            {!pageMode && (
              <div className="flex gap-2 mb-3">
                <button
                  data-testid="button-tab-pets"
                  onClick={() => setShowBag(false)}
                  className="flex-1 py-2 flex items-center justify-center gap-2 font-fantasy text-sm tracking-wider transition-all"
                  style={{
                    background: !showBag ? "linear-gradient(135deg, rgba(92,62,8,0.5) 0%, rgba(60,40,5,0.35) 100%)" : "rgba(255,255,255,0.04)",
                    border: !showBag ? "1.5px solid rgba(240,192,64,0.55)" : "1.5px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    color: !showBag ? "#f0c040" : "#6a7868",
                    cursor: "pointer",
                    boxShadow: !showBag ? "0 0 12px rgba(240,192,64,0.15)" : "none",
                  }}
                >
                  <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />
                  Pets
                </button>
                <button
                  data-testid="button-tab-bag"
                  onClick={() => setShowBag(true)}
                  className="flex-1 py-2 flex items-center justify-center gap-2 font-fantasy text-sm tracking-wider transition-all"
                  style={{
                    background: showBag ? "linear-gradient(135deg, rgba(92,58,30,0.5) 0%, rgba(60,35,10,0.35) 100%)" : "rgba(255,255,255,0.04)",
                    border: showBag ? "1.5px solid rgba(240,192,64,0.55)" : "1.5px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    color: showBag ? "#f0c040" : "#6a5840",
                    cursor: "pointer",
                    boxShadow: showBag ? "0 0 12px rgba(240,192,64,0.15)" : "none",
                  }}
                >
                  <img src={bagIconImg} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />
                  Bag
                </button>
              </div>
            )}
          </div>

          {/* Decorative gold divider between header and content */}
          <div className="px-6 -mt-1 mb-1 flex justify-center">
            <img
              src={petInvDividerImg}
              alt=""
              aria-hidden="true"
              style={{ width: "100%", maxWidth: 340, height: 22, objectFit: "contain", opacity: 0.55 }}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading inventory...</p>
              </div>
            ) : showBag ? (
              <BagView items={bagItems} onItemPointerDown={pageMode ? undefined : handleItemPointerDown} />
            ) : (
              <PetView
                pets={pets}
                activePetId={user.activePetId}
                onToggle={handlePetToggle}
                onEggSpeedUp={(id) => setSpeedUpTargetId(id)}
                isDragging={!!dragging}
                onPetClick={(pet) => pet.isHatched && setSelectedPetId(pet.inventoryId)}
                isPending={setActivePetMutation.isPending}
              />
            )}
          </div>

          {/* Bottom back button — page mode only */}
          {pageMode && (
            <div className="flex-shrink-0 px-5 pb-6 pt-3">
              <button
                data-testid="button-close-inventory"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 transition-transform active:scale-95 font-fantasy tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                  border: "2px solid rgba(212,160,23,0.6)",
                  color: "#f0c040",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "bold",
                  borderRadius: "12px",
                  padding: "12px 0",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                }}
              >
                ← BACK
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Egg detail sheet — egg at top as drop zone, items below to tap or drag */}
      {speedUpTargetId && speedUpTargetPet && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => { setSpeedUpTargetId(null); setDragging(null); setSheetDragOver(false); }} />
          <div
            className="relative w-full rounded-t-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(12,6,2,0.98) 0%, rgba(8,4,1,0.99) 100%)",
              border: "1px solid rgba(240,192,64,0.3)",
              borderBottom: "none",
              boxShadow: "0 -10px 50px rgba(0,0,0,0.7)",
              maxHeight: "calc(82*var(--vh))",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h4 className="font-fantasy text-[#f0c040] text-sm tracking-wider">SPEED UP HATCHING</h4>
              <button
                onClick={() => { setSpeedUpTargetId(null); setDragging(null); setSheetDragOver(false); }}
                className="font-fantasy text-[#a89878] text-xs tracking-wider"
                style={{ cursor: "pointer", background: "none", border: "none" }}
                data-testid="button-close-inv-speedup"
              >
                Close
              </button>
            </div>

            {/* Egg drop zone */}
            <div className="px-5 pb-4">
              <div
                ref={eggDropRef}
                data-pet-inv-id={speedUpTargetId}
                className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 py-5 transition-all"
                style={{
                  background: sheetDragOver
                    ? "rgba(240,192,64,0.18)"
                    : "rgba(0,0,0,0.25)",
                  border: sheetDragOver
                    ? "2px dashed rgba(240,192,64,0.85)"
                    : "2px dashed rgba(240,192,64,0.25)",
                  boxShadow: sheetDragOver ? "0 0 24px rgba(240,192,64,0.3)" : "none",
                  transition: "all 0.15s",
                  minHeight: 140,
                }}
              >
                {speedUpTargetPet.eggImageUrl ? (
                  <img
                    src={speedUpTargetPet.eggImageUrl}
                    alt={speedUpTargetPet.name}
                    style={{ width: 80, height: 80, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(240,192,64,0.5))" }}
                  />
                ) : (
                  <img src={eggMagicIcon} alt="Egg" style={{ width: 64, height: 64, objectFit: "contain", opacity: 0.7 }} />
                )}
                <div className="text-center">
                  <p className="font-fantasy text-[#f0c040] text-sm tracking-wider">{speedUpTargetPet.name}</p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider mt-0.5">
                    {sheetDragOver ? "Release to use!" : "Drag item here · or tap item below"}
                  </p>
                </div>
                {speedUpTargetPet.hatchStartedAt && speedUpTargetPet.hatchTime && (
                  <HatchProgressBar hatchStartedAt={speedUpTargetPet.hatchStartedAt} hatchTime={speedUpTargetPet.hatchTime} />
                )}
              </div>
            </div>

            {/* Items section */}
            <div className="px-5 pb-6">
              <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider mb-3 uppercase">Your Speed-Up Items</p>
              {hatchTimeItems.length === 0 ? (
                <p className="font-fantasy text-[#a89878] text-xs text-center py-6">
                  No speed-up items in your bag. Check the shop!
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {hatchTimeItems.map((item) => (
                    <div
                      key={item.inventoryId}
                      data-testid={`button-inv-speedup-${item.inventoryId}`}
                      className="rounded-md p-2 flex flex-col items-center gap-1 transition-transform active:scale-95"
                      style={{
                        background: "rgba(30,15,5,0.8)",
                        border: "1px solid rgba(240,192,64,0.3)",
                        cursor: speedUpMutation.isPending ? "wait" : "grab",
                        touchAction: "none",
                        userSelect: "none",
                        opacity: speedUpMutation.isPending ? 0.4 : 1,
                      }}
                      onClick={() => !speedUpMutation.isPending && speedUpMutation.mutate({ petInvId: speedUpTargetId, itemInvId: item.inventoryId })}
                      onPointerDown={(e) => handleSheetItemPointerDown(e, item, speedUpTargetId)}
                    >
                      <div className="w-12 h-12 rounded flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-xl">⏩</span>
                        )}
                      </div>
                      <span className="font-fantasy text-[#f0c040] text-[9px] tracking-wider text-center truncate w-full">{item.name}</span>
                      <span
                        className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(240,192,64,0.15)", color: "#f0c040" }}
                      >
                        -{item.specialAmount || "?"}min
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drag ghost image */}
      {dragging && (
        <div
          className="fixed z-[90] pointer-events-none select-none"
          style={{
            left: dragging.x - 32,
            top: dragging.y - 32,
            width: 64,
            height: 64,
            borderRadius: 12,
            background: "rgba(20,10,2,0.92)",
            border: "2px solid rgba(240,192,64,0.8)",
            boxShadow: "0 0 20px rgba(240,192,64,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "scale(1.1)",
          }}
        >
          {dragging.item.imageUrl ? (
            <img src={dragging.item.imageUrl} alt={dragging.item.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 28 }}>⏩</span>
          )}
        </div>
      )}

      {selectedPet && (
        <PetDetailPage
          pet={selectedPet}
          onClose={() => { frozenSelectedPetRef.current = null; setSelectedPetId(null); }}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
          }}
          userCoins={user.coins}
          onUserUpdate={onUserUpdate}
        />
      )}
    </>
  );
}

function HatchProgressBar({ hatchStartedAt, hatchTime }: { hatchStartedAt: string; hatchTime: number }) {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const start = new Date(hatchStartedAt).getTime();
      const required = hatchTime * 3600000;
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / required);
      setProgress(pct);

      if (pct >= 1) {
        setTimeLeft("Ready!");
      } else {
        const remaining = required - elapsed;
        const hrs = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        if (hrs > 0) {
          setTimeLeft(`${hrs}h ${mins}m`);
        } else if (mins > 0) {
          setTimeLeft(`${mins}m ${secs}s`);
        } else {
          setTimeLeft(`${secs}s`);
        }
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [hatchStartedAt, hatchTime]);

  const isReady = progress >= 1;

  return (
    <div className="w-full">
      <div className="w-full h-2 rounded-full" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div
          className={isReady ? "animate-pulse" : ""}
          style={{
            width: `${progress * 100}%`,
            background: isReady
              ? "linear-gradient(90deg, #4ade80, #22c55e)"
              : "linear-gradient(90deg, #f0c040, #d4a017)",
            height: "100%",
            borderRadius: "4px",
            transition: "width 1s linear",
            boxShadow: isReady ? "0 0 8px rgba(74,222,128,0.6)" : "0 0 4px rgba(240,192,64,0.4)",
          }}
        />
      </div>
      <p
        className="font-fantasy text-[11px] tracking-wider text-center mt-1 font-bold"
        style={{ color: isReady ? "#4ade80" : "#d4a017", textShadow: isReady ? "0 0 8px rgba(74,222,128,0.6)" : "none" }}
        data-testid="text-hatch-time"
      >
        {isReady ? "Tap to hatch!" : timeLeft}
      </p>
    </div>
  );
}

function PetView({
  pets,
  activePetId,
  onToggle,
  onPetClick,
  onEggSpeedUp,
  isPending,
  isDragging,
}: {
  pets: InventoryItem[];
  activePetId: string | null;
  onToggle: (id: string) => void;
  onPetClick: (pet: InventoryItem) => void;
  onEggSpeedUp?: (petInvId: string) => void;
  isPending: boolean;
  isDragging?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hatchingId, setHatchingId] = useState<string | null>(null);
  const [flippedPets, setFlippedPets] = useState<Set<string>>(new Set());

  const hatchCheckMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${inventoryId}/hatch-check`);
      return res.json();
    },
    onSuccess: (data: any, inventoryId: string) => {
      if (data.isHatched) {
        setHatchingId(inventoryId);
        setTimeout(() => {
          setHatchingId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
          toast({ title: "🎉 Hatched!", description: "Your pet has emerged from its egg!" });
        }, 2200);
      }
    },
  });

  if (pets.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
          style={{
            background: "radial-gradient(ellipse at center, rgba(45,122,79,0.2) 0%, rgba(10,40,20,0.4) 100%)",
            border: "2px dashed rgba(127,191,176,0.3)",
          }}
        >
          <img src={eggMagicIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain", filter: "grayscale(100%) opacity(0.4)" }} />
        </div>
        <p className="font-fantasy text-[#7fbfb0] text-sm tracking-wider mb-2">No companions yet</p>
        <p className="font-fantasy text-[#5a8a78] text-xs tracking-wider">Venture into the realm to discover creatures!</p>
      </div>
    );
  }

  const sortedPets = [...pets].sort((a, b) => {
    // Unhatched eggs always surface to the top
    const aEgg = a.isHatched ? 1 : 0;
    const bEgg = b.isHatched ? 1 : 0;
    if (aEgg !== bEgg) return aEgg - bEgg;
    // Within each group: higher rarity first, then higher level
    const rarityDiff = (b.rarity ?? 0) - (a.rarity ?? 0);
    if (rarityDiff !== 0) return rarityDiff;
    return (b.petLevel ?? 0) - (a.petLevel ?? 0);
  });

  return (
    <div className="grid grid-cols-2 gap-3">
      {sortedPets.map((pet) => {
        const isActive = activePetId === pet.inventoryId;
        const isEgg = !pet.isHatched;
        const displayImage = isEgg ? pet.eggImageUrl : (pet.hatchedImageUrl || pet.imageUrl);

        // Mirror the server hatch-check logic: an egg is ready if hatchStartedAt
        // is set and elapsed time >= required time (0 when hatchTime is absent).
        const hatchReady = isEgg && !!pet.hatchStartedAt
          ? (Date.now() - new Date(pet.hatchStartedAt).getTime()) >= (pet.hatchTime ? pet.hatchTime * 3600000 : 0)
          : false;

        const handleImageClick = () => {
          if (isDragging) return;
          if (isEgg && hatchReady) {
            hatchCheckMutation.mutate(pet.inventoryId);
          } else if (isEgg && !hatchReady) {
            onEggSpeedUp?.(pet.inventoryId);
          } else {
            // Coin flip: show egg for 2.5 seconds then flip back
            if (flippedPets.has(pet.inventoryId)) return;
            setFlippedPets(prev => new Set([...prev, pet.inventoryId]));
            setTimeout(() => {
              setFlippedPets(prev => { const n = new Set(prev); n.delete(pet.inventoryId); return n; });
            }, 2800);
          }
        };

        const handleInfoBoxClick = () => {
          if (isDragging) return;
          if (isEgg && hatchReady) {
            hatchCheckMutation.mutate(pet.inventoryId);
          } else if (isEgg && !hatchReady) {
            onEggSpeedUp?.(pet.inventoryId);
          } else {
            onPetClick(pet);
          }
        };

        const rs = getRarityStyle(pet.rarity ?? null);

        const rarityLabel = pet.rarity === 5 ? "Legendary" : pet.rarity === 4 ? "Epic" : pet.rarity === 3 ? "Rare" : pet.rarity === 2 ? "Uncommon" : "Common";

        const isFlipped = flippedPets.has(pet.inventoryId);
        const eggDisplayImage = pet.eggImageUrl;

        return (
          <div
            key={pet.inventoryId}
            data-testid={`card-pet-${pet.shopItemId}`}
            data-pet-inv-id={pet.inventoryId}
            className="relative flex flex-col"
            style={{ borderRadius: 18 }}
          >
            {/* Pet image — floating free above the stat card, no container */}
            <div
              className="flex justify-center"
              style={{ position: "relative", zIndex: 2, marginBottom: -60 }}
              onClick={handleImageClick}
            >
              <div style={{ position: "relative", width: 140, height: 140, cursor: "pointer", perspective: "400px" }}>

                {/* 3D coin flipper */}
                <div
                  style={{
                    width: 140, height: 140,
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transition: "transform 0.45s cubic-bezier(0.455,0.03,0.515,0.955)",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front face — bare image, no container */}
                  <div
                    style={{
                      position: "absolute", inset: 0,
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {/* Circular radial glow behind the pet — never looks square */}
                    <div style={{
                      position: "absolute", inset: 0,
                      borderRadius: "50%",
                      background: isActive
                        ? "radial-gradient(circle at 50% 55%, rgba(240,192,64,0.55) 0%, rgba(240,192,64,0.18) 35%, transparent 65%)"
                        : `radial-gradient(circle at 50% 55%, rgba(240,192,64,${Math.min(0.5, rs.glowStrength + 0.05)}) 0%, rgba(240,192,64,${Math.min(0.18, rs.glowStrength * 0.55)}) 35%, transparent 65%)`,
                      pointerEvents: "none",
                    }} />
                    {displayImage ? (
                      <img src={displayImage} alt={pet.name} style={{ width: 140, height: 140, objectFit: "contain", position: "relative" }} />
                    ) : (
                      <img src={isEgg ? eggMagicIcon : petPawIcon} alt="" style={{ width: 100, height: 100, objectFit: "contain", position: "relative" }} />
                    )}
                  </div>

                  {/* Back face — egg image, bare */}
                  <div
                    style={{
                      position: "absolute", inset: 0,
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <div style={{
                      position: "absolute", inset: 0,
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 50% 55%, rgba(240,192,64,0.4) 0%, rgba(240,192,64,0.12) 35%, transparent 65%)",
                      pointerEvents: "none",
                    }} />
                    {eggDisplayImage ? (
                      <img src={eggDisplayImage} alt="egg" style={{ width: 140, height: 140, objectFit: "contain", position: "relative" }} />
                    ) : (
                      <img src={eggMagicIcon} alt="egg" style={{ width: 100, height: 100, objectFit: "contain", position: "relative" }} />
                    )}
                  </div>
                </div>

                {/* Hatch ready glow ring */}
                {!isDragging && hatchReady && hatchingId !== pet.inventoryId && (
                  <div className="absolute inset-0 flex items-center justify-center animate-pulse pointer-events-none">
                    <span className="font-fantasy text-[#f0c040] text-[10px] font-bold tracking-widest" style={{ textShadow: "0 0 10px rgba(240,192,64,0.9)", position: "absolute", bottom: 0 }}>READY!</span>
                  </div>
                )}

                {/* Drag-drop indicator */}
                {isDragging && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ border: "2px dashed rgba(240,192,64,0.7)", borderRadius: 12 }}>
                    <span className="font-fantasy text-[#f0c040] text-[10px] font-bold" style={{ textShadow: "0 0 8px rgba(240,192,64,0.9)" }}>DROP</span>
                  </div>
                )}

                {/* Hatch burst particles */}
                {hatchingId === pet.inventoryId && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20" style={{ overflow: "visible" }}>
                    {[...Array(10)].map((_, i) => {
                      const angle = (i / 10) * 360;
                      const rad = (angle * Math.PI) / 180;
                      const endX = Math.cos(rad) * 70;
                      const endY = Math.sin(rad) * 70;
                      const size = 6 + Math.random() * 6;
                      const delay = i * 0.04;
                      return (
                        <div key={i} style={{ position: "absolute", width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: "radial-gradient(circle, #ffe566 0%, #f0c040 40%, rgba(240,192,64,0) 70%)", boxShadow: "0 0 10px rgba(240,192,64,0.8)", animation: `hatchOrbBurst 1.4s ${delay}s ease-out forwards`, opacity: 0, ["--endX" as any]: `${endX}px`, ["--endY" as any]: `${endY}px` }} />
                      );
                    })}
                    <span className="font-fantasy text-sm font-bold tracking-widest absolute" style={{ color: "#f0c040", textShadow: "0 0 12px rgba(240,192,64,0.8)", animation: "hatchTextRise 2s 0.3s ease-out forwards", opacity: 0 }}>HATCHED!</span>
                  </div>
                )}

                {/* EGG label */}
                {isEgg && !hatchReady && (
                  <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)", background: "rgba(8,4,1,0.92)", border: "1px solid rgba(240,192,64,0.42)", borderRadius: 20, padding: "1px 8px", whiteSpace: "nowrap" }}>
                    <span className="font-fantasy text-[7px] text-[#f0c040] tracking-wider">EGG</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stat card below the floating image */}
            <div
              className="relative flex flex-col items-center rounded-2xl overflow-hidden"
              onClick={handleInfoBoxClick}
              style={{ cursor: "pointer", background: rs.bg, border: isDragging ? "1.5px solid rgba(240,192,64,0.85)" : isActive ? "1.5px solid rgba(240,192,64,0.82)" : rs.border, boxShadow: isDragging ? "0 0 22px rgba(240,192,64,0.4)" : isActive ? "0 0 26px rgba(240,192,64,0.32), 0 4px 20px rgba(0,0,0,0.6)" : `${rs.glow}, 0 4px 16px rgba(0,0,0,0.5)`, transition: "box-shadow 0.2s", paddingTop: 68, paddingBottom: 10, paddingLeft: 8, paddingRight: 8 }}
            >
              {/* Texture overlay */}
              <img
                src={petCardTextureImg}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ opacity: 0.10, mixBlendMode: "soft-light" }}
              />

              {/* Active shimmer */}
              {isActive && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.55), transparent)" }} />
              )}

              {/* Name — largest */}
              <p
                className="font-fantasy font-semibold leading-tight truncate text-center w-full"
                style={{ fontSize: 14, color: "#f0c040", textShadow: "0 0 8px rgba(240,192,64,0.38)", letterSpacing: "0.04em" }}
                data-testid={`text-pet-name-${pet.shopItemId}`}
              >
                {pet.petNickname || pet.name}
              </p>

              {/* Species — shown smaller when pet has a nickname */}
              {pet.petNickname && (
                <p className="font-fantasy leading-tight truncate text-center w-full" style={{ fontSize: 10, color: "#a89878", letterSpacing: "0.03em", marginTop: 1 }}>
                  {pet.name}
                </p>
              )}

              {/* Stars */}
              <div className="flex items-center gap-0.5 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      color: i < (pet.rarity ?? 1) ? "#f0c040" : "rgba(240,192,64,0.14)",
                      textShadow: i < (pet.rarity ?? 1) ? "0 0 4px rgba(240,192,64,0.6)" : "none",
                    }}
                  >★</span>
                ))}
              </div>

              {/* Stats or hatch progress */}
              {isEgg && pet.hatchStartedAt && pet.hatchTime ? (
                <HatchProgressBar hatchStartedAt={pet.hatchStartedAt} hatchTime={pet.hatchTime} />
              ) : isEgg ? (
                <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mt-1">Tap to hatch</p>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="font-fantasy text-[#c8a84b]" style={{ fontSize: 10, letterSpacing: "0.06em" }}>LV {pet.petLevel}</span>
                    {isActive && <span style={{ fontSize: 8, color: "rgba(240,192,64,0.55)" }}>✦ ACTIVE</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-center mt-0.5">
                    <div className="flex items-center gap-0.5">
                      <img src={statHpIcon} alt="HP" style={{ width: 12, height: 12, objectFit: "contain" }} />
                      <span className="font-fantasy text-[#9ecfa0]" style={{ fontSize: 10, fontWeight: 700 }}>{pet.petHealth}</span>
                    </div>
                    <span style={{ color: "rgba(240,192,64,0.18)", fontSize: 10 }}>·</span>
                    <div className="flex items-center gap-0.5">
                      <img src={statAtkIcon} alt="ATK" style={{ width: 12, height: 12, objectFit: "contain" }} />
                      <span className="font-fantasy text-[#d4956a]" style={{ fontSize: 10, fontWeight: 700 }}>{pet.petAtk}</span>
                    </div>
                    <span style={{ color: "rgba(240,192,64,0.18)", fontSize: 10 }}>·</span>
                    <div className="flex items-center gap-0.5">
                      <img src={statDefIcon} alt="DEF" style={{ width: 12, height: 12, objectFit: "contain" }} />
                      <span className="font-fantasy text-[#8ab4c8]" style={{ fontSize: 10, fontWeight: 700 }}>{pet.petDef}</span>
                    </div>
                  </div>
                  {pet.specialSkill && (
                    <div className="mt-1 px-1 text-center" data-testid={`text-pet-skill-${pet.inventoryId}`}>
                      <span className="font-fantasy" style={{ fontSize: 8, color: "#c8a84b" }}>{pet.specialSkill}</span>
                      {pet.skillType && (
                        <span className="font-fantasy" style={{ fontSize: 8, color: "rgba(200,168,75,0.55)" }}>
                          {" — "}
                          {({ heal: "Heal", poison: "Poison", damage: "Damage", stun: "Stun", revive: "Revive" } as Record<string, string>)[pet.skillType] ?? pet.skillType}
                          {" "}
                          {({ self: "Pet", party: "Party", enemy: "Enemy", enemy_party: "Enemy Party" } as Record<string, string>)[pet.skillAffects ?? ""] ?? ""}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* SELECT / ACTIVE button */}
              <button
                data-testid={`button-select-pet-${pet.shopItemId}`}
                onClick={(e) => { e.stopPropagation(); onToggle(pet.inventoryId); }}
                disabled={isPending}
                className="w-full mt-2 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(240,192,64,0.22) 0%, rgba(240,192,64,0.10) 100%)"
                    : "rgba(240,192,64,0.05)",
                  border: isActive
                    ? "1px solid rgba(240,192,64,0.65)"
                    : "1px solid rgba(240,192,64,0.18)",
                  borderRadius: 8,
                  padding: "5px 0",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 5, height: 5,
                    borderRadius: "50%",
                    background: isActive ? "#f0c040" : "rgba(240,192,64,0.22)",
                    boxShadow: isActive ? "0 0 5px rgba(240,192,64,0.8)" : "none",
                    transition: "all 0.2s",
                    flexShrink: 0,
                  }}
                />
                <span
                  className="font-fantasy"
                  style={{ fontSize: 9, color: isActive ? "#f0c040" : "rgba(240,192,64,0.38)", letterSpacing: "0.08em" }}
                >
                  {isActive ? "ACTIVE" : "SELECT"}
                </span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getItemDescription(item: InventoryItem): string {
  const parts: string[] = [];
  if (item.statBoostType && item.statBoostAmount) {
    const label = item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType;
    parts.push(`Boosts ${label} by +${item.statBoostAmount} when used on a pet.`);
  }
  if (item.healthRestored) {
    parts.push(`Restores ${item.healthRestored} HP to your pet.`);
  }
  if (item.specialType === "hatch_time" && item.specialAmount) {
    parts.push(`Speeds up egg hatching by ${item.specialAmount} minute${item.specialAmount > 1 ? "s" : ""}.`);
  }
  if (item.specialType === "level" && item.specialAmount) {
    parts.push(`Grants ${item.specialAmount} level point${item.specialAmount > 1 ? "s" : ""} to your pet.`);
  }
  if (parts.length === 0) {
    if (item.type === "potion") parts.push("A mystical potion for your pet.");
    else if (item.type === "accessory") parts.push("An accessory for your pet.");
    else if (item.type === "recipe") parts.push("A recipe scroll. Drag it onto the cauldron in The Bayou to unlock its recipe!");
    else if (item.type === "ingredient") parts.push("A brewing ingredient. Take it to The Bayou cauldron to brew!");
    else parts.push("A collectible item from Veridia.");
  }
  return parts.join(" ");
}

function getItemUsageHint(item: InventoryItem): { where: string; how: string } {
  if (item.type === "potion") {
    return {
      where: "Pet Companions tab",
      how: "Tap any of your pets, open their detail card, and use this potion to restore their HP!",
    };
  }
  if (item.type === "accessory") {
    return {
      where: "Pet Companions tab",
      how: "Tap a pet and equip this accessory to give them a stat boost in battles!",
    };
  }
  if (item.type === "special" && item.specialType === "hatch_time") {
    return {
      where: "Pet Companions tab",
      how: "Tap an egg that's still hatching — you'll see a button to apply this and speed it up!",
    };
  }
  if (item.type === "special" && item.specialType === "level") {
    return {
      where: "Pet Companions tab",
      how: "Tap any hatched pet and apply this to grant them instant level points!",
    };
  }
  if (item.type === "special" && item.specialType === "pvp_ticket") {
    return {
      where: "Special Items tab",
      how: "Your entry pass to the Veridia Arena! Spend one to enter PvP and battle other keepers for Battle Points and a leaderboard rank.",
    };
  }
  if (item.type === "special") {
    return {
      where: "Pet Companions tab",
      how: "Tap a pet and look for the apply button to use this special item on them!",
    };
  }
  return {
    where: "Your collection",
    how: "This is a rare collectible from Veridia. Hold onto it — it may have special uses in future updates!",
  };
}

const POTION_STACK_MAX = 50;

type BagTabKey = "all" | "potion" | "item" | "accessory" | "special" | "recipe";

const BAG_TABS: { key: BagTabKey; label: string; icon: string }[] = [
  { key: "all",       label: "All",     icon: tabIconAll       },
  { key: "potion",    label: "Potions", icon: tabIconPotion    },
  { key: "item",      label: "Items",   icon: tabIconItem      },
  { key: "accessory", label: "Gear",    icon: tabIconAccessory },
  { key: "special",   label: "Special", icon: tabIconSpecial   },
  { key: "recipe",    label: "Recipes", icon: recipeScrollIcon },
];

function BagView({ items, onItemPointerDown }: { items: InventoryItem[]; onItemPointerDown?: (e: React.PointerEvent, item: InventoryItem) => void }) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedStackCount, setSelectedStackCount] = useState<number>(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bagTab, setBagTab] = useState<BagTabKey>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("DELETE", `/api/inventory/${inventoryId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSelectedItem(null);
      setConfirmDelete(false);
      toast({ title: "Deleted", description: "Item removed from inventory" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    },
  });

  const typeColors: Record<string, string> = {
    item: "#f0c040",
    accessory: "#c084fc",
    potion: "#60d394",
    special: "#fb923c",
    recipe: "#fde68a",
    ingredient: "#94a3b8",
  };

  const { data: allRecipes = [] } = useQuery<Array<{
    id: string; result_type: string;
    recipe_item_id?: string | null;
    ing1_id: string; ing1_name: string; ing1_image: string | null;
    ing2_id: string; ing2_name: string; ing2_image: string | null;
    result_id: string; result_name: string; result_image: string | null; result_item_type: string;
  }>>({
    queryKey: ["/api/recipes"],
    staleTime: 60 * 1000,
  });

  // Build stacked display items — all non-pet items stack by shopItemId
  const stackMap = new Map<string, { item: InventoryItem; count: number }>();
  const petItems: { item: InventoryItem; count: number }[] = [];
  for (const item of items) {
    if (item.type === "pet") {
      petItems.push({ item, count: 1 });
    } else {
      const itemQty = item.quantity ?? 1;
      const existing = stackMap.get(item.shopItemId);
      if (existing) {
        existing.count += itemQty;
      } else {
        stackMap.set(item.shopItemId, { item, count: itemQty });
      }
    }
  }
  const allDisplayItems: { item: InventoryItem; count: number }[] = [
    ...petItems,
    ...Array.from(stackMap.values()),
  ];

  // Which tabs actually have items (hide empty tabs)
  const tabsWithItems = new Set(allDisplayItems.map(({ item }) => item.type));

  // Filter by selected tab; sort alphabetically for "all"
  const displayItems = allDisplayItems
    .filter(({ item }) => bagTab === "all" || item.type === bagTab)
    .sort((a, b) => bagTab === "all" ? a.item.name.localeCompare(b.item.name) : 0);

  const isEmpty = items.length === 0;

  return (
    <>
      {/* ── Type tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {BAG_TABS.filter(t => t.key === "all" || tabsWithItems.has(t.key)).map(tab => {
          const active = bagTab === tab.key;
          return (
            <button
              key={tab.key}
              data-testid={`button-bag-tab-${tab.key}`}
              onClick={() => setBagTab(tab.key)}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full font-fantasy text-[11px] tracking-wider transition-all active:scale-95"
              style={{
                background: active ? "rgba(240,192,64,0.18)" : "rgba(255,255,255,0.07)",
                border: active ? "1px solid rgba(240,192,64,0.45)" : "1px solid rgba(255,255,255,0.15)",
                color: active ? "#f0c040" : "rgba(210,185,145,0.75)",
              }}
            >
              <img
                src={tab.icon}
                alt=""
                style={{ width: 16, height: 16, objectFit: "contain", opacity: active ? 1 : 0.65, filter: active ? "drop-shadow(0 0 4px rgba(240,192,64,0.5))" : "none" }}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      {isEmpty ? (
        <div className="text-center py-16">
          <div
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
            style={{
              background: "radial-gradient(ellipse at center, rgba(92,58,30,0.3) 0%, rgba(30,15,5,0.4) 100%)",
              border: "2px dashed rgba(139,94,60,0.3)",
            }}
          >
            <img src={powerupBagIcon} alt="" style={{ width: 48, height: 48, objectFit: "contain", filter: "grayscale(100%) opacity(0.4)" }} />
          </div>
          <p className="font-fantasy text-[#a89878] text-sm tracking-wider mb-2">Bag is empty</p>
          <p className="font-fantasy text-[#6a5840] text-xs tracking-wider">Purchase items from world shops!</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-fantasy text-[#6a5840] text-xs tracking-wider">No {bagTab}s in your bag</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {displayItems.map(({ item, count }) => {
            const typeColor = typeColors[item.type] || "#f0c040";
            return (
              <div
                key={item.inventoryId}
                data-testid={`card-bag-item-${item.shopItemId}`}
                className="rounded-xl overflow-hidden relative"
                style={{
                  background: "linear-gradient(135deg, rgba(28,14,4,0.97) 0%, rgba(48,28,8,0.97) 100%)",
                  border: `1px solid ${typeColor}55`,
                  boxShadow: `0 0 10px ${typeColor}18`,
                  cursor: "pointer",
                  touchAction: (item.type === "special" && onItemPointerDown) ? "none" : "auto",
                }}
                onClick={() => { setSelectedItem(item); setSelectedStackCount(count); setConfirmDelete(false); }}
                onPointerDown={item.type === "special" ? (e) => onItemPointerDown?.(e, item) : undefined}
              >
                <div className="p-3 flex flex-col items-center gap-2">
                  <div className="relative w-full">
                    <div
                      className="w-full aspect-square rounded-lg flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain rounded-lg" />
                      ) : (
                        <img src={powerupBagIcon} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
                      )}
                    </div>
                    {count > 1 && (
                      <span
                        className="absolute bottom-1.5 right-1.5 font-fantasy text-xs font-bold px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(10,6,0,0.9)", color: "#60d394", border: "1px solid rgba(96,211,148,0.5)" }}
                        data-testid={`text-stack-count-${item.shopItemId}`}
                      >
                        ×{count}
                      </span>
                    )}
                  </div>
                  <p className="font-fantasy text-[#f0c040] text-sm font-semibold text-center truncate w-full" data-testid={`text-bag-item-name-${item.shopItemId}`}>
                    {item.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => { setSelectedItem(null); setConfirmDelete(false); }}
        >
          <div
            className="relative w-[85%] max-w-sm rounded-xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.98) 0%, rgba(50,30,10,0.98) 100%)",
              border: "1px solid rgba(212,160,23,0.4)",
              boxShadow: "0 0 40px rgba(0,0,0,0.6), 0 0 15px rgba(240,192,64,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="modal-item-detail"
          >
            <button
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center z-10"
              style={{
                background: "rgba(180,50,50,0.2)",
                border: "1px solid rgba(180,50,50,0.4)",
                cursor: "pointer",
                color: "#e05050",
              }}
              onClick={() => { setSelectedItem(null); setConfirmDelete(false); }}
              data-testid="button-close-item-detail"
            >
              <span className="text-sm font-bold">✕</span>
            </button>

            <div className="p-5 flex flex-col items-center gap-4">
              <div
                className="w-28 h-28 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)" }}
              >
                {selectedItem.imageUrl ? (
                  <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-contain rounded-lg" />
                ) : (
                  <img src={powerupBagIcon} alt="" style={{ width: 52, height: 52, objectFit: "contain" }} />
                )}
              </div>

              <div className="text-center">
                <h3 className="font-fantasy text-[#f0c040] text-lg tracking-wider mb-1" data-testid="text-item-detail-name">
                  {selectedItem.name}
                </h3>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span
                    className="font-fantasy text-[10px] tracking-wider px-3 py-1 rounded-full capitalize inline-block"
                    style={{
                      background: `${typeColors[selectedItem.type] || "#f0c040"}20`,
                      color: typeColors[selectedItem.type] || "#f0c040",
                      border: `1px solid ${typeColors[selectedItem.type] || "#f0c040"}40`,
                    }}
                  >
                    {selectedItem.type}
                  </span>
                  {selectedStackCount > 1 && (
                    <span
                      className="font-fantasy text-[10px] tracking-wider px-3 py-1 rounded-full inline-block"
                      style={{ background: "rgba(96,211,148,0.15)", color: "#60d394", border: "1px solid rgba(96,211,148,0.35)" }}
                      data-testid="text-detail-stack-count"
                    >
                      ×{selectedStackCount}{selectedItem?.type === "potion" ? ` / ${POTION_STACK_MAX}` : ""}
                    </span>
                  )}
                </div>
              </div>

              <div
                className="w-full rounded-lg p-3"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(212,160,23,0.1)" }}
              >
                <p className="font-fantasy text-[#c8b090] text-xs tracking-wider leading-relaxed text-center" data-testid="text-item-detail-description">
                  {getItemDescription(selectedItem)}
                </p>
              </div>

              {/* Recipe scroll detail — show matching recipe if found */}
              {selectedItem.type === "recipe" && (() => {
                const matchedRecipe = allRecipes.find((r) => r.recipe_item_id === selectedItem.shopItemId);
                if (!matchedRecipe) return (
                  <div className="w-full rounded-lg p-3 flex flex-col items-center gap-2" style={{ background: "rgba(253,230,138,0.06)", border: "1px dashed rgba(253,230,138,0.3)" }}>
                    <img src={recipeScrollIcon} alt="" className="w-10 h-10 object-contain opacity-40" />
                    <p className="font-fantasy text-[10px] text-center" style={{ color: "#fde68a88" }}>Head to The Bayou and drop this on the cauldron to reveal the recipe.</p>
                  </div>
                );
                return (
                  <div className="w-full rounded-lg p-3" style={{ background: "rgba(253,230,138,0.06)", border: "1px solid rgba(253,230,138,0.3)" }}>
                    <p className="font-fantasy text-[10px] tracking-wider text-center mb-3" style={{ color: "#fde68a" }}>Recipe Preview</p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.35)" }}>
                          {matchedRecipe.ing1_image ? <img src={matchedRecipe.ing1_image} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full" />}
                        </div>
                        <p className="font-fantasy text-[9px] text-center" style={{ color: "#c8b090", maxWidth: 52 }}>{matchedRecipe.ing1_name}</p>
                      </div>
                      <span className="font-fantasy text-sm" style={{ color: "#fde68a66" }}>+</span>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.35)" }}>
                          {matchedRecipe.ing2_image ? <img src={matchedRecipe.ing2_image} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full" />}
                        </div>
                        <p className="font-fantasy text-[9px] text-center" style={{ color: "#c8b090", maxWidth: 52 }}>{matchedRecipe.ing2_name}</p>
                      </div>
                      <span className="font-fantasy text-sm" style={{ color: "#fde68a66" }}>→</span>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.35)" }}>
                          {matchedRecipe.result_image ? <img src={matchedRecipe.result_image} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full" />}
                        </div>
                        <p className="font-fantasy text-[9px] text-center" style={{ color: "#c8b090", maxWidth: 52 }}>{matchedRecipe.result_name}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}


              <div className="w-full pt-2 border-t" style={{ borderColor: "rgba(212,160,23,0.15)" }}>
                {!confirmDelete ? (
                  <button
                    className="w-full py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95"
                    style={{
                      background: "rgba(180,50,50,0.15)",
                      border: "1px solid rgba(180,50,50,0.3)",
                      color: "#e07070",
                      cursor: "pointer",
                    }}
                    onClick={() => setConfirmDelete(true)}
                    data-testid="button-delete-item"
                  >
                    Discard Item
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="font-fantasy text-[#e07070] text-xs tracking-wider text-center">
                      Are you sure? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95"
                        style={{
                          background: "rgba(180,50,50,0.25)",
                          border: "1px solid rgba(180,50,50,0.5)",
                          color: "#ff6060",
                          cursor: "pointer",
                        }}
                        onClick={() => deleteMutation.mutate(selectedItem.inventoryId)}
                        disabled={deleteMutation.isPending}
                        data-testid="button-confirm-delete-item"
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Yes, Discard"}
                      </button>
                      <button
                        className="flex-1 py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95"
                        style={{
                          background: "rgba(212,160,23,0.1)",
                          border: "1px solid rgba(212,160,23,0.3)",
                          color: "#f0c040",
                          cursor: "pointer",
                        }}
                        onClick={() => setConfirmDelete(false)}
                        data-testid="button-cancel-delete-item"
                      >
                        Keep It
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
