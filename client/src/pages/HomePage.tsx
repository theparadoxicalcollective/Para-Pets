import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import bgImg from "@assets/bg_home.png";
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
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} hideHome />

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
                src={questIcon}
                alt="Quests"
                testId="button-nav-quests"
                onClick={() => setScrollOpen(true)}
              />
              <NavIcon
                src={globeImg}
                alt="Map"
                testId="button-nav-map"
                onClick={() => navigate("/map")}
                round
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
              <div className="absolute inset-0 flex flex-col items-center px-[16%] pt-[12%] pb-[10%]">
                <h3
                  className="font-fantasy text-[#5c3a1e] text-lg tracking-widest font-bold mb-3"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                  data-testid="text-quest-log-title"
                >
                  QUEST LOG
                </h3>
                <div
                  className="w-full h-px mb-3"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(92,58,30,0.3), transparent)" }}
                />
                <div className="w-full flex-1 overflow-y-auto scrollbar-hide">
                  <div className="flex flex-col items-center justify-center h-full">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                      style={{
                        background: "radial-gradient(ellipse at center, rgba(92,58,30,0.1) 0%, transparent 70%)",
                        border: "1px dashed rgba(139,110,78,0.25)",
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,110,78,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <line x1="10" y1="9" x2="8" y2="9" />
                      </svg>
                    </div>
                    <p className="font-fantasy text-[#7a5c3a] text-sm text-center tracking-wider leading-relaxed" data-testid="text-no-quests">
                      No active quests
                    </p>
                    <p className="font-fantasy text-[#a08060] text-xs text-center tracking-wider mt-2 px-2 leading-relaxed">
                      Explore the realm to discover adventures...
                    </p>
                  </div>
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
