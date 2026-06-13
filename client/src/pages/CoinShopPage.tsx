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
    milestoneRewards: { milestone_points: number; reward_coins: number | null; reward_item_id: string | null; reward_item_name: string | null; reward_item_image_url: string | null; reward_label: string | null }[];
  }
  const { data: progressData } = useQuery<ProgressData>({
    queryKey: ["/api/coins/progress"],
    staleTime: 30_000,
  });

  const [adminEditMs, setAdminEditMs] = useState<number | null>(null);
  const [adminEditLabel, setAdminEditLabel] = useState("");
  const saveMilestoneMutation = useMutation({
    mutationFn: async ({ ms, label }: { ms: number; label: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestone-rewards/${ms}`, { rewardLabel: label.trim() || null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins/progress"] });
      setAdminEditMs(null);
      toast({ title: "Reward label saved!" });
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
        {/* Close button — fixed just below the TopBar, above the title */}
        <button
          data-testid="button-close-coin-shop"
          onClick={() => navigate("/")}
          className="fixed flex items-center justify-center transition-transform active:scale-90"
          style={{
            top: 60,
            right: 12,
            width: 32,
            height: 32,
            background: "rgba(10,5,2,0.75)",
            border: "1.5px solid rgba(212,160,23,0.4)",
            borderRadius: "50%",
            color: "rgba(212,160,23,0.85)",
            cursor: "pointer",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          <X size={16} />
        </button>
        <div className="px-4 pt-5 pb-3 text-center">
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
        </div>

        {/* ── Contribution Rewards Progress Bar ───────────────────────────── */}
        {(() => {
          const pts = progressData?.points ?? 0;
          const claimed = progressData?.claimedMilestones ?? [];
          const rewards = progressData?.milestoneRewards ?? [];
          const TOTAL = 10000;
          const MILESTONES = [
            { end: 500,   icon: "🥉", label: "Bronze",    color: "#cd7f32", glow: "rgba(205,127,50,0.9)",   pct: 5  },
            { end: 2500,  icon: "🥈", label: "Silver",    color: "#d4d4d4", glow: "rgba(212,212,212,0.9)",  pct: 25 },
            { end: 5000,  icon: "🥇", label: "Gold",      color: "#f6dc8a", glow: "rgba(246,220,138,0.9)",  pct: 50 },
            { end: 10000, icon: "✨", label: "Legendary", color: "#d946ef", glow: "rgba(217,70,239,0.9)",   pct: 100 },
          ];
          const fillPct = Math.min(pts / TOTAL * 100, 100);
          const nextMs = MILESTONES.find(m => pts < m.end);
          const ptsUntilNext = nextMs ? nextMs.end - pts : 0;
          const monthLabel = progressData?.monthYear
            ? new Date(progressData.monthYear + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : "";

          return (
            <div className="mx-4 mb-4 rounded-xl p-4" style={{
              background: "linear-gradient(160deg, rgba(4,14,6,0.97) 0%, rgba(8,24,12,0.97) 100%)",
              border: "1px solid rgba(127,255,212,0.22)",
              boxShadow: "0 0 20px rgba(127,255,212,0.06), inset 0 1px 0 rgba(127,255,212,0.04)",
            }} data-testid="progress-bar-container">

              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-fantasy text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(127,255,212,0.55)" }}>
                  ✦ Contribution Rewards
                </span>
                {monthLabel && (
                  <span className="font-fantasy text-[9px]" style={{ color: "rgba(127,255,212,0.28)" }}>
                    Resets {monthLabel}
                  </span>
                )}
              </div>

              {/* Points */}
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-fantasy text-base tracking-wider" data-testid="text-progress-points" style={{ color: "#7fffd4", textShadow: "0 0 10px rgba(127,255,212,0.4)" }}>
                  {pts.toLocaleString()}
                </span>
                <span className="font-fantasy text-[10px]" style={{ color: "rgba(127,255,212,0.4)" }}>pts this month</span>
              </div>

              {/* ── Continuous bar with milestone ticks ── */}
              <div style={{ position: "relative" }}>
                {/* Track */}
                <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.07)", overflow: "hidden", position: "relative" }}>
                  {/* Fill */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${fillPct}%`,
                    background: "linear-gradient(90deg, #cd7f32 0%, #cd7f32 5%, #c8c8c8 5%, #c8c8c8 25%, #f6dc8a 25%, #f6dc8a 50%, #d946ef 50%)",
                    backgroundSize: "100% 100%",
                    boxShadow: fillPct > 0 ? "0 0 10px rgba(127,255,212,0.3)" : "none",
                    transition: "width 0.8s ease",
                  }} />
                  {/* Tick marks at each milestone */}
                  {MILESTONES.map((m, i) => (
                    <div key={m.end} style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: `${m.pct}%`,
                      width: i === MILESTONES.length - 1 ? 0 : 2,
                      marginLeft: -1,
                      background: "rgba(0,0,0,0.45)",
                      zIndex: 2,
                    }} />
                  ))}
                </div>

                {/* Milestone icons + labels + admin buttons */}
                <div style={{ position: "relative", height: currentUser.isAdmin ? 78 : 56, marginTop: 6 }}>
                  {MILESTONES.map((m, i) => {
                    const isDone = claimed.includes(m.end);
                    const rewardCfg = rewards.find((r: any) => Number(r.milestone_points) === m.end);
                    const isFirst = i === 0;
                    const isLast = i === MILESTONES.length - 1;
                    const leftStyle = isLast ? undefined : `${m.pct}%`;
                    const rightStyle = isLast ? "0" : undefined;
                    const tx = isFirst ? "-5%" : isLast ? "0%" : "-50%";
                    const isEditing = adminEditMs === m.end;

                    return (
                      <div key={m.end} style={{
                        position: "absolute",
                        left: leftStyle,
                        right: rightStyle,
                        top: 0,
                        transform: `translateX(${tx})`,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        minWidth: 40,
                      }}>
                        <span style={{
                          fontSize: 17, lineHeight: 1,
                          filter: isDone ? `drop-shadow(0 0 6px ${m.glow})` : "grayscale(0.7) opacity(0.45)",
                        }}>
                          {isDone ? "✅" : m.icon}
                        </span>
                        <span className="font-fantasy text-center" style={{
                          fontSize: 8, lineHeight: 1.2,
                          color: isDone ? m.color : "rgba(255,255,255,0.22)",
                          maxWidth: 48,
                        }}>
                          {rewardCfg?.reward_label || m.label}
                        </span>
                        {/* Admin + button */}
                        {currentUser.isAdmin && !isEditing && (
                          <button
                            data-testid={`button-admin-edit-milestone-${m.end}`}
                            onClick={() => { setAdminEditMs(m.end); setAdminEditLabel(rewardCfg?.reward_label ?? ""); }}
                            style={{
                              width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(251,146,60,0.5)",
                              background: "rgba(251,146,60,0.12)", color: "#fb923c",
                              fontSize: 13, lineHeight: 1, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 700,
                            }}
                          >+</button>
                        )}
                        {/* Inline edit form */}
                        {currentUser.isAdmin && isEditing && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", minWidth: 64 }}>
                            <input
                              autoFocus
                              value={adminEditLabel}
                              onChange={e => setAdminEditLabel(e.target.value)}
                              placeholder="Label…"
                              style={{
                                width: 64, padding: "2px 5px", borderRadius: 4, fontSize: 9,
                                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(251,146,60,0.5)",
                                color: "#fff", outline: "none",
                              }}
                              data-testid={`input-milestone-label-inline-${m.end}`}
                            />
                            <div style={{ display: "flex", gap: 3 }}>
                              <button
                                onClick={() => saveMilestoneMutation.mutate({ ms: m.end, label: adminEditLabel })}
                                disabled={saveMilestoneMutation.isPending}
                                style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, cursor: "pointer", fontWeight: 700, background: "rgba(251,146,60,0.25)", border: "1px solid rgba(251,146,60,0.55)", color: "#fb923c" }}
                              >✓</button>
                              <button
                                onClick={() => setAdminEditMs(null)}
                                style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
                              >✕</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-1">
                <span className="font-fantasy text-[9px]" style={{ color: "rgba(127,255,212,0.38)" }}>
                  {ptsUntilNext > 0 ? `${ptsUntilNext.toLocaleString()} pts to ${nextMs?.label}` : "🎉 All milestones reached!"}
                </span>
                <span className="font-fantasy text-[9px]" data-testid="text-daily-limit" style={{ color: "rgba(127,255,212,0.28)" }}>
                  Daily: ${packsData?.dailySpent || 0}/${packsData?.dailyLimit || 500}
                </span>
              </div>
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
                  className="relative rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                  style={{
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
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0,
                      borderRadius: "10px 10px 0 0",
                      background: "linear-gradient(90deg, rgba(180,60,220,0.9) 0%, rgba(120,40,200,0.95) 50%, rgba(180,60,220,0.9) 100%)",
                      padding: "3px 6px",
                      textAlign: "center",
                    }}>
                      <span className="font-fantasy text-[9px] tracking-[0.2em]" style={{ color: "#f0d0ff", textShadow: "0 0 6px rgba(220,100,255,0.8)" }}>
                        ✦ LIMITED OFFER
                      </span>
                    </div>
                  )}

                  {packImage && (
                    <img
                      src={packImage}
                      alt={pack.label}
                      className="object-contain relative"
                      style={{
                        width: bonus ? 64 : 80,
                        height: bonus ? 64 : 80,
                        marginTop: bonus ? 14 : 0,
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

                  {bonus && (
                    <div className="flex items-center gap-1.5 w-full justify-center rounded-md px-2 py-1" style={{
                      background: "rgba(160,40,200,0.18)",
                      border: "1px solid rgba(180,60,220,0.4)",
                    }}>
                      <img
                        src={bonus.eggUrl}
                        alt={bonus.name}
                        className="w-6 h-6 object-contain"
                        style={{ filter: "drop-shadow(0 0 4px rgba(200,100,255,0.7))" }}
                      />
                      <span className="font-fantasy text-[9px] tracking-wide" style={{ color: "#d9a0ff", textShadow: "0 0 6px rgba(200,100,255,0.5)" }}>
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
          <p className="font-fantasy text-[9px] tracking-wider text-center leading-relaxed" style={{ color: "rgba(127,255,212,0.35)" }}>
            $1 = 100 Coins &bull; Max $100 per purchase &bull; $500 daily limit
          </p>
          <p className="font-fantasy text-[8px] tracking-wider text-center mt-1" style={{ color: "rgba(127,255,212,0.2)" }}>
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
