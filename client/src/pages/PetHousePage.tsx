import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Star, ShoppingBag, X, HelpCircle } from "lucide-react";
import { fireLevelUp } from "@/lib/levelUpEvents";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetWorldPage from "@/pages/PetWorldPage";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/generated_images/pethouse_bg.png";
import insideRoomBg from "@assets/generated_images/inside_room_bg.png";
import aquariumBg from "@assets/bg_aquarium.png";
import fishbowlIconImg from "@assets/icon_fishbowl.png";
import globeWorldIconImg from "@assets/icon_globe_world.png";
import forestHomeIconImg from "@assets/icon_forest_home.png";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import fishCommonIconPH from "@assets/generated_images/icon_fish_common.png";
import fishInvIconPH from "@assets/icon_fish_inventory.png";

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
  { wanderIdx: 0, left: "8%",  top: "60%", size: 200, duration: "38s", delay: "0s"   },
  { wanderIdx: 1, left: "55%", top: "52%", size: 190, duration: "42s", delay: "5s"   },
  { wanderIdx: 2, left: "22%", top: "40%", size: 180, duration: "36s", delay: "11s"  },
  { wanderIdx: 3, left: "50%", top: "30%", size: 170, duration: "44s", delay: "2s"   },
  { wanderIdx: 4, left: "32%", top: "22%", size: 160, duration: "40s", delay: "16s"  },
  { wanderIdx: 5, left: "40%", top: "47%", size: 185, duration: "45s", delay: "8s"   },
];

const GROUND_WALK_CONFIGS = [
  { wanderIdx: 0, left: "4%",  top: "91%", size: 220, duration: "38s", delay: "0s"   },
  { wanderIdx: 1, left: "58%", top: "91%", size: 220, duration: "42s", delay: "5s"   },
  { wanderIdx: 2, left: "20%", top: "89%", size: 220, duration: "36s", delay: "11s"  },
  { wanderIdx: 3, left: "52%", top: "89%", size: 220, duration: "44s", delay: "2s"   },
  { wanderIdx: 4, left: "34%", top: "89%", size: 220, duration: "40s", delay: "16s"  },
  { wanderIdx: 5, left: "40%", top: "91%", size: 220, duration: "45s", delay: "8s"   },
];

export default function PetHousePage({ user: initialUser }: PetHousePageProps) {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const user = currentUser;
  const [showProfile, setShowProfile] = useState(false);
  const [showPetWorld, setShowPetWorld] = useState(false);
  const [showInsideRoom, setShowInsideRoom] = useState(false);
  const [selectedPet, setSelectedPet] = useState<InventoryPet | null>(null);
  const [showAquarium, setShowAquarium] = useState(false);
  const [draggingEdible, setDraggingEdible] = useState<EdibleItem | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [isOverPet, setIsOverPet] = useState(false);
  const [feedAnim, setFeedAnim] = useState(false);
  const [feedLabel, setFeedLabel] = useState("");
  const [showFeedTutorial, setShowFeedTutorial] = useState(false);
  const [showHomeTutorial, setShowHomeTutorial] = useState(() => !localStorage.getItem("homeTutorialSeen"));
  const petDropRef = useRef<HTMLDivElement>(null);
  const petAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fresh random seed every mount — makes pets appear in new positions each visit
  const sessionSalt = useMemo(() => Math.random(), []);

  const { data: inventory = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: savedPetPositions = [] } = useQuery<{ inventoryId: string; posLeft: string; posTop: string }[]>({
    queryKey: ["/api/pet-house-positions"],
    staleTime: 60000,
  });
  const savedPosMap = useMemo(
    () => new Map(savedPetPositions.map(p => [p.inventoryId, { left: p.posLeft, top: p.posTop }])),
    [savedPetPositions]
  );

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
    onSuccess: (data, variables) => {
      const edible = edibles.find((e) => e.inventoryId === variables.edibleInventoryId);
      setFeedLabel(`+${edible?.statBoostAmount ?? "?"} LVL Points`);
      setFeedAnim(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setTimeout(() => setFeedAnim(false), 2400);
      if (data?.petLevel && selectedPet && data.petLevel > (selectedPet.petLevel || 1)) {
        fireLevelUp(data.petLevel, selectedPet.petNickname || selectedPet.name, selectedPet.petTemplateId);
      }
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
      className="relative h-screen-frame w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", background: "#0a0600" }}
    >
      {/* Background covers the full screen, behind TopBar too */}
      <ForestRoom />

      <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <TopBar user={user} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
      </div>

      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">Loading...</p>
          </div>
        ) : (
          <>
            <div ref={petAreaRef} className="absolute inset-0 z-10">
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
                    sessionSalt={sessionSalt}
                    containerRef={petAreaRef}
                    savedPos={savedPosMap.get(pet.inventoryId) ?? null}
                    onClick={() => {
                      if (selectedPet) return;
                      const seen = localStorage.getItem("feedTutorialSeen");
                      if (!seen) setShowFeedTutorial(true);
                      setSelectedPet(pet);
                    }}
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
            showTutorial={showFeedTutorial}
            onTutorialDismiss={() => {
              localStorage.setItem("feedTutorialSeen", "1");
              setShowFeedTutorial(false);
            }}
            onClose={() => setSelectedPet(null)}
            onEdiblePointerDown={handleEdiblePointerDown}
            onEdiblePointerMove={handleEdiblePointerMove}
            onEdiblePointerUp={handleEdiblePointerUp}
          />
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="relative flex-shrink-0 z-30">
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(180,140,40,0.5) 20%, rgba(212,160,23,0.75) 50%, rgba(180,140,40,0.5) 80%, transparent 100%)",
            boxShadow: "0 0 8px rgba(212,160,23,0.25)",
          }}
        />
        <div
          className="relative w-full nav-bar-height flex items-center justify-evenly px-6"
          style={{
            background: "linear-gradient(180deg, rgba(6,14,3,0) 0%, rgba(6,14,3,0.82) 30%, rgba(4,10,2,0.95) 100%)",
          }}
        >
          <HouseNavButton testId="button-nav-aquarium" onClick={() => setShowAquarium(true)} label="Aquarium">
            <FishbowlIcon />
          </HouseNavButton>
          <HouseNavButton testId="button-nav-inside" onClick={() => setShowInsideRoom(true)} label="Inside">
            <PetHouseNavIcon />
          </HouseNavButton>
          <HouseNavButton testId="button-nav-forest-den" onClick={() => setShowPetWorld(true)} label="Keeper's Central">
            <ForestHomeIcon />
          </HouseNavButton>
        </div>
      </div>

      {showAquarium && (
        <AquariumPage onClose={() => setShowAquarium(false)} userId={user.id} />
      )}

      {showPetWorld && (
        <PetWorldPage user={user} onClose={() => setShowPetWorld(false)} />
      )}

      {showInsideRoom && (
        <InsideRoom onClose={() => setShowInsideRoom(false)} />
      )}

      {showProfile && (
        <UserProfilePanel
          user={user}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}

      {/* ? button — always visible after tutorial is dismissed */}
      {!showHomeTutorial && !selectedPet && (
        <button
          data-testid="button-open-home-tutorial"
          onClick={() => setShowHomeTutorial(true)}
          className="absolute z-30 flex items-center justify-center rounded-full transition-transform active:scale-90"
          style={{
            bottom: "94px",
            right: "14px",
            width: "30px",
            height: "30px",
            background: "rgba(10,25,10,0.82)",
            border: "1.5px solid rgba(180,140,40,0.45)",
            color: "rgba(212,160,23,0.75)",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
          }}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      )}

      {/* Home tutorial overlay */}
      {showHomeTutorial && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center px-5"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl px-5 py-6 flex flex-col gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(8,22,8,0.99) 0%, rgba(4,14,4,0.99) 100%)",
              border: "1.5px solid rgba(180,140,40,0.45)",
              boxShadow: "0 0 50px rgba(180,140,40,0.12), 0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            {/* Close button */}
            <button
              data-testid="button-close-home-tutorial"
              onClick={() => {
                localStorage.setItem("homeTutorialSeen", "1");
                setShowHomeTutorial(false);
              }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "rgba(60,25,5,0.85)",
                border: "1.5px solid rgba(212,160,23,0.35)",
                color: "rgba(212,160,23,0.8)",
                cursor: "pointer",
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <p className="font-fantasy text-[#d4a017] text-base tracking-wider text-center pr-6">Your Pet House</p>

            <div className="flex flex-col gap-3.5">

              {/* Pet interaction */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(180,140,40,0.15)" }}>
                <span className="text-lg flex-shrink-0 mt-0.5">🐾</span>
                <div>
                  <p className="font-fantasy text-[#86efac] text-[11px] tracking-wider mb-0.5">Your Pets</p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Watch your pets roam around! Tap any pet to open the feeding menu and give them edibles to earn level-up points.
                  </p>
                </div>
              </div>

              {/* Aquarium */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(180,140,40,0.15)" }}>
                <img src={fishbowlIconImg} alt="Aquarium" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-fantasy text-[#86efac] text-[11px] tracking-wider mb-0.5">Aquarium  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom left</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Visit your aquarium to view and care for your fish collection.
                  </p>
                </div>
              </div>

              {/* Inside */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(180,140,40,0.15)" }}>
                <img src={forestHomeIconImg} alt="Inside" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-fantasy text-[#86efac] text-[11px] tracking-wider mb-0.5">Inside  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom center</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Step inside your treehouse room. Decorate and personalise it however you like!
                  </p>
                </div>
              </div>

              {/* Keeper's Central */}
              <div className="flex items-start gap-3">
                <img src={globeWorldIconImg} alt="Keeper's Central" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-fantasy text-[#86efac] text-[11px] tracking-wider mb-0.5">Keeper's Central  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom right</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Explore the world, visit shops, go fishing, and discover new pets to bring home.
                  </p>
                </div>
              </div>

            </div>

            <button
              data-testid="button-got-it-home-tutorial"
              onClick={() => {
                localStorage.setItem("homeTutorialSeen", "1");
                setShowHomeTutorial(false);
              }}
              className="mt-1 py-2.5 rounded-full font-fantasy text-sm tracking-widest transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(100,70,5,0.9) 0%, rgba(60,40,3,0.9) 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                color: "#d4a017",
                cursor: "pointer",
              }}
            >
              Got it!
            </button>
          </div>
        </div>
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
              <img src={powerupBagIcon} alt="" style={{ width: 40, height: 40, objectFit: "contain", opacity: 0.9 }} />
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
  showTutorial,
  onTutorialDismiss,
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
  showTutorial: boolean;
  onTutorialDismiss: () => void;
  onClose: () => void;
  onEdiblePointerDown: (e: React.PointerEvent, edible: EdibleItem) => void;
  onEdiblePointerMove: (e: React.PointerEvent) => void;
  onEdiblePointerUp: (e: React.PointerEvent) => void;
}) {
  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const useAnimated = !!pet.petTemplateId;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col animate-slide-up"
      style={{ background: "rgba(4,12,4,0.88)", backdropFilter: "blur(3px)" }}
    >
      {/* Tutorial modal — shown once on first pet click */}
      {showTutorial && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="relative w-full max-w-xs rounded-2xl px-6 py-7 flex flex-col items-center gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(10,30,10,0.98) 0%, rgba(5,18,5,0.98) 100%)",
              border: "1.5px solid rgba(134,239,172,0.45)",
              boxShadow: "0 0 40px rgba(74,222,128,0.15)",
            }}
          >
            <p className="font-fantasy text-[#86efac] text-base tracking-wider text-center">How to Feed</p>
            <div className="flex flex-col gap-3 w-full">
              <div className="flex items-start gap-3">
                <img src={powerupBagIcon} alt="" style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0, marginTop: 2 }} />
                <p className="font-fantasy text-[#c8b896] text-[11px] tracking-wide leading-relaxed">
                  Drag an edible item from the row below and drop it onto your pet.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Star className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#f0c040" }} />
                <p className="font-fantasy text-[#c8b896] text-[11px] tracking-wide leading-relaxed">
                  Each edible gives your pet level-up points. Collect enough points and your pet will level up!
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShoppingBag className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#86efac" }} />
                <p className="font-fantasy text-[#c8b896] text-[11px] tracking-wide leading-relaxed">
                  Buy more edibles from the shop in the world your pet came from.
                </p>
              </div>
            </div>
            <button
              data-testid="button-dismiss-feed-tutorial"
              onClick={onTutorialDismiss}
              className="mt-1 px-8 py-2.5 rounded-full font-fantasy text-sm tracking-widest transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                border: "1px solid rgba(134,239,172,0.45)",
                color: "#86efac",
                cursor: "pointer",
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

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

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 min-h-0">
        <div
          ref={petDropRef}
          data-testid="drop-zone-pet"
          className="relative flex items-center justify-center overflow-visible"
          style={{
            width: "min(100%, 44vh)",
            aspectRatio: "1/1",
            transition: "all 0.15s ease",
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
            data-testid="img-feed-pet"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              overflow: "visible",
            }}
          >
            {useAnimated ? (
              <PetAnimator
                petTemplateId={pet.petTemplateId!}
                mode="idle"
                size={1000}
                className="w-full"
                style={{
                  aspectRatio: "1/1",
                  pointerEvents: "none",
                  filter: isOverPet
                    ? "drop-shadow(0 0 24px rgba(74,222,128,0.9))"
                    : "drop-shadow(0 4px 12px rgba(0,0,0,0.55))",
                  transition: "filter 0.15s ease",
                  animation: isPending ? "petBob 0.4s ease-in-out infinite" : undefined,
                }}
              />
            ) : petImg ? (
              <img
                src={petImg}
                alt=""
                style={{
                  width: 240,
                  height: 240,
                  objectFit: "contain",
                  filter: isOverPet
                    ? "drop-shadow(0 0 24px rgba(74,222,128,0.9))"
                    : "drop-shadow(0 4px 12px rgba(0,0,0,0.55))",
                  transition: "filter 0.15s ease",
                  animation: isPending ? "petBob 0.4s ease-in-out infinite" : undefined,
                }}
              />
            ) : (
              <span className="text-5xl flex items-center justify-center" style={{ width: 240, height: 240 }}>🐾</span>
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
                      <img src={powerupBagIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain", pointerEvents: "none" }} />
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
  sessionSalt,
  containerRef,
  savedPos,
  onClick,
}: {
  pet: InventoryPet;
  index: number;
  sessionSalt: number;
  containerRef: React.RefObject<HTMLDivElement>;
  savedPos: { left: string; top: string } | null;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [ghostXY, setGhostXY] = useState({ x: 0, y: 0 });
  const queryClient = useQueryClient();

  // Use DB-saved position as the source of truth, fallback to sessionStorage
  const storageKey = `petPos_${pet.inventoryId}`;
  const [basePos, setBasePos] = useState<{ left: string; top: string } | null>(() => {
    if (savedPos) return savedPos;
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  // Sync savedPos from parent (DB) into basePos when query loads
  const initialised = useRef(false);
  useEffect(() => {
    if (!initialised.current && savedPos) {
      initialised.current = true;
      setBasePos(savedPos);
    }
  }, [savedPos]);

  // All drag state in a ref so callbacks always see the latest values without
  // needing to be re-created (avoids stale closure issues during pointer capture).
  const drag = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    // Offset from cursor to the pet's top-left corner at grab time.
    // Keeps the exact body pixel under the finger throughout the drag.
    grabOffsetX: 0,
    grabOffsetY: 0,
  });

  const { data: templateData } = useQuery<{ parts: Array<{ partType: string }>; canFly: boolean }>({
    queryKey: ["/api/pet-template-parts", pet.petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${pet.petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!pet.petTemplateId,
    staleTime: 300000,
  });

  const hasWings = !!(templateData?.canFly);

  const cfg = hasWings
    ? WALK_CONFIGS[index % WALK_CONFIGS.length]
    : GROUND_WALK_CONFIGS[index % GROUND_WALK_CONFIGS.length];

  const rng = (n: number) => {
    let h = Math.imul(Math.floor((sessionSalt * 999983 + index * 1337 + n) * 10000), 0x9e3779b9);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };

  const seedLeft = hasWings ? `${5 + rng(1) * 73}%` : `${4 + rng(1) * 63}%`;
  const seedTop  = hasWings ? `${15 + rng(2) * 52}%` : `${87 + rng(2) * 4}%`;

  const posLeft = basePos?.left ?? seedLeft;
  const posTop  = basePos?.top  ?? seedTop;

  // When a pet has been placed, use only the gentle float — no large wander.
  // When free-roaming (no basePos), use the full wander animation.
  const floatAnim    = hasWings ? "petFloatSmall" : "petGroundFloat";
  const wanderPrefix = hasWings ? "petWander" : "petGroundWander";

  // Placed pets get a tiny local drift so they feel alive without leaving their spot.
  const localWanderVariant = index % 6;
  const localWanderDuration = 22 + (index % 4) * 3; // 22 / 25 / 28 / 31 s
  const localWanderDelay   = (index * 4.7) % 18;    // stagger start across pets
  const localWanderAnim    = `petLocalWander${localWanderVariant} ${localWanderDuration}s ${localWanderDelay}s ease-in-out infinite`;

  const wanderAnim = basePos
    ? localWanderAnim
    : `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`;

  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const sz = cfg.size;
  const shadowW = Math.round(sz * 0.52);

  // ── Commit position to state + sessionStorage + DB ─────────────────────
  const commitPos = (clientX: number, clientY: number, ox: number, oy: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const halfSzLeftPct  = (sz * 0.5) / rect.width  * 100;
    const halfSzRightPct = (sz * 0.5) / rect.width  * 100;
    const leftPct = Math.max(-halfSzLeftPct, Math.min(100 - halfSzRightPct, (clientX + ox - rect.left) / rect.width  * 100));
    const topPct  = Math.max(5, Math.min(115, (clientY + oy - rect.top  + sz) / rect.height * 100));
    const pos = { left: `${leftPct.toFixed(1)}%`, top: `${topPct.toFixed(1)}%` };
    setBasePos(pos);
    try { sessionStorage.setItem(storageKey, JSON.stringify(pos)); } catch {}
    // Persist to server so visitors see the same positions
    fetch(`/api/pet-house-positions/${pet.inventoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ posLeft: pos.left, posTop: pos.top }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/pet-house-positions"] });
    }).catch((err) => console.warn("Failed to save pet position:", err));
  };

  // ── Single element handler — rest handled at document level ──────────────
  // Using document-level listeners is the only reliable approach on mobile:
  // setPointerCapture gets cancelled by the browser's scroll detection, firing
  // pointercancel before pointerup and losing the drop position. Document-level
  // listeners receive events regardless of element opacity/visibility/capture.
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const hitRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grabOffsetX = (hitRect.left + hitRect.width  / 2) - sz / 2 - e.clientX;
    const grabOffsetY = (hitRect.top  + hitRect.height / 2) - sz / 2 - e.clientY;

    drag.current = {
      active: true, moved: false, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY,
      grabOffsetX, grabOffsetY,
    };
    setGhostXY({ x: e.clientX, y: e.clientY });
    setIsHovered(true);

    // Fresh closures — capture current sz, grabOffsets, commitPos, onClick
    const pid  = e.pointerId;
    const ox   = grabOffsetX;
    const oy   = grabOffsetY;

    const cleanup = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onUp);
      document.removeEventListener("pointercancel", onCancel);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      drag.current.lastX = ev.clientX;
      drag.current.lastY = ev.clientY;
      if (!drag.current.moved &&
          Math.hypot(ev.clientX - drag.current.startX, ev.clientY - drag.current.startY) > 3) {
        drag.current.moved = true;
        setIsDragging(true);
      }
      if (drag.current.moved) setGhostXY({ x: ev.clientX, y: ev.clientY });
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      cleanup();
      if (drag.current.moved) {
        commitPos(ev.clientX, ev.clientY, ox, oy);
        setIsDragging(false);
      } else {
        onClick();
      }
      drag.current.active = false;
      drag.current.pointerId = -1;
      setIsHovered(false);
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      cleanup();
      // Save wherever the finger last was — even a cancelled drag stays put
      if (drag.current.moved) {
        commitPos(drag.current.lastX, drag.current.lastY, ox, oy);
      }
      drag.current.active = false;
      drag.current.pointerId = -1;
      setIsDragging(false);
      setIsHovered(false);
    };

    document.addEventListener("pointermove",  onMove);
    document.addEventListener("pointerup",    onUp);
    document.addEventListener("pointercancel", onCancel);
  };

  // ── Shared visual renderer ───────────────────────────────────────────────
  const petVisual = (ghost = false) => {
    const filter = ghost
      ? "drop-shadow(0 0 16px rgba(212,160,23,0.85))"
      : `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.5))`;
    const scale = !ghost && isHovered ? "scale(1.12)" : "scale(1)";
    const transition = "transform 0.15s ease";

    if (pet.petTemplateId)
      return <PetAnimator petTemplateId={pet.petTemplateId} mode="idle" size={sz} style={{ filter, transform: scale, transition }} />;
    if (petImg)
      return <img src={petImg} alt="" style={{ width: sz, height: sz, objectFit: "contain", display: "block", filter, transform: scale, transition }} />;
    return <span style={{ fontSize: sz * 0.65, lineHeight: 1, display: "block", filter }}>🐾</span>;
  };

  const shadow = (
    <div style={{
      width: shadowW,
      height: Math.max(3, Math.round(sz * 0.06)),
      background: "rgba(0,0,0,0.25)",
      borderRadius: "50%",
      margin: "0 auto",
      filter: `blur(${Math.max(2, Math.round(sz * 0.05))}px)`,
    }} />
  );

  // Tight oval — smaller than the sprite to reduce overlap-misclicks
  const hitW = Math.round(sz * 0.38);
  const hitH = Math.round(sz * 0.42);

  return (
    <>
      {/* ── Ghost follows the finger during drag (fixed, outside any overflow) ── */}
      {isDragging && (
        <div style={{
          position: "fixed",
          // Offset by the grab point so the exact body pixel that was grabbed
          // stays under the finger — no snapping to center of the bounding box.
          left: ghostXY.x + drag.current.grabOffsetX,
          top:  ghostXY.y + drag.current.grabOffsetY,
          zIndex: 9999,
          pointerEvents: "none",
          opacity: 0.9,
          willChange: "transform",
        }}>
          {petVisual(true)}
        </div>
      )}

      {/* ── Pet in the room ─────────────────────────────────────────────── */}
      <div
        data-testid={`pet-room-${pet.inventoryId}`}
        className="absolute"
        style={{
          left: posLeft,
          top: posTop,
          marginTop: -sz,
          zIndex: parseInt(posTop, 10),
          pointerEvents: "none",
          // Use opacity (not visibility) — keeps pointer capture alive on mobile
          opacity: isDragging ? 0 : 1,
          transition: isDragging ? "none" : "opacity 0.1s",
        }}
      >
        {/* Large wander animation (disabled once pet is pinned) */}
        <div style={{ animation: wanderAnim, transformOrigin: "bottom center" }}>
          {/* Gentle float animation (always on unless dragging) */}
          <div style={hasWings && !isDragging ? { animation: `${floatAnim} 3.2s ease-in-out infinite` } : undefined}>
            {/* Interactive wrapper — pointer events live here, inside the float layer
                so the hit area tracks with wherever the animation puts the pet */}
            <div
              style={{
                position: "relative",
                width: sz,
                height: sz,
                touchAction: "none",   // prevent browser scroll stealing the drag
              }}
            >
              {/* Visual (no pointer events so transparent areas don't intercept) */}
              <div style={{ pointerEvents: "none" }}>
                {petVisual(false)}
              </div>

              {/* Small oval hit zone — avoids nearby-pet misclicks */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: hitW,
                  height: hitH,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  pointerEvents: "auto",
                  cursor: isDragging ? "grabbing" : "grab",
                  touchAction: "none",
                }}
                onPointerDown={onPointerDown}
              />
            </div>
            {shadow}
          </div>
        </div>
      </div>
    </>
  );
}

interface AqCaughtFish {
  id: string;
  shopItemId: string;
  caughtAt: string;
  inAquarium: boolean;
  item: { id: string; name: string; imageUrl: string | null; starRarity: number | null; facingDirection: string | null; fishSwimZone?: string | null } | null;
}

interface AqFishEntry {
  id: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  starRarity: number | null;
  facingDirection: string | null;
  fishSwimZone?: string | null;
}

interface SwimmingFish extends AqFishEntry {
  x: number;
  y: number;
  vx: number;
  wobble: number;
  facingRight: boolean;
  baseSpeed: number;
  state: "normal" | "fast" | "chasing" | "fleeing";
  stateTimer: number;
  chaseTargetId?: string;
}

const AQ_MAX = 30;
const AQ_TEAL = "#5eead4";

function makeSwimmer(entry: AqFishEntry, x?: number, y?: number): SwimmingFish {
  // Assign a random speed tier: ~33% slow, ~33% normal, ~33% fast
  const tier = Math.random();
  const baseSpeed = tier < 0.33
    ? 0.050 + Math.random() * 0.020   // slow
    : tier < 0.67
    ? 0.085 + Math.random() * 0.030   // normal
    : 0.130 + Math.random() * 0.035;  // fast
  const startsRight = entry.facingDirection !== "left";
  // Swim zone: "bottom" = lower quarter of tank (65-82%), "full" = whole tank (14-82%)
  const isBottom = entry.fishSwimZone === "bottom";
  const defaultY = isBottom
    ? 64 + Math.random() * 12   // bottom zone: 64–76%
    : 26 + Math.random() * 44;  // full zone:   26–70% (clear of title gradient + bottom gradient)
  return {
    ...entry,
    x: x ?? (Math.random() * 80),
    y: y ?? defaultY,
    vx: startsRight ? baseSpeed : -baseSpeed,
    wobble: Math.random() * Math.PI * 2,
    facingRight: startsRight,
    baseSpeed,
    state: "normal",
    stateTimer: 60 + Math.floor(Math.random() * 120),
  };
}

export function AquariumPage({ onClose, userId }: { onClose: () => void; userId: string }) {
  const STORAGE_KEY = `aq_fish_${userId}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [aquariumFish, setAquariumFish] = useState<AqFishEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });

  const [swimmers, setSwimmers] = useState<SwimmingFish[]>(() =>
    ((): AqFishEntry[] => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
    })().map(f => makeSwimmer(f))
  );

  const [showPanel, setShowPanel] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<AqFishEntry | null>(null);
  const [dragging, setDragging] = useState<{ fish: AqFishEntry; gx: number; gy: number } | null>(null);
  const draggingRef = useRef<typeof dragging>(null);
  draggingRef.current = dragging;

  // Always-fresh zone lookup used by the animation loop — bypasses state sync lag
  const swimZoneRef = useRef<Map<string, string | null>>(new Map());

  const queryClient = useQueryClient();

  const { data: fishInventory = [] } = useQuery<AqCaughtFish[]>({
    queryKey: ["/api/fishing/inventory"],
    staleTime: 30000,
  });

  const syncAquariumMutation = useMutation({
    mutationFn: async (counts: { shopItemId: string; count: number }[]) => {
      const res = await apiRequest("POST", "/api/fishing/aquarium/sync", { counts });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
    },
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(aquariumFish)); } catch {}
    // Always sync to DB on every change (including mount) so the sell page
    // never sees a stale inAquarium:false for fish that are actually in the tank.
    const counts: { shopItemId: string; count: number }[] = [];
    const countMap = new Map<string, number>();
    for (const f of aquariumFish) {
      countMap.set(f.shopItemId, (countMap.get(f.shopItemId) ?? 0) + 1);
    }
    countMap.forEach((count, shopItemId) => counts.push({ shopItemId, count }));
    syncAquariumMutation.mutate(counts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aquariumFish, STORAGE_KEY]);

  // Sync latest item data from API into the ref and swimmer state whenever inventory loads.
  // We deliberately do NOT update aquariumFish here to avoid triggering the localStorage
  // save → DB sync → invalidate fishInventory infinite loop.
  useEffect(() => {
    if (!fishInventory.length) return;
    // Update the always-fresh ref used by the animation loop
    const newZoneMap = new Map<string, string | null>();
    const itemByShopId = new Map(fishInventory.map(f => [f.shopItemId, f.item]));
    for (const [id, item] of itemByShopId) {
      newZoneMap.set(id, item?.fishSwimZone ?? null);
    }
    swimZoneRef.current = newZoneMap;
    // Also push fresh data into swimmer state so new fish spawn in the right zone
    // and existing fish snap to their correct band immediately
    setSwimmers(prev => prev.map(s => {
      const item = itemByShopId.get(s.shopItemId);
      if (!item) return s;
      const zone = item.fishSwimZone ?? s.fishSwimZone ?? null;
      const isBottom = zone === "bottom";
      const yMin = isBottom ? 61 : 22;
      const yMax = isBottom ? 78 : 71;
      return {
        ...s,
        name: item.name ?? s.name,
        imageUrl: item.imageUrl ?? s.imageUrl,
        starRarity: item.starRarity ?? s.starRarity,
        facingDirection: item.facingDirection ?? s.facingDirection,
        fishSwimZone: zone,
        y: Math.max(yMin, Math.min(yMax, s.y)),
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fishInventory]);

  useEffect(() => {
    setSwimmers(prev => {
      const existingMap = new Map(prev.map(s => [s.id, s]));
      const aquariumIds = new Set(aquariumFish.map(f => f.id));
      const result: SwimmingFish[] = aquariumFish.map(f => {
        const existing = existingMap.get(f.id);
        if (!existing) return makeSwimmer(f);
        // Clamp Y into the visible tank band in case it drifted out of bounds
        const isBottom = (existing.fishSwimZone ?? f.fishSwimZone) === "bottom";
        const yMin = isBottom ? 61 : 22;
        const yMax = isBottom ? 78 : 71;
        return { ...existing, fishSwimZone: f.fishSwimZone, y: Math.max(yMin, Math.min(yMax, existing.y)) };
      });
      return result.filter(s => aquariumIds.has(s.id));
    });
  }, [aquariumFish]);

  useEffect(() => {
    const id = setInterval(() => {
      setSwimmers(prev => {
        // Build position map for chase steering
        const posMap = new Map(prev.map(f => [f.id, { x: f.x, y: f.y }]));

        // Update every fish position and state
        let updated = prev.map(f => {
          let { x, y, vx, wobble, facingRight, baseSpeed, state, stateTimer, chaseTargetId } = f;

          // Tick state timer down
          stateTimer = Math.max(0, stateTimer - 1);

          // State transitions when timer expires
          if (stateTimer === 0) {
            if (state === "chasing") {
              // Chaser turns around and cruises back the way it came
              facingRight = !facingRight;
              vx = (facingRight ? 1 : -1) * baseSpeed;
              state = "normal";
              chaseTargetId = undefined;
              stateTimer = 80 + Math.floor(Math.random() * 120);
            } else if (state === "fleeing") {
              // Prey slows to normal, keeps going same direction
              vx = (facingRight ? 1 : -1) * baseSpeed;
              state = "normal";
              chaseTargetId = undefined;
              stateTimer = 80 + Math.floor(Math.random() * 120);
            } else if (state === "fast") {
              state = "normal";
              vx = (facingRight ? 1 : -1) * baseSpeed;
              stateTimer = 80 + Math.floor(Math.random() * 140);
            } else {
              // Normal: 20% chance of a brief fast burst
              if (Math.random() < 0.20) {
                state = "fast";
                vx = (facingRight ? 1 : -1) * baseSpeed * 1.8;
                stateTimer = 20 + Math.floor(Math.random() * 35);
              } else {
                stateTimer = 100 + Math.floor(Math.random() * 160);
              }
            }
          }

          // Chasing: steer toward prey, but only flip direction when clearly on the other side
          // Dead zone of 2 units prevents oscillation when the two fish are right next to each other
          if (state === "chasing" && chaseTargetId) {
            const target = posMap.get(chaseTargetId);
            if (target) {
              const chaseSpeed = baseSpeed * 1.8;
              const dx = target.x - x;
              if (dx > 2)       { vx = chaseSpeed;  facingRight = true; }
              else if (dx < -2) { vx = -chaseSpeed; facingRight = false; }
              // Within the dead zone: keep current velocity / direction unchanged
            }
          }

          // Fleeing: dart away from the chaser, only update when chaser is clearly to one side
          if (state === "fleeing" && chaseTargetId) {
            const target = posMap.get(chaseTargetId);
            if (target) {
              const fleeSpeed = baseSpeed * 3.4;
              const dx = target.x - x;
              if (dx > 2)       { vx = -fleeSpeed; facingRight = false; }
              else if (dx < -2) { vx = fleeSpeed;  facingRight = true; }
              // Within the dead zone: keep running in current direction
            }
          }

          // Sine wave vertical drift — bottom fish stay near the floor
          wobble = (wobble + 0.032) % (Math.PI * 2);
          const sineY = Math.sin(wobble) * 0.012;
          x += vx;
          // Keep fish in the clearly lit band of the tank.
          // Use swimZoneRef for always-fresh zone data (bypasses state lag).
          const zone = swimZoneRef.current.get(f.shopItemId) ?? f.fishSwimZone ?? null;
          const yMin = zone === "bottom" ? 61 : 22;
          const yMax = zone === "bottom" ? 78 : 71;
          y = Math.max(yMin, Math.min(yMax, y + sineY));

          // Bounce off edges
          if (x < 5)  { x = 5;  vx = Math.abs(vx);  facingRight = true; }
          if (x > 91) { x = 91; vx = -Math.abs(vx); facingRight = false; }

          return { ...f, x, y, vx, wobble, facingRight, baseSpeed, state, stateTimer, chaseTargetId };
        });

        // Rarity-based aggression — higher rarity chases lower; equal rarity: random one chases the other
        // Cap at 1 simultaneous chase so the tank stays calm
        const activeChasers = updated.filter(f => f.state === "chasing").length;
        if (activeChasers < 1) {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].state !== "normal") continue;
            const iRarity = updated[i].starRarity ?? 1;
            // Only 3★+ can initiate a chase
            if (iRarity < 3) continue;

            for (let j = 0; j < updated.length; j++) {
              if (i === j || updated[j].state !== "normal") continue;
              const jRarity = updated[j].starRarity ?? 1;
              // Higher rarity always chases lower; equal rarity: 50% chance of chasing
              if (iRarity < jRarity) continue;
              if (iRarity === jRarity && Math.random() < 0.5) continue;

              const dx = updated[i].x - updated[j].x;
              const dy = (updated[i].y - updated[j].y) * 1.5;
              if (Math.hypot(dx, dy) < 12) {
                // ~0.2% per tick ≈ roughly 10s average while fish stay in range (was 0.5% = ~4s)
                if (Math.random() < 0.002) {
                  // Chase lasts 3–5 seconds (150–250 ticks at 20ms each)
                  const chaseTimer = 150 + Math.floor(Math.random() * 100);
                  updated[i] = { ...updated[i], state: "chasing", chaseTargetId: updated[j].id, stateTimer: chaseTimer };
                  updated[j] = { ...updated[j], state: "fleeing",  chaseTargetId: updated[i].id, stateTimer: chaseTimer };
                }
                break;
              }
            }
          }
        }

        return updated;
      });
    }, 20);
    return () => clearInterval(id);
  }, []);

  const addFish = useCallback((fish: Omit<AqFishEntry, "id">, px?: number, py?: number) => {
    const newId = `${fish.shopItemId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newEntry: AqFishEntry = { ...fish, id: newId };
    let added = false;
    setAquariumFish(prev => {
      if (prev.length >= AQ_MAX) return prev;
      if (prev.filter(f => f.shopItemId === fish.shopItemId).length >= 2) return prev;
      added = true;
      return [...prev, newEntry];
    });
    setSwimmers(s => {
      if (!added || s.some(sw => sw.id === newId)) return s;
      return [...s, makeSwimmer(newEntry, px, py)];
    });
  }, []);

  const removeFish = useCallback((id: string) => {
    setAquariumFish(prev => prev.filter(f => f.id !== id));
  }, []);

  const onFishPointerDown = useCallback((e: React.PointerEvent, fish: Omit<AqFishEntry, "id">) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ fish: { ...fish, id: "drag" }, gx: e.clientX, gy: e.clientY });
  }, []);

  const onContainerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setDragging(d => d ? { ...d, gx: e.clientX, gy: e.clientY } : null);
  }, []);

  const onContainerPointerUp = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      if (py < 78) addFish(d.fish, px, py);
    }
    setDragging(null);
  }, [addFish]);

  const grouped = React.useMemo(() => {
    // Use LOCAL aquariumFish counts so the bag updates immediately on add/remove
    // (no waiting for DB sync round-trip, which can race with the mount sync)
    const aqCounts = new Map<string, number>();
    for (const f of aquariumFish) {
      aqCounts.set(f.shopItemId, (aqCounts.get(f.shopItemId) ?? 0) + 1);
    }
    // For each shopItemId, subtract how many are claimed by the local aquarium
    const remaining = new Map(aqCounts);
    const map = new Map<string, { item: AqCaughtFish["item"]; count: number }>();
    for (const cf of fishInventory) {
      const claimed = remaining.get(cf.shopItemId) ?? 0;
      if (claimed > 0) {
        remaining.set(cf.shopItemId, claimed - 1);
        continue; // This fish is currently in the aquarium
      }
      const ex = map.get(cf.shopItemId);
      if (ex) ex.count++; else map.set(cf.shopItemId, { item: cf.item, count: 1 });
    }
    return Array.from(map.entries());
  }, [fishInventory, aquariumFish]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 overflow-hidden"
      style={{ background: "#010810", touchAction: "none" }}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
    >
      <style>{`
        @keyframes aqSlideIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes aqPanelUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
      `}</style>

      <img src={aquariumBg} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg,rgba(1,8,16,0.55) 0%,transparent 25%,transparent 72%,rgba(1,8,16,0.65) 100%)",
      }}/>

      {/* Swimming fish */}
      {swimmers.map(f => {
        const rarity = f.starRarity ?? 1;
        const fishSize = rarity >= 5 ? 78 : rarity === 4 ? 65 : 54;
        return (
        <button
          key={f.id}
          onClick={() => setPendingRemove(f)}
          title="Tap fish"
          style={{
            position: "absolute",
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: fishSize,
            height: fishSize,
            transform: `translate(-50%,-50%)`,
            background: "none",
            border: "none",
            outline: "none",
            WebkitTapHighlightColor: "transparent",
            cursor: "pointer",
            padding: 0,
            zIndex: 10,
          }}
        >
          {f.imageUrl
            ? <img src={f.imageUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none", transform: ((f.facingDirection !== "left") !== f.facingRight) ? "scaleX(-1)" : undefined }} draggable={false} />
            : <img src={fishCommonIconPH} alt="" style={{ width: 34, height: 34, objectFit: "contain", opacity: 0.7, pointerEvents: "none", userSelect: "none" }} draggable={false} />}
        </button>
        );
      })}

      {/* Title */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ paddingTop: "env(safe-area-inset-top, 16px)", marginTop: 16, animation: "aqSlideIn 0.5s ease-out" }}>
        <h2 className="font-fantasy text-base tracking-[0.3em]" style={{ color: AQ_TEAL, textShadow: "0 0 16px rgba(94,234,212,0.7),0 0 32px rgba(94,234,212,0.3)" }}>AQUARIUM</h2>
        <div style={{ height: 1, width: 80, marginTop: 4, background: "linear-gradient(90deg,transparent,rgba(94,234,212,0.5),transparent)" }}/>
      </div>

      {/* Close */}
      <button
        data-testid="button-close-aquarium"
        onClick={onClose}
        className="absolute z-50 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm active:scale-90 transition-transform"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 12, background: "rgba(2,9,20,0.85)", border: `1.5px solid rgba(94,234,212,0.45)`, color: AQ_TEAL, cursor: "pointer", boxShadow: "0 0 10px rgba(94,234,212,0.2)" }}
      >✕</button>

      {/* Hint when empty */}
      {aquariumFish.length === 0 && !showPanel && (
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: "48%" }}>
          <p className="font-fantasy text-xs text-center tracking-wider px-8 leading-relaxed" style={{ color: "rgba(94,234,212,0.4)" }}>
            Open your fish bag and drag or tap a fish to add it to your aquarium
          </p>
        </div>
      )}

      {/* Fish count */}
      {aquariumFish.length > 0 && (
        <div className="absolute pointer-events-none" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,234,212,0.45)" }}>
            {aquariumFish.length}/{AQ_MAX} fish · tap a fish to release it
          </span>
        </div>
      )}

      {/* Fish bag button */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center z-30"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)", paddingTop: 8 }}>
        <button
          data-testid="button-aquarium-fish-bag"
          onClick={() => setShowPanel(p => !p)}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{
            background: showPanel ? "rgba(94,234,212,0.18)" : "rgba(1,12,30,0.88)",
            border: `2px solid ${showPanel ? "rgba(94,234,212,0.75)" : "rgba(94,234,212,0.38)"}`,
            boxShadow: showPanel ? "0 0 14px rgba(94,234,212,0.35)" : "0 2px 10px rgba(0,0,0,0.6)",
          }}>
            <img src={fishInvIconPH} alt="Fish Bag" style={{ width: 34, height: 34, objectFit: "contain" }} />
          </div>
          <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(94,234,212,0.7)" }}>FISH BAG</span>
        </button>
      </div>

      {/* Fish inventory panel */}
      {showPanel && (
        <div
          className="absolute left-0 right-0 z-40 rounded-t-2xl"
          style={{
            bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 88px)",
            background: "rgba(2,10,24,0.97)",
            border: "1px solid rgba(94,234,212,0.28)",
            backdropFilter: "blur(14px)",
            animation: "aqPanelUp 0.25s ease-out",
            maxHeight: "46vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(94,234,212,0.18)" }}>
            <div>
              <h4 className="font-fantasy text-xs tracking-widest" style={{ color: AQ_TEAL }}>Fish Collection</h4>
              <p className="font-fantasy text-[9px] mt-0.5" style={{ color: "rgba(94,234,212,0.42)" }}>
                {aquariumFish.length}/{AQ_MAX} in aquarium · drag or tap to place
              </p>
            </div>
            <button onClick={() => setShowPanel(false)} style={{ color: "rgba(94,234,212,0.55)", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
          <div className="overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
            {grouped.length === 0 ? (
              <p className="font-fantasy text-[10px] text-center py-6" style={{ color: "rgba(94,234,212,0.38)" }}>
                No fish caught yet — cast your line!
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {grouped.map(([shopItemId, { item, count }]) => {
                  const inTank = aquariumFish.filter(f => f.shopItemId === shopItemId).length;
                  const canAdd = aquariumFish.length < AQ_MAX && inTank < 2;
                  return (
                    <div
                      key={shopItemId}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl select-none"
                      style={{
                        background: inTank > 0 ? "rgba(94,234,212,0.1)" : "rgba(0,0,0,0.28)",
                        border: `1.5px solid ${inTank > 0 ? "rgba(94,234,212,0.45)" : "rgba(94,234,212,0.14)"}`,
                        opacity: canAdd ? 1 : 0.4,
                        touchAction: "none",
                        cursor: canAdd ? "grab" : "default",
                      }}
                      onPointerDown={canAdd ? (e) => onFishPointerDown(e, { shopItemId, name: item?.name || "Fish", imageUrl: item?.imageUrl || null, starRarity: item?.starRarity || null, facingDirection: item?.facingDirection || null, fishSwimZone: item?.fishSwimZone ?? null }) : undefined}
                      onClick={canAdd ? () => addFish({ shopItemId, name: item?.name || "Fish", imageUrl: item?.imageUrl || null, starRarity: item?.starRarity || null, facingDirection: item?.facingDirection || null, fishSwimZone: item?.fishSwimZone ?? null }) : undefined}
                    >
                      <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        {item?.imageUrl
                          ? <img src={item.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          : <img src={fishCommonIconPH} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} />}
                      </div>
                      <span className="font-fantasy text-[8px] text-center leading-tight w-full truncate" style={{ color: "rgba(94,234,212,0.82)" }}>{item?.name || "Unknown"}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-fantasy text-[7px]" style={{ color: "rgba(94,234,212,0.48)" }}>×{count}</span>
                        {inTank > 0 && <span className="font-fantasy text-[7px]" style={{ color: "rgba(94,234,212,0.6)", fontWeight: "bold" }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Return-to-bag confirmation popup */}
      {pendingRemove && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(1,8,16,0.55)", backdropFilter: "blur(3px)" }}
          onClick={() => setPendingRemove(null)}
        >
          <div
            className="rounded-2xl overflow-hidden flex flex-col items-center"
            style={{
              background: "linear-gradient(160deg, rgba(3,14,32,0.98), rgba(2,10,24,0.98))",
              border: "1.5px solid rgba(94,234,212,0.35)",
              boxShadow: "0 0 32px rgba(94,234,212,0.15), 0 8px 32px rgba(0,0,0,0.7)",
              width: 220,
              padding: "22px 20px 18px",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Fish preview */}
            <div style={{ width: 60, height: 60, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center",
              filter: "drop-shadow(0 0 10px rgba(94,234,212,0.5))" }}>
              {pendingRemove.imageUrl
                ? <img src={pendingRemove.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                : <img src={fishCommonIconPH} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.7 }} draggable={false} />}
            </div>

            <p className="font-fantasy text-[11px] tracking-wider text-center mb-1" style={{ color: AQ_TEAL }}>
              {pendingRemove.name}
            </p>
            {pendingRemove.starRarity && pendingRemove.starRarity > 0 && (
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: pendingRemove.starRarity }).map((_, i) => (
                  <span key={i} style={{ fontSize: 12, color: "#f0c040", textShadow: "0 0 6px rgba(240,192,64,0.7)" }}>★</span>
                ))}
              </div>
            )}
            <p className="font-fantasy text-[9px] tracking-widest text-center mb-5" style={{ color: "rgba(94,234,212,0.45)" }}>
              Return this fish to your bag?
            </p>

            <button
              data-testid="button-return-fish-to-bag"
              onClick={() => { removeFish(pendingRemove.id); setPendingRemove(null); }}
              className="w-full rounded-xl py-2.5 font-fantasy text-xs tracking-widest transition-transform active:scale-95 mb-2"
              style={{
                background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(56,189,248,0.18))",
                border: "1.5px solid rgba(94,234,212,0.55)",
                color: AQ_TEAL,
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(94,234,212,0.2)",
              }}
            >
              Return to Bag
            </button>
            <button
              data-testid="button-keep-fish-in-aquarium"
              onClick={() => setPendingRemove(null)}
              className="w-full rounded-xl py-2 font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{
                background: "transparent",
                border: "1px solid rgba(94,234,212,0.18)",
                color: "rgba(94,234,212,0.45)",
                cursor: "pointer",
              }}
            >
              Keep Swimming
            </button>
          </div>
        </div>
      )}

      {/* Drag ghost */}
      {dragging && (
        <div className="fixed pointer-events-none" style={{
          zIndex: 9999,
          left: dragging.gx - 27,
          top: dragging.gy - 27,
          width: 54, height: 54,
          background: "rgba(1,12,30,0.92)",
          border: "2px solid rgba(94,234,212,0.7)",
          borderRadius: 12,
          boxShadow: "0 0 18px rgba(94,234,212,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {dragging.fish.imageUrl
            ? <img src={dragging.fish.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} draggable={false} />
            : <img src={fishCommonIconPH} alt="" style={{ width: 40, height: 40, objectFit: "contain", opacity: 0.7 }} draggable={false} />}
        </div>
      )}
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

function PetHouseNavIcon() {
  return (
    <img
      src={forestHomeIconImg}
      alt="Pet House"
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
      src={globeWorldIconImg}
      alt="Keeper's Central"
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

function InsideRoom({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: "#0d0a04" }}>
      {/* Background */}
      <img
        src={insideRoomBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center" }}
        draggable={false}
      />

      {/* Top vignette */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{
        height: "18%",
        background: "linear-gradient(to bottom, rgba(8,5,2,0.55) 0%, transparent 100%)",
      }} />

      {/* Bottom vignette */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{
        height: "18%",
        background: "linear-gradient(to top, rgba(8,5,2,0.65) 0%, transparent 100%)",
      }} />

      {/* Side vignettes */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(90deg, rgba(5,3,1,0.3) 0%, transparent 18%, transparent 82%, rgba(5,3,1,0.3) 100%)",
      }} />

      {/* Title */}
      <div
        className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <h2
          className="font-fantasy text-sm tracking-[0.3em]"
          style={{
            color: "rgba(212,160,23,0.9)",
            textShadow: "0 0 16px rgba(212,160,23,0.6), 0 0 32px rgba(212,160,23,0.25)",
          }}
        >
          YOUR ROOM
        </h2>
        <div style={{
          height: 1,
          width: 70,
          marginTop: 5,
          background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.5), transparent)",
        }} />
      </div>

      {/* Coming soon placeholder */}
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none"
        style={{ paddingBottom: "18%" }}>
        <p
          className="font-fantasy text-[10px] tracking-widest text-center px-8 leading-relaxed"
          style={{ color: "rgba(212,160,23,0.35)" }}
        >
          Room decoration coming soon
        </p>
      </div>

      {/* Close button */}
      <button
        data-testid="button-close-inside-room"
        onClick={onClose}
        className="absolute z-50 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm active:scale-90 transition-transform"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 12,
          background: "rgba(10,6,2,0.85)",
          border: "1.5px solid rgba(212,160,23,0.45)",
          color: "rgba(212,160,23,0.85)",
          cursor: "pointer",
          boxShadow: "0 0 10px rgba(212,160,23,0.2)",
        }}
      >
        ✕
      </button>
    </div>
  );
}

function ForestRoom() {
  return (
    <div className="absolute inset-0" style={{ background: "#0e1a06" }}>
      {/* Main background scene */}
      <img
        src={petHouseBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center top" }}
        draggable={false}
      />

      {/* Top atmospheric haze */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "20%",
          background: "linear-gradient(to bottom, rgba(6,10,3,0.45) 0%, transparent 100%)",
        }}
      />

      {/* Mid-depth atmospheric light band */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          top: "38%",
          height: "16%",
          background: "linear-gradient(to bottom, transparent 0%, rgba(160,220,100,0.04) 50%, transparent 100%)",
        }}
      />

      {/* Foreground depth: bottom ground shadow to push pets "into" the scene */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          bottom: 0,
          height: "28%",
          background: "linear-gradient(to top, rgba(8,18,3,0.6) 0%, rgba(10,20,4,0.2) 50%, transparent 100%)",
        }}
      />

      {/* Foreground left tree-trunk vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, rgba(4,10,2,0.35) 0%, rgba(4,10,2,0.08) 12%, transparent 26%, transparent 74%, rgba(4,10,2,0.08) 88%, rgba(4,10,2,0.35) 100%)",
        }}
      />

      {/* Foreground ground-level grass overlay strip */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 0, right: 0,
          bottom: 0,
          height: "9%",
          background: "linear-gradient(to top, rgba(14,28,6,0.72) 0%, rgba(20,40,8,0.38) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
