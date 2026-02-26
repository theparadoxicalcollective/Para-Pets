import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import bgImg from "@assets/bg_home.png";
import navBarImg from "@assets/bar_nav.png";
import scrollRolledIcon from "@assets/icon_scroll_rolled.png";
import globeImg from "@assets/icon_globe.png";
import swordsImg from "@assets/icon_pvp_new.png";
import eggImg from "@assets/icon_pets.png";
import scrollOpenImg from "@assets/scroll_open_new.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetInventory from "@/components/PetInventory";

interface HomePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  acquiredAt: string;
  name: string;
  type: string;
  imageUrl: string | null;
  worldId: string;
}

export default function HomePage({ user }: HomePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [scrollOpen, setScrollOpen] = useState(false);
  const [showPetInventory, setShowPetInventory] = useState(false);
  const [, navigate] = useLocation();

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.shopItemId === currentUser.activePetId && item.type === "pet")
    : null;

  const petLoading = currentUser.activePetId && inventoryLoading;

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
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
                border: activePet ? "none" : "1px dashed rgba(127,191,176,0.2)",
              }}
            >
              {petLoading ? (
                <div className="flex flex-col items-center gap-3 animate-pulse">
                  <div
                    className="w-20 h-20 rounded-full"
                    style={{
                      background: "radial-gradient(ellipse at center, rgba(45,122,79,0.3) 0%, rgba(10,40,20,0.5) 100%)",
                      border: "2px dashed rgba(127,191,176,0.3)",
                    }}
                  />
                  <p className="font-fantasy text-[#7fbfb0] text-xs tracking-wider">Summoning companion...</p>
                </div>
              ) : activePet ? (
                <div className="flex flex-col items-center gap-3 animate-float" data-testid="display-active-pet">
                  <div
                    className="w-32 h-32 rounded-xl flex items-center justify-center overflow-hidden"
                    style={{
                      background: "radial-gradient(ellipse at center, rgba(45,122,79,0.3) 0%, rgba(10,40,20,0.5) 100%)",
                      border: "2px solid rgba(127,255,212,0.3)",
                      boxShadow: "0 0 30px rgba(45,122,79,0.3), 0 8px 20px rgba(0,0,0,0.4)",
                    }}
                  >
                    {activePet.imageUrl ? (
                      <img src={activePet.imageUrl} alt={activePet.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-5xl">🐾</span>
                    )}
                  </div>
                  <div
                    className="px-4 py-2 rounded-md"
                    style={{
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(127,255,212,0.3)",
                    }}
                  >
                    <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider font-semibold text-center" data-testid="text-active-pet-name">
                      {activePet.name}
                    </p>
                  </div>
                </div>
              ) : (
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
              )}
            </div>

            <div
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-4/5 h-4 rounded-full opacity-40"
              style={{ background: "radial-gradient(ellipse, rgba(0,0,0,0.7) 0%, transparent 70%)" }}
            />
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <div className="relative w-full nav-bar-height flex items-center justify-center">
            <img
              src={navBarImg}
              alt="Navigation Bar"
              className="absolute inset-0 w-full h-full object-fill"
              style={{ filter: "drop-shadow(0 -4px 20px rgba(0,0,0,0.8))" }}
            />

            <div className="relative z-10 flex items-center justify-evenly w-full px-6">
              <NavIcon
                src={scrollRolledIcon}
                alt="Quests"
                testId="button-nav-quests"
                onClick={() => setScrollOpen(true)}
              />
              <NavIcon
                src={globeImg}
                alt="Map"
                testId="button-nav-map"
                onClick={() => navigate("/map")}
              />
              <NavIcon
                src={swordsImg}
                alt="Battle"
                testId="button-nav-pvp"
              />
              <NavIcon
                src={eggImg}
                alt="Pets"
                testId="button-nav-pets"
                onClick={() => setShowPetInventory(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {scrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setScrollOpen(false)}
          />
          <div className="relative w-[80%] max-w-[340px] animate-slide-up">
            <button
              data-testid="button-close-scroll"
              onClick={() => setScrollOpen(false)}
              className="absolute -top-3 -right-3 z-30 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                border: "2px solid rgba(212,160,23,0.6)",
                color: "#f0c040",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              X
            </button>
            <div className="relative w-full">
              <img
                src={scrollOpenImg}
                alt="Quest Scroll"
                className="w-full object-contain"
                style={{ filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.8))" }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-[15%] py-[18%]">
                <h3
                  className="font-fantasy text-[#5c3a1e] text-base tracking-widest font-bold mb-4"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                >
                  QUEST LOG
                </h3>
                <div className="w-full flex-1 overflow-y-auto flex flex-col items-center justify-center">
                  <p className="font-fantasy text-[#8b6e4e] text-sm text-center tracking-wider leading-relaxed">
                    No active quests.
                  </p>
                  <p className="font-fantasy text-[#a08060] text-xs text-center tracking-wider mt-3">
                    Explore the realm to discover adventures...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPetInventory && (
        <PetInventory
          user={currentUser}
          onClose={() => setShowPetInventory(false)}
          onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
        />
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

function NavIcon({ src, alt, testId, onClick }: { src: string; alt: string; testId: string; onClick?: () => void }) {
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
      className="flex flex-col items-center group"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <div
        className="nav-icon-size flex items-center justify-center transition-transform duration-150 rounded-xl overflow-hidden"
        style={{
          transform: tapped ? "scale(0.88)" : "scale(1)",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
        }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover rounded-xl transition-all duration-150 group-active:brightness-125"
        />
      </div>
    </button>
  );
}
