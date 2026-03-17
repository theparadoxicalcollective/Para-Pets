import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import bgImg from "@assets/bg_home_v2.png";
import questIcon from "@assets/icon_quest_v5.png";
import mapIcon from "@assets/icon_map_new.png";
import swordsImg from "@assets/icon_pvp_new.png";
import eggImg from "@assets/icon_pets.png";
import badgeIcon from "@assets/icon_badges_new.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetInventory from "@/components/PetInventory";
import PetAnimator from "@/components/PetAnimator";
import PetDetailPage from "@/components/PetDetailPage";
import PowerUpOverlay from "@/components/PowerUpOverlay";

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
  petTemplateId: string | null;
  petNickname: string | null;
  hatchStartedAt: string | null;
  isHatched: boolean;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  petLevelPoints: number;
  itemsUsedThisLevel: number;
}

export default function HomePage({ user }: HomePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [scrollOpen, setScrollOpen] = useState(false);
  const [showPetInventory, setShowPetInventory] = useState(false);
  const [showPvpNotice, setShowPvpNotice] = useState(false);
  const [hatchRevealing, setHatchRevealing] = useState(false);
  const [showPetDetail, setShowPetDetail] = useState(false);
  const [showSpeedUp, setShowSpeedUp] = useState(false);
  const [showSpeedEffect, setShowSpeedEffect] = useState(false);
  const [speedEffectLabel, setSpeedEffectLabel] = useState("");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const hatchHomeMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${inventoryId}/hatch-check`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.isHatched) {
        setHatchRevealing(true);
        setTimeout(() => {
          setHatchRevealing(false);
          queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        }, 3500);
      }
    },
  });

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.shopItemId === currentUser.activePetId && item.type === "pet")
    : null;


  const hatchTimeItems = inventory.filter(
    (item) => item.type === "special" && item.specialType === "hatch_time"
  );

  const speedUpMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId, specialAmount }: { petInvId: string; itemInvId: string; specialAmount?: number | null }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setShowSpeedUp(false);
      setSpeedEffectLabel(`-${variables.specialAmount ?? "?"} min`);
      setShowSpeedEffect(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

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
        caretColor: "transparent",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 z-0 pointer-events-none" />

      <style>{`
        @keyframes eggWobble {
          0%, 100% { transform: rotate(0deg) translateY(0px); }
          10% { transform: rotate(3deg) translateY(-1px); }
          20% { transform: rotate(-3deg) translateY(0px); }
          30% { transform: rotate(4deg) translateY(-2px); }
          40% { transform: rotate(-2deg) translateY(0px); }
          50% { transform: rotate(0deg) translateY(-1px); }
          60% { transform: rotate(2deg) translateY(-2px); }
          70% { transform: rotate(-4deg) translateY(-1px); }
          80% { transform: rotate(3deg) translateY(0px); }
          90% { transform: rotate(-2deg) translateY(-1px); }
        }
        @keyframes eggGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(240,192,64,0.15), 0 8px 20px rgba(0,0,0,0.4); }
          50% { box-shadow: 0 0 35px rgba(240,192,64,0.35), 0 0 60px rgba(240,192,64,0.15), 0 8px 20px rgba(0,0,0,0.4); }
        }
        @keyframes eggGlowPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes eggOrb0 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          25% { transform: translate(8px, -12px) scale(1.3); opacity: 1; }
          50% { transform: translate(-4px, -20px) scale(0.9); opacity: 0.7; }
          75% { transform: translate(6px, -8px) scale(1.1); opacity: 0.9; }
        }
        @keyframes eggOrb1 {
          0%, 100% { transform: translate(0, 0) scale(0.9); opacity: 0.4; }
          30% { transform: translate(-10px, -15px) scale(1.2); opacity: 0.9; }
          60% { transform: translate(5px, -25px) scale(1); opacity: 0.6; }
        }
        @keyframes eggOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1.1); opacity: 0.6; }
          35% { transform: translate(12px, -10px) scale(0.8); opacity: 1; }
          70% { transform: translate(-8px, -18px) scale(1.2); opacity: 0.5; }
        }
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

      <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} hideHome />

        {activePet && (activePet.rarity ?? 0) > 0 && (
          <div
            data-testid="display-pet-rarity-stars"
            className="relative shrink-0 flex justify-center items-center"
            style={{
              pointerEvents: "none",
              zIndex: 30,
              paddingTop: "82px",
              marginBottom: "-52px",
            }}
          >
            <div style={{
              position: "absolute",
              width: "280px",
              height: "65px",
              background: "radial-gradient(ellipse, rgba(240,192,64,0.5) 0%, rgba(240,160,20,0.2) 50%, transparent 70%)",
              filter: "blur(18px)",
              borderRadius: "50%",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }} />
            {Array.from({ length: 5 }).map((_, i) => {
              const t = (i - 2) / 2;
              const curveY = -(1 - t * t) * 12;
              const filled = i < (activePet.rarity || 0);
              return (
                <svg
                  key={i}
                  width="56"
                  height="56"
                  viewBox="0 0 24 24"
                  fill={filled ? "#f0c040" : "none"}
                  stroke={filled ? "#d4a017" : "rgba(139,110,78,0.2)"}
                  strokeWidth="1.5"
                  style={{
                    transform: `translateY(${curveY}px)`,
                    margin: "0 2px",
                    position: "relative",
                    zIndex: 1,
                    filter: filled
                      ? "drop-shadow(0 0 8px rgba(240,192,64,1)) drop-shadow(0 0 22px rgba(240,192,64,0.7))"
                      : "none",
                  }}
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              );
            })}
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-2 py-0 min-h-0">
          <div className="relative flex items-center justify-center w-[90%] max-w-[420px] md:max-w-[580px] lg:max-w-[700px]">
            <div
              className="w-full rounded-xl flex flex-col items-center justify-center"
              style={{
                background: "radial-gradient(ellipse at center, rgba(45,122,79,0.15) 0%, transparent 70%)",
                border: activePet ? "none" : "1px dashed rgba(127,191,176,0.2)",
              }}
            >
              {petLoading ? (
                <div className="flex flex-col items-center gap-3 animate-pulse py-8">
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
                <div className="relative w-full animate-float flex flex-col items-center" data-testid="display-active-pet">
                  <div
                    className="w-full flex items-center justify-center"
                    style={{
                      background: "transparent",
                    }}
                  >
                    {activePet.isHatched ? (
                      <div
                        onClick={() => setShowPetDetail(true)}
                        style={{ cursor: "pointer" }}
                        className="w-full flex items-center justify-center"
                        data-testid="button-open-pet-detail"
                      >
                        {activePet.petTemplateId ? (
                          <PetAnimator petTemplateId={activePet.petTemplateId} mode="idle" view="front" size={1000} className="w-full" style={{ aspectRatio: "1/1" }} />
                        ) : (activePet.hatchedImageUrl || activePet.imageUrl) ? (
                          <img src={activePet.hatchedImageUrl || activePet.imageUrl || ""} alt={activePet.name} className="w-full max-h-[50vh] md:max-h-[62vh] lg:max-h-[68vh] object-contain" />
                        ) : (
                          <span className="text-5xl">🐾</span>
                        )}
                      </div>
                    ) : (() => {
                      const eggHatchReady = activePet.hatchStartedAt && activePet.hatchTime
                        ? (Date.now() - new Date(activePet.hatchStartedAt).getTime()) >= activePet.hatchTime * 3600000
                        : false;
                      return (
                        <div
                          style={{ animation: "eggWobble 2.5s ease-in-out infinite", cursor: "pointer" }}
                          className="w-full flex items-center justify-center"
                          data-testid="button-egg-tap"
                          onClick={() => {
                            if (eggHatchReady && !hatchHomeMutation.isPending) {
                              hatchHomeMutation.mutate(activePet.inventoryId);
                            } else if (!eggHatchReady) {
                              setShowSpeedUp(true);
                            }
                          }}
                        >
                          {activePet.eggImageUrl ? (
                            <img src={activePet.eggImageUrl} alt={activePet.name} className="w-full max-h-[50vh] md:max-h-[62vh] lg:max-h-[68vh] object-contain" />
                          ) : (
                            <span className="text-5xl">🥚</span>
                          )}
                          {eggHatchReady && !hatchRevealing && (
                            <div className="absolute inset-0 pointer-events-none" data-testid="display-egg-hatch-ready">
                              <div
                                className="absolute inset-0"
                                style={{
                                  background: "radial-gradient(ellipse at center, rgba(74,222,128,0.25) 0%, rgba(74,222,128,0.08) 40%, transparent 70%)",
                                  animation: "eggGlowPulse 2s ease-in-out infinite",
                                }}
                              />
                              {[0, 1, 2, 3, 4, 5].map((idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    position: "absolute",
                                    width: idx % 2 === 0 ? "8px" : "6px",
                                    height: idx % 2 === 0 ? "8px" : "6px",
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle, ${idx % 3 === 0 ? "rgba(74,222,128,0.9)" : idx % 3 === 1 ? "rgba(160,255,200,0.9)" : "rgba(255,240,180,0.9)"} 0%, transparent 70%)`,
                                    boxShadow: `0 0 8px ${idx % 3 === 0 ? "rgba(74,222,128,0.6)" : idx % 3 === 1 ? "rgba(160,255,200,0.6)" : "rgba(255,240,180,0.6)"}, 0 0 16px ${idx % 3 === 0 ? "rgba(74,222,128,0.3)" : idx % 3 === 1 ? "rgba(160,255,200,0.3)" : "rgba(255,240,180,0.3)"}`,
                                    left: `${50 + 30 * Math.cos((idx * Math.PI * 2) / 6)}%`,
                                    top: `${50 + 35 * Math.sin((idx * Math.PI * 2) / 6)}%`,
                                    animation: `eggOrb${idx % 3} ${2 + (idx % 3) * 0.5}s ease-in-out infinite ${idx * 0.4}s`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
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

        {activePet && (
          <div className="relative z-10 flex-shrink-0 flex flex-col items-center gap-1 px-4 pb-2">
            <div
              className="px-5 py-1.5 rounded-lg"
              style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(212,160,23,0.4)", backdropFilter: "blur(6px)", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
            >
              <p className="font-fantasy text-[#f0c040] text-sm tracking-[0.15em] font-bold text-center uppercase" data-testid="text-active-pet-name">
                {activePet.petNickname || activePet.name}
              </p>
            </div>

            {activePet.isHatched ? (
              <div className="w-52 mb-2">
                {(() => {
                  const needed = Math.floor(100 + activePet.petLevel * 30 + activePet.petLevel * activePet.petLevel * 5);
                  const current = activePet.petLevelPoints || 0;
                  const pct = Math.min(100, (current / needed) * 100);
                  return (
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-fantasy text-[#f0c040] text-[10px] tracking-wider font-bold whitespace-nowrap" data-testid="text-home-pet-level">LV {activePet.petLevel}</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", height: "8px", border: "1px solid rgba(240,192,64,0.25)" }}>
                        <div
                          data-testid="bar-home-level-progress"
                          style={{
                            width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`,
                            background: "linear-gradient(90deg, #d4a017, #f0c040, #ffd700)",
                            height: "100%",
                            borderRadius: "4px",
                            transition: "width 0.5s ease",
                            boxShadow: pct > 0 ? "0 0 6px rgba(240,192,64,0.4), inset 0 1px 0 rgba(255,255,255,0.3)" : "none",
                          }}
                        />
                      </div>
                      <span className="font-fantasy text-[#a89878] text-[8px] whitespace-nowrap">{current}/{needed}</span>
                    </div>
                  );
                })()}
              </div>
            ) : activePet.hatchStartedAt && activePet.hatchTime ? (
              <div className="w-48">
                <HomeHatchBar hatchStartedAt={activePet.hatchStartedAt} hatchTime={activePet.hatchTime} />
              </div>
            ) : null}
          </div>
        )}

        <div className="relative flex-shrink-0">
          <div
            className="relative w-full nav-bar-height flex items-center justify-center"
            style={{
              background: "linear-gradient(180deg, rgba(20,10,3,0) 0%, rgba(20,10,3,0.65) 20%, rgba(15,8,2,0.8) 100%)",
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[3px]"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(212,160,23,0.5) 20%, rgba(240,192,64,0.7) 50%, rgba(212,160,23,0.5) 80%, transparent 100%)",
                boxShadow: "0 0 8px rgba(240,192,64,0.3), 0 0 20px rgba(240,192,64,0.15)",
              }}
            />
            <div
              className="absolute top-[3px] left-0 right-0 h-[1px]"
              style={{
                background: "linear-gradient(90deg, transparent 5%, rgba(139,110,78,0.3) 25%, rgba(139,110,78,0.5) 50%, rgba(139,110,78,0.3) 75%, transparent 95%)",
              }}
            />

            <div
              className="absolute top-0 left-[15%] w-[2px] h-3"
              style={{ background: "linear-gradient(180deg, rgba(212,160,23,0.5), transparent)" }}
            />
            <div
              className="absolute top-0 left-[50%] w-[2px] h-4"
              style={{ background: "linear-gradient(180deg, rgba(212,160,23,0.4), transparent)" }}
            />
            <div
              className="absolute top-0 right-[15%] w-[2px] h-3"
              style={{ background: "linear-gradient(180deg, rgba(212,160,23,0.5), transparent)" }}
            />

            <svg className="absolute top-[-6px] left-[8%] w-5 h-5" viewBox="0 0 20 20" fill="none">
              <path d="M10,2 L12,8 L18,10 L12,12 L10,18 L8,12 L2,10 L8,8 Z" fill="rgba(240,192,64,0.25)" />
              <circle cx="10" cy="10" r="1.5" fill="rgba(240,192,64,0.4)" />
            </svg>
            <svg className="absolute top-[-4px] right-[12%] w-4 h-4" viewBox="0 0 20 20" fill="none">
              <path d="M10,3 L11.5,8.5 L17,10 L11.5,11.5 L10,17 L8.5,11.5 L3,10 L8.5,8.5 Z" fill="rgba(240,192,64,0.2)" />
              <circle cx="10" cy="10" r="1" fill="rgba(240,192,64,0.35)" />
            </svg>

            <div className="relative z-10 flex items-center justify-evenly w-full px-6">
              <NavIcon
                src={mapIcon}
                alt="Map"
                testId="button-nav-map"
                onClick={() => navigate("/map")}
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
              <NavIcon
                src={badgeIcon}
                alt="Badges"
                testId="button-nav-badges"
                onClick={() => navigate("/badges")}
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
          <div className="relative w-[85%] max-w-[360px] scroll-unroll">
            <button
              data-testid="button-close-scroll"
              onClick={() => setScrollOpen(false)}
              className="absolute -top-2 -right-2 z-30 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                border: "2px solid rgba(212,160,23,0.6)",
                color: "#f0c040",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                fontSize: "14px",
                fontWeight: "bold",
              }}
            >
              X
            </button>

            <div className="relative" style={{ filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.7))" }}>
              <svg className="w-full" viewBox="0 0 360 40" preserveAspectRatio="none" style={{ display: "block", marginBottom: "-1px" }}>
                <defs>
                  <linearGradient id="scrollRodGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b6e4e" />
                    <stop offset="30%" stopColor="#6b4e2e" />
                    <stop offset="70%" stopColor="#5c3a1e" />
                    <stop offset="100%" stopColor="#3a2010" />
                  </linearGradient>
                  <linearGradient id="scrollRodShine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c4a060" stopOpacity="0.5" />
                    <stop offset="40%" stopColor="#8b6e4e" stopOpacity="0" />
                  </linearGradient>
                  <radialGradient id="knobGrad" cx="50%" cy="40%" r="50%">
                    <stop offset="0%" stopColor="#f0c040" />
                    <stop offset="60%" stopColor="#c4a030" />
                    <stop offset="100%" stopColor="#8b6e2e" />
                  </radialGradient>
                </defs>
                <rect x="20" y="10" width="320" height="22" rx="11" fill="url(#scrollRodGrad)" />
                <rect x="20" y="10" width="320" height="10" rx="5" fill="url(#scrollRodShine)" />
                <circle cx="28" cy="21" r="14" fill="url(#knobGrad)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="28" cy="21" r="6" fill="#5c3a1e" opacity="0.3" />
                <circle cx="332" cy="21" r="14" fill="url(#knobGrad)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="332" cy="21" r="6" fill="#5c3a1e" opacity="0.3" />
                <rect x="30" y="28" width="300" height="12" fill="#f2e8d0" />
                <rect x="30" y="28" width="300" height="4" fill="rgba(139,110,78,0.08)" />
              </svg>

              <div
                className="relative mx-auto"
                style={{
                  width: "calc(100% - 34px)",
                  marginLeft: "17px",
                  background: "linear-gradient(180deg, #f2e8d0 0%, #e8d8b8 40%, #f0e4c8 60%, #e5d5b0 100%)",
                  borderLeft: "2px solid rgba(139,110,78,0.2)",
                  borderRight: "2px solid rgba(139,110,78,0.2)",
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(139,110,78,0.04) 18px, rgba(139,110,78,0.04) 19px)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "radial-gradient(ellipse at 20% 30%, rgba(139,110,78,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(139,110,78,0.06) 0%, transparent 50%)",
                  }}
                />
                <div
                  className="absolute top-0 left-0 right-0 h-3 pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(139,110,78,0.1), transparent)" }}
                />

                <div className="relative px-6 py-5">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(139,110,78,0.3))" }} />
                    <h3
                      className="font-fantasy text-[#5c3a1e] text-sm tracking-[0.25em] font-bold"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                      data-testid="text-quest-log-title"
                    >
                      QUESTS
                    </h3>
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(139,110,78,0.3), transparent)" }} />
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b6e4e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span className="font-fantasy text-[#7a5c3a] text-[10px] tracking-[0.2em] font-semibold">ACTIVE</span>
                    </div>
                    <div
                      className="rounded-md p-3 flex items-center gap-3"
                      style={{ background: "rgba(92,58,30,0.05)", border: "1px dashed rgba(139,110,78,0.2)" }}
                      data-testid="text-no-quests"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(139,110,78,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 12l2 2 4-4" />
                      </svg>
                      <p className="font-fantasy text-[#a08060] text-[10px] tracking-wider leading-relaxed">
                        No active quests. Explore the realm to discover adventures...
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b6e4e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
                      </svg>
                      <span className="font-fantasy text-[#7a5c3a] text-[10px] tracking-[0.2em] font-semibold">REWARDS</span>
                    </div>
                    <div
                      className="rounded-md p-3 flex items-center gap-3"
                      style={{ background: "rgba(92,58,30,0.05)", border: "1px dashed rgba(139,110,78,0.2)" }}
                      data-testid="text-no-rewards"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(139,110,78,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
                      </svg>
                      <p className="font-fantasy text-[#a08060] text-[10px] tracking-wider leading-relaxed">
                        No rewards to redeem yet.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <svg className="w-full" viewBox="0 0 360 40" preserveAspectRatio="none" style={{ display: "block", marginTop: "-1px" }}>
                <rect x="30" y="0" width="300" height="12" fill="#e5d5b0" />
                <rect x="30" y="8" width="300" height="4" fill="rgba(139,110,78,0.08)" />
                <rect x="20" y="8" width="320" height="22" rx="11" fill="url(#scrollRodGrad)" />
                <rect x="20" y="8" width="320" height="10" rx="5" fill="url(#scrollRodShine)" />
                <circle cx="28" cy="19" r="14" fill="url(#knobGrad)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="28" cy="19" r="6" fill="#5c3a1e" opacity="0.3" />
                <circle cx="332" cy="19" r="14" fill="url(#knobGrad)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="332" cy="19" r="6" fill="#5c3a1e" opacity="0.3" />
              </svg>
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

      {showSpeedUp && activePet && !activePet.isHatched && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSpeedUp(false)} />
          <div
            className="relative w-full rounded-t-2xl p-5 animate-slide-up"
            style={{
              background: "linear-gradient(180deg, rgba(15,8,2,0.97) 0%, rgba(10,5,1,0.99) 100%)",
              border: "1px solid rgba(240,192,64,0.3)",
              borderBottom: "none",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-fantasy text-[#f0c040] text-sm tracking-wider">SPEED UP HATCHING</h4>
              <button
                onClick={() => setShowSpeedUp(false)}
                className="font-fantasy text-[#a89878] text-xs tracking-wider"
                style={{ cursor: "pointer", background: "none", border: "none" }}
                data-testid="button-close-speedup"
              >
                Close
              </button>
            </div>
            {hatchTimeItems.length === 0 ? (
              <p className="font-fantasy text-[#a89878] text-xs text-center py-6">
                No speed-up items in your bag. Check the shop!
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {hatchTimeItems.map((item) => (
                  <button
                    key={item.inventoryId}
                    data-testid={`button-speedup-${item.inventoryId}`}
                    onClick={() => speedUpMutation.mutate({ petInvId: activePet.inventoryId, itemInvId: item.inventoryId, specialAmount: item.specialAmount })}
                    disabled={speedUpMutation.isPending}
                    className="rounded-md p-2 flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-40"
                    style={{
                      background: "rgba(30,15,5,0.8)",
                      border: "1px solid rgba(240,192,64,0.3)",
                      cursor: speedUpMutation.isPending ? "wait" : "pointer",
                    }}
                  >
                    <div className="w-12 h-12 rounded flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xl">⏩</span>
                      )}
                    </div>
                    <span className="font-fantasy text-[#f0c040] text-[9px] tracking-wider text-center truncate w-full">{item.name}</span>
                    <span
                      className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(240,192,64,0.15)", color: "#f0c040" }}
                    >
                      -{item.specialAmount || "?"}min
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showPetDetail && activePet && activePet.isHatched && (
        <PetDetailPage
          pet={{
            inventoryId: activePet.inventoryId,
            shopItemId: activePet.shopItemId,
            name: activePet.name,
            imageUrl: activePet.imageUrl,
            eggImageUrl: activePet.eggImageUrl,
            hatchedImageUrl: activePet.hatchedImageUrl,
            petTemplateId: activePet.petTemplateId,
            petNickname: activePet.petNickname,
            rarity: activePet.rarity,
            petHealth: activePet.petHealth,
            petAtk: activePet.petAtk,
            petDef: activePet.petDef,
            petLevel: activePet.petLevel,
            petLevelPoints: activePet.petLevelPoints,
            itemsUsedThisLevel: activePet.itemsUsedThisLevel,
            isHatched: activePet.isHatched,
          }}
          onClose={() => setShowPetDetail(false)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
            setShowPetDetail(false);
          }}
          userCoins={currentUser.coins}
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

      {hatchRevealing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div
            className="absolute inset-0"
            style={{ animation: "hatchFlashBg 3.5s ease-out forwards" }}
          />
          {[...Array(14)].map((_, i) => {
            const angle = (i / 14) * 360;
            const rad = (angle * Math.PI) / 180;
            const dist = 100 + Math.random() * 80;
            const endX = Math.cos(rad) * dist;
            const endY = Math.sin(rad) * dist;
            const size = 10 + Math.random() * 14;
            const delay = i * 0.04;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #ffe566 0%, #f0c040 40%, rgba(240,192,64,0) 70%)",
                  boxShadow: "0 0 16px rgba(240,192,64,0.9), 0 0 32px rgba(240,192,64,0.5)",
                  animation: `hatchOrbDramatic 2s ${delay}s ease-out forwards`,
                  opacity: 0,
                  ["--endX" as any]: `${endX}px`,
                  ["--endY" as any]: `${endY}px`,
                }}
              />
            );
          })}
          {[...Array(8)].map((_, i) => {
            const delay = 0.2 + i * 0.06;
            const size = 6 + Math.random() * 8;
            const angle = Math.random() * 360;
            const rad = (angle * Math.PI) / 180;
            const dist = 50 + Math.random() * 60;
            const endX = Math.cos(rad) * dist;
            const endY = Math.sin(rad) * dist;
            return (
              <div
                key={`x${i}`}
                style={{
                  position: "absolute",
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #fff8c0 0%, #f0c040 50%, rgba(240,192,64,0) 80%)",
                  boxShadow: "0 0 10px rgba(255,248,192,0.7)",
                  animation: `hatchOrbDramatic 1.6s ${delay}s ease-out forwards`,
                  opacity: 0,
                  ["--endX" as any]: `${endX}px`,
                  ["--endY" as any]: `${endY}px`,
                }}
              />
            );
          })}
          <div
            style={{
              position: "absolute",
              width: "50px",
              height: "50px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,248,192,1) 0%, rgba(240,192,64,0.7) 30%, rgba(240,192,64,0) 70%)",
              boxShadow: "0 0 50px rgba(240,192,64,0.9), 0 0 100px rgba(240,192,64,0.4), 0 0 150px rgba(240,192,64,0.2)",
              animation: "hatchCenterDramatic 2.5s ease-out forwards",
            }}
          />
          <span
            className="font-fantasy text-2xl font-bold tracking-[0.2em] absolute"
            style={{
              color: "#f0c040",
              textShadow: "0 0 20px rgba(240,192,64,0.9), 0 0 40px rgba(240,192,64,0.5), 0 2px 8px rgba(0,0,0,0.8)",
              animation: "hatchRevealText 3s 0.5s ease-out forwards",
              opacity: 0,
            }}
            data-testid="text-hatch-reveal"
          >
            HATCHED!
          </span>
        </div>
      )}

      <style>{`
        @keyframes hatchFlashBg {
          0% { background: rgba(255,248,192,0); }
          10% { background: rgba(255,248,192,0.7); }
          30% { background: rgba(240,192,64,0.3); }
          60% { background: rgba(240,192,64,0.1); }
          100% { background: rgba(0,0,0,0); }
        }
        @keyframes hatchOrbDramatic {
          0% { transform: translate(0, 0) scale(0.2); opacity: 0; }
          10% { opacity: 1; transform: translate(0, 0) scale(1.2); }
          100% { transform: translate(var(--endX), var(--endY)) scale(0); opacity: 0; }
        }
        @keyframes hatchCenterDramatic {
          0% { transform: scale(0); opacity: 0; }
          15% { transform: scale(2.5); opacity: 1; }
          40% { transform: scale(1.5); opacity: 0.9; }
          70% { transform: scale(3); opacity: 0.4; }
          100% { transform: scale(4); opacity: 0; }
        }
        @keyframes hatchRevealText {
          0% { transform: translateY(15px) scale(0.5); opacity: 0; }
          25% { transform: translateY(0px) scale(1.3); opacity: 1; }
          50% { transform: translateY(-5px) scale(1); opacity: 1; }
          80% { transform: translateY(-10px) scale(1); opacity: 1; }
          100% { transform: translateY(-20px) scale(0.9); opacity: 0; }
        }
      `}</style>

      <PowerUpOverlay
        visible={showSpeedEffect}
        effectType="hatch"
        label={speedEffectLabel}
        onDone={() => setShowSpeedEffect(false)}
      />
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
          filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.8))",
          border: "2px solid rgba(212,160,23,0.35)",
          background: "rgba(15,8,2,0.6)",
        }}
      >
        <img
          src={src}
          alt={alt}
          className={`transition-all duration-150 group-active:brightness-125 ${round ? "rounded-full" : "rounded-xl"}`}
          style={{ width: "115%", height: "115%", objectFit: "cover" }}
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
