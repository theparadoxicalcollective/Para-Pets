import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";

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

const WALK_CONFIGS = [
  { travelPx: "140px", duration: "8s",   delay: "0s",   startPct: 4,  size: 68, bottomPx: 8  },
  { travelPx: "110px", duration: "11s",  delay: "2.8s", startPct: 30, size: 56, bottomPx: 52 },
  { travelPx: "150px", duration: "7s",   delay: "4.5s", startPct: 10, size: 72, bottomPx: 4  },
  { travelPx: "100px", duration: "9s",   delay: "1.5s", startPct: 50, size: 50, bottomPx: 72 },
  { travelPx: "130px", duration: "10s",  delay: "3.5s", startPct: 20, size: 62, bottomPx: 28 },
  { travelPx: "120px", duration: "8.5s", delay: "6s",   startPct: 38, size: 54, bottomPx: 56 },
];

export default function PetHousePage({ user }: PetHousePageProps) {
  const [selectedPet, setSelectedPet] = useState<InventoryPet | null>(null);
  const [draggingEdible, setDraggingEdible] = useState<EdibleItem | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [isOverPet, setIsOverPet] = useState(false);
  const [feedAnim, setFeedAnim] = useState(false);
  const [feedLabel, setFeedLabel] = useState("");
  const petDropRef = useRef<HTMLDivElement>(null);
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
      const edible = edibles.find((e) => e.inventoryId === variables.edibleInventoryId);
      setFeedLabel(`+${edible?.statBoostAmount ?? "?"} LVL`);
      setFeedAnim(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setTimeout(() => setFeedAnim(false), 2400);
    },
    onError: (err: any) => {
      toast({ title: "Can't feed", description: err?.message || "Could not feed edible", variant: "destructive" });
    },
  });

  const handleEdiblePointerDown = (e: React.PointerEvent, edible: EdibleItem) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingEdible(edible);
    setGhostPos({ x: e.clientX, y: e.clientY });
  };

  const handleEdiblePointerMove = (e: React.PointerEvent) => {
    if (!draggingEdible) return;
    setGhostPos({ x: e.clientX, y: e.clientY });
    if (petDropRef.current) {
      const r = petDropRef.current.getBoundingClientRect();
      setIsOverPet(
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom
      );
    }
  };

  const handleEdiblePointerUp = (e: React.PointerEvent) => {
    if (draggingEdible && isOverPet && selectedPet && !feedMutation.isPending) {
      feedMutation.mutate({
        petInventoryId: selectedPet.inventoryId,
        edibleInventoryId: draggingEdible.inventoryId,
      });
    }
    setDraggingEdible(null);
    setIsOverPet(false);
  };

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", background: "#0a0600" }}
    >
      <TopBar user={user} onProfileClick={() => {}} hideTreehouse />

      <div className="flex-1 relative overflow-hidden">
        <TreehouseRoom3D />

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">Loading...</p>
          </div>
        ) : (
          <>
            <div
              className="absolute z-10"
              style={{ left: 0, right: 0, bottom: 0, height: "50%" }}
            >
              {hatchedPets.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center">
                  <p
                    className="font-fantasy text-[9px] tracking-wider text-center px-6"
                    style={{ color: "rgba(139,106,62,0.5)" }}
                  >
                    No hatched pets yet — hatch one to move them in!
                  </p>
                </div>
              ) : (
                hatchedPets.map((pet, i) => (
                  <WalkingPet
                    key={pet.inventoryId}
                    pet={pet}
                    index={i}
                    onClick={() => setSelectedPet(pet)}
                  />
                ))
              )}
            </div>

            {hatchedPets.length > 0 && !selectedPet && (
              <div
                className="absolute z-10 flex justify-center pointer-events-none"
                style={{ bottom: "52%", left: 0, right: 0 }}
              >
                <p
                  className="font-fantasy text-[8px] tracking-[0.2em]"
                  style={{ color: "rgba(139,106,62,0.45)" }}
                >
                  tap a pet to feed
                </p>
              </div>
            )}
          </>
        )}

        {selectedPet && (
          <FeedView
            pet={selectedPet}
            edibles={edibles}
            petDropRef={petDropRef}
            isOverPet={isOverPet}
            draggingEdible={draggingEdible}
            feedAnim={feedAnim}
            feedLabel={feedLabel}
            isPending={feedMutation.isPending}
            onClose={() => setSelectedPet(null)}
            onEdiblePointerDown={handleEdiblePointerDown}
            onEdiblePointerMove={handleEdiblePointerMove}
            onEdiblePointerUp={handleEdiblePointerUp}
          />
        )}
      </div>

      {draggingEdible && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: ghostPos.x - 28,
            top: ghostPos.y - 32,
            transform: "scale(1.15)",
            filter: "drop-shadow(0 4px 14px rgba(134,239,172,0.7))",
          }}
        >
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
            style={{
              background: "rgba(15,35,15,0.95)",
              border: "2px solid rgba(134,239,172,0.85)",
            }}
          >
            {draggingEdible.imageUrl ? (
              <img src={draggingEdible.imageUrl} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-2xl">🍎</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedView({
  pet,
  edibles,
  petDropRef,
  isOverPet,
  draggingEdible,
  feedAnim,
  feedLabel,
  isPending,
  onClose,
  onEdiblePointerDown,
  onEdiblePointerMove,
  onEdiblePointerUp,
}: {
  pet: InventoryPet;
  edibles: EdibleItem[];
  petDropRef: React.RefObject<HTMLDivElement>;
  isOverPet: boolean;
  draggingEdible: EdibleItem | null;
  feedAnim: boolean;
  feedLabel: string;
  isPending: boolean;
  onClose: () => void;
  onEdiblePointerDown: (e: React.PointerEvent, edible: EdibleItem) => void;
  onEdiblePointerMove: (e: React.PointerEvent) => void;
  onEdiblePointerUp: (e: React.PointerEvent) => void;
}) {
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col animate-slide-up"
      style={{ background: "rgba(4,12,4,0.88)", backdropFilter: "blur(3px)" }}
    >
      <button
        data-testid="button-close-feed"
        onClick={onClose}
        className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
        style={{
          background: "rgba(60,25,5,0.85)",
          border: "1.5px solid rgba(212,160,23,0.45)",
          color: "#d4a017",
          cursor: "pointer",
        }}
      >
        ✕
      </button>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <p
          className="font-fantasy text-[9px] tracking-[0.25em]"
          style={{ color: draggingEdible ? "rgba(134,239,172,0.9)" : "rgba(168,152,120,0.65)" }}
        >
          {draggingEdible ? "DROP ON PET TO FEED!" : "DRAG AN EDIBLE ONTO YOUR PET"}
        </p>

        <div
          ref={petDropRef}
          data-testid="drop-zone-pet"
          className="relative flex flex-col items-center justify-center"
          style={{
            width: 148,
            height: 148,
            borderRadius: "50%",
            border: `2px dashed ${isOverPet ? "rgba(74,222,128,0.9)" : "rgba(74,222,128,0.28)"}`,
            background: isOverPet
              ? "radial-gradient(circle, rgba(74,222,128,0.22) 0%, transparent 75%)"
              : "radial-gradient(circle, rgba(40,80,40,0.12) 0%, transparent 70%)",
            transition: "all 0.15s ease",
            animation: isOverPet ? "glowPulse 0.9s ease-in-out infinite" : undefined,
          }}
        >
          {feedAnim && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
              style={{ animation: "powerUpRise 2.2s ease-out forwards" }}
            >
              <span
                className="font-fantasy text-2xl font-bold"
                style={{
                  color: "#86efac",
                  textShadow: "0 0 20px rgba(134,239,172,1), 0 0 40px rgba(134,239,172,0.6)",
                }}
                data-testid="text-feed-success"
              >
                {feedLabel}
              </span>
            </div>
          )}

          <div
            className="w-24 h-24"
            data-testid="img-feed-pet"
            style={{
              filter: isOverPet
                ? "drop-shadow(0 0 18px rgba(74,222,128,0.85))"
                : "drop-shadow(0 4px 10px rgba(0,0,0,0.55))",
              transition: "filter 0.15s ease",
              animation: isPending ? "petBob 0.4s ease-in-out infinite" : undefined,
            }}
          >
            {petImg ? (
              <img src={petImg} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-5xl flex items-center justify-center w-full h-full">🐾</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <p className="font-fantasy text-[#f0c040] text-sm tracking-wider">
            {pet.petNickname || pet.name}
          </p>
          <p className="font-fantasy text-[#7fbfb0] text-[9px] tracking-wider">LV {pet.petLevel}</p>
        </div>
      </div>

      <div
        className="flex-shrink-0 pb-6"
        style={{
          background: "linear-gradient(0deg, rgba(10,5,0,0.9) 0%, transparent 100%)",
          paddingTop: 16,
        }}
      >
        <p
          className="font-fantasy text-[8px] tracking-[0.3em] text-center mb-3"
          style={{ color: "rgba(107,88,64,0.7)" }}
        >
          YOUR EDIBLES
        </p>

        {edibles.length === 0 ? (
          <div className="text-center py-2">
            <p className="font-fantasy text-[9px]" style={{ color: "rgba(107,88,64,0.6)" }}>
              No edibles — buy some from the shop!
            </p>
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto px-4 pb-1"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {edibles.map((edible) => {
              const isBeingDragged = draggingEdible?.inventoryId === edible.inventoryId;
              return (
                <div
                  key={edible.inventoryId}
                  data-testid={`drag-edible-${edible.inventoryId}`}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 select-none"
                  style={{
                    opacity: isBeingDragged ? 0.3 : 1,
                    transition: "opacity 0.15s",
                    cursor: "grab",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => onEdiblePointerDown(e, edible)}
                  onPointerMove={onEdiblePointerMove}
                  onPointerUp={onEdiblePointerUp}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, rgba(18,38,18,0.95) 0%, rgba(10,22,10,0.95) 100%)",
                      border: "1.5px solid rgba(134,239,172,0.3)",
                      boxShadow: "0 3px 10px rgba(0,0,0,0.45)",
                    }}
                  >
                    {edible.imageUrl ? (
                      <img src={edible.imageUrl} alt="" className="w-full h-full object-contain pointer-events-none" />
                    ) : (
                      <span className="text-2xl pointer-events-none">🍎</span>
                    )}
                  </div>
                  <p
                    className="font-fantasy text-[7px] text-center pointer-events-none"
                    style={{ color: "#a89878", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {edible.name}
                  </p>
                  <p className="font-fantasy text-[7px] pointer-events-none" style={{ color: "#86efac" }}>
                    +{edible.statBoostAmount} LVL
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WalkingPet({
  pet,
  index,
  onClick,
}: {
  pet: InventoryPet;
  index: number;
  onClick: () => void;
}) {
  const cfg = WALK_CONFIGS[index % WALK_CONFIGS.length];
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  return (
    <div
      data-testid={`pet-room-${pet.inventoryId}`}
      onClick={onClick}
      className="absolute"
      style={({
        left: `${cfg.startPct}%`,
        bottom: cfg.bottomPx,
        zIndex: index + 1,
        cursor: "pointer",
        "--pw-dist": cfg.travelPx,
        animation: `petIdleWalk ${cfg.duration} ${cfg.delay} linear infinite`,
      } as any)}
    >
      <div
        style={{
          width: cfg.size,
          height: cfg.size,
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.55))",
        }}
      >
        {petImg ? (
          <img
            src={petImg}
            alt=""
            className="w-full h-full object-contain pointer-events-none"
          />
        ) : (
          <span
            className="pointer-events-none flex items-center justify-center w-full h-full"
            style={{ fontSize: cfg.size * 0.65 }}
          >
            🐾
          </span>
        )}
      </div>
      <div
        style={{
          width: cfg.size * 0.75,
          height: 4,
          background: "rgba(0,0,0,0.28)",
          borderRadius: "50%",
          margin: "0 auto",
          filter: "blur(2px)",
        }}
      />
    </div>
  );
}

function TreehouseRoom3D() {
  return (
    <div className="absolute inset-0" style={{ background: "#0f0700" }}>
      <div
        className="absolute"
        style={{
          left: "14%", right: "14%", top: 0, height: "63%",
          backgroundImage: `
            repeating-linear-gradient(
              180deg,
              transparent 0px, transparent 13px,
              rgba(0,0,0,0.13) 13px, rgba(0,0,0,0.13) 14px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0px, transparent 30px,
              rgba(0,0,0,0.05) 30px, rgba(0,0,0,0.05) 31px
            ),
            linear-gradient(180deg, #2c1600 0%, #3e1e00 55%, #4a2500 100%)
          `,
        }}
      >
        <div
          className="absolute"
          style={{
            width: 72, height: 72,
            left: "50%", top: "20%",
            transform: "translateX(-50%)",
            borderRadius: "50%",
            border: "7px solid #5a2e0a",
            background: "radial-gradient(circle at 45% 35%, #0c3a18 0%, #061a0c 60%, #020d06 100%)",
            boxShadow: "0 0 18px rgba(30,160,70,0.2), inset 0 0 12px rgba(30,160,70,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 50% 120%, #1a5c28 0%, #0a2e12 50%, #020d06 100%)",
            }}
          />
          <div style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,240,200,0.75)", top: "14%", right: "18%", boxShadow: "0 0 5px rgba(255,240,200,0.6)" }} />
          <div style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: "rgba(255,240,200,0.5)", top: "28%", left: "22%", boxShadow: "0 0 3px rgba(255,240,200,0.4)" }} />
        </div>

        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(90deg, transparent 0px, transparent 28px, rgba(0,0,0,0.04) 28px, rgba(0,0,0,0.04) 29px)",
          }}
        />
      </div>

      <div
        className="absolute"
        style={{
          left: 0, top: 0, width: "15%", height: "63%",
          background: "#1a0900",
          clipPath: "polygon(0% 0%, 100% 6%, 100% 96%, 0% 100%)",
          backgroundImage: "repeating-linear-gradient(168deg, transparent 0px, transparent 20px, rgba(0,0,0,0.14) 20px, rgba(0,0,0,0.14) 21px)",
        }}
      />

      <div
        className="absolute"
        style={{
          right: 0, top: 0, width: "15%", height: "63%",
          background: "#1a0900",
          clipPath: "polygon(0% 6%, 100% 0%, 100% 100%, 0% 96%)",
          backgroundImage: "repeating-linear-gradient(12deg, transparent 0px, transparent 20px, rgba(0,0,0,0.14) 20px, rgba(0,0,0,0.14) 21px)",
        }}
      />

      <div
        className="absolute"
        style={{
          left: 0, right: 0, top: 0, height: "9%",
          background: "#0d0500",
          backgroundImage: "repeating-linear-gradient(90deg, transparent 0px, transparent 32px, rgba(0,0,0,0.22) 32px, rgba(0,0,0,0.22) 33px)",
        }}
      >
        <div
          className="absolute"
          style={{ left: "5%", right: "5%", bottom: "28%", height: "1.5px", background: "rgba(150,115,65,0.35)" }}
        />
        <div className="absolute inset-0 flex items-end justify-around pb-0.5 px-3">
          {["#fde68a","#86efac","#fde68a","#f9a8d4","#fde68a","#86efac","#bfdbfe","#fde68a","#86efac","#fde68a"].map((col, i) => (
            <div
              key={i}
              style={{
                width: 5, height: 7,
                borderRadius: "0 0 3px 3px",
                background: col,
                boxShadow: `0 0 5px ${col}`,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
      </div>

      <div
        className="absolute"
        style={{
          left: 0, right: 0, bottom: 0, height: "38%",
          backgroundImage: `
            repeating-linear-gradient(
              180deg,
              transparent 0px, transparent 10px,
              rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 11px
            ),
            linear-gradient(180deg, #5a2d00 0%, #6e3800 40%, #7a4000 100%)
          `,
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="50%" y1="0%" x2="0%"   y2="100%" stroke="rgba(0,0,0,0.13)" strokeWidth="1" />
          <line x1="50%" y1="0%" x2="15%"  y2="100%" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
          <line x1="50%" y1="0%" x2="32%"  y2="100%" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
          <line x1="50%" y1="0%" x2="68%"  y2="100%" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
          <line x1="50%" y1="0%" x2="85%"  y2="100%" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
          <line x1="50%" y1="0%" x2="100%" y2="100%" stroke="rgba(0,0,0,0.13)" strokeWidth="1" />
        </svg>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.22) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.22) 100%)" }}
        />
      </div>

      <div
        className="absolute"
        style={{ left: "13.5%", top: 0, width: "1.5px", height: "63%", background: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.15))" }}
      />
      <div
        className="absolute"
        style={{ right: "13.5%", top: 0, width: "1.5px", height: "63%", background: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.15))" }}
      />

      <div
        className="absolute"
        style={{
          left: 0, right: 0,
          top: "calc(63% - 2px)",
          height: "3px",
          background: "linear-gradient(90deg, #0f0700 0%, #1e0e00 14%, #080300 50%, #1e0e00 86%, #0f0700 100%)",
          zIndex: 2,
        }}
      />

    </div>
  );
}
