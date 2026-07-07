import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, X, Upload, Trash2, ChevronLeft, Pencil } from "lucide-react";
import bgImg from "@assets/bg_home_v2.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import ItemDatabaseSection, { ShopItemFull, ItemPickerModal, getItemEffectText, getItemCategory, ITEM_CATEGORIES } from "@/components/ItemDatabaseSection";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";
import FishingAdminPanel from "@/components/FishingAdminPanel";
import EnemyDatabasePanel from "@/components/EnemyDatabasePanel";
import HomeBundleSection from "@/components/HomeBundleSection";

import adminIconMembers from "@assets/admin_icon_members.png";
import adminIconRewards from "@assets/admin_icon_rewards_new.png";
import adminIconItems from "@assets/admin_icon_items.png";
import adminIconPets from "@assets/admin_icon_pets.png";
import adminIconMessages from "@assets/admin_icon_messages.png";
import adminIconBadges from "@assets/admin_icon_badges.png";
import adminIconHouseBundle from "@assets/admin_icon_house_bundle.png";
import adminIconMaintenance from "@assets/admin_icon_maintenance.png";
import adminIconVeridianWatcher from "@assets/admin_icon_veridian_watcher_transparent.png";
import adminIconQuest from "@assets/icon_quest_v5.png";

import adminIconPurchases from "@assets/admin_icon_purchases.png";

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
  isModerator: boolean;
  isBanned: boolean;
  banUntil: string | null;
  createdAt: string;
}

export default function AdminPage({ user }: AdminPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [coinAmounts, setCoinAmounts] = useState<Record<string, string>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [banModalUserId, setBanModalUserId] = useState<string | null>(null);
  const [banDays, setBanDays] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [activeSection, setActiveSection] = useState<"members" | "rewards" | "items" | "pets" | "messages" | "badges" | "emblems" | "maintenance" | "home_bundle" | "purchases" | "veridian_watcher" | "quest" | "molten_blocks" | "metrics" | "recipe_items" | null>(null);
  const [orphanResult, setOrphanResult] = useState<{ summary: string; cleaned: number } | null>(null);
  const [characterTab, setCharacterTab] = useState<"pet" | "enemy" | "npc" | "fish">("pet");
  const [itemsTab, setItemsTab] = useState<"items" | "fishing">("items");
  const [rewardsTab, setRewardsTab] = useState<"rewards" | "welcome">("rewards");
  const [watcherTab, setWatcherTab] = useState<"watcher" | "chat_filter">("watcher");
  const [purchasesTab, setPurchasesTab] = useState<"history" | "milestones">("history");
  const [partsOverlayTemplateId, setPartsOverlayTemplateId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<MemberUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: supportMsgsAll = [] } = useQuery<SupportMsg[]>({
    queryKey: ["/api/admin/support-messages"],
    refetchInterval: 60000,
  });
  const unreadSupportCount = supportMsgsAll.filter((m: SupportMsg) => !m.isRead).length;

  const sortedMembers = [...members].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const banMutation = useMutation({
    mutationFn: async ({ userId, ban, days }: { userId: string; ban: boolean; days?: number }) => {
      const res = await apiRequest("POST", `/api/admin/${ban ? "ban" : "unban"}/${userId}`, ban && days ? { days } : {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBanModalUserId(null);
      setBanDays("");
      toast({ title: "Updated", description: "User status changed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/delete-account/${userId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBanModalUserId(null);
      setDeleteConfirm(false);
      toast({ title: "Account Deleted", description: "The account has been permanently removed." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Deletion failed", variant: "destructive" });
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

  const moderatorMutation = useMutation({
    mutationFn: async ({ userId, isModerator }: { userId: string; isModerator: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/moderator/${userId}`, { isModerator });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({ title: "Updated", description: "Moderator status changed" });
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
    // ── A–Z alphabetical order, each with a unique colour ────────────────────
    { key: "pets"          as const, label: "Add Character",   icon: adminIconPets,          desc: "Pets, enemies, NPCs & fish",   color: "#fb923c", glow: "rgba(251,146,60,0.35)",   bg: "linear-gradient(145deg, rgba(72,24,4,0.92) 0%, rgba(110,38,8,0.88) 100%)",    border: "rgba(251,146,60,0.5)"   },
    { key: "badges"        as const, label: "Badges",          icon: adminIconBadges,        desc: "Award badges",                 color: "#fde68a", glow: "rgba(253,230,138,0.30)",  bg: "linear-gradient(145deg, rgba(72,54,0,0.92) 0%, rgba(108,80,0,0.88) 100%)",    border: "rgba(253,230,138,0.45)" },
    { key: "emblems"       as const, label: "Emblems",         icon: adminIconBadges,        desc: "PvP rank trophies",            color: "#fda4af", glow: "rgba(253,164,175,0.30)",  bg: "linear-gradient(145deg, rgba(80,12,24,0.92) 0%, rgba(110,20,36,0.88) 100%)",  border: "rgba(253,164,175,0.45)" },
    { key: "home_bundle"   as const, label: "Home Bundle",     icon: adminIconHouseBundle,   desc: "Decor & bundles",              color: "#fbbf24", glow: "rgba(251,191,36,0.30)",   bg: "linear-gradient(145deg, rgba(60,40,4,0.92) 0%, rgba(90,60,8,0.88) 100%)",    border: "rgba(251,191,36,0.45)" },
    { key: "items"         as const, label: "Items",           icon: adminIconItems,         desc: "Items & fishing supplies",     color: "#5eead4", glow: "rgba(94,234,212,0.30)",   bg: "linear-gradient(145deg, rgba(8,45,42,0.92) 0%, rgba(14,70,65,0.88) 100%)",   border: "rgba(94,234,212,0.45)"  },
    { key: "maintenance"   as const, label: "Maintenance",     icon: adminIconMaintenance,   desc: "DB cleanup tools",             color: "#e879f9", glow: "rgba(232,121,249,0.30)",  bg: "linear-gradient(145deg, rgba(60,8,60,0.92) 0%, rgba(90,12,90,0.88) 100%)",   border: "rgba(232,121,249,0.45)" },
    { key: "members"       as const, label: "Members",         icon: adminIconMembers,       desc: "Manage players", count: members.length, color: "#f0c040", glow: "rgba(240,192,64,0.35)", bg: "linear-gradient(145deg, rgba(60,38,8,0.92) 0%, rgba(92,58,20,0.88) 100%)", border: "rgba(212,160,23,0.5)" },
    { key: "messages"      as const, label: "Messages",        icon: adminIconMessages,      desc: "Support inbox",  count: unreadSupportCount || undefined, color: "#fca5a5", glow: "rgba(252,165,165,0.30)", bg: "linear-gradient(145deg, rgba(80,18,18,0.92) 0%, rgba(110,28,28,0.88) 100%)", border: "rgba(252,165,165,0.45)" },
    { key: "metrics"       as const, label: "Metrics",         icon: adminIconPurchases,     desc: "Player login analytics",       color: "#7dd3fc", glow: "rgba(125,211,252,0.30)",  bg: "linear-gradient(145deg, rgba(8,36,60,0.92) 0%, rgba(12,56,90,0.88) 100%)",   border: "rgba(125,211,252,0.45)" },
    { key: "molten_blocks" as const, label: "Molten Blocks",   icon: adminIconItems,         desc: "Item drops in Molten Blocks",  color: "#fdba74", glow: "rgba(253,186,116,0.35)",  bg: "linear-gradient(145deg, rgba(72,32,4,0.92) 0%, rgba(110,50,10,0.88) 100%)",  border: "rgba(253,186,116,0.5)"  },
    { key: "purchases"     as const, label: "Purchases",       icon: adminIconPurchases,     desc: "Coin shop history",            color: "#86efac", glow: "rgba(134,239,172,0.30)",  bg: "linear-gradient(145deg, rgba(8,45,18,0.92) 0%, rgba(12,70,28,0.88) 100%)",   border: "rgba(134,239,172,0.45)" },
    { key: "quest"         as const, label: "Quests",          icon: adminIconQuest,         desc: "Manage quests",                color: "#6ee7b7", glow: "rgba(110,231,183,0.35)",  bg: "linear-gradient(145deg, rgba(8,50,35,0.92) 0%, rgba(14,80,55,0.88) 100%)",   border: "rgba(110,231,183,0.45)" },
    { key: "recipe_items"  as const, label: "Recipes",         icon: adminIconItems,         desc: "Mixing Tree brew recipes",     color: "#4ade80", glow: "rgba(74,222,128,0.35)",   bg: "linear-gradient(145deg, rgba(4,40,16,0.92) 0%, rgba(8,64,24,0.88) 100%)",   border: "rgba(74,222,128,0.5)"   },
    { key: "rewards"       as const, label: "Rewards",         icon: adminIconRewards,       desc: "Send bundles",                 color: "#c4b5fd", glow: "rgba(192,132,252,0.35)",  bg: "linear-gradient(145deg, rgba(50,18,88,0.92) 0%, rgba(80,28,120,0.88) 100%)", border: "rgba(192,132,252,0.5)"  },
    { key: "veridian_watcher" as const, label: "Veridian Watcher", icon: adminIconVeridianWatcher, desc: "Bot quotes & chat filter", color: "#a5f3fc", glow: "rgba(165,243,252,0.30)", bg: "linear-gradient(145deg, rgba(8,40,55,0.92) 0%, rgba(12,65,85,0.88) 100%)", border: "rgba(165,243,252,0.45)" },
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
                            {member.isModerator && <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#c084fc" }}>MOD</span>}
                            {member.isBanned && (
                              <span className="font-fantasy text-[#ff6666] text-[10px] tracking-wider">
                                {member.banUntil
                                  ? `BANNED (${Math.max(1, Math.ceil((new Date(member.banUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d left)`
                                  : "BANISHED"}
                              </span>
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
                          {member.isBanned ? (
                            <button
                              data-testid={`button-unban-${member.id}`}
                              onClick={() => banMutation.mutate({ userId: member.id, ban: false })}
                              disabled={banMutation.isPending}
                              className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                              style={{
                                background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                                border: "1px solid rgba(45,154,100,0.5)",
                                color: "#7fffd4",
                                cursor: "pointer",
                              }}
                            >
                              Unbanish
                            </button>
                          ) : (
                            <button
                              data-testid={`button-ban-${member.id}`}
                              onClick={() => { setBanModalUserId(member.id); setBanDays(""); setDeleteConfirm(false); }}
                              className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity"
                              style={{
                                background: "linear-gradient(135deg, rgba(139,0,0,0.6) 0%, rgba(80,0,0,0.6) 100%)",
                                border: "1px solid rgba(200,50,50,0.4)",
                                color: "#ff9999",
                                cursor: "pointer",
                              }}
                            >
                              Banish
                            </button>
                          )}

                          <button
                            data-testid={`button-moderator-${member.id}`}
                            onClick={() => moderatorMutation.mutate({ userId: member.id, isModerator: !member.isModerator })}
                            disabled={moderatorMutation.isPending}
                            className="px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-opacity disabled:opacity-50"
                            style={{
                              background: member.isModerator
                                ? "linear-gradient(135deg, rgba(80,10,80,0.6) 0%, rgba(40,5,40,0.6) 100%)"
                                : "linear-gradient(135deg, rgba(60,20,80,0.4) 0%, rgba(40,10,60,0.4) 100%)",
                              border: member.isModerator
                                ? "1px solid rgba(192,132,252,0.5)"
                                : "1px solid rgba(192,132,252,0.2)",
                              color: member.isModerator ? "#e9d5ff" : "#c084fc",
                              cursor: "pointer",
                            }}
                          >
                            {member.isModerator ? "Remove Mod" : "Make Mod"}
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
                <div>
                  {/* ── Rewards: Tabs ──────────────────────────────────── */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {([
                      { key: "rewards", label: "Rewards" },
                      { key: "welcome", label: "Welcome Bundle" },
                    ] as const).map(t => {
                      const active = rewardsTab === t.key;
                      return (
                        <button
                          key={t.key}
                          data-testid={`tab-rewards-${t.key}`}
                          onClick={() => setRewardsTab(t.key)}
                          className="font-fantasy text-[11px] tracking-wider"
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            cursor: "pointer",
                            background: active
                              ? "linear-gradient(135deg, rgba(192,132,252,0.25) 0%, rgba(168,85,247,0.18) 100%)"
                              : "rgba(0,0,0,0.35)",
                            border: active
                              ? "1px solid rgba(192,132,252,0.6)"
                              : "1px solid rgba(192,132,252,0.2)",
                            color: active ? "#c4b5fd" : "#a89878",
                            boxShadow: active ? "0 0 14px rgba(192,132,252,0.25)" : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {rewardsTab === "rewards" && (
                    <RewardBundleSection members={members.filter(m => !m.isAdmin)} />
                  )}
                  {rewardsTab === "welcome" && <WelcomeBundleSection />}
                </div>
              )}

              {activeSection === "quest" && (
                <QuestAdminSection />
              )}

              {activeSection === "molten_blocks" && (
                <MoltenBlocksItemsSection />
              )}

              {activeSection === "metrics" && (
                <MetricsSection />
              )}

              {activeSection === "recipe_items" && (
                <RecipeItemsSection />
              )}

              {activeSection === "items" && (
                <div>
                  {/* ── Items: Tabs ──────────────────────────────────── */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {([
                      { key: "items", label: "Items" },
                      { key: "fishing", label: "Fishing" },
                    ] as const).map(t => {
                      const active = itemsTab === t.key;
                      return (
                        <button
                          key={t.key}
                          data-testid={`tab-items-${t.key}`}
                          onClick={() => setItemsTab(t.key)}
                          className="font-fantasy text-[11px] tracking-wider"
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            cursor: "pointer",
                            background: active
                              ? "linear-gradient(135deg, rgba(94,234,212,0.25) 0%, rgba(45,212,191,0.18) 100%)"
                              : "rgba(0,0,0,0.35)",
                            border: active
                              ? "1px solid rgba(94,234,212,0.6)"
                              : "1px solid rgba(94,234,212,0.2)",
                            color: active ? "#5eead4" : "#a89878",
                            boxShadow: active ? "0 0 14px rgba(94,234,212,0.25)" : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {itemsTab === "items" && <ItemDatabaseSection mode="items-only" />}
                  {itemsTab === "fishing" && <FishingAdminPanel restrict="supplies" />}
                </div>
              )}

              {activeSection === "pets" && (
                <div>
                  {/* ── Add Character: Tabs ──────────────────────────── */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {([
                      { key: "pet", label: "Pet" },
                      { key: "enemy", label: "Enemy" },
                      { key: "npc", label: "NPC" },
                      { key: "fish", label: "Fish" },
                    ] as const).map(t => {
                      const active = characterTab === t.key;
                      return (
                        <button
                          key={t.key}
                          data-testid={`tab-character-${t.key}`}
                          onClick={() => setCharacterTab(t.key)}
                          className="font-fantasy text-[11px] tracking-wider"
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            cursor: "pointer",
                            background: active
                              ? "linear-gradient(135deg, rgba(251,146,60,0.25) 0%, rgba(234,88,12,0.18) 100%)"
                              : "rgba(0,0,0,0.35)",
                            border: active
                              ? "1px solid rgba(251,146,60,0.6)"
                              : "1px solid rgba(251,146,60,0.2)",
                            color: active ? "#fdba74" : "#a89878",
                            boxShadow: active
                              ? "0 0 14px rgba(251,146,60,0.25)"
                              : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {characterTab === "pet" && (
                    <ItemDatabaseSection
                      mode="pets-only"
                      onOpenParts={(templateId) => setPartsOverlayTemplateId(templateId)}
                    />
                  )}
                  {characterTab === "enemy" && <EnemyDatabasePanel />}
                  {characterTab === "npc" && (
                    <div
                      data-testid="panel-npc-placeholder"
                      style={{
                        padding: "40px 20px",
                        textAlign: "center",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px dashed rgba(94,234,212,0.3)",
                        borderRadius: 10,
                        color: "#a89878",
                      }}
                    >
                      <p className="font-fantasy text-[#5eead4] text-sm mb-2">
                        NPC Database
                      </p>
                      <p className="text-[11px]">
                        Coming soon — NPC management will live here.
                      </p>
                    </div>
                  )}
                  {characterTab === "fish" && <FishingAdminPanel restrict="fish" />}
                </div>
              )}

              {activeSection === "messages" && (
                <SupportMessagesSection />
              )}

              {activeSection === "badges" && (
                <BadgeDatabaseSection members={members.filter(m => !m.isAdmin)} />
              )}

              {activeSection === "emblems" && (
                <EmblemDatabaseSection />
              )}

              {activeSection === "home_bundle" && (
                <HomeBundleSection />
              )}

              {activeSection === "purchases" && (
                <CoinPurchasesSection />
              )}

              {activeSection === "maintenance" && (
                <MaintenanceSection />
              )}

              {activeSection === "veridian_watcher" && (
                <div>
                  {/* ── Veridian Watcher: Tabs ─────────────────────────── */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {([
                      { key: "watcher", label: "Watcher" },
                      { key: "chat_filter", label: "Chat Filter" },
                    ] as const).map(t => {
                      const active = watcherTab === t.key;
                      return (
                        <button
                          key={t.key}
                          data-testid={`tab-watcher-${t.key}`}
                          onClick={() => setWatcherTab(t.key)}
                          className="font-fantasy text-[11px] tracking-wider"
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            cursor: "pointer",
                            background: active
                              ? "linear-gradient(135deg, rgba(94,234,212,0.25) 0%, rgba(45,212,191,0.18) 100%)"
                              : "rgba(0,0,0,0.35)",
                            border: active
                              ? "1px solid rgba(94,234,212,0.6)"
                              : "1px solid rgba(94,234,212,0.2)",
                            color: active ? "#5eead4" : "#a89878",
                            boxShadow: active ? "0 0 14px rgba(94,234,212,0.25)" : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {watcherTab === "watcher" && (
                    <VeridianWatcherSection currentUsername={user.username} />
                  )}
                  {watcherTab === "chat_filter" && (
                    <ChatFilterSection currentUsername={user.username} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Pet Parts Editor Overlay ──────────────────────────────────────── */}
      {partsOverlayTemplateId && (
        <div
          data-testid="overlay-pet-parts"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            background: "rgba(0,0,0,0.92)",
            overflowY: "auto",
            padding: "16px",
          }}
        >
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              position: "relative",
            }}
          >
            <button
              data-testid="button-close-pet-parts"
              onClick={() => setPartsOverlayTemplateId(null)}
              className="font-fantasy text-[11px] tracking-wider"
              style={{
                marginBottom: 12,
                padding: "8px 14px",
                borderRadius: 8,
                background: "linear-gradient(135deg, rgba(94,234,212,0.22) 0%, rgba(45,212,191,0.16) 100%)",
                border: "1px solid rgba(94,234,212,0.5)",
                color: "#5eead4",
                cursor: "pointer",
              }}
            >
              ← Back to Pet
            </button>
            <PetDatabasePanel
              key={partsOverlayTemplateId}
              initialTemplateId={partsOverlayTemplateId}
            />
          </div>
        </div>
      )}

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

      {/* ── Ban Modal ─────────────────────────────────────────────────────── */}
      {banModalUserId && (() => {
        const target = members.find(m => m.id === banModalUserId);
        if (!target) return null;
        return (
          <div
            data-testid="modal-ban"
            style={{
              position: "fixed", inset: 0, zIndex: 99999,
              background: "rgba(0,0,0,0.75)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 16,
            }}
            onClick={e => { if (e.target === e.currentTarget) { setBanModalUserId(null); setDeleteConfirm(false); } }}
          >
            <div
              style={{
                background: "linear-gradient(160deg, #1a0d04 0%, #100805 100%)",
                border: "1px solid rgba(212,160,23,0.35)",
                borderRadius: 14,
                padding: "20px 20px 16px",
                width: "100%", maxWidth: 360,
                boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-fantasy text-[#f0c040] text-sm font-bold">Banish Actions</p>
                  <p className="text-[#a89878] text-[10px] mt-0.5">@{target.username}</p>
                </div>
                <button
                  data-testid="button-close-ban-modal"
                  onClick={() => { setBanModalUserId(null); setDeleteConfirm(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(168,152,120,0.6)", fontSize: 18, lineHeight: 1, padding: 4 }}
                >✕</button>
              </div>

              {/* ── Temporary Ban ─────────────────────────────────── */}
              <div
                style={{
                  background: "rgba(139,0,0,0.15)",
                  border: "1px solid rgba(200,50,50,0.25)",
                  borderRadius: 10,
                  padding: "14px 14px 12px",
                  marginBottom: 10,
                }}
              >
                <p className="font-fantasy text-[#ff9999] text-[11px] tracking-wider mb-1">Temporary Ban</p>
                <p className="text-[#a89878] text-[9px] mb-3 leading-relaxed">
                  The account will be automatically unbanned after the set number of days.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="input-ban-days"
                    type="number"
                    min={1}
                    max={3650}
                    value={banDays}
                    onChange={e => setBanDays(e.target.value)}
                    placeholder="Days (e.g. 7)"
                    style={{
                      flex: 1,
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid rgba(200,50,50,0.35)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      color: "#f0c040",
                      outline: "none",
                    }}
                  />
                  <button
                    data-testid="button-apply-temp-ban"
                    onClick={() => {
                      const d = parseInt(banDays, 10);
                      if (!d || d < 1) return;
                      banMutation.mutate({ userId: banModalUserId, ban: true, days: d });
                    }}
                    disabled={!banDays || parseInt(banDays, 10) < 1 || banMutation.isPending}
                    className="font-fantasy text-[10px] tracking-wider disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, rgba(139,0,0,0.7) 0%, rgba(80,0,0,0.7) 100%)",
                      border: "1px solid rgba(200,50,50,0.5)",
                      borderRadius: 6,
                      padding: "6px 12px",
                      color: "#ff9999",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Apply Ban
                  </button>
                </div>
              </div>

              {/* ── Permanent Delete ──────────────────────────────── */}
              <div
                style={{
                  background: "rgba(60,10,10,0.3)",
                  border: "1px solid rgba(180,30,30,0.3)",
                  borderRadius: 10,
                  padding: "14px 14px 12px",
                }}
              >
                <p className="font-fantasy text-[#ff6666] text-[11px] tracking-wider mb-1">Delete Account Permanently</p>
                <p className="text-[#a89878] text-[9px] mb-3 leading-relaxed">
                  All account data will be erased. The email address will be blocked from registering a new account for <span style={{ color: "#f0c040" }}>30 days</span>.
                </p>
                {!deleteConfirm ? (
                  <button
                    data-testid="button-delete-account-confirm"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full font-fantasy text-[10px] tracking-wider"
                    style={{
                      background: "rgba(100,10,10,0.5)",
                      border: "1px solid rgba(180,30,30,0.4)",
                      borderRadius: 6,
                      padding: "7px 12px",
                      color: "#ff6666",
                      cursor: "pointer",
                    }}
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-center" style={{ color: "#ff9999" }}>
                      Are you sure? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        data-testid="button-delete-account-final"
                        onClick={() => deleteAccountMutation.mutate(banModalUserId)}
                        disabled={deleteAccountMutation.isPending}
                        className="flex-1 font-fantasy text-[10px] tracking-wider disabled:opacity-40"
                        style={{
                          background: "linear-gradient(135deg, #8b0000 0%, #500000 100%)",
                          border: "1px solid rgba(200,50,50,0.6)",
                          borderRadius: 6,
                          padding: "7px",
                          color: "#ff9999",
                          cursor: "pointer",
                        }}
                      >
                        {deleteAccountMutation.isPending ? "Deleting…" : "Yes, Delete"}
                      </button>
                      <button
                        data-testid="button-delete-cancel"
                        onClick={() => setDeleteConfirm(false)}
                        className="font-fantasy text-[10px] tracking-wider"
                        style={{
                          background: "rgba(40,30,15,0.6)",
                          border: "1px solid rgba(212,160,23,0.25)",
                          borderRadius: 6,
                          padding: "7px 14px",
                          color: "#a89878",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
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
      // Mirror the server's fallback chain (see /api/admin/welcome-bundle):
      // pets store their art under eggImageUrl, etc. Picking the best
      // available URL up front means the row renders the actual icon
      // instead of a "?" placeholder until the next refetch.
      const resolvedImage =
        shopItem.imageUrl
        || (shopItem as any).eggImageUrl
        || (shopItem as any).hatchedImageUrl
        || null;
      setItems(prev => [...prev, { name: shopItem.name, qty: 1, found: true, imageUrl: resolvedImage, type: shopItem.type, effect: getItemEffectText(shopItem) }]);
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
  // Each selected item now carries a quantity so the admin can type
  // "50" once instead of clicking "+ Add Item" fifty times. On send we
  // expand the list back into a flat array of shopItemIds (the backend
  // contract is unchanged — it iterates the array and adds one bundle
  // entry per id).
  const [selectedItems, setSelectedItems] = useState<Array<{ item: ShopItemFull; qty: number }>>([]);
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
      // Expand quantities into a flat id list so each "qty: 50 bag of coins"
      // becomes 50 entries in the bundle (matches the existing backend
      // contract). Cap each qty at 999 as a sanity guard.
      const shopItemIds: string[] = [];
      for (const { item, qty } of selectedItems) {
        const n = Math.max(1, Math.min(999, Math.floor(qty || 1)));
        for (let i = 0; i < n; i++) shopItemIds.push(item.id);
      }
      const payload: any = {
        name: bundleName.trim(),
        message: bundleMessage.trim() || undefined,
        coinAmount: parseInt(coinAmount) || 0,
        shopItemIds,
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

  const setItemQty = (index: number, qty: number) => {
    setSelectedItems(prev =>
      prev.map((entry, i) =>
        i === index ? { ...entry, qty: Math.max(1, Math.min(999, Math.floor(qty || 1))) } : entry
      )
    );
  };

  const totalItemCount = selectedItems.reduce((sum, e) => sum + (e.qty || 1), 0);

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
              <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
                Items ({selectedItems.length} types · {totalItemCount} total)
              </label>
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
              <div className="flex flex-wrap gap-2">
                {selectedItems.map(({ item, qty }, idx) => {
                  const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
                      style={{ background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.3)" }}
                    >
                      {displayImg ? (
                        <img src={displayImg} alt="" className="w-6 h-6 object-contain rounded-sm" />
                      ) : (
                        <span className="text-xs">{item.type === "pet" ? "🥚" : "📦"}</span>
                      )}
                      <span className="font-fantasy text-[#e0d0f0] text-[9px] max-w-[80px] truncate">{item.name}</span>
                      {/* Quantity stepper — admin can tap +/- or type the
                          number directly into the field. Caps at 999 per
                          item which is plenty for any single bundle. */}
                      <div className="flex items-center gap-0.5 ml-0.5" style={{ background: "rgba(0,0,0,0.35)", borderRadius: 4, padding: "1px 2px" }}>
                        <button
                          data-testid={`button-bundle-qty-dec-${idx}`}
                          onClick={() => setItemQty(idx, qty - 1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[#c4b5fd] active:scale-90"
                          style={{ background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.3)", cursor: "pointer", lineHeight: 1, fontWeight: "bold" }}
                        >−</button>
                        <input
                          data-testid={`input-bundle-qty-${idx}`}
                          type="number"
                          min={1}
                          max={999}
                          value={qty}
                          onChange={(e) => setItemQty(idx, parseInt(e.target.value, 10) || 1)}
                          className="w-10 text-center font-fantasy text-[11px] outline-none rounded"
                          style={{ background: "rgba(242,232,208,0.95)", color: "#2a1a0a", border: "1px solid #8b5e3c", padding: "1px 2px", MozAppearance: "textfield" }}
                        />
                        <button
                          data-testid={`button-bundle-qty-inc-${idx}`}
                          onClick={() => setItemQty(idx, qty + 1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[#c4b5fd] active:scale-90"
                          style={{ background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.3)", cursor: "pointer", lineHeight: 1, fontWeight: "bold" }}
                        >+</button>
                      </div>
                      <button
                        data-testid={`button-bundle-remove-${idx}`}
                        onClick={() => removeItem(idx)}
                        className="text-[#ff9999] text-[12px] ml-0.5"
                        style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
                      >
                        ×
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
            // If the item is already in the bundle, just bump its quantity
            // by 1 instead of adding a duplicate row — the admin can then
            // type the exact quantity they want into the chip.
            setSelectedItems(prev => {
              const existing = prev.findIndex(e => e.item.id === item.id);
              if (existing >= 0) {
                return prev.map((e, i) => i === existing ? { ...e, qty: Math.min(999, (e.qty || 1) + 1) } : e);
              }
              return [...prev, { item, qty: 1 }];
            });
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
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});

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

  const respondMutation = useMutation({
    mutationFn: async ({ id, response, username, subject }: { id: string; response: string; username: string; subject: string }) => {
      await apiRequest("POST", `/api/admin/support-messages/${id}/respond`, { response, username, subject });
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Response Sent", description: "Your reply has been delivered to the player." });
      setRespondingId(null);
      setResponseText(prev => ({ ...prev, [variables.id]: "" }));
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send response", variant: "destructive" });
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
        const isResponding = respondingId === msg.id;
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
                if (isExpanded) setRespondingId(null);
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

                {isResponding ? (
                  <div className="space-y-2">
                    <div className="rounded-md p-2.5" style={{ background: "rgba(20,40,20,0.3)", border: "1px solid rgba(100,200,100,0.2)" }}>
                      <p className="font-fantasy text-[#a89878] text-[9px] tracking-wider mb-1.5">YOUR RESPONSE TO {msg.username.toUpperCase()}</p>
                      <textarea
                        data-testid={`textarea-response-${msg.id}`}
                        value={responseText[msg.id] || ""}
                        onChange={e => setResponseText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                        placeholder="Type your response here..."
                        rows={4}
                        className="w-full rounded-md px-2 py-1.5 font-sans text-xs resize-none focus:outline-none"
                        style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(168,152,120,0.3)", color: "#d4b896" }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        data-testid={`button-cancel-respond-${msg.id}`}
                        onClick={() => setRespondingId(null)}
                        className="px-3 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                        style={{ background: "rgba(40,30,20,0.4)", border: "1px solid rgba(168,152,120,0.2)", color: "#a89878", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid={`button-send-response-${msg.id}`}
                        onClick={() => {
                          const text = (responseText[msg.id] || "").trim();
                          if (!text) return;
                          respondMutation.mutate({ id: msg.id, response: text, username: msg.username, subject: msg.subject });
                        }}
                        disabled={respondMutation.isPending || !(responseText[msg.id] || "").trim()}
                        className="px-3 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                        style={{ background: "rgba(20,80,20,0.4)", border: "1px solid rgba(100,200,100,0.3)", color: "#88dd88", cursor: "pointer", opacity: !(responseText[msg.id] || "").trim() ? 0.5 : 1 }}
                      >
                        {respondMutation.isPending ? "Sending..." : "Send Response"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <button
                      data-testid={`button-respond-${msg.id}`}
                      onClick={() => setRespondingId(msg.id)}
                      className="px-3 py-1.5 rounded-md font-fantasy text-[9px] tracking-wider"
                      style={{ background: "rgba(20,60,80,0.4)", border: "1px solid rgba(100,180,220,0.3)", color: "#88ccee", cursor: "pointer" }}
                    >
                      Respond
                    </button>
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
                )}
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
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<string | null>(null);

  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [editingRewardVal, setEditingRewardVal] = useState<string>("");
  const [viewingBadge, setViewingBadge] = useState<AdminBadge | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addPlayerSearch, setAddPlayerSearch] = useState("");
  const [editingBadge, setEditingBadge] = useState<AdminBadge | null>(null);
  const [editName, setEditName] = useState("");
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
    staleTime: 0,
    refetchOnMount: true,
  });

  const awardBadgeMutation = useMutation({
    mutationFn: async ({ badgeId, userId }: { badgeId: string; userId: string }) => {
      return apiRequest("POST", `/api/admin/badges/${badgeId}/award`, { userIds: [userId] });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/badges", variables.badgeId, "recipients"] });
      toast({ title: "Badge awarded!" });
      setAddPlayerSearch("");
      setShowAddPlayer(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!uploadName.trim() || !uploadData) throw new Error("Missing data");
      const dailyRewardCoins = uploadDailyReward.trim() ? parseInt(uploadDailyReward.trim(), 10) : null;
      return apiRequest("POST", "/api/admin/badges", { name: uploadName.trim(), imageData: uploadData, dailyRewardCoins, claimType: uploadClaimType });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/badges"] });
      setShowUpload(false);
      setUploadName("");
      setUploadDailyReward("");
      setUploadClaimType("daily");
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

  const editBadgeMutation = useMutation({
    mutationFn: ({ id, name, claimType, dailyRewardCoins, imageData }: { id: string; name: string; claimType: string; dailyRewardCoins: number | null; imageData: string | null }) =>
      apiRequest("PATCH", `/api/admin/badges/${id}`, { name, claimType, dailyRewardCoins, ...(imageData ? { imageData } : {}) }),
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
              <div className="flex gap-1.5 w-full">
                <button
                  data-testid={`button-edit-badge-${badge.id}`}
                  onClick={() => { setEditingBadge(badge); setEditName(badge.name); setEditClaimType((badge.claimType === "weekly" ? "weekly" : "daily")); setEditDailyReward(badge.dailyRewardCoins != null ? String(badge.dailyRewardCoins) : ""); setEditImageData(null); setEditImagePreview(null); }}
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
          <div className="absolute inset-0 bg-black/70" onClick={() => { setViewingBadge(null); setShowAddPlayer(false); setAddPlayerSearch(""); }} />
          <div className="relative flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: "rgba(8,4,0,0.95)", borderBottom: "1px solid rgba(255,215,0,0.15)" }}>
              <button
                data-testid="button-close-recipients"
                onClick={() => { setViewingBadge(null); setShowAddPlayer(false); setAddPlayerSearch(""); }}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,215,0,0.3)", color: "#ffd700", cursor: "pointer" }}
              >✕</button>
              <img src={viewingBadge.imageUrl} alt={viewingBadge.name} className="w-9 h-9 rounded-full object-contain" style={{ border: "1.5px solid rgba(255,215,0,0.4)" }} />
              <div className="flex flex-col min-w-0 flex-1">
                <p className="font-fantasy text-[12px] tracking-wider" style={{ color: "#ffd700" }}>{viewingBadge.name}</p>
                <p className="font-fantasy text-[9px]" style={{ color: "#6a5840" }}>
                  {recipientsLoading ? "Loading..." : `${recipients.length} holder${recipients.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                data-testid="button-add-player-badge"
                onClick={() => { setShowAddPlayer(!showAddPlayer); setAddPlayerSearch(""); }}
                className="px-3 py-1.5 rounded-lg font-fantasy text-[10px] tracking-wide shrink-0"
                style={{
                  background: showAddPlayer ? "rgba(255,215,0,0.2)" : "rgba(255,215,0,0.1)",
                  border: "1px solid rgba(255,215,0,0.3)",
                  color: "#ffd700",
                  cursor: "pointer",
                }}
              >{showAddPlayer ? "Cancel" : "+ Add Player"}</button>
            </div>
            {showAddPlayer && (
              <div className="px-4 py-3" style={{ background: "rgba(8,4,0,0.95)", borderBottom: "1px solid rgba(255,215,0,0.1)" }}>
                <input
                  data-testid="input-search-player-badge"
                  type="text"
                  placeholder="Search player by username..."
                  value={addPlayerSearch}
                  onChange={(e) => setAddPlayerSearch(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 font-fantasy text-[11px]"
                  style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.15)", color: "#ffd700", outline: "none" }}
                  autoFocus
                />
                {addPlayerSearch.trim().length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {(() => {
                      const recipientIds = new Set(recipients.map((r) => r.userId));
                      const filtered = members.filter(
                        (m) => m.username.toLowerCase().includes(addPlayerSearch.toLowerCase()) && !recipientIds.has(m.id)
                      );
                      if (filtered.length === 0) {
                        return <p className="font-fantasy text-[10px] py-2 text-center" style={{ color: "#6a5840" }}>No matching players found</p>;
                      }
                      return filtered.slice(0, 20).map((m) => (
                        <button
                          key={m.id}
                          data-testid={`button-award-badge-${m.id}`}
                          onClick={() => awardBadgeMutation.mutate({ badgeId: viewingBadge!.id, userId: m.id })}
                          disabled={awardBadgeMutation.isPending}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 w-full text-left"
                          style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.08)", cursor: "pointer" }}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                            style={{ background: "rgba(255,215,0,0.1)", border: "1.5px solid rgba(255,215,0,0.25)" }}
                          >
                            {m.profileImage ? (
                              <img src={m.profileImage} alt={m.username} className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-fantasy text-xs" style={{ color: "#ffd700" }}>{m.username[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <p className="font-fantasy text-[11px] tracking-wide truncate flex-1" style={{ color: "#ffd700" }}>{m.username}</p>
                          <span className="font-fantasy text-[9px] shrink-0" style={{ color: "#4a7c4a" }}>Award</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
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
              maxHeight: "calc(80*var(--vh))",
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
                onClick={() => editBadgeMutation.mutate({ id: editingBadge.id, name: editName, claimType: editClaimType, dailyRewardCoins: editDailyReward.trim() ? parseInt(editDailyReward.trim(), 10) : null, imageData: editImageData })}
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

interface CrashEntry {
  id: number;
  type: "crash" | "unhandled" | "error";
  msg: string;
  source: string;
  url: string;
  ua: string;
  ts: string;
  userId?: string;
}

function MaintenanceSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ summary: string; cleaned: number; totalRows: number; ranAt: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [crashLog, setCrashLog] = useState<CrashEntry[] | null>(null);
  const [crashTotal, setCrashTotal] = useState(0);
  const [loadingCrash, setLoadingCrash] = useState(false);
  const [clearingCrash, setClearingCrash] = useState(false);
  const [crashExpanded, setCrashExpanded] = useState<number | null>(null);

  const fetchCrashLog = async () => {
    setLoadingCrash(true);
    try {
      const res = await apiRequest("GET", "/api/admin/client-errors");
      const data = await res.json();
      setCrashLog(data.entries ?? []);
      setCrashTotal(data.total ?? 0);
    } catch (err: any) {
      toast({ title: "Failed to load crash log", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCrash(false);
    }
  };

  const clearCrashLog = async () => {
    setClearingCrash(true);
    try {
      await apiRequest("DELETE", "/api/admin/client-errors");
      setCrashLog([]);
      setCrashTotal(0);
      toast({ title: "Crash log cleared" });
    } catch (err: any) {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    } finally {
      setClearingCrash(false);
    }
  };

  useEffect(() => { fetchCrashLog(); }, []);

  const { data: maintenanceData, isLoading: maintenanceLoading } = useQuery<{ maintenance: boolean }>({
    queryKey: ["/api/maintenance-status"],
    staleTime: 10 * 1000,
  });
  const maintenanceOn = maintenanceData?.maintenance === true;

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/maintenance", { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/maintenance-status"], { maintenance: data.maintenance });
      toast({
        title: data.maintenance ? "Maintenance mode ON" : "Maintenance mode OFF",
        description: data.maintenance
          ? "Players are now blocked from logging in."
          : "The realm is open — players can log in again.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const runCleanup = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/cleanup-orphans", {});
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      toast({ title: "Cleanup failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5 py-2">

      {/* ── Maintenance Mode Toggle ── */}
      <div
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{
          background: maintenanceOn
            ? "linear-gradient(145deg, rgba(60,10,10,0.9) 0%, rgba(90,14,14,0.9) 100%)"
            : "linear-gradient(145deg, rgba(8,30,20,0.9) 0%, rgba(12,50,30,0.9) 100%)",
          border: maintenanceOn
            ? "1px solid rgba(252,165,165,0.4)"
            : "1px solid rgba(110,231,183,0.3)",
          boxShadow: maintenanceOn
            ? "0 0 20px rgba(200,50,50,0.1)"
            : "0 0 20px rgba(110,231,183,0.06)",
          transition: "all 0.4s ease",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p
              className="font-fantasy text-sm tracking-wide"
              style={{ color: maintenanceOn ? "#fca5a5" : "#6ee7b7" }}
            >
              Maintenance Mode
            </p>
            <p
              className="font-fantasy text-[10px] tracking-wider"
              style={{ color: maintenanceOn ? "#7a3030" : "#2a5a3a" }}
            >
              {maintenanceLoading ? "Checking status..." : maintenanceOn ? "Realm is closed to players" : "Realm is open to all"}
            </p>
          </div>

          {/* Toggle switch */}
          <button
            data-testid="button-toggle-maintenance"
            onClick={() => toggleMutation.mutate(!maintenanceOn)}
            disabled={maintenanceLoading || toggleMutation.isPending}
            className="relative flex-shrink-0"
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              background: maintenanceOn
                ? "linear-gradient(135deg, #8b1a1a, #c0392b)"
                : "linear-gradient(135deg, #1a5c38, #27ae60)",
              border: maintenanceOn ? "1px solid rgba(252,165,165,0.5)" : "1px solid rgba(110,231,183,0.5)",
              boxShadow: maintenanceOn ? "0 0 10px rgba(200,50,50,0.3)" : "0 0 10px rgba(39,174,96,0.3)",
              cursor: (maintenanceLoading || toggleMutation.isPending) ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              opacity: (maintenanceLoading || toggleMutation.isPending) ? 0.5 : 1,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 3,
                left: maintenanceOn ? 26 : 3,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                transition: "left 0.3s ease",
              }}
            />
          </button>
        </div>

        {maintenanceOn && (
          <p
            className="font-fantasy text-[10px] tracking-wider text-center"
            style={{ color: "#7a3030" }}
          >
            Admins can still access the realm normally.
          </p>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
        <p className="font-fantasy text-[10px] text-[#4a3a28] tracking-wider">Database Tools</p>
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
      </div>

      {/* ── Crash & Error Log ── */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(145deg, rgba(10,4,20,0.97) 0%, rgba(18,6,30,0.97) 100%)",
        border: "1px solid rgba(248,113,113,0.2)",
      }}>
        {/* Header row */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="font-fantasy text-sm tracking-wide" style={{ color: "#fca5a5" }}>
              Crash &amp; Debug Log
            </p>
            <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#4a2a2a" }}>
              Client-side errors, unhandled rejections, and crashes — since last server restart
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              data-testid="button-refresh-crash-log"
              onClick={fetchCrashLog}
              disabled={loadingCrash}
              className="rounded-lg px-2.5 py-1 font-fantasy text-[9px] tracking-wider"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.25)",
                color: loadingCrash ? "#5a2a2a" : "#fca5a5",
                cursor: loadingCrash ? "not-allowed" : "pointer",
              }}
            >
              {loadingCrash ? "Loading…" : "Refresh"}
            </button>
            {crashLog && crashLog.length > 0 && (
              <button
                data-testid="button-clear-crash-log"
                onClick={clearCrashLog}
                disabled={clearingCrash}
                className="rounded-lg px-2.5 py-1 font-fantasy text-[9px] tracking-wider"
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  color: clearingCrash ? "#5a2a2a" : "#f87171",
                  cursor: clearingCrash ? "not-allowed" : "pointer",
                }}
              >
                {clearingCrash ? "Clearing…" : "Clear All"}
              </button>
            )}
          </div>
        </div>

        {/* Summary count */}
        {crashLog !== null && (
          <div className="px-4 pb-2 flex items-center gap-2">
            <span className="font-fantasy text-lg leading-none" style={{ color: crashTotal > 0 ? "#f87171" : "#6ee7b7" }}>
              {crashTotal}
            </span>
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: crashTotal > 0 ? "#6a2a2a" : "#2a6a44" }}>
              {crashTotal === 0 ? "no errors recorded — all clear" : crashTotal === 1 ? "error recorded" : "errors recorded"}
            </span>
            {crashTotal > 0 && (() => {
              const crashes   = crashLog?.filter(e => e.type === "crash").length ?? 0;
              const unhandled = crashLog?.filter(e => e.type === "unhandled").length ?? 0;
              const errors    = crashLog?.filter(e => e.type === "error").length ?? 0;
              return (
                <div className="flex items-center gap-1.5 ml-1">
                  {crashes   > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(248,113,113,0.18)", color: "#fca5a5", border: "1px solid rgba(248,113,113,0.3)" }}>{crashes} crash</span>}
                  {unhandled > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(251,191,36,0.18)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>{unhandled} unhandled</span>}
                  {errors    > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(253,224,71,0.18)", color: "#fde047", border: "1px solid rgba(253,224,71,0.3)" }}>{errors} window error</span>}
                </div>
              );
            })()}
          </div>
        )}

        {/* Entry list */}
        {loadingCrash && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(248,113,113,0.12)" }}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "rgba(248,113,113,0.3)", animation: "pp-glow-pulse 1s ease-in-out infinite" }} />
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#5a2a2a" }}>Loading error log…</span>
          </div>
        )}

        {!loadingCrash && crashLog !== null && crashLog.length > 0 && (
          <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(248,113,113,0.12)", maxHeight: 320, overflowY: "auto" }}>
            {crashLog.map((entry, idx) => {
              const typeColor = entry.type === "crash" ? { bg: "rgba(248,113,113,0.12)", badge: "#fca5a5", badgeBg: "rgba(248,113,113,0.2)", label: "CRASH" }
                : entry.type === "unhandled" ? { bg: "rgba(251,191,36,0.08)", badge: "#fbbf24", badgeBg: "rgba(251,191,36,0.18)", label: "UNHANDLED" }
                : { bg: "rgba(253,224,71,0.06)", badge: "#fde047", badgeBg: "rgba(253,224,71,0.14)", label: "ERROR" };
              const isExpanded = crashExpanded === entry.id;
              const ago = (() => {
                const diff = Date.now() - new Date(entry.ts).getTime();
                const s = Math.floor(diff / 1000);
                if (s < 60)  return `${s}s ago`;
                if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                return new Date(entry.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              })();
              const browser = (() => {
                const ua = entry.ua;
                if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
                if (/Edg\//.test(ua)) return "Edge";
                if (/Firefox\//.test(ua)) return "Firefox";
                if (/Safari\//.test(ua)) return "Safari";
                return "Unknown";
              })();
              return (
                <div
                  key={entry.id}
                  style={{
                    background: typeColor.bg,
                    borderBottom: idx < crashLog.length - 1 ? "1px solid rgba(248,113,113,0.08)" : "none",
                  }}
                >
                  {/* Collapsed row */}
                  <button
                    className="w-full px-3 py-2 flex items-start gap-2 text-left"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    onClick={() => setCrashExpanded(isExpanded ? null : entry.id)}
                  >
                    <span className="font-fantasy text-[8px] tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5"
                      style={{ background: typeColor.badgeBg, color: typeColor.badge }}>
                      {typeColor.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-[10px] tracking-wide truncate" style={{ color: typeColor.badge }}>
                        {entry.msg || "(no message)"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-fantasy text-[8px]" style={{ color: "#3a1a1a" }}>{ago}</span>
                        {entry.url && <span className="font-fantasy text-[8px] truncate" style={{ color: "#3a1a1a" }}>{entry.url}</span>}
                        <span className="font-fantasy text-[8px]" style={{ color: "#3a1a1a" }}>{browser}</span>
                        {entry.userId && <span className="font-fantasy text-[8px]" style={{ color: "#5a2a2a" }}>uid:{entry.userId.slice(0,8)}</span>}
                      </div>
                    </div>
                    <span style={{ color: "#3a1a1a", fontSize: 10, flexShrink: 0, marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                        <p className="font-fantasy text-[8px] tracking-wider mb-1" style={{ color: "#5a2a2a" }}>MESSAGE</p>
                        <p className="text-[10px] leading-relaxed break-words" style={{ color: typeColor.badge, fontFamily: "monospace" }}>{entry.msg}</p>
                      </div>
                      {entry.source && (
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-1" style={{ color: "#5a2a2a" }}>SOURCE</p>
                          <p className="text-[9px] leading-relaxed break-words" style={{ color: "rgba(252,165,165,0.5)", fontFamily: "monospace" }}>{entry.source}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>TIME</p>
                          <p className="font-fantasy text-[9px]" style={{ color: "#7a3a3a" }}>{new Date(entry.ts).toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>BROWSER</p>
                          <p className="font-fantasy text-[9px]" style={{ color: "#7a3a3a" }}>{browser}</p>
                        </div>
                      </div>
                      {entry.ua && (
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>USER AGENT</p>
                          <p className="text-[8px] break-all leading-relaxed" style={{ color: "#3a1a1a", fontFamily: "monospace" }}>{entry.ua}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loadingCrash && crashLog !== null && crashLog.length === 0 && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-2"
            style={{ background: "rgba(8,40,24,0.6)", border: "1px solid rgba(110,231,183,0.2)" }}
          >
            <span style={{ fontSize: 14 }}>✓</span>
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#2a6a44" }}>No errors recorded since last server restart</span>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
        <p className="font-fantasy text-[10px] text-[#4a3a28] tracking-wider">Database Tools</p>
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
      </div>

      {/* ── Orphan Cleanup ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(20,12,28,0.95) 0%, rgba(30,16,40,0.95) 100%)",
          border: "1px solid rgba(249,168,212,0.2)",
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex flex-col gap-1">
          <p className="font-fantasy text-sm tracking-wide" style={{ color: "#f9a8d4" }}>
            Orphaned Row Cleanup
          </p>
          <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#5a3a50" }}>
            Removes rows left behind when items, bundles, or templates were deleted
          </p>
        </div>

        {/* Result display — shown before button once run */}
        {result && (
          <div
            className="mx-3 mb-3 rounded-xl p-3 flex flex-col gap-2"
            style={{
              background: result.totalRows > 0
                ? "linear-gradient(135deg, rgba(60,20,50,0.8) 0%, rgba(80,24,60,0.8) 100%)"
                : "linear-gradient(135deg, rgba(8,40,24,0.8) 0%, rgba(12,60,36,0.8) 100%)",
              border: `1px solid ${result.totalRows > 0 ? "rgba(249,168,212,0.3)" : "rgba(110,231,183,0.3)"}`,
            }}
          >
            {/* Big number + status */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span
                  className="font-fantasy text-2xl leading-none"
                  style={{ color: result.totalRows > 0 ? "#f9a8d4" : "#6ee7b7" }}
                >
                  {result.totalRows}
                </span>
                <span
                  className="font-fantasy text-[10px] tracking-wider mt-0.5"
                  style={{ color: result.totalRows > 0 ? "#8a4870" : "#2a6a44" }}
                >
                  {result.totalRows === 1 ? "orphaned row removed" : result.totalRows > 0 ? "orphaned rows removed" : "orphaned rows — database is clean"}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className="font-fantasy text-[10px] tracking-wider"
                  style={{ color: result.totalRows > 0 ? "#8a4870" : "#2a6a44" }}
                >
                  {result.cleaned} table{result.cleaned !== 1 ? "s" : ""} affected
                </span>
                <span className="font-fantasy text-[9px]" style={{ color: "#3a2a40" }}>
                  {new Date(result.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Per-table breakdown */}
            {result.totalRows > 0 && (
              <div
                className="rounded-lg p-2 flex flex-col gap-1"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                {result.summary.split("\n").map((line, i) => {
                  const match = line.match(/^(.+?):\s*(\d+)\s*row/);
                  if (!match) return null;
                  const [, label, count] = match;
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-fantasy text-[9px] tracking-wide" style={{ color: "#7a5870" }}>
                        {label.trim()}
                      </span>
                      <span className="font-fantasy text-[10px]" style={{ color: "#f9a8d4" }}>
                        -{count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Running state indicator */}
        {running && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(249,168,212,0.15)" }}
          >
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{
                background: "rgba(249,168,212,0.3)",
                animation: "pp-glow-pulse 1s ease-in-out infinite",
              }}
            />
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#7a5870" }}>
              Scanning all tables for orphaned rows...
            </span>
          </div>
        )}

        {/* Button */}
        <div className="px-3 pb-4">
          <button
            data-testid="button-cleanup-orphans"
            onClick={runCleanup}
            disabled={running}
            className="w-full py-2.5 rounded-xl font-fantasy text-xs tracking-wider"
            style={{
              background: running ? "rgba(0,0,0,0.2)" : "linear-gradient(135deg, rgba(61,10,46,0.9), rgba(107,16,80,0.9))",
              border: "1px solid rgba(249,168,212,0.35)",
              color: running ? "#3a1a30" : "#f9a8d4",
              cursor: running ? "not-allowed" : "pointer",
              boxShadow: running ? "none" : "0 0 14px rgba(249,168,212,0.1)",
            }}
          >
            {running ? "Scanning..." : result ? "Run Again" : "Clean Up Orphaned Rows"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Veridian Watcher Section ─────────────────────────────────────────────────
interface VWQuote {
  id: string;
  message: string;
  addedBy?: string | null;
  createdAt: string;
}

function VeridianWatcherSection({ currentUsername }: { currentUsername: string }) {
  const [newQuote, setNewQuote] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const ACCENT = "#5eead4";

  const { data: quotes = [], isLoading } = useQuery<VWQuote[]>({
    queryKey: ["/api/admin/vw-quotes"],
  });

  const addMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/admin/vw-quotes", { message }),
    onSuccess: () => {
      setNewQuote("");
      qc.invalidateQueries({ queryKey: ["/api/admin/vw-quotes"] });
      toast({ title: "Quote added" });
    },
    onError: () => {
      toast({ title: "Failed to add quote", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/vw-quotes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/vw-quotes"] });
    },
    onError: () => {
      toast({ title: "Failed to delete quote", variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col gap-4 px-2 pb-4">
      {/* Description */}
      <div
        className="rounded-xl p-3"
        style={{ background: "rgba(94,234,212,0.06)", border: "1px solid rgba(94,234,212,0.18)" }}
      >
        <p className="font-fantasy text-xs tracking-wider mb-1" style={{ color: ACCENT }}>👁️ About the Veridian Watcher</p>
        <p className="font-sans text-xs leading-relaxed" style={{ color: "rgba(200,184,150,0.7)" }}>
          The Watcher is a bot that posts motivational quotes to World Chat every hour. It also welcomes new verified players and congratulates players who acquire rare (4★+) pets.
        </p>
      </div>

      {/* Add new quote */}
      <div
        className="rounded-xl p-3 flex flex-col gap-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(94,234,212,0.2)" }}
      >
        <p className="font-fantasy text-xs tracking-wider" style={{ color: ACCENT }}>Add Hourly Quote</p>
        <textarea
          data-testid="input-new-vw-quote"
          value={newQuote}
          onChange={e => setNewQuote(e.target.value.slice(0, 280))}
          placeholder="Enter a motivational quote or message..."
          rows={3}
          className="w-full font-sans text-xs rounded-lg px-3 py-2 resize-none"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(94,234,212,0.25)",
            color: "#e8dcc8",
            outline: "none",
            lineHeight: 1.5,
          }}
        />
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 9, color: "rgba(200,184,150,0.4)" }}>{newQuote.length}/280</span>
          <button
            data-testid="button-add-vw-quote"
            onClick={() => { if (newQuote.trim()) addMutation.mutate(newQuote.trim()); }}
            disabled={!newQuote.trim() || addMutation.isPending}
            className="px-4 py-1.5 rounded-lg font-fantasy text-xs"
            style={{
              background: "rgba(94,234,212,0.15)",
              border: "1px solid rgba(94,234,212,0.35)",
              color: ACCENT,
              cursor: newQuote.trim() ? "pointer" : "not-allowed",
            }}
          >
            Add Quote
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="font-fantasy text-xs text-center" style={{ color: "rgba(200,184,150,0.5)" }}>Loading...</p>
      )}

      {/* Quote list */}
      {quotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-fantasy text-xs tracking-wider" style={{ color: ACCENT }}>
            Quotes ({quotes.length})
          </p>
          {quotes.map(q => (
            <div
              key={q.id}
              data-testid={`vw-quote-${q.id}`}
              className="rounded-xl p-3 flex items-start gap-2"
              style={{
                background: "rgba(94,234,212,0.05)",
                border: "1px solid rgba(94,234,212,0.18)",
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans text-xs leading-relaxed break-words" style={{ color: "#e8dcc8" }}>
                  🌿 {q.message}
                </p>
                {q.addedBy && (
                  <p style={{ fontSize: 9, color: "rgba(200,184,150,0.4)", marginTop: 4 }}>
                    Added by {q.addedBy}
                  </p>
                )}
              </div>
              <button
                data-testid={`button-delete-vw-quote-${q.id}`}
                onClick={() => deleteMutation.mutate(q.id)}
                disabled={deleteMutation.isPending}
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 22, height: 22,
                  background: "rgba(252,165,165,0.1)",
                  border: "1px solid rgba(252,165,165,0.25)",
                  cursor: "pointer",
                  color: "#fca5a5",
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {quotes.length === 0 && !isLoading && (
        <p className="font-fantasy text-xs" style={{ color: "rgba(200,184,150,0.4)" }}>
          No custom quotes yet. Add one above to get started.
        </p>
      )}
    </div>
  );
}

// ── Chat Filter Section ───────────────────────────────────────────────────────
interface ChatFilterData {
  baseWords: string[];
  customWords: { id: string; word: string; addedBy?: string | null; createdAt: string }[];
}

function ChatFilterSection({ currentUsername }: { currentUsername: string }) {
  const [newWord, setNewWord] = useState("");
  const [showBase, setShowBase] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ChatFilterData>({
    queryKey: ["/api/admin/chat-filter"],
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => apiRequest("POST", "/api/admin/chat-filter", { word }),
    onSuccess: () => {
      setNewWord("");
      qc.invalidateQueries({ queryKey: ["/api/admin/chat-filter"] });
      toast({ title: "Word added to filter" });
    },
    onError: (err: any) => {
      const raw = err?.message ?? "";
      const jsonStart = raw.indexOf("{");
      let body: any = {};
      try { if (jsonStart !== -1) body = JSON.parse(raw.slice(jsonStart)); } catch {}
      toast({ title: body?.message ?? "Error adding word", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/chat-filter/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/chat-filter"] });
    },
    onError: () => {
      toast({ title: "Could not remove word", variant: "destructive" });
    },
  });

  const ACCENT = "#fca5a5";
  const filteredBase = (data?.baseWords ?? []).filter(w =>
    !searchTerm || w.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredCustom = (data?.customWords ?? []).filter(w =>
    !searchTerm || w.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 px-2 pb-4">
      {/* Add new word */}
      <div
        className="rounded-xl p-3 flex flex-col gap-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(252,165,165,0.2)" }}
      >
        <p className="font-fantasy text-xs tracking-wider" style={{ color: ACCENT }}>Add Word to Filter</p>
        <div className="flex gap-2">
          <input
            data-testid="input-new-filter-word"
            type="text"
            value={newWord}
            onChange={e => setNewWord(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newWord.trim()) addMutation.mutate(newWord.trim()); }}
            placeholder="Enter word or phrase..."
            className="flex-1 font-sans text-xs rounded-lg px-3 py-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(252,165,165,0.25)",
              color: "#e8dcc8",
              outline: "none",
            }}
          />
          <button
            data-testid="button-add-filter-word"
            onClick={() => { if (newWord.trim()) addMutation.mutate(newWord.trim()); }}
            disabled={!newWord.trim() || addMutation.isPending}
            className="px-3 py-2 rounded-lg font-fantasy text-xs"
            style={{
              background: "rgba(252,165,165,0.15)",
              border: "1px solid rgba(252,165,165,0.35)",
              color: ACCENT,
              cursor: newWord.trim() ? "pointer" : "not-allowed",
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        data-testid="input-search-filter-words"
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search words..."
        className="font-sans text-xs rounded-lg px-3 py-2"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(252,165,165,0.15)",
          color: "#e8dcc8",
          outline: "none",
        }}
      />

      {isLoading && (
        <p className="font-fantasy text-xs text-center" style={{ color: "rgba(200,184,150,0.5)" }}>Loading...</p>
      )}

      {/* Custom words (admin-added) */}
      {filteredCustom.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-fantasy text-xs tracking-wider" style={{ color: ACCENT }}>
            Custom Words ({filteredCustom.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {filteredCustom.map(row => (
              <div
                key={row.id}
                data-testid={`filter-word-custom-${row.id}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(252,165,165,0.12)",
                  border: "1px solid rgba(252,165,165,0.3)",
                }}
              >
                <span className="font-sans text-xs" style={{ color: "#fecaca" }}>{row.word}</span>
                {row.addedBy && (
                  <span className="font-sans" style={{ color: "rgba(200,184,150,0.4)", fontSize: 9 }}>by {row.addedBy}</span>
                )}
                <button
                  data-testid={`button-remove-filter-word-${row.id}`}
                  onClick={() => deleteMutation.mutate(row.id)}
                  className="flex items-center justify-center rounded-full ml-0.5"
                  style={{
                    width: 14, height: 14,
                    background: "rgba(252,165,165,0.15)",
                    border: "none",
                    cursor: "pointer",
                    color: ACCENT,
                  }}
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredCustom.length === 0 && !isLoading && (
        <p className="font-fantasy text-xs" style={{ color: "rgba(200,184,150,0.4)" }}>
          No custom words added yet. Words in the base list below are always filtered.
        </p>
      )}

      {/* Base word list (collapsible) */}
      <div>
        <button
          data-testid="button-toggle-base-words"
          onClick={() => setShowBase(v => !v)}
          className="font-fantasy text-xs tracking-wider flex items-center gap-2"
          style={{ color: "rgba(252,165,165,0.6)", background: "none", border: "none", cursor: "pointer" }}
        >
          <span style={{ fontSize: 8 }}>{showBase ? "▼" : "▶"}</span>
          Built-in filter list ({filteredBase.length} words)
        </button>

        {showBase && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {filteredBase.map(word => (
              <span
                key={word}
                data-testid={`filter-word-base-${word}`}
                className="font-sans px-2 py-0.5 rounded-full text-xs"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(252,165,165,0.15)",
                  color: "rgba(200,184,150,0.6)",
                  fontSize: 10,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Emblems CRUD ──────────────────────────────────────────────────
// Mirrors the Badges section but for the (currently catalog-only) PvP
// emblem trophies. Admins can create, list, and delete emblems here;
// the user-facing rank rewards that consume these are still TBD.
interface AdminEmblem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  createdAt: string;
}

// ── Quest Item Picker ──────────────────────────────────────────────────────────
function QuestItemPicker({
  items, value, isOpen, onToggle, onChange,
}: {
  items: ShopItemFull[];
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (id: string) => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const selectedItem = items.find(i => i.id === value) ?? null;

  const activeCats = ITEM_CATEGORIES.filter(cat =>
    items.some(i => getItemCategory(i) === cat.key)
  );
  const filtered = tab === "all" ? items : items.filter(i => getItemCategory(i) === tab);

  return (
    <div className="relative flex-1">
      {/* Trigger */}
      <button
        data-testid="button-quest-item-picker-toggle"
        onClick={onToggle}
        className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
        style={{
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${isOpen ? "rgba(110,231,183,0.6)" : "rgba(110,231,183,0.3)"}`,
          color: "#e0f8ec",
          minHeight: 34,
        }}
      >
        {selectedItem ? (
          <>
            {selectedItem.imageUrl
              ? <img src={selectedItem.imageUrl} alt="" style={{ width: 22, height: 22, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />
              : <div style={{ width: 22, height: 22, borderRadius: 3, background: "rgba(110,231,183,0.1)", flexShrink: 0 }} />
            }
            <span className="text-[11px] truncate flex-1">{selectedItem.name}</span>
          </>
        ) : (
          <span className="text-[11px] opacity-50 flex-1">— None —</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.6, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#6ee7b7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div
            className="absolute left-0 right-0 z-50 rounded-lg overflow-hidden"
            style={{
              top: "calc(100% + 4px)",
              background: "rgba(5,30,20,0.98)",
              border: "1px solid rgba(110,231,183,0.35)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            {/* Type tabs */}
            <div
              className="flex gap-1 p-2 overflow-x-auto"
              style={{ borderBottom: "1px solid rgba(110,231,183,0.15)", scrollbarWidth: "none" }}
            >
              <button
                onClick={() => setTab("all")}
                className="px-2 py-0.5 rounded text-[9px] font-fantasy tracking-wider shrink-0 transition-colors"
                style={{
                  background: tab === "all" ? "rgba(110,231,183,0.25)" : "transparent",
                  border: `1px solid ${tab === "all" ? "rgba(110,231,183,0.5)" : "rgba(110,231,183,0.15)"}`,
                  color: tab === "all" ? "#6ee7b7" : "rgba(110,231,183,0.5)",
                }}
              >
                All
              </button>
              {activeCats.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setTab(cat.key)}
                  className="px-2 py-0.5 rounded text-[9px] font-fantasy tracking-wider shrink-0 transition-colors"
                  style={{
                    background: tab === cat.key ? `${cat.color}22` : "transparent",
                    border: `1px solid ${tab === cat.key ? `${cat.color}66` : "rgba(110,231,183,0.15)"}`,
                    color: tab === cat.key ? cat.color : "rgba(110,231,183,0.5)",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Item grid */}
            <div className="overflow-y-auto p-2" style={{ maxHeight: 220, scrollbarWidth: "thin" }}>
              {/* None option */}
              <button
                onClick={() => onChange("")}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded mb-1 text-left transition-colors"
                style={{
                  background: !value ? "rgba(110,231,183,0.15)" : "transparent",
                  border: `1px solid ${!value ? "rgba(110,231,183,0.4)" : "transparent"}`,
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(110,231,183,0.08)", border: "1px dashed rgba(110,231,183,0.2)", flexShrink: 0 }} />
                <span className="text-[10px]" style={{ color: "rgba(110,231,183,0.6)" }}>— None —</span>
              </button>

              <div className="grid grid-cols-1 gap-0.5">
                {filtered.map(item => {
                  const isSelected = item.id === value;
                  return (
                    <button
                      key={item.id}
                      data-testid={`button-quest-item-option-${item.id}`}
                      onClick={() => onChange(item.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors"
                      style={{
                        background: isSelected ? "rgba(110,231,183,0.18)" : "transparent",
                        border: `1px solid ${isSelected ? "rgba(110,231,183,0.45)" : "transparent"}`,
                      }}
                    >
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4, flexShrink: 0, background: "rgba(0,0,0,0.3)" }} />
                        : <div style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(110,231,183,0.08)", flexShrink: 0 }} />
                      }
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] truncate" style={{ color: isSelected ? "#6ee7b7" : "#c0e8d0" }}>{item.name}</span>
                        <span className="text-[8.5px] truncate" style={{ color: "rgba(110,231,183,0.45)" }}>
                          {getItemCategory(item).replace("_", " ")}
                        </span>
                      </div>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-auto shrink-0">
                          <path d="M2 5L4 7L8 3" stroke="#6ee7b7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <p className="text-center text-[10px] py-4" style={{ color: "rgba(110,231,183,0.35)" }}>No items in this category</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Quest Admin Section ────────────────────────────────────────────────────────
interface AdminDailyQuest {
  id: string;
  quest_key: string;
  title: string;
  description: string;
  target_count: number;
  coin_reward: number;
  reward_item_id: string | null;
  reward_item_name: string | null;
  reward_item_image: string | null;
  is_active: boolean;
}

function QuestAdminSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quests = [], isLoading } = useQuery<AdminDailyQuest[]>({
    queryKey: ["/api/admin/daily-quests"],
  });

  const { data: allItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const [localEdits, setLocalEdits] = useState<Record<string, { coinReward: string; rewardItemId: string }>>({});
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ questKey, coinReward, rewardItemId }: { questKey: string; coinReward: number; rewardItemId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/daily-quests/${questKey}`, { coinReward, rewardItemId });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/daily-quests"] });
      setLocalEdits(prev => { const n = { ...prev }; delete n[vars.questKey]; return n; });
      toast({ title: "Quest updated!", description: `${vars.questKey} rewards saved.` });
    },
    onError: () => {
      toast({ title: "Failed to save quest", variant: "destructive" });
    },
  });

  const getEdit = (q: AdminDailyQuest) => localEdits[q.quest_key] ?? {
    coinReward: String(q.coin_reward),
    rewardItemId: q.reward_item_id ?? "",
  };

  const setField = (questKey: string, field: "coinReward" | "rewardItemId", value: string) => {
    const orig = quests.find(q => q.quest_key === questKey);
    setLocalEdits(prev => {
      const base = prev[questKey] ?? {
        coinReward: String(orig?.coin_reward ?? 0),
        rewardItemId: orig?.reward_item_id ?? "",
      };
      return { ...prev, [questKey]: { ...base, [field]: value } };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-[#6ee7b7] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-fantasy text-[#6ee7b7] text-xs tracking-wider opacity-70 pb-1">
        Configure coin &amp; item rewards for each daily quest. Progress targets are fixed.
      </p>

      {quests.map((quest) => {
        const edit = getEdit(quest);
        const isDirty = edit.coinReward !== String(quest.coin_reward) || edit.rewardItemId !== (quest.reward_item_id ?? "");
        return (
          <div
            key={quest.quest_key}
            data-testid={`admin-quest-card-${quest.quest_key}`}
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "rgba(8,50,35,0.6)",
              border: "1px solid rgba(110,231,183,0.25)",
            }}
          >
            {/* Quest header */}
            <div>
              <p className="font-fantasy text-[#6ee7b7] text-sm font-semibold tracking-wide">{quest.title}</p>
              <p className="text-[#a8c8b0] text-[11px] mt-0.5">{quest.description}</p>
              <p className="text-[#5a8a6a] text-[10px] mt-0.5 tracking-wider">
                Target: <span className="text-[#8ac8a0]">{quest.target_count}</span>
              </p>
            </div>

            {/* Coin reward */}
            <div className="flex items-center gap-3">
              <label className="text-[#8ac8a0] text-[11px] tracking-wider w-24 shrink-0">Coin Reward</label>
              <input
                data-testid={`input-quest-coins-${quest.quest_key}`}
                type="number"
                min={0}
                value={edit.coinReward}
                onChange={e => setField(quest.quest_key, "coinReward", e.target.value)}
                className="flex-1 rounded px-2 py-1 text-[12px] font-mono"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(110,231,183,0.3)",
                  color: "#e0f8ec",
                  outline: "none",
                }}
              />
            </div>

            {/* Item reward */}
            <div className="flex items-start gap-3">
              <label className="text-[#8ac8a0] text-[11px] tracking-wider w-24 shrink-0 pt-1.5">Item Reward</label>
              <QuestItemPicker
                items={allItems}
                value={edit.rewardItemId}
                isOpen={openPickerKey === quest.quest_key}
                onToggle={() => setOpenPickerKey(prev => prev === quest.quest_key ? null : quest.quest_key)}
                onChange={val => {
                  setField(quest.quest_key, "rewardItemId", val);
                  setOpenPickerKey(null);
                }}
              />
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                data-testid={`button-save-quest-${quest.quest_key}`}
                onClick={() => saveMutation.mutate({
                  questKey: quest.quest_key,
                  coinReward: Number(edit.coinReward) || 0,
                  rewardItemId: edit.rewardItemId || null,
                })}
                disabled={saveMutation.isPending}
                className="px-4 py-1.5 rounded text-[11px] font-fantasy tracking-wider active:scale-95 transition-transform disabled:opacity-50"
                style={{
                  background: isDirty
                    ? "linear-gradient(135deg, rgba(20,100,60,0.9), rgba(40,180,100,0.8))"
                    : "rgba(30,70,50,0.5)",
                  border: isDirty ? "1px solid rgba(110,231,183,0.6)" : "1px solid rgba(110,231,183,0.2)",
                  color: isDirty ? "#d0fff0" : "#6a9a80",
                  cursor: isDirty ? "pointer" : "default",
                  boxShadow: isDirty ? "0 0 8px rgba(110,231,183,0.3)" : "none",
                }}
              >
                {saveMutation.isPending ? "Saving…" : "Save Rewards"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmblemDatabaseSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // The dialog supports both create and edit. `editId` decides which —
  // null means "create new", a string id means "edit this emblem".
  // The image is optional in edit mode (server keeps the existing one
  // if `imageData` is omitted).
  const [showUpload, setShowUpload] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<string | null>(null);

  const closeDialog = () => {
    setShowUpload(false);
    setEditId(null);
    setUploadName("");
    setUploadDesc("");
    setUploadPreview(null);
    setUploadData(null);
  };

  const openCreate = () => {
    setEditId(null);
    setUploadName("");
    setUploadDesc("");
    setUploadPreview(null);
    setUploadData(null);
    setShowUpload(true);
  };

  const openEdit = (em: AdminEmblem) => {
    setEditId(em.id);
    setUploadName(em.name);
    setUploadDesc(em.description ?? "");
    setUploadPreview(em.imageUrl);
    setUploadData(null); // null = keep existing image unless user replaces it
    setShowUpload(true);
  };

  const { data: emblems = [], isLoading } = useQuery<AdminEmblem[]>({
    queryKey: ["/api/admin/emblems"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!uploadName.trim() || !uploadData) throw new Error("Name and image required");
      return apiRequest("POST", "/api/admin/emblems", {
        name: uploadName.trim(),
        description: uploadDesc.trim() || null,
        imageData: uploadData,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/emblems"] });
      closeDialog();
      toast({ title: "Emblem created!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("Missing emblem id");
      if (!uploadName.trim()) throw new Error("Name required");
      // Only ship `imageData` when the admin actually picked a new one.
      // Server treats a missing field as "leave the image alone".
      const body: Record<string, unknown> = {
        name: uploadName.trim(),
        description: uploadDesc.trim() || null,
      };
      if (uploadData) body.imageData = uploadData;
      return apiRequest("PATCH", `/api/admin/emblems/${editId}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/emblems"] });
      closeDialog();
      toast({ title: "Emblem updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/emblems/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/emblems"] });
      toast({ title: "Emblem deleted" });
    },
    onError: () => toast({ title: "Error deleting emblem", variant: "destructive" }),
  });

  const isEditing = editId !== null;
  const isMutating = createMutation.isPending || updateMutation.isPending;
  const canSave = uploadName.trim().length > 0 && (isEditing ? true : !!uploadData) && !isMutating;

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-amber-200/90 text-[12px] tracking-[0.18em] font-bold">EMBLEMS · {emblems.length}</div>
        <button
          data-testid="button-emblem-create"
          onClick={openCreate}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold text-amber-100 active:scale-95"
          style={{ background: "rgba(252,165,165,0.18)", border: "1px solid rgba(252,165,165,0.55)" }}
        >
          + New Emblem
        </button>
      </div>

      {isLoading ? (
        <div className="text-white/40 text-[11px] py-6 text-center">Loading…</div>
      ) : emblems.length === 0 ? (
        <div className="text-white/40 text-[11px] py-6 text-center" data-testid="text-emblems-empty">
          No emblems yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {emblems.map((em) => (
            <div
              key={em.id}
              data-testid={`card-emblem-${em.id}`}
              className="relative rounded-xl p-2 flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(252,165,165,0.25)" }}
            >
              <img src={em.imageUrl} className="w-12 h-12 object-contain rounded" />
              <div className="flex-1 min-w-0">
                <div className="text-white/90 text-[11px] font-bold truncate" data-testid={`text-emblem-name-${em.id}`}>{em.name}</div>
                {em.description && (
                  <div className="text-white/45 text-[9px] truncate">{em.description}</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  data-testid={`button-emblem-edit-${em.id}`}
                  onClick={() => openEdit(em)}
                  className="px-2 py-1 rounded text-[10px] text-amber-100 active:scale-95"
                  style={{ background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.45)" }}
                >
                  Edit
                </button>
                <button
                  data-testid={`button-emblem-delete-${em.id}`}
                  onClick={() => {
                    if (confirm(`Delete "${em.name}"?`)) deleteMutation.mutate(em.id);
                  }}
                  className="px-2 py-1 rounded text-[10px] text-red-200 active:scale-95"
                  style={{ background: "rgba(220,38,38,0.18)", border: "1px solid rgba(220,38,38,0.45)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={closeDialog}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-4 space-y-3"
            style={{ background: "linear-gradient(180deg, #15102a 0%, #0a0814 100%)", border: "1px solid rgba(252,165,165,0.35)" }}
          >
            <div className="text-amber-100 text-[13px] font-bold tracking-[0.18em]" data-testid="text-emblem-dialog-title">
              {isEditing ? "EDIT EMBLEM" : "NEW EMBLEM"}
            </div>
            <input
              data-testid="input-emblem-name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 rounded-md text-[12px] text-white"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <textarea
              data-testid="input-emblem-desc"
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-md text-[12px] text-white resize-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <button
                data-testid="button-emblem-upload-image"
                onClick={() => fileRef.current?.click()}
                className="w-full px-3 py-2 rounded-md text-[11px] text-white/80 active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.20)" }}
              >
                {uploadPreview ? "Replace image" : "Upload image"}
              </button>
              {isEditing && uploadPreview && !uploadData && (
                <div className="mt-1 text-[9px] text-white/40 text-center tracking-wider">
                  Existing image kept unless replaced
                </div>
              )}
              {uploadPreview && (
                <div className="mt-2 flex justify-center">
                  <img src={uploadPreview} className="w-20 h-20 object-contain rounded" />
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={closeDialog}
                className="flex-1 py-2 rounded-md text-[11px] text-white/70"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Cancel
              </button>
              <button
                data-testid="button-emblem-save"
                disabled={!canSave}
                onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
                className="flex-1 py-2 rounded-md text-[11px] font-bold text-amber-100 active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(252,165,165,0.22)", border: "1px solid rgba(252,165,165,0.55)" }}
              >
                {isMutating ? "Saving…" : isEditing ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoltenBlocksItemsSection() {
  const [showPicker, setShowPicker] = useState(false);
  const [pendingItem, setPendingItem] = useState<ShopItemFull | null>(null);
  const [pendingRarity, setPendingRarity] = useState<'common' | 'uncommon' | 'rare'>('common');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  type DropItemRow = { id: string; shopItemId: string; rarity: string; active: boolean; itemName: string; imageUrl: string | null };

  const { data: items = [], isLoading } = useQuery<DropItemRow[]>({
    queryKey: ["/api/admin/molten-blocks/items"],
  });
  const { data: allShopItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const addMutation = useMutation({
    mutationFn: async ({ shopItemId, rarity }: { shopItemId: string; rarity: string }) => {
      const res = await apiRequest("POST", "/api/admin/molten-blocks/items", { shopItemId, rarity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/molten-blocks/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games/molten-blocks/drop-items"] });
      setPendingItem(null);
      toast({ title: "Item Added", description: "Drop item added to pool." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/molten-blocks/items/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/molten-blocks/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games/molten-blocks/drop-items"] });
      toast({ title: "Removed", description: "Item removed from drop pool." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/molten-blocks/items/${id}`, { active });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/molten-blocks/items"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const RARITY_COLOR: Record<string, string> = { common: "#94a3b8", uncommon: "#4ade80", rare: "#fbbf24" };
  const RARITY_BG: Record<string, string> = { common: "rgba(148,163,184,0.15)", uncommon: "rgba(74,222,128,0.15)", rare: "rgba(251,191,36,0.15)" };

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", letterSpacing: "0.12em" }}>MOLTEN BLOCKS DROPS</div>
          <div style={{ fontSize: 11, color: "#7a5530", marginTop: 2 }}>Items that can drop as glowing blocks during gameplay</div>
        </div>
        <button
          data-testid="button-add-drop-item"
          onClick={() => setShowPicker(true)}
          style={{
            background: "linear-gradient(135deg, rgba(251,146,60,0.25) 0%, rgba(217,119,6,0.2) 100%)",
            border: "1px solid rgba(251,146,60,0.5)", color: "#fb923c",
            padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >+ Add Item</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {(['common', 'uncommon', 'rare'] as const).map(r => (
          <div key={r} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
            borderRadius: 20, background: RARITY_BG[r], border: `1px solid ${RARITY_COLOR[r]}44`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: RARITY_COLOR[r], boxShadow: `0 0 6px ${RARITY_COLOR[r]}` }} />
            <span style={{ fontSize: 10, color: RARITY_COLOR[r], letterSpacing: "0.1em", fontWeight: 600 }}>{r.toUpperCase()}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#7a5530" }}>· spawns every ~20 blocks placed</span>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#7a5530", fontSize: 12 }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "32px 16px",
          background: "rgba(20,8,4,0.6)", border: "1px dashed rgba(251,146,60,0.3)", borderRadius: 12, color: "#7a5530", fontSize: 12,
        }}>
          No drop items yet. Add items and they'll appear as glowing blocks during Molten Blocks games.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => (
            <div
              key={item.id}
              data-testid={`drop-item-row-${item.id}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: item.active ? "rgba(20,8,4,0.75)" : "rgba(10,4,2,0.5)",
                border: `1px solid ${item.active ? RARITY_COLOR[item.rarity] + "55" : "rgba(80,40,20,0.3)"}`,
                borderRadius: 10, padding: "10px 12px", opacity: item.active ? 1 : 0.55,
              }}
            >
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.itemName} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#f5d589", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.itemName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{
                    fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: RARITY_COLOR[item.rarity],
                    padding: "1px 7px", background: RARITY_BG[item.rarity], border: `1px solid ${RARITY_COLOR[item.rarity]}44`, borderRadius: 10,
                  }}>{item.rarity.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: item.active ? "#6ee7b7" : "#7a5530" }}>{item.active ? "● active" : "○ inactive"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  data-testid={`toggle-drop-item-${item.id}`}
                  onClick={() => toggleMutation.mutate({ id: item.id, active: !item.active })}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 600,
                    background: item.active ? "rgba(251,146,60,0.15)" : "rgba(74,222,128,0.15)",
                    border: `1px solid ${item.active ? "rgba(251,146,60,0.4)" : "rgba(74,222,128,0.4)"}`,
                    color: item.active ? "#fb923c" : "#4ade80",
                  }}
                >{item.active ? "Disable" : "Enable"}</button>
                <button
                  data-testid={`remove-drop-item-${item.id}`}
                  onClick={() => removeMutation.mutate(item.id)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                    background: "rgba(252,165,165,0.1)", border: "1px solid rgba(252,165,165,0.3)", color: "#fca5a5",
                  }}
                >Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={() => setPendingItem(null)} />
          <div className="relative rounded-xl p-5 w-[80%] max-w-xs" style={{
            background: "linear-gradient(135deg, rgba(30,12,4,0.98) 0%, rgba(60,28,8,0.98) 100%)",
            border: "1px solid rgba(251,146,60,0.5)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 10 }}>Set Rarity</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              {pendingItem.imageUrl && <img src={pendingItem.imageUrl} alt={pendingItem.name} style={{ width: 32, height: 32, objectFit: "contain" }} />}
              <span style={{ fontSize: 12, color: "#f5d589" }}>{pendingItem.name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(['common', 'uncommon', 'rare'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setPendingRarity(r)}
                  style={{
                    flex: 1, padding: "8px 4px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    background: pendingRarity === r ? RARITY_BG[r] : "rgba(0,0,0,0.3)",
                    border: `1px solid ${pendingRarity === r ? RARITY_COLOR[r] : "rgba(100,60,20,0.3)"}`,
                    color: pendingRarity === r ? RARITY_COLOR[r] : "#7a5530",
                    boxShadow: pendingRarity === r ? `0 0 10px ${RARITY_COLOR[r]}44` : "none",
                  }}
                >{r.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setPendingItem(null)}
                style={{ flex: 1, padding: "8px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(100,60,20,0.3)", color: "#7a5530", fontSize: 12, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={() => addMutation.mutate({ shopItemId: pendingItem.id, rarity: pendingRarity })}
                disabled={addMutation.isPending}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: "linear-gradient(135deg, rgba(251,146,60,0.3) 0%, rgba(217,119,6,0.25) 100%)",
                  border: "1px solid rgba(251,146,60,0.55)", color: "#fb923c",
                }}
              >{addMutation.isPending ? "Adding..." : "Add to Pool"}</button>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <ItemPickerModal
          items={allShopItems}
          onSelect={(item) => {
            setShowPicker(false);
            setPendingItem(item);
            setPendingRarity("common");
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── Milestone Rewards Config ────────────────────────────────────────────────
const MILESTONE_DEFS = [
  { pts: 500,   label: "Bronze (500 pts)",       color: "#cd7f32", icon: "🥉" },
  { pts: 2500,  label: "Silver (2,500 pts)",     color: "#c0c0c0", icon: "🥈" },
  { pts: 5000,  label: "Gold (5,000 pts)",       color: "#f6dc8a", icon: "🥇" },
  { pts: 10000, label: "Legendary (10,000 pts)", color: "#d946ef", icon: "✨" },
];

interface MilestoneReward {
  milestone_points: number;
  reward_coins: number | null;
  reward_item_id: string | null;
  reward_item_name: string | null;
  reward_item_image_url: string | null;
  reward_label: string | null;
}

function MilestoneRewardsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards = [] } = useQuery<MilestoneReward[]>({
    queryKey: ["/api/admin/milestone-rewards"],
  });

  const [drafts, setDrafts] = useState<Record<number, { rewardCoins: string; rewardLabel: string }>>({});

  const setDraft = (pts: number, field: "rewardCoins" | "rewardLabel", value: string) => {
    setDrafts(prev => ({
      ...prev,
      [pts]: { ...(prev[pts] ?? { rewardCoins: "", rewardLabel: "" }), [field]: value },
    }));
  };

  const getDraft = (pts: number, field: "rewardCoins" | "rewardLabel"): string => {
    const d = drafts[pts];
    if (d && d[field] !== undefined && d[field] !== "") return d[field];
    const saved = rewards.find(r => Number(r.milestone_points) === pts);
    if (field === "rewardCoins") return String(saved?.reward_coins ?? 0);
    return saved?.reward_label ?? "";
  };

  const saveMutation = useMutation({
    mutationFn: async ({ pts }: { pts: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestone-rewards/${pts}`, {
        rewardCoins: Number(getDraft(pts, "rewardCoins")) || 0,
        rewardLabel: getDraft(pts, "rewardLabel") || null,
      });
      return res.json();
    },
    onSuccess: (_data, { pts }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/milestone-rewards"] });
      setDrafts(prev => { const d = { ...prev }; delete d[pts]; return d; });
      toast({ title: "Saved", description: "Milestone reward updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  const panelSty: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: "14px 16px", marginBottom: 12,
  };
  const labelSty: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };
  const inputSty: React.CSSProperties = {
    width: "100%", padding: "6px 10px", borderRadius: 7, fontSize: 12,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff", outline: "none",
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 18, lineHeight: 1.5 }}>
        Configure rewards given when a player hits each monthly purchase milestone.
        Founder tier upgrades are automatic. Bonus coins and a custom label can be set per milestone.
      </p>
      {MILESTONE_DEFS.map(({ pts, label, color, icon }) => {
        const saved = rewards.find(r => Number(r.milestone_points) === pts);
        return (
          <div key={pts} style={panelSty} data-testid={`milestone-card-${pts}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13, color }}>{label}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelSty}>Bonus Coins</label>
                <input
                  type="number"
                  min={0}
                  value={getDraft(pts, "rewardCoins")}
                  onChange={e => setDraft(pts, "rewardCoins", e.target.value)}
                  style={inputSty}
                  data-testid={`input-milestone-coins-${pts}`}
                  placeholder="0"
                />
              </div>
              <div>
                <label style={labelSty}>Label (on progress bar)</label>
                <input
                  type="text"
                  value={getDraft(pts, "rewardLabel")}
                  onChange={e => setDraft(pts, "rewardLabel", e.target.value)}
                  style={inputSty}
                  data-testid={`input-milestone-label-${pts}`}
                  placeholder="e.g. Pet Egg 🥚"
                />
              </div>
            </div>
            {saved?.reward_item_name && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginBottom: 10 }}>
                Gift item: {saved.reward_item_name}
              </p>
            )}
            <button
              data-testid={`button-save-milestone-${pts}`}
              onClick={() => saveMutation.mutate({ pts })}
              disabled={saveMutation.isPending}
              style={{
                padding: "6px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: "pointer",
                background: "linear-gradient(135deg, rgba(251,146,60,0.3) 0%, rgba(217,119,6,0.25) 100%)",
                border: "1px solid rgba(251,146,60,0.55)", color: "#fb923c",
              }}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Metrics Section ────────────────────────────────────────────────────────────
const DAYS_OPTIONS = [7, 14, 30, 60, 90] as const;
type DaysOption = typeof DAYS_OPTIONS[number];

interface MetricsData {
  dailyLogins: { date: string; count: number }[];
  loginsByCountry: { country: string; count: number }[];
  signupsBySource: { source: string; count: number }[];
}

const CHART_COLORS = ["#a5f3fc", "#7dd3fc", "#6ee7b7", "#fde68a", "#fca5a5", "#c4b5fd", "#fdba74", "#86efac", "#f9a8d4", "#d4d4d8"];

const metricCardSty: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(8,30,45,0.92) 0%, rgba(12,50,70,0.88) 100%)",
  border: "1px solid rgba(165,243,252,0.25)",
  borderRadius: 14,
  padding: "16px 14px",
  marginBottom: 18,
};

const metricTitleSty: React.CSSProperties = {
  fontFamily: "Lora, Georgia, serif",
  fontSize: 13,
  fontWeight: 700,
  color: "#a5f3fc",
  letterSpacing: "0.06em",
  marginBottom: 4,
};

const metricSubSty: React.CSSProperties = {
  fontFamily: "Lora, Georgia, serif",
  fontSize: 10,
  color: "rgba(165,243,252,0.55)",
  marginBottom: 14,
};

const emptyMsgSty: React.CSSProperties = {
  fontFamily: "Lora, serif",
  fontSize: 11,
  color: "rgba(255,255,255,0.3)",
  textAlign: "center",
  padding: "24px 0",
};

const tooltipSty = {
  contentStyle: { background: "rgba(8,30,45,0.97)", border: "1px solid rgba(165,243,252,0.3)", borderRadius: 8, fontFamily: "Lora, serif", fontSize: 11 },
  labelStyle: { color: "#a5f3fc" },
  itemStyle: { color: "#a5f3fc" },
  cursor: { fill: "rgba(165,243,252,0.06)" },
};

function OnlineNowPanel() {
  const { data: inWorldPlayers = [], refetch, dataUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/world/pet_world/active-pets"],
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "rgba(165,243,252,0.45)" }}>Updated: {lastUpdated}</span>
        <button
          onClick={() => { refetch(); }}
          style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(165,243,252,0.1)", border: "1px solid rgba(165,243,252,0.35)", color: "#a5f3fc", fontFamily: "Lora, serif" }}
        >↻ Refresh</button>
      </div>

      <div style={{ ...metricCardSty, flex: 1, textAlign: "center", marginBottom: 16 }}>
        <p style={{ fontFamily: "Lora, serif", fontSize: 36, fontWeight: 700, color: "#6ee7b7", margin: 0 }}>
          {inWorldPlayers.length}
        </p>
        <p style={metricSubSty}>Currently in-world</p>
      </div>

      {/* In-world player list */}
      <div style={metricCardSty}>
        <p style={metricTitleSty}>Players Currently In World</p>
        <p style={metricSubSty}>Live roster of connected world clients</p>
        {inWorldPlayers.length === 0 ? (
          <p style={emptyMsgSty}>No players in-world right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {inWorldPlayers.map((p: any, i: number) => (
              <div key={p.userId ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(165,243,252,0.04)", border: "1px solid rgba(165,243,252,0.1)" }}>
                <span style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(165,243,252,0.45)", minWidth: 20, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontFamily: "Lora, serif", fontSize: 12, color: "#a5f3fc", fontWeight: 600 }}>{p.name || p.username || p.userId || "Unknown"}</span>
                {p.username && p.name && p.name !== p.username && (
                  <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "rgba(165,243,252,0.45)" }}>(@{p.username})</span>
                )}
                <span style={{ marginLeft: "auto", fontFamily: "Lora, serif", fontSize: 10, color: "rgba(110,231,183,0.7)" }}>● live</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricsSection() {
  const [days, setDays] = useState<DaysOption>(30);
  const [metricsTab, setMetricsTab] = useState<"analytics" | "online">("analytics");

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<MetricsData>({
    queryKey: ["/api/admin/metrics", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/metrics?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load metrics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div>
      {/* Metrics tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([{ key: "analytics" as const, label: "Analytics" }, { key: "online" as const, label: "Online Now" }]).map(t => {
          const active = metricsTab === t.key;
          return (
            <button key={t.key} onClick={() => setMetricsTab(t.key)}
              className="font-fantasy text-[11px] tracking-wider"
              style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", background: active ? "rgba(165,243,252,0.18)" : "rgba(0,0,0,0.35)", border: active ? "1px solid rgba(165,243,252,0.6)" : "1px solid rgba(165,243,252,0.2)", color: active ? "#a5f3fc" : "rgba(165,243,252,0.5)", fontFamily: "Lora, serif" }}
            >{t.label}</button>
          );
        })}
      </div>
      {metricsTab === "online" && <OnlineNowPanel />}
      {metricsTab === "analytics" && <>
      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: days === d ? "rgba(165,243,252,0.18)" : "rgba(0,0,0,0.35)",
                border: days === d ? "1px solid rgba(165,243,252,0.6)" : "1px solid rgba(165,243,252,0.2)",
                color: days === d ? "#a5f3fc" : "rgba(165,243,252,0.5)",
                fontFamily: "Lora, serif",
              }}
            >{d}d</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "Lora, serif", fontSize: 10, color: "rgba(165,243,252,0.45)" }}>Updated: {lastUpdated}</span>
          <button
            onClick={() => refetch()}
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(165,243,252,0.1)", border: "1px solid rgba(165,243,252,0.35)", color: "#a5f3fc", fontFamily: "Lora, serif" }}
          >↻ Refresh</button>
        </div>
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px 0", fontFamily: "Lora, serif", fontSize: 13, color: "rgba(165,243,252,0.5)" }}>
          Loading metrics…
        </div>
      )}

      {data && (
        <>
          {/* Daily Logins */}
          <div style={metricCardSty}>
            <p style={metricTitleSty}>Daily Logins</p>
            <p style={metricSubSty}>Total login events per day — last {days} days</p>
            {data.dailyLogins.length === 0 ? (
              <p style={emptyMsgSty}>No data yet — logins will appear here after players sign in.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.dailyLogins} margin={{ top: 4, right: 4, left: -20, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(165,243,252,0.08)" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(165,243,252,0.5)", fontSize: 8, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "rgba(165,243,252,0.4)", fontSize: 9, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipSty} />
                  <Bar dataKey="count" name="Logins" radius={[4, 4, 0, 0]} fill="#a5f3fc" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Logins by Country */}
          <div style={metricCardSty}>
            <p style={metricTitleSty}>Logins by Country</p>
            <p style={metricSubSty}>Where players are logging in from — last {days} days, top 15</p>
            {data.loginsByCountry.length === 0 ? (
              <p style={emptyMsgSty}>No location data yet. Country info is collected from new logins going forward.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, data.loginsByCountry.length * 28)}>
                <BarChart data={data.loginsByCountry} layout="vertical" margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(165,243,252,0.08)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "rgba(165,243,252,0.4)", fontSize: 9, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="country" tick={{ fill: "rgba(165,243,252,0.6)", fontSize: 9, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip {...tooltipSty} />
                  <Bar dataKey="count" name="Logins" radius={[0, 4, 4, 0]}>
                    {data.loginsByCountry.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Signups by Source */}
          <div style={metricCardSty}>
            <p style={metricTitleSty}>Signups by Source</p>
            <p style={metricSubSty}>Where new players came from when registering — all time</p>
            {data.signupsBySource.length === 0 ? (
              <p style={emptyMsgSty}>No signup source data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.signupsBySource} margin={{ top: 4, right: 4, left: -20, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(165,243,252,0.08)" />
                  <XAxis dataKey="source" tick={{ fill: "rgba(165,243,252,0.55)", fontSize: 9, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(165,243,252,0.4)", fontSize: 9, fontFamily: "Lora, serif" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipSty} />
                  <Bar dataKey="count" name="Signups" radius={[4, 4, 0, 0]}>
                    {data.signupsBySource.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipes admin section
// Admins create ingredient-combos that appear greyed in every player's recipe
// book and unlock individually as players collect recipe scrolls in-game.
// ─────────────────────────────────────────────────────────────────────────────
function RecipeItemsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state (shared for add + edit)
  const [recipeName, setRecipeName] = useState("");
  const [ing1, setIng1] = useState("");
  const [ing2, setIng2] = useState("");
  const [ing3, setIng3] = useState("");
  const [result, setResult] = useState("");
  // Which field the item picker is open for: "ing1" | "ing2" | "ing3" | "result" | null
  const [pickerFor, setPickerFor] = useState<"ing1" | "ing2" | "ing3" | "result" | null>(null);

  type ShopItemRow = { id: string; name: string; type: string; imageUrl: string | null };
  type RecipeRow = {
    id: string;
    recipe_item_id: string | null; recipe_item_name: string | null;
    ing1_id: string; ing1_name: string; ing1_image: string | null;
    ing2_id: string; ing2_name: string; ing2_image: string | null;
    ing3_id: string | null; ing3_name: string | null; ing3_image: string | null;
    result_id: string; result_name: string; result_image: string | null; result_type: string;
  };

  const { data: allShopItems = [] } = useQuery<ShopItemRow[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  const ingredientItems = allShopItems.filter(s => s.type === "ingredient");

  const { data: recipes = [], isLoading } = useQuery<RecipeRow[]>({
    queryKey: ["/api/recipes"],
  });

  const resetForm = () => {
    setRecipeName(""); setIng1(""); setIng2(""); setIng3(""); setResult(""); setPickerFor(null);
    setShowForm(false); setEditingId(null);
  };

  const startEdit = (r: RecipeRow) => {
    setEditingId(r.id);
    setRecipeName(r.recipe_item_name ?? "");
    setIng1(r.ing1_id);
    setIng2(r.ing2_id);
    setIng3(r.ing3_id ?? "");
    setResult(r.result_id);
    setPickerFor(null);
    setShowForm(false);
  };

  const resolveResultType = (id: string) => {
    const t = allShopItems.find(s => s.id === id)?.type ?? "";
    return t === "fish" ? "fish" : t === "pet" ? "pet" : "item";
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/recipes", {
        ingredient1Id: ing1, ingredient2Id: ing2, ingredient3Id: ing3 || undefined,
        resultId: result, resultType: resolveResultType(result),
        name: recipeName.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      resetForm();
      toast({ title: "Recipe added", description: "It now appears (greyed) in all players' recipe books." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to add recipe", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/recipes/${editingId}`, {
        ingredient1Id: ing1 || undefined, ingredient2Id: ing2 || undefined,
        ingredient3Id: ing3, // pass empty string to clear, non-empty to set
        resultId: result || undefined,
        resultType: result ? resolveResultType(result) : undefined,
        name: recipeName.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      resetForm();
      toast({ title: "Recipe updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to update recipe", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/recipes/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Recipe removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const isEditing = editingId !== null;
  const canSubmit = ing1 && ing2 && result && !(isEditing ? editMutation.isPending : addMutation.isPending);

  const previewIng1 = allShopItems.find(s => s.id === ing1);
  const previewIng2 = allShopItems.find(s => s.id === ing2);
  const previewIng3 = ing3 ? allShopItems.find(s => s.id === ing3) : undefined;
  const previewResult = allShopItems.find(s => s.id === result);

  // Inlined item preview box (NOT a sub-component — avoids keyboard-close bug)
  const renderItemBox = (item?: ShopItemRow, dim?: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ width: 44, height: 44, background: "rgba(0,0,0,0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${dim ? "rgba(134,239,172,0.12)" : "rgba(134,239,172,0.25)"}`, opacity: dim ? 0.5 : 1 }}>
        {item?.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} /> : <span style={{ color: "#86efac44", fontSize: 18 }}>?</span>}
      </div>
      <span style={{ fontSize: 8, color: "#86efac88", maxWidth: 50, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.name ?? "—"}</span>
    </div>
  );

  // Picker button style — mimics the ItemPickerModal trigger used in shops
  const pickerBtnStyle = (hasValue: boolean, accent?: string): React.CSSProperties => ({
    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
    background: hasValue ? "rgba(8,30,16,0.95)" : "rgba(0,0,0,0.25)",
    border: `1px solid ${accent ?? "rgba(134,239,172,0.35)"}`,
    borderRadius: 8, cursor: "pointer", fontFamily: "Lora, serif",
    color: hasValue ? "#d1fef0" : "#86efac55", fontSize: 12, textAlign: "left",
  });

  // Inlined form JSX (NOT extracted into a sub-component — avoids keyboard-close bug on every keystroke)
  const formIsEdit = isEditing;
  const formJsx = (showForm || isEditing) && (
    <div style={{ background: "rgba(8,30,16,0.8)", border: `1px solid ${formIsEdit ? "rgba(250,204,21,0.4)" : "rgba(134,239,172,0.3)"}`, borderRadius: 12, padding: "16px", marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: formIsEdit ? "#fde68a" : "#86efac", letterSpacing: "0.1em", marginBottom: 12 }}>
        {formIsEdit ? "Edit Recipe" : "+ New Recipe"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Recipe name */}
        <div>
          <label style={{ fontSize: 10, color: "#86efac88", display: "block", marginBottom: 4, letterSpacing: "0.1em" }}>RECIPE NAME (shown on the scroll)</label>
          <input
            data-testid="input-recipe-name"
            placeholder="e.g. Fire Potion Recipe Scroll"
            value={recipeName}
            onChange={e => setRecipeName(e.target.value)}
            style={{ background: "rgba(8,30,16,0.95)", border: "1px solid rgba(134,239,172,0.35)", color: "#d1fef0", borderRadius: 8, padding: "9px 10px", fontSize: 12, width: "100%", outline: "none", fontFamily: "Lora, serif" }}
          />
        </div>

        {/* Ingredient 1 */}
        <div>
          <label style={{ fontSize: 10, color: "#86efac88", display: "block", marginBottom: 4, letterSpacing: "0.1em" }}>INGREDIENT 1</label>
          <button data-testid="button-pick-ing1" onClick={() => setPickerFor("ing1")} style={pickerBtnStyle(!!ing1)}>
            {previewIng1?.imageUrl && <img src={previewIng1.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
            <span style={{ flex: 1 }}>{previewIng1?.name ?? "Choose ingredient…"}</span>
            {ing1 && <span style={{ fontSize: 10, color: "#86efac55" }} onClick={e => { e.stopPropagation(); setIng1(""); }}>✕</span>}
          </button>
          {ingredientItems.length === 0 && <div style={{ fontSize: 10, color: "#fca5a599", marginTop: 4 }}>No items with type "ingredient" found — add some in Items first.</div>}
        </div>

        {/* Ingredient 2 */}
        <div>
          <label style={{ fontSize: 10, color: "#86efac88", display: "block", marginBottom: 4, letterSpacing: "0.1em" }}>INGREDIENT 2</label>
          <button data-testid="button-pick-ing2" onClick={() => setPickerFor("ing2")} style={pickerBtnStyle(!!ing2)}>
            {previewIng2?.imageUrl && <img src={previewIng2.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
            <span style={{ flex: 1 }}>{previewIng2?.name ?? "Choose ingredient…"}</span>
            {ing2 && <span style={{ fontSize: 10, color: "#86efac55" }} onClick={e => { e.stopPropagation(); setIng2(""); }}>✕</span>}
          </button>
        </div>

        {/* Ingredient 3 (optional) */}
        <div>
          <label style={{ fontSize: 10, color: "#86efac88", display: "block", marginBottom: 4, letterSpacing: "0.1em" }}>INGREDIENT 3 <span style={{ color: "#86efac44" }}>(optional)</span></label>
          <button data-testid="button-pick-ing3" onClick={() => setPickerFor("ing3")} style={pickerBtnStyle(!!ing3, ing3 ? "rgba(134,239,172,0.35)" : "rgba(134,239,172,0.18)")}>
            {previewIng3?.imageUrl && <img src={previewIng3.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
            <span style={{ flex: 1 }}>{previewIng3?.name ?? "Add a third ingredient (optional)…"}</span>
            {ing3 && <span style={{ fontSize: 10, color: "#86efac55" }} onClick={e => { e.stopPropagation(); setIng3(""); }}>✕</span>}
          </button>
        </div>

        {/* Result item — uses same ItemPickerModal pattern as shops */}
        <div>
          <label style={{ fontSize: 10, color: "#86efac88", display: "block", marginBottom: 4, letterSpacing: "0.1em" }}>RESULT ITEM</label>
          <button data-testid="button-pick-result" onClick={() => setPickerFor("result")} style={pickerBtnStyle(!!result, result ? "rgba(134,239,172,0.35)" : "rgba(252,211,77,0.3)")}>
            {previewResult?.imageUrl && <img src={previewResult.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
            <span style={{ flex: 1 }}>{previewResult ? `${previewResult.name} (${previewResult.type})` : "Choose result item…"}</span>
            {result && <span style={{ fontSize: 10, color: "#86efac55" }} onClick={e => { e.stopPropagation(); setResult(""); }}>✕</span>}
          </button>
        </div>

        {/* Live preview */}
        {(ing1 || ing2 || ing3 || result) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", background: "rgba(0,0,0,0.3)", borderRadius: 8, flexWrap: "wrap" }}>
            {renderItemBox(previewIng1)}
            <span style={{ fontSize: 16, color: "#86efac55" }}>+</span>
            {renderItemBox(previewIng2)}
            {ing3 && <>
              <span style={{ fontSize: 16, color: "#86efac55" }}>+</span>
              {renderItemBox(previewIng3)}
            </>}
            <span style={{ fontSize: 16, color: "#86efac55" }}>→</span>
            {renderItemBox(previewResult)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            data-testid="button-cancel-recipe-form"
            onClick={resetForm}
            style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(134,239,172,0.2)", color: "#86efac88", padding: "10px 0", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "Lora, serif" }}
          >Cancel</button>
          <button
            data-testid="button-complete-recipe"
            onClick={() => { if (canSubmit) { formIsEdit ? editMutation.mutate() : addMutation.mutate(); } }}
            disabled={!canSubmit}
            style={{
              flex: 2,
              background: canSubmit ? (formIsEdit ? "linear-gradient(135deg, rgba(250,204,21,0.3) 0%, rgba(234,179,8,0.2) 100%)" : "linear-gradient(135deg, rgba(134,239,172,0.3) 0%, rgba(74,222,128,0.2) 100%)") : "rgba(0,0,0,0.3)",
              border: `1px solid ${canSubmit ? (formIsEdit ? "rgba(250,204,21,0.6)" : "rgba(134,239,172,0.6)") : "rgba(134,239,172,0.15)"}`,
              color: canSubmit ? (formIsEdit ? "#fde68a" : "#86efac") : "#86efac44",
              padding: "10px 0", borderRadius: 8, fontSize: 13, cursor: canSubmit ? "pointer" : "default",
              fontFamily: "Lora, serif", letterSpacing: "0.12em", fontWeight: 600, transition: "all 0.15s ease",
            }}
          >{(formIsEdit ? editMutation.isPending : addMutation.isPending) ? "Saving…" : (formIsEdit ? "Save Changes" : "Create Recipe")}</button>
        </div>
      </div>
    </div>
  );

  // Item picker modal — filters to ingredient-type items for ing fields, all items for result
  const pickerItems: ShopItemFull[] = (() => {
    if (!pickerFor) return [];
    if (pickerFor === "result") return allShopItems as unknown as ShopItemFull[];
    return ingredientItems as unknown as ShopItemFull[];
  })();

  const pickerModal = pickerFor && (
    <ItemPickerModal
      items={pickerItems}
      onSelect={(item) => {
        if (pickerFor === "ing1") setIng1(item.id);
        else if (pickerFor === "ing2") setIng2(item.id);
        else if (pickerFor === "ing3") setIng3(item.id);
        else if (pickerFor === "result") setResult(item.id);
        setPickerFor(null);
      }}
      onClose={() => setPickerFor(null)}
    />
  );

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#86efac", letterSpacing: "0.12em" }}>RECIPES</div>
          <div style={{ fontSize: 11, color: "#86efac66", marginTop: 2 }}>
            Each recipe shows greyed in all players' cauldron recipe books until they unlock it in-game.
          </div>
        </div>
        {!isEditing && (
          <button
            data-testid="button-add-recipe"
            onClick={() => { setShowForm(v => !v); setEditingId(null); }}
            style={{
              background: showForm ? "rgba(239,68,68,0.15)" : "linear-gradient(135deg, rgba(134,239,172,0.25) 0%, rgba(74,222,128,0.18) 100%)",
              border: showForm ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(134,239,172,0.5)",
              color: showForm ? "#fca5a5" : "#86efac",
              padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              fontFamily: "Lora, serif", letterSpacing: "0.08em", flexShrink: 0,
            }}
          >{showForm ? "Cancel" : "+ Add Recipe"}</button>
        )}
      </div>

      {/* Shared form (add or edit) — rendered as plain JSX, not a sub-component */}
      {formJsx}
      {pickerModal}

      {/* Recipe list */}
      {isLoading ? (
        <p style={{ textAlign: "center", color: "#86efac55", fontSize: 12 }}>Loading…</p>
      ) : recipes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 16px", background: "rgba(8,30,16,0.45)", border: "1px dashed rgba(134,239,172,0.2)", borderRadius: 12, color: "#86efac44", fontSize: 12 }}>
          No recipes yet. Hit "+ Add Recipe" to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recipes.map((r) => {
            const accentColor = r.result_type === "fish" ? "#38bdf8" : r.result_type === "pet" ? "#c084fc" : "#86efac";
            const isEditingThis = editingId === r.id;
            return (
              <div key={r.id} data-testid={`recipe-row-${r.id}`}
                style={{
                  background: isEditingThis ? "rgba(30,50,8,0.95)" : "rgba(8,30,16,0.8)",
                  border: `1px solid ${isEditingThis ? "rgba(250,204,21,0.55)" : accentColor + "55"}`,
                  borderRadius: 12, padding: "14px 14px 10px",
                  boxShadow: isEditingThis ? "0 0 16px rgba(250,204,21,0.12)" : "none",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Recipe name / scroll name */}
                <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>
                  {r.recipe_item_name ?? "Recipe"}
                </div>

                {/* Ingredient → Result display */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {/* ing1 */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 40, height: 40, background: "rgba(0,0,0,0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${accentColor}33` }}>
                      {r.ing1_image ? <img src={r.ing1_image} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} /> : <span style={{ color: "#86efac33", fontSize: 14 }}>?</span>}
                    </div>
                    <span style={{ fontSize: 7, color: "#d1fef0aa", textAlign: "center", maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ing1_name}</span>
                  </div>
                  <span style={{ fontSize: 14, color: accentColor + "66" }}>+</span>
                  {/* ing2 */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 40, height: 40, background: "rgba(0,0,0,0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${accentColor}33` }}>
                      {r.ing2_image ? <img src={r.ing2_image} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} /> : <span style={{ color: "#86efac33", fontSize: 14 }}>?</span>}
                    </div>
                    <span style={{ fontSize: 7, color: "#d1fef0aa", textAlign: "center", maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ing2_name}</span>
                  </div>
                  {/* ing3 (optional) */}
                  {r.ing3_id && (
                    <>
                      <span style={{ fontSize: 14, color: accentColor + "66" }}>+</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 40, height: 40, background: "rgba(0,0,0,0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${accentColor}33` }}>
                          {r.ing3_image ? <img src={r.ing3_image} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} /> : <span style={{ color: "#86efac33", fontSize: 14 }}>?</span>}
                        </div>
                        <span style={{ fontSize: 7, color: "#d1fef0aa", textAlign: "center", maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ing3_name}</span>
                      </div>
                    </>
                  )}
                  <span style={{ fontSize: 18, color: accentColor + "88" }}>→</span>
                  {/* result */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 50, height: 50, background: "rgba(0,0,0,0.4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${accentColor}66`, boxShadow: `0 0 10px ${accentColor}22` }}>
                      {r.result_image ? <img src={r.result_image} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} /> : <span style={{ color: "#86efac33", fontSize: 18 }}>?</span>}
                    </div>
                    <span style={{ fontSize: 9, color: accentColor, textAlign: "center", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{r.result_name}</span>
                    <span style={{ fontSize: 8, color: accentColor + "88", textTransform: "capitalize" }}>{r.result_type}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    data-testid={`button-edit-recipe-${r.id}`}
                    onClick={() => isEditingThis ? resetForm() : startEdit(r)}
                    style={{ flex: 1, background: isEditingThis ? "rgba(250,204,21,0.15)" : "rgba(134,239,172,0.1)", border: `1px solid ${isEditingThis ? "rgba(250,204,21,0.4)" : "rgba(134,239,172,0.3)"}`, color: isEditingThis ? "#fde68a" : "#86efac", borderRadius: 6, padding: "5px 0", fontSize: 11, cursor: "pointer", fontFamily: "Lora, serif" }}
                  >{isEditingThis ? "Cancel Edit" : "Edit"}</button>
                  <button
                    data-testid={`button-delete-recipe-${r.id}`}
                    onClick={() => deleteMutation.mutate(r.id)}
                    disabled={deleteMutation.isPending}
                    style={{ flex: 1, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 6, padding: "5px 0", fontSize: 11, cursor: "pointer", fontFamily: "Lora, serif" }}
                  >Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
