import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { X, Zap, Star, RotateCcw, ShieldPlus } from "lucide-react";
import supportIconImg from "@assets/Photoroom_20260708_111738_PM_1783570684580.png";
import WorldChatPanel from "@/components/WorldChatPanel";
import PetDetailPage from "@/components/PetDetailPage";
import worldChatIconImg from "@assets/generated_images/veridian_watcher_avatar.png";
import petActionRingImg from "@assets/Photoroom_20260611_74428_AM_1781181905848.png";
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
import { QuillBadge } from "@/components/QuillBadge";
import { clientToStage, getDesignW } from "@/lib/stage";
import { bjGetStep, bjIsStep5FakeMode, bjIsStep5TapMode } from "@/lib/beginJourney";
import { fireLevelUp } from "@/lib/levelUpEvents";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import PetPowerUpModal, { PowerUpItem } from "@/components/PetPowerUpModal";
import PowerUpOverlay from "@/components/PowerUpOverlay";
import questArrowImg from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";
import raidHpFrameImg from "@assets/Photoroom_20260711_31007_PM_1783820810778.png";

interface HomePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    isModerator?: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
  isOverlayActive?: boolean;
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
  canFly?: boolean;
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

export default function HomePage({ user, isOverlayActive = false }: HomePageProps) {
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
  // Tracks when the action menu was last opened so hotspot buttons can
  // ignore ghost clicks that Android fires ~300ms after a touch lifts.
  const menuOpenedAtRef = useRef<number>(0);
  const [showPetStats, setShowPetStats] = useState(false);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("petStatsToggle", { detail: { open: showPetStats } }));
  }, [showPetStats]);
  // Sparkle bursts for the pet-action ring buttons. Each entry is one floating
  // particle positioned in viewport coords with a colour that matches the
  // rune that was tapped.
  const [ringSparkles, setRingSparkles] = useState<
    { id: number; x: number; y: number; dx: number; dy: number; color: string; size: number; delay: number }[]
  >([]);
  const ringSparkIdRef = useRef(0);
  const burstRingSparkles = useCallback((cx: number, cy: number, color: string, count = 14) => {
    const newOnes = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      return {
        id: ++ringSparkIdRef.current,
        x: cx,
        y: cy,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        color,
        size: 6 + Math.random() * 10,
        delay: Math.random() * 0.12,
      };
    });
    setRingSparkles((s) => [...s, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setRingSparkles((s) => s.filter((x) => !ids.has(x.id))), 1200);
  }, []);
  const [activePetModal, setActivePetModal] = useState<"power_up" | "level_up" | null>(null);
  const [powerUpFromQuest, setPowerUpFromQuest] = useState(false);
  const [questGuideMode, setQuestGuideMode] = useState<"powerup" | "feed" | null>(null);
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
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [showWorldChat, setShowWorldChat] = useState(false);
  const [chatHasNewMsg, setChatHasNewMsg] = useState(false);
  const bgChatCountRef = useRef(-1);
  const [dismissedRequests, setDismissedRequests] = useState<Set<string>>(() => new Set());

  // Background poll for world chat — detects new messages even when the panel is closed
  // so the icon can glow when Veridian Watcher or other players post.
  const { data: bgChatData } = useQuery<any[]>({
    queryKey: ["/api/world-chat"],
    refetchInterval: showWorldChat ? false : 15000,
    enabled: !!currentUser,
    staleTime: 0,
  });
  useEffect(() => {
    if (!bgChatData) return;
    const count = bgChatData.length;
    if (bgChatCountRef.current === -1) {
      bgChatCountRef.current = count;
      return;
    }
    if (!showWorldChat && count > bgChatCountRef.current) {
      setChatHasNewMsg(true);
    }
    bgChatCountRef.current = count;
  }, [bgChatData, showWorldChat]);

  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();

  const { data: raidStatusData } = useQuery<{ raidVisible: boolean }>({
    queryKey: ["/api/raid-status"],
    staleTime: 60_000,
  });
  const raidVisible = raidStatusData?.raidVisible === true || currentUser?.isAdmin === true || currentUser?.isModerator === true;

  const { data: raidBossData } = useQuery<{ templateId: string | null; rarity: number | null; name: string | null; hp: number; maxHp: number }>({
    queryKey: ["/api/raid-boss"],
    staleTime: 60_000,
    enabled: raidVisible,
  });

  const { data: pendingRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    queryFn: async () => {
      const res = await fetch("/api/friends/requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 10000,
    enabled: !!currentUser,
  });

  const supportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/support-message", {
      username: currentUser.username,
      email: currentUser.email,
      subject: supportSubject,
      message: supportMessage,
    }).then(r => r.json()),
    onSuccess: () => setSupportSent(true),
    onError: () => toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" }),
  });

  const acceptFriendMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: (_, requestId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      setDismissedRequests(s => new Set([...s, requestId]));
    },
  });

  const declineFriendMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/friends/${userId}`, {}),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      setDismissedRequests(s => new Set([...s, userId]));
    },
  });

  // Open Power Up modal when navigated here via "/?action=powerup" (daily quest Go button)
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("action") === "powerup") {
      window.history.replaceState({}, "", "/");
      setPowerUpFromQuest(true);
      setActivePetModal("power_up");
    }
  }, [searchString]);

  // Quest guided arrow — activated by "Go" on Power Up / Feed Pet quests
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const hint = params.get("questHint");
    if (hint === "powerup" || hint === "feed") {
      window.history.replaceState({}, "", "/");
      setQuestGuideMode(hint as "powerup" | "feed");
    }
  }, [searchString]);

  // ── Active-pet petting gesture (mirrors the Pet Care page) ───────────────
  // Tap = open the action menu (legacy behaviour). A circular swipe over the
  // pet calls the petting-reward endpoint and shows hearts. We only switch a
  // tap into a pet-gesture once the pointer has accumulated meaningful
  // angular travel, so taps still open the menu reliably.
  const activePetIdRef = useRef<string | null>(null);
  const petGestureStateRef = useRef<{
    pid: number;
    startX: number;
    startY: number;
    cx: number;
    cy: number;
    lastAngle: number | null;
    travel: number;
    pettedThisPress: boolean;
    moved: boolean;
    heartTimer: number | null;
    sparkleTimer: number | null;
    resetTimer: number | null;
  } | null>(null);
  const [petPressed, setPetPressed] = useState(false);
  const [petCircling, setPetCircling] = useState(false);
  const [petHearts, setPetHearts] = useState<{ id: number; cx: number; cy: number; dx: number; size: number; delay: number }[]>([]);
  const [petSparkles, setPetSparkles] = useState<{ id: number; cx: number; cy: number; dx: number; dy: number; size: number; delay: number }[]>([]);
  const petHeartIdRef = useRef(0);
  const petSparkleIdRef = useRef(0);
  // Clamp a viewport x-coord so a particle of `size` px stays fully inside
  // the visible window even AFTER its CSS animation drifts by ±`drift` px.
  // Hearts/sparkles use position: fixed, so the visible window — not the
  // pet container — is the right reference. Without this the bursts visibly
  // flew off the right edge on iPhone (the touch wrapper centers near 195px
  // but a ±110 spawn jitter + ±160 CSS drift could push particles past 465px).
  // Hearts/sparkles are positioned in #game-stage LOCAL design-space (they're
  // `position: fixed` inside the scaled stage), so clamp to the authored frame
  // width — NOT window.innerWidth, which is the wrong coordinate space on
  // tablets/desktop and let particles drift outside the visible frame.
  const clampX = useCallback((x: number, size: number, drift: number) => {
    const w = getDesignW();
    const half = size / 2;
    const min = half + Math.max(0, drift) + 4;
    const max = w - half - Math.max(0, drift) - 4;
    if (max <= min) return w / 2;
    return Math.min(Math.max(x, min), max);
  }, []);
  const burstPetHearts = useCallback((cx: number, cy: number, count = 6) => {
    const newOnes = Array.from({ length: count }, () => {
      const size = 18 + Math.random() * 22;
      const dx = (Math.random() - 0.5) * 220; // tightened from 320
      const spawnX = cx + (Math.random() - 0.5) * 160; // tightened from 220
      const spawnY = cy + (Math.random() - 0.5) * 80;
      // cx/cy arrive in viewport coords (from getBoundingClientRect); convert
      // to stage-local so `fixed` particles land on the pet on every device.
      const p = clientToStage(spawnX, spawnY);
      return {
        id: ++petHeartIdRef.current,
        cx: clampX(p.x, size, Math.abs(dx)),
        cy: p.y,
        dx,
        size,
        delay: Math.random() * 0.3,
      };
    });
    setPetHearts((h) => [...h, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setPetHearts((h) => h.filter((x) => !ids.has(x.id))), 2400);
  }, [clampX]);
  const burstPetSparkles = useCallback((cx: number, cy: number, count = 6) => {
    const newOnes = Array.from({ length: count }, () => {
      const size = 6 + Math.random() * 10;
      const dx = (Math.random() - 0.5) * 90;
      // Convert the viewport spawn point to stage-local design coords (see
      // burstPetHearts) so sparkles trace the pet on tablets/desktop too.
      const p = clientToStage(cx, cy);
      return {
        id: ++petSparkleIdRef.current,
        cx: clampX(p.x, size, Math.abs(dx)),
        cy: p.y,
        dx,
        dy: (Math.random() - 0.5) * 90,
        size,
        delay: Math.random() * 0.2,
      };
    });
    setPetSparkles((s) => [...s, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    setTimeout(() => setPetSparkles((s) => s.filter((x) => !ids.has(x.id))), 1200);
  }, [clampX]);
  const homePettingRewardMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", `/api/pets/${inventoryId}/petting-reward`, {});
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      if (data?.coins !== undefined) {
        queryClient.setQueryData(["/api/auth/me"], (old: any) =>
          old ? { ...old, coins: data.coins } : old
        );
        setCurrentUser(prev => ({ ...prev, coins: data.coins }));
      }
    },
  });
  // Mirrors the Pet Care page: a circular drag triggers continuous heart and
  // sparkle bursts while the finger keeps moving, and stops 350ms after the
  // motion ends.
  const startCircleEffects = useCallback(() => {
    const g = petGestureStateRef.current;
    if (!g) return;
    setPetCircling(true);
    if (g.heartTimer == null) {
      const tick = () => {
        const cur = petGestureStateRef.current;
        if (!cur) return;
        burstPetHearts(cur.cx, cur.cy + 30, 2);
      };
      tick();
      g.heartTimer = window.setInterval(tick, 380);
    }
    if (g.sparkleTimer == null) {
      const sparkleTick = () => {
        const cur = petGestureStateRef.current;
        if (!cur) return;
        const ringAngle = Math.random() * Math.PI * 2;
        const ringR = 60 + Math.random() * 40;
        burstPetSparkles(cur.cx + Math.cos(ringAngle) * ringR, cur.cy + Math.sin(ringAngle) * ringR, 5);
      };
      sparkleTick();
      g.sparkleTimer = window.setInterval(sparkleTick, 180);
    }
    if (g.resetTimer != null) window.clearTimeout(g.resetTimer);
    g.resetTimer = window.setTimeout(() => {
      const cur = petGestureStateRef.current;
      if (cur?.heartTimer != null) { window.clearInterval(cur.heartTimer); cur.heartTimer = null; }
      if (cur?.sparkleTimer != null) { window.clearInterval(cur.sparkleTimer); cur.sparkleTimer = null; }
      setPetCircling(false);
    }, 350);
  }, [burstPetHearts, burstPetSparkles]);
  const stopCircleEffects = useCallback(() => {
    const g = petGestureStateRef.current;
    if (g?.heartTimer != null) { window.clearInterval(g.heartTimer); g.heartTimer = null; }
    if (g?.sparkleTimer != null) { window.clearInterval(g.sparkleTimer); g.sparkleTimer = null; }
    if (g?.resetTimer != null) { window.clearTimeout(g.resetTimer); g.resetTimer = null; }
    setPetCircling(false);
    setPetPressed(false);
  }, []);
  const activePetTouchHandlers = useMemo(() => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget as HTMLDivElement;
      target.setPointerCapture?.(e.pointerId);
      const box = target.getBoundingClientRect();
      petGestureStateRef.current = {
        pid: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        cx: box.left + box.width / 2,
        cy: box.top + box.height / 2,
        lastAngle: null,
        travel: 0,
        pettedThisPress: false,
        moved: false,
        heartTimer: null,
        sparkleTimer: null,
        resetTimer: null,
      };
      setPetPressed(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = petGestureStateRef.current;
      if (!g || g.pid !== e.pointerId) return;
      const dx = e.clientX - g.cx;
      const dy = e.clientY - g.cy;
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 6) g.moved = true;
      const dist = Math.hypot(dx, dy);
      if (dist < 18) return;
      const angle = Math.atan2(dy, dx);
      if (g.lastAngle != null) {
        let d = angle - g.lastAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        g.travel += Math.abs(d);
        if (g.travel > Math.PI * 0.66) {
          startCircleEffects();
          if (!g.pettedThisPress) {
            g.pettedThisPress = true;
            const id = activePetIdRef.current;
            if (id) homePettingRewardMutation.mutate(id);
          }
        }
      }
      g.lastAngle = angle;
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const g = petGestureStateRef.current;
      if (!g || g.pid !== e.pointerId) { stopCircleEffects(); petGestureStateRef.current = null; return; }
      const wasPet = g.pettedThisPress;
      const movedFar = g.moved;
      stopCircleEffects();
      petGestureStateRef.current = null;
      // Treat as a tap (open the action menu) only when the gesture didn't
      // turn into a circular pet AND the finger barely moved.
      if (!wasPet && !movedFar) { menuOpenedAtRef.current = Date.now(); setShowActionMenu(true); }
    },
    onPointerCancel: () => { stopCircleEffects(); petGestureStateRef.current = null; },
  }), [homePettingRewardMutation, startCircleEffects, stopCircleEffects]);

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
  });

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.inventoryId === currentUser.activePetId && item.type === "pet")
    : null;

  // Freeze the last valid activePet so power-up modals stay mounted during
  // inventory refetches (avoids modal closing mid power-up).
  if (activePet) frozenActivePetRef.current = activePet;
  activePetIdRef.current = activePet?.inventoryId ?? null;

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
    mutationFn: async ({ petInvId, itemInvId, specialAmount, tutorialFill }: { petInvId: string; itemInvId: string; specialAmount?: number | null; tutorialFill?: boolean }) => {
      const res = await apiRequest("POST", `/api/pet/${petInvId}/use-special`, { itemInventoryId: itemInvId, tutorialFill: tutorialFill ?? false });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      playSpeedUp();
      setShowSpeedUp(false);
      setHomeDragging(null);
      setHomeDragOver(false);
      window.dispatchEvent(new CustomEvent("bj_speedup_used"));
      setSpeedEffectLabel(`-${variables.specialAmount ?? "?"} min`);
      setShowSpeedEffect(true);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  // ── Tutorial: close speed-up sheet when tutorial signals egg is ready ────────
  useEffect(() => {
    const handler = () => { setShowSpeedUp(false); setHomeDragging(null); setHomeDragOver(false); };
    window.addEventListener("bj_close_speedup", handler);
    return () => window.removeEventListener("bj_close_speedup", handler);
  }, []);

  // ── Tutorial: open speed-up sheet when step 5 starts (works on reload too) ──
  // NOTE: the sheet itself is hidden during step 5 (bjGetStep() !== 5 guard above).
  // bj_open_speedup just sets state so the overlay knows potions are "ready".
  useEffect(() => {
    const handler = () => { setShowSpeedUp(true); };
    window.addEventListener("bj_open_speedup", handler);
    return () => window.removeEventListener("bj_open_speedup", handler);
  }, []);

  // ── Tutorial step 5: overlay's single potion card fires this event on tap ──
  // We handle the mutation here because speedUpMutation lives in HomePage.
  useEffect(() => {
    const handler = (e: Event) => {
      const { petInvId, itemInvId, specialAmount } = (e as CustomEvent<{
        petInvId: string; itemInvId: string; specialAmount: number;
      }>).detail;
      if (petInvId && itemInvId) {
        // Tutorial step 5: this path is the ONLY one that requests the instant
        // hatch-ready fill. All normal speed-up paths omit tutorialFill and get
        // the item's specific minute reduction instead.
        speedUpMutation.mutate({ petInvId, itemInvId, specialAmount, tutorialFill: true });
      }
    };
    window.addEventListener("bj_step5_use_potion", handler as EventListener);
    return () => window.removeEventListener("bj_step5_use_potion", handler as EventListener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        ? `+${item.statBoostAmount || "?"} ${item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType === "lvl" ? "Feed pts" : "Lvl pts"}`
        : "Power Up!";
      setPetModalSuccess({ type: item?.statBoostType === "lvl" ? "level" : "stat", label: boostLabel });
      if (data?.petLevel && activePetForModal && data.petLevel > activePetForModal.petLevel) {
        fireLevelUp(data.petLevel, activePetForModal.petNickname || activePetForModal.name, activePetForModal.petTemplateId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests/daily"] });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Failed", description: err?.message || "Could not use item", variant: "destructive" });
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

    // ── Tutorial step 5 ────────────────────────────────────────────────────────
    // The normal drop-zone rect check fails during the tutorial because
    // homeEggDropRef points to the small egg INSIDE the sheet, not the big
    // spotlit egg in the center of the screen.  Accept ANY gesture (tap or
    // drag in any direction) on a potion as "used on egg" so the tutorial
    // always completes.
    if (bjGetStep() === 5) {
      e.preventDefault();
      const pid = e.pointerId;
      const startX = e.clientX, startY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (dist > 6) {
          setHomeDragging({ item, x: ev.clientX, y: ev.clientY });
          // Light up "over egg" glow when pointer drifts into the upper region
          setHomeDragOver(ev.clientY < window.innerHeight * 0.65);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup",   onUp);
        document.removeEventListener("pointercancel", onUp);
        setHomeDragging(null);
        setHomeDragOver(false);

        // Fire the tutorial action for any tap or drag gesture
        if (bjIsStep5FakeMode()) {
          playSpeedUp();
          setSpeedEffectLabel(`-${item.specialAmount ?? 60} min`);
          setShowSpeedEffect(true);
          setTimeout(() => window.dispatchEvent(new CustomEvent("bj_fake_speedup_done")), 350);
        } else if (!speedUpMutation.isPending) {
          speedUpMutation.mutate({ petInvId: activePet.inventoryId, itemInvId: item.inventoryId, specialAmount: item.specialAmount });
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup",   onUp);
      document.addEventListener("pointercancel", onUp);
      return;
    }

    // ── Normal (non-tutorial) drag logic ──────────────────────────────────────
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
      document.removeEventListener("pointerup",   onUp);
      setHomeDragOver(false);
      if (!dragActive) {
        // Tap: e.preventDefault() suppresses onClick on mobile — fire directly
        if (!speedUpMutation.isPending) {
          speedUpMutation.mutate({ petInvId, itemInvId: item.inventoryId, specialAmount: item.specialAmount });
        }
        setHomeDragging(null);
        return;
      }
      const dropRect = homeEggDropRef.current?.getBoundingClientRect();
      const overDrop = !!(dropRect &&
        ev.clientX >= dropRect.left && ev.clientX <= dropRect.right &&
        ev.clientY >= dropRect.top  && ev.clientY <= dropRect.bottom);
      if (overDrop) {
        speedUpMutation.mutate({ petInvId, itemInvId: item.inventoryId, specialAmount: item.specialAmount });
      }
      setHomeDragging(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup",   onUp);
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
        caretColor: "transparent",
      }}
    >
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 38%, transparent 58%, rgba(0,0,0,0.60) 100%)" }} />


      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute" style={{ left: "12%", top: "25%", width: "8px", height: "8px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.8) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 18px rgba(127,255,212,0.35)", animation: "orbFloat1 8s ease-in-out infinite", willChange: "transform" }} />
        <div className="absolute" style={{ right: "15%", top: "20%", width: "6px", height: "6px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,230,255,0.8) 0%, rgba(200,230,255,0) 70%)", boxShadow: "0 0 14px rgba(200,230,255,0.3)", animation: "orbFloat2 10s ease-in-out infinite 1s", willChange: "transform" }} />
        <div className="absolute" style={{ left: "25%", top: "55%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(180,255,200,0.7) 0%, rgba(180,255,200,0) 70%)", boxShadow: "0 0 12px rgba(180,255,200,0.3)", animation: "orbFloat3 9s ease-in-out infinite 2s", willChange: "transform" }} />
        <div className="absolute" style={{ right: "20%", top: "45%", width: "7px", height: "7px", borderRadius: "50%", background: "radial-gradient(circle, rgba(240,220,130,0.7) 0%, rgba(240,220,130,0) 70%)", boxShadow: "0 0 16px rgba(240,220,130,0.3)", animation: "orbFloat1 11s ease-in-out infinite 3s", willChange: "transform" }} />
        <div className="absolute" style={{ left: "8%", top: "40%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.6) 0%, rgba(127,255,212,0) 70%)", boxShadow: "0 0 8px rgba(127,255,212,0.25)", animation: "orbFloat2 7s ease-in-out infinite 4s", willChange: "transform" }} />
        <div className="absolute" style={{ right: "10%", top: "65%", width: "5px", height: "5px", borderRadius: "50%", background: "radial-gradient(circle, rgba(160,200,255,0.6) 0%, rgba(160,200,255,0) 70%)", boxShadow: "0 0 10px rgba(160,200,255,0.25)", animation: "orbFloat3 12s ease-in-out infinite 1.5s", willChange: "transform" }} />
        <div className="absolute" style={{ left: "45%", top: "15%", width: "10px", height: "10px", borderRadius: "50%", background: "radial-gradient(circle, rgba(200,255,220,0.4) 0%, rgba(200,255,220,0) 70%)", boxShadow: "0 0 18px rgba(200,255,220,0.15)", animation: "orbPulse 5s ease-in-out infinite", willChange: "transform, opacity" }} />
        <div className="absolute" style={{ left: "65%", top: "35%", width: "4px", height: "4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,240,180,0.7) 0%, rgba(255,240,180,0) 70%)", boxShadow: "0 0 6px rgba(255,240,180,0.3)", animation: "orbFloat1 6s ease-in-out infinite 5s", willChange: "transform" }} />
      </div>

      <div className="relative flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", visibility: (isOverlayActive || showPetStats) ? "hidden" : "visible" }}>
        <div style={{ position: "absolute", top: 18, left: 0, right: 0, zIndex: 40, pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto" }}>
            <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
          </div>
        </div>

        {/* Friend request notifications */}
        {pendingRequests.filter(r => !dismissedRequests.has(r.id)).length > 0 && (
          <div
            style={{ position: "relative", zIndex: 35, pointerEvents: "auto", padding: "4px 12px 0" }}
            data-testid="section-friend-requests"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pendingRequests.filter(r => !dismissedRequests.has(r.id)).map((req: any) => (
                <div
                  key={req.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{
                    background: "rgba(10,6,0,0.85)",
                    border: "1px solid rgba(212,160,23,0.35)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
                  }}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 rounded-lg overflow-hidden"
                    style={{ width: 36, height: 36, border: "1.5px solid rgba(212,160,23,0.4)" }}>
                    {req.profileImage ? (
                      <img src={req.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #2a1a0a, #4a2e18)" }}>
                        <span className="font-fantasy text-[#d4a017] font-bold text-sm">
                          {(req.username ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-xs" style={{ color: "#f6dc8a", lineHeight: 1.2 }}>
                      <span style={{ fontWeight: 600 }}>{req.username}</span>
                    </p>
                    <p className="font-fantasy text-[9px]" style={{ color: "rgba(212,160,23,0.55)" }}>
                      sent you a friend request
                    </p>
                  </div>

                  {/* Accept */}
                  <button
                    data-testid={`button-accept-friend-${req.id}`}
                    onClick={() => acceptFriendMutation.mutate(req.id)}
                    disabled={acceptFriendMutation.isPending || declineFriendMutation.isPending}
                    style={{
                      padding: "5px 12px", borderRadius: 7,
                      background: "rgba(15,60,30,0.8)",
                      border: "1.5px solid rgba(74,222,128,0.5)",
                      color: "#4ade80",
                      fontFamily: "Lora, serif", fontSize: 10, letterSpacing: "0.05em",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    Accept
                  </button>

                  {/* Decline */}
                  <button
                    data-testid={`button-decline-friend-${req.id}`}
                    onClick={() => declineFriendMutation.mutate(req.requesterId)}
                    disabled={acceptFriendMutation.isPending || declineFriendMutation.isPending}
                    style={{
                      padding: "5px 12px", borderRadius: 7,
                      background: "rgba(60,15,15,0.7)",
                      border: "1.5px solid rgba(220,60,60,0.4)",
                      color: "#f87171",
                      fontFamily: "Lora, serif", fontSize: 10, letterSpacing: "0.05em",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    Decline
                  </button>

                  {/* Dismiss */}
                  <button
                    onClick={() => setDismissedRequests(s => new Set([...s, req.id]))}
                    style={{ color: "rgba(168,152,120,0.4)", fontSize: 14, background: "none", border: "none", cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePet && (
          <div
            data-testid="display-pet-rarity-stars"
            className="relative shrink-0 flex justify-center items-center"
            style={{
              pointerEvents: "none",
              zIndex: 30,
              paddingTop: "155px",
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
          <div
            ref={petContainerRef}
            className="relative flex items-center justify-center w-full max-w-[520px] md:max-w-[680px] lg:max-w-[800px]"
            style={{ marginBottom: activePet ? "calc(26*var(--vh))" : undefined }}
          >

            {/* ── Raid Boss — floats to the right of the active pet ── */}
            {raidVisible && raidBossData?.templateId && (
              <div
                data-testid="display-raid-boss"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: "42%",
                  transform: "translateX(18%)",
                  zIndex: 4,
                  pointerEvents: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                {/* Red ominous glow under boss */}
                <div style={{
                  position: "absolute",
                  bottom: "8%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "70%",
                  height: "25%",
                  background: "radial-gradient(ellipse, rgba(220,40,20,0.22) 0%, rgba(180,20,10,0.08) 50%, transparent 75%)",
                  filter: "blur(12px)",
                  pointerEvents: "none",
                  zIndex: 0,
                }} />

                {/* Star rarity above boss head */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: -4, zIndex: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const filled = i < (raidBossData.rarity || 0);
                    return (
                      <img
                        key={i}
                        src={starImg}
                        alt="star"
                        width={26}
                        height={26}
                        style={{
                          margin: "0 1px",
                          opacity: filled ? 1 : 0.12,
                          filter: filled
                            ? "drop-shadow(0 0 3px rgba(240,80,40,0.8)) drop-shadow(0 0 6px rgba(220,40,20,0.5))"
                            : "grayscale(1) drop-shadow(0 0 1px #000)",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Boss name label */}
                <p
                  style={{
                    fontFamily: "Lora, serif",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "#e86060",
                    textShadow: "0 0 8px rgba(220,40,20,0.6)",
                    marginBottom: 2,
                    zIndex: 2,
                    textAlign: "center",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {raidBossData.name}
                </p>

                {/* Boss pet render */}
                <div style={{ width: "100%", position: "relative", zIndex: 1 }}>
                  <PetAnimator
                    petTemplateId={raidBossData.templateId}
                    mode="idle"
                    view="front"
                    size={1000}
                    expression="neutral"
                    className="w-full"
                    style={{ aspectRatio: "1/1", filter: "drop-shadow(0 0 6px rgba(200,30,20,0.4))" }}
                  />
                </div>

                {/* HP bar under the boss */}
                <div style={{ width: "130%", position: "relative", zIndex: 3, marginTop: -8 }}>
                  {/* HP numbers row */}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "14%", paddingRight: "14%", marginBottom: 1 }}>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 8, color: "#e86060", textShadow: "0 1px 3px rgba(0,0,0,0.9)", letterSpacing: "0.04em" }}>
                      HP
                    </span>
                    <span style={{ fontFamily: "Lora, serif", fontSize: 8, color: "#f0c040", textShadow: "0 1px 3px rgba(0,0,0,0.9)", letterSpacing: "0.03em" }}>
                      {(raidBossData.hp ?? 0).toLocaleString()} / {(raidBossData.maxHp ?? 0).toLocaleString()}
                    </span>
                  </div>
                  {/* Frame + fill */}
                  <div style={{ position: "relative", width: "100%" }}>
                    {/* Dark track + crimson fill — sits behind the frame image */}
                    <div style={{
                      position: "absolute",
                      left: "12%", right: "12%",
                      top: "20%", bottom: "20%",
                      borderRadius: 40,
                      background: "rgba(8,2,2,0.75)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.max(0, Math.min(100, ((raidBossData.hp ?? 0) / Math.max(1, raidBossData.maxHp ?? 1)) * 100))}%`,
                        background: "linear-gradient(90deg, #6b0000 0%, #b02020 40%, #e03030 75%, #ff5555 100%)",
                        borderRadius: 40,
                        transition: "width 0.6s ease",
                        boxShadow: "inset 0 1px 0 rgba(255,120,120,0.3)",
                      }} />
                    </div>
                    {/* Decorative frame on top */}
                    <img
                      src={raidHpFrameImg}
                      alt=""
                      style={{ width: "100%", height: "auto", display: "block", position: "relative", zIndex: 1 }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Rarity sparkle lights (3/4/5 star) — gated until container has real height */}
            {orbsReady && activePet && (activePet.rarity || 0) >= 3 && (() => {
              const rarity = activePet.rarity || 0;
              const is5 = rarity >= 5;
              const is4 = rarity >= 4;

              // sizes: "xs"=2px core/8 spread, "sm"=4px/16, "md"=8px/28, "lg"=14px/44
              type Orb = { left?: string; right?: string; top: string; color: string; anim: string; dur: string; delay: string; size: "xs"|"sm"|"md"|"lg" };

              // 3-star: 6 orbs spread around the pet body
              const orbs3: Orb[] = [
                { left:"10%",  top:"65%", color:"#f0c040", anim:"sparkOrb0", dur:"4.5s", delay:"0s",   size:"xs" },
                { right:"11%", top:"62%", color:"#fffde0", anim:"sparkOrb2", dur:"5.2s", delay:"1.4s", size:"xs" },
                { left:"20%",  top:"40%", color:"#f0c040", anim:"sparkOrb4", dur:"4.8s", delay:"0.7s", size:"sm" },
                { left:"42%",  top:"18%", color:"#f0c040", anim:"sparkOrb8", dur:"5.0s", delay:"1.5s", size:"sm" },
                { left:"30%",  top:"55%", color:"#f0d060", anim:"sparkOrb1", dur:"3.9s", delay:"2.8s", size:"xs" },
                { right:"30%", top:"52%", color:"#f0c040", anim:"sparkOrb5", dur:"4.7s", delay:"1.0s", size:"sm" },
              ];
              // 4-star: 10 orbs with xs/sm/md coverage
              const orbs4: Orb[] = [
                { left:"5%",   top:"50%", color:"#f0c040", anim:"sparkOrb0", dur:"3.4s", delay:"0s",   size:"sm" },
                { right:"7%",  top:"48%", color:"#f0d060", anim:"sparkOrb2", dur:"3.8s", delay:"1.5s", size:"sm" },
                { left:"24%",  top:"22%", color:"#f0c040", anim:"sparkOrb4", dur:"4.6s", delay:"2.0s", size:"md" },
                { right:"22%", top:"24%", color:"#fffde0", anim:"sparkOrb5", dur:"4.0s", delay:"1.1s", size:"sm" },
                { left:"38%",  top:"12%", color:"#f0c040", anim:"sparkOrb8", dur:"5.0s", delay:"1.8s", size:"sm" },
                { left:"55%",  top:"42%", color:"#f0c040", anim:"sparkOrbA", dur:"4.4s", delay:"1.2s", size:"md" },
                { left:"12%",  top:"70%", color:"#fffde0", anim:"sparkOrb1", dur:"4.2s", delay:"0.8s", size:"xs" },
                { right:"14%", top:"68%", color:"#fffde0", anim:"sparkOrb3", dur:"5.1s", delay:"0.3s", size:"xs" },
                { left:"44%",  top:"72%", color:"#f0c040", anim:"sparkOrb6", dur:"3.5s", delay:"3.1s", size:"xs" },
                { left:"33%",  top:"38%", color:"#fffde0", anim:"sparkOrbB", dur:"4.2s", delay:"3.3s", size:"xs" },
              ];
              // 5-star extras: 8 calm gold sparkles
              const orbs5extra: Orb[] = [
                { left:"2%",   top:"44%", color:"#ffd700", anim:"calmSparkle0", dur:"7.2s", delay:"0.6s",  size:"md" },
                { right:"3%",  top:"41%", color:"#e8a020", anim:"calmSparkle1", dur:"6.5s", delay:"1.9s",  size:"md" },
                { left:"17%",  top:"78%", color:"#fff0a0", anim:"calmSparkle2", dur:"8.0s", delay:"2.5s",  size:"sm" },
                { right:"16%", top:"76%", color:"#f0c040", anim:"calmSparkle3", dur:"7.5s", delay:"0.1s",  size:"sm" },
                { left:"46%",  top:"8%",  color:"#ffeaa0", anim:"calmSparkle4", dur:"6.8s", delay:"3.0s",  size:"md" },
                { right:"1%",  top:"60%", color:"#d4a020", anim:"calmSparkle0", dur:"6.3s", delay:"2.2s",  size:"md" },
                { left:"60%",  top:"60%", color:"#e8a020", anim:"calmSparkle3", dur:"6.9s", delay:"2.9s",  size:"md" },
                { right:"12%", top:"22%", color:"#ffeaa0", anim:"calmSparkle5", dur:"8.1s", delay:"3.4s",  size:"sm" },
              ];

              const allOrbs = is5 ? [...orbs4, ...orbs5extra] : is4 ? orbs4 : orbs3;

              // Glow bloom: bright core + single soft spread — 2 layers for GPU performance
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
                      boxShadow: `0 0 ${core * 1.5}px ${core * 0.8}px rgba(255,255,255,0.9), 0 0 ${spread * 2}px ${spread}px ${orb.color}88`,
                      animation: `${orb.anim} ${orb.dur} ease-in-out infinite ${orb.delay}`,
                      willChange: "transform, opacity",
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
                    willChange: "transform, opacity",
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
                // NOTE: NO `animate-float` here. The wrapper used to ride
                // the global 6px float keyframe, which lifted the entire
                // active pet — flying or not — so even ground species
                // looked like they were hovering off the platform. The
                // PetAnimator already chooses between IDLE_ANIMATIONS
                // (canFly: head bobs up/down) and IDLE_ANIMATIONS_GROUND
                // (rotate-only head) based on the template's canFly
                // flag, so per-pet motion is correct without this outer
                // float. Don't add it back.
                <div className="relative w-full flex flex-col items-center" data-testid="display-active-pet">
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
                      willChange: "transform, opacity",
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
                    {petHearts.map((h) => (
                      <div
                        key={h.id}
                        className="fixed pointer-events-none feed-heart-rise"
                        style={{
                          left: h.cx,
                          top: h.cy,
                          width: h.size,
                          height: h.size,
                          ["--dx" as any]: `${h.dx}px`,
                          animationDelay: `${h.delay}s`,
                          // Must sit ABOVE the active-pet wrapper (z-520) so
                          // hearts visibly float over the pet, not behind it.
                          zIndex: 540,
                          color: "#ff5d6c",
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width={h.size} height={h.size}>
                          <path d="M12 21s-7-4.35-9.5-9.05C.5 7.45 4 4 7.5 4c2.04 0 3.7 1.1 4.5 2.55C12.8 5.1 14.46 4 16.5 4 20 4 23.5 7.45 21.5 11.95 19 16.65 12 21 12 21z" />
                        </svg>
                      </div>
                    ))}
                    {petSparkles.map((s) => (
                      <div
                        key={s.id}
                        className="fixed pointer-events-none feed-sparkle"
                        style={{
                          left: s.cx,
                          top: s.cy,
                          width: s.size,
                          height: s.size,
                          ["--dx" as any]: `${s.dx}px`,
                          ["--dy" as any]: `${s.dy}px`,
                          animationDelay: `${s.delay}s`,
                          // Sit above the active-pet wrapper (z-520).
                          zIndex: 541,
                          color: "#ffe27a",
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width={s.size} height={s.size}>
                          <path d="M12 2l1.6 5.6L19 9.2l-5.4 1.6L12 16l-1.6-5.2L5 9.2l5.4-1.6L12 2z" />
                        </svg>
                      </div>
                    ))}
                    {activePet.isHatched ? (
                      <div
                        {...activePetTouchHandlers}
                        style={{
                          cursor: "pointer",
                          touchAction: "none",
                          // Scale the pet up 12% from its center-bottom so it
                          // fills the stage nicely. transformOrigin center-bottom
                          // keeps the pet grounded — it grows upward only.
                          transform: petCircling
                            ? "scale(1.155, 1.092) translateY(8%)"
                            : petPressed
                              ? "scale(1.108, 1.132) translateY(8%)"
                              : "scale(1.12) translateY(8%)",
                          transition: "transform 320ms cubic-bezier(0.34, 1.2, 0.5, 1)",
                          transformOrigin: "center bottom",
                          // Sit above heart/sparkle bursts and surrounding chrome
                          // so the float animation never appears clipped.
                          position: "relative",
                          zIndex: 520,
                        }}
                        className="w-full flex items-center justify-center"
                        data-testid="button-open-pet-actions"
                      >
                        <style>{`
                          /* Grounded idle for the active home pet — NO
                             translateY anywhere. Just a tiny breath-scale
                             and a soft brightness pulse so the pet looks
                             alive without lifting off the platform. The
                             previous activePetFloat / petImgIdleFly
                             keyframes (which translated up to 14px) were
                             still in play whenever shopItem.canFly happened
                             to be true on the user's pet, which is what
                             made it look like it kept floating regardless
                             of our other tweaks. We removed the canFly
                             branch entirely — on the home stage every
                             active pet stays planted. */
                          @keyframes activePetBreath {
                            0%, 100% { transform: scale(1); filter: brightness(1); }
                            50% { transform: scale(1.012, 1.018); filter: brightness(1.05); }
                          }
                          @keyframes petImgBlink {
                            0%, 88%, 100% { opacity: 1; }
                            92%, 96% { opacity: 0.92; }
                          }
                        `}</style>
                        {activePet.petTemplateId ? (
                          <div className="w-full flex items-center justify-center">
                            <PetAnimator petTemplateId={activePet.petTemplateId} mode="idle" view="front" size={1000} expression={petCircling ? "petted" : "neutral"} className="w-full" style={{ aspectRatio: "1/1" }} />
                          </div>
                        ) : (activePet.hatchedImageUrl || activePet.imageUrl) ? (
                          <div style={{ paddingTop: "calc(8*var(--vh))", width: "100%" }}>
                            <img
                              src={activePet.hatchedImageUrl || activePet.imageUrl || ""}
                              alt={activePet.name}
                              className="w-full max-h-[calc(58*var(--vh))] object-contain"
                              style={{
                                animation: "activePetBreath 3.5s ease-in-out infinite, petImgBlink 4s ease-in-out infinite",
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
                            if (bjIsStep5TapMode() && !hatchHomeMutation.isPending) {
                              // Tutorial tap mode: force-hatch regardless of eggHatchReady state
                              hatchHomeMutation.mutate(activePet.inventoryId);
                            } else if (eggHatchReady && !hatchHomeMutation.isPending) {
                              hatchHomeMutation.mutate(activePet.inventoryId);
                            } else if (!eggHatchReady) {
                              setShowSpeedUp(true);
                            }
                          }}
                        >
                          {activePet.eggImageUrl ? (
                            <div style={{ paddingTop: "calc(6*var(--vh))", width: "100%", display: "flex", justifyContent: "center" }}>
                              <img
                                src={activePet.eggImageUrl}
                                alt={activePet.name}
                                className="w-full max-h-[calc(55*var(--vh))] object-contain"
                                style={{
                                  animation: "petImgIdle 3.5s ease-in-out infinite",
                                  transformOrigin: "center bottom",
                                  filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.55))",
                                }}
                              />
                            </div>
                          ) : (
                            <img src={eggMagicIcon} alt="" style={{ width: 120, height: 120, objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.5))" }} />
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
          <div className="relative z-10 flex-shrink-0 flex flex-col items-center gap-1 px-4" style={{ position: "fixed", bottom: "calc(11*var(--vh))", left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>
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


      {/* Speed-up sheet is hidden during tutorial step 5 — the overlay renders its own
          single-potion card at z-99003 so there is no z-index war. */}
      {!isOverlayActive && bjGetStep() !== 5 && showSpeedUp && activePet && !activePet.isHatched && (
        <div
          data-bj="speedup-sheet"
          className="fixed inset-0 flex items-end justify-center"
          style={{
            maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
            zIndex: 55,
          }}
        >
          <div
            data-bj="speedup-backdrop"
            className="absolute inset-0 bg-black/60"
            style={{
              opacity:       bjGetStep() === 5 ? 0 : 1,
              pointerEvents: bjGetStep() === 5 ? "none" : "auto",
            }}
            onClick={() => {
              if (bjGetStep() === 5) return;
              setShowSpeedUp(false); setHomeDragging(null); setHomeDragOver(false);
            }}
          />
          <div
            className="relative w-full rounded-t-2xl animate-slide-up"
            style={{
              background: "linear-gradient(180deg, rgba(12,6,2,0.98) 0%, rgba(8,4,1,0.99) 100%)",
              border: "1px solid rgba(240,192,64,0.3)",
              borderBottom: "none",
              boxShadow: "0 -10px 50px rgba(0,0,0,0.7)",
              maxHeight: "calc(82*var(--vh))",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h4 className="font-fantasy text-[#f0c040] text-sm tracking-wider">SPEED UP HATCHING</h4>
              <button
                onClick={() => {
                  if (bjGetStep() === 5) return;
                  setShowSpeedUp(false); setHomeDragging(null); setHomeDragOver(false);
                }}
                className="font-fantasy text-[#a89878] text-xs tracking-wider"
                style={{ cursor: "pointer", background: "none", border: "none", opacity: bjGetStep() === 5 ? 0 : 1 }}
                data-testid="button-close-speedup"
              >
                Close
              </button>
            </div>

            {/* Egg drop zone */}
            <div className="px-5 pb-4" data-bj="egg-drop-zone">
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
                      onClick={() => {
                        // Step 5 is handled entirely by onPointerDown → pointerup.
                        // Bail here to prevent a double-fire on desktop browsers.
                        if (bjGetStep() === 5) return;
                        if (!speedUpMutation.isPending) {
                          speedUpMutation.mutate({ petInvId: activePet.inventoryId, itemInvId: item.inventoryId, specialAmount: item.specialAmount });
                        }
                      }}
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

      {/* ── Active pet action menu (mystical ring) ── */}
      {!isOverlayActive && showActionMenu && activePetForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowActionMenu(false)}
            data-testid="backdrop-action-menu"
          />
          {/* Ring image with invisible hotspots over each rune */}
          <div
            className="relative"
            style={{
              width: "min(calc(92*var(--vw)), 520px)",
              aspectRatio: "1 / 1",
              backgroundImage: `url(${petActionRingImg})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.6))",
            }}
          >
            {/* Helper: build a hotspot button */}
            {(() => {
              const makeBtn = (
                key: string,
                testId: string,
                pos: { left: string; top: string; width: string; height: string },
                color: string,
                onActivate: () => void,
              ) => (
                <button
                  key={key}
                  data-testid={testId}
                  onClick={(e) => {
                    // Swallow ghost clicks on Android: the OS fires a synthetic
                    // click ~300ms after touchend at the same screen coordinates.
                    // If the menu JUST opened (< 400ms ago) this is almost
                    // certainly that ghost click, not a deliberate tap.
                    if (Date.now() - menuOpenedAtRef.current < 400) return;
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    burstRingSparkles(r.left + r.width / 2, r.top + r.height / 2, color, 16);
                    setTimeout(onActivate, 280);
                  }}
                  aria-label={key}
                  className="absolute rounded-full"
                  style={{
                    ...pos,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                />
              );
              return (
                <>
                  <style>{`
                    @keyframes quest-sparkle-rise {
                      0%   { transform: translateY(0) scale(1.1); opacity: 1; }
                      100% { transform: translateY(-36px) scale(0.2); opacity: 0; }
                    }
                    @keyframes quest-btn-pulse {
                      0%,100% { box-shadow: 0 0 8px 4px rgba(74,222,128,0.75), 0 0 20px 8px rgba(74,222,128,0.35); }
                      50%     { box-shadow: 0 0 18px 8px rgba(74,222,128,1),    0 0 48px 16px rgba(74,222,128,0.55); }
                    }
                    @keyframes quest-arrow-bob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-8px)} }
                  `}</style>
                  {makeBtn(
                    "Power Up",
                    "button-action-power-up",
                    { left: "36%", top: "1%", width: "26%", height: "23%" },
                    "#4ade80",
                    () => {
                      if (questGuideMode === "powerup") setPowerUpFromQuest(true);
                      setShowActionMenu(false); setActivePetModal("power_up"); setQuestGuideMode(null);
                    },
                  )}
                  {makeBtn(
                    "Pet Stats",
                    "button-action-pet-stats",
                    { left: "0%", top: "36%", width: "22%", height: "22%" },
                    "#67e8f9",
                    () => { setShowActionMenu(false); setShowPetStats(true); },
                  )}
                  {makeBtn(
                    "Level Up",
                    "button-action-level-up",
                    { left: "78%", top: "36%", width: "22%", height: "22%" },
                    "#fcd34d",
                    () => { setShowActionMenu(false); setActivePetModal("level_up"); },
                  )}
                  {makeBtn(
                    "Equip Accessories",
                    "button-action-equip-accessories",
                    { left: "36%", top: "73%", width: "26%", height: "21%" },
                    "#c084fc",
                    () => { setShowActionMenu(false); navigate("/equip-accessories"); },
                  )}
                  {/* Center hotspot — paw print — opens Care / Feed page */}
                  {makeBtn(
                    "Care / Feed",
                    "button-action-care-feed",
                    { left: "29%", top: "31%", width: "42%", height: "40%" },
                    "#f472b6",
                    () => {
                      setShowActionMenu(false);
                      setQuestGuideMode(null);
                      const id = activePetForModal?.inventoryId;
                      navigate(id ? `/pet-care/${encodeURIComponent(id)}` : "/pet-house");
                    },
                  )}
                  {/* Quest guide sparkles + glow — Phase 2: highlight the target button */}
                  {questGuideMode === "powerup" && (
                    <>
                      {/* Pulsing glow ring on Power Up button — round to match the rune button */}
                      <div style={{
                        position: "absolute",
                        left: "36%", top: "1%", width: "26%", height: "23%",
                        borderRadius: "50%",
                        pointerEvents: "none",
                        zIndex: 298,
                        animation: "quest-btn-pulse 1.5s ease-in-out infinite",
                      }}>
                        {[0,1,2,3,4,5,6].map(i => (
                          <span key={i} style={{
                            position: "absolute",
                            left: `${8 + i * 13}%`,
                            bottom: "10%",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: i % 2 === 0 ? "#4ade80" : "#86efac",
                            animation: `quest-sparkle-rise 1.1s ${i * 0.16}s ease-out infinite`,
                            opacity: 0,
                            pointerEvents: "none",
                          }} />
                        ))}
                      </div>
                      {/* Bouncing arrow — centered above the Power Up button top-center */}
                      <img
                        src={questArrowImg}
                        alt=""
                        style={{
                          position: "absolute",
                          left: "49%",
                          top: "-18%",
                          transform: "translateX(-50%)",
                          width: 40,
                          height: 52,
                          pointerEvents: "none",
                          zIndex: 300,
                          animation: "quest-arrow-bob 1.3s ease-in-out infinite",
                          filter: "drop-shadow(0 0 10px rgba(50,220,50,0.95)) drop-shadow(0 0 24px rgba(50,220,50,0.6))",
                        }}
                      />
                    </>
                  )}
                  {questGuideMode === "feed" && (
                    <>
                      {/* Pulsing glow border on Care/Feed button */}
                      <div style={{
                        position: "absolute",
                        left: "29%", top: "31%", width: "42%", height: "40%",
                        borderRadius: "50%",
                        pointerEvents: "none",
                        zIndex: 298,
                        animation: "quest-btn-pulse 1.5s ease-in-out infinite",
                      }}>
                        {[0,1,2,3,4,5,6,7].map(i => (
                          <span key={i} style={{
                            position: "absolute",
                            left: `${5 + i * 12}%`,
                            bottom: "15%",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: i % 2 === 0 ? "#4ade80" : "#86efac",
                            animation: `quest-sparkle-rise 1.1s ${i * 0.14}s ease-out infinite`,
                            opacity: 0,
                            pointerEvents: "none",
                          }} />
                        ))}
                      </div>
                      {/* Bouncing arrow */}
                      <img
                        src={questArrowImg}
                        alt=""
                        style={{
                          position: "absolute",
                          left: "46%",
                          top: "22%",
                          transform: "translateX(-50%)",
                          width: 40,
                          height: 52,
                          pointerEvents: "none",
                          zIndex: 300,
                          animation: "quest-arrow-bob 1.3s ease-in-out infinite",
                          filter: "drop-shadow(0 0 10px rgba(50,220,50,0.95)) drop-shadow(0 0 24px rgba(50,220,50,0.6))",
                        }}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {/* Hidden legacy panel keeps the original flow working but is never rendered */}
          <div style={{ display: "none" }}>
            {/* original menu intentionally hidden */}
          </div>
        </div>
      )}

      {/* ── Quest guide arrow — Phase 1: ring closed, points at the pet ── */}
      {questGuideMode && !showActionMenu && (
        <>
          <style>{`@keyframes quest-arrow-bob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-8px)} }`}</style>
          <img
            src={questArrowImg}
            alt=""
            style={{
              position: "fixed",
              bottom: "44%",
              left: "50%",
              width: 48,
              height: 60,
              pointerEvents: "none",
              zIndex: 600,
              animation: "quest-arrow-bob 1.3s ease-in-out infinite",
              filter: "drop-shadow(0 0 10px rgba(50,220,50,0.95)) drop-shadow(0 0 24px rgba(50,220,50,0.6))",
            }}
          />
        </>
      )}

      {/* ── Pet stats page (opened from the ring's left button) ── */}
      {showPetStats && activePetForModal && (
        <PetDetailPage
          pet={activePetForModal as any}
          onClose={() => setShowPetStats(false)}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ["/api/inventory"] })}
          userCoins={currentUser.coins}
          onUserUpdate={(u) => setCurrentUser(u)}
          allowReset
        />
      )}

      {/* ── Ring sparkle bursts (rendered above the action menu) ── */}
      {ringSparkles.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-[60]">
          {ringSparkles.map((s) => (
            <div
              key={s.id}
              className="absolute ring-sparkle"
              style={{
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                color: s.color,
                ["--dx" as any]: `${s.dx}px`,
                ["--dy" as any]: `${s.dy}px`,
                animationDelay: `${s.delay}s`,
              }}
            >
              <svg viewBox="0 0 24 24" width={s.size} height={s.size} style={{ filter: `drop-shadow(0 0 6px ${s.color})` }}>
                <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" fill={s.color} />
              </svg>
            </div>
          ))}
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
          petAtk={activePetForModal.petAtk ?? 50}
          petDef={activePetForModal.petDef ?? 50}
          petHealth={activePetForModal.petHealth ?? 1000}
          itemsRemaining={(() => { const r = activePetForModal.rarity || 1; const slotsPerLvl = r <= 2 ? 1 : r === 3 ? 2 : 3; return Math.max(0, (activePetForModal.petLevel || 1) * slotsPerLvl - (activePetForModal.itemsUsedThisLevel || 0)); })()}
          items={statBoostItems}
          isPending={powerUpMutation.isPending || useSpecialMutation.isPending}
          title="POWER UP"
          subtitle={`Drag an item onto ${activePetForModal.petNickname || activePetForModal.name} to boost their stats`}
          showBuyButton={powerUpFromQuest}
          successEffect={petModalSuccess}
          onUseItem={handleModalUseItem}
          onSuccessAnimEnd={() => setPetModalSuccess(null)}
          onClose={() => { setActivePetModal(null); setPowerUpFromQuest(false); }}
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
          petAtk={activePetForModal.petAtk ?? 50}
          petDef={activePetForModal.petDef ?? 50}
          petHealth={activePetForModal.petHealth ?? 1000}
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

      {!isOverlayActive && hatchRevealing && (
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

      {/* Chat + Support buttons — top-right corner */}
      {!showProfile && !showActionMenu && !activePetModal && (
        <>
          {/* World Chat toggle button */}
          <button
            data-testid="button-open-world-chat"
            onClick={() => { setShowWorldChat(v => !v); setChatHasNewMsg(false); }}
            className="absolute z-[50] transition-transform active:scale-90"
            style={{
              top: "58px",
              right: "54px",
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              overflow: "hidden",
              cursor: "pointer",
              padding: 0,
              background: "rgba(10,40,34,0.85)",
              border: showWorldChat
                ? "2px solid rgba(94,234,212,0.8)"
                : chatHasNewMsg
                  ? "2px solid rgba(94,234,212,0.65)"
                  : "2px solid rgba(94,234,212,0.3)",
              boxShadow: showWorldChat
                ? "0 0 14px rgba(94,234,212,0.45), 0 4px 16px rgba(0,0,0,0.9)"
                : chatHasNewMsg
                  ? "0 0 16px rgba(94,234,212,0.6)"
                  : "0 4px 16px rgba(0,0,0,0.9)",
            }}
          >
            <img
              src={worldChatIconImg}
              alt="The Veridian Watcher"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                filter: showWorldChat
                  ? "brightness(1.15)"
                  : chatHasNewMsg
                    ? "brightness(1.2)"
                    : "brightness(0.95)",
              }}
            />
          </button>
          {/* Support message button */}
          <button
            data-testid="button-open-support"
            onClick={() => { setShowSupportModal(true); setSupportSent(false); setSupportSubject(""); setSupportMessage(""); }}
            className="absolute z-[50] transition-transform active:scale-90"
            style={{
              top: "66px",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <img src={supportIconImg} alt="Support" style={{ width: 36, height: 36, objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }} />
          </button>
        </>
      )}

      {/* World Chat Panel */}
      {showWorldChat && (
        <>
          {/* Transparent backdrop — tap anywhere outside the panel to close */}
          <div
            className="absolute inset-0"
            style={{ zIndex: 10000 }}
            onClick={() => setShowWorldChat(false)}
          />
          <WorldChatPanel
            currentUserId={currentUser.id}
            onClose={() => setShowWorldChat(false)}
            onNewMessage={() => setChatHasNewMsg(true)}
          />
        </>
      )}

      {/* Support message modal */}
      {showSupportModal && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center px-5"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowSupportModal(false); }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl px-5 py-6 flex flex-col gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(12,8,2,0.99) 0%, rgba(8,5,1,0.99) 100%)",
              border: "1.5px solid rgba(212,160,23,0.45)",
              boxShadow: "0 0 50px rgba(212,160,23,0.1), 0 8px 32px rgba(0,0,0,0.7)",
              maxHeight: "calc(90*var(--vh))",
              overflowY: "auto",
            }}
          >
            <button
              data-testid="button-close-support-modal"
              onClick={() => setShowSupportModal(false)}
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

            <p className="font-fantasy text-[#f0c040] text-base tracking-wider text-center pr-6">Contact Support</p>

            {supportSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="font-fantasy text-[#7fffd4] text-sm tracking-wide text-center">Message sent!</p>
                <p className="font-fantasy text-[#a89878] text-[11px] tracking-wide text-center leading-relaxed">
                  Your message has been delivered to the admin team. We'll look into it soon!
                </p>
                <button
                  data-testid="button-support-done"
                  onClick={() => setShowSupportModal(false)}
                  className="mt-2 px-6 py-2 rounded-full font-fantasy text-xs tracking-widest transition-transform active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,80,50,0.9) 0%, rgba(0,50,30,0.9) 100%)",
                    border: "1px solid rgba(0,200,160,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="font-fantasy text-[#f0c040] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-70">Subject</label>
                  <input
                    data-testid="input-support-subject"
                    type="text"
                    value={supportSubject}
                    onChange={e => setSupportSubject(e.target.value)}
                    disabled={supportMutation.isPending}
                    placeholder="e.g. Bug report, Account help..."
                    className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                      border: "1.5px solid rgba(170,125,35,0.55)",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
                <div>
                  <label className="font-fantasy text-[#f0c040] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-70">Message</label>
                  <textarea
                    data-testid="input-support-message"
                    value={supportMessage}
                    onChange={e => setSupportMessage(e.target.value)}
                    disabled={supportMutation.isPending}
                    placeholder="Describe what you need help with..."
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60 resize-none"
                    style={{
                      background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                      border: "1.5px solid rgba(170,125,35,0.55)",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  />
                  <p className="font-fantasy text-[#5a8870] text-[9px] tracking-wider text-right mt-0.5">{supportMessage.length}/2000</p>
                </div>
                <button
                  data-testid="button-submit-support"
                  onClick={() => supportMutation.mutate()}
                  disabled={supportMutation.isPending || !supportSubject.trim() || !supportMessage.trim()}
                  className="py-2.5 rounded-full font-fantasy text-xs tracking-widest transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,80,50,0.9) 0%, rgba(0,50,30,0.9) 100%)",
                    border: "1px solid rgba(0,200,160,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  {supportMutation.isPending ? "Sending..." : "Send Message"}
                </button>
              </div>
            )}
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
        <QuillBadge size={13} glow="#4ade80" style={{ position: "absolute", top: -18, zIndex: 10 }} data-testid="badge-quest-new" />
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
