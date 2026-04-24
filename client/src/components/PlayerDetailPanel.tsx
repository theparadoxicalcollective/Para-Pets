import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import petHouseBg from "@assets/generated_images/pet_world_bg.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import houseCottageIcon from "@assets/generated_images/nav_icon_home.png";
import RoleBadge from "@/components/RoleBadge";

// ─────────────────────────────────────────────────────────────────────────────
// PlayerDetailPanel — slim, read-only "tap-on-a-player" card
//
// Per game spec the popup that opens whenever a player taps another player's
// avatar (hub leaderboard, world chat, PvP leaderboard) shows ONLY identity +
// active pet info, plus optional PvP rank stats when the popup was opened
// from the PvP leaderboard. There are intentionally NO friend / message /
// gift buttons here — those interactions now live on the visited player's
// pet-house mailbox so they always happen "in the world" rather than from
// an abstract menu. The single Visit Pet World button is what bridges the
// two places.
// ─────────────────────────────────────────────────────────────────────────────

interface PvpStats {
  wins: number;
  losses: number;
  battlePoints: number;
}

interface PlayerDetailPanelProps {
  userId: string;
  currentUserId?: string;
  onClose: () => void;
  /** When provided, the card adds a Rank Stats row (W/L/BP) and shows the
   *  player's earned emblems (badges). Pass this in from the PvP arena
   *  leaderboard so PvP-only fields don't leak into hub/world popups. */
  pvpStats?: PvpStats;
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
  petTemplateId: string | null;
}

interface PublicProfile {
  id: string;
  username: string;
  profileImage: string | null;
  isAdmin?: boolean;
  isModerator?: boolean;
  activePet: ActivePet | null;
  // accessories still come back from the API but are intentionally not
  // rendered here per the trimmed-popup spec.
  accessories: unknown[];
}

interface Badge {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  awardedAt: string;
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

export default function PlayerDetailPanel({ userId, currentUserId, onClose, pvpStats }: PlayerDetailPanelProps) {
  const [, navigate] = useLocation();
  const isSelf = !!currentUserId && currentUserId === userId;

  const { data: profile, isLoading, isError } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  // Emblems — only fetched when the card is being shown from the PvP
  // leaderboard. For other contexts (hub leaderboard, world chat) the
  // popup intentionally hides badges per the trimmed spec.
  const { data: badges } = useQuery<Badge[]>({
    queryKey: ["/api/users", userId, "badges"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/badges`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId && !!pvpStats,
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
          position: "relative",
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
            {/* Profile header — Name + role badge only */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0"
                style={{
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                }}
              >
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
                    style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}
                  >
                    <span className="font-fantasy text-[#d4a017] text-xl font-bold">
                      {(profile.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-center">
                <p
                  className="font-fantasy text-lg font-semibold tracking-wide"
                  style={{ color: "#f0c040" }}
                  data-testid="text-player-username"
                >
                  {profile.username}
                </p>
                <RoleBadge isAdmin={profile.isAdmin} isModerator={profile.isModerator} size="sm" />
              </div>
            </div>

            {/* PvP rank stats — only present when opened from PvP leaderboard. */}
            {pvpStats && (
              <div
                className="rounded-2xl p-3 flex items-stretch justify-around gap-2"
                style={{
                  background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(40,15,80,0.32))",
                  border: "1px solid rgba(167,139,250,0.32)",
                }}
                data-testid="section-pvp-rank-stats"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>Wins</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#86efac" }} data-testid="text-pvp-wins">
                    {pvpStats.wins}
                  </span>
                </div>
                <div className="w-px self-stretch" style={{ background: "rgba(167,139,250,0.22)" }} />
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>Losses</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#fca5a5" }} data-testid="text-pvp-losses">
                    {pvpStats.losses}
                  </span>
                </div>
                <div className="w-px self-stretch" style={{ background: "rgba(167,139,250,0.22)" }} />
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>BP</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#fbbf24" }} data-testid="text-pvp-bp">
                    {Math.max(0, pvpStats.battlePoints)}
                  </span>
                </div>
              </div>
            )}

            {/* Emblems (badges) — also PvP-only per the spec. */}
            {pvpStats && badges && badges.length > 0 && (
              <div className="flex flex-col gap-2">
                <p
                  className="font-fantasy text-xs tracking-widest uppercase"
                  style={{ color: "rgba(212,160,23,0.6)" }}
                >
                  Emblems
                </p>
                <div className="flex flex-wrap gap-2">
                  {badges.map(badge => (
                    <div
                      key={badge.id}
                      data-testid={`badge-${badge.id}`}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 56 }}
                      title={badge.description || badge.name}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, rgba(40,20,5,0.95), rgba(20,8,0,0.95))",
                          border: "1.5px solid rgba(240,192,64,0.4)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                        }}
                      >
                        {badge.imageUrl ? (
                          <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <img src={petPawIcon} alt="" style={{ width: 24, height: 24, objectFit: "contain", opacity: 0.55 }} />
                        )}
                      </div>
                      <p
                        className="font-fantasy text-[8px] text-center leading-tight"
                        style={{
                          color: "#a89878",
                          maxWidth: 56,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visit Pet World — kept because all message/gift interactions
                now route through the visited player's mailbox. Hidden when
                viewing your own card (the visit button would just take
                you to your own house). */}
            {!isSelf && (
              <button
                data-testid="button-visit-pethouse"
                onClick={() => {
                  onClose();
                  navigate(`/visit/${profile.id}`);
                }}
                className="relative w-full rounded-2xl overflow-hidden flex flex-col items-start justify-end"
                style={{
                  height: 100,
                  border: "1px solid rgba(134,239,172,0.35)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
                }}
              >
                <img
                  src={petHouseBg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: "center 30%" }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(to top, rgba(5,18,3,0.82) 0%, rgba(5,18,3,0.25) 60%, transparent 100%)",
                  }}
                />
                <div className="relative z-10 px-4 pb-3 flex items-center gap-2">
                  <img src={houseCottageIcon} alt="" className="w-7 h-7 object-contain"
                    style={{ filter: "drop-shadow(0 0 6px rgba(134,239,172,0.5))" }} />
                  <p
                    className="font-fantasy text-sm font-semibold tracking-wide"
                    style={{ color: "#86efac", textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
                  >
                    Visit Pet World
                  </p>
                </div>
              </button>
            )}

            {/* Active companion — Pet's name, level, rarity, ATK/DEF/HP. */}
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
                      <img src={petPawIcon} alt="" style={{ width: 44, height: 44, objectFit: "contain" }} />
                    )}
                  </div>

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
          </div>
        )}
      </div>
    </div>
  );
}
