import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { playShopBell } from "@/lib/sounds";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import coinPack100 from "@assets/Photoroom_20260629_101811_PM_1782789946363.png";
import coinPack500 from "@assets/Photoroom_20260629_102009_PM_1782789946363.png";
import coinPack1000 from "@assets/Photoroom_20260629_102249_PM_1782789946363.png";
import coinPack2500 from "@assets/Photoroom_20260629_101901_PM_1782789946363.png";
import coinPack5000 from "@assets/Photoroom_20260629_102055_PM_1782789968022.png";
import coinPack10000 from "@assets/Photoroom_20260629_102138_PM_1782789980383.png";
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

// Packs: 100, 1000, 2500, 7500, 20000, 50000 — one unique artwork each in order.
function imageForCoins(coins: number): string {
  if (coins <= 100)    return coinPack100;    // pack 1
  if (coins <= 1000)   return coinPack500;    // pack 2
  if (coins <= 2500)   return coinPack1000;   // pack 3
  if (coins <= 7500)   return coinPack2500;   // pack 4
  if (coins <= 20000)  return coinPack5000;   // pack 5
  return coinPack10000;                       // pack 6 (50000)
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const orbTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showSupport, setShowSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [milestonePopup, setMilestonePopup] = useState<number | null>(null);
  const [milestoneClaimSuccess, setMilestoneClaimSuccess] = useState(false);

  const supportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support-message", {
        username: user.username,
        email: user.email,
        subject: "Coin Shop Support",
        message: supportMessage.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setSupportSent(true);
      setSupportMessage("");
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    },
  });

  // Read Stripe return params ONCE from the real URL — before wouter or replaceState
  // can mutate location. Never use useSearch() here: wouter patches replaceState and
  // would re-trigger a reactive effect every time we clean the URL.
  const [stripeSessionId] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("success") === "true" ? p.get("session_id") : null;
  });
  const [stripeWasCanceled] = useState(() => {
    return new URLSearchParams(window.location.search).get("canceled") === "true";
  });

  // Show the blocking overlay immediately if we're returning from a paid Stripe session.
  const [verifying, setVerifying] = useState(() => !!stripeSessionId);
  const [successCoins, setSuccessCoins] = useState<number | null>(null);
  const [successBaseCoins, setSuccessBaseCoins] = useState<number | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);

  // Guard: runs once even in React StrictMode (double-invoke)
  const verifiedRef = useRef(false);

  // Keep local coin display in sync when parent re-fetches updated user data
  useEffect(() => { setCurrentUser(user); }, [user]);

  // Cancel orb timers on unmount
  useEffect(() => {
    return () => { orbTimersRef.current.forEach(clearTimeout); };
  }, []);

  // Handle Stripe cancel — show a brief toast, clean URL
  useEffect(() => {
    if (!stripeWasCanceled) return;
    window.history.replaceState({}, "", "/coins");
    setShowCanceled(true);
    const t = setTimeout(() => setShowCanceled(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Verify payment — runs exactly once on mount.
  // A 12-second timeout unblocks the UI in case of a slow or dropped connection.
  useEffect(() => {
    if (!stripeSessionId) return;
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    // Clean URL before any async work so re-renders never re-parse it
    window.history.replaceState({}, "", "/coins");

    const timeoutId = setTimeout(() => {
      setVerifying(false);
      toast({
        title: "Taking longer than expected",
        description: "Your coins should appear shortly. Refresh if they don't show up.",
        variant: "destructive",
      });
    }, 12_000);

    apiRequest("POST", "/api/coins/verify", { sessionId: stripeSessionId })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
        if (data.user) {
          setCurrentUser(data.user);
          queryClient.setQueryData(["/api/auth/me"], data.user);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/coins/packs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/coins/progress"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/gifts/pending"] });
        // Refetch the authoritative balance: when the webhook wins the dedup
        // race, this verify response can carry a momentarily stale coin total,
        // so refetch instead of trusting only the optimistic setQueryData above.
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        if (data.credited || data.alreadyCredited) {
          const coins = typeof data.coins === "number"
            ? data.coins
            : parseInt(String(data.coins ?? "0"), 10);
          setSuccessCoins(isFinite(coins) ? coins : 0);
          if (data.baseCoins && data.baseCoins > 0 && data.baseCoins < coins) {
            setSuccessBaseCoins(typeof data.baseCoins === "number" ? data.baseCoins : parseInt(String(data.baseCoins), 10));
          }
          if (data.eggBonus?.name) {
            setTimeout(() => {
              toast({ title: `🥚 Bonus egg added!`, description: `${data.eggBonus.name} has been added to your pet inventory!` });
            }, 1800);
          }
          try { playShopBell(); } catch {}
          try { burstGoldenOrbs(window.innerWidth / 2, window.innerHeight / 2); } catch {}
          const t1 = setTimeout(() => { try { burstGoldenOrbs(window.innerWidth / 3, window.innerHeight / 3); } catch {} }, 300);
          const t2 = setTimeout(() => { try { burstGoldenOrbs((window.innerWidth * 2) / 3, window.innerHeight / 3); } catch {} }, 500);
          orbTimersRef.current = [t1, t2];
        }
        setVerifying(false);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setVerifying(false);
        toast({
          title: "Hmm, something went wrong",
          description: "Your coins should arrive shortly. Contact support if they don't appear.",
          variant: "destructive",
        });
      });
  }, []);

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
    mutationFn: async ({ ms, itemId, itemName, itemImageUrl, starRarity }: { ms: number; itemId: string | null; itemName: string | null; itemImageUrl: string | null; starRarity?: number | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/milestone-rewards/${ms}`, {
        rewardItemId: itemId,
        rewardItemName: itemName,
        rewardItemImageUrl: itemImageUrl,
        rewardLabel: itemName,
        starRarity: starRarity ?? null,
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

  const claimMilestoneMutation = useMutation({
    mutationFn: async (milestone: number) => {
      const res = await apiRequest("POST", "/api/coins/claim-milestone", { milestone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins/progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setMilestoneClaimSuccess(true);
      setTimeout(() => {
        setMilestonePopup(null);
        setMilestoneClaimSuccess(false);
      }, 2400);
    },
    onError: (err: any) => {
      const raw = err?.message ?? "";
      let msg = raw;
      try {
        const jsonPart = raw.includes(": ") ? raw.slice(raw.indexOf(": ") + 2) : raw;
        msg = JSON.parse(jsonPart)?.message ?? raw;
      } catch {}
      if (msg === "Already claimed") {
        toast({ title: "Already claimed", description: "This milestone reward was already delivered.", variant: "destructive" });
      } else {
        toast({ title: "Claim failed", description: msg || "Please try again.", variant: "destructive" });
      }
    },
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


  const handleBuy = (packId: string) => {
    setBuyingPackId(packId);
    checkoutMutation.mutate(packId);
  };

  const dailyRemaining = packsData ? packsData.dailyLimit - packsData.dailySpent : 500;

  return (
    <div className="h-screen-frame flex flex-col relative overflow-hidden" style={{ background: "linear-gradient(180deg, #040d04 0%, #071a0a 15%, #0d2510 40%, #081a0d 65%, #051208 85%, #040d04 100%)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
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

      <div className="flex-1 overflow-y-auto pb-6" style={{ position: "relative", zIndex: 3, overflowX: "hidden" }}>
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
          const ITEM_TYPES = ["all", "pet", "potion", "edibles", "gift", "power_up", "special", "accessory", "other"] as const;
          const KNOWN_TYPES = ["pet","edibles","gift","potion","power_up","special","accessory"];
          const filteredItems = allShopItems.filter((it: any) => {
            const matchesTab = pickerTab === "all"
              || (pickerTab === "other" ? !KNOWN_TYPES.includes(it.type) : it.type === pickerTab);
            const matchesSearch = !pickerSearch || it.name?.toLowerCase().includes(pickerSearch.toLowerCase());
            return matchesTab && matchesSearch;
          });
          const isPetType = (t: string | null | undefined) => t === "pet" || t === "pet_egg";
          const getStatLine = (cfg: any): string => {
            if (!cfg?.reward_item_id) return "";
            if (isPetType(cfg.item_type)) return cfg.star_rarity ? "⭐".repeat(cfg.star_rarity) : "";
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
              </div>

              {/* Points */}
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-fantasy text-base tracking-wider" data-testid="text-progress-points" style={{ color: "#f6dc8a", textShadow: "0 0 10px rgba(212,160,23,0.5)" }}>
                  {pts.toLocaleString()}
                </span>
                <span className="font-fantasy text-[10px]" style={{ color: "rgba(212,160,23,0.5)" }}>pts</span>
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
                      {/* Item image or empty slot — admin: always opens picker; player: opens popup if item exists */}
                      <div
                        style={{ position: "relative", flexShrink: 0, cursor: (currentUser.isAdmin || hasItem) ? "pointer" : "default" }}
                        onClick={() => {
                          if (currentUser.isAdmin) {
                            setAdminPickerMs(m.end);
                            setPickerSearch("");
                            setPickerTab("all");
                          } else if (hasItem) {
                            setMilestonePopup(m.end);
                          }
                        }}
                        data-testid={`button-milestone-reward-${m.end}`}
                      >
                        {hasItem ? (
                          <img
                            src={rewardCfg.reward_item_image_url ?? undefined}
                            alt={rewardCfg.reward_item_name ?? ""}
                            style={{
                              width: 40, height: 40, objectFit: "contain",
                              display: "block",
                              filter: isDone
                                ? "brightness(0.4) grayscale(0.7)"
                                : isReachable
                                ? "drop-shadow(0 0 10px rgba(246,220,138,0.9)) drop-shadow(0 0 4px rgba(212,160,23,0.7))"
                                : "drop-shadow(0 0 4px rgba(212,160,23,0.25))",
                              border: isDone
                                ? "1.5px solid rgba(246,220,138,0.15)"
                                : isReachable
                                ? "1.5px solid rgba(246,220,138,0.9)"
                                : "1.5px solid rgba(212,160,23,0.4)",
                              borderRadius: 7,
                              boxShadow: isReachable
                                ? "0 0 10px rgba(212,160,23,0.5), inset 0 0 4px rgba(246,220,138,0.1)"
                                : isDone ? "none" : "0 0 4px rgba(212,160,23,0.15)",
                              animation: isReachable ? "coinGlowPulse 2s ease-in-out infinite" : "none",
                            }}
                          />
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: 7,
                            border: "1.5px dashed rgba(212,160,23,0.3)",
                            background: "rgba(212,160,23,0.03)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }} />
                        )}
                      </div>
                      {/* Pet / pet egg star rarity only */}
                      {hasItem && isPetType(rewardCfg.item_type) && rewardCfg.star_rarity ? (
                        <span style={{
                          fontSize: 8, lineHeight: 1, whiteSpace: "nowrap",
                          color: isDone ? "rgba(255,215,0,0.3)" : "rgba(255,215,0,0.85)",
                        }}>{"⭐".repeat(rewardCfg.star_rarity)}</span>
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

              {/* ── Admin item picker — rendered as fixed overlay so it works on any slot ── */}

              {/* ── Milestone reward popup ── */}
              {milestonePopup !== null && (() => {
                const popupMs = MILESTONES.find(ms => ms.end === milestonePopup);
                const popupCfg = rewards.find((r: any) => Number(r.milestone_points) === milestonePopup);
                const popupIsDone = claimed.includes(milestonePopup);
                const popupIsReachable = pts >= milestonePopup && !popupIsDone;
                return (
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 9980, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={() => { if (!claimMilestoneMutation.isPending) { setMilestonePopup(null); setMilestoneClaimSuccess(false); } }}
                  >
                    <div
                      style={{
                        width: "82%", maxWidth: 300,
                        background: "linear-gradient(160deg, #1c1100 0%, #0e0900 100%)",
                        border: `1.5px solid ${popupIsReachable ? "rgba(246,220,138,0.6)" : "rgba(212,160,23,0.28)"}`,
                        borderRadius: 16, padding: "28px 22px 22px",
                        textAlign: "center",
                        boxShadow: popupIsReachable ? "0 0 40px rgba(212,160,23,0.18)" : "none",
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {milestoneClaimSuccess ? (
                        <>
                          <div style={{ fontSize: 64, marginBottom: 8, lineHeight: 1 }}>🎁</div>
                          <p style={{ color: "#f6dc8a", fontFamily: "Lora, serif", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                            Reward Claimed!
                          </p>
                          <p style={{ color: "rgba(212,160,23,0.6)", fontFamily: "Lora, serif", fontSize: 11 }}>
                            Added to your inventory
                          </p>
                        </>
                      ) : (
                        <>
                          {/* Item image */}
                          {popupCfg?.reward_item_image_url ? (
                            <img
                              src={popupCfg.reward_item_image_url}
                              alt={popupCfg.reward_item_name ?? ""}
                              style={{
                                width: 88, height: 88, objectFit: "contain",
                                margin: "0 auto 14px", display: "block",
                                filter: popupIsReachable
                                  ? "drop-shadow(0 0 18px rgba(246,220,138,0.9))"
                                  : popupIsDone ? "brightness(0.45) grayscale(0.6)" : "none",
                                borderRadius: 10,
                              }}
                            />
                          ) : (
                            <div style={{ width: 88, height: 88, borderRadius: 12, background: "rgba(212,160,23,0.08)", border: "1.5px dashed rgba(212,160,23,0.3)", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎁</div>
                          )}

                          {/* Item name */}
                          <p style={{ color: "#f6dc8a", fontFamily: "Lora, serif", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                            {popupCfg?.reward_item_name ?? (popupMs?.label ? `${popupMs.label} Reward` : "Reward")}
                          </p>

                          {/* Stat line */}
                          {getStatLine(popupCfg) && (
                            <p style={{ color: "rgba(212,160,23,0.75)", fontFamily: "Lora, serif", fontSize: 11, marginBottom: 6 }}>
                              {getStatLine(popupCfg)}
                            </p>
                          )}

                          {/* Points / status */}
                          <p style={{ color: popupIsDone ? "rgba(74,222,128,0.5)" : "rgba(212,160,23,0.4)", fontFamily: "Lora, serif", fontSize: 10, marginBottom: 18 }}>
                            {popupIsDone ? "✓ Already claimed" : `Requires ${milestonePopup.toLocaleString()} pts`}
                          </p>

                          {/* Claim button */}
                          <button
                            data-testid={`button-claim-milestone-${milestonePopup}`}
                            disabled={!popupIsReachable || claimMilestoneMutation.isPending}
                            onClick={() => popupIsReachable && claimMilestoneMutation.mutate(milestonePopup)}
                            style={{
                              width: "100%", padding: "11px 0",
                              borderRadius: 9,
                              border: `1.5px solid ${popupIsReachable ? "rgba(74,222,128,0.7)" : "rgba(100,100,100,0.25)"}`,
                              background: popupIsReachable
                                ? "linear-gradient(135deg, #1d5e12 0%, #0f3309 100%)"
                                : "rgba(40,40,40,0.5)",
                              color: popupIsReachable ? "#4ade80" : "rgba(120,120,120,0.5)",
                              fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.12em",
                              cursor: popupIsReachable ? "pointer" : "not-allowed",
                              boxShadow: popupIsReachable ? "0 0 12px rgba(74,222,128,0.2)" : "none",
                              transition: "opacity 0.15s",
                            }}
                          >
                            {claimMilestoneMutation.isPending ? "Claiming…" : popupIsDone ? "Claimed" : "Claim Reward"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ── Admin milestone reward picker — fixed overlay modal ── */}
        {currentUser.isAdmin && adminPickerMs !== null && (() => {
          const msLabel = [
            { end: 2500, label: "Bronze" }, { end: 5000, label: "Silver" },
            { end: 7500, label: "Gold" }, { end: 10000, label: "Diamond" },
          ].find(m => m.end === adminPickerMs)?.label ?? adminPickerMs;
          const ITEM_TYPES_MODAL = ["all", "pet", "potion", "edibles", "gift", "power_up", "special", "accessory", "other"] as const;
          const KNOWN_TYPES_MODAL = ["pet","edibles","gift","potion","power_up","special","accessory"];
          const filtered = allShopItems.filter((it: any) => {
            const matchesTab = pickerTab === "all"
              || (pickerTab === "other" ? !KNOWN_TYPES_MODAL.includes(it.type) : it.type === pickerTab);
            const matchesSearch = !pickerSearch || it.name?.toLowerCase().includes(pickerSearch.toLowerCase());
            return matchesTab && matchesSearch;
          });
          return (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => { setAdminPickerMs(null); setPickerSearch(""); setPickerTab("all"); }}
            >
              <div
                style={{
                  width: "90%", maxWidth: 340,
                  background: "linear-gradient(160deg, #1c0a00 0%, #0e0400 100%)",
                  border: "1.5px solid rgba(251,146,60,0.55)",
                  borderRadius: 16, padding: "18px 16px 16px",
                  boxShadow: "0 0 40px rgba(251,146,60,0.15)",
                  display: "flex", flexDirection: "column", gap: 8,
                  maxHeight: "80vh",
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="font-fantasy text-[11px]" style={{ color: "#fb923c" }}>
                    Set reward — {msLabel} milestone
                  </span>
                  <button
                    onClick={() => { setAdminPickerMs(null); setPickerSearch(""); setPickerTab("all"); }}
                    style={{ background: "none", border: "none", color: "rgba(251,146,60,0.55)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
                  >✕</button>
                </div>

                {/* Type filter tabs */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                  {ITEM_TYPES_MODAL.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setPickerTab(tab)}
                      style={{
                        padding: "3px 8px", borderRadius: 5, fontSize: 9, cursor: "pointer",
                        fontFamily: "Lora, serif", textTransform: "capitalize" as const,
                        border: pickerTab === tab ? "1px solid rgba(251,146,60,0.9)" : "1px solid rgba(251,146,60,0.22)",
                        background: pickerTab === tab ? "rgba(251,146,60,0.22)" : "rgba(251,146,60,0.04)",
                        color: pickerTab === tab ? "#fb923c" : "rgba(255,255,255,0.45)",
                      }}
                    >{tab === "power_up" ? "power up" : tab === "pet" ? "🐾 pets" : tab}</button>
                  ))}
                </div>

                {/* Search */}
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search items or pets…"
                  style={{
                    width: "100%", padding: "6px 10px", borderRadius: 7, fontSize: 11,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(251,146,60,0.3)",
                    color: "#fff", outline: "none", boxSizing: "border-box" as const,
                  }}
                />

                {/* Clear button */}
                <button
                  onClick={() => saveMilestoneMutation.mutate({ ms: adminPickerMs, itemId: null, itemName: null, itemImageUrl: null })}
                  disabled={saveMilestoneMutation.isPending}
                  style={{
                    width: "100%", padding: "5px 0", borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.4)", fontSize: 10, cursor: "pointer", fontFamily: "Lora, serif",
                  }}
                >✕ Clear reward</button>

                {/* Item grid */}
                <div style={{ overflowY: "auto" as const, flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {filtered.length === 0 && (
                    <div style={{ gridColumn: "1/-1", color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center" as const, padding: 12 }}>
                      {allShopItems.length === 0 ? "Loading…" : "No items match"}
                    </div>
                  )}
                  {filtered.map((it: any) => (
                    <button
                      key={it.id}
                      onClick={() => saveMilestoneMutation.mutate({
                        ms: adminPickerMs,
                        itemId: it.id,
                        itemName: it.name,
                        itemImageUrl: it.imageUrl || null,
                        starRarity: it.starRarity ?? null,
                      })}
                      disabled={saveMilestoneMutation.isPending}
                      title={it.name}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                        padding: "6px 4px", borderRadius: 8, cursor: "pointer",
                        border: "1px solid rgba(251,146,60,0.22)",
                        background: "rgba(251,146,60,0.06)",
                        transition: "background 0.12s",
                      }}
                    >
                      {it.imageUrl ? (
                        <img src={it.imageUrl} alt={it.name} style={{ width: 40, height: 40, objectFit: "contain" as const }} />
                      ) : (
                        <div style={{ width: 40, height: 40, background: "rgba(255,255,255,0.05)", borderRadius: 6 }} />
                      )}
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", lineHeight: 1.2, textAlign: "center" as const, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{it.name}</span>
                    </button>
                  ))}
                </div>
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
          <div className="px-4 grid grid-cols-2 gap-3" style={{ overflowX: "hidden" }}>
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
                    padding: bonus ? "30px 16px 32px" : "16px",
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

                  {/* Egg pop-piece: floating outside the card at bottom-right */}
                  {bonus && (
                    <>
                      <img
                        src={bonus.eggUrl}
                        alt={bonus.name}
                        className="object-contain"
                        style={{
                          position: "absolute",
                          bottom: -18,
                          right: -14,
                          width: 72, height: 72,
                          transform: "rotate(14deg) scale(1.05)",
                          pointerEvents: "none",
                          zIndex: 4,
                          filter: "drop-shadow(0 0 12px rgba(200,80,255,1)) drop-shadow(0 0 28px rgba(160,40,220,0.85)) drop-shadow(0 2px 8px rgba(0,0,0,0.6))",
                        }}
                      />
                      <span
                        className="font-fantasy text-[8px] tracking-wide text-center w-full"
                        style={{
                          color: "#e8b8ff",
                          textShadow: "0 0 8px rgba(200,100,255,0.7)",
                          paddingBottom: 2,
                        }}
                      >
                        + {bonus.name}
                      </span>
                    </>
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

        <div className="flex justify-center gap-6 mt-4 pb-2">
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
          <button
            data-testid="button-open-support"
            onClick={() => { setShowSupport(true); setSupportSent(false); setSupportMessage(""); }}
            className="font-fantasy text-[10px] tracking-wider underline underline-offset-2"
            style={{
              background: "none",
              border: "none",
              color: "rgba(138,180,248,0.5)",
              cursor: "pointer",
            }}
          >
            Contact Support
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


      {/* Contact Support Modal */}
      {showSupport && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9990,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(2,8,3,0.88)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowSupport(false); setSupportSent(false); } }}
        >
          <div
            style={{
              width: "88%", maxWidth: 360,
              background: "linear-gradient(160deg, #0e1a2b 0%, #070f1a 100%)",
              border: "1px solid rgba(100,140,212,0.35)",
              borderRadius: 12,
              padding: "20px 18px",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-fantasy text-xs tracking-widest" style={{ color: "#8ab4f8" }}>
                CONTACT SUPPORT
              </span>
              <button
                onClick={() => { setShowSupport(false); setSupportSent(false); }}
                style={{ background: "none", border: "none", color: "rgba(138,180,248,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>

            {supportSent ? (
              <div className="text-center py-4 space-y-2">
                <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider">Message sent!</p>
                <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                  Our support team will review your message and get back to you.
                </p>
                <button
                  onClick={() => { setShowSupport(false); setSupportSent(false); }}
                  className="font-fantasy text-[#8ab4f8] text-xs tracking-wider hover:text-[#aaccff] transition-colors mt-2"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-fantasy text-[#8ab4f8] text-[10px] tracking-wider">
                  Describe your issue — missing coins, purchase problem, or anything else — and we'll look into it.
                </p>
                <textarea
                  data-testid="input-support-message"
                  value={supportMessage}
                  onChange={e => setSupportMessage(e.target.value)}
                  disabled={supportMutation.isPending}
                  placeholder="What can we help you with?"
                  rows={5}
                  maxLength={2000}
                  className="w-full px-3 py-2 rounded font-sans text-xs resize-none outline-none disabled:opacity-60"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(100,140,212,0.3)",
                    color: "#e8d8b0",
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-fantasy text-[#6a5840] text-[9px] tracking-wider">
                    {supportMessage.length}/2000
                  </span>
                  <button
                    data-testid="button-submit-support"
                    onClick={() => supportMutation.mutate()}
                    disabled={supportMutation.isPending || !supportMessage.trim()}
                    className="px-4 py-1.5 rounded font-fantasy text-xs tracking-wider transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #1a2d5a 0%, #0d1a3a 100%)",
                      border: "1px solid rgba(100,140,212,0.5)",
                      color: "#8ab4f8",
                      cursor: "pointer",
                    }}
                  >
                    {supportMutation.isPending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
          {/* Escape hatch — always tappable even if the API call hangs */}
          <button
            data-testid="button-skip-verify"
            onClick={() => setVerifying(false)}
            style={{
              position: "absolute", top: 20, right: 20,
              width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "50%",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Close"
          >
            <X size={14} />
          </button>

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
            width: "min(340px, calc(90*var(--vw)))",
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

            {successBaseCoins !== null && successCoins !== null && successCoins > successBaseCoins && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "rgba(74,222,128,0.1)",
                  border: "1px solid rgba(74,222,128,0.3)",
                  borderRadius: 6,
                  padding: "3px 9px",
                  marginBottom: "8px",
                }}
              >
                <span className="font-fantasy" style={{ fontSize: "9px", color: "#4ade80" }}>
                  ✦ Includes +{(successCoins - successBaseCoins).toLocaleString()} bonus coins (33% bonus)
                </span>
              </div>
            )}

            <p
              className="font-fantasy tracking-wider"
              style={{ fontSize: "11px", color: "rgba(127,255,212,0.45)", marginBottom: "28px" }}
            >
              Added to your treasury
            </p>

            <button
              data-testid="button-dismiss-success"
              onClick={() => { setSuccessCoins(null); setSuccessBaseCoins(null); navigate("/"); }}
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
