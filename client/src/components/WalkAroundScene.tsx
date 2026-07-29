/**
 * WalkAroundScene — reusable walk-around explore scene.
 *
 * Renders a full-screen gameplay area with:
 *   - A background image (preserves aspect ratio via object-contain with a
 *     colour-matched fill so the portrait image never stretches)
 *   - The player's active pet walking inside an editable walkable boundary
 *   - On-screen joystick (touch/mobile) + keyboard + click-to-move (desktop)
 *   - A back button that returns to the world map
 *
 * All movement logic lives in usePetWalkController (separate, reusable hook).
 * Scene-specific constants (bounds, spawn, speed) come from WalkAroundLocationConfig.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimator from "@/components/PetAnimator";
import ElysianClearingCombat from "@/components/ElysianClearingCombat";
import { usePetWalkController } from "@/hooks/usePetWalkController";
import type { WalkAroundLocationConfig } from "@/lib/exploreLocations";
import { cameraTarget, clearingWorldSize, insetMovementBounds } from "@/lib/elysianClearingCombatMath";
import { clearingPetSize, CLEARING_PET_PRESENTATION } from "@/lib/clearingPetPresentation";
import { worldYToDepth } from "@/lib/clearingWorldPresentation";
import WorldLoadingScreen from "@/components/WorldLoadingScreen";

const DEFAULT_PET_SIZE = 110;
const JOYSTICK_SIZE = 90;
const JOYSTICK_EDGE_GAP = 8;

interface WalkAroundSceneProps {
  config: WalkAroundLocationConfig;
  /** petTemplateId from the active pet inventory item; null = no pet. */
  petTemplateId: string | null;
  activePet?: any;
  /** Called when the player taps the back button. */
  onBack: () => void;
}

export default function WalkAroundScene({ config, petTemplateId, activePet, onBack }: WalkAroundSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [hudElement, setHudElement] = useState<HTMLDivElement | null>(null);
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 390, height: 844 });
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [gameplayBlocked, setGameplayBlocked] = useState(false);
  const [clearingReady, setClearingReady] = useState(!config.features.combat || !petTemplateId);
  const [loadingComplete, setLoadingComplete] = useState(!config.features.combat);

  const responsivePet = config.aspectLayout?.responsivePet;
  const petSize = responsivePet ? clearingPetSize(viewport) : (config.petSize ?? DEFAULT_PET_SIZE);
  const gameplayPetSize = config.petSize ?? DEFAULT_PET_SIZE;
  const world = config.aspectLayout ? clearingWorldSize(viewport, config.aspectLayout.imageAspect) : { width: viewport.width * (config.worldSize?.width ?? 1), height: viewport.height * (config.worldSize?.height ?? 1) };
  const movementBounds = config.aspectLayout ? insetMovementBounds(config.walkableBounds, world, gameplayPetSize, CLEARING_PET_PRESENTATION.feetAnchor, CLEARING_PET_PRESENTATION.visualHalfWidthRatio) : config.walkableBounds;
  const {
    petPos,
    facingLeft,
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
    enabled: !gameplayBlocked,
  });

  const { data: petTemplate } = useQuery<{ facing: string }>({
    queryKey: ["/api/pet-template-parts", petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pet template");
      return res.json();
    },
    enabled: !!petTemplateId,
    staleTime: Infinity,
  });

  // Side-profile templates saved in the back view are drawn left by convention.
  const naturalFacingLeft = petTemplate?.facing === "left" || petTemplate?.facing === "back";

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (gameplayBlocked || !sceneRef.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-interactive]")) return;
    e.preventDefault();
    const rect = sceneRef.current.getBoundingClientRect();
    const radius = JOYSTICK_SIZE / 2;
    const x = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.width - radius - JOYSTICK_EDGE_GAP, e.clientX - rect.left));
    const y = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.height - radius - JOYSTICK_EDGE_GAP, e.clientY - rect.top));
    setJoystickCenter({ x, y });
    onJoystickPointerDown(e, { x: rect.left + x, y: rect.top + y });
  }, [gameplayBlocked, onJoystickPointerDown]);

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
      <div
        ref={worldRef}
        data-testid="walkaround-world-layer"
        className="absolute left-0 top-0 cursor-pointer"
        style={{width:world.width,height:world.height,transform:`translate3d(${-camera.x}px, ${-camera.y}px, 0)`,willChange:"transform"}}
      >
        {config.aspectLayout && <img aria-hidden src={config.backgroundUrl} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md" draggable={false}/>}<img
          src={config.backgroundUrl}
          alt={config.name}
          draggable={false}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: config.aspectLayout ? "contain" : "cover", objectPosition: "center", pointerEvents: "none", userSelect: "none" }}
        />


      {/* ── Pet sprite ──────────────────────────────────────────────────────── */}
      {petTemplateId && (
        <div
          data-testid="walk-pet-sprite"
          className="absolute pointer-events-none"
          style={{
            left:      `${petPos.x * 100}%`,
            top:       `${petPos.y * 100}%`,
            width:     petSize,
            height:    petSize,
            transform: `translate(-50%, -${CLEARING_PET_PRESENTATION.feetAnchor * 100}%)`,
            zIndex:    worldYToDepth(petPos.y),
            transition: "none",
          }}
        >
          <div className={`clearing-pet-presentation ${isMoving ? "is-moving" : ""}`} style={{transform:`scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})`}}>
            <PetAnimator petTemplateId={petTemplateId} mode="static" size={petSize} fitVisible />
          </div>
        </div>
      )}

      {config.features.combat && petTemplateId && (
        <ElysianClearingCombat petPos={petPos} petSize={petSize} activePet={activePet} facingLeft={facingLeft} onReturnToWorld={onBack} worldPixels={world} hudElement={hudElement} onGameplayBlockedChange={setGameplayBlocked} onEnemiesReady={() => setClearingReady(true)} />
      )}
      </div>

      <div ref={setHudElement} data-testid="walkaround-hud-layer" className="absolute inset-0 pointer-events-none" style={{zIndex:3000}}>
      <button data-interactive data-testid="button-back-walkaround" onClick={onBack} className="absolute pointer-events-auto px-3 py-2 rounded-xl text-xs" style={{top:"max(12px, env(safe-area-inset-top, 12px))",left:14,background:"rgba(0,0,0,.65)",border:"1px solid rgba(255,255,255,.18)",color:"#f0e8c8"}}>‹ Back</button>
      <div className="absolute top-0 left-0 right-0 flex justify-center" style={{paddingTop:"max(14px, env(safe-area-inset-top, 14px))",color:"#dcffc8cc"}}>{config.name}</div>

      {/* ── Floating joystick: appears at the clamped pointer-down position. ── */}
      {isJoystickActive && <div
        data-testid="floating-joystick"
        className="absolute"
        style={{
          left: joystickCenter.x,
          top: joystickCenter.y,
          transform: "translate(-50%, -50%)",
          zIndex: 10,
          width: JOYSTICK_SIZE,
          height: JOYSTICK_SIZE,
          touchAction: "none",
          pointerEvents: "none",
        }}
      >
        <div data-testid="joystick-base" className="absolute inset-0 rounded-full" style={{border:"1px solid rgba(210,225,200,.65)",background:"rgba(20,42,30,.54)",boxShadow:"0 2px 8px rgba(0,0,0,.35)"}} />
        {/* Thumb — moves on joystick drag */}
        <div
          data-testid="joystick-thumb"
          className="absolute"
          style={{
            width: 44,
            height: 44,
            top:  "50%",
            left: "50%",
            transform: `translate(calc(-50% + ${joystickOffset.x}px), calc(-50% + ${joystickOffset.y}px))`,
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <div className="w-full h-full rounded-full" style={{background:"rgba(165,190,165,.78)",border:"1px solid rgba(240,245,230,.7)"}} />
        </div>
      </div>}
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
      {!loadingComplete && <div className="absolute inset-0" style={{zIndex:5000}}><WorldLoadingScreen worldId="elysian_clearing" bgUrl={config.backgroundUrl} pageReady={clearingReady} onReady={() => setLoadingComplete(true)} /></div>}
    </div>
  );
}
