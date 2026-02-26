import { useState } from "react";
import { useLocation } from "wouter";
import bgImg from "@assets/bg_home.png";
import navBarImg from "@assets/bar_nav.png";
import questImg from "@assets/icon_quest.png";
import mapImg from "@assets/icon_map.png";
import swordsImg from "@assets/icon_pvp.png";
import eggImg from "@assets/icon_pets.png";
import scrollRolledImg from "@assets/scroll_rolled.png";
import scrollOpenImg from "@assets/scroll_open.png";
import TopBar from "@/components/TopBar";
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
  const [scrollOpen, setScrollOpen] = useState(false);
  const [, navigate] = useLocation();

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
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

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

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
                onClick={() => setScrollOpen(true)}
              />
              <NavIcon
                src={mapImg}
                alt="Map"
                label="Map"
                testId="button-nav-map"
                onClick={() => navigate("/map")}
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

      {!scrollOpen && (
        <button
          data-testid="button-scroll-rolled"
          onClick={() => setScrollOpen(true)}
          className="absolute z-20 transition-transform duration-200 active:scale-95"
          style={{
            bottom: "90px",
            right: "16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.8))",
          }}
        >
          <img
            src={scrollRolledImg}
            alt="Quest Scroll"
            className="w-14 h-14 object-contain"
          />
        </button>
      )}

      {scrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "480px", margin: "0 auto", left: 0, right: 0 }}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setScrollOpen(false)}
          />
          <div
            className="relative w-[85%] max-h-[70vh] flex flex-col items-center animate-slide-up"
          >
            <div className="relative w-full">
              <img
                src={scrollOpenImg}
                alt="Quest Scroll"
                className="w-full object-contain"
                style={{ filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.8))" }}
              />
              <div
                className="absolute inset-0 flex flex-col items-center justify-center px-[18%] py-[22%]"
              >
                <h3
                  className="font-fantasy text-[#5c3a1e] text-sm tracking-widest font-bold mb-3"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                >
                  QUEST LOG
                </h3>
                <div className="w-full flex-1 overflow-y-auto">
                  <p className="font-fantasy text-[#8b6e4e] text-xs text-center tracking-wider leading-relaxed">
                    No active quests.
                  </p>
                  <p className="font-fantasy text-[#a08060] text-[10px] text-center tracking-wider mt-2">
                    Explore the realm to discover adventures...
                  </p>
                </div>
              </div>
            </div>
            <button
              data-testid="button-close-scroll"
              onClick={() => setScrollOpen(false)}
              className="mt-3 px-6 py-2 rounded-md font-fantasy text-xs tracking-widest transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                color: "#f0c040",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
              }}
            >
              Close Scroll
            </button>
          </div>
        </div>
      )}

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

function NavIcon({ src, alt, label, testId, onClick }: { src: string; alt: string; label: string; testId: string; onClick?: () => void }) {
  const [tapped, setTapped] = useState(false);

  const handleTap = () => {
    setTapped(true);
    setTimeout(() => setTapped(false), 200);
    onClick?.();
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
