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
                className="absolute inset-[-4px] rounded-xl z-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(200,170,80,0.15) 0%, transparent 65%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                style={{
                  border: "2.5px solid #b8942e",
                  boxShadow: "0 0 8px rgba(184,148,46,0.25), inset 0 0 4px rgba(184,148,46,0.1), 0 2px 6px rgba(0,0,0,0.5)",
                }}
              />
              <svg className="absolute inset-[-4px] z-30 pointer-events-none" style={{ width: "calc(100% + 8px)", height: "calc(100% + 8px)" }} viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d4a830"/>
                    <stop offset="50%" stopColor="#f0d060"/>
                    <stop offset="100%" stopColor="#b8942e"/>
                  </linearGradient>
                </defs>
                <path d="M6 14 C6 10, 10 6, 14 6" stroke="url(#goldGrad)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                <path d="M14 6 C11 9, 9 11, 6 14" stroke="#d4a830" strokeWidth="0.6" fill="none" opacity="0.4" strokeDasharray="1.5 2"/>
                <path d="M6 8 Q4 10, 5 12" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <path d="M8 6 Q10 4, 12 5" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <circle cx="6" cy="6" r="2" fill="none" stroke="#d4a830" strokeWidth="0.7" opacity="0.5"/>
                <circle cx="6" cy="6" r="0.8" fill="#f0d060" opacity="0.6"/>
                <path d="M62 14 C62 10, 58 6, 54 6" stroke="url(#goldGrad)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                <path d="M54 6 C57 9, 59 11, 62 14" stroke="#d4a830" strokeWidth="0.6" fill="none" opacity="0.4" strokeDasharray="1.5 2"/>
                <path d="M62 8 Q64 10, 63 12" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <path d="M60 6 Q58 4, 56 5" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <circle cx="62" cy="6" r="2" fill="none" stroke="#d4a830" strokeWidth="0.7" opacity="0.5"/>
                <circle cx="62" cy="6" r="0.8" fill="#f0d060" opacity="0.6"/>
                <path d="M6 54 C6 58, 10 62, 14 62" stroke="url(#goldGrad)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                <path d="M14 62 C11 59, 9 57, 6 54" stroke="#d4a830" strokeWidth="0.6" fill="none" opacity="0.4" strokeDasharray="1.5 2"/>
                <path d="M6 60 Q4 58, 5 56" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <path d="M8 62 Q10 64, 12 63" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <circle cx="6" cy="62" r="2" fill="none" stroke="#d4a830" strokeWidth="0.7" opacity="0.5"/>
                <circle cx="6" cy="62" r="0.8" fill="#f0d060" opacity="0.6"/>
                <path d="M62 54 C62 58, 58 62, 54 62" stroke="url(#goldGrad)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                <path d="M54 62 C57 59, 59 57, 62 54" stroke="#d4a830" strokeWidth="0.6" fill="none" opacity="0.4" strokeDasharray="1.5 2"/>
                <path d="M62 60 Q64 58, 63 56" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <path d="M60 62 Q58 64, 56 63" stroke="#c9a030" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <circle cx="62" cy="62" r="2" fill="none" stroke="#d4a830" strokeWidth="0.7" opacity="0.5"/>
                <circle cx="62" cy="62" r="0.8" fill="#f0d060" opacity="0.6"/>
                <line x1="18" y1="5" x2="50" y2="5" stroke="#c9a030" strokeWidth="0.4" opacity="0.3"/>
                <line x1="18" y1="63" x2="50" y2="63" stroke="#c9a030" strokeWidth="0.4" opacity="0.3"/>
                <line x1="5" y1="18" x2="5" y2="50" stroke="#c9a030" strokeWidth="0.4" opacity="0.3"/>
                <line x1="63" y1="18" x2="63" y2="50" stroke="#c9a030" strokeWidth="0.4" opacity="0.3"/>
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
