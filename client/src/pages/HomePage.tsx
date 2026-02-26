import { useState } from "react";
import bgImg from "@assets/bg_home.png";
import profileFrameImg from "@assets/frame_profile.png";
import shopIconImg from "@assets/icon_shop.png";
import navBarImg from "@assets/bar_nav.png";
import questImg from "@assets/icon_quest.png";
import mapImg from "@assets/icon_map.png";
import swordsImg from "@assets/icon_pvp.png";
import eggImg from "@assets/icon_pets.png";
import UserProfilePanel from "@/components/UserProfilePanel";

interface HomePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

export default function HomePage({ user }: HomePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* TOP BAR */}
        <div className="flex items-start justify-between px-3 pt-5 gap-2">

          {/* TOP LEFT - Profile Portrait */}
          <button
            data-testid="button-profile"
            onClick={() => setShowProfile(true)}
            className="relative flex-shrink-0 transition-transform duration-150 active:scale-95"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <div className="relative w-[68px] h-[68px]">
              <img
                src={profileFrameImg}
                alt="Profile Frame"
                className="absolute inset-0 w-full h-full object-contain z-20"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }}
              />
              <div
                className="absolute z-10 overflow-hidden rounded-sm"
                style={{
                  inset: "14px",
                }}
              >
                {currentUser.profileImage ? (
                  <img
                    data-testid="img-profile-avatar"
                    src={currentUser.profileImage}
                    alt={currentUser.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)" }}
                  >
                    <span className="font-fantasy text-[#d4a017] text-xl font-bold">
                      {currentUser.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </button>

          {/* TOP CENTER - Username */}
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
                {currentUser.username}
              </p>
            </div>
          </div>

          {/* TOP RIGHT - Shop + Coins */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <button
              data-testid="button-shop"
              className="w-14 h-14 flex items-center justify-center transition-transform duration-150 active:scale-95"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <img
                src={shopIconImg}
                alt="Shop"
                className="w-14 h-14 object-contain drop-shadow-lg"
              />
            </button>
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-md"
              style={{
                background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
                border: "1px solid rgba(212,160,23,0.4)",
              }}
            >
              <span className="text-yellow-400 text-xs">&#9733;</span>
              <span
                className="font-fantasy text-[#f0c040] text-xs font-semibold"
                data-testid="text-coins"
              >
                {currentUser.coins}
              </span>
            </div>
          </div>
        </div>

        {/* CENTER - Pet Platform Area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-4">
          <div className="relative w-full max-w-xs">
            <div
              className="w-full aspect-square rounded-xl flex flex-col items-center justify-center"
              style={{
                background: "radial-gradient(ellipse at center, rgba(45,122,79,0.15) 0%, transparent 70%)",
                border: "1px dashed rgba(127,191,176,0.2)",
              }}
            >
              <div className="text-center space-y-3 animate-float">
                <div
                  className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(ellipse at center, rgba(45,122,79,0.3) 0%, rgba(10,40,20,0.5) 100%)",
                    border: "2px dashed rgba(127,191,176,0.3)",
                    boxShadow: "0 0 30px rgba(45,122,79,0.3)",
                  }}
                >
                  <span className="text-3xl" style={{ filter: "grayscale(100%) opacity(0.3)" }}>?</span>
                </div>
                <div
                  className="px-4 py-2 rounded-md mx-4"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(127,191,176,0.2)",
                  }}
                >
                  <p className="font-fantasy text-[#7fbfb0] text-xs tracking-wider leading-relaxed">
                    Your companion awaits...
                  </p>
                  <p className="font-fantasy text-[#5a8a78] text-xs tracking-wider">
                    Acquire a pet to begin
                  </p>
                </div>
              </div>
            </div>

            <div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-4/5 h-4 rounded-full opacity-40"
              style={{ background: "radial-gradient(ellipse, rgba(0,0,0,0.7) 0%, transparent 70%)" }}
            />
          </div>
        </div>

        {/* BOTTOM NAVIGATION */}
        <div className="relative flex-shrink-0">
          <div className="relative w-full h-20 flex items-center justify-center">
            <img
              src={navBarImg}
              alt="Navigation Bar"
              className="absolute inset-0 w-full h-full object-fill"
              style={{ filter: "drop-shadow(0 -4px 20px rgba(0,0,0,0.8))" }}
            />

            <div className="relative z-10 flex items-center justify-evenly w-full px-10">
              <NavIcon
                src={questImg}
                alt="Quests"
                label="Quests"
                testId="button-nav-quests"
              />
              <NavIcon
                src={mapImg}
                alt="Map"
                label="Map"
                testId="button-nav-map"
              />
              <NavIcon
                src={swordsImg}
                alt="PvP"
                label="Battle"
                testId="button-nav-pvp"
              />
              <NavIcon
                src={eggImg}
                alt="Pets"
                label="Pets"
                testId="button-nav-pets"
              />
            </div>
          </div>
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}

function NavIcon({ src, alt, label, testId }: { src: string; alt: string; label: string; testId: string }) {
  const [tapped, setTapped] = useState(false);

  const handleTap = () => {
    setTapped(true);
    setTimeout(() => setTapped(false), 200);
  };

  return (
    <button
      data-testid={testId}
      onClick={handleTap}
      className="flex flex-col items-center gap-0 group"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <div
        className="w-11 h-11 flex items-center justify-center transition-transform duration-150 rounded-lg overflow-hidden"
        style={{ transform: tapped ? "scale(0.88)" : "scale(1)" }}
      >
        <img
          src={src}
          alt={alt}
          className="w-11 h-11 object-contain drop-shadow-lg transition-all duration-150 group-active:brightness-125"
        />
      </div>
      <span
        className="font-fantasy text-[9px] tracking-wider transition-colors"
        style={{
          color: "rgba(240,192,64,0.8)",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}
      >
        {label}
      </span>
    </button>
  );
}
