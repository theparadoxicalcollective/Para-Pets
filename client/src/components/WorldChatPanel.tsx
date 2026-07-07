import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, Bell, BellOff } from "lucide-react";
import veridianWatcherAvatar from "@assets/generated_images/veridian_watcher_avatar.png";
import { playClick } from "@/lib/sounds";

interface WorldChatMessage {
  id: string;
  userId: string;
  username: string;
  profileImage: string | null;
  message: string;
  createdAt: string;
  isAdmin?: boolean;
  isModerator?: boolean;
  isBot?: boolean;
}

interface WorldChatPanelProps {
  currentUserId: string;
  onClose: () => void;
  onNewMessage?: () => void;
}

const GOLD = "#f0c040";
const VW_COLOR = "#5eead4";
const VW_BG = "linear-gradient(135deg, rgba(20,80,70,0.55) 0%, rgba(10,50,44,0.55) 100%)";
const VW_BORDER = "1px solid rgba(94,234,212,0.35)";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function WorldChatPanel({ currentUserId: _currentUserId, onClose, onNewMessage }: WorldChatPanelProps) {
  const [showShoutoutConfirm, setShowShoutoutConfirm] = useState(false);
  const lastMsgCountRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: shoutoutPref } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/user/watcher-shoutouts"],
    staleTime: 60_000,
  });
  const shoutoutsEnabled = shoutoutPref?.enabled ?? true;

  const shoutoutMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/user/watcher-shoutouts", { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user/watcher-shoutouts"] });
      setShowShoutoutConfirm(false);
    },
  });

  const { data: messages = [] } = useQuery<WorldChatMessage[]>({
    queryKey: ["/api/world-chat"],
    refetchInterval: 5000,
    staleTime: 0,
  });

  // Only show Watcher announcements — player messages are no longer posted
  const announcements = messages.filter(m => !!m.isBot);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [announcements.length]);

  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      if (lastMsgCountRef.current > 0 && onNewMessage) {
        onNewMessage();
      }
      lastMsgCountRef.current = messages.length;
    }
  }, [messages.length, onNewMessage]);

  return (
    <div
      data-testid="panel-world-chat"
      className="absolute flex flex-col"
      style={{
        top: 56,
        right: 12,
        width: "min(320px, calc(calc(100*var(--vw)) - 24px))",
        height: "min(420px, calc(58*var(--vh)))",
        borderRadius: 16,
        background: "linear-gradient(160deg, rgba(8,4,2,0.97) 0%, rgba(22,12,4,0.97) 100%)",
        border: "1.5px solid rgba(240,192,64,0.35)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.85), 0 0 20px rgba(240,192,64,0.08)",
        zIndex: 10001,
        overflow: "hidden",
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Shoutout confirmation overlay */}
      {showShoutoutConfirm && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
          style={{ background: "rgba(6,3,1,0.97)", zIndex: 10, borderRadius: 15 }}
        >
          <Bell size={28} style={{ color: VW_COLOR }} />
          <p className="text-sm font-semibold" style={{ color: GOLD }}>
            {shoutoutsEnabled ? "Turn off Watcher shout outs?" : "Turn on Watcher shout outs?"}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            {shoutoutsEnabled
              ? "The Veridian Watcher will no longer mention your name in announcements."
              : "Allow the Veridian Watcher to mention your name in announcements."}
          </p>
          <div className="flex gap-3 mt-1">
            <button
              data-testid="button-shoutout-confirm"
              onClick={() => shoutoutMutation.mutate(!shoutoutsEnabled)}
              disabled={shoutoutMutation.isPending}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: VW_COLOR, color: "#050200" }}
            >
              {shoutoutMutation.isPending ? "Saving…" : "Confirm"}
            </button>
            <button
              data-testid="button-shoutout-cancel"
              onClick={() => setShowShoutoutConfirm(false)}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(240,192,64,0.15)" }}
      >
        <div className="flex items-center gap-2">
          <img
            src={veridianWatcherAvatar}
            alt="Veridian Watcher"
            style={{ width: 18, height: 18, objectFit: "cover", borderRadius: "50%", border: "1px solid rgba(94,234,212,0.5)", boxShadow: "0 0 6px rgba(94,234,212,0.3)" }}
          />
          <span
            className="font-fantasy tracking-widest"
            style={{ color: VW_COLOR, fontSize: 10, letterSpacing: "0.18em" }}
          >
            THE VERIDIAN WATCHER
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            data-testid="button-toggle-shoutouts"
            onClick={() => setShowShoutoutConfirm(true)}
            title={shoutoutsEnabled ? "Manage shout-out settings" : "Shout-outs are off"}
            className="flex items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              width: 24, height: 24,
              background: !shoutoutsEnabled ? "rgba(94,234,212,0.12)" : "rgba(94,234,212,0.06)",
              border: `1px solid ${!shoutoutsEnabled ? "rgba(94,234,212,0.45)" : "rgba(94,234,212,0.2)"}`,
              cursor: "pointer",
              color: !shoutoutsEnabled ? VW_COLOR : "rgba(94,234,212,0.4)",
            }}
          >
            {shoutoutsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
          </button>
          <button
            data-testid="button-close-world-chat"
            onClick={() => { playClick(); onClose(); }}
            className="flex items-center justify-center rounded-full transition-transform active:scale-90"
            style={{
              width: 24, height: 24,
              background: "rgba(240,192,64,0.08)",
              border: "1px solid rgba(240,192,64,0.25)",
              cursor: "pointer",
              color: "rgba(240,192,64,0.6)",
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Announcement list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(94,234,212,0.15) transparent" }}
      >
        {announcements.length === 0 && (
          <p
            className="font-fantasy text-center"
            style={{ color: "rgba(94,234,212,0.35)", fontSize: 11, marginTop: 60 }}
          >
            The Watcher observes in silence…
          </p>
        )}
        {announcements.map(msg => (
          <div
            key={msg.id}
            data-testid={`chat-message-${msg.id}`}
            className="flex gap-2 items-start"
          >
            {/* Avatar */}
            <div
              className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center"
              style={{
                width: 28, height: 28,
                background: "linear-gradient(135deg, #0a3a32 0%, #1a5a4e 100%)",
                border: "1.5px solid rgba(94,234,212,0.55)",
                boxShadow: "0 0 8px rgba(94,234,212,0.3)",
              }}
            >
              <img
                src={veridianWatcherAvatar}
                alt="Veridian Watcher"
                className="w-full h-full object-cover"
                data-testid={`img-watcher-avatar-${msg.id}`}
              />
            </div>
            {/* Bubble */}
            <div style={{ maxWidth: "80%" }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-fantasy" style={{ color: VW_COLOR, fontSize: 9, letterSpacing: "0.05em" }}>
                  {msg.username}
                </span>
                <span
                  style={{
                    fontSize: 7,
                    padding: "1px 4px",
                    borderRadius: 4,
                    background: "rgba(94,234,212,0.15)",
                    border: "1px solid rgba(94,234,212,0.4)",
                    color: VW_COLOR,
                    letterSpacing: "0.08em",
                    fontFamily: "Lora, serif",
                  }}
                >
                  WATCHER
                </span>
                <span style={{ color: "rgba(200,184,150,0.3)", fontSize: 8 }}>{timeAgo(msg.createdAt)}</span>
              </div>
              <div
                className="font-sans break-words"
                style={{
                  display: "inline-block",
                  padding: "5px 9px",
                  borderRadius: "12px 12px 12px 4px",
                  background: VW_BG,
                  border: VW_BORDER,
                  color: "#b2f5e8",
                  fontSize: 12,
                  lineHeight: 1.4,
                  maxWidth: "100%",
                  wordBreak: "break-word",
                  boxShadow: "0 0 12px rgba(94,234,212,0.1)",
                }}
              >
                {msg.message}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
