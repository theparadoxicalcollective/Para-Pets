import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/generated_images/pet_world_bg.png";

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
}

interface UserPetsResponse {
  username: string;
  pets: VisitedPet[];
}

const WALK_CONFIGS = [
  { wanderIdx: 0, left: "4%",  top: "88%", size: 142, duration: "38s", delay: "0s"  },
  { wanderIdx: 1, left: "58%", top: "83%", size: 122, duration: "42s", delay: "5s"  },
  { wanderIdx: 2, left: "20%", top: "74%", size: 106, duration: "36s", delay: "11s" },
  { wanderIdx: 3, left: "52%", top: "65%", size: 91,  duration: "44s", delay: "2s"  },
  { wanderIdx: 4, left: "34%", top: "57%", size: 79,  duration: "40s", delay: "16s" },
  { wanderIdx: 5, left: "40%", top: "79%", size: 113, duration: "45s", delay: "8s"  },
];

const GROUND_WALK_CONFIGS = [
  { wanderIdx: 0, left: "4%",  top: "91%", size: 142, duration: "38s", delay: "0s"  },
  { wanderIdx: 1, left: "58%", top: "91%", size: 122, duration: "42s", delay: "5s"  },
  { wanderIdx: 2, left: "20%", top: "89%", size: 106, duration: "36s", delay: "11s" },
  { wanderIdx: 3, left: "52%", top: "89%", size: 91,  duration: "44s", delay: "2s"  },
  { wanderIdx: 4, left: "34%", top: "89%", size: 79,  duration: "40s", delay: "16s" },
  { wanderIdx: 5, left: "40%", top: "91%", size: 113, duration: "45s", delay: "8s"  },
];

function WalkingPetView({ pet, index }: { pet: VisitedPet; index: number }) {
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
    (p) => p.partType === "left_wing" || p.partType === "right_wing" || p.partType === "wings" || p.partType === "front_wing" || p.partType === "back_wing"
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

  return (
    <div
      data-testid={`visit-pet-${pet.inventoryId}`}
      className="absolute"
      style={{
        left: cfg.left,
        top: cfg.top,
        marginTop: -sz,
        zIndex: parseInt(cfg.top, 10),
      }}
    >
      <div
        style={{
          animation: `${wanderPrefix}${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`,
          transformOrigin: "bottom center",
        }}
      >
        <div style={{ animation: `${floatAnim} ${hasWings ? "3.2s" : "2.4s"} ${cfg.delay} ${hasWings ? "ease-in-out" : "ease"} infinite` }}>
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

export default function VisitPetHousePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

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
      <div
        className="relative z-30 flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          background: "linear-gradient(to bottom, rgba(8,14,5,0.85) 0%, rgba(8,14,5,0.0) 100%)",
          paddingTop: "max(env(safe-area-inset-top, 0px) + 10px, 48px)",
          paddingBottom: 12,
        }}
      >
        <button
          data-testid="button-back-visit"
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0"
          style={{
            background: "rgba(0,0,0,0.5)",
            border: "1px solid rgba(212,160,23,0.25)",
            color: "#a89878",
          }}
        >
          <ArrowLeft size={16} />
        </button>

        {data && (
          <p
            className="font-fantasy text-sm font-semibold tracking-wide"
            style={{ color: "#f0c040", textShadow: "0 0 12px rgba(240,192,64,0.5)" }}
            data-testid="text-visit-house-owner"
          >
            {data.username}'s Pet World
          </p>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        <ForestRoom />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#8b6a3e] text-xs animate-pulse tracking-widest">
              Opening the door...
            </p>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="font-fantasy text-[#ff6666] text-xs tracking-widest">
              Could not enter pet world
            </p>
          </div>
        )}

        {data && (
          <div className="absolute inset-0 z-10">
            {data.pets.length === 0 ? (
              <div className="w-full h-full flex items-end justify-center pb-16">
                <p
                  className="font-fantasy text-[9px] tracking-wider text-center px-6"
                  style={{ color: "rgba(200,170,100,0.55)" }}
                >
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
      </div>
    </div>
  );
}
