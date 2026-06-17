import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { playShopBell } from "@/lib/sounds";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import coinPack100 from "@assets/coin_pack_100.png";
import coinPack500 from "@assets/coin_pack_500.png";
import coinPack1000 from "@assets/coin_pack_1000.png";
import coinPack2500 from "@assets/coin_pack_2500.png";
import coinPack5000 from "@assets/coin_pack_5000.png";
import coinPack10000 from "@assets/coin_pack_10000.png";
import limitedBannerImg from "@assets/Photoroom_20260617_64201_AM_1781696551801.png";

interface CoinShopProps {
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

interface CoinPack {
  id: string;
  coins: number;
  priceUsd: number;
  label: string;
}

interface PacksResponse {
  packs: CoinPack[];
  dailySpent: number;
  dailyLimit: number;
  sessionLimit: number;
}

// Map by coin amount — robust to server pack IDs changing over time.
// Available pile artwork: 100, 1000, 2500, 5000, 10000 (500 is unused for current tiers).
function imageForCoins(coins: number): string {
  if (coins <= 100)    return coinPack100;
  if (coins <= 1000)   return coinPack1000;
  if (coins <= 2500)   return coinPack2500;
  if (coins <= 7500)   return coinPack5000;
  if (coins <= 20000)  return coinPack10000;
  return coinPack10000;
}

// Limited-offer bonus eggs for $50 and $100 bundles.
const LIMITED_BONUS: Record<number, { name: string; eggUrl: string }> = {
  20000: { name: "Violet Succubus Egg", eggUrl: "/api/media/62ecf53c-8bfd-40b2-9f65-ad27884d9b18" },
  50000: { name: "The Paradox Egg",     eggUrl: "/api/media/e5019d66-d5a1-4f56-a7e6-e4f9bae5baee" },
};

interface PackStyle { glow: string; border: string; outerGlow: string; }
function styleForCoins(coins: number): PackStyle {
  if (coins <= 100) return {
    glow: "rgba(205,127,50,0.5)",
    border: "rgba(205,127,50,0.6)",
    outerGlow: "0 0 20px rgba(205,127,50,0.3), 0 4px 30px rgba(205,127,50,0.2)",
  };
  if (coins <= 1000) return {
    glow: "rgba(74,222,128,0.55)",
    border: "rgba(74,222,128,0.6)",
    outerGlow: "0 0 25px rgba(74,222,128,0.35), 0 4px 35px rgba(74,222,128,0.25)",
  };
  if (coins <= 2500) return {
    glow: "rgba(96,165,250,0.55)",
    border: "rgba(96,165,250,0.6)",
    outerGlow: "0 0 30px rgba(96,165,250,0.4), 0 4px 40px rgba(96,165,250,0.3)",
  };
  if (coins <= 7500) return {
    glow: "rgba(192,132,252,0.6)",
    border: "rgba(192,132,252,0.7)",
    outerGlow: "0 0 35px rgba(192,132,252,0.45), 0 4px 45px rgba(192,132,252,0.35)",
  };
  if (coins <= 20000) return {
    glow: "rgba(240,192,64,0.7)",
    border: "rgba(240,192,64,0.8)",
    outerGlow: "0 0 45px rgba(240,192,64,0.5), 0 4px 50px rgba(240,192,64,0.4), 0 0 80px rgba(240,192,64,0.2)",
  };
  return {
    glow: "rgba(255,80,255,0.75)",
    border: "rgba(255,80,255,0.85)",
    outerGlow: "0 0 50px rgba(255,80,255,0.55), 0 4px 60px rgba(255,80,255,0.45), 0 0 100px rgba(255,80,255,0.3)",
  };
}

const fireflyKeyframes = `
@keyframes coinSpin {
  0% { transform: rotateY(0deg) scale(1); }
  50% { transform: rotateY(180deg) scale(1.15); }
  100% { transform: rotateY(360deg) scale(1); }
}
@keyframes modalScaleIn {
  0% { transform: scale(0.7) translateY(20px); opacity: 0; }
  60% { transform: scale(1.04) translateY(-4px); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes coinGlowPulse {
  0%, 100% { filter: drop-shadow(0 0 18px rgba(240,192,64,0.9)) drop-shadow(0 0 40px rgba(240,192,64,0.5)); }
  50% { filter: drop-shadow(0 0 30px rgba(240,192,64,1)) drop-shadow(0 0 70px rgba(240,192,64,0.7)) drop-shadow(0 0 100px rgba(240,192,64,0.3)); }
}
@keyframes shimmerText {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fireflyDrift1 {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  10% { opacity: 1; }
  50% { transform: translate(60px, -80px) scale(1.3); opacity: 0.8; }
  90% { opacity: 1; }
  100% { transform: translate(-20px, -160px) scale(0.8); opacity: 0; }
}
@keyframes fireflyDrift2 {
  0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
  15% { opacity: 0.9; }
  50% { transform: translate(-70px, -60px) scale(1.2); opacity: 0.7; }
  85% { opacity: 0.9; }
  100% { transform: translate(30px, -140px) scale(1); opacity: 0; }
}
@keyframes fireflyDrift3 {
  0% { transform: translate(0, 0) scale(1.1); opacity: 0; }
  20% { opacity: 0.8; }
  50% { transform: translate(40px, -100px) scale(0.9); opacity: 1; }
  80% { opacity: 0.7; }
  100% { transform: translate(-40px, -180px) scale(1.2); opacity: 0; }
}
@keyframes fireflyDrift4 {
  0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
  12% { opacity: 1; }
  50% { transform: translate(-50px, -70px) scale(1.1); opacity: 0.6; }
  88% { opacity: 0.8; }
  100% { transform: translate(20px, -120px) scale(0.7); opacity: 0; }
}
@keyframes fireflyDrift5 {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  18% { opacity: 0.7; }
  50% { transform: translate(80px, -50px) scale(1.4); opacity: 0.9; }
  82% { opacity: 0.6; }
  100% { transform: translate(-10px, -130px) scale(0.9); opacity: 0; }
}
@keyframes titleGlow {
  0%, 100% { filter: drop-shadow(0 0 15px rgba(127,255,212,0.5)) drop-shadow(0 0 30px rgba(74,222,128,0.3)); }
  50% { filter: drop-shadow(0 0 25px rgba(127,255,212,0.7)) drop-shadow(0 0 50px rgba(74,222,128,0.5)); }
}
@keyframes cardPulse {
  0%, 100% { box-shadow: var(--card-glow); }
  50% { box-shadow: var(--card-glow-bright); }
}
`;

const fireflies = [
  { left: "15%", bottom: "60%", animation: "fireflyDrift1 6s ease-in-out infinite", color: "rgba(180,255,200,0.9)", size: 4 },
  { left: "75%", bottom: "40%", animation: "fireflyDrift2 8s ease-in-out 1s infinite", color: "rgba(127,255,212,0.85)", size: 3 },
  { left: "45%", bottom: "70%", animation: "fireflyDrift3 7s ease-in-out 2s infinite", color: "rgba(200,255,180,0.9)", size: 5 },
  { left: "85%", bottom: "50%", animation: "fireflyDrift4 9s ease-in-out 0.5s infinite", color: "rgba(160,255,200,0.8)", size: 3 },
  { left: "30%", bottom: "30%", animation: "fireflyDrift5 7.5s ease-in-out 3s infinite", color: "rgba(127,255,212,0.85)", size: 4 },
];

export default function CoinShopPage({ user }: CoinShopProps) {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  // Guard: prevents the verify effect from running more than once per page load
  // (wouter v3 patches replaceState so the effect can re-fire after URL cleanup).
  const verifiedRef = useRef(false);
  // Initialise to true synchronously so the overlay shows on the very first render
  // when the player is redirected back from Stripe — no flash of the coin shop.
  const [verifying, setVerifying] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("success") === "true" && !!p.get("session_id");
  });
  const [successCoins, setSuccessCoins] = useState<number | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);

  // Keep local coin display in sync when parent re-fetches updated user data
  useEffect(() => { setCurrentUser(user); }, [user]);

  const { data: packsData, isLoading } = useQuery<PacksResponse>({
    queryKey: ["/api/coins/packs"],
  });

  interface ProgressData {
    monthYear: string;
    points: number;
    claimedMilestones: number[];
    milestoneRewards: {
      milestone_points: number;
      reward_coins: number | null;
      reward_item_id: string | null;
      reward_item_name: string | null;
      reward_item_image_url: string | null;
      reward_label: string | null;
      item_type: string | null;
      stat_boost_amount: number | null;
      stat_boost_type: string | null;
      star_rarity: number | null;
      gift_points: number | null;
    }[];
  }
  const { data: progressData } = useQuery<ProgressData>({
    queryKey: ["/api/coins/progress"],
    staleTime: 30_000,
  });

  const [adminPickerMs, setAdminPickerMs] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<string>("all");
  const { data: allShopItems = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/shop-items-all"],
    enabled: adminPickerMs !== null && currentUser.isAdmin,
    staleTime: 60_000,
  });
  const saveMilestoneMutation = useMutation({
    mutationFn: async ({ ms, itemId, itemName, itemImageUrl }: { ms: number; itemId: string | null; itemName: string | null; itemImageUrl: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestone-rewards/${ms}`, {
        rewardItemId: itemId,
        rewardItemName: itemName,
        rewardItemImageUrl: itemImageUrl,
        rewardLabel: itemName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins/progress"] });
      setAdminPickerMs(null);
      setPickerSearch("");
      toast({ title: "Milestone reward saved!" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", "/api/coins/checkout", { packId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      setBuyingPackId(null);
      const msg = err.message || "Failed to start checkout";
      const parsed = (() => { try { return JSON.parse(msg.replace(/^\d+:\s*/, '')); } catch { return null; } })();
      toast({ title: "Purchase Failed", description: parsed?.message || msg, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const success = params.get("success");
    const sessionId = params.get("session_id");
    const canceled = params.get("canceled");

    if (canceled) {
      setShowCanceled(true);
      window.history.replaceState({}, "", "/coins");
      setTimeout(() => setShowCanceled(false), 4000);
      return;
    }

    if (success && sessionId) {
      // Guard against double-fire caused by wouter patching replaceState
      if (verifiedRef.current) return;
      verifiedRef.current = true;

      // Clean the URL FIRST — before any state change — so that if wouter
      // re-runs this effect it sees no params and exits via the guard above.
      window.history.replaceState({}, "", "/coins");

      // verifying was already set true synchronously via useState initializer
      apiRequest("POST", "/api/coins/verify", { sessionId })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setCurrentUser(data.user);
            // Optimistically push the fresh user into the cache so other pages
            // see updated coins instantly — no flicker from a refetch.
            queryClient.setQueryData(["/api/auth/me"], data.user);
          }
          // Refresh daily-spent counter in the background (non-blocking)
          queryClient.invalidateQueries({ queryKey: ["/api/coins/packs"] });
          if (data.credited || data.alreadyCredited) {
            setSuccessCoins(data.coins);
            // Fire celebrations inline — not in a reactive effect — so they
            // are guaranteed to run exactly once in the same microtask flush.
            try { playShopBell(); } catch {}
            try { burstGoldenOrbs(window.innerWidth / 2, window.innerHeight / 2); } catch {}
            setTimeout(() => { try { burstGoldenOrbs(window.innerWidth / 3, window.innerHeight / 3); } catch {} }, 300);
            setTimeout(() => { try { burstGoldenOrbs((window.innerWidth * 2) / 3, window.innerHeight / 3); } catch {} }, 500);
          }
        })
        .catch(() => {
          toast({ title: "Hmm, something went wrong", description: "Your coins should arrive shortly. Contact support if they don't appear.", variant: "destructive" });
        })
        .finally(() => setVerifying(false));
    }
  }, [searchString]);

  const handleBuy = (packId: string) => {
    setBuyingPackId(packId);
    checkoutMutation.mutate(packId);
  };

  const dailyRemaining = packsData ? packsData.dailyLimit - packsData.dailySpent : 500;

  return (
    <div className="h-screen-frame flex flex-col relative overflow-hidden" style={{ background: "linear-gradient(180deg, #040d04 0%, #071a0a 15%, #0d2510 40%, #081a0d 65%, #051208 85%, #040d04 100%)" }}>
      <style>{fireflyKeyframes}</style>

      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse at 30% 20%, rgba(74,222,128,0.06) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(127,255,212,0.04) 0%, transparent 50%)"
      }} />

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "120px", pointerEvents: "none", zIndex: 1,
        background: "linear-gradient(180deg, rgba(0,15,0,0.8) 0%, rgba(0,20,5,0.4) 50%, transparent 100%)"
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "100px", pointerEvents: "none", zIndex: 1,
        background: "linear-gradient(0deg, rgba(0,10,0,0.9) 0%, rgba(0,15,5,0.4) 50%, transparent 100%)"
      }} />

      {fireflies.map((fly, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: fly.left,
            bottom: fly.bottom,
            width: fly.size,
            height: fly.size,
            borderRadius: "50%",
            background: fly.color,
            boxShadow: `0 0 ${fly.size * 3}px ${fly.color}, 0 0 ${fly.size * 6}px ${fly.color}`,
            animation: fly.animation,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      ))}

      <div style={{ position: "relative", zIndex: 3, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />
      </div>

      <div className="flex-1 overflow-y-auto pb-6" style={{ position: "relative", zIndex: 3 }}>
        <div className="px-4 pt-5 pb-3" style={{ position: "relative", textAlign: "center" }}>
          <h1
            className="font-fantasy text-2xl tracking-[0.25em]"
            data-testid="text-coin-shop-title"
            style={{
              background: "linear-gradient(135deg, #7fffd4 0%, #f0c040 40%, #4ade80 70%, #7fffd4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "none",
            }}
          >
            Enchanted Treasury
          </h1>
          <p className="font-fantasy text-[10px] tracking-[0.2em] mt-2" style={{ color: "rgba(127,255,212,0.45)" }}>
            Fuel your adventure with mystical currency
          </p>
          <button
            data-testid="button-close-coin-shop"
            onClick={() => navigate("/")}
            className="flex items-center justify-center transition-transform active:scale-90"
            style={{
              position: "absolute", top: 0, right: 0,
              width: 32, height: 32,
              background: "rgba(10,5,2,0.65)",
              border: "1.5px solid rgba(212,160,23,0.35)",
              borderRadius: "50%",
              color: "rgba(212,160,23,0.85)",
              cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Contribution Rewards Progress Bar ───────────────────────────── */}
        {(() => {
          const pts = progressData?.points ?? 0;
          const claimed = progressData?.claimedMilestones ?? [];
          const rewards = progressData?.milestoneRewards ?? [];
          const TOTAL = 10000;
          const MILESTONES = [
            { end: 500,   label: "Bronze",    color: "#cd7f32", pct: 5   },
            { end: 2500,  label: "Silver",    color: "#c0c0c0", pct: 25  },
            { end: 5000,  label: "Gold",      color: "#f6dc8a", pct: 50  },
            { end: 10000, label: "Legendary", color: "#d946ef", pct: 100 },
          ];
          const fillPct = Math.min(pts / TOTAL * 100, 100);
          const nextMs = MILESTONES.find(m => pts < m.end);
          const ptsUntilNext = nextMs ? nextMs.end - pts : 0;
          const monthLabel = progressData?.monthYear
            ? new Date(progressData.monthYear + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : "";
          const ITEM_TYPES = ["all", "pet", "edibles", "gift", "potion", "other"] as const;
          const filteredItems = allShopItems.filter((it: any) => {
            const matchesTab = pickerTab === "all"
              || (pickerTab === "other" ? !["pet","edibles","gift","potion"].includes(it.type) : it.type === pickerTab);
            const matchesSearch = !pickerSearch || it.name?.toLowerCase().includes(pickerSearch.toLowerCase());
            return matchesTab && matchesSearch;
          });
          const getStatLine = (cfg: any): string => {
            if (!cfg?.reward_item_id) return "";
            if (cfg.item_type === "pet") return "⭐".repeat(Math.max(1, cfg.star_rarity ?? 1));
            if (cfg.item_type === "edibles" && cfg.stat_boost_amount) return `+${cfg.stat_boost_amount} Feed pts`;
            if (cfg.item_type === "potion" && cfg.stat_boost_amount) {
              const lbl = cfg.stat_boost_type === "mana" ? "Mana" : cfg.stat_boost_type === "revive" ? "Revive" : "HP";
              return `+${cfg.stat_boost_amount} ${lbl}`;
            }
            if (cfg.item_type === "gift" && cfg.gift_points) return `+${cfg.gift_points} Loyalty`;
            return "";
          };

          return (
            <div className="mx-4 mb-4 rounded-xl p-4" style={{
              background: "linear-gradient(160deg, rgba(14,10,2,0.97) 0%, rgba(28,20,4,0.97) 100%)",
              border: "1px solid rgba(212,160,23,0.35)",
              boxShadow: "0 0 20px rgba(212,160,23,0.08), inset 0 1px 0 rgba(246,220,138,0.06)",
            }} data-testid="progress-bar-container">

              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-fantasy text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(246,220,138,0.7)" }}>
                  ✦ Contribution Rewards
                </span>
                {monthLabel && (
                  <span className="font-fantasy text-[9px]" style={{ color: "rgba(212,160,23,0.4)" }}>
                    Resets {monthLabel}
                  </span>
                )}
              </div>

              {/* Points */}
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-fantasy text-base tracking-wider" data-testid="text-progress-points" style={{ color: "#f6dc8a", textShadow: "0 0 10px rgba(212,160,23,0.5)" }}>
                  {pts.toLocaleString()}
                </span>
                <span className="font-fantasy text-[10px]" style={{ color: "rgba(212,160,23,0.5)" }}>pts this month</span>
              </div>

              {/* ── Item reward slots + bar — right-padded so 100% bullet has breathing room ── */}
              <div style={{ paddingRight: "18px" }}>

              {/* ── Item reward slots positioned above the bar ── */}
              <div style={{ position: "relative", height: 60, marginBottom: 4, overflow: "visible" }}>
                {MILESTONES.map((m, _i) => {
                  const isDone = claimed.includes(m.end);
                  const isReachable = pts >= m.end && !isDone;
                  const rewardCfg = rewards.find((r: any) => Number(r.milestone_points) === m.end);
                  const hasItem = !!rewardCfg?.reward_item_image_url;

                  return (
                    <div key={m.end} style={{
                      position: "absolute",
                      left: `${m.pct}%`,
                      top: 0,
                      transform: "translateX(-50%)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      width: 46,
                    }}>
                      {/* Item image or empty slot */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {hasItem ? (
                          <>
                            <img
                              src={rewardCfg.reward_item_image_url}
                              alt={rewardCfg.reward_item_name ?? ""}
                              style={{
                                width: 40, height: 40, objectFit: "contain",
                                display: "block",
                                filter: isDone
                                  ? "brightness(0.45) grayscale(0.6)"
                                  : isReachable
                                  ? "drop-shadow(0 0 10px rgba(246,220,138,0.9)) drop-shadow(0 0 4px rgba(212,160,23,0.7))"
                                  : "drop-shadow(0 0 4px rgba(212,160,23,0.25))",
                                border: isDone
                                  ? "1.5px solid rgba(246,220,138,0.18)"
                                  : isReachable
                                  ? "1.5px solid rgba(246,220,138,0.9)"
                                  : "1.5px solid rgba(212,160,23,0.4)",
                                borderRadius: 7,
                                boxShadow: isReachable
                                  ? "0 0 10px rgba(212,160,23,0.5), inset 0 0 4px rgba(246,220,138,0.1)"
                                  : isDone ? "none" : "0 0 4px rgba(212,160,23,0.15)",
                              }}
                            />
                            {isDone && (
                              <div style={{
                                position: "absolute", inset: 0, borderRadius: 7,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(0,0,0,0.15)",
                              }}>
                                <span style={{ fontSize: 16, lineHeight: 1, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>✅</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: 7,
                            border: "1.5px dashed rgba(212,160,23,0.3)",
                            background: "rgba(212,160,23,0.03)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }} />
                        )}
                      </div>
                      {/* Pet egg star rarity only */}
                      {hasItem && rewardCfg.item_type === "pet" && rewardCfg.star_rarity ? (
                        <span style={{
                          fontSize: 8, lineHeight: 1, whiteSpace: "nowrap",
                          color: isDone ? "rgba(255,215,0,0.3)" : "rgba(255,215,0,0.85)",
                        }}>{"⭐".repeat(Math.max(1, rewardCfg.star_rarity))}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* ── Single XP-style fill bar ── */}
              <div style={{ position: "relative" }}>
                {/* Bar track */}
                <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.07)", overflow: "hidden", position: "relative" }}>
                  {/* Gold fill */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${fillPct}%`,
                    background: "linear-gradient(90deg, #8a5c08 0%, #c9930a 55%, #f6dc8a 100%)",
                    boxShadow: fillPct > 0 ? "0 0 10px rgba(212,160,23,0.6)" : "none",
                    transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)",
                  }} />
                </div>
                {/* Milestone bullet markers sitting on the bar */}
                {MILESTONES.map(m => {
                  const passed = pts >= m.end;
                  return (
                    <div key={m.end} style={{
                      position: "absolute",
                      left: `${m.pct}%`,
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: 10, height: 10,
                      borderRadius: "50%",
                      background: passed ? m.color : "rgba(255,255,255,0.12)",
                      border: `1.5px solid ${passed ? m.color : "rgba(255,255,255,0.08)"}`,
                      boxShadow: passed ? `0 0 6px ${m.color}` : "none",
                      zIndex: 3,
                    }} />
                  );
                })}
              </div>

              </div>{/* end right-padded wrapper */}

              {/* Footer */}
              <div className="flex items-center mt-2">
                <span className="font-fantasy text-[9px]" style={{ color: "rgba(212,160,23,0.45)" }}>
                  {ptsUntilNext > 0 ? `${ptsUntilNext.toLocaleString()} pts to ${nextMs?.label}` : "✦ All milestones reached!"}
                </span>
              </div>

              {/* ── Admin item picker ── */}
              {currentUser.isAdmin && adminPickerMs !== null && (
                <div style={{ marginTop: 10, borderRadius: 8, border: "1px solid rgba(251,146,60,0.4)", background: "rgba(28,10,4,0.97)", padding: 8 }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-fantasy text-[10px]" style={{ color: "#fb923c" }}>
                      Set reward — {MILESTONES.find(m => m.end === adminPickerMs)?.label}
                    </span>
                    <button
                      onClick={() => { setAdminPickerMs(null); setPickerSearch(""); setPickerTab("all"); }}
                      style={{ background: "none", border: "none", color: "rgba(251,146,60,0.55)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}
                    >✕</button>
                  </div>
                  {/* Type filter tabs */}
                  <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" as const }}>
                    {ITEM_TYPES.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setPickerTab(tab)}
                        style={{
                          padding: "2px 7px", borderRadius: 4, fontSize: 8, cursor: "pointer",
                          fontFamily: "Lora, serif", textTransform: "capitalize" as const,
                          border: pickerTab === tab ? "1px solid rgba(251,146,60,0.8)" : "1px solid rgba(251,146,60,0.2)",
                          background: pickerTab === tab ? "rgba(251,146,60,0.2)" : "rgba(251,146,60,0.04)",
                          color: pickerTab === tab ? "#fb923c" : "rgba(255,255,255,0.4)",
                        }}
                      >{tab}</button>
                    ))}
                  </div>
                  <input
                    autoFocus
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Search items…"
                    style={{
                      width: "100%", padding: "4px 8px", borderRadius: 5, fontSize: 10,
                      background: "rgba(255,255,255,0.07)", border: "1px solid rgba(251,146,60,0.28)",
                      color: "#fff", outline: "none", marginBottom: 6, boxSizing: "border-box" as const,
                    }}
                  />
                  <button
                    onClick={() => saveMilestoneMutation.mutate({ ms: adminPickerMs, itemId: null, itemName: null, itemImageUrl: null })}
                    disabled={saveMilestoneMutation.isPending}
                    style={{
                      width: "100%", padding: "3px 0", borderRadius: 5, marginBottom: 6,
                      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.4)", fontSize: 9, cursor: "pointer", fontFamily: "Lora, serif",
                    }}
                  >✕ Clear reward</button>
                  <div style={{ maxHeight: 160, overflowY: "auto" as const, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                    {filteredItems.length === 0 && (
                      <div style={{ gridColumn: "1/-1", color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center" as const, padding: 8 }}>
                        {allShopItems.length === 0 ? "Loading…" : "No items match"}
                      </div>
                    )}
                    {filteredItems.map((it: any) => (
                      <button
                        key={it.id}
                        onClick={() => saveMilestoneMutation.mutate({
                          ms: adminPickerMs,
                          itemId: it.id,
                          itemName: it.name,
                          itemImageUrl: it.imageUrl || null,
                        })}
                        disabled={saveMilestoneMutation.isPending}
                        title={it.name}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          padding: "4px 2px", borderRadius: 6, cursor: "pointer",
                          border: "1px solid rgba(251,146,60,0.2)",
                          background: "rgba(251,146,60,0.06)",
                        }}
                      >
                        {it.imageUrl ? (
                          <img src={it.imageUrl} alt={it.name} style={{ width: 32, height: 32, objectFit: "contain" as const }} />
                        ) : (
                          <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
                        )}
                        <span style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", lineHeight: 1.2, textAlign: "center" as const, maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{it.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {showCanceled && (
          <div className="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: "rgba(40,15,5,0.85)", border: "1px solid rgba(200,100,50,0.45)" }}>
            <span className="font-fantasy text-[11px] tracking-wider" style={{ color: "rgba(255,180,100,0.85)" }}>
              ✕ &nbsp;Purchase canceled — no charge was made
            </span>
            <button onClick={() => setShowCanceled(false)} style={{ background: "none", border: "none", color: "rgba(255,180,100,0.4)", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
        )}


        {isLoading ? (
          <div className="text-center py-12">
            <p className="font-fantasy text-sm animate-pulse" style={{ color: "rgba(127,255,212,0.4)" }}>Loading treasury...</p>
          </div>
        ) : (
          <div className="px-4 grid grid-cols-2 gap-3">
            {packsData?.packs.map((pack) => {
              const isDisabled = pack.priceUsd > dailyRemaining;
              const isBuying = buyingPackId === pack.id && checkoutMutation.isPending;
              const packImage = imageForCoins(pack.coins);
              const { glow: glowColor, border: borderColor, outerGlow } = styleForCoins(pack.coins);

              const bonus = LIMITED_BONUS[pack.coins];
              return (
                <button
                  key={pack.id}
                  data-testid={`button-buy-pack-${pack.id}`}
                  onClick={() => { if (!isDisabled && !isBuying) { handleBuy(pack.id); } }}
                  disabled={isDisabled || isBuying}
                  className="relative rounded-xl flex flex-col items-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                  style={{
                    padding: bonus ? "30px 16px 16px" : "16px",
                    background: bonus
                      ? `linear-gradient(145deg, rgba(8,5,20,0.98) 0%, rgba(20,10,40,0.98) 50%, rgba(10,5,22,0.98) 100%)`
                      : `linear-gradient(145deg, rgba(5,15,8,0.98) 0%, rgba(10,28,14,0.98) 50%, rgba(5,18,10,0.98) 100%)`,
                    border: `1.5px solid ${isDisabled ? 'rgba(50,80,55,0.2)' : borderColor}`,
                    boxShadow: isDisabled ? 'none' : `${outerGlow}, inset 0 1px 0 rgba(127,255,212,0.08)`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
                    background: `radial-gradient(ellipse at center 30%, ${glowColor.replace(/[\d.]+\)$/, '0.08)')} 0%, transparent 70%)`,
                  }} />

                  {bonus && (
                    <img
                      src={limitedBannerImg}
                      alt="Limited"
                      style={{
                        position: "absolute",
                        top: -22,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 140,
                        pointerEvents: "none",
                        zIndex: 2,
                        filter: "drop-shadow(0 2px 8px rgba(160,40,220,0.6))",
                      }}
                    />
                  )}

                  {packImage && (
                    <img
                      src={packImage}
                      alt={pack.label}
                      className="object-contain relative"
                      style={{
                        width: 80,
                        height: 80,
                        marginTop: 0,
                        filter: isDisabled ? "grayscale(0.6) brightness(0.5)" : `drop-shadow(0 4px 16px ${glowColor}) drop-shadow(0 0 8px ${glowColor})`,
                      }}
                    />
                  )}
                  <div className="flex items-center gap-1 relative">
                    <img src={coinIconImg} alt="" className="w-4 h-4" style={{ filter: "drop-shadow(0 0 4px rgba(240,192,64,0.5))" }} />
                    <span className="font-fantasy text-[#f0c040] text-sm tracking-wider" style={{ textShadow: "0 0 8px rgba(240,192,64,0.3)" }}>
                      {pack.coins.toLocaleString()}
                    </span>
                  </div>

                  {/* 33% bonus tag */}
                  <div className="flex items-center gap-1 justify-center" style={{
                    background: "rgba(74,222,128,0.1)",
                    border: "1px solid rgba(74,222,128,0.35)",
                    borderRadius: 6, padding: "2px 7px",
                  }}>
                    <span className="font-fantasy text-[9px] tracking-wide" style={{ color: "#4ade80", textShadow: "0 0 6px rgba(74,222,128,0.4)" }}>
                      +{Math.round(pack.coins * 0.33).toLocaleString()} bonus coins
                    </span>
                  </div>

                  {bonus && (
                    <div className="flex flex-col items-center gap-1 w-full rounded-lg px-2 py-2" style={{
                      background: "linear-gradient(135deg, rgba(80,10,140,0.35) 0%, rgba(140,30,200,0.22) 100%)",
                      border: "1px solid rgba(200,80,255,0.45)",
                      boxShadow: "0 0 14px rgba(180,50,255,0.18) inset",
                    }}>
                      <img
                        src={bonus.eggUrl}
                        alt={bonus.name}
                        className="object-contain"
                        style={{
                          width: 56, height: 56,
                          filter: "drop-shadow(0 0 10px rgba(200,80,255,1)) drop-shadow(0 0 22px rgba(160,40,220,0.7))",
                        }}
                      />
                      <span className="font-fantasy text-[9px] tracking-wide text-center" style={{ color: "#e8b8ff", textShadow: "0 0 8px rgba(200,100,255,0.7)" }}>
                        + {bonus.name}
                      </span>
                    </div>
                  )}

                  <div
                    className="w-full py-1.5 rounded-md font-fantasy text-[11px] tracking-wider text-center relative"
                    style={{
                      background: isBuying ? "rgba(74,222,128,0.15)" : "linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(74,222,128,0.2) 50%, rgba(34,197,94,0.25) 100%)",
                      border: "1px solid rgba(74,222,128,0.4)",
                      color: "#4ade80",
                      textShadow: "0 0 8px rgba(74,222,128,0.3)",
                    }}
                  >
                    {isBuying ? "Processing..." : `$${pack.priceUsd}`}
                  </div>
                  {isDisabled && (
                    <span className="font-fantasy text-[#ff6b6b] text-[8px] tracking-wider">
                      Daily limit reached
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mx-4 mt-5 rounded-lg p-3" style={{ background: "rgba(5,18,8,0.7)", border: "1px solid rgba(74,222,128,0.15)" }}>
          <p className="font-fantasy text-[8px] tracking-wider text-center" style={{ color: "rgba(127,255,212,0.2)" }}>
            All purchases are processed securely via Stripe
          </p>
        </div>

        <div className="flex justify-center mt-5">
          <button
            data-testid="button-back-home"
            onClick={() => navigate("/")}
            className="px-8 py-2 rounded-md font-fantasy text-xs tracking-wider transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(5,20,10,0.9) 0%, rgba(10,30,15,0.9) 100%)",
              border: "1px solid rgba(127,255,212,0.3)",
              color: "#7fffd4",
              cursor: "pointer",
              boxShadow: "0 0 15px rgba(127,255,212,0.1)",
            }}
          >
            Back to Home
          </button>
        </div>

        <div className="flex justify-center mt-4 pb-2">
          <button
            data-testid="link-privacy-policy"
            onClick={() => navigate("/privacy")}
            className="font-fantasy text-[10px] tracking-wider underline underline-offset-2"
            style={{
              background: "none",
              border: "none",
              color: "rgba(127,255,212,0.35)",
              cursor: "pointer",
            }}
          >
            Privacy Policy
          </button>
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          }}
        />
      )}


      {/* Verification overlay — shown immediately on return from Stripe, before coins are credited */}
      {verifying && successCoins === null && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(2,8,3,0.985)",
            animation: "overlayFadeIn 0.15s ease-out",
            willChange: "opacity",
          }}
        >
          <img
            src={coinIconImg}
            alt=""
            style={{
              width: 88, height: 88, objectFit: "contain", marginBottom: 28,
              animation: "coinSpin 2s ease-in-out infinite, coinGlowPulse 1.6s ease-in-out infinite",
            }}
          />
          <div className="font-fantasy tracking-[0.22em] text-base animate-pulse" style={{ color: "#f0c040", marginBottom: 10 }}>
            Securing Your Coins
          </div>
          <div className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(127,255,212,0.4)" }}>
            Verifying your payment with Stripe...
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "rgba(240,192,64,0.6)",
                animation: `fireflyDrift${i + 1} 1s ease-in-out ${i * 0.35}s infinite alternate`,
              }} />
            ))}
          </div>
        </div>
      )}

      {successCoins !== null && (
        <div
          data-testid="modal-purchase-success"
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,8,2,0.88)",
            animation: "overlayFadeIn 0.25s ease-out",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{
            position: "relative",
            width: "min(340px, 90vw)",
            background: "linear-gradient(160deg, #050f07 0%, #0a1f0d 40%, #081808 70%, #040d05 100%)",
            border: "1.5px solid rgba(127,255,212,0.45)",
            borderRadius: "20px",
            padding: "36px 28px 28px",
            textAlign: "center",
            boxShadow: "0 0 60px rgba(74,222,128,0.18), 0 0 120px rgba(127,255,212,0.1), inset 0 1px 0 rgba(127,255,212,0.12)",
            animation: "modalScaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "60px",
              background: "linear-gradient(180deg, rgba(74,222,128,0.07) 0%, transparent 100%)",
              borderRadius: "20px 20px 0 0", pointerEvents: "none",
            }} />

            <div style={{
              position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)",
              width: "80px", height: "2px",
              background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.8), transparent)",
              borderRadius: "2px",
            }} />

            <div style={{ marginBottom: "20px" }}>
              <img
                src={coinIconImg}
                alt="coins"
                style={{
                  width: "72px", height: "72px",
                  margin: "0 auto",
                  display: "block",
                  animation: "coinSpin 2.5s ease-in-out infinite, coinGlowPulse 1.8s ease-in-out infinite",
                }}
              />
            </div>

            <div
              className="font-fantasy tracking-widest"
              style={{
                fontSize: "11px",
                color: "rgba(127,255,212,0.6)",
                letterSpacing: "0.25em",
                marginBottom: "8px",
                textTransform: "uppercase",
              }}
            >
              ✦ Purchase Complete ✦
            </div>

            <div
              data-testid="text-success-message"
              className="font-fantasy"
              style={{
                fontSize: "32px",
                fontWeight: "bold",
                background: "linear-gradient(90deg, #f0c040, #ffe080, #f0c040, #ffd700, #f0c040)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "shimmerText 2.5s linear infinite",
                marginBottom: "6px",
                lineHeight: 1.1,
              }}
            >
              +{successCoins.toLocaleString()}
            </div>

            <div
              className="font-fantasy tracking-wider"
              style={{ fontSize: "16px", color: "#7fffd4", marginBottom: "6px" }}
            >
              Coins
            </div>

            <p
              className="font-fantasy tracking-wider"
              style={{ fontSize: "11px", color: "rgba(127,255,212,0.45)", marginBottom: "28px" }}
            >
              Added to your treasury
            </p>

            <button
              data-testid="button-dismiss-success"
              onClick={() => { playShopBell(); setSuccessCoins(null); }}
              className="font-fantasy tracking-widest"
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: "10px",
                fontSize: "12px",
                letterSpacing: "0.2em",
                background: "linear-gradient(135deg, rgba(74,222,128,0.18) 0%, rgba(127,255,212,0.12) 100%)",
                border: "1.5px solid rgba(127,255,212,0.45)",
                color: "#7fffd4",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(127,255,212,0.12)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "linear-gradient(135deg, rgba(74,222,128,0.28) 0%, rgba(127,255,212,0.2) 100%)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "linear-gradient(135deg, rgba(74,222,128,0.18) 0%, rgba(127,255,212,0.12) 100%)"; }}
            >
              ✦ Wondrous! ✦
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
