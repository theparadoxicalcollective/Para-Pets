import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, X, Upload, Trash2, ChevronLeft } from "lucide-react";
import bgImg from "@assets/bg_home.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import profileFrameImg from "@assets/frame_profile.png";
import coinIconImg from "@assets/icon_coin.png";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import ItemDatabaseSection, { ShopItemFull, ItemPickerModal } from "@/components/ItemDatabaseSection";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";
import FishingAdminPanel from "@/components/FishingAdminPanel";
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
  const [activeSection, setActiveSection] = useState<"members" | "rewards" | "items" | "pets" | "messages" | "badges" | "fishing" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<MemberUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const sortedMembers = [...members].sort((a, b) => b.coins - a.coins);

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
    { key: "items" as const, label: "Items", icon: adminIconItems, desc: "Item database", color: "#5eead4", glow: "rgba(94,234,212,0.30)", bg: "linear-gradient(145deg, rgba(8,45,42,0.92) 0%, rgba(14,70,65,0.88) 100%)", border: "rgba(94,234,212,0.45)" },
    { key: "pets" as const, label: "Pets", icon: adminIconPets, desc: "Pet database", color: "#fdba74", glow: "rgba(251,146,60,0.30)", bg: "linear-gradient(145deg, rgba(72,32,8,0.92) 0%, rgba(110,52,12,0.88) 100%)", border: "rgba(251,146,60,0.45)" },
    { key: "messages" as const, label: "Messages", icon: adminIconMessages, desc: "Support inbox", color: "#fca5a5", glow: "rgba(252,165,165,0.30)", bg: "linear-gradient(145deg, rgba(80,18,18,0.92) 0%, rgba(110,28,28,0.88) 100%)", border: "rgba(252,165,165,0.45)" },
    { key: "badges" as const, label: "Badges", icon: adminIconBadges, desc: "Award badges", color: "#fde68a", glow: "rgba(253,230,138,0.30)", bg: "linear-gradient(145deg, rgba(72,54,0,0.92) 0%, rgba(108,80,0,0.88) 100%)", border: "rgba(253,230,138,0.45)" },
    { key: "fishing" as const, label: "Fishing", icon: adminIconFishing, desc: "Fish & ponds", color: "#93c5fd", glow: "rgba(147,197,253,0.30)", bg: "linear-gradient(145deg, rgba(12,22,60,0.92) 0%, rgba(18,36,90,0.88) 100%)", border: "rgba(147,197,253,0.45)" },
  ];

  const activeSectionMeta = activeSection ? sections.find(s => s.key === activeSection) : null;

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col"
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
                          className="relative w-10 h-10 flex-shrink-0 focus:outline-none"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >
                          <img src={profileFrameImg} alt="" className="absolute inset-0 w-full h-full object-contain z-20" />
                          <div className="absolute z-10 overflow-hidden rounded-sm" style={{ inset: "6px" }}>
                            {member.profileImage ? (
                              <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" style={{ background: "#2a1a0a" }}>
                                <span className="font-fantasy text-[#d4a017] text-xs font-bold">{member.username.charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                          </div>
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

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-yellow-400 text-xs">&#9733;</span>
                          <span className="font-fantasy text-[#f0c040] text-xs">{member.coins}</span>
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

function RewardBundleSection({ members }: { members: MemberUser[] }) {
  const [bundleName, setBundleName] = useState("");
  const [bundleMessage, setBundleMessage] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<ShopItemFull[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "select">("all");
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
  createdAt: string;
}

function BadgeDatabaseSection({ members }: { members: MemberUser[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<string | null>(null);

  const [applyBadge, setApplyBadge] = useState<AdminBadge | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [originalSelected, setOriginalSelected] = useState<Set<string>>(new Set());

  const { data: allBadges = [], isLoading } = useQuery<AdminBadge[]>({
    queryKey: ["/api/badges"],
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery<string[]>({
    queryKey: ["/api/admin/badges", applyBadge?.id, "recipients"],
    enabled: !!applyBadge,
    queryFn: async () => {
      if (!applyBadge) return [];
      const res = await fetch(`/api/admin/badges/${applyBadge.id}/recipients`, { credentials: "include" });
      return res.json();
    },
  });

  useEffect(() => {
    if (!recipientsLoading && applyBadge) {
      const s = new Set(recipients);
      setSelected(s);
      setOriginalSelected(s);
    }
  }, [recipients, recipientsLoading, applyBadge?.id]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!uploadName.trim() || !uploadData) throw new Error("Missing data");
      return apiRequest("POST", "/api/admin/badges", { name: uploadName.trim(), imageData: uploadData });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setShowUpload(false);
      setUploadName("");
      setUploadPreview(null);
      setUploadData(null);
      toast({ title: "Badge created!" });
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

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!applyBadge) return;
      const toAward = Array.from(selected).filter(id => !originalSelected.has(id));
      const toRevoke = Array.from(originalSelected).filter(id => !selected.has(id));
      if (toAward.length > 0) {
        await apiRequest("POST", `/api/admin/badges/${applyBadge.id}/award`, { userIds: toAward });
      }
      if (toRevoke.length > 0) {
        await apiRequest("POST", `/api/admin/badges/${applyBadge.id}/revoke`, { userIds: toRevoke });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/badges", applyBadge?.id, "recipients"] });
      setApplyBadge(null);
      toast({ title: "Badge assignments saved!" });
    },
    onError: () => toast({ title: "Error saving assignments", variant: "destructive" }),
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

  const openApply = (badge: AdminBadge) => {
    setApplyBadge(badge);
    setSearch("");
    setSelected(new Set());
    setOriginalSelected(new Set());
  };

  const filteredMembers = members.filter(m =>
    m.username.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

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
              <button
                data-testid={`button-apply-badge-${badge.id}`}
                onClick={() => openApply(badge)}
                className="flex flex-col items-center gap-1.5 w-full"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,215,0,0.08)", border: "2px solid rgba(255,215,0,0.3)", boxShadow: "0 0 12px rgba(255,215,0,0.15)" }}
                >
                  <img src={badge.imageUrl} alt={badge.name} className="w-12 h-12 object-contain rounded-full" />
                </div>
                <p className="font-fantasy text-[10px] tracking-wider text-center leading-tight" style={{ color: "#ffd700" }}>
                  {badge.name}
                </p>
              </button>
              <button
                data-testid={`button-delete-badge-${badge.id}`}
                onClick={() => deleteMutation.mutate(badge.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1 px-2 py-0.5 rounded font-fantasy text-[9px] tracking-wider"
                style={{ background: "rgba(139,32,32,0.2)", border: "1px solid rgba(255,100,100,0.2)", color: "#ff9999", cursor: "pointer" }}
              >
                <Trash2 className="w-2.5 h-2.5" />
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {applyBadge && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setApplyBadge(null)} />
          <div
            className="relative w-full rounded-t-2xl overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #1a0d02 0%, #0d0601 100%)",
              border: "1px solid rgba(255,215,0,0.3)",
              maxHeight: "80dvh",
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,215,0,0.15)" }}>
              <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(255,215,0,0.1)", border: "1.5px solid rgba(255,215,0,0.35)" }}>
                <img src={applyBadge.imageUrl} alt={applyBadge.name} className="w-8 h-8 object-contain rounded-full" />
              </div>
              <div className="flex-1">
                <p className="font-fantasy text-[#ffd700] text-sm tracking-wider">{applyBadge.name}</p>
                <p className="font-fantasy text-[#a89878] text-[9px] tracking-wide">Select players to award this badge</p>
              </div>
              <button onClick={() => setApplyBadge(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a89878" }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(255,215,0,0.1)" }}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "#a89878" }} />
                <input
                  data-testid="input-badge-search"
                  type="text"
                  placeholder="Search players..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,215,0,0.2)", color: "#f0c040", outline: "none" }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {recipientsLoading ? (
                <p className="text-center py-4 font-fantasy text-[#7fbfb0] text-xs animate-pulse">Loading...</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-center py-4 font-fantasy text-[#a89878] text-xs">No players found</p>
              ) : filteredMembers.map(member => {
                const has = selected.has(member.id);
                return (
                  <label
                    key={member.id}
                    data-testid={`badge-user-row-${member.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
                    style={{ background: has ? "rgba(255,215,0,0.08)" : "rgba(0,0,0,0.2)", border: `1px solid ${has ? "rgba(255,215,0,0.25)" : "transparent"}` }}
                  >
                    <input
                      type="checkbox"
                      checked={has}
                      onChange={() => {
                        const next = new Set(selected);
                        if (has) next.delete(member.id); else next.add(member.id);
                        setSelected(next);
                      }}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#ffd700" }}
                    />
                    {member.profileImage ? (
                      <img src={member.profileImage} alt={member.username} className="w-7 h-7 rounded-full object-cover flex-shrink-0" style={{ border: "1px solid rgba(255,215,0,0.2)" }} />
                    ) : (
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center font-fantasy text-xs" style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.2)", color: "#ffd700" }}>
                        {member.username[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-xs tracking-wider truncate" style={{ color: "#f0c040" }}>{member.username}</p>
                      <p className="font-fantasy text-[9px] tracking-wide truncate" style={{ color: "#6a5840" }}>{member.email}</p>
                    </div>
                    {has && <span className="font-fantasy text-[9px] tracking-wider flex-shrink-0" style={{ color: "#ffd700" }}>✓</span>}
                  </label>
                );
              })}
            </div>

            <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,215,0,0.15)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-fantasy text-[9px] tracking-wider" style={{ color: "#a89878" }}>
                  {selected.size} player{selected.size !== 1 ? "s" : ""} selected
                </p>
              </div>
              <button
                data-testid="button-save-badge-assignments"
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="w-full py-2.5 rounded-xl font-fantasy text-xs tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #4a3800, #7a5c00)",
                  border: "1px solid rgba(255,215,0,0.5)",
                  color: "#ffd700",
                  cursor: "pointer",
                  boxShadow: "0 0 16px rgba(255,215,0,0.15)",
                }}
              >
                {applyMutation.isPending ? "Saving..." : "Save Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
