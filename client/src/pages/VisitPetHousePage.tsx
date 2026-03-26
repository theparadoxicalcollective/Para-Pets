import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/generated_images/pethouse_bg.png";
import insideRoomBg from "@assets/generated_images/inside_room_bg.png";
import petHouseIconImg from "@assets/icon_pet_house.png";

interface VisitedPet {
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

interface UserPetsResponse {
  username: string;
  pets: VisitedPet[];
}

// Fallback positions used when owner hasn't placed a pet yet — matches PetHousePage sizes
const WALK_CONFIGS = [
  { wanderIdx: 0, left: "8%",  top: "60%", size: 200, duration: "38s", delay: "0s"  },
  { wanderIdx: 1, left: "55%", top: "52%", size: 190, duration: "42s", delay: "5s"  },
  { wanderIdx: 2, left: "22%", top: "40%", size: 180, duration: "36s", delay: "11s" },
  { wanderIdx: 3, left: "50%", top: "30%", size: 170, duration: "44s", delay: "2s"  },
  { wanderIdx: 4, left: "32%", top: "22%", size: 160, duration: "40s", delay: "16s" },
  { wanderIdx: 5, left: "40%", top: "47%", size: 185, duration: "45s", delay: "8s"  },
];

const GROUND_WALK_CONFIGS = [
  { wanderIdx: 0, left: "4%",  top: "91%", size: 220, duration: "38s", delay: "0s"  },
  { wanderIdx: 1, left: "58%", top: "91%", size: 220, duration: "42s", delay: "5s"  },
  { wanderIdx: 2, left: "20%", top: "89%", size: 220, duration: "36s", delay: "11s" },
  { wanderIdx: 3, left: "52%", top: "89%", size: 220, duration: "44s", delay: "2s"  },
  { wanderIdx: 4, left: "34%", top: "89%", size: 220, duration: "40s", delay: "16s" },
  { wanderIdx: 5, left: "40%", top: "91%", size: 220, duration: "45s", delay: "8s"  },
];

function WalkingPetView({ pet, index }: { pet: VisitedPet; index: number }) {
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

  // Match PetHousePage exactly — use canFly field from the template API
  const hasWings = !!(templateData?.canFly);

  const cfg = hasWings
    ? WALK_CONFIGS[index % WALK_CONFIGS.length]
    : GROUND_WALK_CONFIGS[index % GROUND_WALK_CONFIGS.length];

  // Use owner's saved position if available; otherwise fall back to default layout
  const hasSavedPos = !!(pet.posLeft && pet.posTop);
  const posLeft = pet.posLeft ?? cfg.left;
  const posTop  = pet.posTop  ?? cfg.top;

  const floatAnim = hasWings ? "petFloatSmall" : "petGroundFloat";
  const wanderPrefix = hasWings ? "petWander" : "petGroundWander";
  // No wander animation when owner has placed the pet — mirrors PetHousePage behaviour
  const wanderAnim = hasSavedPos
    ? "none"
    : `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`;

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
      data-testid={`visit-pet-${pet.inventoryId}`}
      className="absolute"
      style={{
        left: posLeft,
        top: posTop,
        marginTop: -sz,
        zIndex: parseInt(posTop, 10),
      }}
    >
      <div style={{ animation: wanderAnim, transformOrigin: "bottom center" }}>
        {/* Float animation only for winged pets — matches PetHousePage exactly */}
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
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: "18%", background: "linear-gradient(to bottom, rgba(8,14,5,0.55) 0%, transparent 100%)" }} />
      <div className="absolute pointer-events-none" style={{ left: 0, right: 0, top: "42%", height: "14%", background: "linear-gradient(to bottom, transparent 0%, rgba(180,220,140,0.06) 50%, transparent 100%)" }} />
      <div className="absolute pointer-events-none" style={{ left: 0, right: 0, bottom: 0, height: "30%", background: "linear-gradient(to top, rgba(20,35,8,0.38) 0%, transparent 100%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.18) 100%)" }} />
    </div>
  );
}

function InsideRoomVisit({ onClose, username }: { onClose: () => void; username: string }) {
  return (
    <div className="absolute inset-0 z-40 overflow-hidden" style={{ background: "#0d0a04" }}>
      <img src={insideRoomBg} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center" }} draggable={false} />

      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: "18%", background: "linear-gradient(to bottom, rgba(8,5,2,0.55) 0%, transparent 100%)" }} />
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: "18%", background: "linear-gradient(to top, rgba(8,5,2,0.65) 0%, transparent 100%)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(5,3,1,0.3) 0%, transparent 18%, transparent 82%, rgba(5,3,1,0.3) 100%)" }} />

      {/* Title */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pointer-events-none" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
        <h2 className="font-fantasy text-sm tracking-[0.3em]" style={{ color: "rgba(212,160,23,0.9)", textShadow: "0 0 16px rgba(212,160,23,0.6)" }}>
          {username}'s Room
        </h2>
        <div style={{ height: 1, width: 70, marginTop: 5, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.5), transparent)" }} />
      </div>

      <div className="absolute inset-0 flex items-end justify-center pointer-events-none" style={{ paddingBottom: "18%" }}>
        <p className="font-fantasy text-[10px] tracking-widest text-center px-8 leading-relaxed" style={{ color: "rgba(212,160,23,0.35)" }}>
          Room decoration coming soon
        </p>
      </div>

      {/* Close back to outside */}
      <button
        data-testid="button-close-inside-visit"
        onClick={onClose}
        className="absolute z-50 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
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
        <X size={15} />
      </button>
    </div>
  );
}

export default function VisitPetHousePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [showInsideRoom, setShowInsideRoom] = useState(false);

  const { data, isLoading, isError } = useQuery<UserPetsResponse>({
    queryKey: ["/api/users", userId, "pets"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/pets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pets");
      return res.json();
    },
    enabled: !!userId,
  });

  return (
    <div
      className="relative h-screen-frame w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", background: "#1a2a0a" }}
    >
      {/* HUD — only X to close and Inside button */}
      <div
        className="absolute z-30 left-0 right-0 flex items-center justify-between px-3"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
          paddingBottom: 8,
          background: "linear-gradient(180deg, rgba(8,14,5,0.82) 0%, rgba(8,14,5,0.45) 80%, transparent 100%)",
        }}
      >
        {/* X — close, go back */}
        <button
          data-testid="button-back-visit"
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-transform active:scale-90"
          style={{
            background: "rgba(4,10,6,0.88)",
            border: "1.5px solid rgba(127,255,212,0.35)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.7)",
            color: "#7fffd4",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>

        {/* Owner name — centre */}
        {data && (
          <p
            className="font-fantasy text-xs tracking-widest absolute left-0 right-0 text-center pointer-events-none"
            style={{ color: "rgba(240,192,64,0.85)", textShadow: "0 0 12px rgba(240,192,64,0.4)" }}
            data-testid="text-visit-house-owner"
          >
            {data.username}'s Pet House
          </p>
        )}

        {/* Inside button */}
        <button
          data-testid="button-visit-inside"
          onClick={() => setShowInsideRoom(true)}
          className="flex flex-col items-center gap-0.5 transition-transform active:scale-90"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(4,10,6,0.88)",
            border: "1.5px solid rgba(212,160,23,0.4)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            <img src={petHouseIconImg} alt="Inside" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span className="font-fantasy text-[8px] tracking-widest" style={{ color: "rgba(212,160,23,0.65)" }}>Inside</span>
        </button>
      </div>

      {/* World */}
      <div className="flex-1 relative overflow-hidden">
        <ForestRoom />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">Opening the door...</p>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#ff6666] text-xs tracking-widest">Could not enter pet house</p>
          </div>
        )}

        {data && (
          <div className="absolute inset-0 z-10">
            {data.pets.length === 0 ? (
              <div className="w-full h-full flex items-end justify-center pb-16">
                <p className="font-fantasy text-[9px] tracking-wider text-center px-6" style={{ color: "rgba(200,170,100,0.55)" }}>
                  {data.username} hasn't moved any pets in yet!
                </p>
              </div>
            ) : (
              data.pets.map((pet, i) => (
                <WalkingPetView key={pet.inventoryId} pet={pet} index={i} />
              ))
            )}
          </div>
        )}

        {/* Inside room overlay */}
        {showInsideRoom && (
          <InsideRoomVisit
            onClose={() => setShowInsideRoom(false)}
            username={data?.username ?? ""}
          />
        )}
      </div>
    </div>
  );
}
