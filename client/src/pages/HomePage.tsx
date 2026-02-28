import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import bgImg from "@assets/bg_home_v2.png";
import navBarImg from "@assets/bar_nav.png";
import questIcon from "@assets/icon_quest_v5.png";
import globeImg from "@assets/icon_globe.png";
import swordsImg from "@assets/icon_pvp_new.png";
import eggImg from "@assets/icon_pets.png";
import questLogBg from "@assets/quest_log_bg_v2.png";
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
  rarity: number | null;
  hatchTime: number | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  hatchStartedAt: string | null;
  isHatched: boolean;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
}

export default function HomePage({ user }: HomePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [scrollOpen, setScrollOpen] = useState(false);
  const [showPetInventory, setShowPetInventory] = useState(false);
  const [showPvpNotice, setShowPvpNotice] = useState(false);
  const [, navigate] = useLocation();

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.shopItemId === currentUser.activePetId && item.type === "pet")
    : null;

  const petLoading = currentUser.activePetId && inventoryLoading;

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col"
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

      <style>{`
        @keyframes orbFloat1 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(15px, -30px) scale(1.2); opacity: 0.6; }
          50% { transform: translate(-10px, -50px) scale(0.9); opacity: 0.4; }
          75% { transform: translate(20px, -25px) scale(1.1); opacity: 0.55; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
        }
        @keyframes orbFloat2 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.25; }
          30% { transform: translate(-20px, -15px) scale(1.3); opacity: 0.5; }
          60% { transform: translate(10px, -40px) scale(0.8); opacity: 0.35; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
        }
        @keyframes orbFloat3 {
          0% { transform: translate(0, 0) scale(0.9); opacity: 0.2; }
          40% { transform: translate(25px, -20px) scale(1.15); opacity: 0.5; }
          70% { transform: translate(-15px, -35px) scale(1); opacity: 0.3; }
          100% { transform: translate(0, 0) scale(0.9); opacity: 0.2; }
        }
        @keyframes orbPulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>

      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute" style={{ left: "12%", top: "25%", width: "8px", height: "8px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.8) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 12px rgba(127,255,212,0.5), 0 0 25px rgba(127,255,212,0.2)", animation: "orbFloat1 8s ease-in-out infinite" }} />
        <div className="absolute" style={{ right: "15%", top: "20%", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,230,255,0.8) 0%, rgba(200,230,255,0) 70%)", boxShadow: "0 0 10px rgba(200,230,255,0.4), 0 0 20px rgba(200,230,255,0.15)", animation: "orbFloat2 10s ease-in-out infinite 1s" }} />
        <div className="absolute" style={{ left: "25%", top: "55%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(180,255,200,0.7) 0%, rgba(180,255,200,0) 70%)", boxShadow: "0 0 8px rgba(180,255,200,0.4), 0 0 18px rgba(180,255,200,0.15)", animation: "orbFloat3 9s ease-in-out infinite 2s" }} />
        <div className="absolute" style={{ right: "20%", top: "45%", width: "7px", height: "7px", borderRadius: "50%", background: "radial-gradient(circle, rgba(240,220,130,0.7) 0%, rgba(240,220,130,0) 70%)", boxShadow: "0 0 10px rgba(240,220,130,0.4), 0 0 22px rgba(240,220,130,0.15)", animation: "orbFloat1 11s ease-in-out infinite 3s" }} />
        <div className="absolute" style={{ left: "8%", top: "40%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.6) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 6px rgba(127,255,212,0.3)", animation: "orbFloat2 7s ease-in-out infinite 4s" }} />
        <div className="absolute" style={{ right: "10%", top: "65%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(160,200,255,0.6) 0%, rgba(160,200,255,0) 70%)", boxShadow: "0 0 8px rgba(160,200,255,0.3)", animation: "orbFloat3 12s ease-in-out infinite 1.5s" }} />
        <div className="absolute" style={{ left: "45%", top: "15%", width: "10px", height: "10px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,255,220,0.4) 0%, rgba(200,255,220,0) 70%)", boxShadow: "0 0 15px rgba(200,255,220,0.2), 0 0 30px rgba(200,255,220,0.1)", animation: "orbPulse 5s ease-in-out infinite" }} />
        <div className="absolute" style={{ left: "65%", top: "35%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,240,180,0.7) 0%, rgba(255,240,180,0) 70%)", boxShadow: "0 0 6px rgba(255,240,180,0.3)", animation: "orbFloat1 6s ease-in-out infinite 5s" }} />
      </div>

      <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} hideHome />

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
                      border: activePet.isHatched ? "2px solid rgba(127,255,212,0.3)" : "2px solid rgba(240,192,64,0.3)",
                      boxShadow: activePet.isHatched
                        ? "0 0 30px rgba(45,122,79,0.3), 0 8px 20px rgba(0,0,0,0.4)"
                        : "0 0 30px rgba(240,192,64,0.2), 0 8px 20px rgba(0,0,0,0.4)",
                    }}
                  >
                    {activePet.isHatched ? (
                      (activePet.hatchedImageUrl || activePet.imageUrl) ? (
                        <img src={activePet.hatchedImageUrl || activePet.imageUrl || ""} alt={activePet.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-5xl">🐾</span>
                      )
                    ) : (
                      activePet.eggImageUrl ? (
                        <img src={activePet.eggImageUrl} alt={activePet.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-5xl">🥚</span>
                      )
                    )}
                  </div>

                  <div className="w-40 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full px-4 py-1.5 rounded-md"
                      style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(127,255,212,0.3)" }}
                    >
                      <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider font-semibold text-center" data-testid="text-active-pet-name">
                        {activePet.name}
                      </p>
                    </div>

                    {activePet.isHatched ? (
                      <div className="w-full space-y-1">
                        <HomePetBar label="HP" value={activePet.petHealth} max={5000} color="#4ade80" />
                        <HomePetBar label="LV" value={activePet.petLevel} max={100} color="#c084fc" />
                      </div>
                    ) : activePet.hatchStartedAt && activePet.hatchTime ? (
                      <HomeHatchBar hatchStartedAt={activePet.hatchStartedAt} hatchTime={activePet.hatchTime} />
                    ) : null}
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
                src={globeImg}
                alt="Map"
                testId="button-nav-map"
                onClick={() => navigate("/map")}
                round
              />
              <NavIcon
                src={questIcon}
                alt="Quests"
                testId="button-nav-quests"
                onClick={() => setScrollOpen(true)}
              />
              <NavIcon
                src={swordsImg}
                alt="Battle"
                testId="button-nav-pvp"
                onClick={() => setShowPvpNotice(true)}
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
            data-testid="backdrop-quest-log"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setScrollOpen(false)}
          />
          <div className="relative w-[88%] max-w-[380px] animate-slide-up">
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
                src={questLogBg}
                alt="Quest Log"
                className="w-full object-contain"
                style={{ filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.8))" }}
              />
              <div className="absolute inset-0 flex flex-col px-[14%] pt-[10%] pb-[8%]">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ background: "rgba(92,58,30,0.2)", border: "1px solid rgba(139,110,78,0.3)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b6e4e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <h3
                    className="font-fantasy text-[#5c3a1e] text-base tracking-widest font-bold"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                    data-testid="text-quest-log-title"
                  >
                    QUEST LOG
                  </h3>
                </div>

                <div className="flex items-center gap-3 mb-2 px-2">
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(92,58,30,0.35))" }} />
                  <span className="font-fantasy text-[#a08060] text-[8px] tracking-[0.2em]">ACTIVE QUESTS</span>
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(92,58,30,0.35), transparent)" }} />
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide px-1">
                  <div className="flex flex-col items-center justify-center h-full">
                    <div
                      className="w-full rounded-lg p-4 flex flex-col items-center"
                      style={{ background: "rgba(92,58,30,0.06)", border: "1px dashed rgba(139,110,78,0.2)" }}
                    >
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                        style={{
                          background: "radial-gradient(ellipse at center, rgba(92,58,30,0.12) 0%, transparent 70%)",
                          border: "1px dashed rgba(139,110,78,0.2)",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,110,78,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <p className="font-fantasy text-[#7a5c3a] text-xs text-center tracking-wider leading-relaxed mb-1" data-testid="text-no-quests">
                        No active quests
                      </p>
                      <p className="font-fantasy text-[#a08060] text-[10px] text-center tracking-wider leading-relaxed">
                        Explore the realm to discover adventures...
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 px-2">
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(92,58,30,0.2), transparent)" }} />
                  <p className="font-fantasy text-[#a08060] text-[7px] tracking-[0.15em] text-center mt-1.5">
                    QUESTS COMPLETED: 0
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPvpNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="backdrop-pvp-notice" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPvpNotice(false)} />
          <div
            className="relative w-[80%] max-w-xs rounded-lg p-5 animate-slide-up"
            style={{
              background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)",
              border: "1px solid rgba(212,160,23,0.5)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 60px rgba(212,160,23,0.1)",
            }}
          >
            <button
              data-testid="button-close-pvp-notice"
              onClick={() => setShowPvpNotice(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
            >
              X
            </button>
            <div className="flex flex-col items-center text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(139,0,0,0.3) 0%, rgba(60,10,10,0.5) 100%)",
                  border: "2px solid rgba(200,50,50,0.3)",
                  boxShadow: "0 0 20px rgba(200,50,50,0.2)",
                }}
              >
                <img src={swordsImg} alt="PvP" className="w-10 h-10 object-contain" />
              </div>
              <h3
                className="font-fantasy text-[#f0c040] text-base tracking-widest font-semibold mb-2"
                style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}
                data-testid="text-pvp-notice-title"
              >
                BATTLE ARENA
              </h3>
              <p className="font-fantasy text-[#c8b896] text-sm tracking-wider leading-relaxed mb-2">
                The arena is being forged...
              </p>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider leading-relaxed mb-4">
                PvP battles are coming soon! Train your pets and prepare for glorious combat against other adventurers.
              </p>
              <div
                className="w-full h-px mb-4"
                style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)" }}
              />
              <p className="font-fantasy text-[#6a5840] text-[10px] tracking-widest">
                STAY TUNED FOR UPDATES
              </p>
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

function NavIcon({ src, alt, testId, onClick, round, badge }: { src: string; alt: string; testId: string; onClick?: () => void; round?: boolean; badge?: "new" | "complete" }) {
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
      className="relative flex flex-col items-center group"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <div
        className={`flex items-center justify-center transition-transform duration-150 overflow-hidden ${round ? "nav-icon-size-lg rounded-full" : "nav-icon-size rounded-xl"}`}
        style={{
          transform: tapped ? "scale(0.88)" : "scale(1)",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
        }}
      >
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-all duration-150 group-active:brightness-125 ${round ? "rounded-full" : "rounded-xl"}`}
        />
      </div>
      {badge === "new" && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center animate-pulse"
          style={{
            background: "radial-gradient(circle, #f0c040 0%, #d4a017 100%)",
            border: "2px solid rgba(30,15,5,0.8)",
            boxShadow: "0 0 8px rgba(240,192,64,0.8), 0 0 16px rgba(240,192,64,0.4)",
          }}
          data-testid="badge-quest-new"
        >
          <span className="font-bold text-[10px] leading-none" style={{ color: "#3a2010" }}>!</span>
        </div>
      )}
      {badge === "complete" && (
        <div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            background: "radial-gradient(circle, #4ade80 0%, #22c55e 100%)",
            border: "2px solid rgba(30,15,5,0.8)",
            boxShadow: "0 0 8px rgba(74,222,128,0.8), 0 0 16px rgba(74,222,128,0.4)",
          }}
          data-testid="badge-quest-complete"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0a3a0a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  );
}

function HomePetBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      <span className="font-fantasy text-[8px] tracking-wider w-5 text-right" style={{ color }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div
          style={{
            width: `${Math.min(100, (value / max) * 100)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            height: "100%",
            borderRadius: "4px",
            boxShadow: `0 0 4px ${color}40`,
          }}
        />
      </div>
      <span className="font-fantasy text-[7px] text-[#a89878] w-8">{value}</span>
    </div>
  );
}

function HomeHatchBar({ hatchStartedAt, hatchTime }: { hatchStartedAt: string; hatchTime: number }) {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const start = new Date(hatchStartedAt).getTime();
      const required = hatchTime * 3600000;
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / required);
      setProgress(pct);

      if (pct >= 1) {
        setTimeLeft("Ready to hatch!");
      } else {
        const remaining = required - elapsed;
        const hrs = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        if (hrs > 0) {
          setTimeLeft(`${hrs}h ${mins}m`);
        } else {
          const secs = Math.floor((remaining % 60000) / 1000);
          setTimeLeft(`${mins}m ${secs}s`);
        }
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [hatchStartedAt, hatchTime]);

  const isReady = progress >= 1;

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 w-full">
        <span className="font-fantasy text-[8px] tracking-wider w-5 text-right" style={{ color: isReady ? "#4ade80" : "#f0c040" }}>🥚</span>
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div
            className={isReady ? "animate-pulse" : ""}
            style={{
              width: `${progress * 100}%`,
              background: isReady ? "linear-gradient(90deg, #4ade80, #22c55e)" : "linear-gradient(90deg, #f0c040, #d4a017)",
              height: "100%",
              borderRadius: "4px",
              boxShadow: isReady ? "0 0 6px rgba(74,222,128,0.6)" : "0 0 4px rgba(240,192,64,0.4)",
              transition: "width 1s linear",
            }}
          />
        </div>
      </div>
      <p className="font-fantasy text-[7px] tracking-wider text-center mt-0.5" style={{ color: isReady ? "#4ade80" : "#d4a017" }} data-testid="text-home-hatch-time">
        {timeLeft}
      </p>
    </div>
  );
}
