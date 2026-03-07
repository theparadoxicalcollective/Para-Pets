import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import bagIconImg from "@assets/icon_bag.png";
import PetDetailPage from "./PetDetailPage";

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
  healthRestored: number | null;
  hatchStartedAt: string | null;
  isHatched: boolean;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  itemsUsedThisLevel: number;
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
}

export default function PetInventory({ user, onClose, onUserUpdate }: PetInventoryProps) {
  const [showBag, setShowBag] = useState(false);
  const [selectedPet, setSelectedPet] = useState<InventoryItem | null>(null);
  const { toast } = useToast();
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
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onUserUpdate(data);
      toast({
        title: data.activePetId ? "Pet Selected" : "Pet Deselected",
        description: data.activePetId ? "Your companion has been chosen!" : "No active pet",
      });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not update active pet", variant: "destructive" });
    },
  });

  const pets = inventory.filter((item) => item.type === "pet");
  const bagTypes = ["item", "accessory", "potion"];
  const bagItems = inventory.filter((item) => bagTypes.includes(item.type));

  const handlePetToggle = (shopItemId: string) => {
    if (user.activePetId === shopItemId) {
      setActivePetMutation.mutate(null);
    } else {
      setActivePetMutation.mutate(shopItemId);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-10 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                  border: "1px solid rgba(127,255,212,0.4)",
                }}
              >
                <span className="text-xl">🐾</span>
              </div>
              <div>
                <h3
                  className="font-fantasy text-[#f0c040] text-base tracking-widest font-semibold"
                  style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}
                >
                  {showBag ? "Adventurer's Bag" : "Pet Companions"}
                </h3>
                <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
                  {showBag ? `${bagItems.length} ${bagItems.length === 1 ? "item" : "items"}` : `${pets.length} ${pets.length === 1 ? "pet" : "pets"}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-toggle-bag"
                onClick={() => setShowBag(!showBag)}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: showBag
                    ? "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)"
                    : "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
                  border: showBag ? "2px solid rgba(212,160,23,0.6)" : "1px solid rgba(212,160,23,0.3)",
                  cursor: "pointer",
                }}
              >
                {showBag ? (
                  <span className="text-lg">🐾</span>
                ) : (
                  <img src={bagIconImg} alt="Bag" className="w-7 h-7 object-contain" />
                )}
              </button>
              <button
                data-testid="button-close-inventory"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                  border: "2px solid rgba(212,160,23,0.6)",
                  color: "#f0c040",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                X
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading inventory...</p>
              </div>
            ) : showBag ? (
              <BagView items={bagItems} />
            ) : (
              <PetView
                pets={pets}
                activePetId={user.activePetId}
                onToggle={handlePetToggle}
                onPetClick={(pet) => pet.isHatched && setSelectedPet(pet)}
                isPending={setActivePetMutation.isPending}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hatchOrbBurst {
          0% { transform: translate(0, 0) scale(0.3); opacity: 0; }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { transform: translate(var(--endX), var(--endY)) scale(0); opacity: 0; }
        }
        @keyframes hatchOrbCenter {
          0% { transform: scale(0); opacity: 0; }
          20% { transform: scale(1.8); opacity: 1; }
          50% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes hatchTextRise {
          0% { transform: translateY(8px) scale(0.8); opacity: 0; }
          30% { transform: translateY(0px) scale(1.1); opacity: 1; }
          70% { transform: translateY(-4px) scale(1); opacity: 1; }
          100% { transform: translateY(-12px) scale(0.9); opacity: 0; }
        }
      `}</style>

      {selectedPet && (
        <PetDetailPage
          pet={selectedPet}
          onClose={() => setSelectedPet(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
            setSelectedPet(null);
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
        className="font-fantasy text-[8px] tracking-wider text-center mt-1"
        style={{ color: isReady ? "#4ade80" : "#d4a017" }}
        data-testid="text-hatch-time"
      >
        {isReady ? "✨ Tap to hatch! ✨" : timeLeft}
      </p>
    </div>
  );
}

function PetView({
  pets,
  activePetId,
  onToggle,
  onPetClick,
  isPending,
}: {
  pets: InventoryItem[];
  activePetId: string | null;
  onToggle: (id: string) => void;
  onPetClick: (pet: InventoryItem) => void;
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hatchingId, setHatchingId] = useState<string | null>(null);

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
          <span className="text-3xl" style={{ filter: "grayscale(100%) opacity(0.4)" }}>🥚</span>
        </div>
        <p className="font-fantasy text-[#7fbfb0] text-sm tracking-wider mb-2">No pets yet</p>
        <p className="font-fantasy text-[#5a8a78] text-xs tracking-wider">Visit world shops to acquire pets!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {pets.map((pet) => {
        const isActive = activePetId === pet.shopItemId;
        const isEgg = !pet.isHatched;
        const displayImage = isEgg ? pet.eggImageUrl : (pet.hatchedImageUrl || pet.imageUrl);

        const hatchReady = isEgg && pet.hatchStartedAt && pet.hatchTime
          ? (Date.now() - new Date(pet.hatchStartedAt).getTime()) >= pet.hatchTime * 3600000
          : false;

        const handleClick = () => {
          if (isEgg && hatchReady) {
            hatchCheckMutation.mutate(pet.inventoryId);
          } else if (!isEgg) {
            onPetClick(pet);
          }
        };

        return (
          <div
            key={pet.inventoryId}
            data-testid={`card-pet-${pet.shopItemId}`}
            className="rounded-lg overflow-hidden"
            style={{
              background: isActive
                ? "linear-gradient(135deg, rgba(45,106,79,0.6) 0%, rgba(26,74,46,0.6) 100%)"
                : "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
              border: isActive ? "2px solid rgba(127,255,212,0.6)" : "1px solid rgba(212,160,23,0.3)",
              boxShadow: isActive ? "0 0 20px rgba(127,255,212,0.2)" : "none",
            }}
          >
            <div className="p-3 flex flex-col items-center gap-2">
              <div
                className="w-full aspect-square rounded-md flex items-center justify-center cursor-pointer relative"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                onClick={handleClick}
              >
                {displayImage ? (
                  <img src={displayImage} alt={pet.name} className="w-full h-full object-contain rounded-md" />
                ) : (
                  <span className="text-4xl">{isEgg ? "🥚" : "🐾"}</span>
                )}
                {isEgg && (
                  <div
                    className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(240,192,64,0.3)" }}
                  >
                    <span className="font-fantasy text-[7px] text-[#f0c040] tracking-wider">EGG</span>
                  </div>
                )}
                {hatchReady && hatchingId !== pet.inventoryId && (
                  <div
                    className="absolute inset-0 rounded-md flex items-center justify-center animate-pulse"
                    style={{ background: "rgba(74,222,128,0.15)", border: "2px solid rgba(74,222,128,0.4)" }}
                  >
                    <span className="font-fantasy text-[#4ade80] text-xs tracking-wider font-bold" style={{ textShadow: "0 0 8px rgba(74,222,128,0.6)" }}>
                      READY!
                    </span>
                  </div>
                )}
                {hatchingId === pet.inventoryId && (
                  <div className="absolute inset-0 rounded-md flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                    {[...Array(10)].map((_, i) => {
                      const angle = (i / 10) * 360;
                      const rad = (angle * Math.PI) / 180;
                      const endX = Math.cos(rad) * 50;
                      const endY = Math.sin(rad) * 50;
                      const size = 6 + Math.random() * 6;
                      const delay = i * 0.04;
                      return (
                        <div
                          key={i}
                          style={{
                            position: "absolute",
                            width: `${size}px`,
                            height: `${size}px`,
                            borderRadius: "50%",
                            background: "radial-gradient(circle, #ffe566 0%, #f0c040 40%, rgba(240,192,64,0) 70%)",
                            boxShadow: "0 0 10px rgba(240,192,64,0.8), 0 0 20px rgba(240,192,64,0.4)",
                            animation: `hatchOrbBurst 1.4s ${delay}s ease-out forwards`,
                            opacity: 0,
                            ["--endX" as any]: `${endX}px`,
                            ["--endY" as any]: `${endY}px`,
                          }}
                        />
                      );
                    })}
                    <div
                      style={{
                        position: "absolute",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(255,248,192,0.9) 0%, rgba(240,192,64,0.5) 40%, rgba(240,192,64,0) 70%)",
                        boxShadow: "0 0 25px rgba(240,192,64,0.8), 0 0 50px rgba(240,192,64,0.3)",
                        animation: "hatchOrbCenter 1.8s ease-out forwards",
                      }}
                    />
                    <span
                      className="font-fantasy text-sm font-bold tracking-widest absolute"
                      style={{
                        color: "#f0c040",
                        textShadow: "0 0 12px rgba(240,192,64,0.8), 0 0 24px rgba(240,192,64,0.4)",
                        animation: "hatchTextRise 2s 0.3s ease-out forwards",
                        opacity: 0,
                      }}
                    >
                      HATCHED!
                    </span>
                  </div>
                )}
              </div>

              <p
                className="font-fantasy text-[#f0c040] text-xs font-semibold text-center truncate w-full"
                data-testid={`text-pet-name-${pet.shopItemId}`}
              >
                {pet.petNickname || pet.name}
              </p>
              {pet.petNickname && (
                <p className="font-fantasy text-[#a89878] text-[8px] tracking-wider text-center truncate w-full">{pet.name}</p>
              )}

              {pet.rarity && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: pet.rarity }).map((_, i) => (
                    <span key={i} className="text-[10px]" style={{ color: "#f0c040", textShadow: "0 0 4px rgba(240,192,64,0.6)" }}>★</span>
                  ))}
                </div>
              )}

              {isEgg && pet.hatchStartedAt && pet.hatchTime ? (
                <HatchProgressBar hatchStartedAt={pet.hatchStartedAt} hatchTime={pet.hatchTime} />
              ) : !isEgg ? (
                <div className="w-full space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-fantasy text-[8px] text-[#a89878] tracking-wider">LV {pet.petLevel}</span>
                    <span className="font-fantasy text-[8px] text-[#4ade80] tracking-wider">HP {pet.petHealth}</span>
                  </div>
                </div>
              ) : null}

              {isActive && (
                <span
                  className="font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(127,255,212,0.2)", color: "#7fffd4", border: "1px solid rgba(127,255,212,0.3)" }}
                >
                  ACTIVE
                </span>
              )}

              <button
                data-testid={`button-select-pet-${pet.shopItemId}`}
                onClick={() => onToggle(pet.shopItemId)}
                disabled={isPending}
                className="w-full py-1.5 rounded font-fantasy text-[10px] tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(139,0,0,0.5) 0%, rgba(80,0,0,0.5) 100%)"
                    : "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                  border: isActive
                    ? "1px solid rgba(200,50,50,0.4)"
                    : "1px solid rgba(127,255,212,0.4)",
                  color: isActive ? "#ff9999" : "#7fffd4",
                  cursor: "pointer",
                }}
              >
                {isActive ? "Deselect" : "Select"}
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
    else parts.push("A collectible item from Symora.");
  }
  return parts.join(" ");
}

function BagView({ items }: { items: InventoryItem[] }) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div
          className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
          style={{
            background: "radial-gradient(ellipse at center, rgba(92,58,30,0.3) 0%, rgba(30,15,5,0.4) 100%)",
            border: "2px dashed rgba(139,94,60,0.3)",
          }}
        >
          <span className="text-3xl" style={{ filter: "grayscale(100%) opacity(0.4)" }}>🎒</span>
        </div>
        <p className="font-fantasy text-[#a89878] text-sm tracking-wider mb-2">Bag is empty</p>
        <p className="font-fantasy text-[#6a5840] text-xs tracking-wider">Purchase items from world shops!</p>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    item: "#f0c040",
    accessory: "#c084fc",
    potion: "#60d394",
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.inventoryId}
            data-testid={`card-bag-item-${item.shopItemId}`}
            className="rounded-lg overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
              border: "1px solid rgba(212,160,23,0.3)",
              cursor: "pointer",
            }}
            onClick={() => { setSelectedItem(item); setConfirmDelete(false); }}
          >
            <div className="p-3 flex flex-col items-center gap-2">
              <div
                className="w-full aspect-square rounded-md flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain rounded-md" />
                ) : (
                  <span className="text-3xl">
                    {item.type === "potion" ? "🧪" : item.type === "accessory" ? "💍" : "📦"}
                  </span>
                )}
              </div>
              <p className="font-fantasy text-[#f0c040] text-xs font-semibold text-center truncate w-full" data-testid={`text-bag-item-name-${item.shopItemId}`}>
                {item.name}
              </p>
              {item.statBoostType && (
                <span
                  className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background: item.statBoostType === "health" ? "rgba(74,222,128,0.15)" : item.statBoostType === "atk" ? "rgba(248,113,113,0.15)" : item.statBoostType === "def" ? "rgba(96,165,250,0.15)" : "rgba(192,132,252,0.15)",
                    color: item.statBoostType === "health" ? "#4ade80" : item.statBoostType === "atk" ? "#f87171" : item.statBoostType === "def" ? "#60a5fa" : "#c084fc",
                    border: `1px solid ${item.statBoostType === "health" ? "rgba(74,222,128,0.3)" : item.statBoostType === "atk" ? "rgba(248,113,113,0.3)" : item.statBoostType === "def" ? "rgba(96,165,250,0.3)" : "rgba(192,132,252,0.3)"}`,
                  }}
                >
                  +{item.statBoostAmount || "?"} {item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "LVL"}
                </span>
              )}
              <span
                className="font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded-full capitalize"
                style={{
                  background: `${typeColors[item.type] || "#f0c040"}20`,
                  color: typeColors[item.type] || "#f0c040",
                  border: `1px solid ${typeColors[item.type] || "#f0c040"}40`,
                }}
              >
                {item.type}
              </span>
            </div>
          </div>
        ))}
      </div>

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
                  <span className="text-4xl">
                    {selectedItem.type === "potion" ? "🧪" : selectedItem.type === "accessory" ? "💍" : "📦"}
                  </span>
                )}
              </div>

              <div className="text-center">
                <h3 className="font-fantasy text-[#f0c040] text-lg tracking-wider mb-1" data-testid="text-item-detail-name">
                  {selectedItem.name}
                </h3>
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
              </div>

              <div
                className="w-full rounded-lg p-3"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(212,160,23,0.1)" }}
              >
                <p className="font-fantasy text-[#c8b090] text-xs tracking-wider leading-relaxed text-center" data-testid="text-item-detail-description">
                  {getItemDescription(selectedItem)}
                </p>
              </div>

              {selectedItem.statBoostType && (
                <div className="flex items-center gap-2">
                  <span
                    className="font-fantasy text-[10px] tracking-wider px-3 py-1 rounded-full"
                    style={{
                      background: selectedItem.statBoostType === "health" ? "rgba(74,222,128,0.15)" : selectedItem.statBoostType === "atk" ? "rgba(248,113,113,0.15)" : selectedItem.statBoostType === "def" ? "rgba(96,165,250,0.15)" : "rgba(192,132,252,0.15)",
                      color: selectedItem.statBoostType === "health" ? "#4ade80" : selectedItem.statBoostType === "atk" ? "#f87171" : selectedItem.statBoostType === "def" ? "#60a5fa" : "#c084fc",
                      border: `1px solid ${selectedItem.statBoostType === "health" ? "rgba(74,222,128,0.3)" : selectedItem.statBoostType === "atk" ? "rgba(248,113,113,0.3)" : selectedItem.statBoostType === "def" ? "rgba(96,165,250,0.3)" : "rgba(192,132,252,0.3)"}`,
                    }}
                  >
                    +{selectedItem.statBoostAmount || "?"} {selectedItem.statBoostType === "health" ? "HP" : selectedItem.statBoostType === "atk" ? "ATK" : selectedItem.statBoostType === "def" ? "DEF" : "LVL"}
                  </span>
                </div>
              )}

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
