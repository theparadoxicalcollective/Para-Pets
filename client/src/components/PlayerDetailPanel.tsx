import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import petHouseIcon from "@assets/icon_pet_house.png";
import RoleBadge from "@/components/RoleBadge";

interface PvpStats {
  wins: number;
  losses: number;
  battlePoints: number;
}

interface PlayerDetailPanelProps {
  userId: string;
  currentUserId?: string;
  onClose: () => void;
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
}

interface EquippedAcc {
  id?: string;
  accessoryInventoryId?: string;
  slot?: number;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
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
        <span key={i} style={{ color: "#f0c040", fontSize: 11, lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${color}44` }}>
      <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
      <span className="font-fantasy" style={{ color: "#f0e8d0", fontSize: 10 }}>{value}</span>
    </div>
  );
}

export default function PlayerDetailPanel({ userId, currentUserId, onClose, pvpStats }: PlayerDetailPanelProps) {
  const { toast } = useToast();
  const isSelf = !!currentUserId && currentUserId === userId;
  const [comingSoon, setComingSoon] = useState(false);
  const [accessoryDetail, setAccessoryDetail] = useState<EquippedAcc | null>(null);

  const { data: profile, isLoading, isError } = useQuery<PublicProfile>({
    queryKey: ["/api/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const { data: friendStatus, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/friends/status", userId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/status/${userId}`, { credentials: "include" });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.friendship ?? null;
    },
    enabled: !isSelf && !!currentUserId,
  });

  const { data: equippedAccessories = [] } = useQuery<EquippedAcc[]>({
    queryKey: ["/api/pet", profile?.activePet?.inventoryId, "accessories/public"],
    queryFn: async () => {
      const res = await fetch(`/api/pet/${profile!.activePet!.inventoryId}/accessories/public`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!profile?.activePet?.inventoryId,
  });

  const { data: badges } = useQuery<Badge[]>({
    queryKey: ["/api/users", userId, "badges"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/badges`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId && !!pvpStats,
  });

  const sendRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/request/${userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      refetchStatus();
      toast({ title: "Friend request sent!" });
    },
    onError: (err: any) => {
      let msg = err?.message ?? "Failed to send request";
      try { msg = JSON.parse(msg.replace(/^\d+:\s*/, ""))?.message ?? msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/accept/${friendStatus?.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      refetchStatus();
      toast({ title: "Friend accepted! 🎉" });
    },
  });

  const cancelOrDeclineMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/friends/${userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      refetchStatus();
    },
  });

  const petImg = profile?.activePet?.hatchedImageUrl || profile?.activePet?.imageUrl;
  const anyMutationPending = sendRequestMutation.isPending || acceptRequestMutation.isPending || cancelOrDeclineMutation.isPending;

  type FriendBtnDef = {
    label: string;
    action: () => void;
    color: string;
    border: string;
    bg: string;
    disabled: boolean;
    pushed: boolean;
  };

  const getFriendBtn = (): FriendBtnDef => {
    if (!friendStatus) return {
      label: "Add Friend", action: () => sendRequestMutation.mutate(),
      color: "#4ade80", border: "rgba(74,222,128,0.55)", bg: "rgba(15,60,30,0.7)",
      disabled: false, pushed: false,
    };
    if (friendStatus.status === "accepted") return {
      label: "Friends", action: () => {},
      color: "rgba(240,192,64,0.5)", border: "rgba(240,192,64,0.15)", bg: "rgba(20,14,0,0.4)",
      disabled: true, pushed: true,
    };
    if (friendStatus.requesterId === currentUserId) return {
      label: "Sent", action: () => cancelOrDeclineMutation.mutate(),
      color: "rgba(127,191,176,0.5)", border: "rgba(127,191,176,0.15)", bg: "rgba(5,20,18,0.4)",
      disabled: false, pushed: true,
    };
    return {
      label: "Accept", action: () => acceptRequestMutation.mutate(),
      color: "#4ade80", border: "rgba(74,222,128,0.55)", bg: "rgba(15,60,30,0.7)",
      disabled: false, pushed: false,
    };
  };
  const fb = getFriendBtn();

  return (
    <div
      data-testid="overlay-player-detail"
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        data-testid="panel-player-detail"
        className="w-full rounded-t-3xl"
        style={{
          position: "relative",
          maxWidth: 480,
          maxHeight: "calc(88*var(--vh))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
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
          <div className="px-5 pb-8 pt-2 flex flex-col gap-4">

            {/* Profile picture + name — centered */}
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl overflow-hidden flex-shrink-0"
                style={{ width: 72, height: 72, border: "2.5px solid #c9a030", boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5)" }}>
                {profile.profileImage ? (
                  <img src={profile.profileImage} alt="" className="w-full h-full object-cover" data-testid="img-player-profile" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}>
                    <span className="font-fantasy text-[#d4a017] text-xl font-bold">
                      {(profile.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <p className="font-fantasy text-lg font-semibold tracking-wide" style={{ color: "#f0c040" }} data-testid="text-player-username">
                  {profile.username}
                </p>
                <RoleBadge isAdmin={profile.isAdmin} isModerator={profile.isModerator} size="sm" />
              </div>
            </div>

            {/* PvP rank stats — shown only from PvP leaderboard */}
            {pvpStats && (
              <div className="rounded-2xl p-3 flex items-stretch justify-around gap-2"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(40,15,80,0.32))", border: "1px solid rgba(167,139,250,0.32)" }}
                data-testid="section-pvp-rank-stats">
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>Wins</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#86efac" }} data-testid="text-pvp-wins">{pvpStats.wins}</span>
                </div>
                <div className="w-px self-stretch" style={{ background: "rgba(167,139,250,0.22)" }} />
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>Losses</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#fca5a5" }} data-testid="text-pvp-losses">{pvpStats.losses}</span>
                </div>
                <div className="w-px self-stretch" style={{ background: "rgba(167,139,250,0.22)" }} />
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="font-fantasy text-[8px] tracking-[0.18em] uppercase" style={{ color: "#a78bfa" }}>BP</span>
                  <span className="font-fantasy text-base font-bold tabular-nums" style={{ color: "#fbbf24" }} data-testid="text-pvp-bp">{Math.max(0, pvpStats.battlePoints)}</span>
                </div>
              </div>
            )}

            {/* Badges — PvP leaderboard only */}
            {pvpStats && badges && badges.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-fantasy text-xs tracking-widest uppercase" style={{ color: "rgba(212,160,23,0.6)" }}>Emblems</p>
                <div className="flex flex-wrap gap-2">
                  {badges.map(badge => (
                    <div key={badge.id} data-testid={`badge-${badge.id}`} className="flex flex-col items-center gap-1" style={{ width: 56 }} title={badge.description || badge.name}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{ background: "linear-gradient(135deg, rgba(40,20,5,0.95), rgba(20,8,0,0.95))", border: "1.5px solid rgba(240,192,64,0.4)", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        {badge.imageUrl ? (
                          <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <img src={petPawIcon} alt="" style={{ width: 24, height: 24, objectFit: "contain", opacity: 0.55 }} />
                        )}
                      </div>
                      <p className="font-fantasy text-[8px] text-center leading-tight" style={{ color: "#a89878", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {badge.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Companion */}
            <div className="flex flex-col gap-3">
              <p className="font-fantasy text-xs tracking-widest uppercase" style={{ color: "rgba(212,160,23,0.6)" }}>
                Active Companion
              </p>

              {profile.activePet ? (
                <>
                  {/* Pet image (large, no box) + info to the right */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 100, height: 100 }} data-testid="img-active-pet">
                      {petImg ? (
                        <img src={petImg} alt="" className="w-full h-full object-contain"
                          style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.75))" }} />
                      ) : (
                        <img src={petPawIcon} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
                      )}
                    </div>

                    {/* Pet name + rarity + stats to the right */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-1">
                      <p className="font-fantasy text-sm font-semibold" style={{ color: "#f0c040" }} data-testid="text-active-pet-name">
                        {profile.activePet.nickname || profile.activePet.name}
                      </p>
                      {profile.activePet.nickname && (
                        <p className="font-fantasy text-[10px]" style={{ color: "rgba(240,192,64,0.5)" }}>
                          ({profile.activePet.name})
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <RarityStars rarity={profile.activePet.rarity} />
                        <span className="font-fantasy text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(127,191,176,0.15)", border: "1px solid rgba(127,191,176,0.3)", color: "#7fbfb0" }}
                          data-testid="text-active-pet-level">
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

                  {/* Equipped accessories — image-only thumbnails, tap for detail */}
                  {equippedAccessories.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "rgba(192,132,252,0.6)" }}>
                        Equipped
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {equippedAccessories.map((acc, i) => (
                          <button
                            key={acc.id ?? acc.accessoryInventoryId ?? i}
                            onClick={() => setAccessoryDetail(acc)}
                            data-testid={`button-acc-${i}`}
                            style={{
                              width: 44, height: 44,
                              padding: 4,
                              borderRadius: 10,
                              background: "rgba(192,132,252,0.1)",
                              border: "1.5px solid rgba(192,132,252,0.3)",
                              cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            {acc.imageUrl ? (
                              <img src={acc.imageUrl} alt={acc.name} style={{ width: 32, height: 32, objectFit: "contain" }} />
                            ) : (
                              <span style={{ fontSize: 18 }}>✦</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-2xl p-5 flex items-center justify-center"
                  style={{ background: "rgba(10,6,0,0.6)", border: "1px dashed rgba(212,160,23,0.15)" }}>
                  <p className="font-fantasy text-xs" style={{ color: "rgba(168,152,120,0.5)" }}>No active companion</p>
                </div>
              )}
            </div>

            {/* Action buttons — hidden when viewing own card */}
            {!isSelf && (
              <div className="flex flex-col gap-2">
                {/* Add Friend / Sent / Friends / Accept */}
                <button
                  data-testid="button-add-friend"
                  onClick={fb.action}
                  disabled={fb.disabled || anyMutationPending}
                  style={{
                    width: "100%", padding: "11px 0", borderRadius: 10,
                    background: fb.pushed ? "rgba(8,8,8,0.55)" : fb.bg,
                    border: `1.5px solid ${fb.border}`,
                    color: fb.color,
                    fontFamily: "Lora, serif", fontSize: 12, letterSpacing: "0.1em",
                    cursor: (fb.disabled || anyMutationPending) ? "default" : "pointer",
                    boxShadow: fb.pushed ? "inset 0 2px 6px rgba(0,0,0,0.6)" : "none",
                    WebkitTapHighlightColor: "transparent",
                    transition: "opacity 0.15s",
                  }}
                >
                  {anyMutationPending ? "…" : fb.label}
                </button>

                {/* Visit Pet Home — uses actual game house icon */}
                <button
                  data-testid="button-visit-pethouse"
                  onClick={() => setComingSoon(true)}
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 10,
                    background: "rgba(15,50,30,0.5)",
                    border: "1.5px solid rgba(74,222,128,0.35)",
                    color: "#86efac",
                    fontFamily: "Lora, serif", fontSize: 12, letterSpacing: "0.1em",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <img src={petHouseIcon} alt="" style={{ width: 20, height: 20, objectFit: "contain", opacity: 0.85 }} />
                  Visit Pet Home
                </button>
              </div>
            )}
          </div>
        )}

        {/* "Coming Soon" popup for Visit Pet Home */}
        {comingSoon && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setComingSoon(false)}
          >
            <div
              style={{ padding: "28px 28px", background: "linear-gradient(160deg, #1c1100 0%, #0e0900 100%)", border: "1.5px solid rgba(212,160,23,0.45)", borderRadius: 16, textAlign: "center", maxWidth: 260 }}
              onClick={e => e.stopPropagation()}
            >
              <img src={petHouseIcon} alt="" style={{ width: 52, height: 52, objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
              <p style={{ color: "#f6dc8a", fontFamily: "Lora, serif", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Coming Soon!</p>
              <p style={{ color: "rgba(212,160,23,0.55)", fontFamily: "Lora, serif", fontSize: 11, marginBottom: 18, lineHeight: 1.5 }}>
                Pet Home visits are under construction. Check back soon!
              </p>
              <button
                onClick={() => setComingSoon(false)}
                style={{ padding: "9px 28px", borderRadius: 8, background: "rgba(212,160,23,0.15)", border: "1px solid rgba(212,160,23,0.4)", color: "#f6dc8a", fontFamily: "Lora, serif", fontSize: 11, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Accessory detail popup — tap outside to close */}
        {accessoryDetail && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setAccessoryDetail(null)}
          >
            <div
              style={{ padding: "24px 24px 20px", background: "linear-gradient(160deg, #1a0f1f 0%, #0e0914 100%)", border: "1.5px solid rgba(192,132,252,0.45)", borderRadius: 16, textAlign: "center", maxWidth: 220, width: "80%" }}
              onClick={e => e.stopPropagation()}
            >
              {accessoryDetail.imageUrl ? (
                <img src={accessoryDetail.imageUrl} alt={accessoryDetail.name}
                  style={{ width: 72, height: 72, objectFit: "contain", margin: "0 auto 10px", display: "block" }} />
              ) : (
                <div style={{ width: 72, height: 72, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 36, color: "rgba(192,132,252,0.5)" }}>✦</span>
                </div>
              )}
              <p style={{ color: "#ddb4ff", fontFamily: "Lora, serif", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                {accessoryDetail.name}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {accessoryDetail.atkBoost ? (
                  <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(251,146,60,0.1)", borderRadius: 6, padding: "4px 10px" }}>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(251,146,60,0.7)" }}>ATK</span>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#fb923c", fontWeight: 700 }}>+{accessoryDetail.atkBoost}</span>
                  </div>
                ) : null}
                {accessoryDetail.defBoost ? (
                  <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(96,165,250,0.1)", borderRadius: 6, padding: "4px 10px" }}>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(96,165,250,0.7)" }}>DEF</span>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>+{accessoryDetail.defBoost}</span>
                  </div>
                ) : null}
                {accessoryDetail.healthBoost ? (
                  <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(248,113,113,0.1)", borderRadius: 6, padding: "4px 10px" }}>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(248,113,113,0.7)" }}>HP</span>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "#f87171", fontWeight: 700 }}>+{accessoryDetail.healthBoost}</span>
                  </div>
                ) : null}
                {!accessoryDetail.atkBoost && !accessoryDetail.defBoost && !accessoryDetail.healthBoost && (
                  <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(192,132,252,0.4)" }}>No stat boosts</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
