import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, X, Upload, Trash2, ChevronLeft, Pencil } from "lucide-react";
import bgImg from "@assets/bg_home_v2.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import ItemDatabaseSection, { ShopItemFull, ItemPickerModal, getItemEffectText } from "@/components/ItemDatabaseSection";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";
import FishingAdminPanel from "@/components/FishingAdminPanel";
import EnemyDatabasePanel from "@/components/EnemyDatabasePanel";
import HouseBundleAdminPanel from "@/components/HouseBundleAdminPanel";
import adminIconMembers from "@assets/admin_icon_members.png";
import adminIconRewards from "@assets/admin_icon_rewards.png";
import adminIconItems from "@assets/admin_icon_items.png";
import adminIconPets from "@assets/admin_icon_pets.png";
import adminIconMessages from "@assets/admin_icon_messages.png";
import adminIconBadges from "@assets/admin_icon_badges.png";
import adminIconFishing from "@assets/admin_icon_fishing.png";

interface AdminPageProps {
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

interface MemberUser {
  id: string;
  username: string;
  email: string;
  profileImage: string | null;
  coins: number;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

export default function AdminPage({ user }: AdminPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [coinAmounts, setCoinAmounts] = useState<Record<string, string>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"members" | "rewards" | "welcome" | "items" | "pets" | "messages" | "badges" | "fishing" | "enemies" | "house_bundle" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<MemberUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const sortedMembers = [...members].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const banMutation = useMutation({
    mutationFn: async ({ userId, ban }: { userId: string; ban: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/${ban ? "ban" : "unban"}/${userId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "User status changed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const coinsMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: string; amount: number }) => {
      const res = await apiRequest("POST", `/api/admin/coins/${userId}`, { amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Coins Updated", description: "Coins modified successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const handleGiveCoins = (userId: string) => {
    const val = parseInt(coinAmounts[userId] || "0");
    if (!val) return;
    coinsMutation.mutate({ userId, amount: val });
    setCoinAmounts(prev => ({ ...prev, [userId]: "" }));
  };

  const sections = [
    { key: "members" as const, label: "Members", count: members.length, icon: adminIconMembers, desc: "Manage players", color: "#f0c040", glow: "rgba(240,192,64,0.35)", bg: "linear-gradient(145deg, rgba(60,38,8,0.92) 0%, rgba(92,58,20,0.88) 100%)", border: "rgba(212,160,23,0.5)" },
    { key: "rewards" as const, label: "Rewards", icon: adminIconRewards, desc: "Send bundles", color: "#c4b5fd", glow: "rgba(192,132,252,0.35)", bg: "linear-gradient(145deg, rgba(50,18,88,0.92) 0%, rgba(80,28,120,0.88) 100%)", border: "rgba(192,132,252,0.5)" },
    { key: "items" as const, label: "Pets & Items", icon: adminIconPets, desc: "Item database", color: "#fdba74", glow: "rgba(251,146,60,0.30)", bg: "linear-gradient(145deg, rgba(72,32,8,0.92) 0%, rgba(110,52,12,0.88) 100%)", border: "rgba(251,146,60,0.45)" },
    { key: "pets" as const, label: "Animation Parts", icon: adminIconItems, desc: "Pet database", color: "#5eead4", glow: "rgba(94,234,212,0.30)", bg: "linear-gradient(145deg, rgba(8,45,42,0.92) 0%, rgba(14,70,65,0.88) 100%)", border: "rgba(94,234,212,0.45)" },
    { key: "messages" as const, label: "Messages", icon: adminIconMessages, desc: "Support inbox", color: "#fca5a5", glow: "rgba(252,165,165,0.30)", bg: "linear-gradient(145deg, rgba(80,18,18,0.92) 0%, rgba(110,28,28,0.88) 100%)", border: "rgba(252,165,165,0.45)" },
    { key: "badges" as const, label: "Badges", icon: adminIconBadges, desc: "Award badges", color: "#fde68a", glow: "rgba(253,230,138,0.30)", bg: "linear-gradient(145deg, rgba(72,54,0,0.92) 0%, rgba(108,80,0,0.88) 100%)", border: "rgba(253,230,138,0.45)" },
    { key: "fishing" as const, label: "Fishing", icon: adminIconFishing, desc: "Fish & ponds", color: "#93c5fd", glow: "rgba(147,197,253,0.30)", bg: "linear-gradient(145deg, rgba(12,22,60,0.92) 0%, rgba(18,36,90,0.88) 100%)", border: "rgba(147,197,253,0.45)" },
    { key: "welcome" as const, label: "Welcome Bundle", icon: adminIconRewards, desc: "New user gifts", color: "#6ee7b7", glow: "rgba(110,231,183,0.35)", bg: "linear-gradient(145deg, rgba(8,50,35,0.92) 0%, rgba(14,80,55,0.88) 100%)", border: "rgba(110,231,183,0.45)" },
    { key: "enemies" as const, label: "Enemies", icon: adminIconBadges, desc: "Enemy database", color: "#fca5a5", glow: "rgba(239,68,68,0.30)", bg: "linear-gradient(145deg, rgba(60,8,8,0.92) 0%, rgba(90,12,12,0.88) 100%)", border: "rgba(239,68,68,0.45)" },
    { key: "house_bundle" as const, label: "House Bundle", icon: adminIconRewards, desc: "House item bundles", color: "#a5f3fc", glow: "rgba(34,211,238,0.30)", bg: "linear-gradient(145deg, rgba(8,38,50,0.92) 0%, rgba(12,58,75,0.88) 100%)", border: "rgba(34,211,238,0.45)" },
    { key: "purchases" as const, label: "Purchases", icon: adminIconRewards, desc: "Coin shop history", color: "#86efac", glow: "rgba(134,239,172,0.30)", bg: "linear-gradient(145deg, rgba(8,45,18,0.92) 0%, rgba(12,70,28,0.88) 100%)", border: "rgba(134,239,172,0.45)" },
  ];

  const activeSectionMeta = activeSection ? sections.find(s => s.key === activeSection) : null;

  return (
    <div
      className="relative w-full h-screen-frame overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/80 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex-1 overflow-y-auto px-4 py-4">

          {!activeSection ? (
            <>
              {/* Header */}
              <div className="flex flex-col items-center mb-6 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  <div style={{ width: 28, height: 1, background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.5))" }} />
                  <span className="font-fantasy text-[10px] tracking-[0.3em] uppercase" style={{ color: "rgba(240,192,64,0.55)" }}>Realm</span>
                  <div style={{ width: 28, height: 1, background: "linear-gradient(90deg, rgba(240,192,64,0.5), transparent)" }} />
                </div>
                <h2
                  className="font-fantasy text-[#f0c040] text-center text-xl tracking-widest font-semibold"
                  style={{ textShadow: "0 0 24px rgba(240,192,64,0.5), 0 0 8px rgba(240,192,64,0.2)" }}
                >
                  Administration
                </h2>
                <p className="font-fantasy text-center text-[10px] tracking-widest mt-1" style={{ color: "rgba(200,175,120,0.6)" }}>
                  ✦ choose a section to manage ✦
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {sections.map((s) => (
                  <button
                    key={s.key}
                    data-testid={`section-card-${s.key}`}
                    onClick={() => setActiveSection(s.key)}
                    className="flex flex-col items-start gap-3 p-4 rounded-2xl transition-all active:scale-95 text-left relative overflow-hidden"
                    style={{
                      background: s.bg,
                      border: `1.5px solid ${s.border}`,
                      boxShadow: `0 4px 20px rgba(0,0,0,0.45), 0 0 12px ${s.glow}`,
                      cursor: "pointer",
                    }}
                  >
                    {/* Subtle inner glow top-right */}
                    <div style={{
                      position: "absolute", top: 0, right: 0, width: 60, height: 60,
                      background: `radial-gradient(circle at top right, ${s.glow}, transparent 70%)`,
                      pointerEvents: "none",
                    }} />
                    <div className="flex items-start justify-between w-full">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
                        background: "rgba(0,0,0,0.30)",
                        border: `1px solid ${s.border}`,
                        boxShadow: `0 0 12px ${s.glow}`,
                      }}>
                        <img src={s.icon} alt={s.label} className="w-9 h-9 object-contain" style={{ filter: `drop-shadow(0 0 4px ${s.glow})` }} />
                      </div>
                      {s.count !== undefined && (
                        <span className="font-fantasy text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.40)", color: s.color, border: `1px solid ${s.border}` }}>
                          {s.count}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-fantasy text-sm tracking-wider font-semibold" style={{ color: s.color, textShadow: `0 0 8px ${s.glow}` }}>
                        {s.label}
                      </p>
                      <p className="font-fantasy text-[10px] mt-0.5 tracking-wide" style={{ color: "rgba(210,195,165,0.65)" }}>
                        {s.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button
                  data-testid="button-admin-back"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: `1px solid ${activeSectionMeta?.border || "rgba(212,160,23,0.3)"}`,
                    color: activeSectionMeta?.color || "#f0c040",
                    cursor: "pointer",
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="font-fantasy text-[11px] tracking-wider">Back</span>
                </button>
                <div className="flex items-center gap-2">
                  {activeSectionMeta?.icon && (
                    <img src={activeSectionMeta.icon} alt="" className="w-6 h-6 object-contain" style={{ filter: `drop-shadow(0 0 4px ${activeSectionMeta.glow})` }} />
                  )}
                  <h2
                    className="font-fantasy text-base tracking-widest font-semibold"
                    style={{ color: activeSectionMeta?.color || "#f0c040", textShadow: `0 0 12px ${activeSectionMeta?.glow || "rgba(240,192,64,0.3)"}` }}
                  >
                    {activeSectionMeta?.label}
                  </h2>
                </div>
              </div>

              {activeSection === "members" && (
            isLoading ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Summoning records...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedMembers.map((member, index) => {
                  const rank = index + 1;
                  const isExpanded = expandedUser === member.id;
                  const rankColor = rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : "#a89878";

                  return (
                    <div
                      key={member.id}
                      data-testid={`card-member-${member.id}`}
                      className="rounded-lg overflow-hidden"
                      style={{
                        background: member.isBanned
                          ? "linear-gradient(135deg, rgba(80,10,10,0.7) 0%, rgba(40,5,5,0.7) 100%)"
                          : "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(50,30,10,0.85) 100%)",
                        border: member.isBanned
                          ? "1px solid rgba(200,50,50,0.4)"
                          : "1px solid rgba(212,160,23,0.3)",
                      }}
                    >
                      <button
                        data-testid={`button-expand-${member.id}`}
                        onClick={() => setExpandedUser(isExpanded ? null : member.id)}
                        className="w-full flex items-center gap-3 p-3"
                        style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <div
                          className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center font-fantasy font-bold text-xs"
                          style={{
                            background: rank <= 3
                              ? `radial-gradient(ellipse at center, ${rankColor}33 0%, transparent 70%)`
                              : "rgba(0,0,0,0.3)",
                            border: `1px solid ${rankColor}66`,
                            color: rankColor,
                          }}
                        >
                          {rank}
                        </div>

                        <button
                          data-testid={`button-view-player-${member.id}`}
                          onClick={e => { e.stopPropagation(); setViewingUserId(member.id); }}
                          className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden focus:outline-none"
                          style={{
                            padding: 0,
                            cursor: "pointer",
                            border: "2.5px solid #c9a030",
                            boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                            background: "none",
                          }}
                        >
                          {member.profileImage ? (
                            <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}>
                              <span className="font-fantasy text-[#d4a017] text-xs font-bold">{(member.username ?? "?").charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-fantasy text-[#f0c040] text-sm font-semibold truncate" data-testid={`text-member-name-${member.id}`}>
                              {member.username}
                            </p>
                            {member.isAdmin && <span className="text-yellow-400 text-xs">&#9733;</span>}
                            {member.isBanned && (
                              <span className="font-fantasy text-[#ff6666] text-[10px] tracking-wider">BANISHED</span>
                            )}
                          </div>
                          <p className="text-[#a89878] text-[10px] truncate">{member.email}</p>
                        </div>

                      </button>

                      {isExpanded && !member.isAdmin && (
                        <div
                          className="px-3 pb-3 pt-1 flex items-center gap-2 flex-wrap"
                          style={{ borderTop: "1px solid rgba(212,160,23,0.15)" }}
                        >
                          <button
                            data-testid={`button-ban-${member.id}`}
                            onClick={() => banMutation.mutate({ userId: member.id, ban: !member.isBanned })}
                            disabled={banMutation.isPending}
                            className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                            style={{
                              background: member.isBanned
                                ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)"
                                : "linear-gradient(135deg, rgba(139,0,0,0.6) 0%, rgba(80,0,0,0.6) 100%)",
                              border: member.isBanned
                                ? "1px solid rgba(45,154,100,0.5)"
                                : "1px solid rgba(200,50,50,0.4)",
                              color: member.isBanned ? "#7fffd4" : "#ff9999",
                              cursor: "pointer",
                            }}
                          >
                            {member.isBanned ? "Unbanish" : "Banish"}
                          </button>

                          <div className="flex items-center gap-1 flex-1">
                            <input
                              data-testid={`input-coins-${member.id}`}
                              type="number"
                              placeholder="±coins"
                              value={coinAmounts[member.id] || ""}
                              onChange={(e) => setCoinAmounts(prev => ({ ...prev, [member.id]: e.target.value }))}
                              className="w-20 px-2 py-1.5 rounded-md font-sans text-xs outline-none"
                              style={{
                                background: "rgba(242,232,208,0.9)",
                                border: "1px solid #8b5e3c",
                                color: "#2a1a0a",
                              }}
                            />
                            <button
                              data-testid={`button-give-coins-${member.id}`}
                              onClick={() => handleGiveCoins(member.id)}
                              disabled={coinsMutation.isPending || !coinAmounts[member.id]}
                              className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                              style={{
                                background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                                border: "1px solid rgba(212,160,23,0.5)",
                                color: "#f0c040",
                                cursor: "pointer",
                              }}
                            >
                              Give
                            </button>
                          </div>
                        </div>
                      )}

                      {isExpanded && member.isAdmin && (
                        <div
                          className="px-3 pb-3 pt-1"
                          style={{ borderTop: "1px solid rgba(212,160,23,0.15)" }}
                        >
                          <p className="font-fantasy text-[#7fbfb0] text-[10px] tracking-wider">Realm Administrator</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

              {activeSection === "rewards" && (
                <RewardBundleSection members={members.filter(m => !m.isAdmin)} />
              )}

              {activeSection === "items" && (
                <ItemDatabaseSection />
              )}

              {activeSection === "pets" && (
                <PetDatabasePanel />
              )}

              {activeSection === "messages" && (
                <SupportMessagesSection />
              )}

              {activeSection === "badges" && (
                <BadgeDatabaseSection members={members.filter(m => !m.isAdmin)} />
              )}

              {activeSection === "fishing" && (
                <FishingAdminPanel />
              )}

              {activeSection === "enemies" && (
                <EnemyDatabasePanel />
              )}

              {activeSection === "welcome" && (
                <WelcomeBundleSection />
              )}

              {activeSection === "house_bundle" && (
                <HouseBundleAdminPanel />
              )}

              {activeSection === "purchases" && (
                <CoinPurchasesSection />
              )}
            </>
          )}
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}

      {viewingUserId && (
        <PlayerDetailPanel
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
        />
      )}
    </div>
  );
}


interface CoinPurchaseRow {
  id: string;
  userId: string;
  username: string;
  email: string;
  amountUsd: number;
  coinsReceived: number;
  stripeSessionId: string;
  createdAt: string;
}

function CoinPurchasesSection() {
  const { data: purchases = [], isLoading } = useQuery<CoinPurchaseRow[]>({
    queryKey: ["/api/admin/coin-purchases"],
  });

  const totalUsd = purchases.reduce((s, p) => s + p.amountUsd, 0);
  const totalCoins = purchases.reduce((s, p) => s + p.coinsReceived, 0);

  const byUser: Record<string, { username: string; email: string; totalUsd: number; totalCoins: number; count: number }> = {};
  for (const p of purchases) {
    if (!byUser[p.userId]) byUser[p.userId] = { username: p.username, email: p.email, totalUsd: 0, totalCoins: 0, count: 0 };
    byUser[p.userId].totalUsd += p.amountUsd;
    byUser[p.userId].totalCoins += p.coinsReceived;
    byUser[p.userId].count += 1;
  }
  const userRows = Object.entries(byUser).sort((a, b) => b[1].totalUsd - a[1].totalUsd);

  if (isLoading) return (
    <div className="flex items-center justify-center h-32">
      <p className="font-fantasy text-xs tracking-wider animate-pulse" style={{ color: "#86efac" }}>Loading purchases...</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 px-1">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total Revenue", value: `$${totalUsd.toFixed(2)}` },
          { label: "Coins Sold", value: totalCoins.toLocaleString() },
          { label: "Transactions", value: purchases.length },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(134,239,172,0.08)", border: "1px solid rgba(134,239,172,0.2)" }}>
            <p className="font-fantasy text-[9px] tracking-widest uppercase mb-1" style={{ color: "#4ade80" }}>{stat.label}</p>
            <p className="font-fantasy text-base" style={{ color: "#86efac" }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {userRows.length === 0 ? (
        <p className="font-fantasy text-xs text-center py-8" style={{ color: "#4a7060" }}>No purchases yet</p>
      ) : (
        <>
          <p className="font-fantasy text-[9px] tracking-widest uppercase" style={{ color: "#4a7060" }}>By Player</p>
          <div className="flex flex-col gap-2">
            {userRows.map(([userId, info]) => (
              <div key={userId} className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(134,239,172,0.15)" }}>
                <div className="flex flex-col min-w-0">
                  <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: "#86efac" }}>{info.username}</p>
                  <p className="font-fantasy text-[9px] truncate" style={{ color: "#4a7060" }}>{info.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-fantasy text-[10px]" style={{ color: "#4ade80" }}>${info.totalUsd.toFixed(2)}</p>
                    <p className="font-fantasy text-[9px]" style={{ color: "#4a7060" }}>{info.count} purchase{info.count !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <img src={coinIconImg} alt="coins" style={{ width: 13, height: 13, objectFit: "contain" }} />
                    <p className="font-fantasy text-[10px]" style={{ color: "#f0c040" }}>{info.totalCoins.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="font-fantasy text-[9px] tracking-widest uppercase mt-2" style={{ color: "#4a7060" }}>Recent Transactions</p>
          <div className="flex flex-col gap-1.5">
            {purchases.slice(0, 50).map(p => (
              <div key={p.id} className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(134,239,172,0.1)" }}>
                <div className="flex flex-col min-w-0">
                  <p className="font-fantasy text-[10px] tracking-wide truncate" style={{ color: "#86efac" }}>{p.username}</p>
                  <p className="font-fantasy text-[8px]" style={{ color: "#4a7060" }}>{new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-fantasy text-[10px]" style={{ color: "#4ade80" }}>${p.amountUsd.toFixed(2)}</p>
                  <div className="flex items-center gap-1">
                    <img src={coinIconImg} alt="coins" style={{ width: 11, height: 11, objectFit: "contain" }} />
                    <p className="font-fantasy text-[10px]" style={{ color: "#f0c040" }}>{p.coinsReceived.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface WelcomeConfigItem { name: string; qty: number; found: boolean; imageUrl: string | null; type: string | null; effect: string | null; }
interface WelcomeConfig { coinAmount: number; message: string; items: WelcomeConfigItem[]; }

function WelcomeBundleSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coinAmount, setCoinAmount] = useState("500");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<WelcomeConfigItem[]>([]);
  const [qtyEdits, setQtyEdits] = useState<Record<number, string>>({});
  const [showPicker, setShowPicker] = useState(false);

  const { data: config, isLoading } = useQuery<WelcomeConfig>({
    queryKey: ["/api/admin/welcome-bundle"],
  });

  const { data: allShopItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  useEffect(() => {
    if (config) {
      setCoinAmount(String(config.coinAmount));
      setMessage(config.message);
      setItems(config.items);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        coinAmount: Number(coinAmount) || 0,
        message,
        items: items.map((item, i) => ({ name: item.name, qty: Number(qtyEdits[i] ?? item.qty) || 1 })),
      };
      const res = await apiRequest("PUT", "/api/admin/welcome-bundle", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved!", description: "Welcome bundle updated for all future new users." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-bundle"] });
    },
    onError: () => toast({ title: "Save Failed", variant: "destructive" }),
  });

  const addItem = (shopItem: ShopItemFull) => {
    const exists = items.findIndex(i => i.name.toLowerCase() === shopItem.name.toLowerCase());
    if (exists >= 0) {
      const current = Number(qtyEdits[exists] ?? items[exists].qty) || 1;
      setQtyEdits(prev => ({ ...prev, [exists]: String(current + 1) }));
    } else {
      setItems(prev => [...prev, { name: shopItem.name, qty: 1, found: true, imageUrl: shopItem.imageUrl || null, type: shopItem.type, effect: getItemEffectText(shopItem) }]);
    }
    setShowPicker(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setQtyEdits(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => { const n = Number(k); if (n < index) next[n] = v; else if (n > index) next[n - 1] = v; });
      return next;
    });
  };

  const inputStyle = { background: "rgba(12,20,12,0.8)", border: "1px solid rgba(110,231,183,0.35)", color: "#d4f0e0" };

  if (isLoading) return <div className="text-center py-8 font-fantasy text-[#6ee7b7] text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, rgba(8,40,25,0.6) 0%, rgba(5,25,15,0.6) 100%)", border: "1px solid rgba(110,231,183,0.35)" }}>
        <h3 className="font-fantasy text-[#6ee7b7] text-sm tracking-wider mb-1">New User Welcome Bundle</h3>
        <p className="font-fantasy text-[#4a7a60] text-[10px] mb-4">Configure what every new player receives when they first join the realm.</p>

        {/* Coins */}
        <div className="mb-3">
          <label className="font-fantasy text-[#6ee7b7] text-[10px] tracking-wider block mb-1">Starting Coins</label>
          <input
            data-testid="input-welcome-coins"
            type="number"
            value={coinAmount}
            onChange={e => setCoinAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {/* Message */}
        <div className="mb-4">
          <label className="font-fantasy text-[#6ee7b7] text-[10px] tracking-wider block mb-1">Welcome Message</label>
          <textarea
            data-testid="input-welcome-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {/* Items list */}
        <label className="font-fantasy text-[#6ee7b7] text-[10px] tracking-wider block mb-2">Items Included</label>
        <div className="space-y-2 mb-3">
          {items.length === 0 && (
            <p className="font-fantasy text-[#3a6050] text-[10px] text-center py-2">No items yet — add some below</p>
          )}
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: "rgba(10,30,20,0.7)", border: item.found === false ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(110,231,183,0.2)" }}>
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.name} className="w-7 h-7 object-contain rounded flex-shrink-0" />
                : <div className="w-7 h-7 rounded flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(110,231,183,0.1)" }}><span className="text-[8px] text-[#6ee7b7]">?</span></div>
              }
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-fantasy text-[11px] truncate" style={{ color: item.found === false ? "#f87171" : "#c0e8d0" }}>
                  {item.name}{item.found === false && " ⚠ not found"}
                </span>
                {item.effect && (
                  <span className="font-fantasy text-[9px] truncate" style={{ color: "rgba(110,231,183,0.55)" }}>{item.effect}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-fantasy text-[9px] text-[#4a8060]">qty</span>
                <input
                  type="number"
                  min={1}
                  value={qtyEdits[i] ?? item.qty}
                  onChange={e => setQtyEdits(prev => ({ ...prev, [i]: e.target.value }))}
                  className="w-10 px-1 py-0.5 rounded text-center font-sans text-xs outline-none"
                  style={{ background: "rgba(20,50,35,0.8)", border: "1px solid rgba(110,231,183,0.3)", color: "#c0e8d0" }}
                  data-testid={`input-welcome-item-qty-${i}`}
                />
              </div>
              <button
                data-testid={`button-remove-welcome-item-${i}`}
                onClick={() => removeItem(i)}
                className="w-6 h-6 flex items-center justify-center rounded-full transition-transform active:scale-90"
                style={{ background: "rgba(80,20,20,0.7)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", cursor: "pointer" }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Add item button */}
        <button
          data-testid="button-welcome-add-item"
          onClick={() => setShowPicker(true)}
          className="w-full py-1.5 rounded-md font-fantasy text-xs tracking-wider mb-4 transition-transform active:scale-95"
          style={{ background: "rgba(10,40,25,0.8)", border: "1px dashed rgba(110,231,183,0.45)", color: "#6ee7b7", cursor: "pointer" }}
        >
          + Add Item
        </button>

        {/* Save */}
        <button
          data-testid="button-save-welcome-bundle"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full py-2.5 rounded-full font-fantasy text-sm tracking-widest transition-transform active:scale-95"
          style={{ background: "linear-gradient(135deg, rgba(20,100,60,0.9) 0%, rgba(10,60,35,0.9) 100%)", border: "1px solid rgba(110,231,183,0.6)", color: "#6ee7b7", cursor: "pointer" }}
        >
          {saveMutation.isPending ? "Saving..." : "Save Welcome Bundle"}
        </button>
      </div>

      {showPicker && (
        <ItemPickerModal
          items={allShopItems}
          onSelect={addItem}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function RewardBundleSection({ members }: { members: MemberUser[] }) {
  const [bundleName, setBundleName] = useState("");
  const [bundleMessage, setBundleMessage] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<ShopItemFull[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "select">("select");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showItemPicker, setShowItemPicker] = useState(false);
  const { toast } = useToast();

  const { data: allShopItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: bundleName.trim(),
        message: bundleMessage.trim() || undefined,
        coinAmount: parseInt(coinAmount) || 0,
        shopItemIds: selectedItems.map(i => i.id),
      };
      if (targetMode === "select") {
        payload.targetUserIds = selectedUserIds;
      }
      const res = await apiRequest("POST", "/api/admin/reward-bundle", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Reward Sent!", description: `Bundle sent to ${data.recipientCount} user${data.recipientCount !== 1 ? "s" : ""}` });
      setBundleName("");
      setBundleMessage("");
      setCoinAmount("");
      setSelectedItems([]);
      setSelectedUserIds([]);
      setTargetMode("all");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not send bundle", variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!bundleName.trim()) {
      toast({ title: "Missing name", description: "Give the bundle a name", variant: "destructive" });
      return;
    }
    const coins = parseInt(coinAmount) || 0;
    if (coins === 0 && selectedItems.length === 0) {
      toast({ title: "Empty bundle", description: "Add coins or items to the bundle", variant: "destructive" });
      return;
    }
    if (targetMode === "select" && selectedUserIds.length === 0) {
      toast({ title: "No recipients", description: "Select at least one user", variant: "destructive" });
      return;
    }
    sendMutation.mutate();
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const removeItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const filteredMembers = userSearch
    ? members.filter(m => m.username.toLowerCase().includes(userSearch.toLowerCase()) || m.email.toLowerCase().includes(userSearch.toLowerCase()))
    : members;

  const inputStyle = { background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{ background: "linear-gradient(135deg, rgba(40,20,60,0.4) 0%, rgba(25,10,40,0.4) 100%)", border: "1px solid rgba(192,132,252,0.3)" }}
      >
        <h3 className="font-fantasy text-[#c084fc] text-sm tracking-wider text-center mb-3" style={{ textShadow: "0 0 8px rgba(192,132,252,0.3)" }}>
          Create Reward Bundle
        </h3>

        <div className="space-y-3">
          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Bundle Name</label>
            <input
              data-testid="input-bundle-name"
              type="text"
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              placeholder="e.g. Welcome Gift, Weekly Reward..."
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Message (optional)</label>
            <textarea
              data-testid="input-bundle-message"
              value={bundleMessage}
              onChange={(e) => setBundleMessage(e.target.value)}
              placeholder="e.g. Thanks for being part of the realm!"
              rows={2}
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none resize-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Coin Amount</label>
            <div className="flex items-center gap-2">
              <img src={coinIconImg} alt="" className="w-5 h-5" />
              <input
                data-testid="input-bundle-coins"
                type="number"
                value={coinAmount}
                onChange={(e) => setCoinAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="flex-1 px-3 py-2 rounded-md font-sans text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider">Items ({selectedItems.length})</label>
              <button
                data-testid="button-add-bundle-item"
                onClick={() => setShowItemPicker(true)}
                className="px-2 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                style={{ background: "rgba(192,132,252,0.2)", border: "1px solid rgba(192,132,252,0.4)", color: "#c084fc", cursor: "pointer" }}
              >
                + Add Item
              </button>
            </div>
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedItems.map((item, idx) => {
                  const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{ background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.3)" }}
                    >
                      {displayImg ? (
                        <img src={displayImg} alt="" className="w-5 h-5 object-contain rounded-sm" />
                      ) : (
                        <span className="text-xs">{item.type === "pet" ? "🥚" : "📦"}</span>
                      )}
                      <span className="font-fantasy text-[#e0d0f0] text-[8px] max-w-[60px] truncate">{item.name}</span>
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-[#ff9999] text-[10px] ml-0.5"
                        style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Recipients</label>
            <div className="flex gap-2 mb-2">
              <button
                data-testid="button-target-all"
                onClick={() => setTargetMode("all")}
                className="flex-1 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
                style={{
                  background: targetMode === "all" ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)" : "rgba(0,0,0,0.3)",
                  border: targetMode === "all" ? "1px solid rgba(127,255,212,0.4)" : "1px solid rgba(212,160,23,0.2)",
                  color: targetMode === "all" ? "#7fffd4" : "#a89878",
                  cursor: "pointer",
                }}
              >
                All Users
              </button>
              <button
                data-testid="button-target-select"
                onClick={() => setTargetMode("select")}
                className="flex-1 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
                style={{
                  background: targetMode === "select" ? "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)" : "rgba(0,0,0,0.3)",
                  border: targetMode === "select" ? "1px solid rgba(212,160,23,0.5)" : "1px solid rgba(212,160,23,0.2)",
                  color: targetMode === "select" ? "#f0c040" : "#a89878",
                  cursor: "pointer",
                }}
              >
                Select Users
              </button>
            </div>

            {targetMode === "select" && (
              <div>
                <input
                  data-testid="input-user-search"
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full px-3 py-2 rounded-md font-sans text-xs outline-none mb-2"
                  style={inputStyle}
                />
                {selectedUserIds.length > 0 && (
                  <p className="font-fantasy text-[#7fffd4] text-[9px] tracking-wider mb-2">
                    {selectedUserIds.length} user{selectedUserIds.length !== 1 ? "s" : ""} selected
                  </p>
                )}
                <div className="max-h-32 overflow-y-auto space-y-1 rounded-md p-1" style={{ background: "rgba(0,0,0,0.2)" }}>
                  {filteredMembers.map(m => {
                    const isSelected = selectedUserIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        data-testid={`button-select-user-${m.id}`}
                        onClick={() => toggleUser(m.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left"
                        style={{
                          background: isSelected ? "rgba(127,255,212,0.1)" : "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isSelected ? "rgba(127,255,212,0.3)" : "rgba(0,0,0,0.3)",
                            border: isSelected ? "1px solid rgba(127,255,212,0.5)" : "1px solid rgba(212,160,23,0.3)",
                          }}
                        >
                          {isSelected && <span className="text-[#7fffd4] text-[8px]">✓</span>}
                        </div>
                        <span className="font-fantasy text-[#f0c040] text-[10px] truncate">{m.username}</span>
                        <span className="font-fantasy text-[#6a5840] text-[8px] truncate">{m.email}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            data-testid="button-send-bundle"
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgba(120,80,200,0.7) 0%, rgba(80,40,160,0.7) 100%)",
              border: "1px solid rgba(192,132,252,0.5)",
              color: "#e0d0f0",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(192,132,252,0.2)",
            }}
          >
            {sendMutation.isPending ? "Sending..." : "Send Reward Bundle"}
          </button>
        </div>
      </div>

      {showItemPicker && (
        <ItemPickerModal
          items={allShopItems}
          onSelect={(item) => {
            setSelectedItems(prev => [...prev, item]);
            setShowItemPicker(false);
          }}
          onClose={() => setShowItemPicker(false)}
        />
      )}
    </div>
  );
}

interface SupportMsg {
  id: string;
  username: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function SupportMessagesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: messages = [], isLoading } = useQuery<SupportMsg[]>({
    queryKey: ["/api/admin/support-messages"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/support-messages/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-messages"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/support-messages/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-messages"] });
      toast({ title: "Deleted", description: "Message removed" });
    },
  });

  const unreadCount = messages.filter(m => !m.isRead).length;

  if (isLoading) {
    return <p className="font-fantasy text-[#a89878] text-xs text-center tracking-wider py-8">Loading messages...</p>;
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="font-fantasy text-[#6a5840] text-sm tracking-wider">No support messages yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <p className="font-fantasy text-[#ff9999] text-xs tracking-wider text-center">
          {unreadCount} unread message{unreadCount !== 1 ? "s" : ""}
        </p>
      )}
      {messages.map(msg => {
        const isExpanded = expandedId === msg.id;
        const date = new Date(msg.createdAt);
        const timeStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return (
          <div
            key={msg.id}
            data-testid={`support-message-${msg.id}`}
            className="rounded-lg overflow-hidden"
            style={{
              background: msg.isRead
                ? "linear-gradient(135deg, rgba(40,30,20,0.4) 0%, rgba(30,20,10,0.4) 100%)"
                : "linear-gradient(135deg, rgba(139,32,32,0.2) 0%, rgba(92,16,16,0.2) 100%)",
              border: msg.isRead
                ? "1px solid rgba(168,152,120,0.2)"
                : "1px solid rgba(255,153,153,0.3)",
            }}
          >
            <button
              data-testid={`button-expand-message-${msg.id}`}
              onClick={() => {
                setExpandedId(isExpanded ? null : msg.id);
                if (!msg.isRead) markReadMutation.mutate(msg.id);
              }}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {!msg.isRead && (
                <span className="w-2 h-2 rounded-full bg-[#ff6666] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-fantasy text-[#f0c040] text-xs tracking-wider truncate">{msg.username}</span>
                  <span className="font-fantasy text-[#6a5840] text-[9px] tracking-wider flex-shrink-0">{timeStr}</span>
                </div>
                <p className="font-fantasy text-[#d4b896] text-[10px] tracking-wider truncate">{msg.subject}</p>
              </div>
              <span className="font-fantasy text-[#a89878] text-xs" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2">
                <div className="rounded-md p-2.5" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mb-1">EMAIL</p>
                  <p className="font-sans text-[#d4b896] text-xs break-all">{msg.email}</p>
                </div>
                <div className="rounded-md p-2.5" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mb-1">MESSAGE</p>
                  <p className="font-sans text-[#d4b896] text-xs whitespace-pre-wrap break-words">{msg.message}</p>
                </div>
                <div className="flex justify-end">
                  <button
                    data-testid={`button-delete-message-${msg.id}`}
                    onClick={() => deleteMutation.mutate(msg.id)}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                    style={{ background: "rgba(139,32,32,0.3)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff9999", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AdminBadge {
  id: string;
  name: string;
  imageUrl: string;
  dailyRewardCoins: number | null;
  claimType: string;
  badgePoints: number;
  createdAt: string;
}

function BadgeDatabaseSection({ members }: { members: MemberUser[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDailyReward, setUploadDailyReward] = useState<string>("");
  const [uploadClaimType, setUploadClaimType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [uploadBadgePoints, setUploadBadgePoints] = useState<string>("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<string | null>(null);

  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [editingRewardVal, setEditingRewardVal] = useState<string>("");
  const [editingPointsId, setEditingPointsId] = useState<string | null>(null);
  const [editingPointsVal, setEditingPointsVal] = useState<string>("");
  const [viewingBadge, setViewingBadge] = useState<AdminBadge | null>(null);
  const [editingBadge, setEditingBadge] = useState<AdminBadge | null>(null);
  const [editName, setEditName] = useState("");
  const [editBadgePoints, setEditBadgePoints] = useState<string>("");
  const [editClaimType, setEditClaimType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [editDailyReward, setEditDailyReward] = useState<string>("");
  const [editImageData, setEditImageData] = useState<string | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const { data: allBadges = [], isLoading } = useQuery<AdminBadge[]>({
    queryKey: ["/api/badges"],
  });

  interface BadgeRecipient { userId: string; username: string; profileImage: string | null; awardedAt: string; }
  const { data: recipients = [], isLoading: recipientsLoading } = useQuery<BadgeRecipient[]>({
    queryKey: ["/api/admin/badges", viewingBadge?.id, "recipients"],
    enabled: !!viewingBadge,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!uploadName.trim() || !uploadData) throw new Error("Missing data");
      const dailyRewardCoins = uploadDailyReward.trim() ? parseInt(uploadDailyReward.trim(), 10) : null;
      const badgePoints = uploadBadgePoints.trim() ? parseInt(uploadBadgePoints.trim(), 10) : 0;
      return apiRequest("POST", "/api/admin/badges", { name: uploadName.trim(), imageData: uploadData, dailyRewardCoins, badgePoints, claimType: uploadClaimType });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setShowUpload(false);
      setUploadName("");
      setUploadDailyReward("");
      setUploadClaimType("daily");
      setUploadBadgePoints("");
      setUploadPreview(null);
      setUploadData(null);
      toast({ title: "Badge created!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRewardMutation = useMutation({
    mutationFn: ({ id, coins }: { id: string; coins: number | null }) =>
      apiRequest("PATCH", `/api/admin/badges/${id}`, { dailyRewardCoins: coins }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setEditingRewardId(null);
      toast({ title: "Daily reward updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePointsMutation = useMutation({
    mutationFn: ({ id, points }: { id: string; points: number }) =>
      apiRequest("PATCH", `/api/admin/badges/${id}`, { badgePoints: points }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setEditingPointsId(null);
      toast({ title: "Badge points updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editBadgeMutation = useMutation({
    mutationFn: ({ id, name, badgePoints, claimType, dailyRewardCoins, imageData }: { id: string; name: string; badgePoints: number; claimType: string; dailyRewardCoins: number | null; imageData: string | null }) =>
      apiRequest("PATCH", `/api/admin/badges/${id}`, { name, badgePoints, claimType, dailyRewardCoins, ...(imageData ? { imageData } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setEditingBadge(null);
      toast({ title: "Badge updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/badges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      toast({ title: "Badge deleted" });
    },
    onError: () => toast({ title: "Error deleting badge", variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as string;
      setUploadPreview(data);
      setUploadData(data);
    };
    reader.readAsDataURL(file);
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-fantasy text-[#f0c040] text-xs tracking-wider">
          {allBadges.length} badge{allBadges.length !== 1 ? "s" : ""} in realm
        </p>
        <button
          data-testid="button-upload-badge"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-fantasy text-[10px] tracking-wider"
          style={{ background: "linear-gradient(135deg, #4a3800, #7a5c00)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700", cursor: "pointer" }}
        >
          <Upload className="w-3 h-3" />
          Upload Badge
        </button>
      </div>

      {showUpload && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "rgba(20,12,4,0.85)", border: "1px solid rgba(255,215,0,0.3)" }}
        >
          <div className="flex items-center justify-between">
            <p className="font-fantasy text-[#ffd700] text-xs tracking-wider">New Badge</p>
            <button onClick={() => setShowUpload(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a89878" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            data-testid="input-badge-name"
            type="text"
            placeholder="Badge name..."
            value={uploadName}
            onChange={e => setUploadName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,215,0,0.25)", color: "#f0c040", outline: "none" }}
          />
          <input
            data-testid="input-badge-daily-reward"
            type="number"
            min="0"
            placeholder="Coin reward per claim (optional)..."
            value={uploadDailyReward}
            onChange={e => setUploadDailyReward(e.target.value)}
            className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,215,0,0.25)", color: "#f0c040", outline: "none" }}
          />
          <div className="flex flex-col gap-1">
            <p className="font-fantasy text-[9px] tracking-widest uppercase" style={{ color: "#a89878" }}>Claim Frequency</p>
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map(type => (
                <button
                  key={type}
                  data-testid={`button-claim-type-upload-${type}`}
                  type="button"
                  onClick={() => setUploadClaimType(type)}
                  className="flex-1 py-1.5 rounded-lg font-fantasy text-[10px] tracking-wider capitalize transition-all"
                  style={{
                    background: uploadClaimType === type ? "linear-gradient(135deg, #4a3800, #7a5c00)" : "rgba(0,0,0,0.3)",
                    border: uploadClaimType === type ? "1px solid rgba(255,215,0,0.6)" : "1px solid rgba(255,215,0,0.15)",
                    color: uploadClaimType === type ? "#ffd700" : "#6a5840",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <input
            data-testid="input-badge-points"
            type="number"
            min="0"
            placeholder="Badge points (0 = no leaderboard impact)..."
            value={uploadBadgePoints}
            onChange={e => setUploadBadgePoints(e.target.value)}
            className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,200,180,0.3)", color: "#7fbfb0", outline: "none" }}
          />
          <div className="flex gap-3 items-center">
            {uploadPreview && (
              <img src={uploadPreview} alt="preview" className="w-16 h-16 rounded-full object-cover" style={{ border: "2px solid rgba(255,215,0,0.4)" }} />
            )}
            <button
              data-testid="button-choose-badge-image"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-fantasy text-[10px] tracking-wider"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px dashed rgba(255,215,0,0.3)", color: "#a89878", cursor: "pointer" }}
            >
              <Upload className="w-3 h-3" />
              {uploadPreview ? "Change image" : "Choose PNG"}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileChange} />
          </div>
          <button
            data-testid="button-save-badge"
            onClick={() => createMutation.mutate()}
            disabled={!uploadName.trim() || !uploadData || createMutation.isPending}
            className="w-full py-2 rounded-lg font-fantasy text-xs tracking-wider"
            style={{
              background: !uploadName.trim() || !uploadData ? "rgba(0,0,0,0.3)" : "linear-gradient(135deg, #4a3800, #7a5c00)",
              border: "1px solid rgba(255,215,0,0.4)",
              color: !uploadName.trim() || !uploadData ? "#6a5840" : "#ffd700",
              cursor: !uploadName.trim() || !uploadData ? "not-allowed" : "pointer",
            }}
          >
            {createMutation.isPending ? "Saving..." : "Save Badge"}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="font-fantasy text-[#7fbfb0] text-xs text-center animate-pulse py-8">Loading badges...</p>
      ) : allBadges.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-fantasy text-[#a89878] text-sm tracking-wider">No badges yet</p>
          <p className="font-fantasy text-[#6a5840] text-[10px] tracking-wide mt-1">Upload one to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {allBadges.map(badge => (
            <div
              key={badge.id}
              data-testid={`card-badge-admin-${badge.id}`}
              className="flex flex-col items-center gap-2 rounded-xl p-3"
              style={{ background: "rgba(20,12,4,0.6)", border: "1px solid rgba(255,215,0,0.15)" }}
            >
              <div className="flex flex-col items-center gap-1.5 w-full">
                <button
                  data-testid={`button-view-recipients-${badge.id}`}
                  onClick={() => setViewingBadge(badge)}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
                  style={{ background: "rgba(255,215,0,0.08)", border: "2px solid rgba(255,215,0,0.3)", boxShadow: "0 0 12px rgba(255,215,0,0.15)", cursor: "pointer", padding: 0 }}
                  title="View badge holders"
                >
                  <img src={badge.imageUrl} alt={badge.name} className="w-12 h-12 object-contain rounded-full" />
                </button>
                <p className="font-fantasy text-[10px] tracking-wider text-center leading-tight" style={{ color: "#ffd700" }}>
                  {badge.name}
                </p>
              </div>
              {editingRewardId === badge.id ? (
                <div className="flex gap-1 w-full">
                  <input
                    type="number"
                    min="0"
                    value={editingRewardVal}
                    onChange={e => setEditingRewardVal(e.target.value)}
                    placeholder="coins/day"
                    className="flex-1 rounded px-2 py-0.5 font-fantasy text-[9px]"
                    style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,215,0,0.4)", color: "#f0c040", outline: "none", minWidth: 0 }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const coins = editingRewardVal.trim() ? parseInt(editingRewardVal.trim(), 10) : null;
                      updateRewardMutation.mutate({ id: badge.id, coins });
                    }}
                    disabled={updateRewardMutation.isPending}
                    className="px-1.5 rounded font-fantasy text-[9px]"
                    style={{ background: "rgba(255,215,0,0.2)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700", cursor: "pointer" }}
                  >✓</button>
                  <button
                    onClick={() => setEditingRewardId(null)}
                    className="px-1.5 rounded font-fantasy text-[9px]"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff9999", cursor: "pointer" }}
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingRewardId(badge.id); setEditingRewardVal(badge.dailyRewardCoins != null ? String(badge.dailyRewardCoins) : ""); }}
                  className="font-fantasy text-[9px] tracking-wide"
                  style={{ background: "none", border: "none", cursor: "pointer", color: badge.dailyRewardCoins ? "#f0c040" : "#6a5840" }}
                >
                  {badge.dailyRewardCoins ? (
                    <span className="flex items-center gap-1">
                      <img src={coinIconImg} alt="coins" style={{ width: 11, height: 11, objectFit: "contain" }} />
                      {badge.dailyRewardCoins}/{badge.claimType === "weekly" ? "wk" : badge.claimType === "monthly" ? "mo" : "day"}
                    </span>
                  ) : "Set reward"}
                </button>
              )}
              {editingPointsId === badge.id ? (
                <div className="flex items-center gap-1">
                  <input
                    data-testid={`input-badge-points-${badge.id}`}
                    type="number"
                    min="0"
                    value={editingPointsVal}
                    onChange={e => setEditingPointsVal(e.target.value)}
                    className="w-16 rounded px-1.5 py-0.5 font-fantasy text-[9px]"
                    style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(100,200,180,0.4)", color: "#7fbfb0", outline: "none" }}
                    autoFocus
                  />
                  <span className="font-fantasy text-[8px] text-[#7fbfb0]">pts</span>
                  <button
                    onClick={() => {
                      const points = editingPointsVal.trim() ? parseInt(editingPointsVal.trim(), 10) : 0;
                      updatePointsMutation.mutate({ id: badge.id, points });
                    }}
                    disabled={updatePointsMutation.isPending}
                    className="px-1.5 rounded font-fantasy text-[9px]"
                    style={{ background: "rgba(100,200,180,0.15)", border: "1px solid rgba(100,200,180,0.4)", color: "#7fbfb0", cursor: "pointer" }}
                  >✓</button>
                  <button
                    onClick={() => setEditingPointsId(null)}
                    className="px-1.5 rounded font-fantasy text-[9px]"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff9999", cursor: "pointer" }}
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingPointsId(badge.id); setEditingPointsVal(String(badge.badgePoints ?? 0)); }}
                  className="font-fantasy text-[9px] tracking-wide"
                  style={{ background: "none", border: "none", cursor: "pointer", color: (badge.badgePoints ?? 0) > 0 ? "#7fbfb0" : "#4a6860" }}
                >
                  {(badge.badgePoints ?? 0) > 0 ? `⭐ ${badge.badgePoints} pts` : "Set badge pts"}
                </button>
              )}
              <div className="flex gap-1.5 w-full">
                <button
                  data-testid={`button-edit-badge-${badge.id}`}
                  onClick={() => { setEditingBadge(badge); setEditName(badge.name); setEditBadgePoints(String(badge.badgePoints ?? 0)); setEditClaimType((badge.claimType === "weekly" ? "weekly" : "daily")); setEditDailyReward(badge.dailyRewardCoins != null ? String(badge.dailyRewardCoins) : ""); setEditImageData(null); setEditImagePreview(null); }}
                  className="flex items-center justify-center gap-1 flex-1 py-1 rounded font-fantasy text-[9px] tracking-wider"
                  style={{ background: "rgba(30,60,80,0.4)", border: "1px solid rgba(100,160,210,0.3)", color: "#8ab4d8", cursor: "pointer" }}
                >
                  <Pencil className="w-2.5 h-2.5" />
                  Edit
                </button>
                <button
                  data-testid={`button-delete-badge-${badge.id}`}
                  onClick={() => deleteMutation.mutate(badge.id)}
                  disabled={deleteMutation.isPending}
                  className="flex items-center justify-center gap-1 flex-1 py-1 rounded font-fantasy text-[9px] tracking-wider"
                  style={{ background: "rgba(139,32,32,0.2)", border: "1px solid rgba(255,100,100,0.2)", color: "#ff9999", cursor: "pointer" }}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}


      {viewingBadge && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setViewingBadge(null)} />
          <div className="relative flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: "rgba(8,4,0,0.95)", borderBottom: "1px solid rgba(255,215,0,0.15)" }}>
              <button
                data-testid="button-close-recipients"
                onClick={() => setViewingBadge(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,215,0,0.3)", color: "#ffd700", cursor: "pointer" }}
              >✕</button>
              <img src={viewingBadge.imageUrl} alt={viewingBadge.name} className="w-9 h-9 rounded-full object-contain" style={{ border: "1.5px solid rgba(255,215,0,0.4)" }} />
              <div className="flex flex-col min-w-0">
                <p className="font-fantasy text-[12px] tracking-wider" style={{ color: "#ffd700" }}>{viewingBadge.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "#6a5840" }}>
                  {recipientsLoading ? "Loading..." : `${recipients.length} holder${recipients.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "rgba(8,4,0,0.9)" }}>
              {recipientsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="font-fantasy text-xs animate-pulse" style={{ color: "#6a5840" }}>Loading holders...</p>
                </div>
              ) : recipients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <p className="font-fantasy text-xs" style={{ color: "#6a5840" }}>No one has this badge yet</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recipients.map((r) => (
                    <div
                      key={r.userId}
                      data-testid={`row-badge-recipient-${r.userId}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.1)" }}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                        style={{ background: "rgba(255,215,0,0.1)", border: "1.5px solid rgba(255,215,0,0.25)" }}
                      >
                        {r.profileImage ? (
                          <img src={r.profileImage} alt={r.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-fantasy text-sm" style={{ color: "#ffd700" }}>{r.username[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <p className="font-fantasy text-[11px] tracking-wide truncate" style={{ color: "#ffd700" }}>{r.username}</p>
                        <p className="font-fantasy text-[9px]" style={{ color: "#6a5840" }}>
                          Awarded {new Date(r.awardedAt).toLocaleDateString()} at {new Date(r.awardedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingBadge && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingBadge(null)} />
          <div
            className="relative w-full rounded-t-2xl overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #0d1520 0%, #060c14 100%)",
              border: "1px solid rgba(100,160,210,0.3)",
              maxHeight: "80dvh",
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(100,160,210,0.12)" }}>
              <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ border: "1.5px solid rgba(100,160,210,0.35)" }}>
                <img src={editImagePreview ?? editingBadge.imageUrl} alt={editingBadge.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="font-fantasy text-[#8ab4d8] text-sm tracking-wider">Edit Badge</p>
                <p className="font-fantasy text-[#4a7090] text-[9px] tracking-wide">Update name or image</p>
              </div>
              <button onClick={() => setEditingBadge(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4a7090" }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4 overflow-y-auto">
              <div>
                <label className="font-fantasy text-[9px] tracking-widest uppercase mb-1 block" style={{ color: "#4a7090" }}>Badge Name</label>
                <input
                  data-testid="input-edit-badge-name"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Badge name..."
                  className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,160,210,0.25)", color: "#8ab4d8", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[9px] tracking-widest uppercase mb-1 block" style={{ color: "#4a7090" }}>Coin Reward Per Claim</label>
                <input
                  data-testid="input-edit-badge-daily-reward"
                  type="number"
                  min="0"
                  value={editDailyReward}
                  onChange={e => setEditDailyReward(e.target.value)}
                  placeholder="0 = no coin reward"
                  className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,215,0,0.25)", color: "#f0c040", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[9px] tracking-widest uppercase mb-1 block" style={{ color: "#4a7090" }}>Claim Frequency</label>
                <div className="flex gap-2">
                  {(["daily", "weekly", "monthly"] as const).map(type => (
                    <button
                      key={type}
                      data-testid={`button-claim-type-edit-${type}`}
                      type="button"
                      onClick={() => setEditClaimType(type)}
                      className="flex-1 py-1.5 rounded-lg font-fantasy text-[10px] tracking-wider capitalize transition-all"
                      style={{
                        background: editClaimType === type ? "linear-gradient(135deg, #0d2540, #1a4070)" : "rgba(0,0,0,0.3)",
                        border: editClaimType === type ? "1px solid rgba(100,160,210,0.6)" : "1px solid rgba(100,160,210,0.15)",
                        color: editClaimType === type ? "#8ab4d8" : "#2a4060",
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <p className="font-fantasy text-[9px] mt-1" style={{ color: "#2a4060" }}>
                  {editClaimType === "weekly" ? "Players can claim once every 7 days" : editClaimType === "monthly" ? "Players can claim once every 30 days" : "Players can claim once every 24 hours"}
                </p>
              </div>

              <div>
                <label className="font-fantasy text-[9px] tracking-widest uppercase mb-1 block" style={{ color: "#4a7090" }}>Badge Points</label>
                <input
                  data-testid="input-edit-badge-points"
                  type="number"
                  min="0"
                  value={editBadgePoints}
                  onChange={e => setEditBadgePoints(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg px-3 py-2 font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,200,180,0.25)", color: "#7fbfb0", outline: "none" }}
                />
                <p className="font-fantasy text-[9px] mt-1" style={{ color: "#2a5040" }}>Points count toward the Hall of Legends leaderboard</p>
              </div>

              <div>
                <label className="font-fantasy text-[9px] tracking-widest uppercase mb-1 block" style={{ color: "#4a7090" }}>Badge Image</label>
                <div className="flex gap-3 items-center">
                  <div
                    className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ border: "1.5px solid rgba(100,160,210,0.3)", background: "rgba(0,0,0,0.3)" }}
                  >
                    <img
                      src={editImagePreview ?? editingBadge.imageUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    data-testid="button-edit-badge-image"
                    onClick={() => editFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-fantasy text-[10px] tracking-wider"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px dashed rgba(100,160,210,0.3)", color: "#4a7090", cursor: "pointer" }}
                  >
                    <Upload className="w-3 h-3" />
                    {editImagePreview ? "Change image" : "Replace image"}
                  </button>
                  <input
                    ref={editFileRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        setEditImageData(ev.target?.result as string);
                        setEditImagePreview(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>
              </div>

              <button
                data-testid="button-save-badge-edit"
                onClick={() => editBadgeMutation.mutate({ id: editingBadge.id, name: editName, badgePoints: editBadgePoints.trim() ? parseInt(editBadgePoints.trim(), 10) : 0, claimType: editClaimType, dailyRewardCoins: editDailyReward.trim() ? parseInt(editDailyReward.trim(), 10) : null, imageData: editImageData })}
                disabled={!editName.trim() || editBadgeMutation.isPending}
                className="w-full py-2.5 rounded-xl font-fantasy text-xs tracking-wider mt-1"
                style={{
                  background: !editName.trim() ? "rgba(0,0,0,0.3)" : "linear-gradient(135deg, #0d2540, #1a4070)",
                  border: "1px solid rgba(100,160,210,0.4)",
                  color: !editName.trim() ? "#2a4060" : "#8ab4d8",
                  cursor: !editName.trim() ? "not-allowed" : "pointer",
                  boxShadow: editName.trim() ? "0 0 12px rgba(100,160,210,0.1)" : "none",
                }}
              >
                {editBadgeMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
