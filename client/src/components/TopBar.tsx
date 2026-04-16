import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";
import coinIconImg from "@assets/icon_coin.png";
import giftIconImg from "@assets/generated_images/gift_icon_forest.png";
import RewardClaimModal from "./RewardClaimModal";

interface TopBarProps {
  user: {
    id: string;
    username: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
  };
  onProfileClick: () => void;
  onUserUpdate?: (user: any) => void;
}

export default function TopBar({ user, onProfileClick, onUserUpdate }: TopBarProps) {
  const [location, navigate] = useLocation();
  const [showRewards, setShowRewards] = useState(false);
  const [showAdminMsgsPopup, setShowAdminMsgsPopup] = useState(false);
  const adminMsgRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const seenNotifIds = useRef<Set<string>>(new Set());

  const { data: pendingRewards = [] } = useQuery<any[]>({
    queryKey: ["/api/rewards/pending"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  interface AdminMsg { id: string; subject: string; message: string; createdAt: string; }
  const { data: adminMsgsRaw } = useQuery<AdminMsg[]>({
    queryKey: ["/api/admin-messages"],
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const adminMsgs: AdminMsg[] = Array.isArray(adminMsgsRaw) ? adminMsgsRaw : [];

  const { data: unreadNotifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications/unread"],
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-read", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] }),
  });

  useEffect(() => {
    const newOnes = unreadNotifications.filter(n => !seenNotifIds.current.has(n.id));
    if (newOnes.length === 0) return;
    newOnes.forEach(n => {
      seenNotifIds.current.add(n.id);
      const title = n.type === "friend_accepted" ? "Friend Request Accepted" : n.type === "support_message" ? "New Support Message" : "Notification";
      toast({ title, description: n.message });
    });
    markReadMutation.mutate();
  }, [unreadNotifications]);

  const deleteAdminMsgMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin-messages/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-messages"] });
    },
  });

  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!showAdminMsgsPopup) return;
    function handleClick(e: MouseEvent) {
      if (adminMsgRef.current && !adminMsgRef.current.contains(e.target as Node)) {
        setShowAdminMsgsPopup(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAdminMsgsPopup]);

  const hasRewards = pendingRewards.length > 0;

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-3 relative z-[50]">

        {/* LEFT: profile photo + name/coins to its right */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Profile photo column (photo + admin star below) */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <button
              data-testid="button-profile"
              onClick={onProfileClick}
              className="relative flex-shrink-0 transition-transform duration-150 active:scale-95"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <div className="relative topbar-profile-size-sm">
                <div
                  className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                  style={{
                    border: "2.5px solid #c9a030",
                    boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                  }}
                />
                <div className="absolute z-10 overflow-hidden rounded-lg" style={{ inset: "0px" }}>
                  {user.profileImage ? (
                    <img
                      data-testid="img-profile-avatar"
                      src={user.profileImage}
                      alt={user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}
                    >
                      <span className="font-fantasy text-[#d4a017] font-bold" style={{ fontSize: "clamp(14px, 4vw, 20px)" }}>
                        {(user.username ?? "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
            {user.isAdmin && (
              <button
                data-testid="button-admin-icon"
                onClick={() => location === "/admin" ? navigate("/") : navigate("/admin")}
                className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-90"
                style={{
                  background: location === "/admin"
                    ? "linear-gradient(135deg, rgba(212,160,23,0.55) 0%, rgba(180,120,10,0.5) 100%)"
                    : "linear-gradient(135deg, rgba(212,160,23,0.25) 0%, rgba(180,120,10,0.25) 100%)",
                  border: "2px solid rgba(212,160,23,0.6)",
                  cursor: "pointer",
                  boxShadow: location === "/admin"
                    ? "0 2px 10px rgba(0,0,0,0.6), 0 0 18px rgba(212,160,23,0.45)"
                    : "0 2px 10px rgba(0,0,0,0.6), 0 0 14px rgba(212,160,23,0.2)",
                  borderRadius: "10px",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(240,192,64,0.6))" }}>
                  <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" fill="rgba(240,192,64,0.3)" />
                </svg>
              </button>
            )}
            {/* Admin messages envelope — below profile photo, only when messages exist */}
            {adminMsgs.length > 0 && (
              <div className="relative" ref={adminMsgRef}>
                <button
                  data-testid="button-admin-messages"
                  onClick={() => setShowAdminMsgsPopup(v => !v)}
                  className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center relative transition-transform duration-150 active:scale-90"
                  style={{
                    background: showAdminMsgsPopup
                      ? "linear-gradient(135deg, rgba(240,192,64,0.35) 0%, rgba(180,130,10,0.3) 100%)"
                      : "linear-gradient(135deg, rgba(240,192,64,0.12) 0%, rgba(180,130,10,0.12) 100%)",
                    border: `2px solid ${showAdminMsgsPopup ? "rgba(240,192,64,0.8)" : "rgba(240,192,64,0.45)"}`,
                    borderRadius: "10px",
                    cursor: "pointer",
                    boxShadow: showAdminMsgsPopup
                      ? "0 2px 10px rgba(0,0,0,0.6), 0 0 18px rgba(240,192,64,0.4)"
                      : "0 2px 10px rgba(0,0,0,0.6), 0 0 12px rgba(240,192,64,0.2)",
                  }}
                  title="Messages from Admin"
                >
                  <Mail size={18} color="#f0c040" style={{ filter: "drop-shadow(0 0 4px rgba(240,192,64,0.6))" }} />
                  <div
                    className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-0.5"
                    style={{
                      background: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
                      border: "1.5px solid rgba(10,5,2,0.8)",
                      boxShadow: "0 0 5px rgba(248,113,113,0.6)",
                    }}
                  >
                    <span className="font-bold text-[7px] text-white leading-none">{adminMsgs.length}</span>
                  </div>
                </button>

                {showAdminMsgsPopup && (
                  <div
                    data-testid="popup-admin-messages"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      width: "min(270px, calc(100vw - 16px))",
                      maxHeight: "65vh",
                      overflowY: "auto",
                      zIndex: 99999,
                      background: "linear-gradient(160deg, rgba(20,10,4,0.98) 0%, rgba(40,22,8,0.98) 100%)",
                      border: "1px solid rgba(240,192,64,0.35)",
                      borderRadius: 14,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 20px rgba(240,192,64,0.1)",
                      padding: "10px 10px 8px",
                    }}
                  >
                    <p className="font-fantasy tracking-widest text-center mb-2" style={{ fontSize: 9, color: "rgba(240,192,64,0.7)", letterSpacing: "0.2em" }}>
                      MESSAGES FROM ADMIN
                    </p>
                    <div className="flex flex-col gap-2">
                      {adminMsgs.map(am => {
                        const isOpen = expandedMsgId === am.id;
                        return (
                          <div
                            key={am.id}
                            data-testid={`admin-message-${am.id}`}
                            className="rounded-xl overflow-hidden"
                            style={{ background: "rgba(240,192,64,0.06)", border: `1px solid ${isOpen ? "rgba(240,192,64,0.35)" : "rgba(240,192,64,0.18)"}` }}
                          >
                            <button
                              data-testid={`button-open-admin-message-${am.id}`}
                              onClick={() => setExpandedMsgId(isOpen ? null : am.id)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                              style={{ background: "none", border: "none", cursor: "pointer" }}
                            >
                              <p className="font-fantasy text-[#f0c040] text-[10px] tracking-wider truncate flex-1">{am.subject}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="font-fantasy text-[#6a5840] text-[9px]">
                                  {new Date(am.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </span>
                                <span style={{ color: "rgba(240,192,64,0.5)", fontSize: 9 }}>{isOpen ? "▲" : "▼"}</span>
                              </div>
                            </button>

                            {isOpen && (
                              <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid rgba(240,192,64,0.12)" }}>
                                <p className="font-sans text-[#d4b896] text-xs whitespace-pre-wrap break-words leading-relaxed pt-2">{am.message}</p>
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    data-testid={`button-close-admin-message-${am.id}`}
                                    onClick={() => setExpandedMsgId(null)}
                                    className="font-fantasy tracking-wider transition-transform active:scale-90"
                                    style={{ fontSize: 9, padding: "3px 10px", borderRadius: 6, background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.25)", color: "rgba(240,192,64,0.7)", cursor: "pointer" }}
                                  >
                                    Close
                                  </button>
                                  <button
                                    data-testid={`button-delete-admin-message-${am.id}`}
                                    onClick={() => deleteAdminMsgMutation.mutate(am.id)}
                                    disabled={deleteAdminMsgMutation.isPending}
                                    className="font-fantasy tracking-wider transition-transform active:scale-90"
                                    style={{ fontSize: 9, padding: "3px 10px", borderRadius: 6, background: "rgba(139,32,32,0.3)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff9999", cursor: "pointer" }}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name + coins stacked to the right of the photo */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="px-2.5 py-1 rounded-md min-w-0"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.5)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,160,23,0.2)",
                }}
              >
                <p
                  className="font-fantasy text-[#f0c040] font-semibold tracking-widest truncate"
                  style={{ textShadow: "0 0 10px rgba(240,192,64,0.6)", fontSize: "clamp(9px, 2.5vw, 12px)" }}
                  data-testid="text-username"
                >
                  {user.username}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-start">
              <button
                data-testid="button-coin-shop"
                onClick={() => navigate("/coins")}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-transform active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.4)",
                  cursor: "pointer",
                }}
              >
                <img
                  src={coinIconImg}
                  alt="Coins"
                  className="w-3.5 h-3.5 object-contain"
                  style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
                />
                <span
                  className="font-fantasy text-[#f0c040] font-semibold"
                  style={{ fontSize: "clamp(9px, 2.5vw, 12px)" }}
                  data-testid="text-coins"
                >
                  {user.coins}
                </span>
                <span className="font-fantasy text-[#d4a017] text-[8px]">+</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: gifts (only outside the home page — on home, the gift floats under the profile photo so it never collides with the tutorial button) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasRewards && location !== "/" && (
            <button
              data-testid="button-gift-rewards"
              onClick={() => setShowRewards(true)}
              className="relative flex-shrink-0 transition-transform active:scale-90 animate-bounce"
              style={{ background: "none", border: "none", cursor: "pointer", animationDuration: "2s" }}
            >
              <img
                src={giftIconImg}
                alt="Gifts"
                className="w-12 h-12 object-contain"
                style={{ filter: "drop-shadow(0 0 8px rgba(120,200,80,0.7)) drop-shadow(0 0 16px rgba(192,132,252,0.4))" }}
              />
              <div
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  background: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
                  border: "1.5px solid rgba(30,15,5,0.8)",
                  boxShadow: "0 0 6px rgba(248,113,113,0.6)",
                }}
              >
                <span className="font-bold text-[8px] text-white leading-none">{pendingRewards.length}</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Floating gift button on the home page — sits just below the profile photo, layered above pet content */}
      {hasRewards && location === "/" && (
        <button
          data-testid="button-gift-rewards-floating"
          onClick={() => setShowRewards(true)}
          className="fixed transition-transform active:scale-90 animate-bounce"
          style={{
            top: 124,
            left: 12,
            zIndex: 40,
            background: "none",
            border: "none",
            cursor: "pointer",
            animationDuration: "2s",
            pointerEvents: "auto",
          }}
        >
          <img
            src={giftIconImg}
            alt="Gifts"
            className="w-12 h-12 object-contain"
            style={{ filter: "drop-shadow(0 0 8px rgba(120,200,80,0.7)) drop-shadow(0 0 16px rgba(192,132,252,0.45)) drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
          />
          <div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
              border: "1.5px solid rgba(30,15,5,0.8)",
              boxShadow: "0 0 6px rgba(248,113,113,0.6)",
            }}
          >
            <span className="font-bold text-[8px] text-white leading-none">{pendingRewards.length}</span>
          </div>
        </button>
      )}

      {showRewards && (
        <RewardClaimModal
          onClose={() => setShowRewards(false)}
          onUserUpdate={(updatedUser) => {
            onUserUpdate?.(updatedUser);
          }}
        />
      )}
    </>
  );
}
