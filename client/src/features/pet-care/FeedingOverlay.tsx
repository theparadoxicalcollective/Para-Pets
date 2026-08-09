import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { MailOpen } from "lucide-react";
import { playClick, playGrab, playPlop } from "@/lib/sounds";
import { setNavHidden } from "@/lib/navVisibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { clientToStage, getDesignW, getStagePortalTarget, getStageScale, DESIGN_H } from "@/lib/stage";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import PetAnimator from "@/components/PetAnimator";
import ErrorBoundary from "@/components/ErrorBoundary";
import homeInventoryIcon from "@assets/icon_home_inventory.png";
import decorInventoryIcon from "@assets/icon_decor_inventory.png";
import petInventoryIcon from "@assets/icon_pet_inventory.png";
import feedButtonIcon from "@assets/generated_images/feed_button_icon.png";
import feedingPageBg from "@assets/IMG_5734_1783098320823.jpeg";
import careWreathImg from "@assets/Photoroom_20260611_74428_AM_1781181905848.png";
import { QuillBadge } from "@/components/QuillBadge";
import moodFaceHappy from "@assets/mood_face_happy.png";
import moodFaceContent from "@assets/mood_face_content.png";
import moodFaceSad from "@assets/mood_face_sad.png";
import moodFaceHungry from "@assets/mood_face_hungry.png";
import coinIconImg from "@assets/icon_coin.png";
import LoadingScreen from "@/components/LoadingScreen";
import GiftClaimModal from "@/components/GiftClaimModal";
import { VisibleAssetImage } from "@/components/VisibleAssetImage";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";
import loyaltyRewardIcon from "@assets/Photoroom_20260703_72612_AM_1783081617614.png";
import petCareItemShelf from "@assets/ui/pet-care/item-shelf.png";
import hungerMeterFrame from "@assets/ui/pet-care/hunger-meter-frame.png";
import moodMeterFrame from "@assets/ui/pet-care/mood-meter-frame.png";
import loyaltyMeterFrame from "@assets/ui/pet-care/loyalty-meter-frame.png";
import {
  classifyPetCareItemGesture,
  createPetCareGestureController,
  PET_CARE_DROP_PADDING_PX,
  PET_CARE_DRAG_GHOST_SIZE_PX,
  PET_CARE_VISIBLE_SLOTS,
  getPetCareDragGhostTransform,
  pointInsideExpandedPetDropZone,
  type PetCareItemGestureIntent,
} from "@/lib/petCareInteractions";
import { buildPetCareInventoryStacks, orderPetCareItemsByEffect } from "@/lib/petCareInventory";
import { finitePetCareStat, parsePetCareInventory } from "@/lib/petCareData";
import { stabilityDiagnostic } from "@/lib/stabilityDiagnostics";
import { detectRuntimeMode } from "@/lib/runtimeMode";
import { clearPetCarePhase, getPetCareRuntimeDecisions, readRecoverablePetCarePhase, reportRecoveredPetCarePhase, sanitizePetCareRoute, writePetCarePhase, type PetCarePhase, type PetCarePhaseRecord } from "@/lib/petCareSafeMode";

/**
 * Pet Care feature boundary.
 *
 * This module owns the feeding/care scene so the standalone Pet Care route no
 * longer imports the much larger Pet House page module. Keep Pet Care behavior,
 * endpoints, inventory semantics, animation timing, and visual assets stable.
 */
interface HousePet {
  inventoryId: string; shopItemId: string; name: string; nickname: string | null;
  imageUrl: string | null; hatchedImageUrl: string | null; eggImageUrl: string | null;
  rarity: number | null; petLevel: number; petHealth: number; petAtk: number; petDef: number;
  petTemplateId: string | null; posLeft: string | null; posTop: string | null; location: string | null;
}

type PetCareShelfItem = {
  id: string;
  shopItemId: string;
  stackId: string;
  imageUrl: string | null;
  name: string;
  quantity?: number | null;
  displayQuantity: number;
  type: string;
  statBoostAmount?: number | null;
  giftPoints?: number | null;
};

function logUnexpectedPetCareMutationError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(?:400|404|409)\b/.test(message)) return;
  try {
    stabilityDiagnostic("pet-care-mutation-failed", { context, message });
  } catch {
    // Diagnostics must never turn a contained request failure into a crash.
  }
}

function PetCareItemShelf({
  kind,
  items,
  onItemPointerDown,
  onItemClick,
  selectedStackId,
  draggingStackId,
  safeMode,
  dragEnabled,
}: {
  kind: "edibles" | "gifts";
  items: PetCareShelfItem[];
  onItemPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: PetCareShelfItem) => void;
  onItemClick: (item: PetCareShelfItem) => void;
  selectedStackId: string | null;
  draggingStackId: string | null;
  safeMode: boolean;
  dragEnabled: boolean;
}) {
  const isEdible = kind === "edibles";
  const title = isEdible ? "EDIBLES" : "GIFTS";
  return (
    <section
      className={`pet-care-item-shelf pet-care-item-shelf--${kind}`}
      data-testid={`pet-care-${kind}-shelf`}
      style={{ "--pet-care-visible-slots": PET_CARE_VISIBLE_SLOTS } as React.CSSProperties}
    >
      <div className="pet-care-item-shelf__stage">
        <div className="pet-care-item-shelf__art-crop" aria-hidden="true">
          <img className="pet-care-item-shelf__art" src={petCareItemShelf} alt="" draggable={false} />
        </div>
        <div className="pet-care-item-shelf__viewport">
          {items.map((item) => (
            <div
              key={item.stackId}
              className={`pet-care-item-shelf__item${selectedStackId === item.stackId ? " pet-care-item-shelf__item--selected" : ""}`}
              onPointerDown={dragEnabled ? (event) => onItemPointerDown(event, item) : undefined}
              onClick={!dragEnabled ? () => onItemClick(item) : undefined}
              data-pet-care-drag-source={draggingStackId === item.stackId ? "true" : undefined}
              data-pet-care-stack-id={item.stackId}
              data-testid={`${isEdible ? "edible" : "gift"}-item-${item.id}`}
            >
              <div className="pet-care-item-shelf__visible-artwork">
                {item.imageUrl && (safeMode
                  ? <img className="pet-care-item-shelf__normalized-image" src={item.imageUrl} alt={item.name} draggable={false} style={{ objectFit: "contain" }} />
                  : <VisibleAssetImage className="pet-care-item-shelf__normalized-image" src={item.imageUrl} alt={item.name} />)}
                {isEdible && item.statBoostAmount != null && <span className="pet-care-item-shelf__value pet-care-item-shelf__value--edible">+{item.statBoostAmount}</span>}
                {!isEdible && !!item.giftPoints && <span className="pet-care-item-shelf__value pet-care-item-shelf__value--gift">+{item.giftPoints}</span>}
                {item.displayQuantity > 1 && <span className="pet-care-item-shelf__quantity">×{item.displayQuantity}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="pet-care-item-shelf__art-crop pet-care-item-shelf__art-crop--front" aria-hidden="true">
          <img className="pet-care-item-shelf__art" src={petCareItemShelf} alt="" draggable={false} />
        </div>
        {items.length === 0 && (
          <span className="pet-care-item-shelf__empty" data-testid={`text-no-${kind}`}>
            No {kind}
          </span>
        )}
        <span className="pet-care-item-shelf__title">
          {title}
        </span>
      </div>
    </section>
  );
}

// ── Feeding Overlay ──────────────────────────────────────────────────────────
// Full-screen magical-rainforest scene where a player drags edibles from the
// bottom strip onto the pet to feed it. Each successful drop calls the existing
// `/api/pet/:inventoryId/feed-edible` endpoint, which destroys the edible and
// awards LVL points. Inventory + pet caches are invalidated after each feed.
// Hunger & Mood status bars rendered below the pet on the feeding page.
// Hunger: color shifts green → yellow → orange → red as it depletes.
// Mood: color shifts gold → soft purple → grey → muddy red, with the
// matching mood face icon swapped out at thresholds.
function PetCareAssetMeter({
  orientation = "horizontal",
  frame,
  percentage,
  theme,
  accessibleLabel,
  testId,
  children,
  safeMode = false,
}: {
  orientation?: "horizontal" | "vertical";
  frame: string;
  percentage: number;
  theme: "hunger" | "mood" | "loyalty";
  accessibleLabel: string;
  testId: string;
  children?: React.ReactNode;
  safeMode?: boolean;
}) {
  const safePercentage = Number.isFinite(percentage)
    ? Math.max(0, Math.min(100, percentage))
    : 0;
  return (
    <div
      className={`pet-care-meter pet-care-meter--${orientation} pet-care-meter--${theme}`}
      role="meter"
      aria-label={accessibleLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safePercentage)}
      data-testid={testId}
      data-percentage={safePercentage}
    >
      <div className="pet-care-meter__track" aria-hidden="true">
        <div
          className="pet-care-meter__fill"
          style={orientation === "vertical" ? { height: `${safePercentage}%` } : { width: `${safePercentage}%` }}
        >
          {!safeMode && <span className="pet-care-meter__highlight" />}
          {!safeMode && <span className="pet-care-meter__sparkles" />}
        </div>
      </div>
      <img className="pet-care-meter__frame" src={frame} alt="" draggable={false} aria-hidden="true" />
      {children}
    </div>
  );
}

function PetCareMoodMeter({ moodVal, safeMode = false }: {
  moodVal: number;
  safeMode?: boolean;
}) {
  let moodFace = moodFaceHappy;
  let moodLabel = "Happy";
  if (moodVal <= 25) { moodFace = moodFaceHungry; moodLabel = "Miserable"; }
  else if (moodVal <= 50) { moodFace = moodFaceSad; moodLabel = "Sad"; }
  else if (moodVal <= 75) { moodFace = moodFaceContent; moodLabel = "Content"; }

  return (
    <div className="pet-care-mood" data-testid="pet-care-mood-zone">
        <PetCareAssetMeter
          frame={moodMeterFrame}
          percentage={moodVal}
          theme="mood"
          accessibleLabel={`Mood ${moodVal} of 100, ${moodLabel}`}
          testId="bar-mood"
          safeMode={safeMode}
        >
          <div className="pet-care-meter__mood-face-window">
            <img
              className="pet-care-meter__mood-face"
              src={moodFace}
              alt={`${moodLabel} mood`}
              data-testid="img-mood-face"
            />
          </div>
        </PetCareAssetMeter>
    </div>
  );
}

function PetCareHungerMeter({
  hungerVal,
  hungerMax,
  hungerPct,
  xpBoostActive = false,
  xpBoostPct = 0,
  safeMode = false,
}: {
  hungerVal: number;
  hungerMax: number;
  hungerPct: number;
  xpBoostActive?: boolean;
  xpBoostPct?: number;
  safeMode?: boolean;
}) {
  return (
    <div className="pet-care-hunger" data-testid="pet-care-hunger-zone">
        <PetCareAssetMeter
          frame={hungerMeterFrame}
          percentage={hungerPct}
          theme="hunger"
          accessibleLabel={`Hunger ${hungerVal} of ${hungerMax}`}
          testId="bar-hunger"
          safeMode={safeMode}
        />
        {xpBoostActive && xpBoostPct > 0 && (
          <div className="pet-care-xp-boost" data-testid="xp-boost-badge">
            <span aria-hidden="true">⚡</span>
            <span>LOYALTY +{xpBoostPct}% XP</span>
            <span aria-hidden="true">⚡</span>
          </div>
        )}
    </div>
  );
}

export function FeedingOverlay({ pet, user, onUserUpdate, onClose, feedHint = false, hideCoinDisplay = false }: {
  pet: HousePet;
  user: any;
  onUserUpdate: (u: any) => void;
  onClose: () => void;
  feedHint?: boolean;
  hideCoinDisplay?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const runtime = useMemo(() => detectRuntimeMode(), []);
  const recoveredPhase = useMemo(() => readRecoverablePetCarePhase(window.localStorage), []);
  const { reducedVisualMode: safeMode, dragEnabled, emergencyInteractionFallback } = getPetCareRuntimeDecisions(runtime, window.location.search, !!recoveredPhase);
  const interactionRef = useRef<{ id: string; itemType?: "edibles" | "gift" }>({ id: "mount" });
  const recordPhase = useCallback((phase: PetCarePhase, itemType = interactionRef.current.itemType) => {
    const record: PetCarePhaseRecord = {
      version: 1, buildId: __BUILD_ID__, timestamp: Date.now(), route: sanitizePetCareRoute(window.location.pathname),
      runtimeMode: runtime.displayMode, safeMode, phase,
      interactionId: interactionRef.current.id, ...(itemType ? { itemType } : {}),
    };
    writePetCarePhase(window.localStorage, record);
    if (phase === "cleanup-complete") clearPetCarePhase(window.localStorage);
  }, [runtime.displayMode, safeMode]);
  const [showFeedHint, setShowFeedHint] = useState(feedHint);
  useEffect(() => {
    const viewport = window.visualViewport;
    console.info("[Para Pets] Pet Care runtime", {
      buildId: __BUILD_ID__, displayMode: runtime.displayMode,
      standalone: runtime.isStandalone, browser: runtime.browserClassification,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      visualViewportWidth: viewport?.width ?? null, visualViewportHeight: viewport?.height ?? null,
      visualViewportOffsetTop: viewport?.offsetTop ?? null,
      devicePixelRatio: window.devicePixelRatio, stageScale: getStageScale(), route: window.location.pathname,
    });
    if (recoveredPhase) {
      reportRecoveredPetCarePhase(recoveredPhase);
      clearPetCarePhase(window.localStorage);
    }
    recordPhase("mounted");
  }, [recordPhase, recoveredPhase, runtime]);
  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timeoutIdsRef.current.delete(id);
      if (mountedRef.current) callback();
    }, delay);
    timeoutIdsRef.current.add(id);
    return id;
  }, []);

  // Pull the live, full inventory so we can filter to edibles AND look up the
  // canonical, server-decayed hunger/mood for THIS pet (the prop is a stale
  // snapshot from the pet-house page).
  const { data: inventoryPayload } = useQuery<unknown>({
    queryKey: ["/api/inventory"],
    refetchInterval: 30_000,  // Keep hunger/mood live while overlay is open.
  });
  const inventory = useMemo<any[]>(
    () => parsePetCareInventory(Array.isArray(inventoryPayload) ? inventoryPayload : []) as any[],
    [inventoryPayload],
  );
  const edibles = useMemo(
    () => orderPetCareItemsByEffect(
      buildPetCareInventoryStacks(inventory.filter((it) => it.type === "edibles") as any[]),
      "edibles",
    ),
    [inventory],
  );
  const gifts = useMemo(
    () => orderPetCareItemsByEffect(
      buildPetCareInventoryStacks(inventory.filter((it) => it.type === "gift") as any[]),
      "gifts",
    ),
    [inventory],
  );
  // Find the live pet record so hunger/mood reflect server state.
  const livePet = useMemo(
    () => inventory.find((it) => it?.id === pet?.inventoryId) ?? pet ?? {},
    [inventory, pet],
  );
  // Hunger is a fixed 0–1000 care stat on the server; combat HP is unrelated.
  const maxHunger = 1000;
  const rawHunger = Number(livePet?.petHunger);
  const hungerVal = Number.isFinite(rawHunger)
    ? finitePetCareStat(rawHunger, maxHunger, maxHunger)
    : maxHunger;
  const hungerPct = Math.max(0, Math.min(100, (hungerVal / maxHunger) * 100));
  const rawMood = Number(livePet?.petMood);
  const moodVal = Number.isFinite(rawMood)
    ? finitePetCareStat(rawMood, 100)
    : 100;
  const petStarRarity: number = Number(livePet?.starRarity) || 1;
  const loyaltyMaxByRarity: Record<number, number> = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };
  const loyaltyMax = loyaltyMaxByRarity[petStarRarity] ?? 1000;
  const rawLoyalty = Number(livePet?.petLoyalty);
  const loyaltyVal = Number.isFinite(rawLoyalty)
    ? finitePetCareStat(rawLoyalty, 0, loyaltyMax)
    : 0;
  const loyaltyPct = (loyaltyVal / loyaltyMax) * 100;
  const loyaltyFull = loyaltyVal >= loyaltyMax;

  // Drag state.
  const dragRef = useRef<{
    inventoryId: string;
    imageUrl: string | null;
    type: string;
    quantity: number;
    name: string;
    statBoostAmount: number;
    giftPoints: number;
    stackId: string;
    pid: number;
    startX: number;
    startY: number;
    intent: PetCareItemGestureIntent;
  } | null>(null);
  const itemGestureControllerRef = useRef(createPetCareGestureController<PetCareShelfItem>());
  const [dragGhost, setDragGhost] = useState<PetCareShelfItem | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragPositionRef = useRef({ x: 0, y: 0 });
  const capturedPointerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const isApplyingItemRef = useRef(false);
  const [isApplyingItem, setIsApplyingItem] = useState(false);
  const [selectedCareItem, setSelectedCareItem] = useState<PetCareShelfItem | null>(null);

  // Feed-stack popup: shown when a stacked edible is dropped on the pet.
  const [pendingFeed, setPendingFeed] = useState<{
    inventoryId: string;
    imageUrl: string | null;
    name: string;
    quantity: number;
    statBoostAmount: number;
  } | null>(null);
  const [divideMode, setDivideMode] = useState(false);
  const [divideInput, setDivideInput] = useState("1");

  // Pet visual state — drop target, glow, click animation, sparkles.
  const petBoxRef = useRef<HTMLDivElement>(null);
  const [petGlow, setPetGlow] = useState(false);
  const [petBounce, setPetBounce] = useState(false);
  // Petting state: pressed = pointer is held on the pet (squish + eyes closed),
  // circling = a circular gesture is in progress (adds bounce + hearts).
  const [petPressed, setPetPressed] = useState(false);
  const [petCircling, setPetCircling] = useState(false);
  const [showCareTutorial, setShowCareTutorial] = useState(false);
  // Petting gesture tracking.
  const petGestureRef = useRef<{
    pid: number;
    cx: number; cy: number;            // pet center in viewport coords
    lastAngle: number | null;
    travel: number;                     // cumulative |dθ|
    rewardTriedThisPress: boolean;
    circleResetTimer: number | null;
    heartTimer: number | null;
    sparkleTimer: number | null;
    lastX: number; lastY: number;
    pathDistance: number;
    startedAt: number;
  } | null>(null);
  const [floatTexts, setFloatTexts] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const [sparkles, setSparkles] = useState<{ id: number; cx: number; cy: number; dx: number; dy: number; rot: number; size: number }[]>([]);
  const [hearts, setHearts] = useState<{ id: number; cx: number; cy: number; dx: number; size: number; delay: number }[]>([]);
  const [boostActivated, setBoostActivated] = useState(false);
  const floatIdRef = useRef(0);
  const sparkIdRef = useRef(0);
  const heartIdRef = useRef(0);

  // Reward coins spawned by the daily petting circle gesture.
  const [rewardCoins, setRewardCoins] = useState<{
    id: number; cx: number; cy: number; flying?: boolean; batch?: number;
    popX?: number; popY?: number; popDelay?: number; spinDur?: number; spinDelay?: number;
  }[]>([]);
  const [coinsCollectedThisReward, setCoinsCollectedThisReward] = useState(0);
  const coinIdRef = useRef(0);
  const coinChipRef = useRef<HTMLDivElement>(null);
  // Visible coin balance for the in-overlay chip — starts from prop, bumps as
  // the player taps each spinning coin so the total feels earned coin-by-coin.
  const [displayCoins, setDisplayCoins] = useState<number>(user?.coins ?? 0);
  useEffect(() => { setDisplayCoins(user?.coins ?? 0); }, [user?.coins]);

  // The CSS background is the single owner of the large scene image. Creating
  // an additional Image object here made WebKit retain a second decoded copy.

  // Clear every delayed animation and gesture timer when switching pets or
  // leaving Pet Care. Without this, rapid reopen cycles retained particle
  // closures and continued updating an overlay that no longer existed.
  useEffect(() => () => {
    mountedRef.current = false;
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutIdsRef.current.clear();
    const gesture = petGestureRef.current;
    if (gesture?.heartTimer != null) window.clearInterval(gesture.heartTimer);
    if (gesture?.sparkleTimer != null) window.clearInterval(gesture.sparkleTimer);
    if (gesture?.circleResetTimer != null) window.clearTimeout(gesture.circleResetTimer);
    petGestureRef.current = null;
  }, []);

  // Particles (coins/hearts/sparkles) are `position: fixed` inside the scaled
  // #game-stage, so their left/top are read in stage-LOCAL design-space, not
  // viewport px. Convert the incoming viewport point to stage-local and clamp to
  // the authored frame. Using the overlay's viewport rect (the old approach) put
  // particles in the wrong coordinate space → they drifted far to the right on
  // tablets/desktop where the stage is centered with a left margin and scaled.
  const clampToFrame = useCallback((x: number, y: number, pad = 24) => {
    const p = clientToStage(x, y);
    const w = getDesignW();
    return {
      x: Math.min(Math.max(p.x, pad), w - pad),
      y: Math.min(Math.max(p.y, pad), DESIGN_H - pad),
    };
  }, []);

  const spawnRewardCoins = useCallback((count: number) => {
    const box = petBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const newCoins = Array.from({ length: count }, (_, i) => {
      // Wider, jitterier scatter: random angle around the pet (favouring the
      // upper hemisphere so coins burst UP and out, not into the pet's belly),
      // varied radii, and an extra random jitter on each axis. Looks chaotic
      // and "popped" instead of a tidy ring.
      const baseAngle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 1.4;
      // Bias toward upward angles — flip lower-hemisphere angles to upper.
      const angle = Math.sin(baseAngle) > 0.4 ? baseAngle - Math.PI : baseAngle;
      const radius = 50 + Math.random() * 95;
      const jitterX = (Math.random() - 0.5) * 30;
      const jitterY = (Math.random() - 0.5) * 30 - 10;
      const p = clampToFrame(
        cx + Math.cos(angle) * radius + jitterX,
        cy + Math.sin(angle) * radius + jitterY,
      );
      // Per-coin pop trajectory + spin tempo so the batch doesn't look robotic.
      const popX = (Math.random() - 0.5) * 36;
      const popY = -10 - Math.random() * 28; // start above resting pos
      const popDelay = Math.random() * 0.18; // staggered entrance
      const spinDur = 0.9 + Math.random() * 1.1; // 0.9s–2.0s
      const spinDelay = Math.random() * spinDur; // start mid-rotation
      return {
        id: ++coinIdRef.current,
        cx: p.x,
        cy: p.y,
        batch: count,
        popX, popY, popDelay, spinDur, spinDelay,
      };
    });
    setRewardCoins((c) => [...c, ...newCoins]);
    setCoinsCollectedThisReward(0);
  }, [clampToFrame]);

  // Pet-petting reward. The server returns { rewarded, amount } — the first
  // petting each day always grants 10 coins, with up to 4 random extras (3-5
  // coins) thereafter. The hearts/sparkles animation always fires regardless.
  const pettingRewardMutation = useMutation({
    // Per-pet endpoint — the daily reward allotment lives on the pet's
    // inventory row, so each of the player's pets has its own first-petting
    // +10 coins and its own pool of extra rewards.
    mutationFn: async (inventoryId: string) => {
      // `apiRequest` returns the raw `Response` — we MUST `.json()` it ourselves
      // or `data.rewarded` below is forever `undefined` and no coins ever drop.
      const res = await apiRequest("POST", `/api/pets/${inventoryId}/petting-reward`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      playPlop();
      // Reflect the mood gain immediately while the authoritative refetch runs.
      if (data?.moodGained > 0 && pet?.inventoryId) {
        qc.setQueryData(["/api/inventory"], (payload: unknown) => {
          if (!Array.isArray(payload)) return payload;
          return payload.map((entry: any) => {
            if (entry?.id !== pet.inventoryId) return entry;
            const currentMood = Number(entry.petMood);
            const baseMood = Number.isFinite(currentMood) ? currentMood : 100;
            return { ...entry, petMood: Math.min(100, baseMood + Number(data.moodGained)) };
          });
        });
      }
      void qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      if (data?.rewarded && data?.amount > 0) {
        spawnRewardCoins(data.amount);
      } else {
        const box = petBoxRef.current?.getBoundingClientRect();
        if (box) {
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          burstHearts(cx, cy + 30, 6);
        }
      }
      if (data?.moodGained > 0) {
        const box = petBoxRef.current?.getBoundingClientRect();
        if (box) {
          // floatTexts are `fixed` inside the scaled stage — convert to
          // stage-local so the "+Mood" text appears over the pet on all devices.
          const fp = clientToStage(box.left + box.width / 2, box.top + box.height * 0.2);
          const cx = fp.x;
          const cy = fp.y;
          const id = ++floatIdRef.current;
          setFloatTexts((arr) => [...arr, { id, x: cx, y: cy, text: `+${data.moodGained} Mood` }]);
          scheduleTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id)), 1400);
        }
      }
    },
  });

  const collectCoin = useCallback((coinId: number) => {
    let batchSize = 1;
    setRewardCoins((coins) => coins.map((c) => {
      if (c.id === coinId) {
        batchSize = c.batch ?? 1;
        return { ...c, flying: true };
      }
      return c;
    }));
    // Instantly bump every visible coin counter — the in-overlay chip and the
    // cached user record consumed by the rest of the app — so the balance
    // updates the moment the player taps a coin.
    setDisplayCoins((n) => n + 1);
    qc.setQueryData(["/api/auth/me"], (prev: any) =>
      prev ? { ...prev, coins: (prev.coins ?? 0) + 1 } : prev
    );
    setCoinsCollectedThisReward((n) => {
      const next = n + 1;
      // After the last coin's fly-in completes, reconcile with the server so
      // the cached value matches the authoritative total.
      scheduleTimeout(() => {
        setRewardCoins((coins) => coins.filter((c) => c.id !== coinId));
        if (next >= batchSize) {
          qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }
      }, 700);
      return next;
    });
  }, [qc]);

  const burstHearts = useCallback((cx: number, cy: number, count = 7) => {
    const newOnes = Array.from({ length: count }, () => {
      const p = clampToFrame(cx + (Math.random() - 0.5) * 180, cy);
      return {
        id: ++heartIdRef.current,
        cx: p.x,
        cy: p.y,
        // Keep the horizontal drift modest so the rise stays inside the frame.
        dx: (Math.random() - 0.5) * 120,
        size: 18 + Math.random() * 22,
        delay: Math.random() * 0.45,
      };
    });
    setHearts((h) => [...h, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    scheduleTimeout(() => setHearts((h) => h.filter((x) => !ids.has(x.id))), 2600);
  }, [clampToFrame]);

  const burstSparkles = useCallback((cx: number, cy: number, count = 10) => {
    const newOnes = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 70 + Math.random() * 70;
      const p = clampToFrame(cx, cy);
      return {
        id: ++sparkIdRef.current,
        cx: p.x, cy: p.y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 20,  // bias upward
        rot: (Math.random() - 0.5) * 540,
        size: 12 + Math.random() * 10,
      };
    });
    setSparkles((s) => [...s, ...newOnes]);
    const ids = new Set(newOnes.map((n) => n.id));
    scheduleTimeout(() => setSparkles((s) => s.filter((x) => !ids.has(x.id))), 1200);
  }, [clampToFrame]);

  // ── Petting gesture ──────────────────────────────────────────────────────
  // Press the pet → squish + closed eyes (no bounce). Drag in a circular
  // motion → adds a small bounce + heart bursts, and once per UTC day grants
  // the player +10 coins (server-enforced) which spawn as collectable spinners.
  const onPetPointerDown = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) return; // ignore — an item is being dragged onto the pet
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const box = petBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    petGestureRef.current = {
      pid: e.pointerId,
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
      lastAngle: null,
      travel: 0,
      rewardTriedThisPress: false,
      circleResetTimer: null,
      heartTimer: null,
      sparkleTimer: null,
      lastX: e.clientX, lastY: e.clientY,
      pathDistance: 0,
      startedAt: performance.now(),
    };
    setPetPressed(true);
  }, []);

  const triggerCircleEffects = useCallback(() => {
    setPetCircling(true);
    const g = petGestureRef.current;
    if (!g) return;
    // Keep petting and rewards enabled on iOS while avoiding the repeating
    // particle timers that originally made the low-memory mode expensive.
    if (!safeMode) {
      if (g.heartTimer == null) {
        const tick = () => {
          const cur = petGestureRef.current;
          if (!cur) return;
          burstHearts(cur.cx, cur.cy + 30, 2);
        };
        tick();
        g.heartTimer = window.setInterval(tick, 380);
      }
      if (g.sparkleTimer == null) {
        const sparkleTick = () => {
          const cur = petGestureRef.current;
          if (!cur) return;
          const ringAngle = Math.random() * Math.PI * 2;
          const ringR = 60 + Math.random() * 40;
          burstSparkles(cur.cx + Math.cos(ringAngle) * ringR, cur.cy + Math.sin(ringAngle) * ringR, 6);
        };
        sparkleTick();
        g.sparkleTimer = window.setInterval(sparkleTick, 180);
      }
    }
    if (g.circleResetTimer != null) window.clearTimeout(g.circleResetTimer);
    g.circleResetTimer = scheduleTimeout(() => {
      const cur = petGestureRef.current;
      if (cur?.heartTimer != null) {
        window.clearInterval(cur.heartTimer);
        cur.heartTimer = null;
      }
      if (cur?.sparkleTimer != null) {
        window.clearInterval(cur.sparkleTimer);
        cur.sparkleTimer = null;
      }
      setPetCircling(false);
    }, 350);
  }, [burstHearts, burstSparkles, safeMode, scheduleTimeout]);

  const onPetPointerMove = useCallback((e: React.PointerEvent) => {
    const g = petGestureRef.current;
    if (!g || g.pid !== e.pointerId) return;
    g.pathDistance += Math.hypot(e.clientX - g.lastX, e.clientY - g.lastY);
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    // A deliberate short rub is petting too; it should not require a perfect
    // circle. It enters the same guarded reward path as circular motion.
    if (g.pathDistance >= 46 && performance.now() - g.startedAt >= 80) {
      triggerCircleEffects();
      if (!g.rewardTriedThisPress) {
        g.rewardTriedThisPress = true;
        if (pet?.inventoryId) pettingRewardMutation.mutate(pet.inventoryId);
      }
      g.pathDistance = 0;
      g.startedAt = performance.now();
    }
    const dx = e.clientX - g.cx;
    const dy = e.clientY - g.cy;
    const dist = Math.hypot(dx, dy);
    // Need to be slightly off-center to compute meaningful angles. Kept tight
    // so a small wrist circle inside the pet box still registers as petting.
    if (dist < 18) return;
    const angle = Math.atan2(dy, dx);
    if (g.lastAngle != null) {
      let d = angle - g.lastAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      g.travel += Math.abs(d);
      // Once accumulated angular travel exceeds ~1/3 of a turn (~120°), count it
      // as a circle motion: trigger the cute response and (once per press)
      // request the daily reward. Threshold lowered so casual circles trigger.
      if (g.travel > Math.PI * 0.66) {
        triggerCircleEffects();
        if (!g.rewardTriedThisPress) {
          g.rewardTriedThisPress = true;
          // Each pet has its own daily allotment, so include the inventoryId.
          if (pet?.inventoryId) pettingRewardMutation.mutate(pet.inventoryId);
        }
        // Allow continued circling to keep effect going by resetting travel.
        g.travel = 0;
      }
    }
    g.lastAngle = angle;
  }, [triggerCircleEffects, pettingRewardMutation]);

  const releasePetGesture = useCallback(() => {
    const g = petGestureRef.current;
    if (g) {
      if (g.heartTimer    != null) window.clearInterval(g.heartTimer);
      if (g.sparkleTimer  != null) window.clearInterval(g.sparkleTimer);
      if (g.circleResetTimer != null) window.clearTimeout(g.circleResetTimer);
    }
    petGestureRef.current = null;
    setPetPressed(false);
    setPetCircling(false);
  }, []);

  const endPetGesture = useCallback((e: React.PointerEvent) => {
    const g = petGestureRef.current;
    if (!g || g.pid !== e.pointerId) return;
    releasePetGesture();
  }, [releasePetGesture]);

  // Safety net: if pointerup/cancel ever escapes the pet box (e.g. finger
  // ends on a sparkle/heart layer or the browser drops capture), guarantee
  // the pet returns to its idle, unsquished form.
  useEffect(() => {
    const reset = () => {
      if (petGestureRef.current) releasePetGesture();
    };
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
    return () => {
      window.removeEventListener("pointerup", reset);
      window.removeEventListener("pointercancel", reset);
    };
  }, [releasePetGesture]);

  const giftMutation = useMutation({
    mutationFn: async ({ itemInventoryId }: { itemInventoryId: string }) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/give-gift`, { itemInventoryId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      recordPhase("mutation-success-received");
      setSelectedCareItem(null);
      playPlop();
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      recordPhase("success-visual-started");
      if (!safeMode) {
        setPetGlow(true);
        setPetBounce(true);
        scheduleTimeout(() => setPetGlow(false), 700);
        scheduleTimeout(() => setPetBounce(false), 1100);
      }
      const id = ++floatIdRef.current;
      const box = petBoxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height * 0.3 : window.innerHeight / 2;
      const added = data?.loyaltyAdded ?? 0;
      setFloatTexts((arr) => [...arr, { id, x: cx, y: cy, text: `+${added} Loyalty` }]);
      scheduleTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id)), 1400);
      if (box && !safeMode) {
        const bx = box.left + box.width / 2;
        const by = box.top + box.height / 2;
        burstHearts(bx, by + 30, 12);
        burstSparkles(bx, by, 16);
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't give gift", description: err?.message || "Try again in a moment." });
    },
  });

  const claimLoyaltyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/claim-loyalty-reward`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const box = petBoxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height * 0.3 : window.innerHeight / 2;
      const coinsText = data?.coinsAwarded ? `+${data.coinsAwarded} Coins!` : "Reward Claimed!";
      const id1 = ++floatIdRef.current;
      setFloatTexts((arr) => [...arr, { id: id1, x: cx, y: cy - 20, text: coinsText }]);
      scheduleTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id1)), 1800);
      if (data?.xpBoostPct > 0) {
        const id2 = ++floatIdRef.current;
        setFloatTexts((arr) => [...arr, { id: id2, x: cx, y: cy + 20, text: `+${data.xpBoostPct}% XP for 1 hr!` }]);
        scheduleTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id2)), 2400);
        setBoostActivated(true);
        scheduleTimeout(() => setBoostActivated(false), 3200);
      }
      if (box) {
        burstHearts(cx, cy + 30, 14);
        burstSparkles(cx, cy, 20);
      }
      onUserUpdate({ ...(user ?? {}), coins: data?.userCoins ?? (user?.coins ?? 0) });
      setDisplayCoins(data?.userCoins ?? (user?.coins ?? 0));
    },
    onError: (err: any) => {
      toast({ title: "Couldn't claim reward", description: err?.message || "Try again in a moment." });
    },
  });

  const feedMutation = useMutation({
    mutationFn: async ({ itemInventoryId, quantity = 1 }: { itemInventoryId: string; quantity?: number }) => {
      const res = await apiRequest("POST", `/api/pet/${pet.inventoryId}/feed-edible`, { itemInventoryId, quantity });
      return await res.json();
    },
    onSuccess: (data: any, variables) => {
      recordPhase("mutation-success-received");
      setSelectedCareItem(null);
      playPlop();
      // The feed endpoint returns the updated pet. Merge it into the inventory
      // cache immediately so Hunger and Mood move before the refetch completes.
      if (data && typeof data === "object" && pet?.inventoryId) {
        qc.setQueryData(["/api/inventory"], (payload: unknown) => {
          if (!Array.isArray(payload)) return payload;
          return payload.map((entry: any) =>
            entry?.id === pet.inventoryId ? { ...entry, ...data } : entry
          );
        });
      }
      void qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      void qc.invalidateQueries({ queryKey: ["/api/quests/daily"] });
      recordPhase("success-visual-started");
      if (!safeMode) {
        setPetGlow(true);
        setPetBounce(true);
        scheduleTimeout(() => setPetGlow(false), 700);
        scheduleTimeout(() => setPetBounce(false), 1100);
      }
      const fed = inventory.find((it) => it.id === variables.itemInventoryId);
      const qty = variables.quantity ?? 1;
      const amount = Number(data?.totalFeedPoints) || (fed?.statBoostAmount ?? 5) * qty;
      const id = ++floatIdRef.current;
      const box = petBoxRef.current?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height * 0.3 : window.innerHeight / 2;
      setFloatTexts((arr) => [...arr, { id, x: cx, y: cy, text: `+${amount} Feed pts` }]);
      scheduleTimeout(() => setFloatTexts((arr) => arr.filter((f) => f.id !== id)), 1400);
      if (box && !safeMode) {
        const bx = box.left + box.width / 2;
        const by = box.top + box.height / 2;
        burstSparkles(bx, by, 14);
        burstHearts(bx, by + 30, 8);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't feed",
        description: err?.message || "Try again in a moment.",
      });
    },
  });

  const updateDragGhostPosition = useCallback((x: number, y: number) => {
    // The ghost belongs to the portrait game frame. Convert client coordinates
    // before positioning it in the transformed stage portal.
    dragPositionRef.current = clientToStage(x, y);
    if (dragFrameRef.current != null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const ghost = dragGhostRef.current;
      if (ghost) {
        const point = dragPositionRef.current;
        ghost.style.transform = getPetCareDragGhostTransform(point.x, point.y);
      }
    });
  }, []);

  const cleanupItemGesture = useCallback((releaseCapture = true, updateState = mountedRef.current) => {
    const capturedPointer = capturedPointerRef.current;
    if (releaseCapture && capturedPointer != null && overlayRef.current?.hasPointerCapture?.(capturedPointer)) {
      overlayRef.current.releasePointerCapture(capturedPointer);
    }
    capturedPointerRef.current = null;
    dragRef.current = null;
    suppressClickRef.current = false;
    itemGestureControllerRef.current.cancel();
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (updateState) {
      setDragGhost(null);
      setPetGlow(false);
      setIsApplyingItem(false);
    }
    recordPhase("cleanup-complete");
  }, [recordPhase]);

  useEffect(() => () => cleanupItemGesture(true, false), [cleanupItemGesture]);
  useEffect(() => {
    const cancelForLifecycle = () => cleanupItemGesture(false, mountedRef.current);
    const onVisibility = () => { if (document.visibilityState === "hidden") cancelForLifecycle(); };
    window.addEventListener("pagehide", cancelForLifecycle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", cancelForLifecycle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cleanupItemGesture]);

  const onItemPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, item: PetCareShelfItem) => {
    // Leave the gesture pending so Safari can give a horizontal swipe to the
    // native shelf scroller. Capture moves to the stable overlay only after an
    // upward item drag has been classified.
    e.stopPropagation();
    if (isApplyingItemRef.current || !item?.id || (item.quantity ?? 0) <= 0) return;
    interactionRef.current = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, itemType: item.type === "gift" ? "gift" : "edibles" };
    recordPhase("pointer-down");
    dragRef.current = {
      inventoryId: item.id,
      imageUrl: item.imageUrl,
      type: item.type,
      quantity: item.quantity ?? 1,
      name: item.name,
      statBoostAmount: item.statBoostAmount ?? 5,
      giftPoints: item.giftPoints ?? 0,
      stackId: item.stackId,
      pid: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      intent: "pending",
    };
    itemGestureControllerRef.current.begin(e.pointerId, e.clientX, e.clientY, item);
    setDragGhost(null);
  }, [recordPhase]);

  const applyCareItem = useCallback(async (drag: NonNullable<typeof dragRef.current>) => {
    if (isApplyingItemRef.current) return;
    const currentItem = inventory.find((entry) => entry?.id === drag.inventoryId);
    const currentPet = inventory.find((entry) => entry?.id === pet?.inventoryId);
    if (!currentItem || Number(currentItem.quantity ?? 0) <= 0) {
      toast({ title: "Item unavailable", description: "That item is no longer in your inventory." });
      return;
    }
    if (!currentPet || !currentPet.isHatched || !pet?.inventoryId) {
      toast({ title: "Pet unavailable", description: "Please reopen Pet Care and try again." });
      return;
    }

    isApplyingItemRef.current = true;
    interactionRef.current.itemType = drag.type === "gift" ? "gift" : "edibles";
    recordPhase("drop-attempt");
    if (mountedRef.current) setIsApplyingItem(true);
    try {
      if (drag.type === "gift") {
        recordPhase("mutation-started");
        await giftMutation.mutateAsync({ itemInventoryId: drag.inventoryId });
      } else if (drag.type === "edibles" && drag.quantity > 1) {
        if (mountedRef.current) {
          setPendingFeed({
            inventoryId: drag.inventoryId,
            imageUrl: drag.imageUrl,
            name: drag.name,
            quantity: Math.min(drag.quantity, Number(currentItem.quantity)),
            statBoostAmount: drag.statBoostAmount,
          });
          setDivideMode(false);
          setDivideInput("1");
        }
      } else if (drag.type === "edibles") {
        recordPhase("mutation-started");
        await feedMutation.mutateAsync({ itemInventoryId: drag.inventoryId });
      }
    } catch (error) {
      // React Query's onError already showed the normal toast. Consuming the
      // mutateAsync rejection here prevents the global unhandled-rejection
      // reporter from treating a stale inventory response as an app crash.
      logUnexpectedPetCareMutationError(`${drag.type}-drop`, error);
    } finally {
      cleanupItemGesture(true, mountedRef.current);
      isApplyingItemRef.current = false;
      if (mountedRef.current) setIsApplyingItem(false);
    }
  }, [cleanupItemGesture, feedMutation, giftMutation, inventory, pet?.inventoryId, recordPhase, toast]);

  const selectCareItem = useCallback((item: PetCareShelfItem) => {
    if (suppressClickRef.current) return;
    interactionRef.current = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, itemType: item.type === "gift" ? "gift" : "edibles" };
    recordPhase("item-selected");
    setSelectedCareItem((current) => current?.stackId === item.stackId ? null : item);
  }, [recordPhase]);

  const applySelectedCareItem = useCallback(() => {
    const item = selectedCareItem;
    if (!item || isApplyingItemRef.current) return;
    void applyCareItem({
      inventoryId: item.id, imageUrl: item.imageUrl, type: item.type,
      quantity: item.quantity ?? 1, name: item.name,
      statBoostAmount: item.statBoostAmount ?? 5, giftPoints: item.giftPoints ?? 0,
      pid: -1, startX: 0, startY: 0, intent: "vertical-item-drag",
      stackId: item.stackId,
    });
  }, [applyCareItem, selectedCareItem]);

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId) return;
    const point = e;
    const gesture = itemGestureControllerRef.current.move(e.pointerId, e.clientX, e.clientY);
    if (!gesture) {
      cleanupItemGesture();
      return;
    }

    if (d.intent === "pending") {
      const intent = gesture.intent;
      if (intent === "pending") return;
      d.intent = intent;
      if (intent === "horizontal-scroll") {
        cleanupItemGesture();
        return;
      }
      playGrab();
      // Capture only after an intentional upward drag. Pending/horizontal
      // gestures stay with WebKit's native horizontal shelf scroller.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      capturedPointerRef.current = e.pointerId;
      suppressClickRef.current = true;
      recordPhase("vertical-drag-started");
      // Store the first drag position before mounting the ghost so it cannot
      // briefly render at the viewport origin.
      updateDragGhostPosition(point.clientX, point.clientY);
      setDragGhost(gesture.item);
    }
    if (d.intent !== "vertical-item-drag") return;
    e.preventDefault();
    updateDragGhostPosition(point.clientX, point.clientY);
    const box = petBoxRef.current?.getBoundingClientRect();
    const nextGlow = !!box && pointInsideExpandedPetDropZone({ x: point.clientX, y: point.clientY }, box);
    setPetGlow((current) => current === nextGlow ? current : nextGlow);
  }, [cleanupItemGesture, recordPhase, updateDragGhostPosition]);

  const onItemPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pid !== e.pointerId || !itemGestureControllerRef.current.consume(e.pointerId)) return;
    if (d.intent !== "vertical-item-drag") {
      // Pointer was released before drag intent was established (tap or scroll).
      cleanupItemGesture();
      return;
    }

    const point = e;
    const box = petBoxRef.current?.getBoundingClientRect();
    const validDrop = !!box && pointInsideExpandedPetDropZone({ x: point.clientX, y: point.clientY }, box, PET_CARE_DROP_PADDING_PX);
    scheduleTimeout(() => { suppressClickRef.current = false; }, 0);
    if (!validDrop) {
      cleanupItemGesture();
      return;
    }
    // Consume this release synchronously; React Query pending state is not a
    // sufficient same-frame duplicate guard.
    cleanupItemGesture();
    void applyCareItem(d);
  }, [applyCareItem, cleanupItemGesture, scheduleTimeout]);

  const onItemPointerCancel = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.pid !== e.pointerId) return;
    cleanupItemGesture();
  }, [cleanupItemGesture]);

  const submitFeedSelection = useCallback(async (itemInventoryId: string, quantity: number) => {
    if (isApplyingItemRef.current) return;
    const currentItem = inventory.find((entry) => entry?.id === itemInventoryId);
    const currentPet = inventory.find((entry) => entry?.id === pet?.inventoryId);
    if (!currentItem || Number(currentItem.quantity ?? 0) < quantity || quantity < 1) {
      toast({ title: "Item unavailable", description: "The selected stack has changed. Please try again." });
      setPendingFeed(null);
      return;
    }
    if (!currentPet || !currentPet.isHatched || !pet?.inventoryId) {
      toast({ title: "Pet unavailable", description: "Please reopen Pet Care and try again." });
      setPendingFeed(null);
      return;
    }
    isApplyingItemRef.current = true;
    if (mountedRef.current) setIsApplyingItem(true);
    try {
      interactionRef.current.itemType = "edibles";
      recordPhase("drop-attempt");
      recordPhase("mutation-started");
      await feedMutation.mutateAsync({ itemInventoryId, quantity });
      if (mountedRef.current) setPendingFeed(null);
    } catch (error) {
      // The mutation toast is player-facing; this catch owns the rejected
      // promise so stack-popup button handlers remain safe to fire-and-forget.
      logUnexpectedPetCareMutationError("stack-selection", error);
    } finally {
      cleanupItemGesture(true, mountedRef.current);
      isApplyingItemRef.current = false;
      if (mountedRef.current) setIsApplyingItem(false);
    }
  }, [cleanupItemGesture, feedMutation, inventory, pet?.inventoryId, recordPhase, toast]);

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 pet-care-overlay${dragEnabled && dragGhost ? " pet-care-overlay--item-dragging" : ""}`}
      style={{
        zIndex: 500,
        backgroundColor: "#0c1a10",
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 58%, rgba(0,0,0,0.38) 100%), url(${feedingPageBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px", margin: "0 auto", left: 0, right: 0,
        touchAction: "pan-x pan-y",
        overscrollBehavior: "contain",
      }}
      onPointerMove={dragEnabled ? onItemPointerMove : undefined}
      onPointerUp={dragEnabled ? onItemPointerUp : undefined}
      onPointerCancel={dragEnabled ? onItemPointerCancel : undefined}
      onLostPointerCapture={dragEnabled ? onItemPointerCancel : undefined}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      data-testid="overlay-feeding"
      data-pet-care-safe-mode={safeMode ? "true" : "false"}
      data-pet-care-drag-enabled={dragEnabled ? "true" : "false"}
      data-pet-care-emergency-input-fallback={emergencyInteractionFallback ? "true" : "false"}
      aria-busy={isApplyingItem}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-end gap-2 px-4 pt-4 pet-care-header" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
        <div className="flex items-center gap-2">
          {/* Coin balance chip — coins fly into this when collected. Hidden on standalone pet-care page. */}
          {!hideCoinDisplay && (
            <div
              ref={coinChipRef}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{
                background: "rgba(15,25,12,0.7)",
                border: "1px solid rgba(255,210,90,0.45)",
                backdropFilter: safeMode ? "none" : "blur(6px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
              }}
              data-testid="chip-feeding-coins"
            >
              <img src={coinIconImg} alt="coin" style={{ width: 18, height: 18, objectFit: "contain" }} />
              <span style={{ fontFamily: "Lora, serif", color: "#ffe49a", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }} data-testid="text-feeding-coins">
                {displayCoins.toLocaleString()}
              </span>
            </div>
          )}
          {/* Help / tutorial button */}
          <button
            onClick={() => { playClick(); setShowCareTutorial(true); }}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(15,25,12,0.75)",
              border: "1px solid rgba(180,255,160,0.4)",
              backdropFilter: safeMode ? "none" : "blur(6px)",
              color: "#dfffd0",
              fontFamily: "Lora, serif",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
            data-testid="button-care-help"
            aria-label="How to care for your pet"
          >?</button>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(15,25,12,0.75)",
              border: "1px solid rgba(180,255,160,0.4)",
              backdropFilter: safeMode ? "none" : "blur(6px)",
              color: "#dfffd0",
              fontFamily: "Lora, serif",
              fontWeight: 700,
              fontSize: 18,
              cursor: "pointer",
            }}
            data-testid="button-close-feeding"
            aria-label="Close feeding"
          >×</button>
        </div>
      </div>

      {/* Floating glowing orbs around the pet — pure decoration */}
      {!safeMode && [
        { left: "22%", top: "30%", size: 18, hue: "rgba(190,255,140,0.85)", delay: "0s",   dur: "4.2s" },
        { left: "78%", top: "32%", size: 14, hue: "rgba(255,220,140,0.85)", delay: "0.6s", dur: "5.1s" },
        { left: "16%", top: "55%", size: 10, hue: "rgba(150,230,255,0.8)",  delay: "1.2s", dur: "4.6s" },
        { left: "84%", top: "58%", size: 22, hue: "rgba(220,180,255,0.8)",  delay: "0.3s", dur: "5.4s" },
        { left: "30%", top: "20%", size: 8,  hue: "rgba(255,200,180,0.75)", delay: "1.8s", dur: "3.9s" },
      ].map((o, i) => (
        <div
          key={i}
          className="absolute pointer-events-none feed-orb-float"
          style={{
            left: o.left, top: o.top,
            width: o.size, height: o.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${o.hue} 0%, ${o.hue.replace(/0?\.\d+/, "0.05")} 70%, transparent 100%)`,
            boxShadow: `0 0 ${o.size * 1.6}px ${o.hue}`,
            animationDelay: o.delay,
            animationDuration: o.dur,
          }}
        />
      ))}

      {/* Mood occupies its own upper scene zone, independent of Hunger. */}
      <PetCareMoodMeter moodVal={moodVal} safeMode={safeMode} />

      {/* Pet centerpiece — drop target + click target */}
      <div
        ref={petBoxRef}
        className="absolute pet-care-pet"
        style={{
          width: "var(--pet-care-pet-size)",
          height: "var(--pet-care-pet-size)",
          cursor: "pointer",
          filter: safeMode ? "none" : petGlow
            ? "drop-shadow(0 0 32px rgba(190,255,160,1)) drop-shadow(0 0 14px rgba(255,220,120,0.85)) drop-shadow(0 6px 16px rgba(0,0,0,0.55))"
            : "drop-shadow(0 0 18px rgba(190,255,160,0.55)) drop-shadow(0 0 8px rgba(255,220,120,0.35)) drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
          transition: safeMode ? "none" : "filter 0.3s ease",
          outline: safeMode && selectedCareItem ? "1px solid rgba(255,215,0,0.6)" : "none",
          touchAction: "none",
        }}
        onPointerDown={onPetPointerDown}
        onPointerMove={onPetPointerMove}
        onPointerUp={endPetGesture}
        onPointerCancel={endPetGesture}
        onClick={!dragEnabled ? applySelectedCareItem : undefined}
        data-testid="drop-zone-feed-pet"
      >
        {/* Soft radial halo behind the pet */}
        {!safeMode && <div
          className="absolute inset-0 pointer-events-none feed-halo-pulse"
          style={{
            background:
              "radial-gradient(circle, rgba(190,255,160,0.22) 0%, rgba(190,255,160,0.06) 45%, transparent 70%)",
          }}
        />}
        <div
          className={
            petBounce ? "feed-pet-happy"
            : petCircling ? "pet-care-squish-bounce"
            : petPressed ? "pet-care-squish"
            // Default idle: NO outer squish wrapper. The active pet on the
            // home page (HomePage.tsx ~L931) renders the same <PetAnimator
            // mode="idle" /> with no extra outer animation, so its internal
            // body-breath / head-bob / shoulder / arm motions are the sole
            // source of motion. Pet Care used to layer .pet-idle-squish
            // (3.6 s scaleY/scaleX) on top, which beat against the
            // internal 4.5 s body breath at a different period and made
            // the idle look "off". Press / circle / happy interaction
            // states still get their own wrapper animations for tactile
            // feedback — only the at-rest idle is now identical to home.
            : ""
          }
          style={{ width: "100%", height: "100%" }}
        >
          {pet.petTemplateId ? (
            <PetAnimator
              petTemplateId={pet.petTemplateId}
              mode="idle"
              view="front"
              size={300}
              fillContainer
              performanceStatic={safeMode}
              expression={petBounce ? "happy" : (petPressed || petCircling) ? "petted" : "neutral"}
            />
          ) : (pet.hatchedImageUrl || pet.imageUrl) ? (
            <img
              src={pet.hatchedImageUrl ?? pet.imageUrl ?? ""}
              alt={pet.nickname ?? pet.name}
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
            />
          ) : null}
        </div>
      </div>

      {/* Decorative vertical meter retains the existing loyalty source of truth
          and reward action while clipping its fill beneath the artwork. */}
      <div className="pet-care-loyalty" data-testid="loyalty-meter">
        <span className="pet-care-loyalty__current" data-testid="text-loyalty-value">{loyaltyVal}</span>
        <PetCareAssetMeter
          orientation="vertical"
          frame={loyaltyMeterFrame}
          percentage={loyaltyPct}
          theme="loyalty"
          accessibleLabel={`Loyalty ${loyaltyVal} of ${loyaltyMax}`}
          testId="bar-loyalty"
          safeMode={safeMode}
        >
          <span className="pet-care-loyalty__maximum" aria-hidden="true">{loyaltyMax}</span>
        </PetCareAssetMeter>
        {loyaltyFull && (
          <button
            className="pet-care-loyalty__claim"
            data-testid="button-claim-loyalty"
            onClick={() => claimLoyaltyMutation.mutate()}
            disabled={claimLoyaltyMutation.isPending}
            title="Claim Loyalty Reward!"
          >
            <img src={loyaltyRewardIcon} alt="Claim loyalty reward" />
          </button>
        )}
      </div>

      {/* XP Boost activated celebration banner */}
      {boostActivated && (
        <>
          <div
            className="fixed pointer-events-none"
            style={{
              bottom: "38%",
              left: "50%",
              zIndex: 520,
              animation: "boost-pop-in 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}
          >
            <div style={{
              padding: "8px 20px",
              borderRadius: 999,
              background: "linear-gradient(135deg, rgba(50,36,4,0.97) 0%, rgba(70,52,6,0.95) 100%)",
              border: "1.5px solid rgba(250,200,60,0.7)",
              boxShadow: "0 0 24px rgba(250,200,60,0.5), 0 0 48px rgba(250,200,60,0.2), 0 4px 16px rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}>
              <span style={{ fontSize: 18 }}>⚡✨⚡</span>
              <span style={{
                fontFamily: "Lora, serif",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.18em",
                color: "#fde68a",
                textShadow: "0 0 12px rgba(250,200,60,1), 0 1px 4px rgba(0,0,0,0.9)",
                whiteSpace: "nowrap",
              }}>
                XP BOOST ACTIVE!
              </span>
              <span style={{
                fontFamily: "Lora, serif",
                fontSize: 9,
                letterSpacing: "0.1em",
                color: "rgba(253,230,138,0.7)",
                whiteSpace: "nowrap",
              }}>
                +{(livePet as any).xpBoostPct ?? 0}% for 1 hour
              </span>
            </div>
          </div>
        </>
      )}

      {/* Floating heart layer — appears when the pet is clicked or fed */}
      {!safeMode && hearts.map((h) => (
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
            zIndex: 514,
            color: "#ff5d6c",
          }}
        >
          <svg viewBox="0 0 24 24" width={h.size} height={h.size}>
            <defs>
              <radialGradient id={`hg${h.id}`} cx="35%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#ffb3bb" />
                <stop offset="55%" stopColor="#ff5d6c" />
                <stop offset="100%" stopColor="#a8112a" />
              </radialGradient>
            </defs>
            <path
              d="M12 21s-7.5-4.6-9.6-9.4C1.1 8.4 3 5 6.3 5c1.9 0 3.6 1 4.7 2.6C12.1 6 13.8 5 15.7 5 19 5 20.9 8.4 19.6 11.6 17.5 16.4 12 21 12 21z"
              fill={`url(#hg${h.id})`}
              stroke="#7a0a1c"
              strokeWidth="0.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}

      {/* Sparkle burst layer */}
      {!safeMode && sparkles.map((s) => (
        <div
          key={s.id}
          className="fixed pointer-events-none feed-sparkle"
          style={{
            left: s.cx,
            top: s.cy,
            width: s.size,
            height: s.size,
            // CSS variables consumed by the `feed-sparkle` keyframe.
            ["--dx" as any]: `${s.dx}px`,
            ["--dy" as any]: `${s.dy}px`,
            ["--rot" as any]: `${s.rot}deg`,
            zIndex: 515,
          }}
        >
          <svg viewBox="0 0 24 24" width={s.size} height={s.size}>
            <defs>
              <radialGradient id={`g${s.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fffbe0" stopOpacity="1" />
                <stop offset="60%" stopColor="#ffd966" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#c98a00" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d="M12 2 L13.6 9.5 L21 11 L13.6 12.6 L12 22 L10.4 12.6 L3 11 L10.4 9.5 Z"
              fill={`url(#g${s.id})`}
            />
          </svg>
        </div>
      ))}

      {/* Floating feedback text */}
      {floatTexts.map((f) => (
        <div
          key={f.id}
          className="fixed pointer-events-none feed-float-up"
          style={{
            left: f.x,
            top: f.y,
            transform: "translate(-50%, -50%)",
            fontFamily: "Lora, serif",
            fontWeight: 800,
            fontSize: 22,
            color: "#c8ff90",
            textShadow: safeMode ? "none" : "0 2px 8px rgba(0,0,0,0.8), 0 0 12px rgba(190,255,140,0.7)",
            zIndex: 510,
          }}
        >
          {f.text}
        </div>
      ))}

      {/* Petting reward — spinning coins. Tap to collect; each one flies into
          the coin chip up top with a +1 bump. */}
      {rewardCoins.map((c) => {
        // c.cx/c.cy are stage-local (see clampToFrame); convert the chip's
        // viewport rect to stage-local too so the fly-in delta is correct on
        // every device.
        const chipBox = coinChipRef.current?.getBoundingClientRect();
        const target = chipBox
          ? clientToStage(chipBox.left + chipBox.width / 2, chipBox.top + chipBox.height / 2)
          : { x: c.cx, y: c.cy - 200 };
        const tx = target.x - c.cx;
        const ty = target.y - c.cy;
        return (
          <button
            key={c.id}
            onClick={() => !c.flying && collectCoin(c.id)}
            className={c.flying ? "fixed care-coin care-coin-fly" : "fixed care-coin care-coin-spin"}
            style={{
              left: c.cx,
              top: c.cy,
              transform: "translate(-50%, -50%)",
              width: 38,
              height: 38,
              padding: 0,
              border: "none",
              background: "transparent",
              WebkitTapHighlightColor: "transparent",
              outline: "none",
              cursor: c.flying ? "default" : "pointer",
              zIndex: 520,
              ["--care-coin-tx" as any]: `${tx}px`,
              ["--care-coin-ty" as any]: `${ty}px`,
              ["--care-coin-pop-x" as any]: `${c.popX ?? 0}px`,
              ["--care-coin-pop-y" as any]: `${c.popY ?? -14}px`,
              ["--care-coin-pop-delay" as any]: `${c.popDelay ?? 0}s`,
              ["--care-coin-spin-dur" as any]: `${c.spinDur ?? 1.2}s`,
              ["--care-coin-spin-delay" as any]: `${c.spinDelay ?? 0}s`,
            }}
            data-testid={`button-care-coin-${c.id}`}
            aria-label="Collect coin"
          >
            <img
              src={coinIconImg}
              alt="coin"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                pointerEvents: "none",
              }}
            />
          </button>
        );
      })}

      {/* Care tutorial overlay */}
      {showCareTutorial && (
        <div
          className="absolute inset-0 z-[600] flex items-center justify-center px-5"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(2px)" }}
          onClick={() => setShowCareTutorial(false)}
          data-testid="overlay-care-tutorial"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl px-5 py-6 flex flex-col gap-4 animate-slide-up"
            style={{
              background: "linear-gradient(160deg, rgba(8,18,10,0.98) 0%, rgba(5,12,7,0.98) 100%)",
              border: "1.5px solid rgba(180,255,160,0.45)",
              boxShadow: "0 0 50px rgba(120,200,120,0.15), 0 8px 32px rgba(0,0,0,0.7)",
              maxHeight: "calc(85*var(--vh))",
              overflowY: "auto",
            }}
          >
            <button
              onClick={() => setShowCareTutorial(false)}
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: "rgba(20,40,20,0.85)",
                border: "1.5px solid rgba(180,255,160,0.35)",
                color: "rgba(200,255,180,0.85)",
                cursor: "pointer",
              }}
              data-testid="button-close-care-tutorial"
            >×</button>
            <p className="font-fantasy text-center text-base tracking-wider" style={{ color: "#c8ff90", paddingRight: 24 }}>
              Caring for your pet
            </p>
            <div className="flex flex-col gap-3" style={{ fontFamily: "Lora, serif" }}>
              <div className="pb-3" style={{ borderBottom: "1px solid rgba(180,255,160,0.15)" }}>
                <p style={{ color: "#c8ff90", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>FEED</p>
                <p style={{ color: "#aac8a0", fontSize: 11, lineHeight: 1.55 }}>
                      {dragEnabled ? "Drag any edible from the bottom strip onto your pet to fill its hunger meter and lift its mood. You can also tap an item, then tap your pet." : "Tap an edible, then tap your pet to fill its hunger meter and lift its mood."}
                </p>
              </div>
              <div className="pb-3" style={{ borderBottom: "1px solid rgba(180,255,160,0.15)" }}>
                <p style={{ color: "#c8ff90", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>PET</p>
                <p style={{ color: "#aac8a0", fontSize: 11, lineHeight: 1.55 }}>
                  Press and hold your pet, then move your finger in small circles to cuddle it. It will bounce happily and shower hearts.
                </p>
              </div>
              <div>
                <p style={{ color: "#ffd866", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>DAILY COINS</p>
                <p style={{ color: "#aac8a0", fontSize: 11, lineHeight: 1.55 }}>
                  Properly petting your pet will scatter <strong style={{ color: "#ffd866" }}>coins</strong> around it. Tap each coin to add it to your balance — the more you pet, the more coins you can find!
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCareTutorial(false)}
              className="py-2.5 rounded-full transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(40,80,40,0.9) 0%, rgba(20,50,20,0.9) 100%)",
                border: "1px solid rgba(180,255,160,0.5)",
                color: "#c8ff90",
                fontFamily: "Lora, serif",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: "0.18em",
                cursor: "pointer",
              }}
              data-testid="button-got-it-care-tutorial"
            >GOT IT</button>
          </div>
        </div>
      )}

      {/* ── Bottom item strip — edibles + gifts ──────────────────────────── */}
      {/* Items are compact image-only chips (no card boxes) that scroll
          horizontally. Swipe left/right to browse; drag upward to feed/gift
          the pet. The strip is capped so it never overlaps the status bars. */}
      <div
        className="absolute left-0 right-0 pet-care-inventory-section"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
          background: "linear-gradient(0deg, rgba(6,14,6,0.78) 0%, rgba(6,14,6,0.3) 70%, rgba(6,14,6,0) 100%)",
          paddingTop: 12,
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        {/* Hunger shares the inventory column's normal flow, guaranteeing a
            stable gap above the shelf at every phone height. */}
        <PetCareHungerMeter
          hungerVal={hungerVal}
          hungerMax={maxHunger}
          hungerPct={hungerPct}
          xpBoostActive={!!(livePet as any).xpBoostUntil && new Date((livePet as any).xpBoostUntil).getTime() > Date.now()}
          xpBoostPct={(livePet as any).xpBoostPct ?? 0}
          safeMode={safeMode}
        />
        <PetCareItemShelf kind="edibles" items={edibles} onItemPointerDown={onItemPointerDown} onItemClick={selectCareItem} selectedStackId={selectedCareItem?.stackId ?? null} draggingStackId={dragGhost?.stackId ?? null} safeMode={safeMode} dragEnabled={dragEnabled} />
        <PetCareItemShelf kind="gifts" items={gifts} onItemPointerDown={onItemPointerDown} onItemClick={selectCareItem} selectedStackId={selectedCareItem?.stackId ?? null} draggingStackId={dragGhost?.stackId ?? null} safeMode={safeMode} dragEnabled={dragEnabled} />
      </div>

      {/* ── Feed hint overlay ───────────────────────────────────────────────
          Shown when the player arrives via the "Feed Active Pet" quest GO
          button. Points to the edibles strip (or offers a Buy Edibles link).
          Tap anywhere outside the card to dismiss.                         */}
      {showFeedHint && (
        <>
          {/* Dismiss layer */}
          <div
            className="absolute inset-0"
            style={{ zIndex: 598, cursor: "pointer" }}
            onClick={() => setShowFeedHint(false)}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 145px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 599,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
            }}
          >
            {edibles.length > 0 ? (
              <>
                {/* Tooltip bubble */}
                <div style={{
                  background: "rgba(8,22,8,0.94)",
                  border: "1.5px solid rgba(74,222,128,0.7)",
                  borderRadius: 10,
                  padding: "7px 16px",
                  boxShadow: "0 0 16px rgba(34,197,94,0.4), 0 4px 12px rgba(0,0,0,0.6)",
                }}>
                  <span style={{ fontFamily: "Lora, serif", color: "#86efac", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {dragEnabled ? "Drag edible onto pet (or tap both)" : "Tap edible, then pet"}
                  </span>
                </div>
                {/* Arrow — pointing down toward edibles strip */}
                <img
                  src={tutorialArrow}
                  alt=""
                  style={{
                    width: 40, height: 50, objectFit: "contain",
                    animation: "feedHintFloat 1.2s ease-in-out infinite",
                    filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))",
                  }}
                />
              </>
            ) : (
              /* No edibles — Buy Edibles card */
              <div
                style={{
                  background: "rgba(8,22,8,0.96)",
                  border: "1.5px solid rgba(74,222,128,0.6)",
                  borderRadius: 12,
                  padding: "16px 22px",
                  boxShadow: "0 0 24px rgba(34,197,94,0.35), 0 6px 20px rgba(0,0,0,0.65)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  pointerEvents: "auto",
                }}
              >
                <span style={{ fontFamily: "Lora, serif", color: "#d1fae5", fontSize: 13, fontWeight: 700, letterSpacing: "0.03em" }}>
                  You have no edibles!
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFeedHint(false);
                    navigate("/world/swamp?shopHint=a1b2c3d4-0010-4000-8000-000000000010");
                  }}
                  style={{
                    background: "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)",
                    border: "1px solid rgba(100,220,100,0.6)",
                    color: "#dcfce7",
                    fontFamily: "Lora, serif",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    borderRadius: 8,
                    padding: "8px 22px",
                    boxShadow: "0 0 12px rgba(60,180,60,0.4)",
                  }}
                >
                  Buy Edibles
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Drag ghost */}
      {dragEnabled && dragGhost && createPortal(
        <div
          ref={dragGhostRef}
          className="pet-care-drag-ghost"
          aria-hidden="true"
          style={{
            left: 0,
            top: 0,
            width: PET_CARE_DRAG_GHOST_SIZE_PX,
            height: PET_CARE_DRAG_GHOST_SIZE_PX,
            zIndex: 10060,
            opacity: 1,
            transform: getPetCareDragGhostTransform(dragPositionRef.current.x, dragPositionRef.current.y),
          }}
        >
          {dragGhost.imageUrl && <img className="pet-care-drag-ghost__image" src={dragGhost.imageUrl} alt="" draggable={false} />}
          {dragGhost.type === "edibles" && dragGhost.statBoostAmount != null && <span className="pet-care-drag-ghost__value">+{dragGhost.statBoostAmount}</span>}
          {dragGhost.type === "gift" && !!dragGhost.giftPoints && <span className="pet-care-drag-ghost__value">+{dragGhost.giftPoints}</span>}
          {dragGhost.displayQuantity > 1 && <span className="pet-care-drag-ghost__quantity">×{dragGhost.displayQuantity}</span>}
        </div>, getStagePortalTarget(),
      )}

      {/* Feed-stack popup */}
      {pendingFeed && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 540, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="overlay-feed-stack"
        >
          <div style={{
            background: "linear-gradient(160deg, rgba(8,24,8,0.99) 0%, rgba(12,30,12,0.99) 100%)",
            border: "1.5px solid rgba(74,222,128,0.45)",
            borderRadius: 18,
            padding: "24px 22px 20px",
            width: "82%",
            maxWidth: 300,
            boxShadow: "0 0 40px rgba(34,197,94,0.2), 0 12px 40px rgba(0,0,0,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}>
            {/* Item preview */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {pendingFeed.imageUrl && (
                <img
                  src={pendingFeed.imageUrl}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "contain", filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.7))" }}
                />
              )}
              <div style={{ textAlign: "center" }}>
                <span style={{ fontFamily: "Lora, serif", color: "#d1fae5", fontSize: 14, fontWeight: 700 }}>
                  {pendingFeed.name}
                </span>
                <span style={{ fontFamily: "Lora, serif", color: "rgba(159,214,144,0.55)", fontSize: 12, marginLeft: 6 }}>
                  ×{pendingFeed.quantity}
                </span>
              </div>
              <span style={{ fontFamily: "Lora, serif", color: "rgba(159,214,144,0.45)", fontSize: 10 }}>
                +{pendingFeed.statBoostAmount} hunger per item
              </span>
            </div>

            {!divideMode ? (
              <>
                <span style={{ fontFamily: "Lora, serif", color: "rgba(209,250,229,0.5)", fontSize: 11, textAlign: "center", letterSpacing: "0.02em" }}>
                  Feed the whole stack or choose an amount?
                </span>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <button
                    data-testid="button-feed-all"
                    onClick={() => void submitFeedSelection(pendingFeed.inventoryId, pendingFeed.quantity)}
                    disabled={isApplyingItem}
                    style={{
                      flex: 1,
                      background: "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)",
                      border: "1px solid rgba(100,220,100,0.55)",
                      color: "#dcfce7",
                      fontFamily: "Lora, serif",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.07em",
                      cursor: "pointer",
                      borderRadius: 10,
                      padding: "11px 6px",
                      boxShadow: "0 0 12px rgba(50,180,50,0.25)",
                    }}
                  >
                    FEED ALL
                  </button>
                  <button
                    data-testid="button-divide"
                    onClick={() => { setDivideMode(true); setDivideInput("1"); }}
                    style={{
                      flex: 1,
                      background: "rgba(30,60,30,0.7)",
                      border: "1px solid rgba(100,200,100,0.3)",
                      color: "#9fd690",
                      fontFamily: "Lora, serif",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      cursor: "pointer",
                      borderRadius: 10,
                      padding: "11px 6px",
                    }}
                  >
                    DIVIDE
                  </button>
                </div>
                <button
                  data-testid="button-cancel-feed"
                  onClick={() => setPendingFeed(null)}
                  style={{ background: "none", border: "none", color: "rgba(159,214,144,0.3)", fontFamily: "Lora, serif", fontSize: 10, cursor: "pointer", padding: "4px 0 0", letterSpacing: "0.05em" }}
                >
                  cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ fontFamily: "Lora, serif", color: "rgba(209,250,229,0.5)", fontSize: 11, textAlign: "center" }}>
                  How many to feed? (1 – {pendingFeed.quantity})
                </span>
                <input
                  type="number"
                  min={1}
                  max={pendingFeed.quantity}
                  value={divideInput}
                  onChange={(e) => setDivideInput(e.target.value)}
                  data-testid="input-divide-amount"
                  style={{
                    width: "100%",
                    background: "rgba(15,35,15,0.9)",
                    border: "1.5px solid rgba(100,200,100,0.45)",
                    borderRadius: 10,
                    color: "#d1fae5",
                    fontFamily: "Lora, serif",
                    fontSize: 22,
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "10px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
                {(() => {
                  const n = Math.min(pendingFeed.quantity, Math.max(1, Math.floor(Number(divideInput) || 1)));
                  const pts = pendingFeed.statBoostAmount * n;
                  return (
                    <span style={{ fontFamily: "Lora, serif", color: "rgba(159,214,144,0.5)", fontSize: 10 }}>
                      +{pts} hunger total
                    </span>
                  );
                })()}
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <button
                    data-testid="button-confirm-divide"
                    onClick={() => {
                      const n = Math.min(pendingFeed.quantity, Math.max(1, Math.floor(Number(divideInput) || 1)));
                      void submitFeedSelection(pendingFeed.inventoryId, n);
                    }}
                    disabled={isApplyingItem}
                    style={{
                      flex: 2,
                      background: "linear-gradient(135deg, #1a5c1a 0%, #2d8c2d 100%)",
                      border: "1px solid rgba(100,220,100,0.55)",
                      color: "#dcfce7",
                      fontFamily: "Lora, serif",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.07em",
                      cursor: "pointer",
                      borderRadius: 10,
                      padding: "11px 6px",
                      boxShadow: "0 0 12px rgba(50,180,50,0.25)",
                    }}
                  >
                    FEED {Math.min(pendingFeed.quantity, Math.max(1, Math.floor(Number(divideInput) || 1)))}
                  </button>
                  <button
                    data-testid="button-back-divide"
                    onClick={() => setDivideMode(false)}
                    style={{
                      flex: 1,
                      background: "rgba(30,60,30,0.7)",
                      border: "1px solid rgba(100,200,100,0.3)",
                      color: "#9fd690",
                      fontFamily: "Lora, serif",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      borderRadius: 10,
                      padding: "11px 6px",
                    }}
                  >
                    BACK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
