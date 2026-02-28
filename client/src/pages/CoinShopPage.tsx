import { useState, useEffect } from "react";
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

const PACK_IMAGES: Record<string, string> = {
  pack_100: coinPack100,
  pack_500: coinPack500,
  pack_1000: coinPack1000,
  pack_2500: coinPack2500,
  pack_5000: coinPack5000,
  pack_10000: coinPack10000,
};

const PACK_GLOW: Record<string, string> = {
  pack_100: "rgba(205,127,50,0.5)",
  pack_500: "rgba(192,192,192,0.5)",
  pack_1000: "rgba(74,222,128,0.55)",
  pack_2500: "rgba(96,165,250,0.55)",
  pack_5000: "rgba(192,132,252,0.6)",
  pack_10000: "rgba(240,192,64,0.7)",
};

const PACK_BORDER: Record<string, string> = {
  pack_100: "rgba(205,127,50,0.6)",
  pack_500: "rgba(192,192,192,0.6)",
  pack_1000: "rgba(74,222,128,0.6)",
  pack_2500: "rgba(96,165,250,0.6)",
  pack_5000: "rgba(192,132,252,0.7)",
  pack_10000: "rgba(240,192,64,0.8)",
};

const PACK_OUTER_GLOW: Record<string, string> = {
  pack_100: "0 0 20px rgba(205,127,50,0.3), 0 4px 30px rgba(205,127,50,0.2)",
  pack_500: "0 0 20px rgba(192,192,192,0.3), 0 4px 30px rgba(192,192,192,0.2)",
  pack_1000: "0 0 25px rgba(74,222,128,0.35), 0 4px 35px rgba(74,222,128,0.25)",
  pack_2500: "0 0 30px rgba(96,165,250,0.4), 0 4px 40px rgba(96,165,250,0.3)",
  pack_5000: "0 0 35px rgba(192,132,252,0.45), 0 4px 45px rgba(192,132,252,0.35)",
  pack_10000: "0 0 45px rgba(240,192,64,0.5), 0 4px 50px rgba(240,192,64,0.4), 0 0 80px rgba(240,192,64,0.2)",
};

const fireflyKeyframes = `
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
  const [verifying, setVerifying] = useState(false);
  const [successCoins, setSuccessCoins] = useState<number | null>(null);

  const { data: packsData, isLoading } = useQuery<PacksResponse>({
    queryKey: ["/api/coins/packs"],
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
      toast({ title: "Canceled", description: "Purchase was canceled" });
      window.history.replaceState({}, "", "/coins");
      return;
    }

    if (success && sessionId && !verifying) {
      setVerifying(true);
      apiRequest("POST", "/api/coins/verify", { sessionId })
        .then(res => res.json())
        .then(data => {
          if (data.user) {
            setCurrentUser(data.user);
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({ queryKey: ["/api/coins/packs"] });
          }
          if (data.credited) {
            setSuccessCoins(data.coins);
          } else if (data.alreadyCredited) {
            toast({ title: "Already Credited", description: "These coins were already added to your account" });
          }
          window.history.replaceState({}, "", "/coins");
        })
        .catch(() => {
          toast({ title: "Error", description: "Failed to verify purchase. Your coins will be credited shortly.", variant: "destructive" });
          window.history.replaceState({}, "", "/coins");
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
    <div className="h-[100dvh] flex flex-col relative overflow-hidden" style={{ maxWidth: "768px", margin: "0 auto", background: "linear-gradient(180deg, #040d04 0%, #071a0a 15%, #0d2510 40%, #081a0d 65%, #051208 85%, #040d04 100%)" }}>
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

      <div style={{ position: "relative", zIndex: 3 }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />
      </div>

      <div className="flex-1 overflow-y-auto pb-6" style={{ position: "relative", zIndex: 3 }}>
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

        <div className="mx-4 mb-4 rounded-lg p-3 flex items-center justify-between gap-2" style={{
          background: "linear-gradient(135deg, rgba(5,20,8,0.95) 0%, rgba(12,35,18,0.95) 100%)",
          border: "1px solid rgba(127,255,212,0.3)",
          boxShadow: "0 0 20px rgba(127,255,212,0.08), inset 0 1px 0 rgba(127,255,212,0.05)"
        }}>
          <div className="flex items-center gap-2">
            <img src={coinIconImg} alt="" className="w-6 h-6" style={{ filter: "drop-shadow(0 0 6px rgba(240,192,64,0.5))" }} />
            <span className="font-fantasy text-[#7fffd4] text-sm tracking-wider" data-testid="text-current-coins">
              {currentUser.coins.toLocaleString()} Coins
            </span>
          </div>
          <div className="text-right">
            <span className="font-fantasy text-[9px] tracking-wider block" data-testid="text-daily-limit" style={{ color: "rgba(127,255,212,0.35)" }}>
              Daily: ${packsData?.dailySpent || 0}/${packsData?.dailyLimit || 500}
            </span>
          </div>
        </div>

        {verifying && (
          <div className="mx-4 mb-4 rounded-lg p-4 text-center" style={{ background: "rgba(10,40,20,0.6)", border: "1px solid rgba(127,255,212,0.3)" }}>
            <div className="font-fantasy text-[#7fffd4] text-sm tracking-wider animate-pulse">
              Verifying purchase...
            </div>
          </div>
        )}

        {successCoins !== null && (
          <div className="mx-4 mb-4 rounded-lg p-4 text-center animate-slide-up" style={{ background: "linear-gradient(135deg, rgba(10,40,15,0.9) 0%, rgba(20,60,25,0.9) 100%)", border: "1px solid rgba(127,255,212,0.5)", boxShadow: "0 4px 30px rgba(127,255,212,0.25), 0 0 60px rgba(74,222,128,0.15)" }}>
            <img src={coinIconImg} alt="" className="w-10 h-10 mx-auto mb-2" style={{ filter: "drop-shadow(0 0 15px rgba(240,192,64,0.7))" }} />
            <div className="font-fantasy text-[#7fffd4] text-lg tracking-wider" data-testid="text-success-message">
              +{successCoins.toLocaleString()} Coins!
            </div>
            <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: "rgba(127,255,212,0.5)" }}>
              Successfully added to your account
            </p>
            <button
              data-testid="button-dismiss-success"
              onClick={() => setSuccessCoins(null)}
              className="mt-3 px-6 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
              style={{ background: "rgba(127,255,212,0.15)", border: "1px solid rgba(127,255,212,0.3)", color: "#7fffd4", cursor: "pointer" }}
            >
              Continue
            </button>
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
              const packImage = PACK_IMAGES[pack.id];
              const glowColor = PACK_GLOW[pack.id] || "rgba(127,255,212,0.2)";
              const borderColor = PACK_BORDER[pack.id] || "rgba(127,255,212,0.3)";
              const outerGlow = PACK_OUTER_GLOW[pack.id] || "0 0 20px rgba(127,255,212,0.2)";

              return (
                <button
                  key={pack.id}
                  data-testid={`button-buy-pack-${pack.id}`}
                  onClick={() => !isDisabled && !isBuying && handleBuy(pack.id)}
                  disabled={isDisabled || isBuying}
                  className="relative rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                  style={{
                    background: `linear-gradient(145deg, rgba(5,15,8,0.98) 0%, rgba(10,28,14,0.98) 50%, rgba(5,18,10,0.98) 100%)`,
                    border: `1.5px solid ${isDisabled ? 'rgba(50,80,55,0.2)' : borderColor}`,
                    boxShadow: isDisabled ? 'none' : `${outerGlow}, inset 0 1px 0 rgba(127,255,212,0.08)`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
                    background: `radial-gradient(ellipse at center 30%, ${glowColor.replace(/[\d.]+\)$/, '0.08)')} 0%, transparent 70%)`,
                  }} />
                  {packImage && (
                    <img
                      src={packImage}
                      alt={pack.label}
                      className="w-20 h-20 object-contain relative"
                      style={{
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
    </div>
  );
}
