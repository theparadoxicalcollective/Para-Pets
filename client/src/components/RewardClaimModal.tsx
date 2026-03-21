import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import giftIconImg from "@assets/generated_images/gift_icon_forest.png";

interface RewardItem {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  eggImageUrl: string | null;
}

interface PendingReward {
  rewardId: string;
  bundleName: string;
  bundleMessage: string | null;
  coinAmount: number;
  items: RewardItem[];
  createdAt: string;
}

interface DuplicateNotice {
  petName: string;
  coinsAwarded: number;
}

interface RewardClaimModalProps {
  onClose: () => void;
  onUserUpdate: (user: any) => void;
}

interface StackedReward {
  bundleId: string;
  bundleName: string;
  bundleMessage: string | null;
  coinAmount: number;
  items: RewardItem[];
  rewardIds: string[];
}

export default function RewardClaimModal({ onClose, onUserUpdate }: RewardClaimModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimingBundleId, setClaimingBundleId] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState<string | null>(null);
  const [duplicateNotices, setDuplicateNotices] = useState<DuplicateNotice[]>([]);

  const { data: rewards = [], isLoading } = useQuery<PendingReward[]>({
    queryKey: ["/api/rewards/pending"],
  });

  const stackedRewards: StackedReward[] = rewards.reduce<StackedReward[]>((acc, reward) => {
    const bundleKey = reward.bundleName + (reward.bundleMessage ?? "");
    const existing = acc.find(s => s.bundleName === reward.bundleName && s.bundleMessage === reward.bundleMessage);
    if (existing) {
      existing.rewardIds.push(reward.rewardId);
    } else {
      acc.push({
        bundleId: bundleKey,
        bundleName: reward.bundleName,
        bundleMessage: reward.bundleMessage,
        coinAmount: reward.coinAmount,
        items: reward.items,
        rewardIds: [reward.rewardId],
      });
    }
    return acc;
  }, []);

  const claimMutation = useMutation({
    mutationFn: async (rewardIds: string[]) => {
      let lastUser = null;
      const allDups: { name: string; coinsAwarded: number }[] = [];
      for (const rewardId of rewardIds) {
        const res = await apiRequest("POST", `/api/rewards/${rewardId}/claim`);
        const data = await res.json();
        lastUser = data.user;
        if (data.duplicatePets) allDups.push(...data.duplicatePets);
      }
      return { user: lastUser, duplicatePets: allDups };
    },
    onSuccess: (data: any, rewardIds: string[]) => {
      setShowSparkle(rewardIds[0]);
      setTimeout(() => {
        setShowSparkle(null);
        if (data.user) onUserUpdate(data.user);
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/pending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

        const dups: { name: string; coinsAwarded: number }[] = data.duplicatePets ?? [];
        if (dups.length > 0) {
          setDuplicateNotices(dups.map(d => ({ petName: d.name, coinsAwarded: d.coinsAwarded })));
          toast({
            title: "Reward Claimed!",
            description: `${dups.length} duplicate pet${dups.length > 1 ? "s" : ""} converted to coins — check below for details.`,
          });
        } else {
          toast({ title: "Reward Claimed!", description: "Items and coins have been added to your account" });
        }
        setClaimingBundleId(null);
      }, 800);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not claim reward", variant: "destructive" });
      setClaimingBundleId(null);
    },
  });

  const handleClaim = (stacked: StackedReward) => {
    setClaimingBundleId(stacked.bundleId);
    setDuplicateNotices([]);
    claimMutation.mutate(stacked.rewardIds);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[88%] max-w-sm rounded-lg overflow-hidden animate-slide-up"
        style={{
          background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(50,28,8,0.98) 100%)",
          border: "1px solid rgba(212,160,23,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 80px rgba(192,132,252,0.1)",
          maxHeight: "80vh",
        }}
      >
        <button
          data-testid="button-close-rewards"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
        >
          X
        </button>

        <div className="p-5">
          <div className="flex flex-col items-center mb-4">
            <div className="w-16 h-16 flex items-center justify-center mb-2">
              <img
                src={giftIconImg}
                alt="Gifts"
                className="w-16 h-16 object-contain"
                style={{ filter: "drop-shadow(0 0 10px rgba(120,200,80,0.6)) drop-shadow(0 0 20px rgba(192,132,252,0.35))" }}
              />
            </div>
            <h3
              className="font-fantasy text-[#c084fc] text-base tracking-widest font-semibold"
              style={{ textShadow: "0 0 10px rgba(192,132,252,0.4)" }}
            >
              Magical Gifts
            </h3>
            <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
              {rewards.length} {rewards.length === 1 ? "bundle" : "bundles"} waiting
            </p>
          </div>

          {/* Duplicate pet notice banner */}
          {duplicateNotices.length > 0 && (
            <div
              className="mb-3 rounded-lg p-3"
              style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(180,120,10,0.12) 100%)",
                border: "1.5px solid rgba(251,191,36,0.45)",
              }}
            >
              <p className="font-fantasy text-[#fbbf24] text-[10px] tracking-wider font-semibold mb-1.5">
                🔄 Duplicate Pets Converted
              </p>
              <div className="space-y-1">
                {duplicateNotices.map((n, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-fantasy text-[#e5d08a] text-[10px]">
                      Already own: <span className="font-semibold">{n.petName}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <img src={coinIconImg} alt="" className="w-3 h-3 object-contain" />
                      <span className="font-fantasy text-[#fbbf24] text-[10px] font-bold">+{n.coinsAwarded}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#c084fc] text-sm animate-pulse">Revealing gifts...</p>
              </div>
            ) : stackedRewards.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#a89878] text-sm">No pending rewards</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stackedRewards.map((stacked) => (
                  <div
                    key={stacked.bundleId}
                    data-testid={`card-reward-${stacked.bundleId}`}
                    className="rounded-lg overflow-hidden relative"
                    style={{
                      background: "linear-gradient(135deg, rgba(40,20,60,0.6) 0%, rgba(25,10,40,0.6) 100%)",
                      border: "1px solid rgba(192,132,252,0.3)",
                    }}
                  >
                    {showSparkle === stacked.rewardIds[0] && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center animate-pulse" style={{ background: "rgba(192,132,252,0.2)" }}>
                        <Sparkles className="w-10 h-10" style={{ color: "#c084fc", filter: "drop-shadow(0 0 20px rgba(192,132,252,0.8))" }} />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-fantasy text-[#c084fc] text-xs tracking-wider font-semibold" data-testid={`text-reward-name-${stacked.bundleId}`}>
                          {stacked.bundleName}
                        </h4>
                        {stacked.rewardIds.length > 1 && (
                          <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(192,132,252,0.2)", border: "1px solid rgba(192,132,252,0.4)" }}
                          >
                            <span className="font-fantasy text-[#c084fc] text-[9px] font-bold">×{stacked.rewardIds.length}</span>
                          </div>
                        )}
                      </div>

                      {stacked.bundleMessage && (
                        <p
                          data-testid={`text-reward-message-${stacked.bundleId}`}
                          className="font-sans text-[#d4c8a0] text-[11px] leading-relaxed mb-2 italic"
                          style={{ opacity: 0.85 }}
                        >
                          "{stacked.bundleMessage}"
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mb-2">
                        {stacked.coinAmount > 0 && (
                          <div
                            className="flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.3)" }}
                          >
                            <img src={coinIconImg} alt="" className="w-3.5 h-3.5" />
                            <span className="font-fantasy text-[#f0c040] text-[10px] font-bold">
                              {stacked.rewardIds.length > 1 ? `${stacked.coinAmount} ×${stacked.rewardIds.length}` : stacked.coinAmount}
                            </span>
                          </div>
                        )}

                        {stacked.items.map((item, idx) => {
                          const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-1 px-2 py-1 rounded-md"
                              style={{ background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.2)" }}
                            >
                              {displayImg ? (
                                <img src={displayImg} alt="" className="w-5 h-5 object-contain rounded-sm" />
                              ) : (
                                <span className="text-sm">{item.type === "pet" ? "🥚" : "📦"}</span>
                              )}
                              <span className="font-fantasy text-[#e0d0f0] text-[9px] truncate max-w-[80px]">{item.name}</span>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        data-testid={`button-claim-${stacked.bundleId}`}
                        onClick={() => handleClaim(stacked)}
                        disabled={claimMutation.isPending}
                        className="w-full py-2 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, rgba(120,80,200,0.6) 0%, rgba(80,40,160,0.6) 100%)",
                          border: "1px solid rgba(192,132,252,0.5)",
                          color: "#e0d0f0",
                          cursor: "pointer",
                          boxShadow: "0 0 12px rgba(192,132,252,0.2)",
                        }}
                      >
                        {claimingBundleId === stacked.bundleId
                          ? "Claiming..."
                          : stacked.rewardIds.length > 1
                            ? `Claim All (×${stacked.rewardIds.length})`
                            : "Claim Reward"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
