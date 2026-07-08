import { useState, useEffect } from "react";
import { bjStart } from "@/lib/beginJourney";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { playChime } from "@/lib/sounds";
import coinIconImg from "@assets/icon_coin.png";
import giftTreasureIcon from "@assets/Photoroom_20260708_51809_PM_1783549272918.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import powerupBagIconWG from "@assets/generated_images/icon_powerup_bag.png";

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
}

interface WelcomeGiftScreenProps {
  user: { username: string };
  onComplete: (updatedUser: any) => void;
}

export default function WelcomeGiftScreen({ user, onComplete }: WelcomeGiftScreenProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"loading" | "reveal" | "collect" | "claiming" | "done">("loading");

  const { data: rewards = [], isSuccess, isError } = useQuery<PendingReward[]>({
    queryKey: ["/api/rewards/pending"],
    retry: 2,
  });

  useEffect(() => {
    if (!isError) return;
    localStorage.removeItem("para_pets_just_registered");
    onComplete(null);
  }, [isError]);

  const welcomeReward = rewards.find(r => r.bundleName === "Welcome to the Realm!");

  useEffect(() => {
    if (!isSuccess) return;
    if (!welcomeReward) {
      localStorage.removeItem("para_pets_just_registered");
      onComplete(null);
      return;
    }
    setPhase("reveal");
    const timer = setTimeout(() => setPhase("collect"), 1200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const claimMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const res = await apiRequest("POST", `/api/rewards/${rewardId}/claim`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      localStorage.removeItem("para_pets_just_registered");
      setTimeout(() => {
        bjStart();
        onComplete(data.user ?? null);
      }, 800);
    },
    onError: () => {
      setPhase("collect");
    },
  });

  const handleCollect = () => {
    if (!welcomeReward) {
      localStorage.removeItem("para_pets_just_registered");
      onComplete(null);
      return;
    }
    playChime();
    setPhase("claiming");
    claimMutation.mutate(welcomeReward.rewardId);
  };

  const handleSkip = () => {
    localStorage.removeItem("para_pets_just_registered");
    onComplete(null);
  };

  // Group items by id
  const groupedItems = (() => {
    if (!welcomeReward) return [];
    const grouped: { item: RewardItem; count: number }[] = [];
    for (const item of welcomeReward.items) {
      const existing = grouped.find(g => g.item.id === item.id);
      if (existing) existing.count++;
      else grouped.push({ item, count: 1 });
    }
    return grouped;
  })();

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "rgba(6,3,16,0.93)",
        fontFamily: "Georgia, serif",
      }}
    >
      <style>{`
        @keyframes wgFadeIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes wgPulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
        @keyframes wgBounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
      `}</style>

      {phase === "loading" ? (
        <div className="flex flex-col items-center gap-3">
          <img
            src={giftTreasureIcon}
            alt=""
            style={{ width: 44, height: 44, objectFit: "contain", animation: "wgPulse 1.4s ease-in-out infinite" }}
          />
          <p style={{ color: "rgba(212,170,50,0.55)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", animation: "wgPulse 1.8s ease-in-out infinite" }}>
            Preparing your gifts…
          </p>
          <button
            onClick={handleSkip}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(150,130,100,0.4)", fontSize: 10, marginTop: 8 }}
          >
            skip for now
          </button>
        </div>
      ) : (
        <div
          className="relative flex flex-col"
          style={{
            width: "90%",
            maxWidth: 360,
            maxHeight: "calc(72*var(--vh))",
            borderRadius: 18,
            background: "linear-gradient(160deg, rgba(26,11,52,0.99) 0%, rgba(16,7,35,0.99) 100%)",
            border: "1.5px solid rgba(212,170,50,0.5)",
            boxShadow: "0 0 40px rgba(192,132,252,0.15), 0 12px 40px rgba(0,0,0,0.8)",
            animation: "wgFadeIn 0.4s ease-out",
            overflow: "hidden",
          }}
        >
          {/* Top band */}
          <div style={{ height: 3, flexShrink: 0, background: "linear-gradient(90deg, transparent, rgba(212,170,50,0.8) 35%, rgba(192,132,252,0.85) 65%, rgba(212,170,50,0.8) 85%, transparent)" }} />

          {/* Compact header: orb inline with title */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
            <div
              className="relative flex items-center justify-center flex-shrink-0"
              style={{
                width: 54, height: 54,
                borderRadius: "50%",
                background: "radial-gradient(ellipse at 40% 35%, rgba(240,200,80,0.2) 0%, rgba(192,132,252,0.15) 60%, transparent 80%)",
                border: "1.5px solid rgba(212,170,50,0.45)",
                boxShadow: "0 0 20px rgba(192,132,252,0.3)",
              }}
            >
              <img
                src={giftTreasureIcon}
                alt=""
                style={{
                  width: 30, height: 30, objectFit: "contain",
                  animation: phase === "collect" ? "wgBounce 1.4s ease-in-out infinite" : undefined,
                  filter: "drop-shadow(0 0 8px rgba(212,170,50,0.8))",
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ color: "rgba(212,170,50,0.7)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 2 }}>
                Welcome Gift
              </p>
              <h1 style={{ color: "#f0e0a0", fontSize: 17, fontWeight: "bold", lineHeight: 1.2, margin: 0, textShadow: "0 0 16px rgba(212,170,50,0.4)" }}>
                {user.username}!
              </h1>
              {welcomeReward?.bundleMessage && (
                <p style={{ color: "rgba(200,185,155,0.7)", fontSize: 10, marginTop: 3, fontStyle: "italic", lineHeight: 1.3 }}>
                  "{welcomeReward.bundleMessage}"
                </p>
              )}
            </div>
          </div>

          {/* Thin divider */}
          <div className="mx-4 flex-shrink-0" style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,170,50,0.3) 30%, rgba(192,132,252,0.25) 70%, transparent)" }} />

          {/* Scrollable items */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2">
            {welcomeReward ? (
              <div className="flex flex-col gap-1.5">
                {welcomeReward.coinAmount > 0 && (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(240,192,64,0.1) 0%, rgba(180,130,20,0.07) 100%)",
                      border: "1px solid rgba(240,192,64,0.25)",
                    }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,220,60,0.15)", border: "1px solid rgba(240,192,64,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <img src={coinIconImg} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                    </div>
                    <div>
                      <p style={{ color: "#f0c040", fontSize: 16, fontWeight: "bold", lineHeight: 1, margin: 0 }}>{welcomeReward.coinAmount.toLocaleString()}</p>
                      <p style={{ color: "rgba(200,170,80,0.65)", fontSize: 9, margin: 0 }}>Coins</p>
                    </div>
                  </div>
                )}

                {groupedItems.map(({ item, count }) => {
                  const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, rgba(192,132,252,0.07) 0%, rgba(120,80,200,0.05) 100%)",
                        border: "1px solid rgba(192,132,252,0.2)",
                      }}
                    >
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {displayImg
                            ? <img src={displayImg} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            : item.type === "pet"
                              ? <img src={eggMagicIcon} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                              : <img src={powerupBagIconWG} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                          }
                        </div>
                        {count > 1 && (
                          <span style={{ position: "absolute", bottom: -3, right: -5, background: "rgba(20,10,0,0.9)", color: "#c084fc", border: "1px solid rgba(192,132,252,0.5)", fontSize: 8, fontWeight: "bold", padding: "0 3px", borderRadius: 5, lineHeight: 1.5 }}>
                            ×{count}
                          </span>
                        )}
                      </div>
                      <div>
                        <p style={{ color: "#e0d0f0", fontSize: 12, fontWeight: "600", lineHeight: 1.2, margin: 0 }}>{item.name}</p>
                        <p style={{ color: "rgba(192,132,252,0.55)", fontSize: 9, textTransform: "capitalize", margin: 0 }}>
                          {item.type === "pet" ? "Companion Pet" : "Item"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "rgba(200,185,155,0.5)", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>No gifts found</p>
            )}
          </div>

          {/* Fixed footer */}
          <div className="px-4 pt-2 pb-4 flex-shrink-0">
            {phase === "collect" || phase === "claiming" || phase === "done" ? (
              <button
                data-testid="button-collect-welcome-gift"
                onClick={handleCollect}
                disabled={phase === "claiming" || phase === "done"}
                className="w-full rounded-xl font-bold tracking-wider transition-all active:scale-95 disabled:opacity-60"
                style={{
                  padding: "11px 0",
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  background: phase === "done"
                    ? "linear-gradient(135deg, rgba(100,180,100,0.5) 0%, rgba(60,130,60,0.5) 100%)"
                    : "linear-gradient(135deg, rgba(212,170,50,0.9) 0%, rgba(180,120,20,0.9) 50%, rgba(212,170,50,0.9) 100%)",
                  border: phase === "done" ? "1.5px solid rgba(100,220,100,0.5)" : "1.5px solid rgba(255,220,80,0.6)",
                  color: phase === "done" ? "#a0f0a0" : "#1a0e00",
                  cursor: phase === "claiming" || phase === "done" ? "default" : "pointer",
                  boxShadow: phase !== "done" ? "0 0 18px rgba(212,170,50,0.35)" : "none",
                }}
              >
                {phase === "claiming" ? "Collecting…" : phase === "done" ? "✓ Gifts Collected!" : "Collect & Begin Journey"}
              </button>
            ) : (
              <div style={{ height: 42 }} />
            )}

            {phase !== "done" && (
              <button
                onClick={handleSkip}
                className="w-full text-center mt-2"
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(150,130,100,0.45)", fontSize: 10 }}
              >
                skip for now
              </button>
            )}
          </div>

          {/* Bottom band */}
          <div style={{ height: 3, flexShrink: 0, background: "linear-gradient(90deg, transparent, rgba(192,132,252,0.65) 35%, rgba(212,170,50,0.75) 65%, rgba(192,132,252,0.65) 85%, transparent)" }} />
        </div>
      )}
    </div>
  );
}
