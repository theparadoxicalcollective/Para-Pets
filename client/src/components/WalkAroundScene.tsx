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

import { useRef } from "react";
import PetAnimator from "@/components/PetAnimator";
import { usePetWalkController } from "@/hooks/usePetWalkController";
import type { WalkAroundLocationConfig } from "@/lib/exploreLocations";
import joystickBaseImg  from "@assets/generated_images/joystick_base.png";
import joystickThumbImg from "@assets/generated_images/joystick_thumb_v3.png";

const PET_SIZE = 110; // px — rendered size of the pet sprite container

interface WalkAroundSceneProps {
  config: WalkAroundLocationConfig;
  /** petTemplateId from the active pet inventory item; null = no pet. */
  petTemplateId: string | null;
  /** Called when the player taps the back button. */
  onBack: () => void;
}

export default function WalkAroundScene({ config, petTemplateId, onBack }: WalkAroundSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);

  const {
    petPos,
    facingLeft,
    isMoving,
    joystickOffset,
    onJoystickPointerDown,
    onJoystickPointerMove,
    onJoystickPointerUp,
    onSceneClick,
  } = usePetWalkController({
    bounds: config.walkableBounds,
    spawn:  config.spawnPoint,
    speed:  config.movementSpeed,
  });

  // Convert a click on the scene div into normalised 0–1 coords
  const handleSceneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sceneRef.current) return;
    const rect = sceneRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    onSceneClick(nx, ny);
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: "none", background: "#0a120a" }}
    >
      {/* ── Background ──────────────────────────────────────────────────────── */}
      <div
        ref={sceneRef}
        className="absolute inset-0 cursor-pointer"
        onClick={handleSceneClick}
        data-testid="scene-background"
      >
        <img
          src={config.backgroundUrl}
          alt={config.name}
          draggable={false}
          className="w-full h-full"
          style={{ objectFit: "cover", objectPosition: "center", pointerEvents: "none", userSelect: "none" }}
        />
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

      {/* ── Pet sprite ──────────────────────────────────────────────────────── */}
      {petTemplateId && (
        <div
          data-testid="walk-pet-sprite"
          className="absolute pointer-events-none"
          style={{
            left:      `${petPos.x * 100}%`,
            top:       `${petPos.y * 100}%`,
            width:     PET_SIZE,
            height:    PET_SIZE,
            transform: `translate(-50%, -80%) scaleX(${facingLeft ? -1 : 1})`,
            zIndex:    5,
            transition: "none",
          }}
        >
          <PetAnimator
            petTemplateId={petTemplateId}
            mode={isMoving ? "walk" : "idle"}
            size={PET_SIZE}
          />
        </div>
      )}

      {/* ── On-screen joystick (always visible; works for both touch and mouse) */}
      <div
        className="absolute"
        style={{
          bottom: "max(28px, env(safe-area-inset-bottom, 28px))",
          right: 28,
          zIndex: 10,
          width: 96,
          height: 96,
          touchAction: "none",
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
          onPointerDown={onJoystickPointerDown}
          onPointerMove={onJoystickPointerMove}
          onPointerUp={onJoystickPointerUp}
          onPointerCancel={onJoystickPointerUp}
        >
          <img
            src={joystickThumbImg}
            alt=""
            draggable={false}
            className="w-full h-full"
            style={{ userSelect: "none" }}
          />
        </div>
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
