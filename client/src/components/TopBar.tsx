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
              <svg
                className="absolute z-30 pointer-events-none"
                style={{ inset: "-6px", width: "calc(100% + 12px)", height: "calc(100% + 12px)" }}
                viewBox="0 0 80 80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="vineGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#5a3a1a" />
                    <stop offset="100%" stopColor="#3a2210" />
                  </linearGradient>
                  <linearGradient id="leafG1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4a7a3a" />
                    <stop offset="100%" stopColor="#2d5a1e" />
                  </linearGradient>
                  <linearGradient id="leafG2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3a6a2a" />
                    <stop offset="100%" stopColor="#1e4a10" />
                  </linearGradient>
                </defs>

                <rect x="7" y="7" width="66" height="66" rx="8" fill="none" stroke="url(#vineGrad)" strokeWidth="2.5" />
                <rect x="7" y="7" width="66" height="66" rx="8" fill="none" stroke="rgba(90,58,26,0.3)" strokeWidth="1" strokeDasharray="2 3" />

                <path d="M10,18 C8,14 8,10 12,8 C10,10 10,14 10,18" fill="url(#vineGrad)" opacity="0.8" />
                <path d="M6,12 Q4,8 8,6" fill="none" stroke="#3a5a28" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8,6 Q5,3 7,8 Q8,4 8,6 Z" fill="url(#leafG1)" opacity="0.9" />
                <path d="M5,10 Q2,7 5,11 Q5,8 5,10 Z" fill="url(#leafG2)" opacity="0.7" />

                <path d="M70,18 C72,14 72,10 68,8 C70,10 70,14 70,18" fill="url(#vineGrad)" opacity="0.8" />
                <path d="M74,12 Q76,8 72,6" fill="none" stroke="#3a5a28" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M72,6 Q75,3 73,8 Q72,4 72,6 Z" fill="url(#leafG1)" opacity="0.9" />
                <path d="M75,10 Q78,7 75,11 Q75,8 75,10 Z" fill="url(#leafG2)" opacity="0.7" />

                <path d="M10,62 C8,66 8,70 12,72 C10,70 10,66 10,62" fill="url(#vineGrad)" opacity="0.8" />
                <path d="M6,68 Q4,72 8,74" fill="none" stroke="#3a5a28" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8,74 Q5,77 7,72 Q8,76 8,74 Z" fill="url(#leafG1)" opacity="0.9" />
                <path d="M5,70 Q2,73 5,69 Q5,72 5,70 Z" fill="url(#leafG2)" opacity="0.7" />

                <path d="M70,62 C72,66 72,70 68,72 C70,70 70,66 70,62" fill="url(#vineGrad)" opacity="0.8" />
                <path d="M74,68 Q76,72 72,74" fill="none" stroke="#3a5a28" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M72,74 Q75,77 73,72 Q72,76 72,74 Z" fill="url(#leafG1)" opacity="0.9" />
                <path d="M75,70 Q78,73 75,69 Q75,72 75,70 Z" fill="url(#leafG2)" opacity="0.7" />

                <circle cx="8" cy="8" r="1.2" fill="#f0c040" opacity="0.35" />
                <circle cx="72" cy="8" r="1" fill="#f0c040" opacity="0.3" />
                <circle cx="8" cy="72" r="1" fill="#f0c040" opacity="0.3" />
                <circle cx="72" cy="72" r="1.2" fill="#f0c040" opacity="0.35" />
              </svg>
              <div
                className="absolute z-20 inset-0 rounded-lg pointer-events-none"
                style={{
                  boxShadow: "0 0 12px rgba(42,90,40,0.2), 0 3px 10px rgba(0,0,0,0.5)",
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
