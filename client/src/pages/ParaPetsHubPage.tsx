import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X, Eye, EyeOff, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import heroBanner from "@assets/hub_hero_banner.png";
import mascot from "@assets/hub_mascot.png";

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  totalPoints: number;
  topBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
  allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
}

// ── Tiny star field rendered as CSS ─────────────────────────────────────────
function StarField() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.abs(Math.sin(i * 137.508) * 100),
    y: Math.abs(Math.cos(i * 97.3) * 100),
    size: ((i % 3) + 1) * 0.7,
    opacity: 0.15 + (i % 5) * 0.08,
    dur: 2 + (i % 4),
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: "#a5f3fc",
            opacity: s.opacity,
            animation: `pulse ${s.dur}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

// ── Rank medal ───────────────────────────────────────────────────────────────
function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 6px gold)" }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 4px silver)" }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 4px #cd7f32)" }}>🥉</span>;
  return (
    <span className="font-fantasy text-xs" style={{ color: "#4a7a6a", minWidth: "1.5rem", textAlign: "center", display: "inline-block" }}>
      {rank}
    </span>
  );
}

// ── Leaderboard row ──────────────────────────────────────────────────────────
function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const isTop3 = rank <= 3;
  const borderColor =
    rank === 1 ? "rgba(255,215,0,0.45)" :
    rank === 2 ? "rgba(192,192,192,0.35)" :
    rank === 3 ? "rgba(205,127,50,0.35)" :
    "rgba(127,191,176,0.10)";
  const glowColor =
    rank === 1 ? "rgba(255,215,0,0.07)" :
    rank === 2 ? "rgba(192,192,192,0.04)" :
    rank === 3 ? "rgba(205,127,50,0.05)" :
    "transparent";

  return (
    <div
      data-testid={`leaderboard-row-${entry.userId}`}
      className="rounded-2xl overflow-hidden"
      style={{
        background: isTop3
          ? "linear-gradient(135deg, rgba(12,20,16,0.97), rgba(8,14,11,0.97))"
          : "rgba(8,13,10,0.65)",
        border: `1px solid ${borderColor}`,
        boxShadow: isTop3 ? `0 0 20px ${glowColor}, 0 2px 10px rgba(0,0,0,0.5)` : "none",
        marginBottom: 8,
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
          <img src={entry.profileImage} alt={entry.username}
            className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
            style={{ border: `1.5px solid ${borderColor}` }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-fantasy text-sm"
            style={{ background: "rgba(127,191,176,0.08)", border: `1.5px solid ${borderColor}`, color: "#7fbfb0" }}>
            {entry.username[0]?.toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-fantasy text-sm tracking-wide truncate"
            style={{ color: rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd9f5c" : "#b8ccb0" }}
            data-testid={`text-username-${entry.userId}`}>
            {entry.username}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {entry.topBadges.map(b => (
              <img key={b.id} src={b.imageUrl} alt={b.name}
                title={`${b.name} (${b.badgePoints} pts)`}
                className="w-5 h-5 rounded-full object-cover"
                style={{ border: "1px solid rgba(255,215,0,0.22)" }}
                data-testid={`badge-icon-${b.id}-${entry.userId}`} />
            ))}
            {entry.allBadges.length > 3 && (
              <span className="font-fantasy text-[9px]" style={{ color: "#4a6a5a" }}>
                +{entry.allBadges.length - 3}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className="font-fantasy text-sm" style={{ color: "#7fbfb0", textShadow: "0 0 8px rgba(127,191,176,0.4)" }}
            data-testid={`text-points-${entry.userId}`}>
            {entry.totalPoints.toLocaleString()} pts
          </span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#3a5a4a" }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#3a5a4a" }} />
          }
        </div>
      </button>

      {expanded && (
        <div data-testid={`expanded-badges-${entry.userId}`} className="px-4 pb-4"
          style={{ borderTop: "1px solid rgba(127,191,176,0.07)" }}>
          <p className="font-fantasy text-[9px] tracking-widest uppercase mt-3 mb-2" style={{ color: "#3a5a4a" }}>
            All Badges ({entry.allBadges.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {[...entry.allBadges].sort((a, b) => b.badgePoints - a.badgePoints).map(b => (
              <div key={b.id} className="flex flex-col items-center gap-1" style={{ minWidth: "3rem" }}
                data-testid={`badge-card-${b.id}-${entry.userId}`}>
                <img src={b.imageUrl} alt={b.name}
                  className="w-10 h-10 rounded-full object-cover"
                  style={{ border: "1.5px solid rgba(255,215,0,0.28)", boxShadow: "0 0 6px rgba(0,0,0,0.5)" }} />
                <span className="font-fantasy text-[8px] text-center leading-tight" style={{ color: "#a89878", maxWidth: "3rem" }}>
                  {b.name}
                </span>
                {b.badgePoints > 0 && (
                  <span className="font-fantasy text-[8px]" style={{ color: "#7fbfb0" }}>{b.badgePoints}★</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sign-in modal ────────────────────────────────────────────────────────────
function SignInModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password, rememberMe: false });
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      onSuccess();
    },
    onError: (err: any) => {
      const raw = err.message ?? "";
      const bodyStr = raw.includes(":") ? raw.split(": ").slice(1).join(": ") : raw;
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(bodyStr); } catch {}
      toast({ title: "Login Failed", description: parsed.message || "Invalid username or password", variant: "destructive" });
    },
  });

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5"
      style={{ zIndex: 9999, background: "rgba(4,6,12,0.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={handleBackdrop}
      data-testid="signin-modal-backdrop"
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(10,16,24,0.98) 0%, rgba(6,12,10,0.98) 100%)",
          border: "1px solid rgba(127,191,176,0.25)",
          boxShadow: "0 0 60px rgba(34,211,238,0.08), 0 24px 60px rgba(0,0,0,0.7)",
        }}
        data-testid="signin-modal"
      >
        {/* Modal header */}
        <div className="relative flex items-center justify-center pt-8 pb-5 px-6"
          style={{ borderBottom: "1px solid rgba(127,191,176,0.08)" }}>
          <div className="flex flex-col items-center gap-1">
            <img src={mascot} alt="Para Pets" className="w-14 h-14 object-contain"
              style={{ filter: "drop-shadow(0 0 12px rgba(127,191,176,0.5))" }} />
            <h2 className="font-fantasy text-lg tracking-widest" style={{ color: "#7fbfb0", textShadow: "0 0 20px rgba(127,191,176,0.4)" }}>
              Welcome Back
            </h2>
            <p className="font-fantasy text-[10px] tracking-widest" style={{ color: "#3a6050" }}>
              Sign in to continue your journey
            </p>
          </div>
          <button
            data-testid="button-close-signin-modal"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 transition-all"
            style={{ background: "rgba(127,191,176,0.08)", color: "#4a7060" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#4a7060" }}>
              Username
            </label>
            <input
              data-testid="input-signin-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoCapitalize="none"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: "rgba(127,191,176,0.06)",
                border: "1px solid rgba(127,191,176,0.18)",
                color: "#c8d8b0",
                fontFamily: "inherit",
              }}
              onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#4a7060" }}>
              Password
            </label>
            <div className="relative">
              <input
                data-testid="input-signin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all"
                style={{
                  background: "rgba(127,191,176,0.06)",
                  border: "1px solid rgba(127,191,176,0.18)",
                  color: "#c8d8b0",
                  fontFamily: "inherit",
                }}
                onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }}
              />
              <button
                data-testid="button-toggle-password"
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#4a7060" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            data-testid="button-signin-submit"
            onClick={() => loginMutation.mutate()}
            disabled={loginMutation.isPending || !username || !password}
            className="w-full rounded-xl py-3 font-fantasy text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: loginMutation.isPending
                ? "rgba(127,191,176,0.3)"
                : "linear-gradient(135deg, rgba(127,191,176,0.9) 0%, rgba(26,155,112,0.9) 100%)",
              color: "#07090f",
              opacity: (!username || !password) ? 0.5 : 1,
              boxShadow: loginMutation.isPending ? "none" : "0 0 20px rgba(127,191,176,0.3)",
            }}
          >
            {loginMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {loginMutation.isPending ? "Entering world..." : "Enter World"}
          </button>

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/auth?mode=forgot"
              data-testid="link-forgot-password"
              className="font-fantasy text-[10px] tracking-wide"
              style={{ color: "#3a6050" }}
            >
              Forgot password?
            </Link>
            <Link
              href="/auth?mode=register"
              data-testid="link-create-account"
              className="font-fantasy text-[10px] tracking-wide"
              style={{ color: "#7fbfb0" }}
            >
              Create account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main hub page ────────────────────────────────────────────────────────────
export default function ParaPetsHubPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/badges/leaderboard"],
    retry: false,
  });

  const playDestination = user ? "/pet-house" : "/auth";

  const handleSignInSuccess = () => {
    setShowSignIn(false);
    toast({ title: "Welcome back!", description: "You're now signed in." });
    setLocation("/pet-house");
  };

  return (
    <>
      <div
        data-testid="para-pets-hub-page"
        className="fixed inset-0 overflow-y-auto"
        style={{
          zIndex: 9000,
          background: "#060a10",
          backgroundImage: [
            "radial-gradient(ellipse 90% 55% at 10% 5%, rgba(48,20,80,0.65) 0%, transparent 55%)",
            "radial-gradient(ellipse 75% 50% at 90% 85%, rgba(10,65,50,0.55) 0%, transparent 55%)",
            "radial-gradient(ellipse 55% 40% at 55% 35%, rgba(20,90,75,0.15) 0%, transparent 50%)",
          ].join(", "),
        }}
      >
        <StarField />

        {/* ── Sticky nav bar ── */}
        <div
          className="sticky top-0 w-full"
          data-testid="hub-action-bar"
          style={{
            zIndex: 50,
            background: "rgba(6,10,16,0.88)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(127,191,176,0.08)",
          }}
        >
          <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
            <span className="font-fantasy text-sm tracking-widest" style={{ color: "#3a6050", letterSpacing: "0.2em" }}>
              PARA PETS
            </span>

            <div className="flex items-center gap-3">
              {user ? (
                <span className="font-fantasy text-xs tracking-wide" style={{ color: "#7fbfb0" }}>
                  {user.username}
                </span>
              ) : (
                <button
                  data-testid="button-hub-signin"
                  onClick={() => setShowSignIn(true)}
                  className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                  style={{
                    color: "#7fbfb0",
                    border: "1px solid rgba(127,191,176,0.28)",
                    borderRadius: "9999px",
                    padding: "7px 18px",
                    background: "rgba(127,191,176,0.07)",
                  }}
                >
                  Sign In
                </button>
              )}

              <Link
                href={playDestination}
                data-testid="button-play-game"
                className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                style={{
                  color: "#060a10",
                  borderRadius: "9999px",
                  padding: "8px 22px",
                  background: "linear-gradient(135deg, #7fbfb0 0%, #1a9b70 100%)",
                  boxShadow: "0 0 18px rgba(127,191,176,0.35), 0 2px 8px rgba(0,0,0,0.5)",
                  letterSpacing: "0.08em",
                }}
              >
                Play Game
              </Link>
            </div>
          </div>
        </div>

        {/* ── Hero section ── */}
        <div className="relative w-full overflow-hidden" style={{ maxHeight: 380 }}>
          <img
            src={heroBanner}
            alt="Para Pets world"
            className="w-full object-cover"
            style={{
              display: "block",
              maxHeight: 380,
              objectPosition: "center 30%",
              filter: "brightness(0.75) saturate(1.2)",
            }}
            data-testid="img-hub-hero"
          />
          {/* bottom fade */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(6,10,16,0.1) 0%, rgba(6,10,16,0) 30%, rgba(6,10,16,0.7) 75%, rgba(6,10,16,1) 100%)"
          }} />
          {/* top fade */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(6,10,16,0.5) 0%, transparent 20%)"
          }} />

          {/* Hero title overlaid on image */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 px-5">
            <div className="flex flex-col items-center gap-3">
              <img src={mascot} alt="Para Pets mascot" className="w-20 h-20 object-contain"
                style={{ filter: "drop-shadow(0 0 18px rgba(127,191,176,0.7)) drop-shadow(0 0 40px rgba(80,180,210,0.4))" }}
                data-testid="img-hub-mascot"
              />
              <h1 className="font-fantasy text-5xl tracking-widest text-center"
                style={{
                  color: "#ffffff",
                  textShadow: "0 0 40px rgba(127,191,176,0.6), 0 0 80px rgba(127,191,176,0.25), 0 4px 20px rgba(0,0,0,0.8)",
                  letterSpacing: "0.15em",
                }}
                data-testid="text-hub-title">
                Para Pets
              </h1>
              <p className="font-fantasy text-sm tracking-widest text-center"
                style={{ color: "rgba(200,220,190,0.75)", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                Hatch. Explore. Collect. Conquer.
              </p>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <main className="relative max-w-3xl mx-auto px-5 py-10 pb-24" data-testid="hub-main" style={{ zIndex: 1 }}>

          {/* CTA for guests */}
          {!user && (
            <div
              className="rounded-3xl p-6 mb-10 text-center"
              style={{
                background: "linear-gradient(135deg, rgba(10,20,16,0.9), rgba(6,14,10,0.9))",
                border: "1px solid rgba(127,191,176,0.18)",
                boxShadow: "0 0 40px rgba(34,211,238,0.05), inset 0 1px 0 rgba(127,191,176,0.08)",
              }}
              data-testid="hub-cta-section"
            >
              <p className="font-fantasy text-sm tracking-wide mb-1" style={{ color: "#7fbfb0" }}>
                Begin your adventure
              </p>
              <p className="font-fantasy text-[11px] mb-5" style={{ color: "#3a6050" }}>
                Hatch magical pets, explore enchanted worlds, and climb the leaderboard
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/auth?mode=register"
                  data-testid="link-create-account-cta"
                  className="font-fantasy text-xs tracking-widest rounded-2xl px-6 py-3 transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #7fbfb0 0%, #1a9b70 100%)",
                    color: "#060a10",
                    boxShadow: "0 0 18px rgba(127,191,176,0.3)",
                  }}
                >
                  Create Account
                </Link>
                <button
                  data-testid="button-cta-signin"
                  onClick={() => setShowSignIn(true)}
                  className="font-fantasy text-xs tracking-widest rounded-2xl px-6 py-3 transition-all active:scale-95"
                  style={{
                    border: "1px solid rgba(127,191,176,0.25)",
                    color: "#7fbfb0",
                    background: "rgba(127,191,176,0.06)",
                  }}
                >
                  Sign In
                </button>
              </div>
            </div>
          )}

          {/* Game features row */}
          <div className="grid grid-cols-3 gap-3 mb-10">
            {[
              { icon: "🥚", label: "Hatch Pets", desc: "Discover rare creatures" },
              { icon: "🗺️", label: "Explore Worlds", desc: "Venture into enchanted realms" },
              { icon: "🏅", label: "Earn Badges", desc: "Climb the Hall of Legends" },
            ].map(f => (
              <div
                key={f.label}
                data-testid={`feature-card-${f.label.replace(" ", "-").toLowerCase()}`}
                className="rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center"
                style={{
                  background: "rgba(8,14,10,0.7)",
                  border: "1px solid rgba(127,191,176,0.1)",
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>{f.icon}</span>
                <p className="font-fantasy text-[11px] tracking-wide" style={{ color: "#7fbfb0" }}>{f.label}</p>
                <p className="font-fantasy text-[9px] leading-tight" style={{ color: "#3a5a4a" }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Leaderboard */}
          <div data-testid="leaderboard-section">
            <div className="flex items-center gap-3 mb-5">
              <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, transparent, rgba(127,191,176,0.22))" }} />
              <h2 className="font-fantasy text-base tracking-widest"
                style={{ color: "#7fbfb0", textShadow: "0 0 14px rgba(127,191,176,0.35)" }}
                data-testid="text-leaderboard-title">
                Hall of Legends
              </h2>
              <div style={{ height: "1px", flex: 1, background: "linear-gradient(90deg, rgba(127,191,176,0.22), transparent)" }} />
            </div>

            <p className="font-fantasy text-[10px] tracking-wide text-center mb-6" style={{ color: "#3a5a4a" }}>
              Ranked by total badge points earned
            </p>

            {lbLoading ? (
              <div className="flex flex-col gap-2" data-testid="leaderboard-loading">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse"
                    style={{ background: "rgba(127,191,176,0.04)", border: "1px solid rgba(127,191,176,0.07)" }} />
                ))}
              </div>
            ) : !leaderboard || leaderboard.length === 0 ? (
              <div data-testid="leaderboard-empty"
                className="text-center py-16 rounded-2xl"
                style={{ border: "1px dashed rgba(127,191,176,0.1)", background: "rgba(8,13,10,0.5)" }}>
                <p className="font-fantasy text-3xl mb-3" style={{ filter: "grayscale(0.3)" }}>🏅</p>
                <p className="font-fantasy text-sm tracking-wider" style={{ color: "#3a5a4a" }}>No legends yet</p>
                <p className="font-fantasy text-[10px] mt-1" style={{ color: "#243a30" }}>
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

      {/* ── Sign-in modal ── */}
      {showSignIn && (
        <SignInModal onClose={() => setShowSignIn(false)} onSuccess={handleSignInSuccess} />
      )}
    </>
  );
}
