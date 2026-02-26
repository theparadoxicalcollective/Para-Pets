import { useState } from "react";
import { useLocation } from "wouter";
import profileFrameImg from "@assets/frame_profile.png";
import shopIconImg from "@assets/icon_shop_new.png";
import homeIconImg from "@assets/icon_home_new.png";
import coinIconImg from "@assets/icon_coin.png";

interface TopBarProps {
  user: {
    id: string;
    username: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
  };
  onProfileClick: () => void;
}

export default function TopBar({ user, onProfileClick }: TopBarProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-start justify-between px-3 pt-5 gap-2">
      <button
        data-testid="button-profile"
        onClick={onProfileClick}
        className="relative flex-shrink-0 transition-transform duration-150 active:scale-95"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <div className="relative topbar-profile-size">
          <img
            src={profileFrameImg}
            alt="Profile Frame"
            className="absolute inset-0 w-full h-full object-contain z-20"
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }}
          />
          <div
            className="absolute z-10 overflow-hidden rounded-sm"
            style={{ inset: "10px" }}
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

      <div className="flex-1 flex flex-col items-center pt-1">
        <div
          className="px-5 py-1.5 rounded-md"
          style={{
            background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
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
      </div>

      <div className="flex-shrink-0 flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-md"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
              border: "1px solid rgba(212,160,23,0.4)",
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
          </div>

          <button
            data-testid="button-shop"
            className="topbar-icon-size flex items-center justify-center transition-transform duration-150 active:scale-95 rounded-lg overflow-hidden"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <img
              src={shopIconImg}
              alt="Shop"
              className="w-full h-full object-cover rounded-lg"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
            />
          </button>
        </div>

        <button
          data-testid="button-home"
          onClick={() => navigate("/")}
          className="topbar-icon-size flex items-center justify-center transition-transform duration-150 active:scale-95 rounded-lg overflow-hidden"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <img
            src={homeIconImg}
            alt="Home"
            className="w-full h-full object-cover rounded-lg"
            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
          />
        </button>
      </div>
    </div>
  );
}
