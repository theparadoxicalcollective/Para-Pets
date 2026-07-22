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

import { useState, useRef, useEffect } from "react";
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
}

export interface PetWalkController {
  /** Current pet position as fractions of the scene container. */
  petPos: PetWalkPos;
  facingLeft: boolean;
  isMoving: boolean;
  /** Pixel offset of joystick thumb from its base centre (for rendering). */
  joystickOffset: { x: number; y: number };
  onJoystickPointerDown: (e: React.PointerEvent) => void;
  onJoystickPointerMove: (e: React.PointerEvent) => void;
  onJoystickPointerUp: () => void;
  /** Call with normalised scene coords (0–1) for click-to-move. */
  onSceneClick: (normX: number, normY: number) => void;
}

const MAX_JOY_RADIUS = 38; // px — max thumb displacement from base centre

function clamp(pos: PetWalkPos, b: WalkableBounds): PetWalkPos {
  return {
    x: Math.max(b.xMin, Math.min(b.xMax, pos.x)),
    y: Math.max(b.yMin, Math.min(b.yMax, pos.y)),
  };
}

export function usePetWalkController({ bounds, spawn, speed = 0.28 }: Options): PetWalkController {
  const [petPos, setPetPos]             = useState<PetWalkPos>(() => clamp(spawn, bounds));
  const [facingLeft, setFacingLeft]     = useState(false);
  const [isMoving, setIsMoving]         = useState(false);
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });

  // Mutable refs — updated every frame without triggering re-renders
  const posRef          = useRef<PetWalkPos>(clamp(spawn, bounds));
  const dirRef          = useRef({ dx: 0, dy: 0 });
  const joyActiveRef    = useRef(false);
  const joyOriginRef    = useRef({ x: 0, y: 0 });
  const targetRef       = useRef<PetWalkPos | null>(null);
  const rafRef          = useRef<number | null>(null);
  const lastTRef        = useRef<number | null>(null);
  const movingRef       = useRef(false);
  const facingLeftRef   = useRef(false);
  const keysRef         = useRef<Set<string>>(new Set());

  // ── Keyboard input ────────────────────────────────────────────────────────
  useEffect(() => {
    const MOVE_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","s","a","d","W","S","A","D"]);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!MOVE_KEYS.has(e.key)) return;
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
  }, []);

  // ── RAF movement loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const tick = (t: number) => {
      const dt = lastTRef.current !== null ? Math.min((t - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = t;

      let dx = 0;
      let dy = 0;
      let usingInput = false;

      if (joyActiveRef.current) {
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
        const clamped = clamp({ x: nx, y: ny }, bounds);
        posRef.current = clamped;
        setPetPos({ ...clamped });
        if (!movingRef.current) { movingRef.current = true; setIsMoving(true); }
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
  }, [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax, speed]);

  // ── Joystick handlers ─────────────────────────────────────────────────────
  const onJoystickPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    joyActiveRef.current = true;
    joyOriginRef.current = { x: e.clientX, y: e.clientY };
    dirRef.current = { dx: 0, dy: 0 };
    targetRef.current = null;
  };

  const onJoystickPointerMove = (e: React.PointerEvent) => {
    if (!joyActiveRef.current) return;
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
  };

  const onJoystickPointerUp = () => {
    joyActiveRef.current = false;
    dirRef.current = { dx: 0, dy: 0 };
    setJoystickOffset({ x: 0, y: 0 });
  };

  const onSceneClick = (normX: number, normY: number) => {
    if (joyActiveRef.current || keysRef.current.size > 0) return;
    targetRef.current = clamp({ x: normX, y: normY }, bounds);
  };

  return {
    petPos,
    facingLeft,
    isMoving,
    joystickOffset,
    onJoystickPointerDown,
    onJoystickPointerMove,
    onJoystickPointerUp,
    onSceneClick,
  };
}
