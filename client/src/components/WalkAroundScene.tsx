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

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PetAnimator from "@/components/PetAnimator";
import ElysianClearingCombat from "@/components/ElysianClearingCombat";
import { usePetWalkController } from "@/hooks/usePetWalkController";
import type { WalkAroundLocationConfig } from "@/lib/exploreLocations";
import { calculateFollowCamera } from "@/lib/walkAroundCamera";
import joystickBaseImg  from "@assets/generated_images/joystick_base.png";
import joystickThumbImg from "@assets/generated_images/joystick_thumb_v3.png";

const DEFAULT_PET_SIZE = 110;
const JOYSTICK_SIZE = 96;
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
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });

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
    worldSize: config.worldSize,
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
  const worldSize = config.worldSize ?? { width: 1, height: 1 };
  useEffect(() => {
    const node = sceneRef.current;
    if (!node) return;
    const update = () => setViewport({ width: node.clientWidth || 1, height: node.clientHeight || 1 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const camera = useMemo(() => calculateFollowCamera(petPos, viewport, worldSize), [petPos, viewport, worldSize.height, worldSize.width]);
  const worldTransform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sceneRef.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-interactive]")) return;
    e.preventDefault();
    const rect = sceneRef.current.getBoundingClientRect();
    const radius = JOYSTICK_SIZE / 2;
    const x = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.width - radius - JOYSTICK_EDGE_GAP, e.clientX - rect.left));
    const y = Math.max(radius + JOYSTICK_EDGE_GAP, Math.min(rect.height - radius - JOYSTICK_EDGE_GAP, e.clientY - rect.top));
    setJoystickCenter({ x, y });
    onJoystickPointerDown(e, { x: rect.left + x, y: rect.top + y });
  };

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: "none", background: "#0a120a" }}
      onPointerDown={handlePointerDown}
      onPointerMove={onJoystickPointerMove}
      onPointerUp={onJoystickPointerUp}
      onPointerCancel={onJoystickPointerUp}
      onPointerLeave={onJoystickPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* World layer; viewport-sized locations retain their legacy behaviour. */}
      <div
        className="absolute left-0 top-0 cursor-pointer will-change-transform"
        data-testid="scene-background"
        data-camera-x={camera.x}
        data-camera-y={camera.y}
        style={{ width: camera.worldWidth, height: camera.worldHeight, transform: worldTransform, transition: `transform ${Math.round(90 + (config.camera?.smoothing ?? 0) * 300)}ms linear` }}
      >
        <img
          src={config.backgroundUrl}
          alt={config.name}
          draggable={false}
          className="w-full h-full"
          style={{ objectFit: "cover", objectPosition: "center", pointerEvents: "none", userSelect: "none" }}
        />
        {/* Pet and enemies use the same normalized world coordinates. */}
        {petTemplateId && (
          <div data-testid="walk-pet-sprite" className="absolute pointer-events-none" style={{ left:`${petPos.x*100}%`, top:`${petPos.y*100}%`, width:petSize, height:petSize, transform:`translate(-50%, -80%) scaleX(${facingLeft !== naturalFacingLeft ? -1 : 1})`, zIndex:5 }}>
            <PetAnimator petTemplateId={petTemplateId} mode={isMoving ? "walk" : "idle"} size={petSize}/>
          </div>
        )}
      </div>

      {/* ── Subtle top gradient (readability for back button) ───────────────── */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "18%",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, transparent 100%)",
          zIndex: 2,
        }}
      />

      {/* ── Back button ─────────────────────────────────────────────────────── */}
      <button
        data-testid="button-back-walkaround"
        onClick={onBack}
        className="absolute flex items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95 transition-transform"
        style={{
          top: "max(12px, env(safe-area-inset-top, 12px))",
          left: 14,
          zIndex: 10,
          background: "rgba(0,0,0,0.65)",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(4px)",
          color: "#f0e8c8",
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "var(--font-fantasy, serif)",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
        <span className="font-fantasy tracking-wider text-xs">Back</span>
      </button>

      {/* ── Location name ───────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top, 14px))", zIndex: 3 }}
      >
        <span
          className="font-fantasy tracking-widest text-xs"
          style={{ color: "rgba(220,255,200,0.8)", textShadow: "0 0 8px rgba(80,200,100,0.4)" }}
        >
          {config.name}
        </span>
      </div>

      {config.features.combat && petTemplateId && (
        <ElysianClearingCombat petPos={petPos} facingLeft={facingLeft} onRespawn={resetPosition} world={{ width:camera.worldWidth, height:camera.worldHeight, transform:worldTransform }} />
      )}

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
        {/* Base ring */}
        <img
          src={joystickBaseImg}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full"
          style={{ opacity: 0.7, userSelect: "none" }}
        />
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
          <img
            src={joystickThumbImg}
            alt=""
            draggable={false}
            className="w-full h-full"
            style={{ userSelect: "none" }}
          />
        </div>
      </div>}

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
