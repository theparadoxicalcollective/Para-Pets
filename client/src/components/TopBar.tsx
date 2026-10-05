import { useState, useRef, useEffect, useId } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

import coinBarImg from "@assets/Photoroom_20260709_102133_AM_1783610567237.png";
import coinBagIconImg from "@assets/generated_images/icon_coin_bag.png";
import essenceBarImg from "@assets/Photoroom_20260709_24152_PM_1783626130265.png";
import giftIconImg from "@assets/Photoroom_20260708_51809_PM_1783549272918.png";
import profileFrameImg from "@assets/Photoroom_20260709_92006_AM_1783607153082.png";
import nameplateImg from "@assets/Photoroom_20260709_92122_AM_1783607153082.png";
import RewardClaimModal from "./RewardClaimModal";

interface TopBarProps {
  user: {
    id: string;
    username: string;
    profileImage: string | null;
    coins: number;
    essence?: number;
    isAdmin: boolean;
  };
  onProfileClick: () => void;
  onUserUpdate?: (user: any) => void;
  hideProfile?: boolean;
  hideCoins?: boolean;
}

function RewardChestArt({ size }: { size: number }) {
  const filterId = `reward-chest-glow-${useId().replace(/:/g, "")}`;

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: "block", overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={filterId}
          x="-55%"
          y="-55%"
          width="210%"
          height="210%"
          colorInterpolationFilters="sRGB"
        >
          {/* Build the glow from solid chest pixels only. This intentionally
              ignores faint transparent-canvas pixels that can become a square
              halo with CSS drop-shadow on mobile Safari/WebKit. */}
          <feComponentTransfer in="SourceAlpha" result="chestAlpha">
            <feFuncA type="table" tableValues="0 0 1 1" />
          </feComponentTransfer>
          <feGaussianBlur in="chestAlpha" stdDeviation="2.2" result="tightBlur" />
          <feFlood floodColor="#a7f3d0" floodOpacity="0.9" result="tightColor" />
          <feComposite in="tightColor" in2="tightBlur" operator="in" result="tightGlow" />
          <feGaussianBlur in="chestAlpha" stdDeviation="5.2" result="wideBlur" />
          <feFlood floodColor="#22c55e" floodOpacity="0.58" result="wideColor" />
          <feComposite in="wideColor" in2="wideBlur" operator="in" result="wideGlow" />
          <feMerge>
            <feMergeNode in="wideGlow" />
            <feMergeNode in="tightGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <image
        href={giftIconImg}
        x="0"
        y="0"
        width="100"
        height="100"
        preserveAspectRatio="xMidYMid meet"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}

function RewardCountGem({ count, compact = false }: { count: number; compact?: boolean }) {
  const size = compact ? 18 : 23;
  const fontSize = count > 99 ? (compact ? 6 : 7) : count > 9 ? (compact ? 7 : 8) : (compact ? 8 : 9);

  return (
    <span
      data-testid="reward-count-gem"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: compact ? -2 : -4,
        right: compact ? -2 : -4,
        width: size,
        height: size,
        transform: "rotate(45deg)",
        borderRadius: compact ? 4 : 5,
        background: "linear-gradient(145deg, rgba(209,250,229,0.98) 0%, rgba(34,197,94,0.96) 38%, rgba(6,95,70,0.98) 100%)",
        border: "1.5px solid rgba(244,211,105,0.95)",
        boxShadow: "0 0 0 1px rgba(6,78,59,0.72), 0 0 9px rgba(74,222,128,0.78), inset 0 0 5px rgba(255,255,255,0.3)",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 3,
          width: compact ? 3 : 4,
          height: 2,
          borderRadius: 999,
          background: "rgba(255,255,255,0.8)",
          boxShadow: "0 0 4px rgba(255,255,255,0.65)",
        }}
      />
      <span
        className="font-fantasy"
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          transform: "rotate(-45deg)",
          color: "#f2ffe9",
          fontWeight: 900,
          fontSize,
          lineHeight: 1,
          textShadow: "0 1px 2px rgba(1,35,20,0.9), 0 0 3px rgba(5,80,45,0.8)",
        }}
      >
        {count}
      </span>
    </span>
  );
}

export default function TopBar({ user, onProfileClick, onUserUpdate, hideProfile, hideCoins }: TopBarProps) {
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

        {/* LEFT: profile photo + nameplate below */}
        <div className="flex flex-col items-start gap-0 min-w-0">
          <div className="flex items-center gap-2">
          {/* Profile photo — translateY shifts it down without moving coin siblings */}
          {!hideProfile && <div className="flex flex-col items-center gap-0 flex-shrink-0" style={{ transform: "translateY(14px)" }}>
            <div className="relative flex-shrink-0" style={{ width: 100 }}>
              <button
                data-testid="button-profile"
                onClick={onProfileClick}
                className="transition-transform duration-150 active:scale-95"
                style={{ background: "none", border: "none", cursor: "pointer", display: "block", width: "100%" }}
              >
                <div className="relative w-full">
                  {/* Photo — bigger, pushed down within frame opening */}
                  <div
                    className="absolute z-10 overflow-hidden rounded-xl"
                    style={{ top: "13%", left: "7%", right: "7%", bottom: "4%", border: "2px solid rgba(5,2,0,0.88)" }}
                  >
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
                        <span className="font-fantasy text-[#d4a017] font-bold" style={{ fontSize: "clamp(18px, calc(5.5*var(--vw)), 26px)" }}>
                          {(user.username ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Frame in-flow — renders at natural 1115×1126 ratio, no squish, no overflow */}
                  <img
                    src={profileFrameImg}
                    alt=""
                    className="block w-full z-20 pointer-events-none relative"
                    style={{ height: "auto", filter: "drop-shadow(0 6px 28px rgba(0,0,0,0.55))" }}
                  />
                </div>
              </button>
              {user.isAdmin && (
                <button
                  data-testid="button-admin-icon"
                  onClick={(e) => { e.stopPropagation(); location === "/admin" ? navigate("/") : navigate("/admin"); }}
                  className="absolute flex items-center justify-center transition-transform duration-150 active:scale-90"
                  style={{
                    bottom: -5,
                    right: -5,
                    width: 20,
                    height: 20,
                    borderRadius: "6px",
                    background: location === "/admin"
                      ? "linear-gradient(135deg, rgba(212,160,23,0.9) 0%, rgba(180,120,10,0.85) 100%)"
                      : "linear-gradient(135deg, rgba(212,160,23,0.6) 0%, rgba(180,120,10,0.55) 100%)",
                    border: "1.5px solid rgba(212,160,23,0.9)",
                    cursor: "pointer",
                    boxShadow: location === "/admin"
                      ? "0 0 8px rgba(212,160,23,0.7)"
                      : "0 0 5px rgba(212,160,23,0.4)",
                    zIndex: 30,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 3px rgba(240,192,64,0.8))" }}>
                    <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" fill="rgba(240,192,64,0.5)" />
                  </svg>
                </button>
              )}
            </div>
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
                      width: "min(270px, calc(calc(100*var(--vw)) - 16px))",
                      maxHeight: "calc(65*var(--vh))",
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

            {/* Nameplate — below frame */}
            <div style={{ position: "relative", width: 108, marginTop: -18, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={nameplateImg} alt="" style={{ display: "block", width: "100%", height: "auto", filter: "drop-shadow(0 4px 22px rgba(0,0,0,0.55))" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 6 }}>
                <p
                  className="font-fantasy text-[#f0c040] font-semibold tracking-widest truncate"
                  style={{ fontSize: "clamp(10px, calc(2.8*var(--vw)), 13px)", textAlign: "center", maxWidth: "80%" }}
                  data-testid="text-username"
                >
                  {user.username}
                </p>
              </div>
            </div>
          </div>}

          {/* Coins + Essence + coin bundles — one compact HUD cluster */}
          {!hideCoins && (
            <div
              data-testid="topbar-resource-cluster"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 54px",
                gridTemplateRows: "30px 30px",
                columnGap: 5,
                rowGap: 2,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <button
                data-testid="button-coin-shop"
                onClick={() => navigate("/coins")}
                className="transition-transform active:scale-95"
                style={{
                  gridColumn: 1,
                  gridRow: 1,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  flexShrink: 0,
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <img src={coinBarImg} alt="Coins" style={{ height: 30, width: "auto", objectFit: "contain" }} />
                <span
                  className="font-fantasy text-[#f5d060] font-semibold"
                  style={{
                    position: "absolute",
                    left: "36%",
                    right: "7%",
                    textAlign: "center",
                    fontSize: "clamp(9px, calc(2.8*var(--vw)), 12px)",
                    textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.7)",
                    pointerEvents: "none",
                  }}
                  data-testid="text-coins"
                >
                  {user.coins.toLocaleString()}
                </span>
              </button>

              <div
                data-testid="display-essence"
                style={{
                  gridColumn: 1,
                  gridRow: 2,
                  flexShrink: 0,
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <img src={essenceBarImg} alt="Essence" style={{ height: 30, width: "auto", objectFit: "contain" }} />
                <span
                  className="font-fantasy text-[#7fff7f] font-semibold"
                  style={{
                    position: "absolute",
                    left: "36%",
                    right: "7%",
                    textAlign: "center",
                    fontSize: "clamp(9px, calc(2.8*var(--vw)), 12px)",
                    textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,80,0,0.7)",
                    pointerEvents: "none",
                  }}
                  data-testid="text-essence"
                >
                  {(user.essence ?? 0).toLocaleString()}
                </span>
              </div>

              <button
                data-testid="button-coin-bag"
                aria-label="Open coin bundles"
                title="Coin Bundles"
                onClick={() => navigate("/coins")}
                className="transition-transform active:scale-90"
                style={{
                  gridColumn: 2,
                  gridRow: "1 / span 2",
                  width: 54,
                  height: 54,
                  alignSelf: "center",
                  justifySelf: "center",
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  background: "radial-gradient(circle at 42% 35%, rgba(255,241,174,0.26) 0%, rgba(154,103,22,0.2) 48%, rgba(54,31,7,0.66) 100%)",
                  border: "1.5px solid rgba(240,192,64,0.72)",
                  borderRadius: 16,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.48), 0 0 13px rgba(240,192,64,0.32), inset 0 0 9px rgba(255,223,125,0.12)",
                  padding: 0,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <img
                  src={coinBagIconImg}
                  alt="Buy Coins"
                  style={{
                    width: 47,
                    height: 47,
                    objectFit: "contain",
                    filter: "brightness(1.08) drop-shadow(0 0 9px rgba(240,192,64,0.68)) drop-shadow(0 3px 5px rgba(0,0,0,0.65))",
                  }}
                />
                <span
                  aria-hidden="true"
                  className="font-fantasy"
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 18,
                    height: 18,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 999,
                    background: "linear-gradient(145deg, #ffe9a8 0%, #d4a017 58%, #8b5d0b 100%)",
                    border: "1px solid rgba(255,245,190,0.9)",
                    color: "#201204",
                    fontSize: 13,
                    fontWeight: 900,
                    lineHeight: 1,
                    boxShadow: "0 0 8px rgba(240,192,64,0.7)",
                  }}
                >
                  +
                </span>
              </button>
            </div>
          )}
          </div>
        </div>

        {/* RIGHT: gifts on non-home pages; the home page uses its own stage-safe floating cue below the upper-right controls. */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasRewards && location !== "/" && (
            <button
              data-testid="button-gift-rewards"
              aria-label={`Open ${pendingRewards.length} pending reward${pendingRewards.length === 1 ? "" : "s"}`}
              onClick={() => setShowRewards(true)}
              className="relative flex-shrink-0 transition-transform active:scale-90 animate-bounce"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", animationDuration: "2s" }}
            >
              <RewardChestArt size={48} />
              <RewardCountGem count={pendingRewards.length} compact />
            </button>
          )}
        </div>
      </div>

      {/* Floating gift button on the home page — tucked below the upper-right controls so it stays clear of the active pet. */}
      {hasRewards && location === "/" && (
        <button
          data-testid="button-gift-rewards-floating"
          aria-label={`Open ${pendingRewards.length} pending reward${pendingRewards.length === 1 ? "" : "s"}`}
          onClick={() => setShowRewards(true)}
          className="absolute transition-transform active:scale-90"
          style={{
            top: "calc(17*var(--vh))",
            right: "calc(7 * var(--vw))",
            zIndex: 40,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          <RewardChestArt size={70} />
          <RewardCountGem count={pendingRewards.length} />
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
