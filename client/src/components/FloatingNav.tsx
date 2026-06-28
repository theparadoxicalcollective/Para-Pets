import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getNextZ } from "@/lib/layerManager";
import { useLocation } from "wouter";
import { useNavHidden } from "@/lib/navVisibility";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";
import coinIconImg from "@assets/icon_coin.png";
import mainNavIcon from "@assets/generated_images/icon_main_nav.png";
import petHouseIcon from "@assets/generated_images/nav_icon_home.png";
import activePetIcon from "@assets/generated_images/nav_icon_active_pet_new.png";
import petsIcon from "@assets/generated_images/nav_icon_pets.png";
import marketIcon from "@assets/generated_images/nav_icon_market.png";
import fishbowlIcon from "@assets/icon_fishbowl.png";
import globeIcon from "@assets/icon_globe_world.webp";
import bagIcon from "@assets/icon_bag.png";
import friendsNavIcon from "@assets/Photoroom_20260622_114621_AM_1782146930993.png";
import { QuillBadge } from "@/components/QuillBadge";
import mapIcon from "@assets/generated_images/nav_icon_map_v3.png";
import questIcon from "@assets/generated_images/nav_icon_map.png";
import questScrollBg from "@assets/IMG_6427_1774545779530.png";
import pvpIcon from "@assets/generated_images/nav_icon_pvp.png";
import badgesIcon from "@assets/generated_images/nav_icon_badges.png";
import PetWorldPage from "@/pages/PetWorldPage";
import { AquariumPage } from "@/pages/AquariumPage";
import { bjGetStatus, bjStart, bjSetStep, BJ_EVENT } from "@/lib/beginJourney";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

interface NavUser {
  id: string;
  username: string;
  email?: string;
  coins: number;
  profileImage: string | null;
  isAdmin: boolean;
  isModerator?: boolean;
  activePetId: string | null;
  tutorial_reward_claimed?: boolean;
  tutorial_quest_completed?: boolean;
}

interface FloatingNavProps {
  user: NavUser;
  onUserUpdate?: (u: any) => void;
}

interface DailyQuestRow {
  id: string;
  quest_key: string;
  title: string;
  description: string;
  target_count: number;
  coin_reward: number;
  reward_item_id: string | null;
  reward_item_name: string | null;
  reward_item_image: string | null;
  progress: number;
  completed: boolean;
  reward_claimed: boolean;
}

interface QuestResponse {
  quests: DailyQuestRow[];
  today: string;
  lastOpenedDate: string | null;
  hasUnseenCompletion: boolean;
}

// ── Left arc: Badges, Quest, PvP, Pet Inventory, Map ─────────────────────────
const LEFT_ITEMS = [
  { id: "badges",    label: "Badges",    icon: badgesIcon },
  { id: "quest",     label: "Quest",     icon: questIcon  },
  { id: "pvp",       label: "PvP",       icon: pvpIcon    },
  { id: "inventory", label: "Pets",      icon: petsIcon   },
  { id: "map",       label: "Map",       icon: mapIcon },
];

// ── Right column: Home, Pet House, Market, Aquarium, Keeper's Central, Pet Bag, Friends
const RIGHT_ITEMS = [
  { id: "bag",      label: "Bag",     icon: bagIcon        },
  { id: "friends",  label: "Friends", icon: friendsNavIcon },
  { id: "pethouse", label: "House",   icon: petHouseIcon   },
  { id: "market",   label: "Market",  icon: marketIcon     },
  { id: "aquarium", label: "Aquarium",icon: fishbowlIcon   },
  { id: "keepers",  label: "Central", icon: globeIcon      },
  { id: "home",     label: "Main",    icon: activePetIcon  },
];

const ICON_SIZE   = 50;
const BUTTON_SIZE = 58;
const NAV_RIGHT   = 12;

function calcSpacing() {
  // Keep all LEFT_ITEMS on-screen by shrinking spacing on narrow viewports.
  // Formula: (viewportWidth - right-offset - button-width - 4px-buffer) / n
  // Capped at 62 (the comfortable desktop/wide-phone spacing).
  const available = window.innerWidth - NAV_RIGHT - BUTTON_SIZE - 4;
  return Math.min(62, Math.max(34, Math.floor(available / LEFT_ITEMS.length)));
}

export default function FloatingNav({ user, onUserUpdate }: FloatingNavProps) {
  const [, navigate] = useLocation();
  const navHidden = useNavHidden();
  const [isOpen, setIsOpen]             = useState(false);
  const [showQuest, setShowQuest]       = useState(false);
  const [showPvpNote, setShowPvpNote]   = useState(false);
  const [showAquarium, setShowAquarium] = useState(false);
  const [showKeepers, setShowKeepers]   = useState(false);
  const [panelZ, setPanelZ]             = useState(300);
  const [claimingKey, setClaimingKey]   = useState<string | null>(null);
  const [bjStatus, setBjStatus] = useState(() => bjGetStatus());
  const [spacing, setSpacing]   = useState(calcSpacing);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () => setBjStatus(bjGetStatus());
    window.addEventListener(BJ_EVENT, handler);
    return () => window.removeEventListener(BJ_EVENT, handler);
  }, []);

  useEffect(() => {
    const onResize = () => setSpacing(calcSpacing());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Sync localStorage from server-side flags — fixes older players seeing tutorial again on new device/browser
  useEffect(() => {
    const isComplete = (user as any).tutorial_reward_claimed || (user as any).tutorial_quest_completed;
    if (isComplete && bjGetStatus() !== "done") {
      bjSetStep("done");
    }
  }, [(user as any).tutorial_reward_claimed, (user as any).tutorial_quest_completed]);

  // Show hint only before the player has started the quest.
  // Once they're working through it the overlay guides them; the hint
  // reappears (via bjStatus "not_started" → "active" → reward claimed) only
  // if they somehow dismiss the overlay mid-flow — but the server's
  // tutorial_reward_claimed is the final gate so it always disappears after claim.
  const showLoginHint = !(user as any).tutorial_reward_claimed && bjStatus === "not_started";

  const openPanel = (fn: () => void) => { closeAll(); setPanelZ(getNextZ()); fn(); };

  const closeAll = () => {
    setIsOpen(false);
    setShowQuest(false);
    setShowPvpNote(false);
    setShowAquarium(false);
    setShowKeepers(false);
  };

  const NAV_DELAY = 360;

  // ── Quest data ────────────────────────────────────────────────────────────
  const { data: questData } = useQuery<QuestResponse>({
    queryKey: ["/api/quests/daily"],
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // ── Friend-request count ──────────────────────────────────────────────────
  const { data: friendReqData } = useQuery<{ count: number }>({
    queryKey: ["/api/friends/requests/count"],
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });


  const seenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/quests/daily/seen", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests/daily"] });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (questKey: string) => apiRequest("POST", `/api/quests/daily/claim/${questKey}`, {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/quests/daily"] });
      if (onUserUpdate && data.newCoinBalance != null) {
        onUserUpdate({ ...user, coins: data.newCoinBalance });
      }
      toast({
        title: "Reward Claimed!",
        description: data.coinsGranted > 0 ? `+${data.coinsGranted} coins earned!` : "Quest complete!",
      });
    },
    onError: () => {
      toast({ title: "Failed to claim reward", variant: "destructive" });
    },
  });

  const tutorialClaimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tutorial/claim-reward", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (onUserUpdate) {
        onUserUpdate({ ...user, coins: data.newBalance ?? user.coins, tutorial_reward_claimed: true });
      }
      toast({
        title: "Reward Claimed!",
        description: "+1,500 coins earned!",
      });
    },
    onError: () => {
      toast({ title: "Failed to claim reward", variant: "destructive" });
    },
  });

  // Badge logic: green = not opened today, gold = any quest complete but unclaimed
  const today        = questData?.today ?? "";
  const lastOpened   = questData?.lastOpenedDate ?? null;
  const hasCompletedUnclaimed = questData?.quests.some(q => q.completed && !q.reward_claimed) ?? false;
  const tutorialClaimable = !!(user as any).tutorial_quest_completed && !(user as any).tutorial_reward_claimed;
  const questBadge: "green" | "gold" | null = !questData
    ? null
    : lastOpened !== today
    ? "green"
    : (hasCompletedUnclaimed || tutorialClaimable)
    ? "gold"
    : null;

  const friendBadge: "green" | null = (friendReqData?.count ?? 0) > 0 ? "green" : null;

  const handleLeft = (id: string) => {
    closeAll();
    if (id === "map")       { setTimeout(() => navigate("/map"), NAV_DELAY); return; }
    if (id === "quest") {
      setTimeout(() => {
        openPanel(() => {
          setShowQuest(true);
          seenMutation.mutate();
        });
      }, NAV_DELAY);
      return;
    }
    if (id === "pvp")       { setTimeout(() => navigate("/pvp"), NAV_DELAY); return; }
    if (id === "inventory") { setTimeout(() => navigate("/pets"), NAV_DELAY); return; }
    if (id === "badges")    { setTimeout(() => navigate("/badges"), NAV_DELAY); return; }
  };

  const handleRight = (id: string) => {
    closeAll();
    if (id === "home")     { setTimeout(() => navigate("/"), NAV_DELAY); return; }
    if (id === "pethouse") { setTimeout(() => navigate("/pet-house"), NAV_DELAY); return; }
    if (id === "market")   { setTimeout(() => navigate("/market"), NAV_DELAY); return; }
    if (id === "aquarium") { setTimeout(() => openPanel(() => setShowAquarium(true)), NAV_DELAY); return; }
    if (id === "keepers")  { setTimeout(() => openPanel(() => setShowKeepers(true)), NAV_DELAY); return; }
    if (id === "bag")      { setTimeout(() => navigate("/bag"), NAV_DELAY); return; }
    if (id === "friends")  { setTimeout(() => navigate("/friends"), NAV_DELAY); return; }
  };

  if (navHidden) return null;

  const anyPanelOpen = showQuest || showPvpNote || showAquarium || showKeepers;

  return (
    <>
      {/* ── Login quest hint arrow ────────────────────────────────────────── */}
      {showLoginHint && (
        <>
          <style>{`@keyframes bj-hint-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }`}</style>

          {/* Phase 1: nav closed — arrow points down at the main nav button */}
          {!isOpen && (
            <img
              src={tutorialArrow}
              alt=""
              style={{
                position: "absolute",
                bottom: 82,
                right: 8,
                width: 44,
                height: 56,
                pointerEvents: "none",
                zIndex: 96,
                animation: "bj-hint-bob 1.3s ease-in-out infinite",
                filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))",
              }}
            />
          )}

          {/* Phase 2: nav open — arrow points down at the quest log icon */}
          {isOpen && (
            <img
              src={tutorialArrow}
              alt=""
              style={{
                position: "absolute",
                bottom: 80,
                // Quest is the 2nd LEFT_ITEM (index 1), translateX = -(spacing*2).
                // Arrow center should sit above quest button center:
                // right = NAV_RIGHT + BUTTON_SIZE/2 + spacing*2 - arrowWidth/2
                right: NAV_RIGHT + BUTTON_SIZE / 2 + spacing * 2 - 22,
                width: 44,
                height: 56,
                pointerEvents: "none",
                zIndex: 10001,
                animation: "bj-hint-bob 1.3s ease-in-out infinite",
                filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))",
              }}
            />
          )}
        </>
      )}

      {/* ── Backdrop (closes nav) ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[90]"
          onClick={closeAll}
        />
      )}

      {/* ── Nav container ─────────────────────────────────────────────────── */}
      <div
        className="absolute"
        style={{
          bottom: 16,
          right: 12,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          zIndex: isOpen ? 9999 : (anyPanelOpen ? panelZ + 1 : 95),
        }}
      >
        {/* LEFT items – fan out to the left */}
        {LEFT_ITEMS.map((item, i) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            isOpen={isOpen}
            delay={i * 45}
            translateX={-(spacing * (i + 1))}
            translateY={0}
            fillIcon={!!(item as any).fill}
            badge={item.id === "quest" ? questBadge : null}
            onClick={() => handleLeft(item.id)}
            testId={`nav-item-${item.id}`}
          />
        ))}

        {/* RIGHT items – fan up on the right side */}
        {RIGHT_ITEMS.map((item, i) => {
          const isLocked = (item.id === "pethouse" || item.id === "keepers") && !user.isAdmin;
          return (
            <NavButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              isOpen={isOpen}
              delay={i * 45}
              translateX={0}
              translateY={-(spacing * (i + 1))}
              locked={isLocked}
              badge={item.id === "friends" ? friendBadge : null}
              onClick={() => handleRight(item.id)}
              testId={`nav-item-${item.id}`}
            />
          );
        })}

        {/* ── Main circular button ─────────────────────────────────────── */}
        <button
          data-testid="button-floating-nav"
          onClick={() => setIsOpen(v => !v)}
          className="absolute inset-0 rounded-full transition-transform duration-200 active:scale-90 flex items-center justify-center"
          style={{
            zIndex: 99,
            background: "radial-gradient(circle at 38% 35%, rgba(80,180,100,0.25) 0%, rgba(20,40,20,0.85) 70%)",
            border: "2px solid rgba(212,160,23,0.7)",
            boxShadow: isOpen
              ? "0 0 0 4px rgba(212,160,23,0.2), 0 0 20px rgba(212,160,23,0.4), 0 4px 16px rgba(0,0,0,0.7)"
              : "0 0 0 2px rgba(212,160,23,0.15), 0 0 14px rgba(212,160,23,0.25), 0 4px 16px rgba(0,0,0,0.7)",
            cursor: "pointer",
          }}
        >
          <img
            src={mainNavIcon}
            alt="Navigation"
            style={{
              width: BUTTON_SIZE - 14,
              height: BUTTON_SIZE - 14,
              objectFit: "contain",
              transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform 0.3s ease",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
            }}
          />
          {/* Quest notification badge — visible on main button when nav is closed */}
          {questBadge && !isOpen && (
            <QuillBadge
              data-testid="badge-quest-notification"
              size={15}
              glow={questBadge === "green" ? "#4ade80" : "#f0c040"}
              style={{ position: "absolute", top: -22, zIndex: 100 }}
            />
          )}
          {/* Friend-request badge — green (!) on main button when nav is closed */}
          {friendBadge && !isOpen && (
            <QuillBadge
              size={15}
              glow="#4ade80"
              style={{ position: "absolute", top: -22, zIndex: 100 }}
            />
          )}
        </button>
      </div>

      {/* ── Quest scroll overlay ─────────────────────────────────────────── */}
      {showQuest && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: panelZ }}>
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowQuest(false)}
          />
          <div className="relative w-[92%] max-w-[400px] scroll-unroll" style={{ filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.8))" }}>
            {/* Close button */}
            <button
              onClick={() => setShowQuest(false)}
              className="absolute top-[13%] right-[4%] z-30 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: 14, fontWeight: "bold", boxShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
            >
              ×
            </button>
            {/* Scroll image */}
            <img src={questScrollBg} alt="Quest scroll" className="w-full h-auto block select-none" draggable={false} />
            {/* Content layered on top of parchment area */}
            <div className="absolute inset-0 flex flex-col" style={{ paddingTop: "20%", paddingBottom: "20%", paddingLeft: "13%", paddingRight: "13%" }}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(139,90,40,0.4))" }} />
                <h3 className="font-fantasy text-[#4a2a0e] text-sm tracking-[0.3em] font-bold">QUESTS</h3>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(139,90,40,0.4), transparent)" }} />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5" style={{ scrollbarWidth: "none" }}>
                {/* ── Begin Journey one-time quest card ── */}
                {/* Visibility is server-driven: stays until tutorial_reward_claimed = true on the server */}
                {!(user as any).tutorial_reward_claimed && (
                  <div className="rounded-md p-2" style={{ position: "relative", overflow: "hidden", background: tutorialClaimable ? "rgba(120,80,10,0.18)" : bjStatus === "active" ? "rgba(30,80,20,0.15)" : "rgba(92,58,30,0.1)", border: tutorialClaimable ? "1px solid rgba(212,160,23,0.55)" : bjStatus === "active" ? "1px solid rgba(100,200,80,0.4)" : "1px solid rgba(139,90,40,0.35)" }}>
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-fantasy text-[8px] font-bold tracking-widest flex-shrink-0 px-1 py-px rounded" style={{ background: "rgba(30,80,20,0.25)", border: "1px solid rgba(80,180,60,0.4)", color: "#2a6010", textTransform: "uppercase", letterSpacing: "0.15em" }}>One-Time</span>
                        <p className="font-fantasy text-[#2a1000] text-[12px] font-bold leading-tight min-w-0 truncate">Begin Journey</p>
                      </div>
                      {tutorialClaimable ? (
                        <button
                          data-testid="button-begin-journey-claim"
                          onClick={() => tutorialClaimMutation.mutate()}
                          disabled={tutorialClaimMutation.isPending}
                          className="flex-shrink-0 transition-transform active:scale-90 rounded"
                          style={{ background: "linear-gradient(135deg, #7a5000 0%, #c48000 100%)", border: "1px solid rgba(240,192,64,0.7)", color: "#fff8e1", fontFamily: "Lora, serif", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", cursor: "pointer", padding: "3px 8px", marginRight: 3, boxShadow: "0 0 10px rgba(212,160,23,0.5)" }}
                        >CLAIM</button>
                      ) : bjStatus !== "active" ? (
                        <button
                          data-testid="button-begin-journey-go"
                          onClick={() => { bjSetStep(0); setShowQuest(false); }}
                          className="flex-shrink-0 transition-transform active:scale-90 rounded"
                          style={{ background: "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)", border: "1px solid rgba(100,220,100,0.55)", color: "#dcfce7", fontFamily: "Lora, serif", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", cursor: "pointer", padding: "3px 8px", marginRight: 3, boxShadow: "0 0 8px rgba(60,180,60,0.3)" }}
                        >GO</button>
                      ) : (
                        <span className="font-fantasy text-[9px] flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: "rgba(30,80,20,0.25)", border: "1px solid rgba(80,180,60,0.35)", color: "#3a8020" }}>Active</span>
                      )}
                    </div>
                    <p className="font-fantasy text-[#5a2e0a] text-[10.5px] tracking-wide leading-snug">
                      {tutorialClaimable ? "Your journey is complete! Claim your 1,500 coin reward." : bjStatus === "active" ? "Follow the golden arrow to complete your journey!" : "Start your adventure as a Para Pet tamer!"}
                    </p>
                  </div>
                )}
                {!questData || questData.quests.length === 0 ? (
                  <div className="rounded p-2.5" style={{ background: "rgba(92,58,30,0.07)", border: "1px solid rgba(139,90,40,0.3)" }}>
                    <p className="font-fantasy text-[#3a1800] text-[11.5px] tracking-wider leading-relaxed">No active quests. Explore the realm to discover adventures...</p>
                  </div>
                ) : (
                  questData.quests.map((quest) => {
                    const pct = Math.min(100, Math.round((quest.progress / quest.target_count) * 100));
                    const isDone = quest.completed;
                    const isClaimed = quest.reward_claimed;
                    const hasReward = quest.coin_reward > 0 || quest.reward_item_name;
                    return (
                      <div
                        key={quest.quest_key}
                        data-testid={`quest-card-${quest.quest_key}`}
                        className="rounded-md p-2"
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          background: isClaimed
                            ? "rgba(10,6,2,0.58)"
                            : isDone
                            ? "rgba(120,80,10,0.18)"
                            : "rgba(92,58,30,0.1)",
                          border: isClaimed
                            ? "1px solid rgba(100,70,20,0.3)"
                            : isDone
                            ? "1px solid rgba(212,160,23,0.55)"
                            : "1px solid rgba(139,90,40,0.35)",
                        }}
                      >
                        {/* Gold strikethrough for fully claimed quests */}
                        {isClaimed && (
                          <div style={{
                            position: "absolute", top: "50%", left: "5%", right: "5%",
                            height: 2,
                            background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.25) 15%, rgba(240,192,64,0.85) 40%, rgba(255,215,0,0.9) 50%, rgba(240,192,64,0.85) 60%, rgba(212,160,23,0.25) 85%, transparent)",
                            boxShadow: "0 0 6px rgba(240,192,64,0.5)",
                            transform: "translateY(-50%)",
                            zIndex: 25,
                            pointerEvents: "none",
                          }} />
                        )}
                        {/* Claim celebration burst */}
                        {claimingKey === quest.quest_key && (() => {
                          const PARTICLES = [
                            { tx: "0px",   ty: "-52px", char: "★", color: "#f0c040" },
                            { tx: "37px",  ty: "-37px", char: "✦", color: "#ffd700" },
                            { tx: "52px",  ty: "0px",   char: "★", color: "#f0c040" },
                            { tx: "37px",  ty: "37px",  char: "✦", color: "#ffd700" },
                            { tx: "0px",   ty: "52px",  char: "★", color: "#f0c040" },
                            { tx: "-37px", ty: "37px",  char: "✦", color: "#ffd700" },
                            { tx: "-52px", ty: "0px",   char: "★", color: "#f0c040" },
                            { tx: "-37px", ty: "-37px", char: "✦", color: "#ffd700" },
                          ];
                          return (
                            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
                              {/* Golden flash overlay */}
                              <div style={{
                                position: "absolute", inset: 0, borderRadius: 6,
                                background: "radial-gradient(ellipse at center, rgba(240,192,64,0.45) 0%, rgba(240,192,64,0) 70%)",
                                animation: "quest-claim-flash 0.75s ease-out forwards",
                              }} />
                              {/* Expanding ring */}
                              <div style={{
                                position: "absolute", left: "50%", top: "50%",
                                width: 48, height: 48, borderRadius: "50%",
                                border: "2px solid rgba(240,192,64,0.8)",
                                animation: "quest-claim-ring 0.7s ease-out forwards",
                              }} />
                              {/* Particles */}
                              {PARTICLES.map((p, i) => (
                                <div
                                  key={i}
                                  style={{
                                    position: "absolute",
                                    left: "50%", top: "50%",
                                    fontSize: 11,
                                    lineHeight: 1,
                                    color: p.color,
                                    textShadow: `0 0 6px ${p.color}`,
                                    ["--tx" as any]: p.tx,
                                    ["--ty" as any]: p.ty,
                                    animation: `quest-claim-particle 0.75s cubic-bezier(0.2,0.8,0.4,1) ${i * 30}ms forwards`,
                                  }}
                                >{p.char}</div>
                              ))}
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="font-fantasy text-[8px] font-bold tracking-widest flex-shrink-0 px-1 py-px rounded" style={{ background: "rgba(139,90,40,0.18)", border: "1px solid rgba(139,90,40,0.35)", color: "#7a4a1a", textTransform: "uppercase", letterSpacing: "0.15em" }}>Daily</span>
                            <p className="font-fantasy text-[#2a1000] text-[12px] font-bold leading-tight min-w-0 truncate" style={{ paddingLeft: 1 }}>{quest.title}</p>
                          </div>
                          {(() => {
                            const goTarget =
                              quest.quest_key === "catch_fish"        ? "/world/swamp?fishHint=1" :
                              quest.quest_key === "feed_pet"          ? (user.activePetId ? "/?questHint=feed" : "/pet-house") :
                              quest.quest_key === "use_powerup"       ? (user.activePetId ? "/?questHint=powerup" : "/?action=powerup") :
                              quest.quest_key === "play_molten_blocks" ? "/world/volcanic?moltenHint=1" :
                              quest.quest_key === "sell_fish"         ? "/world/swamp?barrelHint=1" :
                              null;
                            const isDisabled = isDone || goTarget === null;
                            return (
                              <button
                                data-testid={`button-go-quest-${quest.quest_key}`}
                                onClick={isDisabled ? undefined : (e) => {
                                  e.stopPropagation();
                                  closeAll();
                                  if (goTarget) setTimeout(() => navigate(goTarget), NAV_DELAY);
                                }}
                                disabled={isDisabled}
                                className="flex-shrink-0 transition-transform active:scale-90 rounded"
                                style={{
                                  background: isDisabled
                                    ? "rgba(80,60,30,0.35)"
                                    : "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)",
                                  border: isDisabled
                                    ? "1px solid rgba(139,90,40,0.3)"
                                    : "1px solid rgba(100,220,100,0.55)",
                                  color: isDisabled ? "#7a6040" : "#dcfce7",
                                  fontFamily: "Lora, serif",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  letterSpacing: "0.12em",
                                  cursor: isDisabled ? "default" : "pointer",
                                  padding: "3px 8px",
                                  marginRight: 3,
                                  boxShadow: isDisabled ? "none" : "0 0 8px rgba(60,180,60,0.3)",
                                }}
                              >
                                GO
                              </button>
                            );
                          })()}
                        </div>
                        <p className="font-fantasy text-[#5a2e0a] text-[10.5px] tracking-wide leading-snug mb-1.5">{quest.description}</p>

                        {/* Progress bar */}
                        <div
                          className="rounded-full overflow-hidden mb-1.5"
                          style={{ height: 5, background: "rgba(139,90,40,0.18)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: isDone
                                ? "linear-gradient(90deg, #8b5a28, #c47a30)"
                                : "linear-gradient(90deg, #4a7a20, #7ab840)",
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <span className="font-fantasy text-[#6a3a10] text-[10px] leading-tight">
                            {quest.progress}/{quest.target_count}
                            {hasReward && (
                              <span style={{ color: "#4a2808" }}>
                                {quest.coin_reward > 0 && <> · {quest.coin_reward}<img src={coinIconImg} alt="coins" style={{ width: 10, height: 10, objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginLeft: 2 }} /></>}
                                {quest.reward_item_name && ` · ${quest.reward_item_name}`}
                              </span>
                            )}
                          </span>

                          {isDone && !isClaimed && (
                            <button
                              data-testid={`button-claim-quest-${quest.quest_key}`}
                              onClick={() => {
                                setClaimingKey(quest.quest_key);
                                setTimeout(() => setClaimingKey(null), 900);
                                claimMutation.mutate(quest.quest_key);
                              }}
                              disabled={claimMutation.isPending}
                              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold font-fantasy active:scale-95 transition-transform disabled:opacity-60"
                              style={{
                                background: "linear-gradient(135deg, #8b5a00 0%, #c47a00 100%)",
                                color: "#fff8e0",
                                border: "1px solid rgba(212,160,23,0.75)",
                                boxShadow: "0 0 6px rgba(212,160,23,0.5)",
                                cursor: "pointer",
                              }}
                            >
                              Claim!
                            </button>
                          )}
                          {isClaimed && (
                            <span
                              className="shrink-0 font-fantasy text-[9px]"
                              style={{ color: "#7a8a50" }}
                            >
                              ✓ Done
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <p className="font-fantasy text-[#6a3a10] text-[8px] tracking-wider text-center mt-2 opacity-90">
                Resets at midnight · Central Time
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PvP notice overlay ───────────────────────────────────────────── */}
      {showPvpNote && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: panelZ }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPvpNote(false)} />
          <div className="relative w-[80%] max-w-xs rounded-lg p-5 animate-slide-up" style={{ background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)", border: "1px solid rgba(212,160,23,0.5)", boxShadow: "0 8px 40px rgba(0,0,0,0.8)" }}>
            <button onClick={() => setShowPvpNote(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: 14, fontWeight: "bold" }}>×</button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "radial-gradient(ellipse at center, rgba(139,0,0,0.3) 0%, rgba(60,10,10,0.5) 100%)", border: "2px solid rgba(200,50,50,0.3)" }}>
                <img src={pvpIcon} alt="PvP" className="w-9 h-9 object-contain" />
              </div>
              <h3 className="font-fantasy text-[#f0c040] text-base tracking-widest font-semibold mb-2" style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}>BATTLE ARENA</h3>
              <p className="font-fantasy text-[#c8b896] text-sm tracking-wider leading-relaxed mb-2">The arena is being forged...</p>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider leading-relaxed mb-4">PvP battles are coming soon! Train your pets and prepare for glorious combat.</p>
              <div className="w-full h-px mb-3" style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)" }} />
              <p className="font-fantasy text-[#6a5840] text-[10px] tracking-widest">STAY TUNED FOR UPDATES</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Aquarium overlay ─────────────────────────────────────────────── */}
      {showAquarium && (
        <div className="absolute inset-0" style={{ zIndex: panelZ }}>
          <AquariumPage onClose={() => setShowAquarium(false)} userId={user.id} />
        </div>
      )}

      {/* ── Keeper's Central overlay ─────────────────────────────────────── */}
      {showKeepers && (
        <div className="absolute inset-0" style={{ zIndex: panelZ }}>
          <PetWorldPage user={user} onClose={() => setShowKeepers(false)} />
        </div>
      )}
    </>
  );
}

// ── Sparkle burst directions (8 angles) ──────────────────────────────────────
const SPARK_DIRS = [
  { tx: "0px",   ty: "-52px" },
  { tx: "37px",  ty: "-37px" },
  { tx: "52px",  ty: "0px"   },
  { tx: "37px",  ty: "37px"  },
  { tx: "0px",   ty: "52px"  },
  { tx: "-37px", ty: "37px"  },
  { tx: "-52px", ty: "0px"   },
  { tx: "-37px", ty: "-37px" },
];
const SPARK_COLORS = ["#f0c040", "#ffd966", "#ffe599", "#f0c040", "#ffcc00", "#ffd966", "#f0c040", "#ffe599"];

// ── Individual nav icon button ────────────────────────────────────────────────
function NavButton({
  icon, label, isOpen, delay, translateX, translateY, fillIcon = false, badge = null, locked = false, onClick, testId,
}: {
  icon: string;
  label: string;
  isOpen: boolean;
  delay: number;
  translateX: number;
  translateY: number;
  fillIcon?: boolean;
  badge?: "green" | "gold" | null;
  locked?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const [sparks, setSparks] = useState<number[]>([]);

  const handleClick = useCallback(() => {
    if (locked) return;
    const id = Date.now();
    setSparks(prev => [...prev, id]);
    setTimeout(() => setSparks(prev => prev.filter(s => s !== id)), 650);
    onClick();
  }, [onClick, locked]);

  return (
    <button
      data-testid={testId}
      onClick={handleClick}
      className="absolute flex flex-col items-center justify-center rounded-full"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        bottom: 0,
        right: 0,
        background: locked
          ? "radial-gradient(circle at 38% 35%, rgba(40,40,40,0.4) 0%, rgba(12,12,12,0.92) 75%)"
          : "radial-gradient(circle at 38% 35%, rgba(60,130,80,0.3) 0%, rgba(12,22,12,0.92) 75%)",
        border: locked
          ? "1.5px solid rgba(80,80,80,0.55)"
          : "1.5px solid rgba(212,160,23,0.55)",
        boxShadow: locked
          ? "0 2px 12px rgba(0,0,0,0.7), 0 0 10px rgba(0,0,0,0.15)"
          : "0 2px 12px rgba(0,0,0,0.7), 0 0 10px rgba(212,160,23,0.15)",
        cursor: locked ? "not-allowed" : "pointer",
        overflow: "visible",
        transform: isOpen ? `translate(${translateX}px, ${translateY}px) scale(1)` : "translate(0,0) scale(0.5)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: `transform 0.28s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity 0.22s ease ${delay}ms`,
        zIndex: 96,
      }}
    >
      <span style={fillIcon ? { display: "block", width: ICON_SIZE, height: ICON_SIZE, borderRadius: "50%", overflow: "hidden", flexShrink: 0 } : undefined}>
        <img
          src={icon}
          alt={label}
          style={{
            width: fillIcon ? ICON_SIZE : ICON_SIZE - 10,
            height: fillIcon ? ICON_SIZE : ICON_SIZE - 10,
            objectFit: fillIcon ? "cover" : "contain",
            borderRadius: fillIcon ? 0 : "50%",
            filter: locked
              ? "grayscale(0.85) brightness(0.5) drop-shadow(0 2px 4px rgba(0,0,0,0.7))"
              : "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
            display: "block",
          }}
        />
      </span>

      {/* Lock overlay */}
      {locked && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.35)" }}
        >
          <Lock size={ICON_SIZE * 0.4} color="#f0c040" strokeWidth={2.5} />
        </div>
      )}

      {/* Badge indicator on individual icon (visible when nav is open) */}
      {badge && (
        <QuillBadge
          size={15}
          glow={badge === "green" ? "#4ade80" : "#f0c040"}
          style={{ position: "absolute", top: -22, zIndex: 200 }}
        />
      )}

      {/* Icon label */}
      <span style={{
        position: "absolute",
        top: -14,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 10,
        fontFamily: "'Cinzel', 'Palatino Linotype', serif",
        fontWeight: 600,
        letterSpacing: "0.05em",
        color: "#f0c040",
        whiteSpace: "nowrap",
        textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)",
        pointerEvents: "none",
        lineHeight: 1,
      }}>
        {label}
      </span>

      {/* Sparkle burst particles */}
      {sparks.map(id => (
        <span key={id} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 200 }}>
          {/* Ring flash */}
          <span style={{
            position: "absolute",
            inset: "50%",
            width: ICON_SIZE * 0.9,
            height: ICON_SIZE * 0.9,
            marginLeft: -(ICON_SIZE * 0.9) / 2,
            marginTop: -(ICON_SIZE * 0.9) / 2,
            borderRadius: "50%",
            border: "1.5px solid rgba(240,192,64,0.7)",
            animation: "nav-spark-ring 0.5s ease-out forwards",
          }} />
          {/* Individual spark dots */}
          {SPARK_DIRS.map((dir, di) => (
            <span
              key={di}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: di % 2 === 0 ? 5 : 4,
                height: di % 2 === 0 ? 5 : 4,
                marginLeft: di % 2 === 0 ? -2.5 : -2,
                marginTop: di % 2 === 0 ? -2.5 : -2,
                borderRadius: "50%",
                background: SPARK_COLORS[di],
                boxShadow: `0 0 4px 1px ${SPARK_COLORS[di]}cc`,
                ["--spark-tx" as any]: dir.tx,
                ["--spark-ty" as any]: dir.ty,
                animation: `nav-spark ${0.5 + di * 0.02}s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
              }}
            />
          ))}
        </span>
      ))}
    </button>
  );
}
