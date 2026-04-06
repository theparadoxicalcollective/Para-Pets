import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { X, HelpCircle, Zap, Star, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import bgImg from "@assets/bg_home_v2.png";
import starImg from "@assets/Photoroom_20260331_20947_PM_1774984267132.png";
import petPawIcon from "@assets/generated_images/icon_pet_placeholder.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import questIcon from "@assets/generated_images/nav_icon_map.png";
import mapIcon from "@assets/generated_images/nav_icon_map_new.png";
import swordsImg from "@assets/generated_images/nav_icon_pvp.png";
import eggImg from "@assets/generated_images/nav_icon_pets.png";
import badgeIcon from "@assets/generated_images/nav_icon_badges.png";
import { playSpeedUp } from "@/lib/sounds";
import { fireLevelUp } from "@/lib/levelUpEvents";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import PetPowerUpModal, { PowerUpItem } from "@/components/PetPowerUpModal";
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
  // Gate sparkle orbs on the pet container having real height.
  // Uses a continuous ResizeObserver (no disconnect) so if the container
  // briefly collapses during skeleton→pet transition, the orbs hide instantly
  // rather than snapping to a horizontal line at y=0.
  // Threshold of 150px: skeleton is ~88px, a rendered pet is 300px+.
  const petContainerRef = useRef<HTMLDivElement>(null);
  const [orbsReady, setOrbsReady] = useState(false);
  useEffect(() => {
    const el = petContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setOrbsReady(entry.contentRect.height > 150);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setCurrentUser(prev => ({ ...prev, ...user }));
  }, [user.activePetId, user.coins, user.profileImage, user.username]);

  const [hatchRevealing, setHatchRevealing] = useState(false);
  const [hatchFadingOut, setHatchFadingOut] = useState(false);
  const [hatchTimerDone, setHatchTimerDone] = useState(false);
  const [hatchedPetCache, setHatchedPetCache] = useState<{ hatchedImageUrl: string | null; imageUrl: string | null; petTemplateId: string | null; name: string } | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activePetModal, setActivePetModal] = useState<"power_up" | "level_up" | null>(null);
  const [petModalSuccess, setPetModalSuccess] = useState<{ type: "stat" | "level" | "hatch"; label: string } | null>(null);
  // Keep last known activePet so modals don't unmount mid-action
  // when inventory refetches and activePetId hasn't been migrated yet.
  const frozenActivePetRef = useRef<InventoryItem | null>(null);
  const { toast } = useToast();
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
          const cache = {
            hatchedImageUrl: activePet.hatchedImageUrl,
            imageUrl: activePet.imageUrl,
            petTemplateId: activePet.petTemplateId,
            name: activePet.petNickname || activePet.name,
          };
          setHatchedPetCache(cache);
          // Preload the hatched image immediately so the browser caches it
          // before the overlay finishes — avoids a blank flash on reveal.
          const preloadUrl = cache.hatchedImageUrl || cache.imageUrl;
          if (preloadUrl) {
            const img = new Image();
            img.src = preloadUrl;
          }
        }
        setHatchRevealing(true);
        setHatchTimerDone(false);
        setHatchFadingOut(false);
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        // Minimum display time — we also wait for inventory to confirm isHatched
        setTimeout(() => setHatchTimerDone(true), 3500);
      }
    },
  });

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.inventoryId === currentUser.activePetId && item.type === "pet")
    : null;

  // Freeze the last valid activePet so power-up modals stay mounted during
  // inventory refetches (avoids modal closing mid power-up).
  if (activePet) frozenActivePetRef.current = activePet;

  // Dismiss only when both: the 3.5s animation timer is done AND the
  // inventory confirms isHatched=true — so the egg never flickers back.
  // Must be declared after `activePet` to avoid a TDZ error.
  useEffect(() => {
    if (!hatchTimerDone || !hatchRevealing || !activePet?.isHatched) return;
    setHatchFadingOut(true);
    const id = setTimeout(() => {
      setHatchRevealing(false);
      setHatchFadingOut(false);
      setHatchTimerDone(false);
      setHatchedPetCache(null);
    }, 600);
    return () => clearTimeout(id);
  }, [hatchTimerDone, hatchRevealing, activePet?.isHatched]);


  const hatchTimeItems = inventory.filter(
    (item) => item.type === "special" && item.specialType === "hatch_time"
  );

  const speedUpMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId, specialAmount }: { petInvId: string; itemInvId: string; specialAmount?: number | null }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      playSpeedUp();
      setShowSpeedUp(false);
      setHomeDragging(null);
      setHomeDragOver(false);
      setSpeedEffectLabel(`-${variables.specialAmount ?? "?"} min`);
      setShowSpeedEffect(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  // ── Active pet action mutations ──────────────────────────────────────────────
  const toModalItem = (i: InventoryItem): PowerUpItem => ({
    inventoryId: i.inventoryId,
    shopItemId: i.shopItemId,
    name: i.name,
    type: i.type,
    imageUrl: i.imageUrl,
    statBoostType: i.statBoostType,
    statBoostAmount: i.statBoostAmount,
    specialType: i.specialType,
    specialAmount: i.specialAmount,
  });

  const statBoostItems = inventory
    .filter(i => i.type === "power_up" && i.statBoostType !== "lvl")
    .map(toModalItem);

  const levelItems = inventory
    .filter(i => (i.type === "power_up" && i.statBoostType === "lvl") || (i.type === "special" && i.specialType === "level"))
    .map(toModalItem);

  const activePetForModal = activePet ?? frozenActivePetRef.current;

  const powerUpMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId }: { petInvId: string; itemInvId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/power-up`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: (data, variables) => {
      const item = inventory.find(i => i.inventoryId === variables.itemInvId);
      const boostLabel = item
        ? `+${item.statBoostAmount || "?"} ${item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : "Lvl pts"}`
        : "Power Up!";
      setPetModalSuccess({ type: item?.statBoostType === "lvl" ? "level" : "stat", label: boostLabel });
      if (data?.petLevel && activePetForModal && data.petLevel > activePetForModal.petLevel) {
        fireLevelUp(data.petLevel, activePetForModal.petNickname || activePetForModal.name, activePetForModal.petTemplateId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not use item", variant: "destructive" });
    },
  });

  const useSpecialMutation = useMutation({
    mutationFn: async ({ petInvId, itemInvId }: { petInvId: string; itemInvId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId });
      return res.json();
    },
    onSuccess: (data, variables) => {
      const item = inventory.find(i => i.inventoryId === variables.itemInvId);
      const isHatchTime = item?.specialType === "hatch_time";
      const label = isHatchTime ? `-${item?.specialAmount || "?"} min` : `+${item?.specialAmount || "?"} LVL pts`;
      const effectType: "stat" | "level" | "hatch" = isHatchTime ? "hatch" : "level";
      setPetModalSuccess({ type: effectType, label });
      if (data?.petLevel && activePetForModal && data.petLevel > activePetForModal.petLevel) {
        fireLevelUp(data.petLevel, activePetForModal.petNickname || activePetForModal.name, activePetForModal.petTemplateId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not use item", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (petInvId: string) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/reset-stats`);
      return res.json();
    },
    onSuccess: (data) => {
      setShowResetConfirm(false);
      setShowActionMenu(false);
      toast({ title: "Stats Reset", description: "Pet stats have been reset to base values" });
      if (data.user) setCurrentUser(data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Could not reset stats", variant: "destructive" });
    },
  });

  const handleModalUseItem = useCallback((item: PowerUpItem) => {
    if (!activePetForModal) return;
    if (item.type === "special") {
      useSpecialMutation.mutate({ petInvId: activePetForModal.inventoryId, itemInvId: item.inventoryId });
    } else {
      powerUpMutation.mutate({ petInvId: activePetForModal.inventoryId, itemInvId: item.inventoryId });
    }
  }, [activePetForModal?.inventoryId, powerUpMutation.mutate, useSpecialMutation.mutate]);
  // ────────────────────────────────────────────────────────────────────────────

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
              background: "radial-gradient(ellipse, rgba(240,192,64,0.2) 0%, rgba(240,160,20,0.08) 50%, transparent 70%)",
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
                <img
                  key={i}
                  src={starImg}
                  alt="star"
                  width={64}
                  height={64}
                  style={{
                    transform: `translateY(${curveY}px)`,
                    margin: "0 2px",
                    position: "relative",
                    zIndex: 1,
                    opacity: filled ? 1 : 0.15,
                    filter: filled
                      ? "drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 5px rgba(240,192,64,0.5)) drop-shadow(0 0 10px rgba(240,192,64,0.25))"
                      : "grayscale(1) drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)",
                  }}
                />
              );
            })}
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-0 py-0 min-h-0">
          <div ref={petContainerRef} className="relative flex items-center justify-center w-full max-w-[520px] md:max-w-[680px] lg:max-w-[800px]">

            {/* Rarity sparkle lights (3/4/5 star) — gated until container has real height */}
            {orbsReady && activePet && (activePet.rarity || 0) >= 3 && (() => {
              const rarity = activePet.rarity || 0;
              const is5 = rarity >= 5;
              const is4 = rarity >= 4;

              // sizes: "xs"=2px core/8 spread, "sm"=4px/16, "md"=8px/28, "lg"=14px/44
              type Orb = { left?: string; right?: string; top: string; color: string; anim: string; dur: string; delay: string; size: "xs"|"sm"|"md"|"lg" };

              // 3-star: 8 orbs spread around the pet body
              const orbs3: Orb[] = [
                { left:"10%",  top:"65%", color:"#f0c040", anim:"sparkOrb0", dur:"4.5s", delay:"0s",   size:"xs" },
                { right:"11%", top:"62%", color:"#fffde0", anim:"sparkOrb2", dur:"5.2s", delay:"1.4s", size:"xs" },
                { left:"20%",  top:"40%", color:"#f0c040", anim:"sparkOrb4", dur:"4.8s", delay:"0.7s", size:"sm" },
                { right:"21%", top:"38%", color:"#fffde0", anim:"sparkOrb6", dur:"4.1s", delay:"2.1s", size:"xs" },
                { left:"42%",  top:"18%", color:"#f0c040", anim:"sparkOrb8", dur:"5.0s", delay:"1.5s", size:"sm" },
                { left:"55%",  top:"76%", color:"#fffde0", anim:"sparkOrb3", dur:"4.3s", delay:"0.4s", size:"xs" },
                { left:"30%",  top:"55%", color:"#f0d060", anim:"sparkOrb1", dur:"3.9s", delay:"2.8s", size:"xs" },
                { right:"30%", top:"52%", color:"#f0c040", anim:"sparkOrb5", dur:"4.7s", delay:"1.0s", size:"sm" },
              ];
              // 4-star: 20 orbs with xs/sm/md coverage all over
              const orbs4: Orb[] = [
                { left:"5%",   top:"50%", color:"#f0c040", anim:"sparkOrb0", dur:"3.4s", delay:"0s",   size:"sm" },
                { left:"12%",  top:"70%", color:"#fffde0", anim:"sparkOrb1", dur:"4.2s", delay:"0.8s", size:"xs" },
                { right:"7%",  top:"48%", color:"#f0d060", anim:"sparkOrb2", dur:"3.8s", delay:"1.5s", size:"sm" },
                { right:"14%", top:"68%", color:"#fffde0", anim:"sparkOrb3", dur:"5.1s", delay:"0.3s", size:"xs" },
                { left:"24%",  top:"22%", color:"#f0c040", anim:"sparkOrb4", dur:"4.6s", delay:"2.0s", size:"md" },
                { right:"22%", top:"24%", color:"#fffde0", anim:"sparkOrb5", dur:"4.0s", delay:"1.1s", size:"sm" },
                { left:"4%",   top:"30%", color:"#f0d060", anim:"sparkOrb6", dur:"3.9s", delay:"2.3s", size:"xs" },
                { right:"4%",  top:"28%", color:"#fffde0", anim:"sparkOrb7", dur:"4.7s", delay:"0.5s", size:"xs" },
                { left:"38%",  top:"12%", color:"#f0c040", anim:"sparkOrb8", dur:"5.0s", delay:"1.8s", size:"sm" },
                { right:"35%", top:"15%", color:"#fffde0", anim:"sparkOrb9", dur:"3.6s", delay:"2.8s", size:"xs" },
                { left:"55%",  top:"42%", color:"#f0c040", anim:"sparkOrbA", dur:"4.4s", delay:"1.2s", size:"md" },
                { left:"18%",  top:"50%", color:"#fffde0", anim:"sparkOrbB", dur:"3.7s", delay:"0.6s", size:"xs" },
                { right:"18%", top:"55%", color:"#f0d060", anim:"sparkOrb0", dur:"4.9s", delay:"2.4s", size:"sm" },
                { left:"44%",  top:"72%", color:"#f0c040", anim:"sparkOrb2", dur:"3.5s", delay:"3.1s", size:"xs" },
                { right:"42%", top:"70%", color:"#fffde0", anim:"sparkOrb4", dur:"4.8s", delay:"0.2s", size:"xs" },
                { left:"62%",  top:"28%", color:"#f0c040", anim:"sparkOrb1", dur:"3.3s", delay:"1.7s", size:"sm" },
                { left:"8%",   top:"82%", color:"#fffde0", anim:"sparkOrb3", dur:"4.5s", delay:"0.9s", size:"xs" },
                { right:"8%",  top:"80%", color:"#f0d060", anim:"sparkOrb5", dur:"3.8s", delay:"2.6s", size:"sm" },
                { left:"50%",  top:"88%", color:"#f0c040", anim:"sparkOrb7", dur:"5.2s", delay:"1.4s", size:"xs" },
                { left:"33%",  top:"38%", color:"#fffde0", anim:"sparkOrb6", dur:"4.2s", delay:"3.3s", size:"md" },
              ];
              // 5-star extras: calm gold sparkles in varied shades
              const orbs5extra: Orb[] = [
                { left:"2%",   top:"44%", color:"#ffd700", anim:"calmSparkle0", dur:"7.2s", delay:"0.6s",  size:"md" },
                { right:"3%",  top:"41%", color:"#e8a020", anim:"calmSparkle1", dur:"6.5s", delay:"1.9s",  size:"md" },
                { left:"17%",  top:"78%", color:"#fff0a0", anim:"calmSparkle2", dur:"8.0s", delay:"2.5s",  size:"sm" },
                { right:"16%", top:"76%", color:"#f0c040", anim:"calmSparkle3", dur:"7.5s", delay:"0.1s",  size:"sm" },
                { left:"46%",  top:"8%",  color:"#ffeaa0", anim:"calmSparkle4", dur:"6.8s", delay:"3.0s",  size:"md" },
                { left:"1%",   top:"65%", color:"#ffe080", anim:"calmSparkle5", dur:"7.8s", delay:"1.3s",  size:"sm" },
                { right:"1%",  top:"60%", color:"#d4a020", anim:"calmSparkle0", dur:"6.3s", delay:"2.2s",  size:"md" },
                { left:"28%",  top:"88%", color:"#fff0a0", anim:"calmSparkle1", dur:"8.4s", delay:"0.7s",  size:"sm" },
                { right:"28%", top:"85%", color:"#ffd700", anim:"calmSparkle2", dur:"7.0s", delay:"1.6s",  size:"md" },
                { left:"60%",  top:"60%", color:"#e8a020", anim:"calmSparkle3", dur:"6.9s", delay:"2.9s",  size:"md" },
                { left:"14%",  top:"25%", color:"#ffe080", anim:"calmSparkle4", dur:"7.6s", delay:"0.4s",  size:"sm" },
                { right:"12%", top:"22%", color:"#ffeaa0", anim:"calmSparkle5", dur:"8.1s", delay:"3.4s",  size:"md" },
                { left:"52%",  top:"32%", color:"#ffd700", anim:"calmSparkle2", dur:"6.6s", delay:"1.0s",  size:"sm" },
                { right:"50%", top:"48%", color:"#d4a020", anim:"calmSparkle4", dur:"7.3s", delay:"4.0s",  size:"xs" },
              ];

              const allOrbs = is5 ? [...orbs4, ...orbs5extra] : is4 ? orbs4 : orbs3;

              // Glow bloom: bright core + layered soft spread, sized by orb.size
              const renderMote = (orb: Orb, idx: number) => {
                const sizeMap = { xs: { core: 2, spread: 8 }, sm: { core: 4, spread: 16 }, md: { core: 8, spread: 28 }, lg: { core: 14, spread: 44 } };
                const { core, spread } = sizeMap[orb.size];
                return (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      left: (orb as any).left,
                      right: (orb as any).right,
                      top: orb.top,
                      width: core,
                      height: core,
                      borderRadius: "50%",
                      background: "white",
                      boxShadow: [
                        `0 0 ${core * 1.5}px ${core * 0.8}px rgba(255,255,255,0.95)`,
                        `0 0 ${spread}px ${spread / 2}px ${orb.color}ee`,
                        `0 0 ${spread * 2}px ${spread}px ${orb.color}88`,
                        `0 0 ${spread * 3.5}px ${spread * 2}px ${orb.color}33`,
                      ].join(", "),
                      animation: `${orb.anim} ${orb.dur} ease-in-out infinite ${orb.delay}`,
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  />
                );
              };

              return (
                <>
                  {/* Soft aura behind the pet */}
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: is5
                      ? "radial-gradient(ellipse at center, rgba(255,215,0,0.18) 0%, rgba(232,160,32,0.1) 45%, transparent 72%)"
                      : is4
                        ? "radial-gradient(ellipse at center, rgba(240,192,64,0.12) 0%, transparent 60%)"
                        : "radial-gradient(ellipse at center, rgba(240,192,64,0.06) 0%, transparent 55%)",
                    animation: is5 ? "sparkAura5 4s ease-in-out infinite" : "sparkAura 4.5s ease-in-out infinite",
                    pointerEvents: "none",
                    zIndex: 0,
                  }} />
                  {allOrbs.map(renderMote)}
                </>
              );
            })()}

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
                  {/* Subtle gold glow under/behind pet for rarity 3+ */}
                  {(activePet.rarity || 0) >= 3 && (
                    <div style={{
                      position: "absolute",
                      bottom: "8%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "55%",
                      height: "30%",
                      background: (activePet.rarity || 0) >= 5
                        ? "radial-gradient(ellipse, rgba(200,160,255,0.28) 0%, rgba(240,192,64,0.18) 45%, transparent 72%)"
                        : (activePet.rarity || 0) >= 4
                          ? "radial-gradient(ellipse, rgba(240,192,64,0.22) 0%, rgba(240,160,20,0.1) 55%, transparent 75%)"
                          : "radial-gradient(ellipse, rgba(240,192,64,0.12) 0%, transparent 70%)",
                      filter: "blur(14px)",
                      animation: "sparkAura 5s ease-in-out infinite",
                      pointerEvents: "none",
                      zIndex: 0,
                    }} />
                  )}
                  <div
                    className="w-full flex items-center justify-center"
                    style={{
                      background: "transparent",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {activePet.isHatched ? (
                      <div
                        onClick={() => setShowActionMenu(true)}
                        style={{ cursor: "pointer" }}
                        className="w-full flex items-center justify-center"
                        data-testid="button-open-pet-actions"
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

      {/* ── Active pet action menu ── */}
      {showActionMenu && activePetForModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => { setShowActionMenu(false); setShowResetConfirm(false); }}
          />
          <div
            className="relative w-full rounded-t-3xl overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(10,20,12,0.99) 0%, rgba(6,14,8,0.99) 100%)",
              border: "1.5px solid rgba(74,222,128,0.18)",
              borderBottom: "none",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 -2px 0 rgba(74,222,128,0.15)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(74,222,128,0.3)" }} />
            </div>

            {/* Pet identity header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4">
              <div>
                <p className="font-fantasy text-lg font-bold tracking-wider" style={{ color: "#fcd34d", textShadow: "0 0 14px rgba(252,211,77,0.4)" }}>
                  {activePetForModal.petNickname || activePetForModal.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-fantasy text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(192,132,252,0.15)", color: "#c084fc", border: "1px solid rgba(192,132,252,0.3)" }}>
                    LV {activePetForModal.petLevel}
                  </span>
                  <span style={{ color: "#fcd34d", fontSize: 11 }}>
                    {"★".repeat(activePetForModal.rarity || 1)}
                  </span>
                </div>
              </div>
              <button
                data-testid="button-close-action-menu"
                onClick={() => { setShowActionMenu(false); setShowResetConfirm(false); }}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            {!showResetConfirm ? (
              <div className="px-5 pb-10 flex flex-col gap-3">
                {/* Power Up */}
                <button
                  data-testid="button-action-power-up"
                  onClick={() => { setShowActionMenu(false); setActivePetModal("power_up"); }}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(74,222,128,0.15) 0%, rgba(34,197,94,0.08) 100%)",
                    border: "1.5px solid rgba(74,222,128,0.35)",
                    boxShadow: "0 0 20px rgba(74,222,128,0.1)",
                    cursor: "pointer",
                  }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.4)" }}>
                    <Zap size={22} style={{ color: "#4ade80", filter: "drop-shadow(0 0 6px rgba(74,222,128,0.8))" }} />
                  </div>
                  <div className="text-left">
                    <p className="font-fantasy font-bold tracking-wider" style={{ color: "#4ade80", fontSize: 14, textShadow: "0 0 10px rgba(74,222,128,0.5)" }}>POWER UP</p>
                    <p className="font-fantasy text-[#6a9a6a] text-[10px] tracking-wide mt-0.5">Boost HP, ATK, or DEF stats</p>
                  </div>
                  <span className="ml-auto font-fantasy text-[#4ade80] text-lg opacity-50">›</span>
                </button>

                {/* Level Up */}
                <button
                  data-testid="button-action-level-up"
                  onClick={() => { setShowActionMenu(false); setActivePetModal("level_up"); }}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(252,211,77,0.15) 0%, rgba(240,192,64,0.08) 100%)",
                    border: "1.5px solid rgba(252,211,77,0.35)",
                    boxShadow: "0 0 20px rgba(252,211,77,0.1)",
                    cursor: "pointer",
                  }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(252,211,77,0.2)", border: "1px solid rgba(252,211,77,0.4)" }}>
                    <Star size={22} style={{ color: "#fcd34d", filter: "drop-shadow(0 0 6px rgba(252,211,77,0.8))" }} />
                  </div>
                  <div className="text-left">
                    <p className="font-fantasy font-bold tracking-wider" style={{ color: "#fcd34d", fontSize: 14, textShadow: "0 0 10px rgba(252,211,77,0.5)" }}>LEVEL UP</p>
                    <p className="font-fantasy text-[#8a7a3a] text-[10px] tracking-wide mt-0.5">Use XP items to raise your pet's level</p>
                  </div>
                  <span className="ml-auto font-fantasy text-[#fcd34d] text-lg opacity-50">›</span>
                </button>

                {/* Reset Stats */}
                <button
                  data-testid="button-action-reset-stats"
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(248,113,113,0.1) 0%, rgba(220,60,60,0.06) 100%)",
                    border: "1.5px solid rgba(248,113,113,0.25)",
                    cursor: "pointer",
                  }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)" }}>
                    <RotateCcw size={20} style={{ color: "#f87171" }} />
                  </div>
                  <div className="text-left">
                    <p className="font-fantasy font-bold tracking-wider" style={{ color: "#f87171", fontSize: 14 }}>RESET STATS</p>
                    <p className="font-fantasy text-[#8a4a4a] text-[10px] tracking-wide mt-0.5">Restore base stats (costs coins)</p>
                  </div>
                  <span className="ml-auto font-fantasy text-[#f87171] text-lg opacity-50">›</span>
                </button>
              </div>
            ) : (
              <div className="px-5 pb-10 flex flex-col gap-4">
                <div className="rounded-2xl p-4" style={{ background: "rgba(248,113,113,0.08)", border: "1.5px solid rgba(248,113,113,0.25)" }}>
                  <p className="font-fantasy text-[#f87171] text-sm font-bold tracking-wider mb-1">Confirm Reset?</p>
                  <p className="font-fantasy text-[#8a5a5a] text-[11px] leading-relaxed">
                    This will restore {activePetForModal.petNickname || activePetForModal.name}'s stats to their base values. This action costs coins and cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#888", cursor: "pointer" }}
                  >
                    CANCEL
                  </button>
                  <button
                    data-testid="button-confirm-reset"
                    onClick={() => resetMutation.mutate(activePetForModal.inventoryId)}
                    disabled={resetMutation.isPending}
                    className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, rgba(220,60,60,0.4) 0%, rgba(180,40,40,0.4) 100%)", border: "1.5px solid rgba(248,113,113,0.5)", color: "#f87171", cursor: "pointer", boxShadow: "0 0 14px rgba(248,113,113,0.2)" }}
                  >
                    {resetMutation.isPending ? "RESETTING..." : "CONFIRM RESET"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Power Up modal ── */}
      {activePetModal === "power_up" && activePetForModal && (
        <PetPowerUpModal
          petName={activePetForModal.petNickname || activePetForModal.name}
          petImage={activePetForModal.hatchedImageUrl || activePetForModal.imageUrl}
          petTemplateId={activePetForModal.petTemplateId}
          rarity={activePetForModal.rarity || 1}
          petLevel={activePetForModal.petLevel}
          itemsRemaining={Math.max(0, (activePetForModal.petLevel || 1) * ((activePetForModal.rarity || 1) <= 2 ? 2 : 3) - (activePetForModal.itemsUsedThisLevel || 0))}
          items={statBoostItems}
          isPending={powerUpMutation.isPending || useSpecialMutation.isPending}
          title="POWER UP"
          subtitle={`Drag an item onto ${activePetForModal.petNickname || activePetForModal.name} to boost their stats`}
          successEffect={petModalSuccess}
          onUseItem={handleModalUseItem}
          onSuccessAnimEnd={() => setPetModalSuccess(null)}
          onClose={() => setActivePetModal(null)}
        />
      )}

      {/* ── Level Up modal ── */}
      {activePetModal === "level_up" && activePetForModal && (
        <PetPowerUpModal
          petName={activePetForModal.petNickname || activePetForModal.name}
          petImage={activePetForModal.hatchedImageUrl || activePetForModal.imageUrl}
          petTemplateId={activePetForModal.petTemplateId}
          rarity={activePetForModal.rarity || 1}
          petLevel={activePetForModal.petLevel}
          itemsRemaining={Infinity}
          items={levelItems}
          isPending={powerUpMutation.isPending || useSpecialMutation.isPending}
          title="LEVEL UP"
          subtitle={`Drag an XP item onto ${activePetForModal.petNickname || activePetForModal.name} to gain levels`}
          successEffect={petModalSuccess}
          onUseItem={handleModalUseItem}
          onSuccessAnimEnd={() => setPetModalSuccess(null)}
          onClose={() => setActivePetModal(null)}
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{
            maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
            opacity: hatchFadingOut ? 0 : 1,
            transition: hatchFadingOut ? "opacity 0.6s ease-out" : "none",
          }}
        >
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
      {!showHomePageTutorial && !showProfile && !showActionMenu && !activePetModal && (
        <button
          data-testid="button-open-homepage-tutorial"
          onClick={() => setShowHomePageTutorial(true)}
          className="absolute z-30 flex items-center justify-center rounded-full transition-transform active:scale-90"
          style={{
            top: "68px",
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
        <div
          className={`flex-1 h-1.5 rounded-full overflow-hidden${isReady ? " animate-pulse" : ""}`}
          style={{
            background: "rgba(0,0,0,0.4)",
            boxShadow: isReady ? "0 0 6px rgba(74,222,128,0.5)" : "none",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              background: isReady ? "linear-gradient(90deg, #4ade80, #22c55e)" : "linear-gradient(90deg, #f0c040, #d4a017)",
              height: "100%",
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
