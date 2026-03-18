import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
}

interface WelcomeGiftScreenProps {
  user: { username: string };
  onComplete: (updatedUser: any) => void;
}

export default function WelcomeGiftScreen({ user, onComplete }: WelcomeGiftScreenProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"loading" | "reveal" | "collect" | "claiming" | "done">("loading");
  const [sparkles, setSparkles] = useState<{ x: number; y: number; id: number }[]>([]);

  const { data: rewards = [], isSuccess } = useQuery<PendingReward[]>({
    queryKey: ["/api/rewards/pending"],
  });

  const welcomeReward = rewards.find(r => r.bundleName === "Welcome to the Realm!");

  useEffect(() => {
    if (!isSuccess) return;
    setPhase("reveal");
    const timer = setTimeout(() => setPhase("collect"), 1600);
    return () => clearTimeout(timer);
  }, [isSuccess]);

  useEffect(() => {
    if (phase !== "collect") return;
    const interval = setInterval(() => {
      setSparkles(prev => [
        ...prev.slice(-12),
        { x: Math.random() * 100, y: Math.random() * 100, id: Date.now() + Math.random() },
      ]);
    }, 350);
    return () => clearInterval(interval);
  }, [phase]);

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
        onComplete(data.user ?? null);
      }, 900);
    },
  });

  const handleCollect = () => {
    if (!welcomeReward) {
      localStorage.removeItem("para_pets_just_registered");
      onComplete(null);
      return;
    }
    setPhase("claiming");
    claimMutation.mutate(welcomeReward.rewardId);
  };

  const handleSkip = () => {
    localStorage.removeItem("para_pets_just_registered");
    onComplete(null);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, rgba(30,15,60,0.98) 0%, rgba(8,4,20,0.99) 70%)",
        fontFamily: "Georgia, serif",
      }}
    >
      {/* Ambient stars */}
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 7.3 + 11) % 100}%`,
            top: `${(i * 5.7 + 7) % 100}%`,
            width: i % 5 === 0 ? 3 : 2,
            height: i % 5 === 0 ? 3 : 2,
            background: i % 3 === 0 ? "rgba(200,180,255,0.7)" : "rgba(255,255,220,0.5)",
            animation: `pulse ${1.5 + (i % 3) * 0.7}s ease-in-out infinite`,
            animationDelay: `${(i * 0.13) % 2}s`,
          }}
        />
      ))}

      {/* Flying sparkles */}
      {sparkles.map(s => (
        <div
          key={s.id}
          className="absolute pointer-events-none"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            fontSize: 14,
            animation: "ping 1s ease-out forwards",
            opacity: 0.9,
          }}
        >✨</div>
      ))}

      {phase === "loading" ? (
        /* Loading state — shown briefly while rewards fetch */
        <div className="flex flex-col items-center gap-4">
          <div
            className="flex items-center justify-center"
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "radial-gradient(ellipse at 40% 35%, rgba(240,200,80,0.18) 0%, rgba(192,132,252,0.14) 60%, transparent 80%)",
              border: "2px solid rgba(212,170,50,0.35)",
              boxShadow: "0 0 30px rgba(192,132,252,0.25)",
            }}
          >
            <span style={{ fontSize: 36, animation: "pulse 1.4s ease-in-out infinite" }}>🎁</span>
          </div>
          <p
            className="text-[11px] tracking-widest uppercase"
            style={{ color: "rgba(212,170,50,0.55)", animation: "pulse 1.8s ease-in-out infinite" }}
          >
            Preparing your gifts…
          </p>
        </div>
      ) : (
        /* Main card — shown only once data is ready */
        <div
          className="relative w-[92%] max-w-[380px] rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, rgba(28,12,55,0.98) 0%, rgba(18,8,38,0.99) 100%)",
            border: "2px solid rgba(212,170,50,0.55)",
            boxShadow: "0 0 80px rgba(192,132,252,0.18), 0 0 30px rgba(212,170,50,0.12), 0 20px 60px rgba(0,0,0,0.85)",
            animation: "fadeIn 0.5s ease-out",
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Top decorative band */}
          <div style={{
            height: 4,
            background: "linear-gradient(90deg, transparent, rgba(212,170,50,0.8) 30%, rgba(192,132,252,0.9) 60%, rgba(212,170,50,0.8) 80%, transparent)",
          }} />

          <div className="px-6 pt-6 pb-7">
            {/* Glowing gift orb */}
            <div className="flex justify-center mb-4">
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: 88, height: 88,
                  borderRadius: "50%",
                  background: "radial-gradient(ellipse at 40% 35%, rgba(240,200,80,0.22) 0%, rgba(192,132,252,0.18) 60%, transparent 80%)",
                  border: "2px solid rgba(212,170,50,0.5)",
                  boxShadow: "0 0 40px rgba(192,132,252,0.35), 0 0 20px rgba(212,170,50,0.3)",
                }}
              >
                <span
                  style={{
                    fontSize: 44,
                    filter: "drop-shadow(0 0 12px rgba(212,170,50,0.9)) drop-shadow(0 0 24px rgba(192,132,252,0.6))",
                    animation: phase === "collect" ? "bounce 1.2s ease-in-out infinite" : undefined,
                  }}
                >🎁</span>

                {/* Orbiting stars */}
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: i === 0 ? "rgba(255,220,80,0.9)" : i === 1 ? "rgba(192,132,252,0.9)" : "rgba(120,220,180,0.9)",
                      top: `${[8, 72, 42][i]}%`,
                      left: `${[72, 20, 88][i]}%`,
                      boxShadow: `0 0 6px 2px ${i === 0 ? "rgba(255,220,80,0.5)" : i === 1 ? "rgba(192,132,252,0.5)" : "rgba(120,220,180,0.5)"}`,
                      animation: `ping ${1.4 + i * 0.5}s ease-in-out infinite`,
                      animationDelay: `${i * 0.4}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Welcome title */}
            <div className="text-center mb-1">
              <p
                className="text-[10px] tracking-[0.35em] uppercase mb-1"
                style={{ color: "rgba(212,170,50,0.75)", letterSpacing: "0.3em" }}
              >
                A Gift Awaits
              </p>
              <h1
                className="text-xl font-bold mb-0.5"
                style={{
                  color: "#f0e0a0",
                  textShadow: "0 0 20px rgba(212,170,50,0.5), 0 0 40px rgba(192,132,252,0.25)",
                  letterSpacing: "0.05em",
                }}
              >
                Welcome, {user.username}!
              </h1>
              {welcomeReward?.bundleMessage && (
                <p
                  className="text-[11px] leading-relaxed mt-2 italic"
                  style={{ color: "rgba(200,185,155,0.85)", maxWidth: 280, margin: "8px auto 0" }}
                >
                  "{welcomeReward.bundleMessage}"
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(212,170,50,0.35))" }} />
              <span style={{ color: "rgba(212,170,50,0.55)", fontSize: 12 }}>✦</span>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(212,170,50,0.35), transparent)" }} />
            </div>

            {/* Gift items */}
            {welcomeReward ? (
              <div className="flex flex-col gap-2.5 mb-5">
                {/* Coins */}
                {welcomeReward.coinAmount > 0 && (
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(240,192,64,0.1) 0%, rgba(180,130,20,0.08) 100%)",
                      border: "1px solid rgba(240,192,64,0.3)",
                    }}
                  >
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(255,220,60,0.25) 0%, rgba(200,150,20,0.1) 100%)",
                        border: "1.5px solid rgba(240,192,64,0.4)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <img src={coinIconImg} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                    </div>
                    <div>
                      <p style={{ color: "#f0c040", fontSize: 18, fontWeight: "bold", lineHeight: 1, textShadow: "0 0 10px rgba(240,192,64,0.5)" }}>
                        {welcomeReward.coinAmount.toLocaleString()}
                      </p>
                      <p style={{ color: "rgba(200,170,80,0.75)", fontSize: 10 }}>Coins</p>
                    </div>
                  </div>
                )}

                {/* Items */}
                {welcomeReward.items.map((item) => {
                  const displayImg = item.type === "pet" && item.eggImageUrl ? item.eggImageUrl : item.imageUrl;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, rgba(192,132,252,0.08) 0%, rgba(120,80,200,0.06) 100%)",
                        border: "1px solid rgba(192,132,252,0.25)",
                      }}
                    >
                      <div
                        style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: "rgba(192,132,252,0.1)",
                          border: "1.5px solid rgba(192,132,252,0.3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, overflow: "hidden",
                        }}
                      >
                        {displayImg
                          ? <img src={displayImg} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          : <span style={{ fontSize: 20 }}>{item.type === "pet" ? "🥚" : "✨"}</span>
                        }
                      </div>
                      <div>
                        <p style={{ color: "#e0d0f0", fontSize: 13, fontWeight: "600", lineHeight: 1.2 }}>{item.name}</p>
                        <p style={{ color: "rgba(192,132,252,0.6)", fontSize: 10, textTransform: "capitalize" }}>
                          {item.type === "pet" ? "Companion Pet" : "Item"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-5 text-center py-3">
                <p style={{ color: "rgba(200,185,155,0.6)", fontSize: 12, fontStyle: "italic" }}>No gifts found</p>
              </div>
            )}

            {/* Collect button — only shown once gifts are ready */}
            {phase === "collect" || phase === "claiming" || phase === "done" ? (
              <button
                data-testid="button-collect-welcome-gift"
                onClick={handleCollect}
                disabled={phase === "claiming" || phase === "done"}
                className="w-full rounded-xl font-bold tracking-wider transition-all active:scale-95 disabled:opacity-60"
                style={{
                  padding: "14px 0",
                  fontSize: 14,
                  letterSpacing: "0.1em",
                  background: phase === "done"
                    ? "linear-gradient(135deg, rgba(100,180,100,0.5) 0%, rgba(60,130,60,0.5) 100%)"
                    : "linear-gradient(135deg, rgba(212,170,50,0.85) 0%, rgba(180,120,20,0.85) 50%, rgba(212,170,50,0.85) 100%)",
                  border: phase === "done" ? "1.5px solid rgba(100,220,100,0.5)" : "1.5px solid rgba(255,220,80,0.6)",
                  color: phase === "done" ? "#a0f0a0" : "#1a0e00",
                  cursor: phase === "claiming" || phase === "done" ? "default" : "pointer",
                  boxShadow: phase !== "done" ? "0 0 25px rgba(212,170,50,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
                }}
              >
                {phase === "claiming" ? "Collecting…" : phase === "done" ? "✓ Gifts Collected!" : "Collect & Begin Journey"}
              </button>
            ) : (
              /* Brief pause after card reveals before button appears */
              <div style={{ height: 50 }} />
            )}

            {/* Skip link */}
            {(phase === "collect") && (
              <button
                onClick={handleSkip}
                className="w-full text-center mt-3"
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(150,130,100,0.5)", fontSize: 10, letterSpacing: "0.05em" }}
              >
                skip for now
              </button>
            )}
          </div>

          {/* Bottom decorative band */}
          <div style={{
            height: 4,
            background: "linear-gradient(90deg, transparent, rgba(192,132,252,0.7) 30%, rgba(212,170,50,0.8) 60%, rgba(192,132,252,0.7) 80%, transparent)",
          }} />
        </div>
      )}
    </div>
  );
}
