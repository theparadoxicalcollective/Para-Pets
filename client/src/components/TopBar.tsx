import { useState } from "react";
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
                className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                style={{
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 3px rgba(201,160,48,0.15)",
                }}
              />
              <svg
                className="absolute z-30 pointer-events-none"
                style={{ top: "-8px", left: "-8px", width: "32px", height: "32px" }}
                viewBox="0 0 40 40"
                fill="none"
              >
                <path d="M20,38 C18,30 14,24 6,22" fill="none" stroke="#3a6a2a" strokeWidth="2" strokeLinecap="round" />
                <path d="M10,26 Q6,22 10,20 Q8,24 10,26 Z" fill="#4a7a3a" />
                <path d="M16,32 Q12,28 16,26 Q14,30 16,32 Z" fill="#3a6a2a" opacity="0.85" />
                <path d="M6,22 Q2,18 6,16 Q4,20 6,22 Z" fill="#4a7a3a" opacity="0.75" />
                <circle cx="8" cy="20" r="1" fill="#f0c040" opacity="0.5" />
              </svg>
              <svg
                className="absolute z-30 pointer-events-none"
                style={{ bottom: "-6px", right: "-6px", width: "24px", height: "24px" }}
                viewBox="0 0 30 30"
                fill="none"
              >
                <path d="M10,2 C12,10 16,14 24,16" fill="none" stroke="#3a6a2a" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M18,12 Q22,14 20,18 Q20,14 18,12 Z" fill="#4a7a3a" opacity="0.8" />
                <circle cx="22" cy="16" r="0.8" fill="#f0c040" opacity="0.4" />
              </svg>
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
