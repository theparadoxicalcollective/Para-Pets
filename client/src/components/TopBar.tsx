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
                className="absolute inset-[-5px] rounded-xl z-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(80,200,160,0.2) 0%, rgba(40,120,90,0.1) 40%, transparent 70%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-lg z-20 pointer-events-none"
                style={{
                  border: "2px solid #a08030",
                  boxShadow: "0 0 10px rgba(80,200,140,0.3), 0 0 20px rgba(60,160,120,0.15), inset 0 0 6px rgba(80,200,140,0.1), 0 2px 8px rgba(0,0,0,0.6)",
                }}
              />
              <svg className="absolute inset-[-6px] z-30 pointer-events-none" style={{ width: "calc(100% + 12px)", height: "calc(100% + 12px)" }} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#7fffd4" stopOpacity="0.6"/>
                    <stop offset="100%" stopColor="#7fffd4" stopOpacity="0"/>
                  </radialGradient>
                </defs>
                <path d="M8 42 C6 34, 6 26, 8 18 C9 14, 11 10, 14 8" stroke="#3a7a50" strokeWidth="1.5" fill="none" opacity="0.85"/>
                <path d="M8 36 C5 33, 3 36, 5 38" stroke="#4a8a60" strokeWidth="1" fill="none" opacity="0.6"/>
                <path d="M7 28 C4 26, 3 28, 5 30" stroke="#4a8a60" strokeWidth="1" fill="none" opacity="0.6"/>
                <path d="M10 20 C7 18, 5 20, 7 22" stroke="#4a8a60" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <ellipse cx="4" cy="37" rx="3" ry="1.8" fill="#2d6b40" opacity="0.7" transform="rotate(-20 4 37)"/>
                <ellipse cx="3.5" cy="29" rx="2.8" ry="1.6" fill="#3a7a50" opacity="0.65" transform="rotate(15 3.5 29)"/>
                <ellipse cx="6" cy="21" rx="2.5" ry="1.4" fill="#2d6b40" opacity="0.6" transform="rotate(-35 6 21)"/>
                <ellipse cx="9" cy="14" rx="2.2" ry="1.3" fill="#3a7a50" opacity="0.55" transform="rotate(25 9 14)"/>
                <path d="M14 8 C20 6, 28 6, 36 6" stroke="#3a7a50" strokeWidth="1.3" fill="none" opacity="0.8"/>
                <ellipse cx="18" cy="6.5" rx="2.8" ry="1.5" fill="#2d6b40" opacity="0.6" transform="rotate(5 18 6.5)"/>
                <ellipse cx="26" cy="5.5" rx="2.5" ry="1.4" fill="#3a7a50" opacity="0.55" transform="rotate(-10 26 5.5)"/>
                <path d="M64 30 C66 38, 66 46, 64 54 C63 58, 61 62, 58 64" stroke="#3a7a50" strokeWidth="1.5" fill="none" opacity="0.85"/>
                <path d="M64 36 C67 39, 69 36, 67 34" stroke="#4a8a60" strokeWidth="1" fill="none" opacity="0.6"/>
                <path d="M65 44 C68 46, 69 44, 67 42" stroke="#4a8a60" strokeWidth="1" fill="none" opacity="0.6"/>
                <path d="M62 52 C65 54, 67 52, 65 50" stroke="#4a8a60" strokeWidth="0.8" fill="none" opacity="0.5"/>
                <ellipse cx="68" cy="35" rx="3" ry="1.8" fill="#2d6b40" opacity="0.7" transform="rotate(160 68 35)"/>
                <ellipse cx="68.5" cy="43" rx="2.8" ry="1.6" fill="#3a7a50" opacity="0.65" transform="rotate(-165 68.5 43)"/>
                <ellipse cx="66" cy="51" rx="2.5" ry="1.4" fill="#2d6b40" opacity="0.6" transform="rotate(145 66 51)"/>
                <ellipse cx="63" cy="58" rx="2.2" ry="1.3" fill="#3a7a50" opacity="0.55" transform="rotate(-155 63 58)"/>
                <path d="M58 64 C52 66, 44 66, 36 66" stroke="#3a7a50" strokeWidth="1.3" fill="none" opacity="0.8"/>
                <ellipse cx="54" cy="65.5" rx="2.8" ry="1.5" fill="#2d6b40" opacity="0.6" transform="rotate(-175 54 65.5)"/>
                <ellipse cx="46" cy="66.5" rx="2.5" ry="1.4" fill="#3a7a50" opacity="0.55" transform="rotate(170 46 66.5)"/>
                <circle cx="5" cy="38" r="1.2" fill="url(#glow1)" opacity="0.7"/>
                <circle cx="68" cy="34" r="1.2" fill="url(#glow1)" opacity="0.7"/>
                <circle cx="12" cy="10" r="1" fill="url(#glow1)" opacity="0.5"/>
                <circle cx="60" cy="62" r="1" fill="url(#glow1)" opacity="0.5"/>
                <circle cx="4" cy="30" r="0.7" fill="#7fffd4" opacity="0.4"/>
                <circle cx="67" cy="44" r="0.7" fill="#7fffd4" opacity="0.4"/>
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
