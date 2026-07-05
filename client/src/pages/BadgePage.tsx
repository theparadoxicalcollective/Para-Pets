import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Pencil, X, Check } from "lucide-react";
import bgImg from "@assets/bg_home_v2.png";
import coinIconImg from "@assets/icon_coin.png";
import TopBar from "@/components/TopBar";
import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BadgePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    coins: number;
    isAdmin: boolean;
    profileImage: string | null;
  };
}

interface AllBadge {
  id: string;
  name: string;
  imageUrl: string;
  dailyRewardCoins: number | null;
  claimType: string;
  badgePoints: number;
  rarity: string;
  obtainDescription: string | null;
  hidden: boolean;
}

interface UserBadge {
  id: string;
  badgeId: string;
  awardedAt: string;
  name: string;
  imageUrl: string;
  dailyRewardCoins: number | null;
  claimType: string;
  lastClaimedAt: string | null;
}

const GOLD = "#f0c040";
const GOLD_DIM = "#a89878";
const GOLD_FAINT = "#6a5840";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_CFG: Record<string, { label: string; color: string; glow: string; border: string; dimColor: string }> = {
  legendary: { label: "Legendary", color: "#f0c040", glow: "rgba(240,192,64,0.55)", border: "rgba(240,192,64,0.75)", dimColor: "rgba(240,192,64,0.2)" },
  epic:      { label: "Epic",      color: "#c084fc", glow: "rgba(192,132,252,0.45)", border: "rgba(192,132,252,0.65)", dimColor: "rgba(192,132,252,0.15)" },
  rare:      { label: "Rare",      color: "#60a5fa", glow: "rgba(96,165,250,0.45)",  border: "rgba(96,165,250,0.65)",  dimColor: "rgba(96,165,250,0.12)" },
  uncommon:  { label: "Uncommon",  color: "#4ade80", glow: "rgba(74,222,128,0.4)",   border: "rgba(74,222,128,0.6)",   dimColor: "rgba(74,222,128,0.1)"  },
  common:    { label: "Common",    color: "#a0a0a0", glow: "rgba(160,160,160,0.25)", border: "rgba(160,160,160,0.4)",  dimColor: "rgba(160,160,160,0.1)" },
};

function cooldownMs(claimType: string): number {
  if (claimType === "weekly")  return 7  * MS_PER_DAY;
  if (claimType === "monthly") return 30 * MS_PER_DAY;
  return MS_PER_DAY;
}

function claimFrequencyLabel(claimType: string): string {
  if (claimType === "weekly")  return "week";
  if (claimType === "monthly") return "month";
  return "day";
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ready!";
  const totalSecs = Math.floor(ms / 1000);
  const weeks = Math.floor(totalSecs / (7 * 24 * 3600));
  const days  = Math.floor((totalSecs % (7 * 24 * 3600)) / (24 * 3600));
  const hours = Math.floor((totalSecs % (24 * 3600)) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;
  if (weeks > 0) return `${weeks}w ${days}d ${hours}h`;
  if (days  > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins  > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function BadgeClaimButton({
  badge,
  onClaimed,
}: {
  badge: UserBadge;
  onClaimed: (newCoins: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getMs = useCallback(() => {
    if (!badge.lastClaimedAt) return 0;
    const elapsed = Date.now() - new Date(badge.lastClaimedAt).getTime();
    return Math.max(0, cooldownMs(badge.claimType) - elapsed);
  }, [badge.lastClaimedAt, badge.claimType]);

  const [msLeft, setMsLeft] = useState(() => getMs());

  useEffect(() => {
    setMsLeft(getMs());
    const t = setInterval(() => {
      const remaining = getMs();
      setMsLeft(remaining);
      if (remaining <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [getMs]);

  const claimMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/badges/claim-daily", { badgeId: badge.badgeId }),
    onSuccess: async (res) => {
      const data = await res.json();
      onClaimed(data.newCoins);
      queryClient.setQueryData(["/api/auth/me"], (old: any) =>
        old ? { ...old, coins: data.newCoins } : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/user/badges"] });
      toast({
        title: `+${badge.dailyRewardCoins} coins claimed!`,
        description: `Come back next ${claimFrequencyLabel(badge.claimType)} for another ${badge.dailyRewardCoins} coins.`,
      });
    },
    onError: async (err: any) => {
      toast({ title: "Could not claim", description: err.message || "Try again later", variant: "destructive" });
    },
  });

  const canClaim = msLeft <= 0;

  return (
    <button
      data-testid={`button-claim-badge-${badge.badgeId}`}
      disabled={!canClaim || claimMutation.isPending}
      onClick={() => claimMutation.mutate()}
      className="w-full rounded-lg font-fantasy text-[10px] tracking-wider py-2 transition-all active:scale-95"
      style={{
        background: canClaim
          ? "linear-gradient(135deg, rgba(240,192,64,0.25), rgba(240,160,20,0.15))"
          : "rgba(0,0,0,0.3)",
        border: `1.5px solid ${canClaim ? "rgba(240,192,64,0.7)" : "rgba(240,192,64,0.2)"}`,
        color: canClaim ? GOLD : GOLD_DIM,
        cursor: canClaim ? "pointer" : "default",
        boxShadow: canClaim ? "0 0 10px rgba(240,192,64,0.2)" : "none",
        opacity: claimMutation.isPending ? 0.7 : 1,
      }}
    >
      {claimMutation.isPending
        ? "Claiming..."
        : canClaim
        ? (
          <span className="flex items-center justify-center gap-1">
            Claim {badge.dailyRewardCoins}
            <img src={coinIconImg} alt="coins" style={{ width: 12, height: 12, objectFit: "contain" }} />
          </span>
        )
        : formatCountdown(msLeft)}
    </button>
  );
}

function RarityDivider({ rarity }: { rarity: string }) {
  const cfg = RARITY_CFG[rarity] ?? RARITY_CFG.common;
  return (
    <div className="flex items-center gap-3 my-4 px-1">
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${cfg.color})` }} />
      <span
        className="font-fantasy text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded"
        style={{
          color: cfg.color,
          border: `1px solid ${cfg.border}`,
          background: cfg.dimColor,
          textShadow: `0 0 8px ${cfg.glow}`,
          boxShadow: `0 0 8px ${cfg.dimColor}`,
        }}
      >
        {cfg.label}
      </span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${cfg.color})` }} />
    </div>
  );
}

interface PopupProps {
  badge: AllBadge;
  userBadge: UserBadge | null;
  isAdmin: boolean;
  onClose: () => void;
  onClaimed: (newCoins: number) => void;
  onSaved: () => void;
}

function BadgePopup({ badge, userBadge, isAdmin, onClose, onClaimed, onSaved }: PopupProps) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [editRarity, setEditRarity] = useState(badge.rarity);
  const [editDesc, setEditDesc] = useState(badge.obtainDescription ?? "");
  const [editHidden, setEditHidden] = useState(badge.hidden);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/badges/${badge.id}`, {
        rarity: editRarity,
        obtainDescription: editDesc.trim() || null,
        hidden: editHidden,
      }),
    onSuccess: () => {
      toast({ title: "Badge updated" });
      setEditMode(false);
      onSaved();
    },
    onError: () => {
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  const cfg = RARITY_CFG[badge.rarity] ?? RARITY_CFG.common;
  const earned = !!userBadge;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative w-72 rounded-2xl p-5 flex flex-col items-center gap-3"
        style={{
          background: "linear-gradient(160deg, #1a1108 0%, #0e0a05 100%)",
          border: `1.5px solid ${cfg.border}`,
          boxShadow: `0 0 30px ${cfg.glow}, 0 8px 32px rgba(0,0,0,0.8)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa" }}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {isAdmin && !editMode && (
          <button
            onClick={() => setEditMode(true)}
            className="absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(240,192,64,0.15)", border: "1px solid rgba(240,192,64,0.4)", color: GOLD }}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}

        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: earned
              ? `linear-gradient(135deg, ${cfg.dimColor}, rgba(0,0,0,0.3))`
              : "rgba(30,30,30,0.8)",
            border: `2px solid ${earned ? cfg.border : "rgba(100,100,100,0.35)"}`,
            boxShadow: earned ? `0 0 20px ${cfg.glow}` : "none",
            filter: earned ? "none" : "grayscale(0.85) brightness(0.5)",
          }}
        >
          <img src={badge.imageUrl} alt={badge.name} className="w-14 h-14 object-contain" />
          {!earned && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full">
              <Lock className="w-6 h-6" style={{ color: "#666" }} />
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="font-fantasy text-sm tracking-widest font-semibold" style={{ color: cfg.color, textShadow: `0 0 10px ${cfg.glow}` }}>
            {badge.name}
          </p>
          <span
            className="font-fantasy text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded mt-1 inline-block"
            style={{ color: cfg.color, background: cfg.dimColor, border: `1px solid ${cfg.border}` }}
          >
            {cfg.label}
          </span>
        </div>

        {editMode ? (
          <div className="w-full flex flex-col gap-2">
            <div>
              <p className="font-fantasy text-[9px] text-[#a89878] mb-1 tracking-wider">Rarity</p>
              <select
                value={editRarity}
                onChange={(e) => setEditRarity(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 font-fantasy text-xs"
                style={{ background: "#1a1108", border: "1px solid rgba(240,192,64,0.4)", color: GOLD }}
              >
                {RARITY_ORDER.map(r => (
                  <option key={r} value={r}>{RARITY_CFG[r].label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="font-fantasy text-[9px] text-[#a89878] mb-1 tracking-wider">How to obtain</p>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                placeholder="Describe how players earn this badge…"
                className="w-full rounded-lg px-2 py-1.5 font-fantasy text-[11px] resize-none"
                style={{ background: "#1a1108", border: "1px solid rgba(240,192,64,0.4)", color: "#e8d5a0" }}
              />
            </div>
            <button
              onClick={() => setEditHidden(h => !h)}
              className="w-full rounded-lg py-1.5 font-fantasy text-[10px] flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: editHidden ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${editHidden ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.15)"}`,
                color: editHidden ? "#f87171" : "#888",
              }}
            >
              {editHidden ? "🔴 Hidden from players (click to show)" : "👁 Visible to all players (click to hide)"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setEditMode(false)}
                className="flex-1 rounded-lg py-1.5 font-fantasy text-[10px]"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa" }}
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1 rounded-lg py-1.5 font-fantasy text-[10px] flex items-center justify-center gap-1"
                style={{ background: "rgba(240,192,64,0.2)", border: "1px solid rgba(240,192,64,0.6)", color: GOLD }}
              >
                <Check className="w-3 h-3" /> {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="w-full rounded-xl px-3 py-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="font-fantasy text-[10px] tracking-wider leading-relaxed" style={{ color: "#c8b48a" }}>
                {badge.obtainDescription ?? "Description coming soon…"}
              </p>
            </div>

            {earned && userBadge && (
              <p className="font-fantasy text-[9px] tracking-wider" style={{ color: GOLD_FAINT }}>
                Earned {new Date(userBadge.awardedAt).toLocaleDateString()}
              </p>
            )}

            {earned && userBadge && userBadge.dailyRewardCoins && (
              <div className="w-full">
                <BadgeClaimButton badge={userBadge} onClaimed={onClaimed} />
              </div>
            )}

            {!earned && (
              <p className="font-fantasy text-[9px] tracking-widest uppercase" style={{ color: "#555" }}>
                Not yet unlocked
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function BadgePage({ user }: BadgePageProps) {
  const [, navigate] = useLocation();
  const [currentUser, setCurrentUser] = useState(user);
  const [selectedBadge, setSelectedBadge] = useState<AllBadge | null>(null);
  const queryClient = useQueryClient();

  const { data: allBadges = [], isLoading: loadingAll } = useQuery<AllBadge[]>({
    queryKey: ["/api/badges"],
  });

  const { data: myBadges = [], isLoading: loadingMine } = useQuery<UserBadge[]>({
    queryKey: ["/api/user/badges"],
  });

  const isLoading = loadingAll || loadingMine;

  const earnedMap = new Map<string, UserBadge>();
  for (const ub of myBadges) {
    earnedMap.set(ub.badgeId, ub);
  }

  const grouped = RARITY_ORDER.reduce<Record<string, AllBadge[]>>((acc, r) => {
    const group = allBadges.filter(b => (b.rarity ?? "common") === r);
    if (group.length > 0) acc[r] = group;
    return acc;
  }, {});

  const handleClaimed = (newCoins: number) => {
    setCurrentUser(u => ({ ...u, coins: newCoins }));
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/badges"] });
  };

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
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85 z-0 pointer-events-none" />

      <div
        className="relative z-10 flex flex-col h-full"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <TopBar
          user={currentUser}
          onProfileClick={() => {}}
          onUserUpdate={(u) => setCurrentUser(u)}
        />

        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            data-testid="button-back-badges"
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(212,160,23,0.4)",
              color: GOLD,
              cursor: "pointer",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2
            className="font-fantasy text-lg tracking-widest"
            style={{ color: GOLD, textShadow: "0 0 16px rgba(240,192,64,0.5)" }}
          >
            Badges
          </h2>
          {!isLoading && (
            <span className="font-fantasy text-[10px] tracking-wider ml-auto" style={{ color: GOLD_FAINT }}>
              {earnedMap.size} / {allBadges.length} earned
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <p className="font-fantasy text-sm tracking-wider animate-pulse" style={{ color: "#7fbfb0" }}>
                Gathering honours…
              </p>
            </div>
          ) : allBadges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: "rgba(240,192,64,0.08)", border: "2px dashed rgba(240,192,64,0.25)" }}
              >
                <svg viewBox="0 0 100 100" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="50,10 54,30 74,30 58,44 64,64 50,52 36,64 42,44 26,30 46,30"
                    fill="rgba(240,192,64,0.25)" stroke="rgba(240,192,64,0.4)" strokeWidth="2" />
                </svg>
              </div>
              <p className="font-fantasy text-sm tracking-wider" style={{ color: GOLD_DIM }}>No badges created yet</p>
            </div>
          ) : (
            <div className="pt-2">
              {RARITY_ORDER.filter(r => grouped[r]).map((rarity) => (
                <div key={rarity}>
                  <RarityDivider rarity={rarity} />
                  <div className="grid grid-cols-3 gap-3">
                    {grouped[rarity].map((badge) => {
                      const earned = earnedMap.has(badge.id);
                      const cfg = RARITY_CFG[rarity] ?? RARITY_CFG.common;
                      return (
                        <button
                          key={badge.id}
                          data-testid={`card-badge-${badge.id}`}
                          onClick={() => setSelectedBadge(badge)}
                          className="flex flex-col items-center gap-1 focus:outline-none active:scale-95 transition-transform"
                        >
                          <div
                            className="relative w-20 h-20 rounded-full flex items-center justify-center"
                            style={{
                              background: earned
                                ? `linear-gradient(135deg, ${cfg.dimColor}, rgba(0,0,0,0.3))`
                                : "rgba(20,20,20,0.7)",
                              border: `2px solid ${earned ? cfg.border : "rgba(80,80,80,0.3)"}`,
                              boxShadow: earned ? `0 0 16px ${cfg.glow}, 0 4px 12px rgba(0,0,0,0.6)` : "0 4px 12px rgba(0,0,0,0.5)",
                              filter: earned ? "none" : "grayscale(0.8) brightness(0.45)",
                            }}
                          >
                            <img
                              src={badge.imageUrl}
                              alt={badge.name}
                              className="w-14 h-14 object-contain"
                              style={{ filter: earned ? `drop-shadow(0 2px 6px ${cfg.glow})` : "none" }}
                            />
                            {!earned && (
                              <div
                                className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(100,100,100,0.5)" }}
                              >
                                <Lock className="w-2.5 h-2.5" style={{ color: "#666" }} />
                              </div>
                            )}
                            {badge.hidden && currentUser.isAdmin && (
                              <div
                                className="absolute top-0 left-0 px-1 rounded-full font-fantasy text-[7px] tracking-wider"
                                style={{ background: "rgba(239,68,68,0.85)", color: "#fff", lineHeight: "16px" }}
                              >
                                HIDDEN
                              </div>
                            )}
                          </div>
                          <p
                            className="font-fantasy text-[9px] tracking-wider text-center leading-tight"
                            style={{ color: earned ? cfg.color : "#555" }}
                          >
                            {badge.name}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedBadge && (
        <BadgePopup
          badge={selectedBadge}
          userBadge={earnedMap.get(selectedBadge.id) ?? null}
          isAdmin={currentUser.isAdmin}
          onClose={() => setSelectedBadge(null)}
          onClaimed={handleClaimed}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
