import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";

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

const PACK_ICONS: Record<string, string> = {
  pack_100: "🪙",
  pack_500: "💰",
  pack_1000: "👛",
  pack_2500: "🏦",
  pack_5000: "💎",
  pack_10000: "👑",
};

const PACK_GLOW: Record<string, string> = {
  pack_100: "rgba(205,175,100,0.3)",
  pack_500: "rgba(120,200,150,0.3)",
  pack_1000: "rgba(100,180,220,0.3)",
  pack_2500: "rgba(180,130,220,0.3)",
  pack_5000: "rgba(220,100,150,0.3)",
  pack_10000: "rgba(255,200,50,0.4)",
};

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
    <div className="min-h-screen flex flex-col relative" style={{ maxWidth: "768px", margin: "0 auto", background: "linear-gradient(180deg, #0a0a1a 0%, #1a1025 30%, #0d1520 60%, #0a0a1a 100%)" }}>
      <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

      <div className="flex-1 overflow-y-auto pb-6">
        <div className="px-4 pt-4 pb-2 text-center">
          <h1 className="font-fantasy text-[#f0c040] text-xl tracking-widest" data-testid="text-coin-shop-title">
            Coin Treasury
          </h1>
          <p className="font-fantasy text-[#8a7a60] text-[10px] tracking-wider mt-1">
            Acquire coins to power your adventure
          </p>
        </div>

        <div className="mx-4 mb-4 rounded-lg p-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, rgba(30,20,10,0.9) 0%, rgba(50,35,15,0.9) 100%)", border: "1px solid rgba(212,160,23,0.3)" }}>
          <div className="flex items-center gap-2">
            <img src={coinIconImg} alt="" className="w-6 h-6" />
            <span className="font-fantasy text-[#f0c040] text-sm tracking-wider" data-testid="text-current-coins">
              {currentUser.coins.toLocaleString()} Coins
            </span>
          </div>
          <div className="text-right">
            <span className="font-fantasy text-[#6a5840] text-[9px] tracking-wider block" data-testid="text-daily-limit">
              Daily: ${packsData?.dailySpent || 0}/${packsData?.dailyLimit || 500}
            </span>
          </div>
        </div>

        {verifying && (
          <div className="mx-4 mb-4 rounded-lg p-4 text-center" style={{ background: "rgba(30,60,30,0.5)", border: "1px solid rgba(127,255,212,0.3)" }}>
            <div className="font-fantasy text-[#7fffd4] text-sm tracking-wider animate-pulse">
              Verifying purchase...
            </div>
          </div>
        )}

        {successCoins !== null && (
          <div className="mx-4 mb-4 rounded-lg p-4 text-center animate-slide-up" style={{ background: "linear-gradient(135deg, rgba(20,50,20,0.9) 0%, rgba(40,80,30,0.9) 100%)", border: "1px solid rgba(127,255,212,0.5)", boxShadow: "0 4px 20px rgba(127,255,212,0.2)" }}>
            <div className="text-3xl mb-2">✨</div>
            <div className="font-fantasy text-[#7fffd4] text-lg tracking-wider" data-testid="text-success-message">
              +{successCoins.toLocaleString()} Coins!
            </div>
            <p className="font-fantasy text-[#5a9a7a] text-[10px] tracking-wider mt-1">
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
            <p className="font-fantasy text-[#8a7a60] text-sm animate-pulse">Loading treasury...</p>
          </div>
        ) : (
          <div className="px-4 grid grid-cols-2 gap-3">
            {packsData?.packs.map((pack) => {
              const isDisabled = pack.priceUsd > dailyRemaining;
              const isBuying = buyingPackId === pack.id && checkoutMutation.isPending;

              return (
                <button
                  key={pack.id}
                  data-testid={`button-buy-pack-${pack.id}`}
                  onClick={() => !isDisabled && !isBuying && handleBuy(pack.id)}
                  disabled={isDisabled || isBuying}
                  className="relative rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                  style={{
                    background: `linear-gradient(135deg, rgba(25,15,5,0.95) 0%, rgba(45,30,10,0.95) 100%)`,
                    border: `1px solid ${isDisabled ? 'rgba(100,80,50,0.2)' : 'rgba(212,160,23,0.4)'}`,
                    boxShadow: isDisabled ? 'none' : `0 4px 20px ${PACK_GLOW[pack.id] || 'rgba(212,160,23,0.2)'}`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div className="text-3xl">{PACK_ICONS[pack.id] || "🪙"}</div>
                  <div className="flex items-center gap-1">
                    <img src={coinIconImg} alt="" className="w-4 h-4" />
                    <span className="font-fantasy text-[#f0c040] text-sm tracking-wider">
                      {pack.coins.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="w-full py-1.5 rounded-md font-fantasy text-[11px] tracking-wider text-center"
                    style={{
                      background: isBuying ? "rgba(212,160,23,0.2)" : "linear-gradient(135deg, rgba(212,160,23,0.25) 0%, rgba(180,120,10,0.25) 100%)",
                      border: "1px solid rgba(212,160,23,0.3)",
                      color: "#f0c040",
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

        <div className="mx-4 mt-5 rounded-lg p-3" style={{ background: "rgba(20,15,10,0.6)", border: "1px solid rgba(100,80,50,0.2)" }}>
          <p className="font-fantasy text-[#6a5840] text-[9px] tracking-wider text-center leading-relaxed">
            $1 = 100 Coins • Max $100 per purchase • $500 daily limit
          </p>
          <p className="font-fantasy text-[#4a3a20] text-[8px] tracking-wider text-center mt-1">
            All purchases are processed securely via Stripe
          </p>
        </div>

        <div className="flex justify-center mt-5">
          <button
            data-testid="button-back-home"
            onClick={() => navigate("/")}
            className="px-8 py-2 rounded-md font-fantasy text-xs tracking-wider"
            style={{ background: "rgba(30,20,10,0.8)", border: "1px solid rgba(212,160,23,0.3)", color: "#a89878", cursor: "pointer" }}
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
