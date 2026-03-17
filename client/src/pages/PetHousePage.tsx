import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/pethouse_bg_new.png";
import aquariumBg from "@assets/bg_aquarium.png";
import fishbowlIconImg from "@assets/icon_fishbowl.png";
import forestHomeIconImg from "@assets/icon_forest_home.png";

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
  petTemplateId: string | null;
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
  { wanderIdx: 0, left: "4%",  top: "88%", size: 150, duration: "38s", delay: "0s"   },
  { wanderIdx: 1, left: "58%", top: "83%", size: 150, duration: "42s", delay: "5s"   },
  { wanderIdx: 2, left: "20%", top: "74%", size: 150, duration: "36s", delay: "11s"  },
  { wanderIdx: 3, left: "52%", top: "65%", size: 150, duration: "44s", delay: "2s"   },
  { wanderIdx: 4, left: "34%", top: "57%", size: 150, duration: "40s", delay: "16s"  },
  { wanderIdx: 5, left: "40%", top: "79%", size: 150, duration: "45s", delay: "8s"   },
];

const GROUND_WALK_CONFIGS = [
  { wanderIdx: 0, left: "4%",  top: "91%", size: 150, duration: "38s", delay: "0s"   },
  { wanderIdx: 1, left: "58%", top: "91%", size: 150, duration: "42s", delay: "5s"   },
  { wanderIdx: 2, left: "20%", top: "89%", size: 150, duration: "36s", delay: "11s"  },
  { wanderIdx: 3, left: "52%", top: "89%", size: 150, duration: "44s", delay: "2s"   },
  { wanderIdx: 4, left: "34%", top: "89%", size: 150, duration: "40s", delay: "16s"  },
  { wanderIdx: 5, left: "40%", top: "91%", size: 150, duration: "45s", delay: "8s"   },
];

export default function PetHousePage({ user }: PetHousePageProps) {
  const [selectedPet, setSelectedPet] = useState<InventoryPet | null>(null);
  const [showAquarium, setShowAquarium] = useState(false);
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
      setFeedLabel(`+${edible?.statBoostAmount ?? "?"} LVL Points`);
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
        <ForestRoom />

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">Loading...</p>
          </div>
        ) : (
          <>
            <div className="absolute inset-0 z-10">
              {hatchedPets.length === 0 ? (
                <div className="w-full h-full flex items-center justify-end flex-col pb-12">
                  <p
                    className="font-fantasy text-[9px] tracking-wider text-center px-6"
                    style={{ color: "rgba(200,170,100,0.55)" }}
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

      {/* Bottom Toolbar */}
      <div className="relative flex-shrink-0" style={{ zIndex: 30 }}>
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(180,140,40,0.5) 20%, rgba(212,160,23,0.75) 50%, rgba(180,140,40,0.5) 80%, transparent 100%)",
            boxShadow: "0 0 8px rgba(212,160,23,0.25)",
          }}
        />
        <div
          className="w-full flex items-center justify-evenly px-6"
          style={{
            background: "linear-gradient(180deg, rgba(6,14,3,0) 0%, rgba(6,14,3,0.82) 30%, rgba(4,10,2,0.95) 100%)",
            paddingTop: 10,
            paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))",
          }}
        >
          <HouseNavButton testId="button-nav-aquarium" onClick={() => setShowAquarium(true)} label="Aquarium">
            <FishbowlIcon />
          </HouseNavButton>
          <HouseNavButton testId="button-nav-forest-den" onClick={() => {}} label="Forest Den">
            <ForestHomeIcon />
          </HouseNavButton>
        </div>
      </div>

      {showAquarium && (
        <AquariumPage onClose={() => setShowAquarium(false)} />
      )}

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
                    +{edible.statBoostAmount} LVL Points
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
  const [isHovered, setIsHovered] = useState(false);

  const { data: templateData } = useQuery<{ parts: Array<{ partType: string }> }>({
    queryKey: ["/api/pet-template-parts", pet.petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${pet.petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!pet.petTemplateId,
    staleTime: 300000,
  });

  const hasWings = !!(templateData?.parts?.some(
    (p) => p.partType === "left_wing" || p.partType === "right_wing" || p.partType === "wings"
  ));

  const cfg = hasWings
    ? WALK_CONFIGS[index % WALK_CONFIGS.length]
    : GROUND_WALK_CONFIGS[index % GROUND_WALK_CONFIGS.length];

  const floatAnim = hasWings ? "petFloatSmall" : "petGroundFloat";
  const wanderPrefix = hasWings ? "petWander" : "petGroundWander";

  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const sz = cfg.size;
  const shadowW = Math.round(sz * 0.52);

  const shadow = (
    <div
      style={{
        width: shadowW,
        height: Math.max(3, Math.round(sz * 0.06)),
        background: "rgba(0,0,0,0.25)",
        borderRadius: "50%",
        margin: "0 auto",
        filter: `blur(${Math.max(2, Math.round(sz * 0.05))}px)`,
      }}
    />
  );

  const hoverStyle = {
    transform: isHovered ? "scale(1.1)" : "scale(1)",
    transition: "transform 0.15s ease",
  };

  const hoverHandlers = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onTouchStart: () => setIsHovered(true),
    onTouchEnd: () => setIsHovered(false),
  };

  return (
    <div
      data-testid={`pet-room-${pet.inventoryId}`}
      className="absolute"
      style={{
        left: cfg.left,
        top: cfg.top,
        marginTop: -sz,
        zIndex: parseInt(cfg.top, 10),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          animation: `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`,
          transformOrigin: "bottom center",
        }}
      >
        <div style={{ animation: `${floatAnim} 3.2s ${cfg.delay} ease-in-out infinite` }}>
          {pet.petTemplateId ? (
            <>
              {/* PetAnimator: tight oval hit area so transparent edges don't block other pets */}
              <div style={{ width: sz, height: sz, pointerEvents: "none", position: "relative" }}>
                <PetAnimator
                  petTemplateId={pet.petTemplateId}
                  mode="idle"
                  size={sz}
                  style={{
                    filter: `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.5))`,
                    transform: isHovered ? "scale(1.1)" : "scale(1)",
                    transition: "transform 0.15s ease",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "45%",
                    width: Math.round(sz * 0.62),
                    height: Math.round(sz * 0.72),
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    pointerEvents: "auto",
                    cursor: "pointer",
                  }}
                  onClick={onClick}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  onTouchStart={() => setIsHovered(true)}
                  onTouchEnd={() => setIsHovered(false)}
                />
              </div>
              {shadow}
            </>
          ) : petImg ? (
            <>
              {/* SVG image: pointer-events="painted" makes transparent pixels truly pass through */}
              <svg
                width={sz}
                height={sz}
                style={{ display: "block", overflow: "visible", pointerEvents: "none" }}
              >
                <image
                  href={petImg}
                  width={sz}
                  height={sz}
                  style={{
                    pointerEvents: "painted",
                    cursor: "pointer",
                    filter: `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.6))`,
                    transform: isHovered ? "scale(1.1)" : "scale(1)",
                    transformOrigin: "center center",
                    transition: "transform 0.15s ease",
                  }}
                  onClick={onClick}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  onTouchStart={() => setIsHovered(true)}
                  onTouchEnd={() => setIsHovered(false)}
                />
              </svg>
              {shadow}
            </>
          ) : (
            <>
              <span
                className="flex items-center justify-center"
                style={{
                  width: sz,
                  height: sz,
                  fontSize: sz * 0.65,
                  cursor: "pointer",
                  pointerEvents: "auto",
                  filter: `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.6))`,
                  ...hoverStyle,
                }}
                onClick={onClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onTouchStart={() => setIsHovered(true)}
                onTouchEnd={() => setIsHovered(false)}
              >
                🐾
              </span>
              {shadow}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AquariumPage({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden"
      style={{ background: "#010810" }}
    >
      <style>{`
        @keyframes aqSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Background image */}
      <img
        src={aquariumBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center center" }}
        draggable={false}
      />

      {/* Subtle dark gradient overlay — top and bottom for legibility */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg, rgba(1,8,16,0.55) 0%, transparent 25%, transparent 72%, rgba(1,8,16,0.6) 100%)",
      }}/>

      {/* Title */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", marginTop: 16, animation: "aqSlideIn 0.5s ease-out" }}>
        <h2 className="font-fantasy text-base tracking-[0.3em]" style={{
          color: "#5eead4",
          textShadow: "0 0 16px rgba(94,234,212,0.7), 0 0 32px rgba(94,234,212,0.3)",
        }}>AQUARIUM</h2>
        <div style={{ height: 1, width: 80, marginTop: 4, background: "linear-gradient(90deg, transparent, rgba(94,234,212,0.5), transparent)" }}/>
      </div>

      {/* Close button */}
      <button
        data-testid="button-close-aquarium"
        onClick={onClose}
        className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-transform active:scale-90"
        style={{
          background: "rgba(2,9,20,0.85)",
          border: "1.5px solid rgba(94,234,212,0.45)",
          color: "#5eead4",
          cursor: "pointer",
          marginTop: "env(safe-area-inset-top, 0px)",
          boxShadow: "0 0 10px rgba(94,234,212,0.2)",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function HouseNavButton({ testId, onClick, label, children }: { testId: string; onClick: () => void; label: string; children: React.ReactNode }) {
  const [tapped, setTapped] = useState(false);
  return (
    <button
      data-testid={testId}
      onClick={() => { setTapped(true); setTimeout(() => setTapped(false), 200); onClick(); }}
      className="flex flex-col items-center gap-1.5"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden transition-transform duration-150"
        style={{
          transform: tapped ? "scale(0.88)" : "scale(1)",
          background: "rgba(8,18,4,0.75)",
          border: "2px solid rgba(212,160,23,0.38)",
          boxShadow: "0 3px 12px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)",
          filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.7))",
        }}
      >
        {children}
      </div>
      <span
        className="font-fantasy text-[8px] tracking-wider"
        style={{ color: "rgba(212,160,23,0.65)" }}
      >
        {label}
      </span>
    </button>
  );
}

function FishbowlIcon() {
  return (
    <img
      src={fishbowlIconImg}
      alt="Aquarium"
      width={46}
      height={46}
      style={{ objectFit: "contain", imageRendering: "auto" }}
      draggable={false}
    />
  );
}

function ForestHomeIcon() {
  return (
    <img
      src={forestHomeIconImg}
      alt="Forest Den"
      width={46}
      height={46}
      style={{ objectFit: "contain", imageRendering: "auto" }}
      draggable={false}
    />
  );
}

function _ForestHomeIconOld() {
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
      <defs>
        <radialGradient id="fhWinGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="22" cy="40" rx="13" ry="2" fill="#0a1f08" opacity="0.55"/>

      {/* Left pine tree */}
      <path d="M7,38 L10.5,28 L14,38 Z" fill="#14532d"/>
      <path d="M8,34 L10.5,26 L13,34 Z" fill="#166534"/>
      <rect x="9.8" y="38" width="1.5" height="2" rx="0.5" fill="#5a3018"/>

      {/* Right pine tree */}
      <path d="M30,38 L33.5,28 L37,38 Z" fill="#14532d"/>
      <path d="M31,34 L33.5,26 L36,34 Z" fill="#166534"/>
      <rect x="32.8" y="38" width="1.5" height="2" rx="0.5" fill="#5a3018"/>

      {/* House body */}
      <rect x="12" y="25" width="20" height="15" rx="1.2" fill="#7c4a1e"/>
      {/* Wood grain lines */}
      <line x1="12" y1="29.5" x2="32" y2="29.5" stroke="#6b3a14" strokeWidth="0.8" opacity="0.5"/>
      <line x1="12" y1="33.5" x2="32" y2="33.5" stroke="#6b3a14" strokeWidth="0.8" opacity="0.5"/>

      {/* Door */}
      <rect x="19.5" y="31" width="5" height="9" rx="2.5" fill="#4a2810"/>
      <circle cx="23.8" cy="36" r="0.7" fill="#f0c040" opacity="0.9"/>

      {/* Left window glow */}
      <rect x="13.5" y="26.5" width="5" height="4.5" rx="1" fill="#f59e0b" opacity="0.22"/>
      <rect x="13.5" y="26.5" width="5" height="4.5" rx="1" fill="none" stroke="#a16207" strokeWidth="0.8"/>
      <line x1="16" y1="26.5" x2="16" y2="31" stroke="#a16207" strokeWidth="0.6"/>
      <line x1="13.5" y1="28.8" x2="18.5" y2="28.8" stroke="#a16207" strokeWidth="0.6"/>

      {/* Right window glow */}
      <rect x="25.5" y="26.5" width="5" height="4.5" rx="1" fill="#f59e0b" opacity="0.22"/>
      <rect x="25.5" y="26.5" width="5" height="4.5" rx="1" fill="none" stroke="#a16207" strokeWidth="0.8"/>
      <line x1="28" y1="26.5" x2="28" y2="31" stroke="#a16207" strokeWidth="0.6"/>
      <line x1="25.5" y1="28.8" x2="30.5" y2="28.8" stroke="#a16207" strokeWidth="0.6"/>

      {/* Chimney */}
      <rect x="25" y="13" width="4.5" height="8" rx="0.5" fill="#5a3018"/>
      <rect x="24.5" y="12" width="5.5" height="2.5" rx="0.8" fill="#6b3a1f"/>
      {/* Smoke wisps */}
      <path d="M27.2,11.5 Q26,9 27.5,7 Q26.5,5 28,3.5" fill="none" stroke="rgba(220,220,200,0.4)" strokeWidth="1.3" strokeLinecap="round"/>

      {/* Roof */}
      <path d="M9,26 L22,9 L35,26 Z" fill="#1c5c1c"/>
      <path d="M22,9 L35,26 L29,26 L22,13 Z" fill="#0f3d0f" opacity="0.45"/>
      <path d="M9,26 L22,9 L35,26" fill="none" stroke="#2d7a2d" strokeWidth="1.2"/>
      {/* Moss on roof edge */}
      <path d="M11,25 Q15,22 19,24.5" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M25,24.5 Q29,22 33,25" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>

      {/* Magic sparkle top */}
      <path d="M5,10 L5.8,7.5 L6.6,10 Z" fill="#f0c040" opacity="0.9"/>
      <path d="M5.8,7 L5.8,10.5" stroke="#f0c040" strokeWidth="0.8" opacity="0.7"/>
      <path d="M4,8.8 L7.6,8.8" stroke="#f0c040" strokeWidth="0.7" opacity="0.5"/>

      {/* Small glowing mushroom */}
      <ellipse cx="10" cy="39.5" rx="2.8" ry="1.4" fill="#dc2626" opacity="0.8"/>
      <rect x="9.4" y="38" width="1.2" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.85"/>
      <circle cx="9.5" cy="39" r="0.4" fill="white" opacity="0.6"/>
      <circle cx="11" cy="38.7" r="0.3" fill="white" opacity="0.5"/>
    </svg>
  );
}

function ForestRoom() {
  return (
    <div className="absolute inset-0" style={{ background: "#1a2a0a" }}>
      <img
        src={petHouseBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center center" }}
        draggable={false}
      />

      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "18%",
          background: "linear-gradient(to bottom, rgba(8,14,5,0.55) 0%, transparent 100%)",
        }}
      />

      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          top: "42%",
          height: "14%",
          background: "linear-gradient(to bottom, transparent 0%, rgba(180,220,140,0.06) 50%, transparent 100%)",
        }}
      />

      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          bottom: 0,
          height: "30%",
          background: "linear-gradient(to top, rgba(20,35,8,0.38) 0%, transparent 100%)",
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.18) 100%)",
        }}
      />
    </div>
  );
}
