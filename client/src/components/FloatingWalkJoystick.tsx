import type { CSSProperties } from "react";
import "./FloatingWalkJoystick.css";

/**
 * Shared on-demand touch movement indicator for walk-enabled scenes.
 *
 * Visual only: the existing usePetWalkController owns movement, pointer
 * capture and joystick direction. No permanent button, event handler or
 * additional movement system is introduced.
 */
export const FLOATING_WALK_JOYSTICK_SIZE = 72;
export const FLOATING_WALK_JOYSTICK_EDGE_GAP = 8;

export default function FloatingWalkJoystick({
  center, offset,
}: {
  center: { x: number; y: number };
  offset: { x: number; y: number };
}) {
  return (
    <div
      data-testid="floating-joystick"
      aria-hidden="true"
      className="floating-walk-joystick"
      style={{ left: center.x, top: center.y } as CSSProperties}
    >
      <div data-testid="joystick-base" className="floating-walk-joystick__base" />
      <div
        data-testid="joystick-thumb"
        className="floating-walk-joystick__thumb"
        style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
      />
    </div>
  );
}
