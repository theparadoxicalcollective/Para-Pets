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
import { cameraTarget } from "@/lib/elysianClearingCombatMath";

const DEFAULT_PET_SIZE = 110;
const JOYSTICK_SIZE = 90;
const JOYSTICK_EDGE_GAP = 8;

interface WalkAroundSceneProps {
  config: WalkAroundLocationConfig;
  /** petTemplateId from the active pet inventory item; null = no pet. */
  petTemplateId: string | null;
  /** Called when the player taps the back button. */
  onBack: () => void;
}

export default function WalkAroundScene({ config, petTemplateId, onBack }: WalkAroundSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState({ x: 0, y: 0 });

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
    bounds: config.walkableBounds,
    spawn:  config.spawnPoint,
    speed:  config.movementSpeed,
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
  const petSize = config.petSize ?? DEFAULT_PET_SIZE;

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!sceneRef.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-interactive]")) return;
    e.preventDefault();
    const rect = sceneRef.current.getBoundingClientRect();
    const radius = JOYSTICK_SIZE / 2;
    const x = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.width - radius - JOYSTICK_EDGE_GAP, e.clientX - rect.left));
    const y = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.height - radius - JOYSTICK_EDGE_GAP, e.clientY - rect.top));
    setJoystickCenter({ x, y });
    onJoystickPointerDown(e, { x: rect.left + x, y: rect.top + y });
  }, [onJoystickPointerDown]);

  const world = { width: viewport.width * (config.worldSize?.width ?? 1), height: viewport.height * (config.worldSize?.height ?? 1) };
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
        <img
          src={config.backgroundUrl}
          alt={config.name}
          draggable={false}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover", objectPosition: "center", pointerEvents: "none", userSelect: "none" }}
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
            transform: `translate(-50%, -80%) scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})`,
            zIndex:    5,
            transition: "none",
          }}
        >
          <PetAnimator
            petTemplateId={petTemplateId}
            mode={isMoving ? "walk" : "idle"}
            size={petSize}
          />
        </div>
      )}

      {config.features.combat && petTemplateId && (
        <ElysianClearingCombat petPos={petPos} facingLeft={facingLeft} onRespawn={resetPosition} worldPixels={world} />
      )}
      </div>

      <div data-testid="walkaround-hud-layer" className="absolute inset-0 pointer-events-none" style={{zIndex:10}}>
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
    </div>
  );
}
