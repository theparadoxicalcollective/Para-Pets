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
          <div className="flex items-center justify-between px-4 pt-5 pb-3">
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

  const hatchCheckMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${inventoryId}/hatch-check`);
      return res.json();
    },
    onSuccess: (data: any, inventoryId: string) => {
      if (data.isHatched) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        toast({ title: "🎉 Hatched!", description: "Your pet has emerged from its egg!" });
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
                {hatchReady && (
                  <div
                    className="absolute inset-0 rounded-md flex items-center justify-center animate-pulse"
                    style={{ background: "rgba(74,222,128,0.15)", border: "2px solid rgba(74,222,128,0.4)" }}
                  >
                    <span className="font-fantasy text-[#4ade80] text-xs tracking-wider font-bold" style={{ textShadow: "0 0 8px rgba(74,222,128,0.6)" }}>
                      READY!
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

function BagView({ items }: { items: InventoryItem[] }) {
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
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.inventoryId}
          data-testid={`card-bag-item-${item.shopItemId}`}
          className="rounded-lg overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
            border: "1px solid rgba(212,160,23,0.3)",
          }}
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
  );
}
