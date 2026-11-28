/**
 * usePetWalkController — reusable pet movement controller for walk-around scenes.
 *
 * Supports:
 *   - On-screen joystick (touch/pointer) for mobile
 *   - WASD / arrow-key keyboard movement for desktop
 *   - Click-to-move for desktop (pass scene-fraction coords via onSceneClick)
 *   - Smooth RAF-based movement with configurable speed
 *   - Sprite facing direction (left / right)
 *   - Editable walkable-boundary clamping
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { WalkableBounds } from "@/lib/exploreLocations";

export interface PetWalkPos {
  /** Fraction of the scene container width, 0–1. */
  x: number;
  /** Fraction of the scene container height, 0–1. */
  y: number;
}

interface Options {
  bounds: WalkableBounds;
  spawn: { x: number; y: number };
  /** Speed in scene-fraction units per second (default 0.28). */
  speed?: number;
  /** Temporarily suspend and clear all movement input. */
  enabled?: boolean;
  /** Published worlds use authored world units and transparent barrier masks. */
  resolveStep?: (from: PetWalkPos, attempted: PetWalkPos) => PetWalkPos;
  onPositionChange?: (position: PetWalkPos) => void;
  keyboardEnabled?: boolean;
}

export interface PetWalkController {
  /** Current pet position as fractions of the scene container. */
  petPos: PetWalkPos;
  facingLeft: boolean;
  aimDirection: { dx: number; dy: number };
  isMoving: boolean;
  isJoystickActive: boolean;
  /** Pixel offset of joystick thumb from its base centre (for rendering). */
  joystickOffset: { x: number; y: number };
  onJoystickPointerDown: (e: React.PointerEvent, origin: { x: number; y: number }) => void;
  onJoystickPointerMove: (e: React.PointerEvent) => void;
  onJoystickPointerUp: (e: React.PointerEvent) => void;
  /** Call with normalised scene coords (0–1) for click-to-move. */
  onSceneClick: (normX: number, normY: number) => void;
  /** Return the pet to the configured safe spawn and clear current movement input. */
  resetPosition: (position?: PetWalkPos) => void;
  stopMovement: () => void;
}

const MAX_JOY_RADIUS = 26; // px — compact 72px popup, thumb never outgrows the base
export function persistentAimDirection(current:{dx:number;dy:number},dx:number,dy:number){const length=Math.hypot(dx,dy);return length<.001?current:{dx:dx/length,dy:dy/length};}

function clamp(pos: PetWalkPos, b: WalkableBounds): PetWalkPos {
  return {
    x: Math.max(b.xMin, Math.min(b.xMax, pos.x)),
    y: Math.max(b.yMin, Math.min(b.yMax, pos.y)),
  };
}

export function usePetWalkController({ bounds, spawn, speed = 0.28, enabled = true, resolveStep, onPositionChange, keyboardEnabled = true }: Options): PetWalkController {
  const [petPos, setPetPos]             = useState<PetWalkPos>(() => clamp(spawn, bounds));
  const [facingLeft, setFacingLeft]     = useState(false);
  const [aimDirection, setAimDirection] = useState({ dx: 1, dy: 0 });
  const [isMoving, setIsMoving]         = useState(false);
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });

  // Mutable refs — updated every frame without triggering re-renders
  const posRef          = useRef<PetWalkPos>(clamp(spawn, bounds));
  const dirRef          = useRef({ dx: 0, dy: 0 });
  const aimRef          = useRef({ dx: 1, dy: 0 });
  const updateAim = useCallback((dx:number,dy:number) => { const next=persistentAimDirection(aimRef.current,dx,dy); if(Math.hypot(next.dx-aimRef.current.dx,next.dy-aimRef.current.dy)>.002){aimRef.current=next;setAimDirection(next);}}, []);
  const joyActiveRef    = useRef(false);
  // Only the pointer that began movement may move or end the joystick.
  // A second finger tapping combat controls must not steal its direction.
  const activePointerIdRef = useRef<number | null>(null);
  const joyOriginRef    = useRef({ x: 0, y: 0 });
  const targetRef       = useRef<PetWalkPos | null>(null);
  const rafRef          = useRef<number | null>(null);
  const lastTRef        = useRef<number | null>(null);
  const movingRef       = useRef(false);
  const facingLeftRef   = useRef(false);
  const keysRef         = useRef<Set<string>>(new Set());
  const enabledRef      = useRef(enabled);
  const stepRef = useRef({ resolveStep, onPositionChange });
  stepRef.current = { resolveStep, onPositionChange };

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      keysRef.current.clear();
      joyActiveRef.current = false;
      activePointerIdRef.current = null;
      dirRef.current = { dx: 0, dy: 0 };
      targetRef.current = null;
      setIsJoystickActive(false);
      setJoystickOffset({ x: 0, y: 0 });
      setIsMoving(false);
      movingRef.current = false;
    }
  }, [enabled]);

  // ── Keyboard input ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!keyboardEnabled) return;
    const MOVE_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","s","a","d","W","S","A","D"]);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current || !MOVE_KEYS.has(e.key)) return;
      e.preventDefault();
      keysRef.current.add(e.key.toLowerCase() === "w" || e.key === "ArrowUp" ? "up"
        : e.key.toLowerCase() === "s" || e.key === "ArrowDown" ? "down"
        : e.key.toLowerCase() === "a" || e.key === "ArrowLeft" ? "left"
        : "right");
      targetRef.current = null; // cancel click-to-move
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mapped = e.key.toLowerCase() === "w" || e.key === "ArrowUp" ? "up"
        : e.key.toLowerCase() === "s" || e.key === "ArrowDown" ? "down"
        : e.key.toLowerCase() === "a" || e.key === "ArrowLeft" ? "left"
        : e.key === "ArrowRight" || e.key.toLowerCase() === "d" ? "right" : null;
      if (mapped) keysRef.current.delete(mapped);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [keyboardEnabled]);

  // ── RAF movement loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    lastTRef.current = null;
    const tick = (t: number) => {
      const dt = lastTRef.current !== null ? Math.min((t - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = t;

      let dx = 0;
      let dy = 0;
      let usingInput = false;

      if (!enabledRef.current) {
        usingInput = false;
      } else if (joyActiveRef.current) {
        // Joystick has priority
        dx = dirRef.current.dx;
        dy = dirRef.current.dy;
        usingInput = dx !== 0 || dy !== 0;
      } else {
        // Keyboard
        const keys = keysRef.current;
        if (keys.has("left"))  dx -= 1;
        if (keys.has("right")) dx += 1;
        if (keys.has("up"))    dy -= 1;
        if (keys.has("down"))  dy += 1;
        if (dx !== 0 && dy !== 0) {
          // Normalise diagonal
          const len = Math.sqrt(dx * dx + dy * dy);
          dx /= len; dy /= len;
        }
        usingInput = dx !== 0 || dy !== 0;
        if (usingInput) targetRef.current = null;
      }

      let nx = posRef.current.x;
      let ny = posRef.current.y;
      let moved = false;

      if (usingInput) {
        updateAim(dx, dy);
        nx += dx * speed * dt;
        ny += dy * speed * dt;
        moved = true;
        if (dx < 0 && !facingLeftRef.current)  { facingLeftRef.current = true;  setFacingLeft(true); }
        if (dx > 0 &&  facingLeftRef.current)  { facingLeftRef.current = false; setFacingLeft(false); }
      } else if (targetRef.current) {
        // Click-to-move: smoothly approach target
        const tdx = targetRef.current.x - nx;
        const tdy = targetRef.current.y - ny;
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);
        if (dist > 0.006) {
          updateAim(tdx, tdy);
          const s = speed * dt / dist;
          nx += tdx * s;
          ny += tdy * s;
          moved = true;
          const goLeft = tdx < 0;
          if (goLeft !== facingLeftRef.current) { facingLeftRef.current = goLeft; setFacingLeft(goLeft); }
        } else {
          targetRef.current = null;
        }
      }

      if (moved) {
        const previous = posRef.current;
        const attempted = { x: nx, y: ny };
        const clamped = clamp(stepRef.current.resolveStep?.(previous, attempted) ?? attempted, bounds);
        const changed = previous.x !== clamped.x || previous.y !== clamped.y;
        if (changed) {
          posRef.current = clamped;
          setPetPos(clamped);
          stepRef.current.onPositionChange?.(clamped);
        }
        // Legacy scenes keep their established movement animation semantics.
        const walking = !stepRef.current.resolveStep || changed;
        if (movingRef.current !== walking) { movingRef.current = walking; setIsMoving(walking); }
      } else {
        if (movingRef.current) { movingRef.current = false; setIsMoving(false); }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax, speed, updateAim, enabled]);

  // ── Joystick handlers ─────────────────────────────────────────────────────
  const stopMovement = useCallback(() => {
    joyActiveRef.current = false;
    activePointerIdRef.current = null;
    dirRef.current = { dx: 0, dy: 0 };
    setIsJoystickActive(false);
    setJoystickOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== "visible") stopMovement(); };
    window.addEventListener("blur", stopMovement);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("blur", stopMovement); document.removeEventListener("visibilitychange", onVisibility); stopMovement(); };
  }, [stopMovement]);

  const onJoystickPointerDown = useCallback((e: React.PointerEvent, origin: { x: number; y: number }) => {
    if (!enabledRef.current || activePointerIdRef.current !== null) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { stopMovement(); return; }
    activePointerIdRef.current = e.pointerId;
    joyActiveRef.current = true;
    setIsJoystickActive(true);
    joyOriginRef.current = origin;
    dirRef.current = { dx: 0, dy: 0 };
    targetRef.current = null;
  }, [stopMovement]);

  const onJoystickPointerMove = useCallback((e: React.PointerEvent) => {
    if (!joyActiveRef.current || e.pointerId !== activePointerIdRef.current) return;
    const rawDx = e.clientX - joyOriginRef.current.x;
    const rawDy = e.clientY - joyOriginRef.current.y;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const capped = Math.min(dist, MAX_JOY_RADIUS);
    const nx = dist > 0 ? (rawDx / dist) * capped : 0;
    const ny = dist > 0 ? (rawDy / dist) * capped : 0;
    setJoystickOffset({ x: nx, y: ny });
    dirRef.current = {
      dx: dist > 2 ? rawDx / Math.max(dist, MAX_JOY_RADIUS) : 0,
      dy: dist > 2 ? rawDy / Math.max(dist, MAX_JOY_RADIUS) : 0,
    };
  }, []);

  const onJoystickPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerId === activePointerIdRef.current) stopMovement();
  }, [stopMovement]);

  const onSceneClick = useCallback((normX: number, normY: number) => {
    if (joyActiveRef.current || keysRef.current.size > 0) return;
    targetRef.current = clamp({ x: normX, y: normY }, bounds);
  }, [bounds]);

  const resetPosition = useCallback((position?: PetWalkPos) => {
    const safe = clamp(position ?? spawn, bounds);
    posRef.current = safe; targetRef.current = null; dirRef.current = { dx: 0, dy: 0 };
    keysRef.current.clear(); stopMovement(); setPetPos({ ...safe });
  }, [bounds, spawn, stopMovement]);

  return {
    petPos,
    facingLeft,
    aimDirection,
    isMoving,
    isJoystickActive,
    joystickOffset,
    onJoystickPointerDown,
    onJoystickPointerMove,
    onJoystickPointerUp,
    onSceneClick,
    resetPosition,
    stopMovement,
  };
}
