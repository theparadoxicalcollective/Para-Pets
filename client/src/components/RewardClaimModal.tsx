import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";

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

interface RewardClaimModalProps {
  onClose: () => void;
  onUserUpdate: (user: any) => void;
}

export default function RewardClaimModal({ onClose, onUserUpdate }: RewardClaimModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState<string | null>(null);

  const { data: rewards = [], isLoading } = useQuery<PendingReward[]>({
    queryKey: ["/api/rewards/pending"],
  });

  const claimMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const res = await apiRequest("POST", `/api/rewards/${rewardId}/claim`);
      return res.json();
    },
    onSuccess: (data: any, rewardId: string) => {
      setShowSparkle(rewardId);
      setTimeout(() => {
        setShowSparkle(null);
        if (data.user) onUserUpdate(data.user);
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/pending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

        const dups: { name: string; coinsAwarded: number }[] = data.duplicatePets ?? [];
        if (dups.length > 0) {
          dups.forEach(dup => {
            toast({
              title: `Duplicate Pet: ${dup.name}`,
              description: `You already own this pet! Converted to ${dup.coinsAwarded} coins instead.`,
            });
          });
          toast({ title: "Reward Claimed!", description: "Duplicate pets converted to coins. Check your wallet!" });
        } else {
          toast({ title: "Reward Claimed!", description: "Items and coins have been added to your account" });
        }
        setClaimingId(null);
      }, 800);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not claim reward", variant: "destructive" });
      setClaimingId(null);
    },
  });

  const handleClaim = (rewardId: string) => {
    setClaimingId(rewardId);
    claimMutation.mutate(rewardId);
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
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
              style={{
                background: "radial-gradient(ellipse at center, rgba(192,132,252,0.3) 0%, rgba(120,80,200,0.1) 100%)",
                border: "2px solid rgba(192,132,252,0.4)",
                boxShadow: "0 0 30px rgba(192,132,252,0.3)",
              }}
            >
              <span className="text-3xl" style={{ filter: "drop-shadow(0 0 8px rgba(192,132,252,0.8))" }}>🎁</span>
            </div>
            <h3
              className="font-fantasy text-[#c084fc] text-base tracking-widest font-semibold"
              style={{ textShadow: "0 0 10px rgba(192,132,252,0.4)" }}
            >
              Magical Gifts
            </h3>
            <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
              {rewards.length} {rewards.length === 1 ? "reward" : "rewards"} waiting
            </p>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#c084fc] text-sm animate-pulse">Revealing gifts...</p>
              </div>
            ) : rewards.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-fantasy text-[#a89878] text-sm">No pending rewards</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rewards.map((reward) => (
                  <div
                    key={reward.rewardId}
                    data-testid={`card-reward-${reward.rewardId}`}
                    className="rounded-lg overflow-hidden relative"
                    style={{
                      background: "linear-gradient(135deg, rgba(40,20,60,0.6) 0%, rgba(25,10,40,0.6) 100%)",
                      border: "1px solid rgba(192,132,252,0.3)",
                    }}
                  >
                    {showSparkle === reward.rewardId && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center animate-pulse" style={{ background: "rgba(192,132,252,0.2)" }}>
                        <span className="text-4xl" style={{ filter: "drop-shadow(0 0 20px rgba(192,132,252,0.8))" }}>✨</span>
                      </div>
                    )}
                    <div className="p-3">
                      <h4 className="font-fantasy text-[#c084fc] text-xs tracking-wider font-semibold mb-1" data-testid={`text-reward-name-${reward.rewardId}`}>
                        {reward.bundleName}
                      </h4>

                      {reward.bundleMessage && (
                        <p
                          data-testid={`text-reward-message-${reward.rewardId}`}
                          className="font-sans text-[#d4c8a0] text-[11px] leading-relaxed mb-2 italic"
                          style={{ opacity: 0.85 }}
                        >
                          "{reward.bundleMessage}"
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mb-2">
                        {reward.coinAmount > 0 && (
                          <div
                            className="flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.3)" }}
                          >
                            <img src={coinIconImg} alt="" className="w-3.5 h-3.5" />
                            <span className="font-fantasy text-[#f0c040] text-[10px] font-bold">{reward.coinAmount}</span>
                          </div>
                        )}

                        {reward.items.map((item, idx) => {
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
                        data-testid={`button-claim-${reward.rewardId}`}
                        onClick={() => handleClaim(reward.rewardId)}
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
                        {claimingId === reward.rewardId ? "Claiming..." : "Claim Reward"}
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
