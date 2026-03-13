import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import bgImg from "@assets/bg_home_v2.png";

interface PetHousePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface InventoryPet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  petNickname: string | null;
  isHatched: boolean;
  petLevel: number;
  petLevelPoints: number;
  rarity: number | null;
}

interface EdibleItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  statBoostAmount: number | null;
}

export default function PetHousePage({ user }: PetHousePageProps) {
  const [selectedPet, setSelectedPet] = useState<InventoryPet | null>(null);
  const [pendingEdible, setPendingEdible] = useState<EdibleItem | null>(null);
  const [successAnim, setSuccessAnim] = useState(false);
  const [successLabel, setSuccessLabel] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: inventory = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const hatchedPets: InventoryPet[] = inventory.filter(
    (item) => item.type === "pet" && item.isHatched
  );

  const edibles: EdibleItem[] = inventory.filter(
    (item) => item.type === "edibles"
  );

  const feedMutation = useMutation({
    mutationFn: async ({ petInventoryId, edibleInventoryId }: { petInventoryId: string; edibleInventoryId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${petInventoryId}/feed-edible`, { itemInventoryId: edibleInventoryId });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      const edible = edibles.find(e => e.inventoryId === variables.edibleInventoryId);
      setSuccessLabel(`+${edible?.statBoostAmount || "?"} LVL pts`);
      setSuccessAnim(true);
      setPendingEdible(null);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setTimeout(() => setSuccessAnim(false), 2200);
    },
    onError: (err: any) => {
      toast({ title: "Can't feed", description: err?.message || "Could not feed edible", variant: "destructive" });
    },
  });

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto" }}
    >
      <div className="absolute inset-0 z-0">
        <img src={bgImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "rgba(10,30,15,0.6)" }} />
      </div>

      <div
        className="relative z-10 flex flex-col h-full"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <TopBar user={user} onProfileClick={() => {}} hideTreehouse />

        <div className="flex-1 flex flex-col overflow-hidden px-4 pt-3 pb-4 gap-4">

          <div className="flex items-center gap-3">
            <TreehouseIconLarge />
            <div>
              <h1
                className="font-fantasy text-[#f0c040] text-xl tracking-widest"
                style={{ textShadow: "0 0 15px rgba(240,192,64,0.4)" }}
              >
                Pet House
              </h1>
              <p className="font-fantasy text-[#7fbfb0] text-[10px] tracking-wider">Feed your pets edibles to level them up</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto">

              <Section title="Your Pets" count={hatchedPets.length}>
                {hatchedPets.length === 0 ? (
                  <EmptyNote>No hatched pets yet — hatch one from your inventory!</EmptyNote>
                ) : (
                  <div className="space-y-2">
                    {hatchedPets.map(pet => {
                      const petImg = pet.hatchedImageUrl || pet.imageUrl;
                      const isSelected = selectedPet?.inventoryId === pet.inventoryId;
                      return (
                        <button
                          key={pet.inventoryId}
                          data-testid={`button-select-pet-${pet.inventoryId}`}
                          onClick={() => setSelectedPet(isSelected ? null : pet)}
                          className="w-full text-left rounded-lg p-2.5 flex items-center gap-3 transition-transform active:scale-98"
                          style={{
                            background: isSelected
                              ? "linear-gradient(135deg, rgba(20,60,30,0.9) 0%, rgba(10,40,20,0.9) 100%)"
                              : "linear-gradient(135deg, rgba(20,10,3,0.8) 0%, rgba(45,25,8,0.8) 100%)",
                            border: `1px solid ${isSelected ? "rgba(74,222,128,0.6)" : "rgba(212,160,23,0.25)"}`,
                            cursor: "pointer",
                            boxShadow: isSelected ? "0 0 12px rgba(74,222,128,0.2)" : "none",
                          }}
                        >
                          <div
                            className="w-11 h-11 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                          >
                            {petImg ? (
                              <img src={petImg} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-xl">🐾</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-fantasy text-[#f0c040] text-xs truncate">
                              {pet.petNickname || pet.name}
                            </p>
                            <p className="font-fantasy text-[#7fbfb0] text-[9px]">LV {pet.petLevel}</p>
                          </div>
                          {isSelected && (
                            <span className="font-fantasy text-[#4ade80] text-[8px] tracking-wider flex-shrink-0">Selected ✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title="Your Edibles" count={edibles.length}>
                {edibles.length === 0 ? (
                  <EmptyNote>No edibles in your bag — buy some from the shop!</EmptyNote>
                ) : (
                  <div className="space-y-2">
                    {edibles.map(edible => (
                      <div
                        key={edible.inventoryId}
                        data-testid={`card-edible-${edible.inventoryId}`}
                        className="rounded-lg p-2.5 flex items-center gap-3"
                        style={{
                          background: "linear-gradient(135deg, rgba(20,10,3,0.8) 0%, rgba(45,25,8,0.8) 100%)",
                          border: "1px solid rgba(134,239,172,0.2)",
                        }}
                      >
                        <div
                          className="w-11 h-11 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(134,239,172,0.15)" }}
                        >
                          {edible.imageUrl ? (
                            <img src={edible.imageUrl} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-xl">🍎</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-fantasy text-[#f0c040] text-xs truncate">{edible.name}</p>
                          <p className="font-fantasy text-[#86efac] text-[9px]">+{edible.statBoostAmount} LVL pts</p>
                        </div>
                        <button
                          data-testid={`button-feed-edible-${edible.inventoryId}`}
                          onClick={() => {
                            if (!selectedPet) {
                              toast({ title: "No pet selected", description: "Select a pet above first", variant: "destructive" });
                              return;
                            }
                            setPendingEdible(edible);
                          }}
                          disabled={feedMutation.isPending}
                          className="px-3 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider flex-shrink-0 transition-transform active:scale-95 disabled:opacity-50"
                          style={{
                            background: "linear-gradient(135deg, #14532d 0%, #166534 100%)",
                            border: "1px solid rgba(74,222,128,0.4)",
                            color: "#86efac",
                            cursor: "pointer",
                          }}
                        >
                          Feed
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>

        {successAnim && (
          <div
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
            style={{ animation: "powerUpFlash 2.2s ease-out forwards" }}
          >
            <div
              className="flex flex-col items-center"
              style={{ animation: "powerUpRise 2s ease-out forwards" }}
            >
              <div className="text-5xl mb-1" style={{ animation: "powerUpSpin 0.7s ease-out" }}>🍀</div>
              <span
                className="font-fantasy text-2xl font-bold tracking-wider"
                style={{
                  color: "#86efac",
                  textShadow: "0 0 20px rgba(134,239,172,0.9), 0 0 40px rgba(134,239,172,0.5)",
                }}
                data-testid="text-feed-success"
              >
                {successLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {pendingEdible && selectedPet && (
        <FeedConfirmModal
          pet={selectedPet}
          edible={pendingEdible}
          onConfirm={() => feedMutation.mutate({ petInventoryId: selectedPet.inventoryId, edibleInventoryId: pendingEdible.inventoryId })}
          onClose={() => setPendingEdible(null)}
          isPending={feedMutation.isPending}
        />
      )}
    </div>
  );
}

function FeedConfirmModal({ pet, edible, onConfirm, onClose, isPending }: {
  pet: InventoryPet;
  edible: EdibleItem;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[85%] max-w-xs rounded-xl p-5 animate-slide-up flex flex-col items-center gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.97) 0%, rgba(50,28,8,0.97) 100%)",
          border: "1px solid rgba(134,239,172,0.4)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 30px rgba(134,239,172,0.08)",
        }}
      >
        <p className="font-fantasy text-[#f0c040] text-sm tracking-widest text-center">Feed Edible?</p>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)" }}
            >
              {petImg ? <img src={petImg} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">🐾</span>}
            </div>
            <p className="font-fantasy text-[#a89878] text-[9px] text-center max-w-[60px] truncate">{pet.petNickname || pet.name}</p>
          </div>

          <span className="font-fantasy text-[#7fbfb0] text-lg">←</span>

          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(134,239,172,0.2)" }}
            >
              {edible.imageUrl ? <img src={edible.imageUrl} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">🍎</span>}
            </div>
            <p className="font-fantasy text-[#86efac] text-[9px] text-center max-w-[60px] truncate">{edible.name}</p>
          </div>
        </div>

        <p className="font-fantasy text-[#7fbfb0] text-[10px] tracking-wider text-center">
          {pet.petNickname || pet.name} will receive <span style={{ color: "#86efac" }}>+{edible.statBoostAmount} LVL pts</span>
        </p>

        <div className="flex gap-3 w-full">
          <button
            data-testid="button-cancel-feed"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg font-fantasy text-xs tracking-wider"
            style={{ background: "rgba(60,30,10,0.6)", border: "1px solid rgba(212,160,23,0.25)", color: "#a89878", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            data-testid="button-confirm-feed"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-2 rounded-lg font-fantasy text-xs tracking-wider disabled:opacity-50 transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, #14532d 0%, #166534 100%)",
              border: "1px solid rgba(74,222,128,0.5)",
              color: "#86efac",
              cursor: "pointer",
            }}
          >
            {isPending ? "Feeding..." : "Feed!"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-fantasy text-[#a89878] text-xs tracking-widest">{title}</h2>
        <span
          className="font-fantasy text-[9px] px-1.5 py-0.5 rounded-full"
          style={{ background: "rgba(127,191,176,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,191,176,0.2)" }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-center"
      style={{ background: "rgba(20,10,3,0.5)", border: "1px solid rgba(212,160,23,0.1)" }}
    >
      <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wider">{children}</p>
    </div>
  );
}

function TreehouseIconLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ph-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b3d1e" />
          <stop offset="100%" stopColor="#9b5a2e" />
        </linearGradient>
        <linearGradient id="ph-leaf1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="ph-leaf2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="ph-house" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="ph-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <rect x="34" y="50" width="12" height="22" rx="2" fill="url(#ph-trunk)" />
      <rect x="36" y="50" width="3" height="22" rx="1" fill="rgba(0,0,0,0.15)" />
      <ellipse cx="40" cy="44" rx="22" ry="18" fill="url(#ph-leaf1)" />
      <ellipse cx="40" cy="38" rx="18" ry="15" fill="url(#ph-leaf2)" />
      <ellipse cx="40" cy="32" rx="14" ry="12" fill="#4ade80" />
      <ellipse cx="28" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />
      <ellipse cx="52" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />
      <rect x="27" y="34" width="26" height="16" rx="2" fill="url(#ph-house)" />
      <polygon points="25,35 40,24 55,35" fill="url(#ph-roof)" />
      <rect x="36" y="41" width="8" height="9" rx="1" fill="#854d0e" />
      <rect x="29" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />
      <rect x="46" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />
      <line x1="34" y1="44" x2="27" y2="50" stroke="#92400e" strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="28" r="2" fill="#fde68a" opacity="0.85" />
      <circle cx="58" cy="32" r="1.5" fill="#fde68a" opacity="0.65" />
      <circle cx="18" cy="38" r="1.5" fill="#86efac" opacity="0.6" />
    </svg>
  );
}
