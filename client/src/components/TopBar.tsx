import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import homeIconImg from "@assets/icon_home_new.png";
import coinIconImg from "@assets/icon_coin.png";
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
  hideHome?: boolean;
  hideTreehouse?: boolean;
}

export default function TopBar({ user, onProfileClick, onUserUpdate, hideHome, hideTreehouse }: TopBarProps) {
  const [, navigate] = useLocation();
  const [showRewards, setShowRewards] = useState(false);

  const { data: pendingRewards = [] } = useQuery<any[]>({
    queryKey: ["/api/rewards/pending"],
    refetchInterval: 10000,
  });

  const hasRewards = pendingRewards.length > 0;
  const prevRewardCount = useRef(0);

  useEffect(() => {
    if (pendingRewards.length > 0 && prevRewardCount.current === 0) {
      setShowRewards(true);
    }
    prevRewardCount.current = pendingRewards.length;
  }, [pendingRewards.length]);

  return (
    <>
      <div className="flex items-start justify-between px-3 pt-5 gap-2 relative z-20">
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <button
            data-testid="button-profile"
            onClick={onProfileClick}
            className="relative flex-shrink-0 transition-transform duration-150 active:scale-95"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <div className="relative topbar-profile-size">
              <div
                className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                style={{
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                }}
              />
              <div
                className="absolute z-10 overflow-hidden rounded-lg"
                style={{ inset: "0px" }}
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
                    <span className="font-fantasy text-[#d4a017] text-lg font-bold">
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
              onClick={() => navigate("/admin")}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-150 active:scale-90"
              style={{
                background: "linear-gradient(135deg, rgba(212,160,23,0.3) 0%, rgba(180,120,10,0.3) 100%)",
                border: "1.5px solid rgba(212,160,23,0.6)",
                cursor: "pointer",
                boxShadow: "0 0 8px rgba(212,160,23,0.3)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" fill="rgba(240,192,64,0.3)" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center pt-1 gap-1">
          <div className="flex items-center gap-1.5">
            <div
              className="px-5 py-1.5 rounded-md"
              style={{
                background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,160,23,0.2)",
              }}
            >
              <p
                className="font-fantasy text-[#f0c040] text-center font-semibold tracking-widest text-xs"
                style={{ textShadow: "0 0 10px rgba(240,192,64,0.6)" }}
                data-testid="text-username"
              >
                {user.username}
              </p>
            </div>
            {hasRewards && (
              <button
                data-testid="button-gift-rewards"
                onClick={() => setShowRewards(true)}
                className="relative flex-shrink-0 transition-transform active:scale-90 animate-bounce"
                style={{ background: "none", border: "none", cursor: "pointer", animationDuration: "2s" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(ellipse at center, rgba(192,132,252,0.4) 0%, rgba(120,80,200,0.2) 100%)",
                    border: "2px solid rgba(192,132,252,0.6)",
                    boxShadow: "0 0 15px rgba(192,132,252,0.5), 0 0 30px rgba(192,132,252,0.2)",
                  }}
                >
                  <span className="text-lg" style={{ filter: "drop-shadow(0 0 6px rgba(192,132,252,0.8))" }}>🎁</span>
                </div>
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
          <button
            data-testid="button-coin-shop"
            onClick={() => navigate("/coins")}
            className="flex items-center gap-1 px-3 py-0.5 rounded-md transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
              border: "1px solid rgba(212,160,23,0.4)",
              cursor: "pointer",
            }}
          >
            <img
              src={coinIconImg}
              alt="Coins"
              className="w-4 h-4 object-contain"
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
            />
            <span
              className="font-fantasy text-[#f0c040] text-xs font-semibold"
              data-testid="text-coins"
            >
              {user.coins}
            </span>
            <span className="font-fantasy text-[#d4a017] text-[8px]">+</span>
          </button>
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          {!hideHome && (
            <button
              data-testid="button-home"
              onClick={() => navigate("/")}
              className="topbar-icon-size flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-95 rounded-lg overflow-hidden"
              style={{
                background: "none",
                border: "2px solid rgba(212,160,23,0.4)",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                borderRadius: "10px",
              }}
            >
              <img
                src={homeIconImg}
                alt="Home"
                className="w-full h-full object-cover"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.8))" }}
              />
            </button>
          )}
          {!hideTreehouse && (
            <button
              data-testid="button-pet-house"
              onClick={() => navigate("/pet-house")}
              className="w-11 h-11 flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-95 rounded-lg"
              style={{
                background: "linear-gradient(135deg, rgba(20,50,25,0.85) 0%, rgba(10,30,15,0.85) 100%)",
                border: "2px solid rgba(74,222,128,0.4)",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 12px rgba(74,222,128,0.1)",
                borderRadius: "10px",
              }}
            >
              <TreehouseIcon />
            </button>
          )}
        </div>
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

function TreehouseIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tb-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b3d1e" />
          <stop offset="100%" stopColor="#9b5a2e" />
        </linearGradient>
        <linearGradient id="tb-leaf1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="tb-leaf2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="tb-house" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="tb-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <rect x="34" y="50" width="12" height="22" rx="2" fill="url(#tb-trunk)" />
      <rect x="36" y="50" width="3" height="22" rx="1" fill="rgba(0,0,0,0.15)" />
      <ellipse cx="40" cy="44" rx="22" ry="18" fill="url(#tb-leaf1)" />
      <ellipse cx="40" cy="38" rx="18" ry="15" fill="url(#tb-leaf2)" />
      <ellipse cx="40" cy="32" rx="14" ry="12" fill="#4ade80" />
      <ellipse cx="28" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />
      <ellipse cx="52" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />
      <rect x="27" y="34" width="26" height="16" rx="2" fill="url(#tb-house)" />
      <polygon points="25,35 40,24 55,35" fill="url(#tb-roof)" />
      <rect x="36" y="41" width="8" height="9" rx="1" fill="#854d0e" />
      <rect x="29" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />
      <rect x="46" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />
      <circle cx="22" cy="28" r="2" fill="#fde68a" opacity="0.85" />
      <circle cx="58" cy="32" r="1.5" fill="#fde68a" opacity="0.65" />
      <circle cx="18" cy="38" r="1.5" fill="#86efac" opacity="0.6" />
    </svg>
  );
}
