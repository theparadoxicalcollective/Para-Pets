import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import profileFrameImg from "@assets/frame_profile.png";
import petHouseIconImg from "@assets/icon_pet_house.png";

interface PlayerDetailPanelProps {
  userId: string;
  onClose: () => void;
}

interface ActivePet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  eggImageUrl: string | null;
  rarity: number | null;
  specialSkill: string | null;
  petLevel: number;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevelPoints: number;
}

interface Accessory {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
}

interface PublicProfile {
  id: string;
  username: string;
  profileImage: string | null;
  activePet: ActivePet | null;
  accessories: Accessory[];
}

function RarityStars({ rarity }: { rarity: number | null }) {
  if (!rarity) return null;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: rarity }).map((_, i) => (
        <span key={i} style={{ color: "#f0c040", fontSize: 10, lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${color}44` }}
    >
      <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
      <span className="font-fantasy" style={{ color: "#f0e8d0", fontSize: 10 }}>{value}</span>
    </div>
  );
}

export default function PlayerDetailPanel({ userId, onClose }: PlayerDetailPanelProps) {
  const [, navigate] = useLocation();

  const { data: profile, isLoading, isError } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const petImg = profile?.activePet?.hatchedImageUrl || profile?.activePet?.imageUrl;

  return (
    <div
      data-testid="overlay-player-detail"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        data-testid="panel-player-detail"
        className="w-full rounded-t-3xl overflow-hidden"
        style={{
          maxWidth: 480,
          maxHeight: "88dvh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #0d0a04 0%, #1a1000 50%, #0a0600 100%)",
          border: "1px solid rgba(212,160,23,0.25)",
          borderBottom: "none",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(212,160,23,0.3)" }} />
        </div>

        {/* Close button */}
        <button
          data-testid="button-close-player-detail"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(212,160,23,0.2)", color: "#a89878" }}
        >
          ✕
        </button>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading...</p>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-16">
            <p className="font-fantasy text-[#ff6666] text-sm">Could not load profile</p>
          </div>
        )}

        {profile && (
          <div className="px-5 pb-8 pt-2 flex flex-col gap-5">
            {/* Profile header */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-20 h-20">
                <img src={profileFrameImg} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />
                <div className="absolute z-10 overflow-hidden rounded-sm" style={{ inset: "11px" }}>
                  {profile.profileImage ? (
                    <img
                      src={profile.profileImage}
                      alt=""
                      className="w-full h-full object-cover"
                      data-testid="img-player-profile"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #2a1a0a, #1a0d00)" }}
                    >
                      <span className="font-fantasy text-[#d4a017] text-xl font-bold">
                        {profile.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <p
                className="font-fantasy text-lg font-semibold tracking-wide"
                style={{ color: "#f0c040" }}
                data-testid="text-player-username"
              >
                {profile.username}
              </p>

              {/* Visit Pet House button */}
              <button
                data-testid="button-visit-pethouse"
                onClick={() => {
                  onClose();
                  navigate(`/visit/${profile.id}`);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-fantasy text-xs tracking-wider transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(30,50,20,0.9), rgba(15,30,10,0.9))",
                  border: "1px solid rgba(134,239,172,0.35)",
                  color: "#86efac",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                }}
              >
                <img src={petHouseIconImg} alt="" className="w-5 h-5 object-contain" />
                Visit Pet House
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.25), transparent)" }} />

            {/* Active pet */}
            <div className="flex flex-col gap-3">
              <p
                className="font-fantasy text-xs tracking-widest uppercase"
                style={{ color: "rgba(212,160,23,0.6)" }}
              >
                Active Companion
              </p>

              {profile.activePet ? (
                <div
                  className="rounded-2xl p-4 flex gap-4 items-start"
                  style={{
                    background: "linear-gradient(135deg, rgba(20,15,5,0.9), rgba(30,20,5,0.8))",
                    border: "1px solid rgba(212,160,23,0.2)",
                  }}
                >
                  {/* Pet image */}
                  <div
                    className="flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                      width: 76,
                      height: 76,
                      background: "rgba(0,0,0,0.5)",
                      border: "1.5px solid rgba(212,160,23,0.2)",
                    }}
                    data-testid="img-active-pet"
                  >
                    {petImg ? (
                      <img src={petImg} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span style={{ fontSize: 36 }}>🐾</span>
                    )}
                  </div>

                  {/* Pet info */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="font-fantasy text-sm font-semibold"
                        style={{ color: "#f0c040" }}
                        data-testid="text-active-pet-name"
                      >
                        {profile.activePet.nickname || profile.activePet.name}
                      </p>
                      {profile.activePet.nickname && (
                        <p className="font-fantasy text-[10px]" style={{ color: "rgba(240,192,64,0.55)" }}>
                          ({profile.activePet.name})
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <RarityStars rarity={profile.activePet.rarity} />
                      <span
                        className="font-fantasy text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(127,191,176,0.15)",
                          border: "1px solid rgba(127,191,176,0.3)",
                          color: "#7fbfb0",
                        }}
                        data-testid="text-active-pet-level"
                      >
                        Lv.{profile.activePet.petLevel}
                      </span>
                    </div>

                    {profile.activePet.specialSkill && (
                      <p className="font-fantasy text-[9px]" style={{ color: "#c084fc" }}>
                        ✦ {profile.activePet.specialSkill}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <StatPill label="HP" value={profile.activePet.petHealth} color="#f87171" />
                      <StatPill label="ATK" value={profile.activePet.petAtk} color="#fb923c" />
                      <StatPill label="DEF" value={profile.activePet.petDef} color="#60a5fa" />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5 flex items-center justify-center"
                  style={{
                    background: "rgba(10,6,0,0.6)",
                    border: "1px dashed rgba(212,160,23,0.15)",
                  }}
                >
                  <p className="font-fantasy text-xs" style={{ color: "rgba(168,152,120,0.5)" }}>
                    No active companion
                  </p>
                </div>
              )}
            </div>

            {/* Accessories */}
            <div className="flex flex-col gap-3">
              <p
                className="font-fantasy text-xs tracking-widest uppercase"
                style={{ color: "rgba(212,160,23,0.6)" }}
              >
                Accessories
              </p>

              {profile.accessories.length === 0 ? (
                <div
                  className="rounded-2xl p-4 flex items-center justify-center"
                  style={{
                    background: "rgba(10,6,0,0.6)",
                    border: "1px dashed rgba(212,160,23,0.15)",
                  }}
                >
                  <p className="font-fantasy text-xs" style={{ color: "rgba(168,152,120,0.5)" }}>
                    No accessories
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.accessories.map(acc => (
                    <div
                      key={acc.inventoryId}
                      data-testid={`accessory-${acc.inventoryId}`}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 56 }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, rgba(30,10,50,0.95), rgba(20,5,35,0.95))",
                          border: "1.5px solid rgba(192,132,252,0.3)",
                        }}
                      >
                        {acc.imageUrl ? (
                          <img src={acc.imageUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span style={{ fontSize: 22 }}>💍</span>
                        )}
                      </div>
                      <p
                        className="font-fantasy text-[8px] text-center leading-tight"
                        style={{ color: "#a89878", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {acc.name}
                      </p>
                      {(acc.atkBoost || acc.defBoost) && (
                        <p className="font-fantasy text-[7px]" style={{ color: "#86efac" }}>
                          {acc.atkBoost ? `+${acc.atkBoost}ATK` : ""}{acc.atkBoost && acc.defBoost ? " " : ""}{acc.defBoost ? `+${acc.defBoost}DEF` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
