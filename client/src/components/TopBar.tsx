import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

interface FriendRequest {
  id: string;
  requesterId: string;
  username: string;
  createdAt: string;
}

export default function TopBar({ user, onProfileClick, onUserUpdate }: TopBarProps) {
  const [location, navigate] = useLocation();
  const [showRewards, setShowRewards] = useState(false);
  const [showRequestsPopup, setShowRequestsPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const seenNotifIds = useRef<Set<string>>(new Set());

  const { data: pendingRewards = [] } = useQuery<any[]>({
    queryKey: ["/api/rewards/pending"],
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const { data: friendRequestData, refetch: refetchCount } = useQuery<{ count: number }>({
    queryKey: ["/api/friends/requests/count"],
    refetchInterval: 10000,
  });

  const { data: unreadNotifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications/unread"],
    refetchInterval: 30000,
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
      toast({ title: "🎉 Friend Request Accepted", description: n.message });
    });
    markReadMutation.mutate();
  }, [unreadNotifications]);

  const { data: pendingRequests = [], refetch: refetchRequests } = useQuery<FriendRequest[]>({
    queryKey: ["/api/friends/requests"],
    enabled: showRequestsPopup,
  });

  const hasRewards = pendingRewards.length > 0;
  const friendRequestCount = friendRequestData?.count ?? 0;
  const hasFriendRequests = friendRequestCount > 0;

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: () => {
      refetchRequests();
      refetchCount();
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requesterId: string) => apiRequest("DELETE", `/api/friends/${requesterId}`, {}),
    onSuccess: () => {
      refetchRequests();
      refetchCount();
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
  });

  useEffect(() => {
    if (!showRequestsPopup) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowRequestsPopup(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showRequestsPopup]);

  // Auto-close the popup once all requests have been handled
  useEffect(() => {
    if (showRequestsPopup && pendingRequests.length === 0 && friendRequestCount === 0) {
      const t = setTimeout(() => setShowRequestsPopup(false), 800);
      return () => clearTimeout(t);
    }
  }, [showRequestsPopup, pendingRequests.length, friendRequestCount]);

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1 gap-3 relative z-20">

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
                        {user.username.charAt(0).toUpperCase()}
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

              {hasRewards && (
                <button
                  data-testid="button-gift-rewards"
                  onClick={() => setShowRewards(true)}
                  className="relative flex-shrink-0 transition-transform active:scale-90 animate-bounce"
                  style={{ background: "none", border: "none", cursor: "pointer", animationDuration: "2s" }}
                >
                  <img
                    src={giftIconImg}
                    alt="Gifts"
                    className="w-10 h-10 object-contain"
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

              {/* Friend request badge — opens inline popup on click */}
              {(hasFriendRequests || showRequestsPopup) && (
                <div className="relative" ref={popupRef}>
                  <button
                    data-testid="button-friend-requests"
                    onClick={() => setShowRequestsPopup(v => !v)}
                    className="relative flex-shrink-0 transition-transform active:scale-90"
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    title="Friend requests"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                        border: `1.5px solid ${showRequestsPopup ? "rgba(74,222,128,0.85)" : "rgba(74,222,128,0.55)"}`,
                        boxShadow: showRequestsPopup ? "0 0 14px rgba(74,222,128,0.45)" : "0 0 10px rgba(74,222,128,0.25)",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="19" y1="8" x2="19" y2="14"/>
                        <line x1="22" y1="11" x2="16" y2="11"/>
                      </svg>
                    </div>
                    {friendRequestCount > 0 && (
                      <div
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
                        style={{
                          background: "radial-gradient(circle, #4ade80 0%, #16a34a 100%)",
                          border: "1.5px solid rgba(30,15,5,0.8)",
                          boxShadow: "0 0 6px rgba(74,222,128,0.6)",
                        }}
                      >
                        <span className="font-bold text-[8px] text-white leading-none">{friendRequestCount}</span>
                      </div>
                    )}
                  </button>

                  {/* Inline popup */}
                  {showRequestsPopup && (
                    <div
                      data-testid="popup-friend-requests"
                      className="absolute top-full mt-2 left-0 z-50 min-w-[220px]"
                      style={{
                        background: "linear-gradient(160deg, rgba(20,10,4,0.97) 0%, rgba(40,22,8,0.97) 100%)",
                        border: "1px solid rgba(74,222,128,0.35)",
                        borderRadius: 14,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 20px rgba(74,222,128,0.1)",
                        padding: "10px 10px 8px",
                      }}
                    >
                      {/* Header */}
                      <p
                        className="font-fantasy tracking-widest text-center mb-2"
                        style={{ fontSize: 9, color: "rgba(74,222,128,0.7)", letterSpacing: "0.2em" }}
                      >
                        FRIEND REQUESTS
                      </p>

                      {pendingRequests.length === 0 ? (
                        <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.35)", padding: "6px 0" }}>
                          No pending requests
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {pendingRequests.map(req => (
                            <div
                              key={req.id}
                              data-testid={`friend-request-${req.id}`}
                              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                              style={{
                                background: "rgba(74,222,128,0.06)",
                                border: "1px solid rgba(74,222,128,0.15)",
                              }}
                            >
                              {/* Requester name */}
                              <span
                                className="font-fantasy truncate flex-1"
                                style={{ fontSize: 11, color: "#7fffd4" }}
                              >
                                {req.username}
                              </span>

                              {/* Accept */}
                              <button
                                data-testid={`button-accept-${req.id}`}
                                onClick={() => acceptMutation.mutate(req.id)}
                                disabled={acceptMutation.isPending || declineMutation.isPending}
                                className="flex-shrink-0 transition-transform active:scale-90"
                                style={{
                                  background: "linear-gradient(135deg, rgba(74,222,128,0.25) 0%, rgba(22,163,74,0.25) 100%)",
                                  border: "1px solid rgba(74,222,128,0.5)",
                                  borderRadius: 8,
                                  padding: "3px 8px",
                                  cursor: "pointer",
                                  color: "#4ade80",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ✓ Accept
                              </button>

                              {/* Decline */}
                              <button
                                data-testid={`button-decline-${req.id}`}
                                onClick={() => declineMutation.mutate(req.requesterId)}
                                disabled={acceptMutation.isPending || declineMutation.isPending}
                                className="flex-shrink-0 transition-transform active:scale-90"
                                style={{
                                  background: "linear-gradient(135deg, rgba(248,113,113,0.15) 0%, rgba(185,28,28,0.15) 100%)",
                                  border: "1px solid rgba(248,113,113,0.4)",
                                  borderRadius: 8,
                                  padding: "3px 8px",
                                  cursor: "pointer",
                                  color: "#f87171",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ✕ Decline
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" />
      </div>

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
