import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const HUD_TARGET_ID = "game-viewport-hud";

/**
 * Persistent controls live on the device-viewport HUD. The target remains
 * inside #game-stage for local stacking and modal ordering; the runtime root
 * no longer scales that container to a phone-sized reference plane.
 */
export default function ViewportHudPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(document.getElementById(HUD_TARGET_ID));
  }, []);

  return target ? createPortal(children, target) : null;
}
