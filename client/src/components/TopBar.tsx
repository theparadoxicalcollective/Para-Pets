import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import homeIconImg from "@assets/icon_home_new.png";
import coinIconImg from "@assets/icon_coin.png";
import petHouseIconImg from "@assets/icon_pet_house.png";
import marketIconImg from "@assets/icon_market.png";
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
                onClick={() => navigate("/admin")}
                className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-90"
                style={{
                  background: "linear-gradient(135deg, rgba(212,160,23,0.25) 0%, rgba(180,120,10,0.25) 100%)",
                  border: "2px solid rgba(212,160,23,0.6)",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 14px rgba(212,160,23,0.2)",
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
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{
                      background: "radial-gradient(ellipse at center, rgba(192,132,252,0.4) 0%, rgba(120,80,200,0.2) 100%)",
                      border: "2px solid rgba(192,132,252,0.6)",
                      boxShadow: "0 0 15px rgba(192,132,252,0.5), 0 0 30px rgba(192,132,252,0.2)",
                    }}
                  >
                    <span className="text-sm" style={{ filter: "drop-shadow(0 0 6px rgba(192,132,252,0.8))" }}>🎁</span>
                  </div>
                  <div
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                    style={{
                      background: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
                      border: "1.5px solid rgba(30,15,5,0.8)",
                      boxShadow: "0 0 6px rgba(248,113,113,0.6)",
                    }}
                  >
                    <span className="font-bold text-[7px] text-white leading-none">{pendingRewards.length}</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: three nav icons laid out horizontally */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!hideHome && (
            <button
              data-testid="button-home"
              onClick={() => navigate("/")}
              className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-95 overflow-hidden"
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
              className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-95 overflow-hidden"
              style={{
                background: "none",
                border: "2px solid rgba(74,222,128,0.45)",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 14px rgba(74,222,128,0.15)",
                padding: 0,
                borderRadius: "10px",
              }}
            >
              <img
                src={petHouseIconImg}
                alt="Pet House"
                className="w-full h-full object-cover"
              />
            </button>
          )}
          <button
            data-testid="button-market"
            onClick={() => navigate("/market")}
            className="topbar-icon-size-sm flex-shrink-0 flex items-center justify-center transition-transform duration-150 active:scale-95 overflow-hidden"
            style={{
              background: "none",
              border: "2px solid rgba(74,222,128,0.45)",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.6), 0 0 14px rgba(74,222,128,0.15)",
              padding: 0,
              borderRadius: "10px",
            }}
          >
            <img
              src={marketIconImg}
              alt="Player Market"
              className="w-full h-full object-cover"
            />
          </button>
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
