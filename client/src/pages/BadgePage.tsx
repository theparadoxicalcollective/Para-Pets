import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import bgImg from "@assets/bg_home_v2.png";
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

interface UserBadge {
  id: string;
  badgeId: string;
  awardedAt: string;
  name: string;
  imageUrl: string;
  dailyReward: number | null;
  lastClaimedAt: string | null;
}

const GOLD = "#f0c040";
const GOLD_DIM = "#a89878";
const GOLD_FAINT = "#6a5840";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ready!";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
    return Math.max(0, MS_PER_DAY - elapsed);
  }, [badge.lastClaimedAt]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/user/badges"] });
      toast({
        title: `+${badge.dailyReward} coins claimed!`,
        description: `Come back tomorrow for another ${badge.dailyReward} coins.`,
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
      className="mt-1 w-full rounded-lg font-fantasy text-[9px] tracking-wider py-1.5 transition-all active:scale-95"
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
        ? `Claim ${badge.dailyReward} 🪙`
        : formatCountdown(msLeft)}
    </button>
  );
}

export default function BadgePage({ user }: BadgePageProps) {
  const [, navigate] = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const { data: myBadges = [], isLoading } = useQuery<UserBadge[]>({
    queryKey: ["/api/user/badges"],
  });

  const handleClaimed = (newCoins: number) => {
    setCurrentUser(u => ({ ...u, coins: newCoins }));
  };

  return (
    <div
      className="relative w-full h-screen-frame overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
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
          onProfileClick={() => setShowProfile(true)}
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
            My Badges
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <p className="font-fantasy text-sm tracking-wider animate-pulse" style={{ color: "#7fbfb0" }}>
                Gathering honours...
              </p>
            </div>
          ) : myBadges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(240,192,64,0.08)",
                  border: "2px dashed rgba(240,192,64,0.25)",
                }}
              >
                <svg viewBox="0 0 100 100" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                  <polygon
                    points="50,10 54,30 74,30 58,44 64,64 50,52 36,64 42,44 26,30 46,30"
                    fill="rgba(240,192,64,0.25)"
                    stroke="rgba(240,192,64,0.4)"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-fantasy text-sm tracking-wider mb-1" style={{ color: GOLD_DIM }}>
                  No badges yet
                </p>
                <p className="font-fantasy text-[10px] tracking-wide" style={{ color: GOLD_FAINT }}>
                  Earn badges through special achievements
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 pt-2">
              {myBadges.map((badge) => (
                <div
                  key={badge.id}
                  data-testid={`card-badge-${badge.badgeId}`}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: badge.dailyReward
                        ? "linear-gradient(135deg, rgba(240,192,64,0.18), rgba(240,140,20,0.1))"
                        : "rgba(240,192,64,0.1)",
                      border: `2px solid ${badge.dailyReward ? "rgba(240,192,64,0.75)" : "rgba(212,160,23,0.5)"}`,
                      boxShadow: badge.dailyReward
                        ? "0 0 20px rgba(240,192,64,0.35), 0 4px 12px rgba(0,0,0,0.6)"
                        : "0 0 16px rgba(240,192,64,0.2), 0 4px 12px rgba(0,0,0,0.6)",
                    }}
                  >
                    <img
                      src={badge.imageUrl}
                      alt={badge.name}
                      className="w-16 h-16 object-contain"
                      style={{ filter: "drop-shadow(0 2px 6px rgba(240,192,64,0.4))" }}
                    />
                  </div>
                  <p
                    className="font-fantasy text-[10px] tracking-wider text-center leading-tight"
                    style={{ color: GOLD }}
                  >
                    {badge.name}
                  </p>
                  <p
                    className="font-fantasy text-[8px] tracking-wide text-center"
                    style={{ color: GOLD_FAINT }}
                  >
                    {new Date(badge.awardedAt).toLocaleDateString()}
                  </p>
                  {badge.dailyReward && (
                    <BadgeClaimButton badge={badge} onClaimed={handleClaimed} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
