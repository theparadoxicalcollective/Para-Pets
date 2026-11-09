/**
 * WalkAroundScene — reusable walk-around explore scene.
 *
 * Renders a full-screen gameplay area with:
 *   - A background image (preserves aspect ratio via object-contain with a
 *     colour-matched fill so the portrait image never stretches)
 *   - The saved player avatar walking within existing scene bounds (or the
 *     legacy pet sprite when an account has not created a character yet)
 *   - On-screen joystick (touch/mobile) + keyboard + click-to-move (desktop)
 *   - A back button that returns to the world map
 *
 * All movement logic lives in usePetWalkController (separate, reusable hook).
 * Scene-specific constants (bounds, spawn, speed) come from WalkAroundLocationConfig.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimator from "@/components/PetAnimator";
import FloatingWalkJoystick, {
  FLOATING_WALK_JOYSTICK_SIZE,
  FLOATING_WALK_JOYSTICK_EDGE_GAP,
} from "@/components/FloatingWalkJoystick";
import PlayerCharacterRenderer from "@/components/PlayerCharacterRenderer";
import {
  PLAYER_AVATAR_QUERY_KEY,
  fetchPlayerAvatar,
  wardrobeLayers,
  type PlayerAvatarState,
} from "@/lib/playerAvatarWardrobe";
import ElysianClearingCombat from "@/components/ElysianClearingCombat";
import { usePetWalkController } from "@/hooks/usePetWalkController";
import { type WalkAroundLocationConfig } from "@/lib/exploreLocations";
import { cameraTarget, clearingWorldSize, insetMovementBounds } from "@/lib/elysianClearingCombatMath";
import { clearingPetSize, CLEARING_PET_PRESENTATION } from "@/lib/clearingPetPresentation";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import WorldLoadingScreen from "@/components/WorldLoadingScreen";

const DEFAULT_PET_SIZE = 110;

interface WalkAroundSceneProps {
  config: WalkAroundLocationConfig;
  /** petTemplateId from the active pet inventory item; null = no pet. */
  petTemplateId: string | null;
  activePet?: any;
  /** Signed-in account whose saved avatar is visible (combat pet stays separate). */
  userId?: string;
  /** Called when the player taps the back button. */
  onBack: () => void;
  isAdmin?: boolean;
}

export default function WalkAroundScene({ config, petTemplateId, activePet, userId, onBack, isAdmin=false }: WalkAroundSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [hudElement, setHudElement] = useState<HTMLDivElement | null>(null);
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });
  // Use the actual camera on the first frame so spawn/bounds aren't clamped
  // against a temporary 1px geometry before ResizeObserver measures the scene.
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1 : Math.max(1, window.innerWidth),
    height: typeof window === "undefined" ? 1 : Math.max(1, window.innerHeight),
  }));
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [gameplayBlocked, setGameplayBlocked] = useState(false);
  const [specialReady, setSpecialReady] = useState(false);
  const activePetInventoryId: string | null = typeof activePet?.inventoryId === "string" ? activePet.inventoryId : null;
  // Visual identity is owned by the player, not by the featured combat pet.
  // Reuse Home/wardrobe's account-scoped query and existing eight-part renderer.
  const avatarQuery = useQuery<PlayerAvatarState>({
    queryKey: [...PLAYER_AVATAR_QUERY_KEY, userId],
    queryFn: ({ signal }) => fetchPlayerAvatar(signal),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const walkingAvatar = avatarQuery.data?.created === true &&
    Array.isArray(avatarQuery.data.base?.parts) &&
    avatarQuery.data.base.parts.length === 8 ? avatarQuery.data : null;
  // On a first visit avoid briefly flashing a pet before the avatar read.
  // Accounts without a created avatar retain their legacy walking pet.
  const showLegacyPet = !userId || avatarQuery.isError ||
    (avatarQuery.isSuccess && !walkingAvatar);
  const showActor = !!walkingAvatar || (showLegacyPet && !!petTemplateId);
  const equippedLayers = useMemo(
    () => walkingAvatar ? wardrobeLayers(walkingAvatar) : [],
    [walkingAvatar],
  );
  const [clearingReady, setClearingReady] = useState(!config.features.combat);
  const [loadingComplete, setLoadingComplete] = useState(!config.features.combat);

  useEffect(() => {
    if (!config.features.combat) return;
    // A real combat companion triggers a new bounded loading/session cycle.
    // Without one, no combat session exists: don't trap an avatar-only visitor
    // behind an unfinishable Clearing loader.
    if (activePetInventoryId && petTemplateId) {
      setClearingReady(false);
      setLoadingComplete(false);
    } else {
      setClearingReady(true);
      setLoadingComplete(true);
    }
    setSpecialReady(false);
  }, [activePetInventoryId, petTemplateId, config.features.combat]);

  const responsivePet = config.aspectLayout?.responsivePet;
  const petSize = responsivePet ? clearingPetSize(viewport) : (config.petSize ?? DEFAULT_PET_SIZE);
  const gameplayPetSize = config.petSize ?? DEFAULT_PET_SIZE;
  const world = config.aspectLayout ? clearingWorldSize(viewport, config.aspectLayout.imageAspect) : { width: viewport.width * (config.worldSize?.width ?? 1), height: viewport.height * (config.worldSize?.height ?? 1) };
  const movementBounds = config.aspectLayout ? insetMovementBounds(config.walkableBounds, world, gameplayPetSize, CLEARING_PET_PRESENTATION.feetAnchor, CLEARING_PET_PRESENTATION.visualHalfWidthRatio) : config.walkableBounds;
  const {
    petPos,
    facingLeft,
    aimDirection,
    isMoving,
    isJoystickActive,
    joystickOffset,
    onJoystickPointerDown,
    onJoystickPointerMove,
    onJoystickPointerUp,
    resetPosition,
  } = usePetWalkController({
    bounds: movementBounds,
    spawn:  config.spawnPoint,
    speed:  config.movementSpeed,
    enabled: config.features.movement && !gameplayBlocked,
  });

  const { data: petTemplate } = useQuery<{ facing: string }>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pet template");
      return res.json();
    },
    enabled: !!petTemplateId && !walkingAvatar,
    staleTime: Infinity,
  });

  // Side-profile templates saved in the back view are drawn left by convention.
  const naturalFacingLeft = petTemplate?.facing === "left" || petTemplate?.facing === "back";

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!config.features.movement || gameplayBlocked || !sceneRef.current ||
        !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-interactive]")) return;
    e.preventDefault();
    const rect = sceneRef.current.getBoundingClientRect();
    // Convert through this scene's actual rendered rectangle, not the global
    // legacy stage scale. This also works if the scene is CSS-transformed.
    const logicalWidth = sceneRef.current.clientWidth || rect.width;
    const logicalHeight = sceneRef.current.clientHeight || rect.height;
    const scaleX = rect.width / Math.max(1, logicalWidth);
    const scaleY = rect.height / Math.max(1, logicalHeight);
    const radius = FLOATING_WALK_JOYSTICK_SIZE / 2;
    const inset = radius + FLOATING_WALK_JOYSTICK_EDGE_GAP;
    const pointerX = (e.clientX - rect.left) / scaleX;
    const pointerY = (e.clientY - rect.top) / scaleY;
    // Keep the small visual inside narrow viewports, but start movement from
    // the ACTUAL touch rather than the clamped artwork center near an edge.
    const x = Math.max(inset, Math.min(Math.max(inset, logicalWidth - inset), pointerX));
    const y = Math.max(inset, Math.min(Math.max(inset, logicalHeight - inset), pointerY));
    setJoystickCenter({ x, y });
    onJoystickPointerDown(e, { x: e.clientX, y: e.clientY });
  }, [config.features.movement, gameplayBlocked, onJoystickPointerDown]);

  useEffect(() => {
    const measure = () => sceneRef.current && setViewport({ width: sceneRef.current.clientWidth || 1, height: sceneRef.current.clientHeight || 1 });
    measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    let raf = 0;
    const target = cameraTarget(petPos, world, viewport);
    const tick = () => { setCamera(current => { const next = { x: current.x + (target.x-current.x)*.16, y: current.y + (target.y-current.y)*.16 }; return Math.abs(next.x-current.x)+Math.abs(next.y-current.y)<.1 ? target : next; }); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [petPos.x, petPos.y, world.width, world.height, viewport.width, viewport.height]);

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: "none", background: "#0a120a" }}
      onPointerDown={handlePointerDown}
      onPointerMove={onJoystickPointerMove}
      onPointerUp={onJoystickPointerUp}
      onPointerCancel={onJoystickPointerUp}
      onLostPointerCapture={onJoystickPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {config.aspectLayout && (
        <img
          aria-hidden
          src={config.backgroundUrl}
          draggable={false}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md pointer-events-none"
        />
      )}
      <div
        ref={worldRef}
        data-testid="walkaround-world-layer"
        className="absolute left-0 top-0 cursor-pointer"
        style={{width:world.width,height:world.height,transform:`translate3d(${-camera.x}px, ${-camera.y}px, 0)`,willChange:"transform"}}
      >
        <img
          src={config.backgroundUrl}
          alt={config.name}
          draggable={false}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: config.aspectLayout ? "contain" : "cover", objectPosition: "center", pointerEvents: "none", userSelect: "none" }}
        />


      {/* One camera/world coordinate owner for either avatar or legacy pet.
          The combat session keeps its old pet ID, stats, targeting and timing. */}
      {showActor && (
        <div
          data-testid="walk-world-actor"
          data-walk-actor={walkingAvatar ? "avatar" : "pet"}
          className="absolute pointer-events-none"
          style={{
            left: `${petPos.x * 100}%`,
            top: `${petPos.y * 100}%`,
            width: walkingAvatar ? Math.round(petSize * 1.18) : petSize,
            height: walkingAvatar ? Math.round(petSize * 1.18) : petSize,
            transform: `translate(-50%, -${(walkingAvatar ? 0.94 : CLEARING_PET_PRESENTATION.feetAnchor) * 100}%)`,
            zIndex: worldYToDepth(petPos.y),
            transition: "none",
          }}
        >
          {walkingAvatar?.base ? (
            <div data-testid="walk-avatar-actor"
              className={`relative h-full w-full ${specialReady ? "clearing-avatar-special-ready" : ""}`}
              style={{ transform: `scaleX(${facingLeft ? -1 : 1})` }}>
              <PlayerCharacterRenderer
                parts={walkingAvatar.base.parts}
                clothingLayers={equippedLayers}
                motion={isMoving ? "walk" : "idle"}
                ariaLabel="Your player avatar exploring the clearing"
              />
            </div>
          ) : petTemplateId ? (
            <div data-testid="walk-pet-sprite"
              className={`clearing-pet-presentation ${isMoving ? "is-moving" : ""} ${specialReady ? "is-special-ready" : ""}`}
              style={{ transform: `scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})` }}>
              <PetAnimator petTemplateId={petTemplateId}
                petInventoryId={activePetInventoryId ?? undefined}
                mode="static" size={petSize} fitVisible />
            </div>
          ) : null}
        </div>
      )}

      {config.features.combat && petTemplateId && activePetInventoryId && (
        <ElysianClearingCombat key={activePetInventoryId} activePetInventoryId={activePetInventoryId} petPos={petPos} petSize={petSize} activePet={activePet} facingLeft={facingLeft} aimDirection={aimDirection} onReturnToWorld={onBack} worldPixels={world} hudElement={hudElement} onGameplayBlockedChange={setGameplayBlocked} onEnemiesReady={() => setClearingReady(true)} onSpecialReadyChange={setSpecialReady} isAdmin={isAdmin} />
      )}
      </div>

      <div ref={setHudElement} data-testid="walkaround-hud-layer" className="absolute inset-0 pointer-events-none" style={{zIndex:3000}}>
      <button data-interactive data-testid="button-back-walkaround" onClick={onBack} className="absolute pointer-events-auto h-11 px-3 rounded-xl text-xs" style={{top:"max(12px, env(safe-area-inset-top, 0px))",left:14,background:"rgba(0,0,0,.65)",border:"1px solid rgba(255,255,255,.18)",color:"#f0e8c8"}}>‹ Back</button>
      {config.showSceneTitle!==false&&<div data-testid="walkaround-scene-title" className="absolute top-0 left-0 right-0 flex justify-center" style={{paddingTop:"max(14px, env(safe-area-inset-top, 14px))",color:"#dcffc8cc"}}>{config.name}</div>}

      {/* Visible only during a valid movement touch, never an always-on overlay.
          Every walk-enabled scene reuses this exact visual/controller pairing. */}
      {config.features.movement && isJoystickActive && (
        <FloatingWalkJoystick center={joystickCenter} offset={joystickOffset} />
      )}
      </div>

      {/* ── Bottom gradient (readability for joystick) ───────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "22%",
          background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)",
          zIndex: 4,
        }}
      />
      {config.features.combat && !activePetInventoryId && (
        <div data-testid="clearing-featured-pet-notice" role="status"
          className="absolute left-1/2 top-16 -translate-x-1/2 rounded-xl px-3 py-2 text-center text-xs"
          style={{maxWidth:"min(90%,330px)",zIndex:3001,color:"#f4dfaa",
            background:"rgba(12,36,23,.92)",border:"1px solid #b79c5c",pointerEvents:"none"}}>
          Choose a hatched Featured Companion in Bag to enter Clearing combat.
        </div>
      )}
      {!loadingComplete && activePetInventoryId && petTemplateId && (
        <div className="absolute inset-0" style={{zIndex:5000}}>
          <WorldLoadingScreen worldId="elysian_clearing" bgUrl={config.backgroundUrl}
            pageReady={clearingReady} onReady={() => setLoadingComplete(true)} />
        </div>
      )}
    </div>
  );
}

