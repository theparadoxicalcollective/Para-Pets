import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setNavHidden } from "@/lib/navVisibility";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";

const STORAGE_KEY = "para_pets_friends_layout";

function loadPositions(userId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePositions(userId: string, positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(positions));
  } catch {}
}

function getDefaultPosition(index: number, containerW: number, containerH: number): { x: number; y: number } {
  const CARD_W = 80;
  const CARD_H = 90;
  const cols = Math.max(3, Math.floor(containerW / (CARD_W + 24)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = containerW / cols;
  const cellH = CARD_H + 32;
  const seed = index * 137 + 31;
  const jitterX = ((seed * 1234567) % 30) - 15;
  const jitterY = ((seed * 7654321) % 20) - 10;
  return {
    x: Math.max(4, Math.min(containerW - CARD_W - 4, col * cellW + cellW / 2 - CARD_W / 2 + jitterX)),
    y: Math.max(4, Math.min(containerH - CARD_H - 4, 24 + row * cellH + jitterY)),
  };
}

export default function FriendsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"], staleTime: 60000 });

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: friendRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    queryFn: async () => {
      const res = await fetch("/api/friends/requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const acceptMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) =>
      apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: () => {
      toast({ title: "Friend Added!" });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requesterId: string) =>
      apiRequest("DELETE", `/api/friends/${requesterId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
  });

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 360, h: 560 });
  const dragRef = useRef<{
    friendId: string;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    obs.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!me?.id || friends.length === 0 || containerSize.w === 360) return;
    const saved = loadPositions(me.id);
    const updated = { ...saved };
    friends.forEach((f: any, i: number) => {
      if (!updated[f.friendId]) {
        updated[f.friendId] = getDefaultPosition(i, containerSize.w, containerSize.h);
      }
    });
    setPositions(updated);
  }, [me?.id, friends.length, containerSize.w]);

  const handlePointerDown = useCallback((e: React.PointerEvent, friendId: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = positions[friendId] ?? { x: 40, y: 80 };
    dragRef.current = {
      friendId,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      moved: false,
    };
  }, [positions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) < 8) return;
    dragRef.current.moved = true;
    const newX = Math.max(0, Math.min(containerSize.w - 80, dragRef.current.startPosX + dx));
    const newY = Math.max(0, Math.min(containerSize.h - 96, dragRef.current.startPosY + dy));
    setPositions(prev => ({ ...prev, [dragRef.current!.friendId]: { x: newX, y: newY } }));
  }, [containerSize]);

  const handlePointerUp = useCallback((friendId: string) => {
    if (!dragRef.current) return;
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;
    if (!wasMoved) {
      setViewingId(friendId);
    } else if (me?.id) {
      setPositions(prev => {
        savePositions(me.id, prev);
        return prev;
      });
    }
  }, [me?.id]);

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: "linear-gradient(180deg, #080500 0%, #100c02 50%, #080500 100%)" }}
    >
      {/* Stars / ambient particles */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(i * 37 + 11) % 95}%`,
              top: `${(i * 53 + 7) % 85}%`,
              width: i % 3 === 0 ? 2 : 1,
              height: i % 3 === 0 ? 2 : 1,
              borderRadius: "50%",
              background: "rgba(240,192,64,0.25)",
              boxShadow: "0 0 4px rgba(240,192,64,0.2)",
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 pt-safe"
        style={{
          paddingTop: "env(safe-area-inset-top, 20px)",
          paddingBottom: 12,
          borderBottom: "1px solid rgba(212,160,23,0.15)",
          background: "linear-gradient(180deg, rgba(20,12,0,0.95) 0%, transparent 100%)",
        }}
      >
        <button
          data-testid="button-back-friends"
          onClick={() => navigate("/")}
          className="w-9 h-9 flex items-center justify-center rounded-full transition-transform active:scale-90"
          style={{
            background: "rgba(212,160,23,0.1)",
            border: "1px solid rgba(212,160,23,0.3)",
            color: "#d4a017",
            cursor: "pointer",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          ‹
        </button>

        <div className="text-center">
          <h1
            className="font-fantasy tracking-widest"
            style={{ color: "#f0c040", fontSize: 20, textShadow: "0 0 24px rgba(240,192,64,0.5), 0 2px 8px rgba(0,0,0,0.8)" }}
          >
            Hero Companions
          </h1>
          <p className="font-fantasy text-[10px] tracking-[0.2em]" style={{ color: "rgba(212,160,23,0.4)" }}>
            {friends.length} {friends.length === 1 ? "companion" : "companions"}
          </p>
        </div>

        {/* Friend requests toggle */}
        <button
          data-testid="button-toggle-requests"
          onClick={() => setShowRequests(v => !v)}
          className="relative w-9 h-9 flex items-center justify-center rounded-full transition-transform active:scale-90"
          style={{
            background: friendRequests.length > 0 ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${friendRequests.length > 0 ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`,
            color: friendRequests.length > 0 ? "#4ade80" : "rgba(255,255,255,0.3)",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ✦
          {friendRequests.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                background: "radial-gradient(circle, #4ade80, #16a34a)",
                border: "1.5px solid rgba(0,0,0,0.6)",
                fontSize: 9,
                fontWeight: "bold",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >{friendRequests.length}</span>
          )}
        </button>
      </div>

      {/* Requests drawer */}
      {showRequests && (
        <div
          className="flex-shrink-0 px-4 py-3 flex flex-col gap-2"
          style={{ background: "rgba(10,20,10,0.95)", borderBottom: "1px solid rgba(74,222,128,0.15)" }}
        >
          <p className="font-fantasy text-[9px] tracking-widest uppercase" style={{ color: "rgba(74,222,128,0.6)" }}>
            Pending Requests ({friendRequests.length})
          </p>
          {friendRequests.length === 0 ? (
            <p className="font-fantasy text-xs text-center py-2" style={{ color: "rgba(74,222,128,0.3)" }}>No pending requests</p>
          ) : (
            friendRequests.map((req: any) => (
              <div
                key={req.id}
                data-testid={`request-row-${req.id}`}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" }}
              >
                <div
                  className="flex-shrink-0 rounded-lg overflow-hidden"
                  style={{ width: 30, height: 30, border: "1px solid rgba(74,222,128,0.3)" }}
                >
                  {req.profileImage ? (
                    <img src={req.profileImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(74,222,128,0.08)" }}>
                      <span className="font-fantasy text-xs font-bold" style={{ color: "#4ade80" }}>
                        {(req.username ?? "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <span className="flex-1 truncate font-fantasy text-sm" style={{ color: "#d4e8da" }}>{req.username}</span>
                <button
                  data-testid={`button-accept-${req.id}`}
                  onClick={() => acceptMutation.mutate({ requestId: req.id })}
                  disabled={acceptMutation.isPending}
                  className="rounded-lg px-3 py-1 font-fantasy text-xs transition-transform active:scale-90 disabled:opacity-50"
                  style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80", cursor: "pointer" }}
                >✓</button>
                <button
                  data-testid={`button-decline-${req.id}`}
                  onClick={() => declineMutation.mutate(req.requesterId)}
                  disabled={declineMutation.isPending}
                  className="rounded-lg px-3 py-1 font-fantasy text-xs transition-transform active:scale-90 disabled:opacity-50"
                  style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", cursor: "pointer" }}
                >✕</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Companion canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ touchAction: "none", overflow: "hidden" }}
        onPointerMove={handlePointerMove}
      >
        {friends.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4 px-10">
              <div style={{ fontSize: 48, opacity: 0.15 }}>⚔</div>
              <p className="font-fantasy text-base" style={{ color: "rgba(212,160,23,0.3)" }}>No companions yet</p>
              <p className="font-fantasy text-xs leading-relaxed" style={{ color: "rgba(168,152,120,0.25)" }}>
                Seek allies in the World Chat<br />to forge bonds of fellowship
              </p>
            </div>
          </div>
        ) : (
          friends.map((friend: any) => {
            const pos = positions[friend.friendId];
            if (!pos) return null;
            return (
              <div
                key={friend.friendId}
                data-testid={`friend-card-${friend.friendId}`}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: 80,
                  userSelect: "none",
                  touchAction: "none",
                  cursor: "grab",
                  zIndex: dragRef.current?.friendId === friend.friendId ? 10 : 1,
                }}
                onPointerDown={e => handlePointerDown(e, friend.friendId)}
                onPointerUp={() => handlePointerUp(friend.friendId)}
                onPointerCancel={() => { dragRef.current = null; }}
              >
                {/* Avatar ring */}
                <div
                  className="mx-auto flex items-center justify-center rounded-full"
                  style={{
                    width: 64,
                    height: 64,
                    padding: 3,
                    background: "linear-gradient(135deg, rgba(212,160,23,0.8) 0%, rgba(180,120,10,0.4) 50%, rgba(212,160,23,0.6) 100%)",
                    boxShadow: "0 0 16px rgba(212,160,23,0.2), 0 4px 16px rgba(0,0,0,0.7)",
                  }}
                >
                  <div
                    className="w-full h-full rounded-full overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #2a1a0a, #3a2010)" }}
                  >
                    {friend.profileImage ? (
                      <img
                        src={friend.profileImage}
                        alt={friend.username}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-fantasy text-xl font-bold" style={{ color: "#d4a017" }}>
                          {(friend.username ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Name */}
                <p
                  className="text-center font-fantasy truncate mt-1.5"
                  style={{
                    fontSize: 10,
                    color: "#c8a876",
                    textShadow: "0 1px 6px rgba(0,0,0,1)",
                    maxWidth: 80,
                    letterSpacing: "0.05em",
                  }}
                >
                  {friend.username}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      {friends.length > 0 && (
        <div
          className="flex-shrink-0 py-2 text-center"
          style={{ borderTop: "1px solid rgba(212,160,23,0.07)" }}
        >
          <p className="font-fantasy text-[9px] tracking-wider" style={{ color: "rgba(168,152,120,0.25)" }}>
            Hold & drag to reposition · Tap to view profile
          </p>
        </div>
      )}

      {/* Player detail panel */}
      {viewingId && me && (
        <PlayerDetailPanel
          userId={viewingId}
          currentUserId={me.id}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
}
