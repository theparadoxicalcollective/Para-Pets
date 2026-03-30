import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/IMG_6459_1774822089433.jpeg";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";

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

interface HousePet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  rarity: number | null;
  petLevel: number;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petTemplateId: string | null;
  posLeft: string | null;
  posTop: string | null;
}

const BG_RATIO = 1920 / 2400;

const FLY_CONFIGS = [
  { wanderIdx: 0, left: "8%",  top: "60%", size: 200, duration: "38s", delay: "0s"  },
  { wanderIdx: 1, left: "55%", top: "52%", size: 190, duration: "42s", delay: "5s"  },
  { wanderIdx: 2, left: "22%", top: "40%", size: 180, duration: "36s", delay: "11s" },
  { wanderIdx: 3, left: "50%", top: "30%", size: 170, duration: "44s", delay: "2s"  },
  { wanderIdx: 4, left: "32%", top: "22%", size: 160, duration: "40s", delay: "16s" },
  { wanderIdx: 5, left: "40%", top: "47%", size: 185, duration: "45s", delay: "8s"  },
];

const GROUND_CONFIGS = [
  { wanderIdx: 0, left: "5%",  top: "88%", size: 210, duration: "28s", delay: "0s"  },
  { wanderIdx: 1, left: "55%", top: "85%", size: 200, duration: "32s", delay: "4s"  },
  { wanderIdx: 2, left: "18%", top: "82%", size: 195, duration: "26s", delay: "9s"  },
  { wanderIdx: 3, left: "48%", top: "90%", size: 210, duration: "30s", delay: "2s"  },
  { wanderIdx: 4, left: "30%", top: "86%", size: 200, duration: "34s", delay: "14s" },
  { wanderIdx: 5, left: "38%", top: "83%", size: 195, duration: "29s", delay: "7s"  },
];

const NUM_WANDER_ANIMS = 6;

function randomGroundConfig() {
  const left   = Math.round(2 + Math.random() * 88);   // 2–90% of full image width
  const top    = Math.round(52 + Math.random() * 40);  // 52–92% — spread across scene
  const size   = Math.round(150 + Math.random() * 60); // 150–210px
  const dur    = (26 + Math.random() * 18).toFixed(1); // 26–44s
  const delay  = (Math.random() * 28).toFixed(1);      // 0–28s spread
  const wIdx   = Math.floor(Math.random() * NUM_WANDER_ANIMS);
  return { left: `${left}%`, top: `${top}%`, size, duration: `${dur}s`, delay: `${delay}s`, wanderIdx: wIdx };
}

function WalkingPetView({ pet, index }: { pet: HousePet; index: number }) {
  const { data: templateData } = useQuery<{ parts: Array<{ partType: string }>; canFly: boolean; facing: string }>({
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

  // Random config computed once on mount so pets scatter on each page open
  const groundCfg = useMemo(() => randomGroundConfig(), []);
  const cfg = hasWings
    ? FLY_CONFIGS[index % FLY_CONFIGS.length]
    : groundCfg;

  const posLeft = cfg.left;
  const posTop  = cfg.top;

  const floatAnim    = hasWings ? "petFloatSmall" : "petGroundFloat";
  const wanderPrefix = hasWings ? "petWander" : "petGroundWander";
  const wanderAnim   = `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`;

  // All ground pets use idle — the wander keyframes already arc Y during movement phases
  const animatorMode: "idle" | "walk" = "idle";

  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const sz = cfg.size;

  return (
    <div
      data-testid={`house-pet-${pet.inventoryId}`}
      className="absolute"
      style={{
        left: posLeft,
        top: posTop,
        marginTop: -sz,
        zIndex: parseInt(posTop, 10),
      }}
    >
      <div style={{ animation: wanderAnim, transformOrigin: "bottom center" }}>
        <div style={hasWings ? { animation: `${floatAnim} 3.2s ease-in-out infinite` } : undefined}>
          {pet.petTemplateId ? (
            <PetAnimator
              petTemplateId={pet.petTemplateId}
              mode={animatorMode}
              size={sz}
            />
          ) : petImg ? (
            <img
              src={petImg}
              alt=""
              className="pointer-events-none"
              style={{
                width: sz,
                height: sz,
                objectFit: "contain",
                filter: "brightness(1.06) saturate(1.1)",
              }}
            />
          ) : (
            <span
              className="pointer-events-none flex items-center justify-center"
              style={{ width: sz, height: sz, fontSize: sz * 0.65 }}
            >
              🐾
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PetHousePage({ user }: PetHousePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [openInventory, setOpenInventory] = useState<"home" | "decor" | null>(null);

  const [panX, setPanX] = useState(0);
  const [imgWidth, setImgWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH / BG_RATIO;
    const min = Math.min(0, containerW - imgW);
    setImgWidth(imgW);
    setPanX(Math.max(min, -(imgW - containerW) / 2));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH / BG_RATIO;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX))));
  }, []);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const { data: petsData } = useQuery<{ username: string; pets: HousePet[] }>({
    queryKey: ["/api/users", user.id, "pets"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const pets = petsData?.pets ?? [];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen-frame overflow-hidden"
      style={{ maxWidth: "768px", margin: "0 auto", touchAction: "none", cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Pannable background */}
      <img
        src={petHouseBg}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: `${panX}px`,
          height: "100%",
          width: "auto",
          maxWidth: "none",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      {/* Ambient gradients */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.45) 100%)" }} />

      {/* Pets layer — moves with background so pets feel part of the scene */}
      {imgWidth > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 5, top: 0, left: `${panX}px`, width: imgWidth, height: "100%" }}
        >
          {pets.map((pet, i) => (
            <WalkingPetView key={pet.inventoryId} pet={pet} index={i} />
          ))}
        </div>
      )}

      {/* TopBar */}
      <div className="absolute inset-0 flex flex-col" style={{ zIndex: 10, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
        </div>
      </div>

      {/* Bottom inventory bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center gap-6 pb-5 pt-3"
        style={{ zIndex: 15, pointerEvents: "auto", background: "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          data-testid="button-home-inventory"
          onClick={() => setOpenInventory(openInventory === "home" ? null : "home")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "home" ? "rgba(120,200,100,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "home" ? "2px solid rgba(120,220,80,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={homeInventoryIcon} alt="Home Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Home
          </span>
        </button>

        <button
          data-testid="button-decor-inventory"
          onClick={() => setOpenInventory(openInventory === "decor" ? null : "decor")}
          className="flex flex-col items-center gap-1 group"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90"
            style={{
              background: openInventory === "decor" ? "rgba(180,120,220,0.35)" : "rgba(0,0,0,0.45)",
              border: openInventory === "decor" ? "2px solid rgba(200,120,255,0.8)" : "2px solid rgba(255,255,255,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              backdropFilter: "blur(6px)",
            }}
          >
            <img src={decorInventoryIcon} alt="Decor Inventory" className="w-12 h-12 object-contain" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-md" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            Decor
          </span>
        </button>
      </div>

      {/* Inventory overlay panels */}
      {openInventory && (
        <div
          className="absolute inset-0 flex flex-col justify-end"
          style={{ zIndex: 20, pointerEvents: "none" }}
        >
          {/* Tap-outside to close */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => { e.stopPropagation(); setOpenInventory(null); }}
          />

          {/* Panel */}
          <div
            className="relative rounded-t-3xl px-5 pt-5 pb-28"
            style={{
              pointerEvents: "auto",
              background: "linear-gradient(180deg, rgba(20,30,20,0.97) 0%, rgba(10,18,10,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
              minHeight: 280,
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <img
                src={openInventory === "home" ? homeInventoryIcon : decorInventoryIcon}
                alt=""
                className="w-10 h-10 object-contain"
              />
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">
                  {openInventory === "home" ? "Home Inventory" : "Decor Inventory"}
                </h2>
                <p className="text-white/50 text-xs">
                  {openInventory === "home"
                    ? "House bundles you own"
                    : "Home decorations you own"}
                </p>
              </div>
            </div>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="text-4xl">{openInventory === "home" ? "🏡" : "🪴"}</span>
              <p className="text-white/40 text-sm text-center">
                {openInventory === "home"
                  ? "No house bundles yet.\nVisit the shop to find some!"
                  : "No decor items yet.\nVisit the shop to find some!"}
              </p>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(u) => setCurrentUser(u)}
        />
      )}
    </div>
  );
}
