import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, X, Eye, EyeOff, Loader2, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import heroBanner        from "@assets/hub_hero_banner.png";
import mascot            from "@assets/hub_mascot.png";
import runeCircle        from "@assets/hub_rune_circle.png";
import eggsImg           from "@assets/hub_eggs.png";
import legendBanner      from "@assets/hub_legend_banner.png";
import podiumImg         from "@assets/hub_podium.png";
import rankCrowns        from "@assets/hub_rank_crowns.png";
import iconBadges        from "@assets/admin_icon_badges.png";
import iconMap           from "@assets/icon_map_new.png";

import worldEnchanted    from "@assets/bg_enchanted_grove_map.png";
import worldHaunted      from "@assets/bg_haunted_woods_map.png";
import worldDesert       from "@assets/bg_desert_map.png";
import worldSky          from "@assets/bg_sky_realm_map.png";
import worldIsland       from "@assets/bg_island_map.png";
import worldSwamp        from "@assets/bg_swamp_map.png";
import worldVolcanic     from "@assets/bg_volcanic_map.png";
import worldSnowy        from "@assets/bg_snowy_mountain_map.png";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  totalPoints: number;
  topBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
  allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const WORLDS = [
  { name: "Enchanted Grove",  img: worldEnchanted,  color: "#1a7a50" },
  { name: "Haunted Woods",    img: worldHaunted,     color: "#6a3a8a" },
  { name: "Sky Realm",        img: worldSky,         color: "#2a60a0" },
  { name: "Desert Sands",     img: worldDesert,      color: "#b07020" },
  { name: "Island Paradise",  img: worldIsland,      color: "#1a8a70" },
  { name: "Volcanic Crater",  img: worldVolcanic,    color: "#c04020" },
  { name: "Swamp Hollow",     img: worldSwamp,       color: "#3a6030" },
  { name: "Snowy Peak",       img: worldSnowy,       color: "#4a7090" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Star field background
// ─────────────────────────────────────────────────────────────────────────────
function StarField() {
  const stars = Array.from({ length: 70 }, (_, i) => ({
    id: i,
    x: Math.abs(Math.sin(i * 137.508) * 100),
    y: Math.abs(Math.cos(i * 97.3)    * 100),
    size: ((i % 3) + 1) * 0.65,
    opacity: 0.12 + (i % 6) * 0.06,
    dur: 2.5 + (i % 4) * 0.8,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            background: "#a5f3fc", opacity: s.opacity,
            animation: `pulse ${s.dur}s ease-in-out infinite alternate`,
          }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────────────────────────────────────
function RuneDivider() {
  return (
    <div className="flex items-center justify-center gap-4 my-10">
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(127,191,176,0.2))" }} />
      <img src={runeCircle} alt="" className="w-8 h-8 object-contain opacity-40"
        style={{ filter: "drop-shadow(0 0 6px rgba(127,191,176,0.5))" }} />
      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,rgba(127,191,176,0.2),transparent)" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-3 podium display
// ─────────────────────────────────────────────────────────────────────────────
const PODIUM_SLOT = [
  { rank: 2, order: 0, scale: 0.88, yOffset: 18, glowColor: "rgba(192,192,192,0.55)", borderColor: "rgba(192,192,192,0.7)", nameColor: "#d0d8d0" },
  { rank: 1, order: 1, scale: 1,    yOffset: 0,  glowColor: "rgba(255,215,0,0.7)",    borderColor: "rgba(255,215,0,0.9)",    nameColor: "#ffd700" },
  { rank: 3, order: 2, scale: 0.78, yOffset: 30, glowColor: "rgba(205,127,50,0.5)",   borderColor: "rgba(205,127,50,0.7)",   nameColor: "#cd9f5c" },
];

function TopThreePodium({ top3 }: { top3: LeaderboardEntry[] }) {
  return (
    <div className="relative w-full" style={{ maxWidth: 560, margin: "0 auto" }}>
      {/* Rank crowns strip */}
      <div className="flex justify-center mb-2">
        <img src={rankCrowns} alt="Rank crowns" className="h-14 object-contain opacity-90"
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))" }} />
      </div>

      {/* Player cards in podium order: 2nd | 1st | 3rd */}
      <div className="flex items-end justify-center gap-2 pb-2 px-2" style={{ position: "relative", zIndex: 2 }}>
        {PODIUM_SLOT.map(slot => {
          const entry = top3[slot.rank - 1];
          if (!entry) return (
            <div key={slot.rank}
              style={{ flex: slot.rank === 1 ? "0 0 38%" : "0 0 28%", marginBottom: slot.yOffset }} />
          );
          return (
            <div
              key={slot.rank}
              data-testid={`podium-slot-${slot.rank}`}
              className="flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4"
              style={{
                flex: slot.rank === 1 ? "0 0 38%" : "0 0 28%",
                marginBottom: slot.yOffset,
                background: "linear-gradient(160deg,rgba(10,18,14,0.95),rgba(6,12,10,0.97))",
                border: `1.5px solid ${slot.borderColor}`,
                boxShadow: `0 0 28px ${slot.glowColor}, 0 8px 24px rgba(0,0,0,0.6)`,
                transform: `scale(${slot.scale})`,
                transformOrigin: "bottom center",
                transition: "transform 0.2s",
              }}
            >
              {/* Avatar */}
              <div className="relative">
                {entry.profileImage ? (
                  <img src={entry.profileImage} alt={entry.username}
                    className="rounded-full object-cover"
                    style={{
                      width: slot.rank === 1 ? 56 : 42, height: slot.rank === 1 ? 56 : 42,
                      border: `2px solid ${slot.borderColor}`,
                      boxShadow: `0 0 16px ${slot.glowColor}`,
                    }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center font-fantasy"
                    style={{
                      width: slot.rank === 1 ? 56 : 42, height: slot.rank === 1 ? 56 : 42,
                      background: "rgba(127,191,176,0.1)",
                      border: `2px solid ${slot.borderColor}`,
                      boxShadow: `0 0 16px ${slot.glowColor}`,
                      color: slot.nameColor,
                      fontSize: slot.rank === 1 ? 22 : 16,
                    }}>
                    {entry.username[0]?.toUpperCase()}
                  </div>
                )}
                {/* Rank badge */}
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center font-fantasy text-[10px] font-bold"
                  style={{
                    background: slot.rank === 1 ? "linear-gradient(135deg,#b87d08,#fde272)" : slot.rank === 2 ? "linear-gradient(135deg,#888,#ddd)" : "linear-gradient(135deg,#8b4513,#cd9f5c)",
                    color: "#000", boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  }}>
                  {slot.rank}
                </div>
              </div>

              <p className="font-fantasy text-center leading-tight truncate w-full text-center"
                style={{ color: slot.nameColor, fontSize: slot.rank === 1 ? 12 : 10, maxWidth: "100%",
                  textShadow: `0 0 10px ${slot.glowColor}` }}>
                {entry.username}
              </p>

              <div className="flex items-center gap-1">
                <Star size={slot.rank === 1 ? 9 : 7} style={{ color: slot.nameColor, fill: slot.nameColor }} />
                <span className="font-fantasy" style={{ color: slot.nameColor, fontSize: slot.rank === 1 ? 11 : 9 }}>
                  {entry.totalPoints.toLocaleString()}
                </span>
              </div>

              {/* Top badges row */}
              {entry.topBadges.length > 0 && (
                <div className="flex gap-1 justify-center">
                  {entry.topBadges.slice(0, slot.rank === 1 ? 3 : 2).map(b => (
                    <img key={b.id} src={b.imageUrl} alt={b.name}
                      className="rounded-full object-cover"
                      style={{
                        width: slot.rank === 1 ? 18 : 14,
                        height: slot.rank === 1 ? 18 : 14,
                        border: "1px solid rgba(255,215,0,0.3)",
                        boxShadow: "0 0 4px rgba(0,0,0,0.5)",
                      }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Podium image — sits below the cards */}
      <div className="w-full flex justify-center" style={{ marginTop: -20, position: "relative", zIndex: 1 }}>
        <img src={podiumImg} alt="Podium" className="w-full object-contain"
          style={{
            maxWidth: 500, opacity: 0.85,
            filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.8))",
          }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranks 4+ row
// ─────────────────────────────────────────────────────────────────────────────
function RankRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid={`leaderboard-row-${entry.userId}`}
      className="rounded-2xl overflow-hidden mb-2"
      style={{
        background: "linear-gradient(90deg,rgba(8,14,10,0.85),rgba(6,10,8,0.85))",
        border: "1px solid rgba(127,191,176,0.1)",
        boxShadow: "inset 0 1px 0 rgba(127,191,176,0.05)",
      }}
    >
      <button
        data-testid={`button-expand-player-${entry.userId}`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank number in a gem-style badge */}
        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(127,191,176,0.07)", border: "1px solid rgba(127,191,176,0.15)" }}>
          <span className="font-fantasy text-xs" style={{ color: "#4a7a6a" }}>{rank}</span>
        </div>

        {/* Avatar */}
        {entry.profileImage ? (
          <img src={entry.profileImage} alt={entry.username}
            className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
            style={{ border: "1.5px solid rgba(127,191,176,0.2)" }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-fantasy text-sm"
            style={{ background: "rgba(127,191,176,0.07)", border: "1.5px solid rgba(127,191,176,0.15)", color: "#5a8a7a" }}>
            {entry.username[0]?.toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-fantasy text-sm tracking-wide truncate" style={{ color: "#b0c8b0" }}
            data-testid={`text-username-${entry.userId}`}>
            {entry.username}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {entry.topBadges.map(b => (
              <img key={b.id} src={b.imageUrl} alt={b.name}
                title={`${b.name} (${b.badgePoints} pts)`}
                className="w-4 h-4 rounded-full object-cover"
                style={{ border: "1px solid rgba(255,215,0,0.18)" }}
                data-testid={`badge-icon-${b.id}-${entry.userId}`} />
            ))}
            {entry.allBadges.length > 3 && (
              <span className="font-fantasy text-[9px]" style={{ color: "#3a5a4a" }}>
                +{entry.allBadges.length - 3}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl px-2 py-1"
            style={{ background: "rgba(127,191,176,0.08)", border: "1px solid rgba(127,191,176,0.12)" }}>
            <Star size={9} style={{ color: "#7fbfb0", fill: "#7fbfb0" }} />
            <span className="font-fantasy text-xs" style={{ color: "#7fbfb0" }}
              data-testid={`text-points-${entry.userId}`}>
              {entry.totalPoints.toLocaleString()}
            </span>
          </div>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#3a5a4a" }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#3a5a4a" }} />}
        </div>
      </button>

      {expanded && (
        <div data-testid={`expanded-badges-${entry.userId}`} className="px-4 pb-4"
          style={{ borderTop: "1px solid rgba(127,191,176,0.06)" }}>
          <p className="font-fantasy text-[9px] tracking-widest uppercase mt-3 mb-2" style={{ color: "#2a4a3a" }}>
            All Badges ({entry.allBadges.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {[...entry.allBadges].sort((a, b) => b.badgePoints - a.badgePoints).map(b => (
              <div key={b.id} className="flex flex-col items-center gap-1" style={{ minWidth: "2.8rem" }}
                data-testid={`badge-card-${b.id}-${entry.userId}`}>
                <img src={b.imageUrl} alt={b.name}
                  className="w-9 h-9 rounded-full object-cover"
                  style={{ border: "1.5px solid rgba(255,215,0,0.25)", boxShadow: "0 0 6px rgba(0,0,0,0.5)" }} />
                <span className="font-fantasy text-[8px] text-center leading-tight" style={{ color: "#7a6848", maxWidth: "2.8rem" }}>
                  {b.name}
                </span>
                {b.badgePoints > 0 && (
                  <span className="font-fantasy text-[8px]" style={{ color: "#5a8a7a" }}>{b.badgePoints}★</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in modal
// ─────────────────────────────────────────────────────────────────────────────
function SignInModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
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
      const body = raw.includes(":") ? raw.split(": ").slice(1).join(": ") : raw;
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(body); } catch {}
      toast({ title: "Login Failed", description: parsed.message || "Invalid username or password", variant: "destructive" });
    },
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5"
      style={{ zIndex: 99999, background: "rgba(4,6,12,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="signin-modal-backdrop"
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg,rgba(8,16,22,0.99) 0%,rgba(5,11,8,0.99) 100%)",
          border: "1px solid rgba(127,191,176,0.22)",
          boxShadow: "0 0 70px rgba(34,211,238,0.07), 0 24px 60px rgba(0,0,0,0.75)",
        }}
        data-testid="signin-modal"
      >
        <div className="relative flex flex-col items-center pt-8 pb-5 px-6"
          style={{ borderBottom: "1px solid rgba(127,191,176,0.07)" }}>
          <img src={mascot} alt="Para Pets" className="w-14 h-14 object-contain"
            style={{ filter: "drop-shadow(0 0 14px rgba(127,191,176,0.55))" }} />
          <h2 className="font-fantasy text-lg tracking-widest mt-2" style={{ color: "#7fbfb0", textShadow: "0 0 20px rgba(127,191,176,0.4)" }}>
            Welcome Back
          </h2>
          <p className="font-fantasy text-[10px] tracking-widest mt-0.5" style={{ color: "#2a5040" }}>
            Sign in to continue your journey
          </p>
          <button data-testid="button-close-signin-modal" onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5"
            style={{ background: "rgba(127,191,176,0.08)", color: "#3a6050" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#3a6050" }}>Username</label>
            <input data-testid="input-signin-username" type="text" value={username}
              onChange={e => setUsername(e.target.value)} placeholder="Your username"
              autoComplete="username" autoCapitalize="none"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: "rgba(127,191,176,0.05)", border: "1px solid rgba(127,191,176,0.16)", color: "#c8d8b0", fontFamily: "inherit" }}
              onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#3a6050" }}>Password</label>
            <div className="relative">
              <input data-testid="input-signin-password" type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Your password" autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none"
                style={{ background: "rgba(127,191,176,0.05)", border: "1px solid rgba(127,191,176,0.16)", color: "#c8d8b0", fontFamily: "inherit" }}
                onKeyDown={e => { if (e.key === "Enter") loginMutation.mutate(); }} />
              <button data-testid="button-toggle-password" type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#3a6050" }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button data-testid="button-signin-submit" onClick={() => loginMutation.mutate()}
            disabled={loginMutation.isPending || !username || !password}
            className="w-full rounded-xl py-3 font-fantasy text-sm tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#7fbfb0 0%,#1a9b70 100%)",
              color: "#060a10", opacity: (!username || !password) ? 0.5 : 1,
              boxShadow: loginMutation.isPending ? "none" : "0 0 22px rgba(127,191,176,0.3)",
            }}>
            {loginMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {loginMutation.isPending ? "Entering world..." : "Enter World"}
          </button>

          <div className="flex items-center justify-between">
            <Link href="/auth?mode=forgot" data-testid="link-forgot-password"
              className="font-fantasy text-[10px] tracking-wide" style={{ color: "#2a4a38" }}>
              Forgot password?
            </Link>
            <Link href="/auth?mode=register" data-testid="link-create-account"
              className="font-fantasy text-[10px] tracking-wide" style={{ color: "#7fbfb0" }}>
              Create account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ParaPetsHubPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [, setLocation]             = useLocation();
  const { toast }                   = useToast();
  const worldsRef                   = useRef<HTMLDivElement>(null);

  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"], retry: false });

  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/badges/leaderboard"],
    retry: false,
  });

  const top3  = leaderboard?.slice(0, 3)  ?? [];
  const rest  = leaderboard?.slice(3)     ?? [];

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
            "radial-gradient(ellipse 90% 55% at 10% 5%,  rgba(48,20,80,0.6) 0%,transparent 55%)",
            "radial-gradient(ellipse 75% 50% at 90% 85%, rgba(10,65,50,0.5) 0%,transparent 55%)",
            "radial-gradient(ellipse 55% 40% at 55% 35%, rgba(20,90,75,0.12) 0%,transparent 50%)",
          ].join(","),
        }}
      >
        <StarField />

        {/* ── Sticky nav ────────────────────────────────────────────────────── */}
        <div className="sticky top-0 w-full" data-testid="hub-action-bar"
          style={{
            zIndex: 50,
            background: "rgba(6,10,16,0.9)",
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(127,191,176,0.07)",
            paddingTop: "env(safe-area-inset-top)",
          }}>
          <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={mascot} alt="Para Pets" className="w-6 h-6 object-contain opacity-80" />
              <span className="font-fantasy text-xs tracking-widest" style={{ color: "#2a5040", letterSpacing: "0.22em" }}>
                PARA PETS
              </span>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <span className="font-fantasy text-xs tracking-wide" style={{ color: "#7fbfb0" }}>
                  {user.username}
                </span>
              ) : (
                <button data-testid="button-hub-signin" onClick={() => setShowSignIn(true)}
                  className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                  style={{
                    color: "#7fbfb0", border: "1px solid rgba(127,191,176,0.25)",
                    borderRadius: 9999, padding: "7px 18px", background: "rgba(127,191,176,0.06)",
                  }}>
                  Sign In
                </button>
              )}
              <Link href={user ? "/pet-house" : "/auth"} data-testid="button-play-game"
                className="font-fantasy text-xs tracking-widest transition-all active:scale-95"
                style={{
                  color: "#060a10", borderRadius: 9999, padding: "8px 22px",
                  background: "linear-gradient(135deg,#7fbfb0 0%,#1a9b70 100%)",
                  boxShadow: "0 0 18px rgba(127,191,176,0.32), 0 2px 8px rgba(0,0,0,0.5)",
                  letterSpacing: "0.08em",
                }}>
                Play Game
              </Link>
            </div>
          </div>
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="relative w-full overflow-hidden" style={{ maxHeight: 400 }}>
          <img src={heroBanner} alt="Para Pets world" className="w-full object-cover"
            style={{ display: "block", maxHeight: 400, objectPosition: "center 30%",
              filter: "brightness(0.72) saturate(1.25)" }}
            data-testid="img-hub-hero" />
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom,rgba(6,10,16,0.5) 0%,transparent 20%,rgba(6,10,16,0.6) 70%,rgba(6,10,16,1) 100%)" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 px-5">
            <img src={mascot} alt="mascot" className="w-20 h-20 object-contain mb-3"
              style={{ filter: "drop-shadow(0 0 20px rgba(127,191,176,0.8)) drop-shadow(0 0 50px rgba(80,180,210,0.4))" }}
              data-testid="img-hub-mascot" />
            <h1 className="font-fantasy text-5xl tracking-widest text-center"
              style={{ color: "#fff", letterSpacing: "0.15em",
                textShadow: "0 0 40px rgba(127,191,176,0.65), 0 0 80px rgba(127,191,176,0.25), 0 4px 20px rgba(0,0,0,0.9)" }}
              data-testid="text-hub-title">
              Para Pets
            </h1>
            <p className="font-fantasy text-sm tracking-widest mt-2 text-center"
              style={{ color: "rgba(200,220,190,0.7)", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
              Hatch. Explore. Collect. Conquer.
            </p>
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="relative max-w-3xl mx-auto px-5 py-8 pb-28" data-testid="hub-main" style={{ zIndex: 1 }}>

          {/* Guest CTA */}
          {!user && (
            <div className="rounded-3xl p-6 mb-4 text-center"
              style={{
                background: "linear-gradient(135deg,rgba(10,20,16,0.9),rgba(6,14,10,0.9))",
                border: "1px solid rgba(127,191,176,0.15)",
                boxShadow: "0 0 40px rgba(34,211,238,0.04), inset 0 1px 0 rgba(127,191,176,0.07)",
              }}
              data-testid="hub-cta-section">
              <div className="flex items-center justify-center gap-4 mb-4">
                <img src={eggsImg} alt="Magical eggs" className="w-20 h-20 object-contain"
                  style={{ filter: "drop-shadow(0 0 14px rgba(127,191,176,0.4))" }} />
              </div>
              <p className="font-fantasy text-sm tracking-wide mb-1" style={{ color: "#7fbfb0" }}>
                Begin your adventure
              </p>
              <p className="font-fantasy text-[11px] mb-5" style={{ color: "#2a5040" }}>
                Hatch magical pets, explore enchanted worlds, and climb the leaderboard
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link href="/auth?mode=register" data-testid="link-create-account-cta"
                  className="font-fantasy text-xs tracking-widest rounded-2xl px-6 py-3 transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg,#7fbfb0 0%,#1a9b70 100%)", color: "#060a10",
                    boxShadow: "0 0 18px rgba(127,191,176,0.28)" }}>
                  Create Account
                </Link>
                <button data-testid="button-cta-signin" onClick={() => setShowSignIn(true)}
                  className="font-fantasy text-xs tracking-widest rounded-2xl px-6 py-3 transition-all active:scale-95"
                  style={{ border: "1px solid rgba(127,191,176,0.22)", color: "#7fbfb0", background: "rgba(127,191,176,0.05)" }}>
                  Sign In
                </button>
              </div>
            </div>
          )}

          {/* Feature pills */}
          <div className="grid grid-cols-3 gap-3 mb-2">
            {[
              { img: eggsImg,     label: "Hatch Pets",     desc: "Discover rare creatures" },
              { img: iconMap,     label: "Explore Worlds", desc: "Enchanted realms await" },
              { img: iconBadges,  label: "Earn Badges",    desc: "Climb the legend board" },
            ].map(f => (
              <div key={f.label} data-testid={`feature-card-${f.label.replace(" ", "-").toLowerCase()}`}
                className="rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center"
                style={{ background: "rgba(8,14,10,0.75)", border: "1px solid rgba(127,191,176,0.09)" }}>
                <img src={f.img} alt={f.label} className="w-10 h-10 object-contain"
                  style={{ filter: "drop-shadow(0 0 6px rgba(127,191,176,0.35))" }} />
                <p className="font-fantasy text-[11px] tracking-wide" style={{ color: "#7fbfb0" }}>{f.label}</p>
                <p className="font-fantasy text-[9px] leading-tight" style={{ color: "#2a4a38" }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <RuneDivider />

          {/* Worlds showcase */}
          <div className="mb-2">
            <h2 className="font-fantasy text-center text-sm tracking-widest mb-4"
              style={{ color: "#7fbfb0", textShadow: "0 0 12px rgba(127,191,176,0.3)" }}>
              Explore the Realm
            </h2>
            <div
              ref={worldsRef}
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              data-testid="worlds-showcase"
            >
              {WORLDS.map(w => (
                <div key={w.name} className="flex-shrink-0 relative rounded-2xl overflow-hidden"
                  style={{
                    width: 130, height: 90,
                    border: `1px solid ${w.color}44`,
                    boxShadow: `0 0 16px ${w.color}22`,
                  }}
                  data-testid={`world-card-${w.name.replace(" ", "-").toLowerCase()}`}>
                  <img src={w.img} alt={w.name} className="w-full h-full object-cover"
                    style={{ filter: "brightness(0.7) saturate(1.2)" }} />
                  <div className="absolute inset-0"
                    style={{ background: `linear-gradient(to top,rgba(4,8,6,0.9) 0%,transparent 55%)` }} />
                  <p className="absolute bottom-2 left-0 right-0 text-center font-fantasy text-[9px] tracking-wide px-1"
                    style={{ color: "#c8d8b0", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    {w.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <RuneDivider />

          {/* ── Leaderboard ─────────────────────────────────────────────────── */}
          <div data-testid="leaderboard-section">

            {/* Leaderboard banner header */}
            <div className="relative flex flex-col items-center justify-center mb-6 pt-2 pb-4">
              <img src={legendBanner} alt="" aria-hidden="true"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{ opacity: 0.55, filter: "drop-shadow(0 0 18px rgba(127,191,176,0.3))" }} />
              <div className="relative z-10 flex flex-col items-center gap-1 py-6">
                <h2 className="font-fantasy text-2xl tracking-widest"
                  style={{ color: "#ffd700", textShadow: "0 0 24px rgba(255,215,0,0.7), 0 2px 14px rgba(0,0,0,0.95)" }}
                  data-testid="text-leaderboard-title">
                  Hall of Legends
                </h2>
                <p className="font-fantasy text-[10px] tracking-widest" style={{ color: "rgba(200,190,140,0.6)" }}>
                  Ranked by total badge points earned
                </p>
              </div>
            </div>

            {lbLoading ? (
              <div className="flex flex-col gap-2" data-testid="leaderboard-loading">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse"
                    style={{ background: "rgba(127,191,176,0.04)", border: "1px solid rgba(127,191,176,0.07)" }} />
                ))}
              </div>

            ) : !leaderboard || leaderboard.length === 0 ? (
              <div data-testid="leaderboard-empty" className="text-center py-16 rounded-2xl"
                style={{ border: "1px dashed rgba(127,191,176,0.1)", background: "rgba(8,13,10,0.5)" }}>
                <p className="font-fantasy text-3xl mb-3" style={{ filter: "grayscale(0.3)" }}>🏅</p>
                <p className="font-fantasy text-sm tracking-wider" style={{ color: "#2a5040" }}>No legends yet</p>
                <p className="font-fantasy text-[10px] mt-1" style={{ color: "#1a3028" }}>
                  Earn badges with points to claim your place
                </p>
              </div>

            ) : (
              <>
                {/* Top 3 podium */}
                {top3.length > 0 && (
                  <div className="mb-6">
                    <TopThreePodium top3={top3} />
                  </div>
                )}

                {/* Ranks 4+ */}
                {rest.length > 0 && (
                  <div data-testid="leaderboard-list">
                    <div className="flex items-center gap-2 mb-3">
                      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,transparent,rgba(127,191,176,0.15))" }} />
                      <span className="font-fantasy text-[10px] tracking-widest" style={{ color: "#2a4a38" }}>
                        CHALLENGERS
                      </span>
                      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg,rgba(127,191,176,0.15),transparent)" }} />
                    </div>
                    {rest.map((entry, i) => (
                      <RankRow key={entry.userId} entry={entry} rank={i + 4} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {showSignIn && (
        <SignInModal onClose={() => setShowSignIn(false)} onSuccess={handleSignInSuccess} />
      )}
    </>
  );
}
