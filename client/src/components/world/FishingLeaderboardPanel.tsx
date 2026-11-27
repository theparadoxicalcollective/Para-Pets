import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import leaderboardIcon from "@assets/Photoroom_20260623_111411_AM_1782231282456.png";
import PlayerAvatarButton from "@/components/PlayerAvatarButton";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";
import { getFishingWorldTheme } from "@/lib/fishingWorldTheme";

// World-flavoured leaderboard titles so each board feels native to its world.
const LEADERBOARD_TITLES: Record<string, string> = {
  swamp: "Bayou's Best Anglers",
  volcanic: "Volcanic Champions",
  snowy_mountain: "Frostpeak Anglers",
  sky_realm: "Skyward Legends",
  island: "Island Castaways",
  desert: "Dune Drifters",
  enchanted_grove: "Grove Wardens",
  haunted_woods: "Haunted Hooks",
};

interface LeaderboardEntry {
  userId: string;
  username: string;
  profileImage: string | null;
  points: number;
}

export default function FishingLeaderboardPanel({
  onClose,
  worldId,
  currentUserId,
}: {
  onClose: () => void;
  worldId?: string;
  currentUserId: string;
}) {
  const theme = getFishingWorldTheme(worldId);
  const accent = theme.accent;
  const title = LEADERBOARD_TITLES[worldId ?? ""] ?? "Top Anglers";

  const { data, isLoading, isError, refetch } = useQuery<{ top: LeaderboardEntry[]; me: { points: number; rank: number } | null }>({
    queryKey: ["/api/fishing/leaderboard", worldId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/fishing/leaderboard/${worldId}`, { credentials: "include", signal });
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    enabled: !!worldId,
    staleTime: 10000,
  });

  const top = data?.top ?? [];
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const me = data?.me ?? null;
  const meInTop = top.some(e => e.userId === currentUserId);

  // Gold / silver / bronze for the podium; the numbers themselves carry the
  // ranking (no emoji medals) — they're enlarged and glow to stand out.
  const medalColor = (rank: number): string | null =>
    rank === 1 ? "#ffd700" : rank === 2 ? "#cdd3da" : rank === 3 ? "#d08a4e" : null;

  const renderRow = (e: LeaderboardEntry, rank: number) => {
    const medal = medalColor(rank);
    const isMe = e.userId === currentUserId;
    return (
      <div
        key={e.userId}
        data-testid={`row-leaderboard-${rank}`}
        className="flex items-center gap-3 px-2.5 py-2 rounded-xl"
        style={{
          background: medal ? `${medal}14` : isMe ? `${accent}12` : "rgba(255,255,255,0.03)",
          border: `1px solid ${medal ? `${medal}66` : isMe ? `${accent}55` : `${accent}20`}`,
        }}
      >
        <div style={{ width: 34, textAlign: "center", flexShrink: 0 }}>
          <span
            className="font-fantasy"
            style={{
              fontSize: medal ? 24 : 16,
              fontWeight: 900,
              color: medal ?? `${accent}aa`,
              textShadow: medal
                ? `0 0 10px ${medal}99, 0 2px 4px rgba(0,0,0,0.7)`
                : "0 1px 2px rgba(0,0,0,0.6)",
              lineHeight: 1,
            }}
          >
            {rank}
          </span>
        </div>
        <PlayerAvatarButton userId={e.userId} username={e.username} onSelectPlayer={setSelectedPlayerId} testId={`button-fishing-avatar-${e.userId}`}>
          <span
            className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
            style={{ border: `1px solid ${medal ?? `${accent}40`}`, background: "rgba(0,0,0,0.4)" }}
          >
            {e.profileImage
              ? <img src={e.profileImage} alt="" className="w-full h-full object-cover" />
              : <span className="font-fantasy text-xs" style={{ color: `${accent}70` }}>{e.username.charAt(0).toUpperCase()}</span>}
          </span>
        </PlayerAvatarButton>
        <span
          className="flex-1 font-fantasy text-xs truncate"
          style={{ color: isMe ? accent : "#e8f5f0", fontWeight: isMe ? 700 : 500 }}
        >
          {e.username}{isMe ? " (you)" : ""}
        </span>
        <span className="font-fantasy text-sm font-bold whitespace-nowrap" style={{ color: accent }}>
          {e.points.toLocaleString()}<span style={{ fontSize: 9, opacity: 0.6 }}> pts</span>
        </span>
      </div>
    );
  };

  return (
    <div data-testid="fishing-leaderboard-panel" className="absolute inset-x-0 bottom-0 z-[65] flex flex-col" style={{
      top: 118,
      borderRadius: "20px 20px 0 0",
      background: "rgba(3,12,10,0.97)",
      backdropFilter: "blur(12px)",
      border: `1px solid ${accent}30`,
      borderBottom: "none",
      animation: "slideUp 0.2s ease-out",
    }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${accent}30`, background: theme.pondGlow }}>
        <div className="flex items-center gap-2">
          <img src={leaderboardIcon} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
          <div>
            <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>{title.toUpperCase()}</h3>
            <p className="font-fantasy text-[9px]" style={{ color: `${accent}60` }}>Most fishing points in this world</p>
          </div>
        </div>
        <button aria-label="Close fishing leaderboard" data-testid="button-fishing-leaderboard-close" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.4)", color: `${accent}80`, cursor: "pointer" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="font-fantasy text-xs" style={{ color: `${accent}50` }}>Loading…</p>
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-col items-center justify-center h-40 gap-3 text-center px-6">
            <p className="font-fantasy text-sm" style={{ color: accent }}>Couldn’t load the fishing leaderboard.</p>
            <button type="button" onClick={() => void refetch()} className="rounded-lg border px-4 py-2" style={{ color: accent }}>Retry</button>
          </div>
        ) : top.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
            <p className="font-fantasy text-sm" style={{ color: `${accent}80` }}>No anglers yet</p>
            <p className="font-fantasy text-[10px]" style={{ color: `${accent}50` }}>Be the first to cast a line and claim the top spot!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {top.map((e, i) => renderRow(e, i + 1))}
          </div>
        )}
      </div>

      {!isError && me && !meInTop && top.length > 0 && (
        <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${accent}25`, background: "rgba(0,0,0,0.45)" }}>
          <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl" style={{ background: `${accent}12`, border: `1px solid ${accent}45` }}>
            <div style={{ width: 34, textAlign: "center", flexShrink: 0 }}>
              <span className="font-fantasy" style={{ fontSize: 16, fontWeight: 900, color: `${accent}cc`, lineHeight: 1 }}>{me.rank}</span>
            </div>
            <span className="flex-1 font-fantasy text-xs font-bold" style={{ color: accent }}>You</span>
            <span className="font-fantasy text-sm font-bold whitespace-nowrap" style={{ color: accent }}>
              {me.points.toLocaleString()}<span style={{ fontSize: 9, opacity: 0.6 }}> pts</span>
            </span>
          </div>
        </div>
      )}
      {selectedPlayerId && (
        <PlayerDetailPanel userId={selectedPlayerId} currentUserId={currentUserId} onClose={() => setSelectedPlayerId(null)} zIndex={10050} />
      )}
    </div>
  );
}
