import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import swordImg from "@assets/generated_images/pvp_battle_sword.png";
import forestBgImg from "@assets/generated_images/pvp_ruins_battlefield_bg.png";
import RoleBadge from "@/components/RoleBadge";

export interface MatchmakingOpponent {
  userId: string;
  username: string;
  profileImage: string | null;
  petInventoryIds: string[];
  isAdmin?: boolean;
  isModerator?: boolean;
  // Server may provide either a BP total (leaderboard) or the group's
  // raw attack power (opponents endpoint). We use whichever is present
  // to gauge a "fair fight" without requiring a schema change.
  battlePoints?: number;
  attackPower?: number;
}

const strengthOf = (o: MatchmakingOpponent) =>
  Number(o.attackPower ?? o.battlePoints ?? 0) || 0;

interface Props {
  me: any;
  myBp: number;
  opponents: MatchmakingOpponent[];
  onCancel: () => void;
  onMatchConfirmed: (opp: MatchmakingOpponent) => void;
}

/**
 * PvpMatchmakingOverlay
 *
 * Full-screen overlay shown after a player taps BEGIN BATTLE. It runs a
 * cinematic "searching for a worthy opponent" animation (rune rings, radar
 * sweeps, crossed-sword emblem) while quietly picking the fairest rival
 * from the list of available opponents. Once a match is chosen it plays a
 * "MATCH FOUND" burst with both fighters' portraits, then hands control
 * back to the arena so the battle scene can mount.
 *
 * Fairness model: pick the opponent whose battle points are closest to the
 * player's own BP. This biases matchups toward competitive fights without
 * adding a server round-trip — opponents are already fetched by the arena.
 */
export default function PvpMatchmakingOverlay({
  me,
  myBp,
  opponents,
  onCancel,
  onMatchConfirmed,
}: Props) {
  type Phase = "searching" | "found" | "charging";
  const [phase, setPhase] = useState<Phase>("searching");
  const [matched, setMatched] = useState<MatchmakingOpponent | null>(null);
  // Rolling "candidate being considered" shown in the searching UI so the
  // player sees the matchmaker actually cycling through contenders.
  const [tickIdx, setTickIdx] = useState(0);

  // Candidates the matchmaker will consider: anyone other than the player
  // who has at least one pet ready to defend. If the list is empty we'll
  // still fall back to the full opponents list so the battle can start.
  const candidates = useMemo(() => {
    const pool = opponents.filter(
      (o) => o.userId !== me?.id && (o.petInventoryIds?.length ?? 0) > 0,
    );
    return pool.length > 0 ? pool : opponents.filter((o) => o.userId !== me?.id);
  }, [opponents, me?.id]);

  // Pick a *random* candidate from the pool so players see real variety
  // instead of always being matched against the same single opponent.
  // We previously chose the strictly "fairest" opponent (minimum |AP −
  // myBP|) which was deterministic — so a freshly-seeded player kept
  // landing on the lowest-tier bot every single match.
  //
  // The server-side matchmaking already restricts the pool to opponents
  // within a sane attack-power band (and always appends every bot), so
  // a uniform random pick here stays fair while making rerolls feel
  // alive. `myBp` is intentionally omitted from the dependency array —
  // we want one stable random pick per overlay mount, not a re-roll
  // mid-animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chosen = useMemo(() => {
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }, [candidates]);
  void myBp;

  // Rolling portrait cycle during the search phase.
  useEffect(() => {
    if (phase !== "searching" || candidates.length === 0) return;
    const t = window.setInterval(() => {
      setTickIdx((i) => (i + 1) % Math.max(1, candidates.length));
    }, 180);
    return () => window.clearInterval(t);
  }, [phase, candidates.length]);

  // Searching → found → charging → confirm. Timers are cleaned up if the
  // player cancels early (overlay unmounts).
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    const timers: number[] = [];
    // ~2.4s search (long enough to feel dramatic, short enough not to bore).
    timers.push(
      window.setTimeout(() => {
        if (cancelledRef.current) return;
        setMatched(chosen);
        setPhase("found");
      }, 2400),
    );
    // ~1.6s "match found" burst, then fade into the battle scene.
    timers.push(
      window.setTimeout(() => {
        if (cancelledRef.current) return;
        setPhase("charging");
      }, 2400 + 1600),
    );
    // ~0.6s charge/fade, then hand off to parent.
    timers.push(
      window.setTimeout(() => {
        if (cancelledRef.current) return;
        if (chosen) onMatchConfirmed(chosen);
        else onCancel();
      }, 2400 + 1600 + 600),
    );
    return () => {
      cancelledRef.current = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // We intentionally only run this once per mount — `chosen` is captured
    // from the initial candidate snapshot to avoid flicker mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Portrait shown in the rolling "searching..." slot.
  const spotlight = candidates[tickIdx % Math.max(1, candidates.length)] ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden"
      style={{ fontFamily: "Lora, serif" }}
      data-testid="pvp-matchmaking-overlay"
    >
      {/* Deep-forest backdrop so the arena aesthetic stays consistent. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${forestBgImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.35) saturate(1.1) blur(2px)",
        }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(20,8,40,0.55) 0%, rgba(2,4,10,0.92) 80%)" }} />

      {/* Inline keyframes — keeps this component self-contained so we
          don't have to plumb global CSS for a one-off screen. */}
      <style>{`
        @keyframes mmRingSpin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mmRingSpinR { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes mmPulse     { 0%,100% { transform: scale(1); opacity: 0.55; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes mmRadar     { 0% { transform: rotate(0deg); opacity: 0.85; } 100% { transform: rotate(360deg); opacity: 0.85; } }
        @keyframes mmFloat     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes mmFlashIn   { 0% { transform: scale(0.4); opacity: 0; } 55% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes mmSlideL    { 0% { transform: translateX(-120%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        @keyframes mmSlideR    { 0% { transform: translateX( 120%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        @keyframes mmShockwave { 0% { transform: scale(0.3); opacity: 0.8; } 100% { transform: scale(3.4); opacity: 0; } }
        @keyframes mmChargeOut { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }
        @keyframes mmSparkle   { 0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2); opacity: 0; } }
      `}</style>

      {/* Cancel — small so it doesn't steal focus from the animation. */}
      <button
        data-testid="button-cancel-matchmaking"
        onClick={onCancel}
        className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white active:scale-90"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}
      >
        <X size={18} />
      </button>

      {/* ─────────────── SEARCHING ─────────────── */}
      {phase === "searching" && (
        <div
          className="relative flex flex-col items-center"
          style={{ animation: phase !== "searching" ? "mmChargeOut 0.6s forwards" : undefined }}
        >
          <div
            className="text-[11px] tracking-[0.42em] font-black text-amber-200/90 mb-8"
            style={{ textShadow: "0 0 18px rgba(251,191,36,0.45)" }}
            data-testid="text-matchmaking-status"
          >
            SEARCHING THE ARENA…
          </div>

          {/* Stacked rune rings */}
          <div className="relative" style={{ width: 240, height: 240 }}>
            {/* Outer ring — slow clockwise, dashed */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px dashed rgba(251,191,36,0.55)",
                boxShadow: "0 0 28px rgba(251,191,36,0.35) inset, 0 0 22px rgba(251,191,36,0.2)",
                animation: "mmRingSpin 8s linear infinite",
              }}
            />
            {/* Middle ring — counter-clockwise, solid glowing */}
            <div
              className="absolute rounded-full"
              style={{
                inset: 24,
                border: "1px solid rgba(167,139,250,0.65)",
                boxShadow: "0 0 26px rgba(167,139,250,0.35) inset",
                animation: "mmRingSpinR 5s linear infinite",
              }}
            />
            {/* Inner ring — fast, purple */}
            <div
              className="absolute rounded-full"
              style={{
                inset: 54,
                border: "1px dashed rgba(236,72,153,0.55)",
                animation: "mmRingSpin 2.2s linear infinite",
              }}
            />
            {/* Radar sweep wedge */}
            <div
              className="absolute rounded-full"
              style={{
                inset: 24,
                background:
                  "conic-gradient(from 0deg, rgba(251,191,36,0.55) 0deg, rgba(251,191,36,0.02) 80deg, transparent 140deg)",
                animation: "mmRadar 1.6s linear infinite",
                maskImage: "radial-gradient(circle, transparent 40%, black 42%, black 100%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 40%, black 42%, black 100%)",
              }}
            />
            {/* Center emblem — crossed swords over a pulsing glow */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ animation: "mmPulse 1.6s ease-in-out infinite" }}
            >
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 108,
                  height: 108,
                  background: "radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(40,20,70,0.9) 70%)",
                  border: "1px solid rgba(251,191,36,0.5)",
                  boxShadow: "0 0 40px rgba(251,191,36,0.45)",
                }}
              >
                <img
                  src={swordImg}
                  alt=""
                  className="w-14 h-14 object-contain"
                  style={{ filter: "drop-shadow(0 0 12px rgba(251,191,36,0.8))", animation: "mmFloat 2s ease-in-out infinite" }}
                />
              </div>
            </div>
          </div>

          {/* Rolling contender strip — shows the matchmaker cycling through
              players. Purely cosmetic but sells the "searching" idea. */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-[1px] w-10" style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.4))" }} />
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                background: "rgba(20,10,40,0.8)",
                border: "1px solid rgba(167,139,250,0.3)",
                minWidth: 180,
              }}
            >
              {spotlight ? (
                <>
                  {spotlight.profileImage ? (
                    <img src={spotlight.profileImage} className="w-6 h-6 rounded-full object-cover border border-white/15" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-purple-900/40 border border-purple-400/15 flex items-center justify-center">
                      <img src={petPawIcon} alt="" style={{ width: 14, height: 14, opacity: 0.55 }} />
                    </div>
                  )}
                  <div className="text-white/85 text-[11px] font-semibold truncate flex-1">{spotlight.username}</div>
                  {strengthOf(spotlight) > 0 && (
                    <div className="text-amber-300 text-[10px] tabular-nums font-black">
                      {strengthOf(spotlight)} {spotlight.attackPower != null ? "AP" : "BP"}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-white/40 text-[11px]">scanning the arena…</div>
              )}
            </div>
            <div className="h-[1px] w-10" style={{ background: "linear-gradient(90deg, rgba(251,191,36,0.4), transparent)" }} />
          </div>

          <div className="mt-2 text-[10px] tracking-[0.24em] text-white/40">
            finding a fair fight
          </div>
        </div>
      )}

      {/* ─────────────── MATCH FOUND ─────────────── */}
      {(phase === "found" || phase === "charging") && matched && (
        <div
          className="relative flex flex-col items-center"
          style={{
            animation:
              phase === "charging"
                ? "mmChargeOut 0.55s ease-in forwards"
                : "mmFlashIn 0.55s cubic-bezier(0.2,0.9,0.25,1) forwards",
          }}
          data-testid="pvp-match-found"
        >
          {/* Expanding shockwave ring radiating from the VS emblem. */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 280,
              height: 280,
              border: "2px solid rgba(251,191,36,0.8)",
              animation: "mmShockwave 1.3s ease-out forwards",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 280,
              height: 280,
              border: "2px solid rgba(236,72,153,0.75)",
              animation: "mmShockwave 1.3s ease-out 0.2s forwards",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />

          <div
            className="text-[11px] tracking-[0.46em] font-black text-amber-200 mb-6"
            style={{ textShadow: "0 0 18px rgba(251,191,36,0.6)" }}
          >
            MATCH FOUND
          </div>

          {/* Two portraits + VS medallion */}
          <div className="relative flex items-center justify-center gap-5">
            <PortraitCard
              side="left"
              name={me?.username ?? "You"}
              profileImage={me?.profileImage ?? null}
              bp={myBp}
              bpLabel="BP"
              accent="rgba(56,189,248,0.6)"
              isAdmin={!!me?.isAdmin}
              isModerator={!!me?.isModerator}
            />
            <div
              className="relative flex items-center justify-center"
              style={{
                width: 78,
                height: 78,
                borderRadius: "50%",
                background: "radial-gradient(circle, #fbbf24 0%, #7c1d15 85%)",
                boxShadow: "0 0 32px rgba(251,191,36,0.65), inset 0 0 18px rgba(0,0,0,0.55)",
                border: "2px solid rgba(251,191,36,0.7)",
                animation: "mmPulse 0.9s ease-in-out infinite",
              }}
            >
              <span
                className="text-white font-black text-2xl"
                style={{ fontFamily: "system-ui, sans-serif", textShadow: "0 2px 6px rgba(0,0,0,0.7), 0 0 12px rgba(251,191,36,0.6)" }}
              >
                VS
              </span>
            </div>
            <PortraitCard
              side="right"
              name={matched.username}
              profileImage={matched.profileImage}
              bp={strengthOf(matched)}
              bpLabel={matched.attackPower != null ? "AP" : "BP"}
              accent="rgba(239,68,68,0.6)"
              isAdmin={!!matched.isAdmin}
              isModerator={!!matched.isModerator}
            />
          </div>

          <div className="mt-6 text-[10px] tracking-[0.28em] text-white/55">
            preparing the battlefield…
          </div>
        </div>
      )}

      {/* ─────────────── CHARGING / FADE TO BATTLE ───────────────
          A white radial flash overlaying the scene so the transition
          into PvpBattlePage feels like the arena portal opening. */}
      {phase === "charging" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.7) 0%, rgba(236,72,153,0.35) 40%, rgba(0,0,0,0) 75%)",
            animation: "mmFlashIn 0.55s ease-out forwards",
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

/**
 * Small portrait card used inside the "MATCH FOUND" reveal. Keeps the
 * markup in the main component tidy and gives us a consistent frame for
 * both combatants.
 */
function PortraitCard({
  side,
  name,
  profileImage,
  bp,
  bpLabel = "BP",
  accent,
  isAdmin,
  isModerator,
}: {
  side: "left" | "right";
  name: string;
  profileImage: string | null;
  bp: number;
  bpLabel?: string;
  accent: string;
  isAdmin?: boolean;
  isModerator?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center"
      style={{
        animation: side === "left" ? "mmSlideL 0.55s ease-out forwards" : "mmSlideR 0.55s ease-out forwards",
      }}
    >
      <div
        className="rounded-full overflow-hidden flex items-center justify-center"
        style={{
          width: 112,
          height: 112,
          background: "rgba(20,10,40,0.9)",
          border: `2px solid ${accent}`,
          boxShadow: `0 0 28px ${accent}, inset 0 0 12px rgba(0,0,0,0.5)`,
        }}
      >
        {profileImage ? (
          <img src={profileImage} className="w-full h-full object-cover" />
        ) : (
          <img src={petPawIcon} alt="" style={{ width: 52, height: 52, opacity: 0.55 }} />
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 max-w-[130px]">
        <div className="text-white text-[12px] font-bold truncate">{name}</div>
        <RoleBadge isAdmin={isAdmin} isModerator={isModerator} />
      </div>
      <div className="text-amber-300 text-[10px] font-black tracking-wider tabular-nums">
        {Math.max(0, bp)} BP
      </div>
    </div>
  );
}
