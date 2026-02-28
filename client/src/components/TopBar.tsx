import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import profileFrameImg from "@assets/frame_profile_thin.png";
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
}

export default function TopBar({ user, onProfileClick, onUserUpdate, hideHome }: TopBarProps) {
  const [, navigate] = useLocation();
  const [showRewards, setShowRewards] = useState(false);

  const { data: pendingRewards = [] } = useQuery<any[]>({
    queryKey: ["/api/rewards/pending"],
    refetchInterval: 30000,
  });

  const hasRewards = pendingRewards.length > 0;

  return (
    <>
      <div className="flex items-start justify-between px-3 pt-5 gap-2">
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <button
            data-testid="button-profile"
            onClick={onProfileClick}
            className="relative flex-shrink-0 transition-transform duration-150 active:scale-95"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <div className="relative topbar-profile-size">
              <div
                className="absolute inset-[-3px] rounded-lg z-0"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, transparent 70%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                style={{
                  border: "2px solid #c9a84c",
                  boxShadow: "0 0 6px rgba(201,168,76,0.4), inset 0 0 4px rgba(201,168,76,0.15), 0 2px 8px rgba(0,0,0,0.7)",
                }}
              />
              <svg className="absolute inset-0 w-full h-full z-30 pointer-events-none" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 30 C2 20, 5 12, 10 6" stroke="#8db860" strokeWidth="1.2" fill="none" opacity="0.9"/>
                <path d="M6 10 C4 8, 2 9, 3 12" stroke="#8db860" strokeWidth="0.8" fill="none" opacity="0.7"/>
                <ellipse cx="3" cy="11" rx="2.5" ry="1.5" fill="#6a9e3a" opacity="0.8" transform="rotate(-30 3 11)"/>
                <ellipse cx="7" cy="7" rx="2" ry="1.2" fill="#7ab648" opacity="0.7" transform="rotate(-60 7 7)"/>
                <path d="M30 2 C20 2, 12 5, 6 10" stroke="#8db860" strokeWidth="1.2" fill="none" opacity="0.9"/>
                <ellipse cx="18" cy="2.5" rx="2.2" ry="1.3" fill="#6a9e3a" opacity="0.75" transform="rotate(10 18 2.5)"/>
                <ellipse cx="12" cy="4" rx="1.8" ry="1.1" fill="#7ab648" opacity="0.65" transform="rotate(-15 12 4)"/>
                <path d="M58 30 C58 40, 55 48, 50 54" stroke="#8db860" strokeWidth="1.2" fill="none" opacity="0.9"/>
                <path d="M54 50 C56 52, 58 51, 57 48" stroke="#8db860" strokeWidth="0.8" fill="none" opacity="0.7"/>
                <ellipse cx="57" cy="49" rx="2.5" ry="1.5" fill="#6a9e3a" opacity="0.8" transform="rotate(150 57 49)"/>
                <ellipse cx="53" cy="53" rx="2" ry="1.2" fill="#7ab648" opacity="0.7" transform="rotate(120 53 53)"/>
                <path d="M30 58 C40 58, 48 55, 54 50" stroke="#8db860" strokeWidth="1.2" fill="none" opacity="0.9"/>
                <ellipse cx="42" cy="57.5" rx="2.2" ry="1.3" fill="#6a9e3a" opacity="0.75" transform="rotate(-170 42 57.5)"/>
                <ellipse cx="48" cy="56" rx="1.8" ry="1.1" fill="#7ab648" opacity="0.65" transform="rotate(165 48 56)"/>
                <circle cx="5" cy="5" r="1" fill="#c9a84c" opacity="0.6"/>
                <circle cx="55" cy="55" r="1" fill="#c9a84c" opacity="0.6"/>
              </svg>
              <div
                className="absolute z-10 overflow-hidden rounded-md"
                style={{ inset: "3px" }}
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
