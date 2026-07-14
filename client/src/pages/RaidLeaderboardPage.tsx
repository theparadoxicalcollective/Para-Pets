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
  displayName: string | null;
  profileImage: string | null;
  totalDamage: number;
}

interface RaidLeaderboardResponse {
  top: RaidLeaderboardEntry[];
}

export default function RaidLeaderboardPage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<RaidLeaderboardResponse>({
    queryKey: ["/api/raid/leaderboard"],
    staleTime: 30 * 1000,
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
      <img
        src={raidBg}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,8,0.58)", pointerEvents: "none" }} />

      {/* Close button */}
      <button
        data-testid="button-close-raid-leaderboard"
        onClick={() => navigate("/raid")}
        style={{
          position: "absolute",
          top: 60,
          right: 14,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 10,
          width: 40,
          height: 40,
        }}
      >
        <img
          src={raidCloseImg}
          alt="Close"
          style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }}
          draggable={false}
        />
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
          paddingTop: 64,
          paddingBottom: 32,
          paddingLeft: 16,
          paddingRight: 16,
          gap: 0,
        }}
      >
        {/* Leaderboard frame */}
        <div style={{ width: "100%", maxWidth: 360, position: "relative" }}>
          <img
            src={pvpLeaderboardBg}
            alt=""
            style={{ width: "100%", height: "auto", display: "block", userSelect: "none", pointerEvents: "none" }}
            draggable={false}
          />
          {/* Content over the frame */}
          <div
            style={{
              position: "absolute",
              top: "17%",
              left: "8%",
              right: "8%",
              bottom: "8%",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {isLoading ? (
              <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }}>
                Loading…
              </div>
            ) : entries.length === 0 ? (
              <div style={{ fontFamily: "Lora, serif", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }} data-testid="text-raid-leaderboard-empty">
                No raid data yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Column headers */}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "0 8px 4px",
                    marginBottom: 2,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ width: 24, flexShrink: 0 }} />
                  <div style={{ width: 28, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 8, letterSpacing: "0.22em", fontWeight: "bold", color: "rgba(255,255,255,0.4)", fontFamily: "Lora, serif" }}>
                    PLAYER
                  </div>
                  <div style={{ width: 60, textAlign: "right", fontSize: 8, letterSpacing: "0.16em", fontWeight: "bold", color: "rgba(240,100,40,0.8)", fontFamily: "Lora, serif" }}>
                    DMG
                  </div>
                </div>

                {entries.map((entry, i) => {
                  const rank = i + 1;
                  const isLast = i === entries.length - 1;
                  return (
                    <div
                      key={entry.userId}
                      data-testid={`row-raid-leaderboard-${rank}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "6px 8px",
                        borderRadius: 6,
                        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Rank / trophy */}
                      <div style={{ width: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {rank === 1 ? (
                          <img src={rank1Icon} alt="1st" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : rank === 2 ? (
                          <img src={rank2Icon} alt="2nd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : rank === 3 ? (
                          <img src={rank3Icon} alt="3rd" style={{ width: 22, height: 22, objectFit: "contain" }} draggable={false} />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: "bold", color: "rgba(255,255,255,0.55)", fontFamily: "Lora, serif" }}>{rank}</span>
                        )}
                      </div>

                      {/* Avatar */}
                      {entry.profileImage ? (
                        <img src={entry.profileImage} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(80,20,10,0.5)", border: "1px solid rgba(220,60,20,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={petPawIcon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.5 }} />
                        </div>
                      )}

                      {/* Username */}
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "Lora, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.displayName || entry.username}
                      </div>

                      {/* Damage */}
                      <div style={{ width: 60, textAlign: "right", fontSize: 12, fontWeight: "900", color: "#fca5a5", fontFamily: "Lora, serif" }}>
                        {entry.totalDamage.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
