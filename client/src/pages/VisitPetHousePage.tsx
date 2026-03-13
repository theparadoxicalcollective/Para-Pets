import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";
import petHouseBg from "@assets/pethouse_bg_new.png";

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
  { wanderIdx: 0, left: "4%",  top: "88%", size: 73, duration: "22s", delay: "0s"   },
  { wanderIdx: 1, left: "62%", top: "83%", size: 61, duration: "25s", delay: "3s"   },
  { wanderIdx: 2, left: "20%", top: "73%", size: 51, duration: "19s", delay: "6s"   },
  { wanderIdx: 3, left: "55%", top: "63%", size: 41, duration: "21s", delay: "1.5s" },
  { wanderIdx: 4, left: "38%", top: "56%", size: 32, duration: "27s", delay: "9s"   },
  { wanderIdx: 5, left: "42%", top: "79%", size: 57, duration: "24s", delay: "4.5s" },
];

function WalkingPetView({ pet, index }: { pet: VisitedPet; index: number }) {
  const cfg = WALK_CONFIGS[index % WALK_CONFIGS.length];
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
          animation: `petWander${cfg.wanderIdx} ${cfg.duration} ${cfg.delay} ease-in-out infinite`,
          transformOrigin: "bottom center",
        }}
      >
        {pet.petTemplateId ? (
          <div>
            <PetAnimator
              petTemplateId={pet.petTemplateId}
              mode="walk"
              size={sz}
              style={{
                filter: `drop-shadow(0 ${Math.round(sz * 0.15)}px ${Math.round(sz * 0.18)}px rgba(0,0,0,0.55))`,
              }}
            />
            {shadow}
          </div>
        ) : (
          <div style={{ animation: `petFloatSmall 3.5s ${cfg.delay} ease-in-out infinite` }}>
            {petImg ? (
              <img
                src={petImg}
                alt=""
                className="pointer-events-none"
                style={{
                  width: sz,
                  height: sz,
                  objectFit: "contain",
                  filter: [
                    `drop-shadow(0 ${Math.round(sz * 0.15)}px ${Math.round(sz * 0.18)}px rgba(0,0,0,0.65))`,
                    "brightness(1.06) saturate(1.1)",
                  ].join(" "),
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
            {shadow}
          </div>
        )}
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
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", background: "#1a2a0a" }}
    >
      <div
        className="relative z-30 flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: "linear-gradient(to bottom, rgba(8,14,5,0.85) 0%, rgba(8,14,5,0.0) 100%)",
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
            {data.username}'s Pet House
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
              Could not enter pet house
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
