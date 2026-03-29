import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/IMG_6459_1774822089433.jpeg";

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

function WalkingPetView({ pet, index }: { pet: HousePet; index: number }) {
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
    ? FLY_CONFIGS[index % FLY_CONFIGS.length]
    : GROUND_CONFIGS[index % GROUND_CONFIGS.length];

  const posLeft = cfg.left;
  const posTop  = cfg.top;

  const floatAnim    = hasWings ? "petFloatSmall" : "petGroundFloat";
  const wanderPrefix = hasWings ? "petWander" : "petGroundWander";

  const wanderAnim = `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`;

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
            <>
              <PetAnimator
                petTemplateId={pet.petTemplateId}
                mode="idle"
                size={sz}
                style={{
                  filter: `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.5))`,
                }}
              />
              {shadow}
            </>
          ) : petImg ? (
            <>
              <img
                src={petImg}
                alt=""
                className="pointer-events-none"
                style={{
                  width: sz,
                  height: sz,
                  objectFit: "contain",
                  filter: [
                    `drop-shadow(0 ${Math.round(sz * 0.12)}px ${Math.round(sz * 0.15)}px rgba(0,0,0,0.6))`,
                    "brightness(1.06) saturate(1.1)",
                  ].join(" "),
                }}
              />
              {shadow}
            </>
          ) : (
            <>
              <span
                className="pointer-events-none flex items-center justify-center"
                style={{ width: sz, height: sz, fontSize: sz * 0.65 }}
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

export default function PetHousePage({ user }: PetHousePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

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
