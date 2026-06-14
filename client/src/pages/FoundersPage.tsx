import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Plus, X, Pencil, Heart } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import foundersBg from "@assets/generated_images/founders_bg.png";
import mascot from "@assets/Photoroom_20260502_90936_AM_1777731667331.png";

interface Founder {
  id: string;
  name: string;
  addedBy: string | null;
  tier: string | null;
  createdAt: string;
}

interface MeUser {
  id: string;
  username: string;
  isAdmin?: boolean;
}

const TIER_CONFIG = {
  bronze: {
    label: "Bronze",
    gradient: "linear-gradient(135deg, #cd7f32 0%, #a0522d 100%)",
    glow: "rgba(205,127,50,0.50)",
    nameGrad: "linear-gradient(180deg, #f5cfa0 0%, #cd7f32 50%, #8b4513 100%)",
  },
  silver: {
    label: "Silver",
    gradient: "linear-gradient(135deg, #e8e8e8 0%, #9e9e9e 100%)",
    glow: "rgba(200,200,200,0.50)",
    nameGrad: "linear-gradient(180deg, #ffffff 0%, #c0c0c0 50%, #808080 100%)",
  },
  gold: {
    label: "Gold",
    gradient: "linear-gradient(135deg, #f6dc8a 0%, #c8a93a 100%)",
    glow: "rgba(232,200,88,0.55)",
    nameGrad: "linear-gradient(180deg, #fff4c8 0%, #f0d278 50%, #c8a030 100%)",
  },
  legendary: {
    label: "Legendary",
    gradient: "linear-gradient(135deg, #f6dc8a 0%, #d946ef 50%, #c8a93a 100%)",
    glow: "rgba(217,70,239,0.65)",
    nameGrad: "linear-gradient(90deg, #f6dc8a 0%, #f0a0ff 40%, #f6dc8a 70%, #e879f9 100%)",
  },
};

const sparkleStyle = `
@keyframes orb-pulse {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.85; filter: drop-shadow(0 0 5px rgba(217,70,239,0.8)); }
  33%       { transform: scale(1.25) rotate(120deg); opacity: 1;    filter: drop-shadow(0 0 10px rgba(217,70,239,1)); }
  66%       { transform: scale(0.9)  rotate(240deg); opacity: 0.75; filter: drop-shadow(0 0 4px rgba(246,220,138,0.9)); }
}
@keyframes legendary-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

export default function FoundersPage() {
  const { toast } = useToast();

  const { data: user } = useQuery<MeUser | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 60_000,
  });

  const { data: founders = [], isLoading } = useQuery<Founder[]>({
    queryKey: ["/api/founders"],
    staleTime: 30_000,
  });

  const isAdmin = !!user?.isAdmin;

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [editTarget, setEditTarget] = useState<Founder | null>(null);

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/founders", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/founders"] });
      setNewName("");
      setShowAdd(false);
      toast({ title: "Founder added", description: "Their name now graces the wall." });
    },
    onError: (err: any) => {
      toast({ title: "Could not add", description: err?.message ?? "Try again", variant: "destructive" });
    },
  });

  const tierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: string | null }) => {
      const res = await apiRequest("PATCH", `/api/founders/${id}`, { tier });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/founders"] });
      setEditTarget(null);
      toast({ title: "Tier updated" });
    },
    onError: (err: any) => {
      toast({ title: "Could not update", description: err?.message ?? "Try again", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/founders/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/founders"] });
      setEditTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Could not remove", description: err?.message ?? "Try again", variant: "destructive" });
    },
  });

  useEffect(() => {
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowAdd(false); setEditTarget(null); }
    };
    window.addEventListener("keydown", closeOnEsc);
    return () => window.removeEventListener("keydown", closeOnEsc);
  }, []);

  const OUTLINE = "-1px -1px 0 rgba(0,0,0,0.95), 1px -1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), 0 2px 4px rgba(0,0,0,0.8)";

  const getNameStyle = (tier: string | null): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontFamily: "'Merriweather', serif",
      fontWeight: 500,
      lineHeight: 1.4,
    };
    if (tier === "legendary") {
      return {
        ...base,
        fontSize: 22,
        backgroundImage: "linear-gradient(90deg, #f6dc8a 0%, #f0a0ff 40%, #f6dc8a 70%, #e879f9 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        animation: "legendary-shimmer 3s linear infinite",
        filter: "drop-shadow(0 1px 4px rgba(217,70,239,0.6))",
      };
    }
    if (tier === "gold")   return { ...base, fontSize: 22, color: "#f0d060", textShadow: OUTLINE };
    if (tier === "silver") return { ...base, fontSize: 21, color: "#c8c8c8", textShadow: OUTLINE };
    if (tier === "bronze") return { ...base, fontSize: 20, color: "#d4904a", textShadow: OUTLINE };
    return { ...base, fontSize: 20, color: "#f0d060", textShadow: OUTLINE };
  };

  const TIER_ORDER: Record<string, number> = { legendary: 0, gold: 1, silver: 2, bronze: 3 };
  const sortedFounders = [...founders].sort((a, b) => {
    const ao = TIER_ORDER[a.tier ?? ""] ?? 4;
    const bo = TIER_ORDER[b.tier ?? ""] ?? 4;
    return ao - bo;
  });

  return (
    <div
      className="relative w-full"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        overflowX: "clip",
        WebkitOverflowScrolling: "touch",
        backgroundColor: "#06120a",
        color: "#e8d97a",
      }}
      data-testid="founders-page"
    >
      <style>{sparkleStyle}</style>
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${foundersBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          opacity: 0.85,
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom," +
            "rgba(4,10,6,0.92) 0%," +
            "rgba(4,10,6,0.55) 18%," +
            "rgba(4,10,6,0.35) 45%," +
            "rgba(4,10,6,0.78) 80%," +
            "rgba(4,10,6,0.96) 100%)",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 22%, rgba(232,200,88,0.18) 0%, transparent 65%)",
        }}
      />

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 w-full"
        style={{
          background: "rgba(4,10,6,0.78)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(232,200,88,0.14)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-2xl mx-auto h-14 px-4 flex items-center justify-between">
          <Link
            href="/hub"
            data-testid="link-back-to-hub"
            className="flex items-center gap-1.5 font-fantasy text-xs tracking-widest transition-all active:scale-95"
            style={{ color: "#c8a93a" }}
          >
            <ChevronLeft size={16} />
            <span>Hub</span>
          </Link>

          <div className="flex items-center gap-2">
            <img src={mascot} alt="" className="w-5 h-5 object-contain opacity-80" />
            <span className="font-fantasy text-[11px] tracking-widest" style={{ color: "#c8a93a", letterSpacing: "0.18em" }}>
              FOUNDERS
            </span>
          </div>

          {isAdmin ? (
            <button
              data-testid="button-add-founder"
              onClick={() => setShowAdd(true)}
              aria-label="Add founder"
              className="flex items-center justify-center rounded-full transition-all active:scale-90"
              style={{
                width: 32, height: 32,
                background: "rgba(232,200,88,0.10)",
                border: "1px solid rgba(232,200,88,0.40)",
                color: "#e8c858",
                boxShadow: "0 0 12px rgba(232,200,88,0.18)",
              }}
            >
              <Plus size={18} />
            </button>
          ) : (
            <div style={{ width: 32 }} />
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="relative max-w-2xl mx-auto px-5 pt-8 pb-24" style={{ zIndex: 1 }}>
        <div className="flex justify-center mb-5">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64, height: 64,
              background: "radial-gradient(circle at 30% 25%, #f6dc8a 0%, #c8a93a 45%, #6e561a 100%)",
              boxShadow:
                "0 0 30px rgba(232,200,88,0.45), 0 0 60px rgba(127,191,176,0.18), inset 0 -2px 6px rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,235,160,0.55)",
            }}
            data-testid="founders-medallion"
          >
            <Heart size={28} fill="#3a2a08" stroke="#3a2a08" strokeWidth={1.5} />
          </div>
        </div>

        <h1
          className="font-fantasy text-center tracking-widest"
          style={{
            fontSize: 32,
            color: "#f0d770",
            letterSpacing: "0.16em",
            textShadow: "0 0 22px rgba(232,200,88,0.55), 0 4px 18px rgba(0,0,0,0.85)",
            marginBottom: 8,
          }}
          data-testid="text-founders-title"
        >
          Our Founders
        </h1>

        <p
          className="font-fantasy text-center mx-auto"
          style={{
            color: "#a9b495",
            fontSize: 12,
            letterSpacing: "0.18em",
            maxWidth: 380,
            marginBottom: 28,
          }}
        >
          The hands that lit the lanterns
        </p>

        <div
          className="rounded-3xl mx-auto px-6 py-6 mb-10 text-center"
          style={{
            maxWidth: 540,
            background: "linear-gradient(160deg, rgba(10,18,12,0.82) 0%, rgba(20,28,14,0.78) 100%)",
            border: "1px solid rgba(232,200,88,0.22)",
            boxShadow:
              "0 0 40px rgba(232,200,88,0.10), inset 0 1px 0 rgba(232,200,88,0.10), 0 12px 30px rgba(0,0,0,0.55)",
          }}
          data-testid="founders-message"
        >
          <p
            className="font-fantasy"
            style={{
              color: "#efe3a5",
              fontSize: 15,
              lineHeight: 1.7,
              letterSpacing: "0.02em",
              textShadow: "0 1px 6px rgba(0,0,0,0.7)",
            }}
          >
            From the bottom of our hearts —
            <br />
            <span style={{ color: "#f6dc8a", fontStyle: "italic" }}>thank you</span>.
          </p>
          <p
            className="font-fantasy mt-4"
            style={{
              color: "#cbd6b4",
              fontSize: 13,
              lineHeight: 1.75,
              letterSpacing: "0.015em",
            }}
          >
            Every name on this page belongs to someone who believed in the artist
            behind Para Pets and helped this little world come to life. Your
            kindness paid for the lanterns in the trees, the songs in the wind,
            and the very first heartbeat of every pet that has hatched here.
            Because of you, others get to play, dream, and explore — for free.
          </p>
          <p
            className="font-fantasy mt-4"
            style={{
              color: "#e8d97a",
              fontSize: 13,
              lineHeight: 1.75,
              fontStyle: "italic",
            }}
          >
            You are seen. You are loved. You will always be a part of this story.
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <span style={{ height: 1, width: 30, background: "rgba(232,200,88,0.35)" }} />
            <span style={{ color: "#c8a93a", fontSize: 14 }}>✦</span>
            <span style={{ height: 1, width: 30, background: "rgba(232,200,88,0.35)" }} />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5 max-w-md mx-auto">
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(232,200,88,0.35))" }} />
          <span
            className="font-fantasy text-[10px] tracking-widest"
            style={{ color: "#c8a93a", letterSpacing: "0.28em" }}
          >
            THE LANTERN BEARERS
          </span>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(232,200,88,0.35), transparent)" }} />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 max-w-md mx-auto" data-testid="founders-loading">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-12 rounded-2xl animate-pulse"
                style={{ background: "rgba(232,200,88,0.05)", border: "1px solid rgba(232,200,88,0.10)" }}
              />
            ))}
          </div>
        ) : founders.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl mx-auto"
            style={{
              maxWidth: 380,
              border: "1px dashed rgba(232,200,88,0.18)",
              background: "rgba(8,14,10,0.55)",
            }}
            data-testid="founders-empty"
          >
            <p className="font-fantasy" style={{ color: "#9ba385", fontSize: 13 }}>
              The first names will appear here soon.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto text-center leading-relaxed" style={{ wordSpacing: 4 }} data-testid="founders-list">
            {sortedFounders.map((f, idx) => (
              <span key={f.id} style={{ display: "inline-flex", alignItems: "center" }}>
                {idx > 0 && (
                  <span style={{ color: "#1a0e00", fontSize: 13, margin: "0 8px", userSelect: "none", fontWeight: 900 }}>★</span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} data-testid={`founder-row-${f.id}`}>
                  <span
                    data-testid={`text-founder-name-${f.id}`}
                    style={getNameStyle(f.tier)}
                  >
                    {f.name}
                  </span>
                  {f.tier === "legendary" && (
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        fontSize: 14,
                        animation: "orb-pulse 2.4s ease-in-out infinite",
                        marginLeft: 3,
                        flexShrink: 0,
                      }}
                    >✨</span>
                  )}
                  {isAdmin && (
                    <button
                      data-testid={`button-edit-founder-${f.id}`}
                      onClick={() => setEditTarget(f)}
                      aria-label={`Edit ${f.name}`}
                      className="rounded-full p-1 transition-all active:scale-90 flex-shrink-0"
                      style={{
                        color: "#c8a93a",
                        background: "rgba(200,169,58,0.08)",
                        border: "1px solid rgba(200,169,58,0.22)",
                      }}
                    >
                      <Pencil size={10} />
                    </button>
                  )}
                </span>
              </span>
            ))}
          </div>
        )}

        <p
          className="font-fantasy text-center mt-12"
          style={{ color: "rgba(232,200,88,0.45)", fontSize: 11, letterSpacing: "0.2em" }}
        >
          ✦ With love, from everyone at Para Pets ✦
        </p>
      </main>

      {/* ── Add founder modal ────────────────────────────────────────────────── */}
      {showAdd && isAdmin && (
        <div
          className="fixed inset-0 flex items-center justify-center px-5"
          style={{ zIndex: 99999, background: "rgba(4,10,6,0.85)", backdropFilter: "blur(10px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
          data-testid="add-founder-modal-backdrop"
        >
          <div
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(12,20,12,0.97) 0%, rgba(8,14,8,0.97) 100%)",
              border: "1px solid rgba(232,200,88,0.30)",
              boxShadow: "0 0 50px rgba(232,200,88,0.15), 0 24px 60px rgba(0,0,0,0.75)",
            }}
            data-testid="add-founder-modal"
          >
            <div
              className="relative flex flex-col items-center pt-6 pb-4 px-6"
              style={{ borderBottom: "1px solid rgba(232,200,88,0.10)" }}
            >
              <h2
                className="font-fantasy text-base tracking-widest"
                style={{ color: "#e8c858", textShadow: "0 0 16px rgba(232,200,88,0.4)" }}
              >
                Add a Founder
              </h2>
              <p className="font-fantasy text-[10px] tracking-widest mt-1" style={{ color: "#7a6a30" }}>
                Their name will appear on the wall
              </p>
              <button
                data-testid="button-close-add-founder"
                onClick={() => setShowAdd(false)}
                className="absolute top-4 right-4 rounded-full p-1.5"
                style={{ background: "rgba(232,200,88,0.10)", color: "#7a6a30" }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: "#7a6a30" }}>
                  Name
                </label>
                <input
                  data-testid="input-founder-name"
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Founder's name"
                  maxLength={120}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background: "rgba(232,200,88,0.06)",
                    border: "1px solid rgba(232,200,88,0.22)",
                    color: "#efe3a5",
                    fontFamily: "inherit",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newName.trim()) addMutation.mutate(newName.trim());
                  }}
                />
              </div>
              <button
                data-testid="button-confirm-add-founder"
                disabled={!newName.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate(newName.trim())}
                className="font-fantasy text-xs tracking-widest rounded-2xl px-5 py-3 transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #f6dc8a 0%, #c8a93a 100%)",
                  color: "#3a2a08",
                  boxShadow: "0 0 18px rgba(232,200,88,0.30)",
                }}
              >
                {addMutation.isPending ? "Adding…" : "Add to Wall"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit founder modal ───────────────────────────────────────────────── */}
      {editTarget && isAdmin && (
        <div
          className="fixed inset-0 flex items-center justify-center px-5"
          style={{ zIndex: 99999, background: "rgba(4,10,6,0.85)", backdropFilter: "blur(10px)" }}
          onClick={e => { if (e.target === e.currentTarget) setEditTarget(null); }}
          data-testid="edit-founder-modal-backdrop"
        >
          <div
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(12,20,12,0.97) 0%, rgba(8,14,8,0.97) 100%)",
              border: "1px solid rgba(232,200,88,0.30)",
              boxShadow: "0 0 50px rgba(232,200,88,0.15), 0 24px 60px rgba(0,0,0,0.75)",
            }}
            data-testid="edit-founder-modal"
          >
            <div
              className="relative flex flex-col items-center pt-6 pb-4 px-6"
              style={{ borderBottom: "1px solid rgba(232,200,88,0.10)" }}
            >
              <h2
                className="font-fantasy text-base tracking-widest"
                style={{ color: "#e8c858", textShadow: "0 0 16px rgba(232,200,88,0.4)" }}
              >
                {editTarget.name}
              </h2>
              <p className="font-fantasy text-[10px] tracking-widest mt-1" style={{ color: "#7a6a30" }}>
                Set tier or remove from wall
              </p>
              <button
                data-testid="button-close-edit-founder"
                onClick={() => setEditTarget(null)}
                className="absolute top-4 right-4 rounded-full p-1.5"
                style={{ background: "rgba(232,200,88,0.10)", color: "#7a6a30" }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-3">
              <p className="font-fantasy text-[10px] tracking-widest uppercase text-center" style={{ color: "#7a6a30" }}>
                Tier
              </p>

              {/* Tier buttons */}
              <div className="grid grid-cols-3 gap-2">
                {(["bronze", "silver", "gold"] as const).map(tier => {
                  const cfg = TIER_CONFIG[tier];
                  const isActive = editTarget.tier === tier;
                  return (
                    <button
                      key={tier}
                      data-testid={`button-tier-${tier}`}
                      disabled={tierMutation.isPending}
                      onClick={() => tierMutation.mutate({ id: editTarget.id, tier })}
                      className="rounded-xl py-3 font-fantasy text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        background: isActive ? cfg.gradient : "rgba(232,200,88,0.06)",
                        border: isActive
                          ? `1px solid ${cfg.glow.replace("0.50", "0.80").replace("0.55", "0.80")}`
                          : "1px solid rgba(232,200,88,0.18)",
                        color: isActive ? (tier === "silver" ? "#3a3a3a" : "#3a2a08") : "#c8a93a",
                        boxShadow: isActive ? `0 0 14px ${cfg.glow}` : "none",
                        fontWeight: isActive ? 700 : 400,
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Clear tier */}
              {editTarget.tier && (
                <button
                  data-testid="button-tier-clear"
                  disabled={tierMutation.isPending}
                  onClick={() => tierMutation.mutate({ id: editTarget.id, tier: null })}
                  className="font-fantasy text-[10px] tracking-widest rounded-xl py-2 transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    background: "rgba(232,200,88,0.04)",
                    border: "1px dashed rgba(232,200,88,0.18)",
                    color: "#7a6a30",
                  }}
                >
                  Clear tier
                </button>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(232,200,88,0.10)", margin: "4px 0" }} />

              {/* Delete */}
              <button
                data-testid={`button-delete-founder-${editTarget.id}`}
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm(`Remove "${editTarget.name}" from the founders wall?`)) {
                    deleteMutation.mutate(editTarget.id);
                  }
                }}
                className="font-fantasy text-xs tracking-widest rounded-2xl py-3 transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: "rgba(160,60,60,0.10)",
                  border: "1px solid rgba(160,60,60,0.30)",
                  color: "#c07070",
                }}
              >
                {deleteMutation.isPending ? "Removing…" : "Remove from Wall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
