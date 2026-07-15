import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import raidBg from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";
import raidCloseImg from "@assets/Photoroom_20260711_90748_PM_1783822223263.png";
import pvpLeaderboardBg from "@assets/Photoroom_20260707_64358_AM_1783425094349.png";
import rank1Icon from "@assets/Photoroom_20260707_64701_AM_1783425136780.png";
import rank2Icon from "@assets/Photoroom_20260707_64734_AM_1783425136780.png";
import rank3Icon from "@assets/Photoroom_20260707_64923_AM_1783425136780.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";

interface RaidLeaderboardEntry {
  userId: number;
  username: string;
  profileImage: string | null;
  totalDamage: number;
}

interface RaidLeaderboardResponse {
  top: RaidLeaderboardEntry[];
}

const TIERS = [
  { label: "TOP 3",             from: 1,    to: 3,     accent: "#f0c040", glow: "rgba(240,192,40,0.6)" },
  { label: "RANK 4 – 10",       from: 4,    to: 10,    accent: "#d4943a", glow: "rgba(212,148,58,0.5)" },
  { label: "RANK 11 – 50",      from: 11,   to: 50,    accent: "#c07830", glow: "rgba(192,120,48,0.45)" },
  { label: "RANK 51 – 100",     from: 51,   to: 100,   accent: "#a86028", glow: "rgba(168,96,40,0.4)" },
  { label: "RANK 101 – 500",    from: 101,  to: 500,   accent: "#904820", glow: "rgba(144,72,32,0.35)" },
  { label: "RANK 501 – 1,000",  from: 501,  to: 1000,  accent: "#783818", glow: "rgba(120,56,24,0.3)" },
  { label: "RANK 1,001 – 10,000", from: 1001, to: 10000, accent: "#5a2812", glow: "rgba(90,40,18,0.28)" },
];

function GoldDivider({ accent, glow, label }: { accent: string; glow: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, margin: "6px 0 2px" }}>
      <div style={{
        width: "100%", height: 1,
        background: `linear-gradient(90deg, transparent, ${glow} 25%, ${accent} 50%, ${glow} 75%, transparent)`,
      }} />
      <span style={{
        fontFamily: "Lora, serif",
        fontSize: 9,
        letterSpacing: "0.22em",
        fontWeight: "bold",
        color: accent,
        textShadow: `0 0 8px ${glow}`,
        paddingBottom: 2,
      }}>
        {label}
      </span>
    </div>
  );
}

function PlayerRow({ entry, rank, isLast }: { entry: RaidLeaderboardEntry; rank: number; isLast: boolean }) {
  return (
    <div
      data-testid={`row-raid-leaderboard-${rank}`}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 6px",
        borderRadius: 6,
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Rank / trophy icon */}
      <div style={{ width: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {rank === 1 ? (
          <img src={rank1Icon} alt="1st" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
        ) : rank === 2 ? (
          <img src={rank2Icon} alt="2nd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
        ) : rank === 3 ? (
          <img src={rank3Icon} alt="3rd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
        ) : (
          <span style={{ fontSize: 10, fontWeight: "bold", color: "rgba(255,255,255,0.45)", fontFamily: "Lora, serif", tabularNums: true } as any}>{rank}</span>
        )}
      </div>

      {/* Avatar */}
      {entry.profileImage ? (
        <img
          src={entry.profileImage}
          style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(80,20,10,0.5)", border: "1px solid rgba(220,60,20,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={petPawIcon} alt="" style={{ width: 14, height: 14, objectFit: "contain", opacity: 0.45 }} />
        </div>
      )}

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)", fontFamily: "Lora, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.username}
      </div>

      {/* Damage */}
      <div style={{ flexShrink: 0, fontSize: 12, fontWeight: "900", color: "#fca5a5", fontFamily: "Lora, serif", textAlign: "right", minWidth: 54 }}>
        {entry.totalDamage.toLocaleString()}
      </div>
    </div>
  );
}

export default function RaidLeaderboardPage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<RaidLeaderboardResponse>({
    queryKey: ["/api/raid/leaderboard"],
    staleTime: 0,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });

  const entries = data?.top ?? [];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#08040c",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Background */}
      <img src={raidBg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,8,0.58)", pointerEvents: "none" }} />

      {/* Close button */}
      <button
        data-testid="button-close-raid-leaderboard"
        onClick={() => navigate("/raid")}
        style={{ position: "absolute", top: 60, right: 14, background: "none", border: "none", padding: 0, cursor: "pointer", zIndex: 10, width: 40, height: 40 }}
      >
        <img src={raidCloseImg} alt="Close" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }} draggable={false} />
      </button>

      {/* Scrollable content */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 60,
          paddingBottom: 32,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {/* Frame image — title banner only */}
        <div style={{ width: "100%", maxWidth: 360, flexShrink: 0, overflow: "hidden", height: 120 }}>
          <img
            src={pvpLeaderboardBg}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />
        </div>

        {/* List body with column headers at the top */}
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            background: "rgba(6,3,12,0.82)",
            border: "1px solid rgba(240,192,40,0.14)",
            borderTop: "none",
            borderRadius: "0 0 16px 16px",
            padding: "0 8px 12px",
          }}
        >
          {/* Column headers */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 2 }}>
            <div style={{ width: 22, flexShrink: 0 }} />
            <div style={{ width: 26, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 8, letterSpacing: "0.22em", fontWeight: "bold", color: "rgba(255,255,255,0.45)", fontFamily: "Lora, serif" }}>
              PLAYER
            </div>
            <div style={{ flexShrink: 0, minWidth: 54, textAlign: "right", fontSize: 8, letterSpacing: "0.16em", fontWeight: "bold", color: "rgba(240,100,40,0.85)", fontFamily: "Lora, serif" }}>
              DAMAGE
            </div>
          </div>
          {isLoading ? (
            <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "28px 0" }}>
              Loading…
            </div>
          ) : entries.length === 0 ? (
            <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "28px 0" }} data-testid="text-raid-leaderboard-empty">
              No raid data yet
            </div>
          ) : (
            <>
              {TIERS.map((tier) => {
                const tierEntries = entries.filter((_, i) => {
                  const rank = i + 1;
                  return rank >= tier.from && rank <= tier.to;
                });
                if (tierEntries.length === 0) return null;
                return (
                  <div key={tier.label}>
                    <GoldDivider accent={tier.accent} glow={tier.glow} label={tier.label} />
                    {tierEntries.map((entry, j) => {
                      const rank = entries.indexOf(entry) + 1;
                      const isLastInTier = j === tierEntries.length - 1;
                      return (
                        <PlayerRow key={entry.userId} entry={entry} rank={rank} isLast={isLastInTier} />
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
