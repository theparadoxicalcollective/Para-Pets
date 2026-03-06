import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import bgImg from "@assets/bg_home.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import profileFrameImg from "@assets/frame_profile.png";
import coinIconImg from "@assets/icon_coin.png";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import ItemDatabaseSection, { ShopItemFull, ItemPickerModal } from "@/components/ItemDatabaseSection";

interface AdminPageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
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
  const [activeTab, setActiveTab] = useState<"members" | "rewards" | "items" | "pets" | "messages">("members");
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

  const tabs = [
    { key: "members" as const, label: `Members (${members.length})`, color: "#f0c040", activeBg: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", activeBorder: "rgba(212,160,23,0.6)" },
    { key: "rewards" as const, label: "Rewards", color: "#e0d0f0", activeBg: "linear-gradient(135deg, rgba(120,80,200,0.6) 0%, rgba(80,40,160,0.6) 100%)", activeBorder: "rgba(192,132,252,0.5)" },
    { key: "items" as const, label: "Item DB", color: "#7fffd4", activeBg: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)", activeBorder: "rgba(127,255,212,0.5)" },
    { key: "pets" as const, label: "Pet DB", color: "#ffb347", activeBg: "linear-gradient(135deg, #8b4513 0%, #5c3a1e 100%)", activeBorder: "rgba(255,179,71,0.5)" },
    { key: "messages" as const, label: "Messages", color: "#ff9999", activeBg: "linear-gradient(135deg, #8b2020 0%, #5c1010 100%)", activeBorder: "rgba(255,153,153,0.5)" },
  ];

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
          <h2
            className="font-fantasy text-[#f0c040] text-center text-lg tracking-widest font-semibold mb-1"
            style={{ textShadow: "0 0 20px rgba(240,192,64,0.4)" }}
          >
            Realm Administration
          </h2>

          <div className="flex justify-center gap-1.5 mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                data-testid={`tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-all"
                style={{
                  background: activeTab === tab.key ? tab.activeBg : "rgba(0,0,0,0.3)",
                  border: activeTab === tab.key ? `1px solid ${tab.activeBorder}` : "1px solid rgba(212,160,23,0.2)",
                  color: activeTab === tab.key ? tab.color : "#a89878",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "members" && (
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

                        <div className="relative w-10 h-10 flex-shrink-0">
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
                        </div>

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

          {activeTab === "rewards" && (
            <RewardBundleSection members={members.filter(m => !m.isAdmin)} />
          )}

          {activeTab === "items" && (
            <ItemDatabaseSection />
          )}

          {activeTab === "pets" && (
            <PetDatabasePanel />
          )}

          {activeTab === "messages" && (
            <SupportMessagesSection />
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
