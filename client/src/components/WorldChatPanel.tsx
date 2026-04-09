import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, Send, ShieldAlert } from "lucide-react";
import RoleBadge from "@/components/RoleBadge";

interface WorldChatMessage {
  id: string;
  userId: string;
  username: string;
  profileImage: string | null;
  message: string;
  createdAt: string;
  isAdmin?: boolean;
  isModerator?: boolean;
}

interface WorldChatPanelProps {
  currentUserId: string;
  onClose: () => void;
}

const GOLD = "#f0c040";
const MAX_LENGTH = 150;

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function WorldChatPanel({ currentUserId, onClose }: WorldChatPanelProps) {
  const [input, setInput] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [popupMsg, setPopupMsg] = useState<string | null>(null);
  const [popupIsRestricted, setPopupIsRestricted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data: messages = [] } = useQuery<WorldChatMessage[]>({
    queryKey: ["/api/world-chat"],
    refetchInterval: 5000,
    staleTime: 0,
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

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
        bottom: 80,
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

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(240,192,64,0.15) transparent" }}
      >
        {messages.length === 0 && (
          <p
            className="font-fantasy text-center"
            style={{ color: "rgba(200,184,150,0.4)", fontSize: 11, marginTop: 60 }}
          >
            No messages yet. Say hello!
          </p>
        )}
        {messages.map(msg => {
          const isMe = msg.userId === currentUserId;
          return (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.id}`}
              className="flex gap-2 items-start"
              style={{ flexDirection: isMe ? "row-reverse" : "row" }}
            >
              {/* Avatar */}
              <div
                className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                style={{
                  width: 28, height: 28,
                  background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)",
                  border: `1.5px solid ${isMe ? "rgba(240,192,64,0.5)" : "rgba(127,255,212,0.3)"}`,
                }}
              >
                {msg.profileImage ? (
                  <img src={msg.profileImage} alt={msg.username} className="w-full h-full object-cover" />
                ) : (
                  <span style={{ color: GOLD, fontSize: 10, fontWeight: "bold" }}>
                    {msg.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Bubble */}
              <div style={{ maxWidth: "72%", textAlign: isMe ? "right" : "left" }}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ flexDirection: isMe ? "row-reverse" : "row" }}>
                  <span
                    className="font-fantasy"
                    style={{ color: isMe ? GOLD : "#7fffd4", fontSize: 9, letterSpacing: "0.05em" }}
                  >
                    {msg.username}
                  </span>
                  <RoleBadge isAdmin={msg.isAdmin} isModerator={msg.isModerator} />
                  <span style={{ color: "rgba(200,184,150,0.3)", fontSize: 8 }}>{timeAgo(msg.createdAt)}</span>
                </div>
                <div
                  className="font-sans break-words"
                  style={{
                    display: "inline-block",
                    padding: "5px 9px",
                    borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: isMe
                      ? "linear-gradient(135deg, rgba(240,192,64,0.18) 0%, rgba(180,130,10,0.15) 100%)"
                      : "rgba(255,255,255,0.06)",
                    border: isMe ? "1px solid rgba(240,192,64,0.25)" : "1px solid rgba(255,255,255,0.08)",
                    color: "#e8dcc8",
                    fontSize: 12,
                    lineHeight: 1.4,
                    maxWidth: "100%",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
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
    </div>
  );
}
