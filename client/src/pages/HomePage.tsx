import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { X, HelpCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import bgImg from "@assets/bg_home_v2.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import questIcon from "@assets/generated_images/nav_icon_map.png";
import mapIcon from "@assets/generated_images/nav_icon_map_new.png";
import swordsImg from "@assets/generated_images/nav_icon_pvp.png";
import eggImg from "@assets/generated_images/nav_icon_pets.png";
import badgeIcon from "@assets/generated_images/nav_icon_badges.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
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

  useEffect(() => {
    setCurrentUser(prev => ({ ...prev, ...user }));
  }, [user.activePetId, user.coins, user.profileImage, user.username]);

  const [hatchRevealing, setHatchRevealing] = useState(false);
  const [hatchedPetCache, setHatchedPetCache] = useState<{ hatchedImageUrl: string | null; imageUrl: string | null; petTemplateId: string | null; name: string } | null>(null);
  const [showPetDetail, setShowPetDetail] = useState(false);
  const [showSpeedUp, setShowSpeedUp] = useState(false);
  const [showSpeedEffect, setShowSpeedEffect] = useState(false);
  const [speedEffectLabel, setSpeedEffectLabel] = useState("");
  const [homeDragOver, setHomeDragOver] = useState(false);
  const [homeDragging, setHomeDragging] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const homeEggDropRef = useRef<HTMLDivElement>(null);
  const [showHomePageTutorial, setShowHomePageTutorial] = useState(() => !localStorage.getItem("homePageTutorialSeen"));
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const hatchHomeMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", `/api/pet/${inventoryId}/hatch-check`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.isHatched) {
        if (activePet) {
          setHatchedPetCache({
            hatchedImageUrl: activePet.hatchedImageUrl,
            imageUrl: activePet.imageUrl,
            petTemplateId: activePet.petTemplateId,
            name: activePet.petNickname || activePet.name,
          });
        }
        setHatchRevealing(true);
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        setTimeout(() => {
          setHatchRevealing(false);
          setHatchedPetCache(null);
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
      setHomeDragging(null);
      setHomeDragOver(false);
      setSpeedEffectLabel(`-${variables.specialAmount ?? "?"} min`);
      setShowSpeedEffect(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  const handleHomeSheetItemPointerDown = (e: React.PointerEvent, item: InventoryItem) => {
    if (!activePet) return;
    e.preventDefault();
    const petInvId = activePet.inventoryId;
    const startX = e.clientX, startY = e.clientY;
    let dragActive = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > 6 && !dragActive) {
        dragActive = true;
        setHomeDragging({ item, x: ev.clientX, y: ev.clientY });
      }
      if (dragActive) {
        setHomeDragging(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null);
        const dropRect = homeEggDropRef.current?.getBoundingClientRect();
        if (dropRect) {
          const over = ev.clientX >= dropRect.left && ev.clientX <= dropRect.right &&
                       ev.clientY >= dropRect.top  && ev.clientY <= dropRect.bottom;
          setHomeDragOver(over);
        }
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setHomeDragOver(false);
      if (dragActive) {
        const dropRect = homeEggDropRef.current?.getBoundingClientRect();
        const overDrop = dropRect &&
          ev.clientX >= dropRect.left && ev.clientX <= dropRect.right &&
          ev.clientY >= dropRect.top  && ev.clientY <= dropRect.bottom;
        if (overDrop) {
          speedUpMutation.mutate({ petInvId, itemInvId: item.inventoryId, specialAmount: item.specialAmount });
        }
        setHomeDragging(null);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const petLoading = currentUser.activePetId && inventoryLoading;

  return (
    <div
      className="relative w-full h-screen-frame overflow-hidden flex flex-col"
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
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        {activePet && (
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

        <div className="flex-1 flex flex-col items-center justify-center px-0 py-0 min-h-0">
          <div className="relative flex items-center justify-center w-full max-w-[520px] md:max-w-[680px] lg:max-w-[800px]">
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
                          <div style={{ paddingTop: "13vh", width: "100%" }}>
                            <style>{`
                              @keyframes petImgIdle {
                                0%, 100% { transform: scale(1) translateY(0px); filter: brightness(1); }
                                25% { transform: scale(1.012, 1.018) translateY(-2px); filter: brightness(1.04); }
                                50% { transform: scale(1.018, 1.025) translateY(-3px); filter: brightness(1.07); }
                                75% { transform: scale(1.012, 1.018) translateY(-2px); filter: brightness(1.04); }
                              }
                              @keyframes petImgBlink {
                                0%, 88%, 100% { opacity: 1; }
                                92%, 96% { opacity: 0.92; }
                              }
                            `}</style>
                            <img
                              src={activePet.hatchedImageUrl || activePet.imageUrl || ""}
                              alt={activePet.name}
                              className="w-full max-h-[50vh] object-contain"
                              style={{
                                animation: "petImgIdle 3.5s ease-in-out infinite, petImgBlink 4s ease-in-out infinite",
                                transformOrigin: "center bottom",
                              }}
                            />
                          </div>
                        ) : (
                          <img src={petPawIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.5))" }} />
                        )}
                      </div>
                    ) : (() => {
                      const eggHatchReady = activePet.hatchStartedAt && activePet.hatchTime
                        ? (Date.now() - new Date(activePet.hatchStartedAt).getTime()) >= activePet.hatchTime * 3600000
                        : false;
                      return (
                        <div
                          style={{ animation: "eggWobble 5s ease-in-out infinite", cursor: "pointer" }}
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
                            <div style={{ paddingTop: "13vh", width: "100%" }}>
                              <img
                                src={activePet.eggImageUrl}
                                alt={activePet.name}
                                className="w-full max-h-[50vh] object-contain"
                                style={{
                                  animation: "petImgIdle 3.5s ease-in-out infinite",
                                  transformOrigin: "center bottom",
                                }}
                              />
                            </div>
                          ) : (
                            <img src={eggMagicIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.5))" }} />
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
          <div className="relative z-10 flex-shrink-0 flex flex-col items-center gap-1 px-4 pb-20">
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

      </div>


      {showSpeedUp && activePet && !activePet.isHatched && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowSpeedUp(false); setHomeDragging(null); setHomeDragOver(false); }} />
          <div
            className="relative w-full rounded-t-2xl animate-slide-up"
            style={{
              background: "linear-gradient(180deg, rgba(12,6,2,0.98) 0%, rgba(8,4,1,0.99) 100%)",
              border: "1px solid rgba(240,192,64,0.3)",
              borderBottom: "none",
              boxShadow: "0 -10px 50px rgba(0,0,0,0.7)",
              maxHeight: "82vh",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h4 className="font-fantasy text-[#f0c040] text-sm tracking-wider">SPEED UP HATCHING</h4>
              <button
                onClick={() => { setShowSpeedUp(false); setHomeDragging(null); setHomeDragOver(false); }}
                className="font-fantasy text-[#a89878] text-xs tracking-wider"
                style={{ cursor: "pointer", background: "none", border: "none" }}
                data-testid="button-close-speedup"
              >
                Close
              </button>
            </div>

            {/* Egg drop zone */}
            <div className="px-5 pb-4">
              <div
                ref={homeEggDropRef}
                className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 py-5 transition-all"
                style={{
                  background: homeDragOver ? "rgba(240,192,64,0.18)" : "rgba(0,0,0,0.25)",
                  border: homeDragOver ? "2px dashed rgba(240,192,64,0.85)" : "2px dashed rgba(240,192,64,0.25)",
                  boxShadow: homeDragOver ? "0 0 24px rgba(240,192,64,0.3)" : "none",
                  transition: "all 0.15s",
                  minHeight: 140,
                }}
              >
                {activePet.eggImageUrl ? (
                  <img
                    src={activePet.eggImageUrl}
                    alt={activePet.name}
                    style={{ width: 80, height: 80, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(240,192,64,0.5))" }}
                  />
                ) : (
                  <img src={eggMagicIcon} alt="Egg" style={{ width: 64, height: 64, objectFit: "contain", opacity: 0.7 }} />
                )}
                <div className="text-center">
                  <p className="font-fantasy text-[#f0c040] text-sm tracking-wider">{activePet.petNickname || activePet.name}</p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider mt-0.5">
                    {homeDragOver ? "Release to use!" : "Drag item here · or tap item below"}
                  </p>
                </div>
              </div>
            </div>

            {/* Items section */}
            <div className="px-5 pb-6">
              <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider mb-3 uppercase">Your Speed-Up Items</p>
              {hatchTimeItems.length === 0 ? (
                <p className="font-fantasy text-[#a89878] text-xs text-center py-6">
                  No speed-up items in your bag. Check the shop!
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {hatchTimeItems.map((item) => (
                    <div
                      key={item.inventoryId}
                      data-testid={`button-speedup-${item.inventoryId}`}
                      className="rounded-md p-2 flex flex-col items-center gap-1 transition-transform active:scale-95"
                      style={{
                        background: "rgba(30,15,5,0.8)",
                        border: "1px solid rgba(240,192,64,0.3)",
                        cursor: speedUpMutation.isPending ? "wait" : "grab",
                        touchAction: "none",
                        userSelect: "none",
                        opacity: speedUpMutation.isPending ? 0.4 : 1,
                      }}
                      onClick={() => !speedUpMutation.isPending && speedUpMutation.mutate({ petInvId: activePet.inventoryId, itemInvId: item.inventoryId, specialAmount: item.specialAmount })}
                      onPointerDown={(e) => handleHomeSheetItemPointerDown(e, item)}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drag ghost for home page speed-up sheet */}
      {homeDragging && (
        <div
          className="fixed z-[90] pointer-events-none select-none"
          style={{
            left: homeDragging.x - 32,
            top: homeDragging.y - 32,
            width: 64,
            height: 64,
            borderRadius: 12,
            background: "rgba(20,10,2,0.92)",
            border: "2px solid rgba(240,192,64,0.8)",
            boxShadow: "0 0 20px rgba(240,192,64,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "scale(1.1)",
          }}
        >
          {homeDragging.item.imageUrl ? (
            <img src={homeDragging.item.imageUrl} alt={homeDragging.item.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 28 }}>⏩</span>
          )}
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
          {hatchedPetCache && (hatchedPetCache.hatchedImageUrl || hatchedPetCache.imageUrl) && (
            <div
              style={{
                position: "absolute",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "70%",
                maxWidth: 280,
                animation: "hatchPetReveal 2.8s 0.55s ease-out forwards",
                opacity: 0,
                filter: "drop-shadow(0 0 40px rgba(240,192,64,0.9)) drop-shadow(0 0 80px rgba(240,192,64,0.5))",
              }}
            >
              <img
                src={hatchedPetCache.hatchedImageUrl || hatchedPetCache.imageUrl || ""}
                alt={hatchedPetCache.name}
                style={{ width: "100%", height: "auto", objectFit: "contain" }}
              />
            </div>
          )}
          <span
            className="font-fantasy text-2xl font-bold tracking-[0.2em] absolute"
            style={{
              color: "#f0c040",
              textShadow: "0 0 20px rgba(240,192,64,0.9), 0 0 40px rgba(240,192,64,0.5), 0 2px 8px rgba(0,0,0,0.8)",
              animation: "hatchRevealText 3s 0.5s ease-out forwards",
              opacity: 0,
              bottom: "28%",
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
        @keyframes hatchPetReveal {
          0%   { transform: scale(0.2) translateY(30px); opacity: 0; filter: brightness(5) drop-shadow(0 0 60px rgba(240,192,64,1)); }
          18%  { transform: scale(1.18) translateY(-6px); opacity: 1; filter: brightness(2) drop-shadow(0 0 40px rgba(240,192,64,0.9)); }
          32%  { transform: scale(0.96) translateY(0px); filter: brightness(1.3) drop-shadow(0 0 24px rgba(240,192,64,0.6)); }
          50%  { transform: scale(1.04) translateY(-3px); opacity: 1; filter: brightness(1) drop-shadow(0 0 12px rgba(240,192,64,0.3)); }
          72%  { transform: scale(1) translateY(0px); opacity: 1; filter: none; }
          88%  { opacity: 1; }
          100% { transform: scale(0.92) translateY(-10px); opacity: 0; filter: none; }
        }
      `}</style>

      {/* ? button — shown after tutorial is dismissed */}
      {!showHomePageTutorial && !showProfile && !showPetDetail && (
        <button
          data-testid="button-open-homepage-tutorial"
          onClick={() => setShowHomePageTutorial(true)}
          className="absolute z-30 flex items-center justify-center rounded-full transition-transform active:scale-90"
          style={{
            bottom: "110px",
            right: "16px",
            width: "30px",
            height: "30px",
            background: "rgba(10,5,2,0.82)",
            border: "1.5px solid rgba(212,160,23,0.45)",
            color: "rgba(212,160,23,0.75)",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      )}

      {/* Home page tutorial overlay */}
      {showHomePageTutorial && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center px-5"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl px-5 py-6 flex flex-col gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(12,8,2,0.99) 0%, rgba(8,5,1,0.99) 100%)",
              border: "1.5px solid rgba(212,160,23,0.45)",
              boxShadow: "0 0 50px rgba(212,160,23,0.1), 0 8px 32px rgba(0,0,0,0.7)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Close button */}
            <button
              data-testid="button-close-homepage-tutorial"
              onClick={() => {
                localStorage.setItem("homePageTutorialSeen", "1");
                setShowHomePageTutorial(false);
              }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "rgba(60,25,5,0.85)",
                border: "1.5px solid rgba(212,160,23,0.35)",
                color: "rgba(212,160,23,0.8)",
                cursor: "pointer",
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <p className="font-fantasy text-[#f0c040] text-base tracking-wider text-center pr-6">Welcome to Para Pets!</p>

            <div className="flex flex-col gap-3">

              {/* Active Pet */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(212,160,23,0.12)" }}>
                <img src={eggMagicIcon} alt="Pet" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Your Active Pet</p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Your current companion is shown in the center. Tap it to view details, rename it, or manage it. If it's still an egg — tap to check if it's ready to hatch!
                  </p>
                </div>
              </div>

              {/* Map */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(212,160,23,0.12)" }}>
                <img src={mapIcon} alt="Map" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1, borderRadius: "6px" }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Map  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom left</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Explore different worlds, visit shops to find new pets and items, and unlock fishing spots.
                  </p>
                </div>
              </div>

              {/* Quests */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(212,160,23,0.12)" }}>
                <img src={questIcon} alt="Quests" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1, borderRadius: "6px" }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Quests  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    View your active quests and daily challenges. Complete them to earn rewards and coins.
                  </p>
                </div>
              </div>

              {/* Battle */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(212,160,23,0.12)" }}>
                <img src={swordsImg} alt="Battle" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1, borderRadius: "6px" }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Battle Arena  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Challenge other keepers in the PvP arena. Coming soon — the arena is being forged!
                  </p>
                </div>
              </div>

              {/* Pets */}
              <div className="flex items-start gap-3 pb-3" style={{ borderBottom: "1px solid rgba(212,160,23,0.12)" }}>
                <img src={eggImg} alt="Pets" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1, borderRadius: "6px" }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Pets  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    View your full pet collection. Set a pet as your active companion or visit the Pet House to watch them roam.
                  </p>
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-start gap-3">
                <img src={badgeIcon} alt="Badges" style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0, marginTop: 1, borderRadius: "6px" }} />
                <div>
                  <p className="font-fantasy text-[#f0c040] text-[11px] tracking-wider mb-0.5">Badges  <span style={{ color: "#6a5840", fontSize: "9px" }}>— bottom right</span></p>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wide leading-relaxed">
                    Track your achievements and show off the badges you've earned on your journey.
                  </p>
                </div>
              </div>

            </div>

            <button
              data-testid="button-got-it-homepage-tutorial"
              onClick={() => {
                localStorage.setItem("homePageTutorialSeen", "1");
                setShowHomePageTutorial(false);
              }}
              className="py-2.5 rounded-full font-fantasy text-sm tracking-widest transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(100,70,5,0.9) 0%, rgba(60,40,3,0.9) 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                color: "#f0c040",
                cursor: "pointer",
              }}
            >
              Begin the Journey!
            </button>
          </div>
        </div>
      )}

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
