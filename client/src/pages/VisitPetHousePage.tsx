import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import petHouseBg from "@assets/pethouse_bg.png";
import petHouseFloor from "@assets/pethouse_floor.png";

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
}

interface UserPetsResponse {
  username: string;
  pets: VisitedPet[];
}

const WALK_CONFIGS = [
  { travelPx: "140px", duration: "8s",   delay: "0s",   startPct: 4,  size: 70, bottomPx: 10,  floatDur: "2.4s", floatDelay: "0s"   },
  { travelPx: "110px", duration: "11s",  delay: "2.8s", startPct: 28, size: 56, bottomPx: 115, floatDur: "2.9s", floatDelay: "0.8s" },
  { travelPx: "150px", duration: "7s",   delay: "4.5s", startPct: 8,  size: 74, bottomPx: 5,   floatDur: "2.1s", floatDelay: "1.4s" },
  { travelPx: "100px", duration: "9s",   delay: "1.5s", startPct: 48, size: 50, bottomPx: 165, floatDur: "3.1s", floatDelay: "0.4s" },
  { travelPx: "130px", duration: "10s",  delay: "3.5s", startPct: 18, size: 62, bottomPx: 60,  floatDur: "2.7s", floatDelay: "1.9s" },
  { travelPx: "120px", duration: "8.5s", delay: "6s",   startPct: 36, size: 54, bottomPx: 130, floatDur: "2.3s", floatDelay: "0.6s" },
];

function WalkingPetView({ pet, index }: { pet: VisitedPet; index: number }) {
  const cfg = WALK_CONFIGS[index % WALK_CONFIGS.length];
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  return (
    <div
      data-testid={`visit-pet-${pet.inventoryId}`}
      className="absolute"
      style={({
        left: `${cfg.startPct}%`,
        bottom: cfg.bottomPx,
        zIndex: index + 1,
        "--pw-dist": cfg.travelPx,
        animation: `petIdleWalk ${cfg.duration} ${cfg.delay} linear infinite`,
      } as any)}
    >
      <div style={{ animation: `petFloat ${cfg.floatDur} ${cfg.floatDelay} ease-in-out infinite` }}>
        {petImg ? (
          <img
            src={petImg}
            alt=""
            className="pointer-events-none"
            style={{
              width: cfg.size,
              height: cfg.size,
              objectFit: "contain",
              filter: [
                `drop-shadow(0 ${Math.round(cfg.size * 0.18)}px ${Math.round(cfg.size * 0.22)}px rgba(0,0,0,0.75))`,
                `drop-shadow(0 4px 6px rgba(0,0,0,0.45))`,
                "brightness(1.08) saturate(1.12)",
              ].join(" "),
            }}
          />
        ) : (
          <span
            className="pointer-events-none flex items-center justify-center"
            style={{ width: cfg.size, height: cfg.size, fontSize: cfg.size * 0.65 }}
          >
            🐾
          </span>
        )}
      </div>

      {/* Ground shadow */}
      <div
        style={{
          width: cfg.size * 0.55,
          height: 6,
          background: "rgba(0,0,0,0.32)",
          borderRadius: "50%",
          margin: "0 auto",
          filter: "blur(4px)",
          animation: `petShadowFloat ${cfg.floatDur} ${cfg.floatDelay} ease-in-out infinite`,
        }}
      />
    </div>
  );
}

function TreehouseRoom() {
  return (
    <div className="absolute inset-0" style={{ background: "#0a0600" }}>
      <img
        src={petHouseBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center 20%" }}
        draggable={false}
      />
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: "22%",
          background: "linear-gradient(to bottom, rgba(5,8,20,0.6) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        className="absolute"
        style={{
          left: 0, right: 0, bottom: 0, height: "56%",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 14%, black 32%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 14%, black 32%)",
        }}
      >
        <img
          src={petHouseFloor}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: "center bottom" }}
          draggable={false}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.22) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.22) 100%)",
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
      style={{ maxWidth: "768px", margin: "0 auto", background: "#0a0600" }}
    >
      {/* Top bar strip */}
      <div
        className="relative z-30 flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: "linear-gradient(to bottom, rgba(5,8,20,0.85) 0%, rgba(5,8,20,0.0) 100%)",
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
            style={{ color: "#f0c040" }}
            data-testid="text-visit-house-owner"
          >
            {data.username}'s Pet House
          </p>
        )}
      </div>

      {/* Room */}
      <div className="flex-1 relative overflow-hidden">
        <TreehouseRoom />

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
          <div className="absolute z-10" style={{ left: 0, right: 0, bottom: 0, height: "70%" }}>
            {data.pets.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center">
                <p
                  className="font-fantasy text-[9px] tracking-wider text-center px-6"
                  style={{ color: "rgba(139,106,62,0.5)" }}
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
