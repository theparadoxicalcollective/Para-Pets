import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, Send, ShieldAlert, BellOff, Bell } from "lucide-react";
import RoleBadge from "@/components/RoleBadge";
import PlayerDetailPanel from "@/components/PlayerDetailPanel";

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
const MAX_LENGTH = 150;

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function WorldChatPanel({ currentUserId, onClose, onNewMessage }: WorldChatPanelProps) {
  const [input, setInput] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [popupMsg, setPopupMsg] = useState<string | null>(null);
  const [popupIsRestricted, setPopupIsRestricted] = useState(false);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [showShoutoutConfirm, setShowShoutoutConfirm] = useState(false);
  const lastMsgCountRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const visibleMessages = messages;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [visibleMessages.length]);

  // Notify parent when new messages arrive (for glow effect on chat button)
  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      if (lastMsgCountRef.current > 0 && onNewMessage) {
        onNewMessage();
      }
      lastMsgCountRef.current = messages.length;
    }
  }, [messages.length, onNewMessage]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendMutation = useMutation({
    mutationFn: (msg: string) => apiRequest("POST", "/api/world-chat", { message: msg }),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/world-chat"] });
    },
    onError: (err: any) => {
      let body: any = {};
      try {
        const raw = err?.message ?? "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) body = JSON.parse(raw.slice(jsonStart));
      } catch {}
      if (body?.retryAfter) {
        setCooldown(body.retryAfter);
        setPopupIsRestricted(false);
        setPopupMsg(`Please wait ${body.retryAfter}s before sending again.`);
      } else {
        setPopupIsRestricted(!!body?.restricted);
        setPopupMsg(body?.message ?? "Something went wrong. Please try again.");
      }
    },
  });

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || cooldown > 0 || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      data-testid="panel-world-chat"
      className="absolute flex flex-col"
      style={{
        top: 56,
        right: 12,
        width: "min(320px, calc(100vw - 24px))",
        height: "min(420px, 58vh)",
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
          style={{
            background: "rgba(6,3,1,0.97)",
            zIndex: 10,
            borderRadius: 15,
          }}
        >
          <Bell size={28} style={{ color: VW_COLOR }} />
          <p className="text-sm font-semibold" style={{ color: "#f0c040" }}>
            {shoutoutsEnabled ? "Turn off world chat shout outs?" : "Turn on world chat shout outs?"}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            {shoutoutsEnabled
              ? "The Veridian Watcher will no longer mention your name in world chat announcements."
              : "Allow the Veridian Watcher to mention your name in world chat announcements."}
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
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }}
          />
          <span
            className="font-fantasy tracking-widest"
            style={{ color: GOLD, fontSize: 10, letterSpacing: "0.2em" }}
          >
            WORLD CHAT
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Shoutout toggle — opens confirmation */}
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
            onClick={onClose}
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

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(240,192,64,0.15) transparent" }}
      >
        {visibleMessages.length === 0 && (
          <p
            className="font-fantasy text-center"
            style={{ color: "rgba(200,184,150,0.4)", fontSize: 11, marginTop: 60 }}
          >
            No messages yet. Say hello!
          </p>
        )}
        {visibleMessages.map(msg => {
          const isMe = msg.userId === currentUserId;
          const isBot = !!msg.isBot;
          return (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.id}`}
              className="flex gap-2 items-start"
              style={{ flexDirection: isBot ? "row" : isMe ? "row-reverse" : "row" }}
            >
              {/* Avatar */}
              <div
                className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                data-testid={`button-chat-avatar-${msg.userId}`}
                onClick={() => !isMe && !isBot && setViewingPlayerId(msg.userId)}
                style={{
                  width: 28, height: 28,
                  background: isBot
                    ? "linear-gradient(135deg, #0a3a32 0%, #1a5a4e 100%)"
                    : "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)",
                  border: isBot
                    ? `1.5px solid rgba(94,234,212,0.55)`
                    : `1.5px solid ${isMe ? "rgba(240,192,64,0.5)" : "rgba(127,255,212,0.3)"}`,
                  cursor: isMe || isBot ? "default" : "pointer",
                  boxShadow: isBot ? "0 0 8px rgba(94,234,212,0.3)" : undefined,
                }}
              >
                {msg.profileImage ? (
                  <img src={msg.profileImage} alt={msg.username} className="w-full h-full object-cover" />
                ) : (
                  <span style={{ color: isBot ? VW_COLOR : GOLD, fontSize: 10, fontWeight: "bold" }}>
                    {isBot ? "👁️" : msg.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Bubble */}
              <div style={{ maxWidth: "80%", textAlign: isBot ? "left" : isMe ? "right" : "left" }}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ flexDirection: isBot ? "row" : isMe ? "row-reverse" : "row" }}>
                  <span
                    className="font-fantasy"
                    style={{
                      color: isBot ? VW_COLOR : isMe ? GOLD : "#7fffd4",
                      fontSize: 9,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {msg.username}
                  </span>
                  {isBot && (
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
                  )}
                  {!isBot && <RoleBadge isAdmin={msg.isAdmin} isModerator={msg.isModerator} />}
                  <span style={{ color: "rgba(200,184,150,0.3)", fontSize: 8 }}>{timeAgo(msg.createdAt)}</span>
                </div>
                <div
                  className="font-sans break-words"
                  style={{
                    display: "inline-block",
                    padding: "5px 9px",
                    borderRadius: isMe && !isBot ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: isBot
                      ? VW_BG
                      : isMe
                        ? "linear-gradient(135deg, rgba(240,192,64,0.18) 0%, rgba(180,130,10,0.15) 100%)"
                        : "rgba(255,255,255,0.06)",
                    border: isBot
                      ? VW_BORDER
                      : isMe
                        ? "1px solid rgba(240,192,64,0.25)"
                        : "1px solid rgba(255,255,255,0.08)",
                    color: isBot ? "#b2f5e8" : "#e8dcc8",
                    fontSize: 12,
                    lineHeight: 1.4,
                    maxWidth: "100%",
                    wordBreak: "break-word",
                    boxShadow: isBot ? "0 0 12px rgba(94,234,212,0.1)" : undefined,
                  }}
                >
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
        {/* Blinking typing cursor */}
        {inputFocused && (
          <div className="px-3 pt-1 pb-0.5 flex items-center gap-1.5">
            <span className="chat-cursor-blink" style={{ fontSize: 13, color: "rgba(240,192,64,0.55)", lineHeight: 1 }}>𖤓</span>
            <span style={{ fontSize: 9, color: "rgba(200,184,150,0.35)", fontFamily: "Lora, serif", letterSpacing: "0.05em" }}>composing…</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <form
        className="flex-shrink-0 px-2 pb-2 pt-1.5"
        style={{ borderTop: "1px solid rgba(240,192,64,0.12)" }}
        onSubmit={e => { e.preventDefault(); handleSend(); }}
      >
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              data-testid="input-world-chat"
              value={input}
              onChange={e => setInput(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Say something... (emojis welcome!)"
              rows={2}
              enterKeyHint="send"
              inputMode="text"
              className="w-full font-sans resize-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(240,192,64,0.25)",
                borderRadius: 10,
                color: "#e8dcc8",
                fontSize: 12,
                padding: "7px 10px",
                outline: "none",
                lineHeight: 1.4,
                maxHeight: 72,
                overflow: "auto",
                scrollbarWidth: "none",
              }}
            />
            {input.length > 100 && (
              <span
                className="absolute bottom-1.5 right-2"
                style={{ fontSize: 8, color: input.length >= MAX_LENGTH ? "#f87171" : "rgba(200,184,150,0.5)" }}
              >
                {MAX_LENGTH - input.length}
              </span>
            )}
          </div>
          <button
            type="submit"
            data-testid="button-send-world-chat"
            disabled={!input.trim() || cooldown > 0 || sendMutation.isPending}
            className="flex-shrink-0 flex items-center justify-center rounded-xl transition-transform active:scale-90"
            style={{
              width: 36, height: 36,
              background: cooldown > 0
                ? "rgba(200,184,150,0.08)"
                : "linear-gradient(135deg, rgba(240,192,64,0.3) 0%, rgba(180,130,10,0.25) 100%)",
              border: cooldown > 0
                ? "1px solid rgba(200,184,150,0.2)"
                : "1px solid rgba(240,192,64,0.45)",
              cursor: cooldown > 0 ? "default" : "pointer",
              color: cooldown > 0 ? "rgba(200,184,150,0.3)" : GOLD,
            }}
          >
            {cooldown > 0 ? (
              <span style={{ fontSize: 9, fontWeight: "bold" }}>{cooldown}s</span>
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </form>

      {/* In-panel error/restricted popup */}
      {popupMsg && (
        <div
          className="absolute inset-0 flex items-center justify-center px-4"
          style={{ background: "rgba(4,2,1,0.92)", zIndex: 10 }}
        >
          <div
            className="w-full rounded-2xl px-4 py-5 flex flex-col items-center gap-3"
            style={{
              background: popupIsRestricted
                ? "linear-gradient(160deg, rgba(80,10,10,0.98) 0%, rgba(40,5,5,0.98) 100%)"
                : "linear-gradient(160deg, rgba(20,12,4,0.98) 0%, rgba(10,6,2,0.98) 100%)",
              border: `1.5px solid ${popupIsRestricted ? "rgba(248,113,113,0.5)" : "rgba(212,160,23,0.4)"}`,
              boxShadow: popupIsRestricted
                ? "0 0 30px rgba(248,113,113,0.15)"
                : "0 0 30px rgba(212,160,23,0.1)",
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: popupIsRestricted ? "rgba(248,113,113,0.15)" : "rgba(240,192,64,0.12)",
                border: `1.5px solid ${popupIsRestricted ? "rgba(248,113,113,0.4)" : "rgba(240,192,64,0.3)"}`,
              }}
            >
              <ShieldAlert size={18} style={{ color: popupIsRestricted ? "#f87171" : GOLD }} />
            </div>
            <p
              className="font-fantasy text-center text-xs leading-relaxed"
              style={{ color: popupIsRestricted ? "#f87171" : GOLD }}
            >
              {popupIsRestricted ? "Message Restricted" : "Cannot Send"}
            </p>
            <p
              className="font-sans text-center leading-relaxed"
              style={{ color: "rgba(200,184,150,0.8)", fontSize: 11 }}
            >
              {popupMsg}
            </p>
            <button
              data-testid="button-dismiss-chat-popup"
              onClick={() => setPopupMsg(null)}
              className="px-6 py-1.5 rounded-full font-fantasy text-xs tracking-wider transition-transform active:scale-95"
              style={{
                background: popupIsRestricted ? "rgba(248,113,113,0.15)" : "rgba(240,192,64,0.12)",
                border: `1px solid ${popupIsRestricted ? "rgba(248,113,113,0.4)" : "rgba(240,192,64,0.3)"}`,
                color: popupIsRestricted ? "#f87171" : GOLD,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {viewingPlayerId && (
        <PlayerDetailPanel
          userId={viewingPlayerId}
          currentUserId={currentUserId}
          onClose={() => setViewingPlayerId(null)}
        />
      )}
    </div>
  );
}
