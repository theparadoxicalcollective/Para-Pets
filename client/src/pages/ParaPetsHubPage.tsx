import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  totalPoints: number;
  topBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
  allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 6px gold)" }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 4px silver)" }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 4px #cd7f32)" }}>🥉</span>;
  return (
    <span
      className="font-fantasy text-xs"
      style={{ color: "#7fbfb0", minWidth: "1.5rem", textAlign: "center", display: "inline-block" }}
    >
      {rank}
    </span>
  );
}

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  const isTop3 = rank <= 3;
  const borderColor = rank === 1 ? "rgba(255,215,0,0.45)" : rank === 2 ? "rgba(192,192,192,0.35)" : rank === 3 ? "rgba(205,127,50,0.35)" : "rgba(127,191,176,0.12)";
  const glowColor = rank === 1 ? "rgba(255,215,0,0.08)" : rank === 2 ? "rgba(192,192,192,0.05)" : rank === 3 ? "rgba(205,127,50,0.06)" : "transparent";

  return (
    <div
      data-testid={`leaderboard-row-${entry.userId}`}
      className="rounded-xl overflow-hidden"
      style={{
        background: isTop3 ? `linear-gradient(135deg, rgba(10,18,14,0.95), rgba(8,15,10,0.95))` : "rgba(7,12,10,0.7)",
        border: `1px solid ${borderColor}`,
        boxShadow: isTop3 ? `0 0 18px ${glowColor}, 0 2px 8px rgba(0,0,0,0.4)` : "none",
        marginBottom: "8px",
      }}
    >
      <button
        data-testid={`button-expand-player-${entry.userId}`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-shrink-0 w-7 flex items-center justify-center">
          <RankMedal rank={rank} />
        </div>

        {entry.profileImage ? (
          <img
            src={entry.profileImage}
            alt={entry.username}
            className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
            style={{ border: `1.5px solid ${borderColor}` }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-fantasy text-sm"
            style={{ background: "rgba(127,191,176,0.1)", border: `1.5px solid ${borderColor}`, color: "#7fbfb0" }}
          >
            {entry.username[0]?.toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p
            className="font-fantasy text-sm tracking-wide truncate"
            style={{ color: rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd9f5c" : "#c8d8b0" }}
            data-testid={`text-username-${entry.userId}`}
          >
            {entry.username}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {entry.topBadges.map(b => (
              <img
                key={b.id}
                src={b.imageUrl}
                alt={b.name}
                title={`${b.name} (${b.badgePoints} pts)`}
                className="w-5 h-5 rounded-full object-cover"
                style={{ border: "1px solid rgba(255,215,0,0.25)" }}
                data-testid={`badge-icon-${b.id}-${entry.userId}`}
              />
            ))}
            {entry.allBadges.length > 3 && (
              <span className="font-fantasy text-[9px]" style={{ color: "#6a8070" }}>
                +{entry.allBadges.length - 3}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span
            className="font-fantasy text-sm"
            style={{ color: "#7fbfb0", textShadow: "0 0 8px rgba(127,191,176,0.4)" }}
            data-testid={`text-points-${entry.userId}`}
          >
            {entry.totalPoints.toLocaleString()} pts
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: "#4a7060" }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: "#4a7060" }} />
          )}
        </div>
      </button>

      {expanded && (
        <div
          data-testid={`expanded-badges-${entry.userId}`}
          className="px-4 pb-4"
          style={{ borderTop: "1px solid rgba(127,191,176,0.08)" }}
        >
          <p className="font-fantasy text-[9px] tracking-widest uppercase mt-3 mb-2" style={{ color: "#4a7060" }}>
            All Badges ({entry.allBadges.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {[...entry.allBadges]
              .sort((a, b) => b.badgePoints - a.badgePoints)
              .map(b => (
                <div
                  key={b.id}
                  className="flex flex-col items-center gap-1"
                  style={{ minWidth: "3rem" }}
                  data-testid={`badge-card-${b.id}-${entry.userId}`}
                >
                  <img
                    src={b.imageUrl}
                    alt={b.name}
                    className="w-10 h-10 rounded-full object-cover"
                    style={{ border: "1.5px solid rgba(255,215,0,0.3)", boxShadow: "0 0 6px rgba(0,0,0,0.5)" }}
                  />
                  <span className="font-fantasy text-[8px] text-center leading-tight" style={{ color: "#a89878", maxWidth: "3rem" }}>
                    {b.name}
                  </span>
                  {b.badgePoints > 0 && (
                    <span className="font-fantasy text-[8px]" style={{ color: "#7fbfb0" }}>
                      {b.badgePoints}★
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ParaPetsHubPage() {
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/badges/leaderboard"],
    retry: false,
  });

  const playDestination = user ? "/pet-house" : "/auth";

  return (
    <div
      data-testid="para-pets-hub-page"
      className="fixed inset-0 overflow-y-auto"
      style={{
        zIndex: 9999,
        backgroundColor: "#07090f",
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 15% 10%, rgba(58,30,90,0.55) 0%, transparent 60%)",
          "radial-gradient(ellipse 70% 45% at 85% 80%, rgba(20,70,55,0.45) 0%, transparent 55%)",
          "radial-gradient(ellipse 50% 35% at 60% 30%, rgba(26,107,85,0.18) 0%, transparent 50%)",
          "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.8' fill='rgba(127,191,176,0.06)'/%3E%3C/svg%3E\")",
        ].join(", "),
      }}
    >
      {/* Title header */}
      <div
        data-testid="hub-title-header"
        className="w-full flex flex-col items-center justify-center pt-14 pb-6 px-5"
        style={{ paddingTop: "max(3.5rem, env(safe-area-inset-top, 3.5rem))" }}
      >
        <h1
          className="font-fantasy text-4xl tracking-widest text-center"
          style={{
            color: "#7fbfb0",
            textShadow: "0 0 32px rgba(127,191,176,0.5), 0 0 60px rgba(127,191,176,0.2)",
          }}
          data-testid="text-hub-title"
        >
          Para Pets
        </h1>
        <div
          className="mt-3 w-32 mx-auto"
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(127,191,176,0.5), transparent)",
          }}
        />
      </div>

      {/* Action bar — sticky */}
      <div
        className="sticky top-0 z-50 w-full border-b border-white/[0.06]"
        data-testid="hub-action-bar"
        style={{
          backgroundColor: "rgba(7,9,15,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 h-13 flex items-center justify-end gap-3 py-3">
          <Link
            href={playDestination}
            data-testid="button-play-game"
            className="text-xs font-bold tracking-widest transition-all duration-150 active:scale-95"
            style={{
              color: "#07090f",
              borderRadius: "9999px",
              padding: "8px 22px",
              background: "linear-gradient(135deg, #7fbfb0 0%, #1a9b70 100%)",
              boxShadow: "0 0 16px rgba(127,191,176,0.35), 0 2px 8px rgba(0,0,0,0.4)",
              letterSpacing: "0.08em",
            }}
          >
            Play Game
          </Link>

          {!user && (
            <Link
              href="/auth?returnTo=/hub"
              data-testid="link-hub-signin"
              className="text-xs font-semibold tracking-wide transition-all duration-150"
              style={{
                color: "#c8d8b0",
                border: "1px solid rgba(127,191,176,0.3)",
                borderRadius: "9999px",
                padding: "7px 18px",
                background: "rgba(26,107,85,0.12)",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 py-8 pb-24" data-testid="hub-main">
        {/* Leaderboard section */}
        <div data-testid="leaderboard-section">
          <div className="flex items-center gap-3 mb-5">
            <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, transparent, rgba(127,191,176,0.25))" }} />
            <h2
              className="font-fantasy text-base tracking-widest"
              style={{ color: "#7fbfb0", textShadow: "0 0 12px rgba(127,191,176,0.3)" }}
              data-testid="text-leaderboard-title"
            >
              Hall of Legends
            </h2>
            <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, rgba(127,191,176,0.25), transparent)" }} />
          </div>

          <p className="font-fantasy text-[10px] tracking-wide text-center mb-6" style={{ color: "#4a7060" }}>
            Ranked by total badge points earned
          </p>

          {lbLoading ? (
            <div className="flex flex-col gap-2" data-testid="leaderboard-loading">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="h-16 rounded-xl animate-pulse"
                  style={{ background: "rgba(127,191,176,0.05)", border: "1px solid rgba(127,191,176,0.08)" }}
                />
              ))}
            </div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <div
              data-testid="leaderboard-empty"
              className="text-center py-16 rounded-xl"
              style={{ border: "1px dashed rgba(127,191,176,0.12)", background: "rgba(7,12,10,0.5)" }}
            >
              <p className="font-fantasy text-3xl mb-3" style={{ filter: "grayscale(0.3)" }}>🏅</p>
              <p className="font-fantasy text-sm tracking-wider" style={{ color: "#4a7060" }}>No legends yet</p>
              <p className="font-fantasy text-[10px] mt-1" style={{ color: "#2a4040" }}>
                Earn badges with points to claim your place
              </p>
            </div>
          ) : (
            <div data-testid="leaderboard-list">
              {leaderboard.map((entry, i) => (
                <LeaderboardRow key={entry.userId} entry={entry} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
