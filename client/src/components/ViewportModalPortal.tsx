import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MODAL_ID = "game-viewport-modal";

/**
 * Blocking dialogs that must sit above persistent device HUD controls.
 *
 * Native viewport-owned phones do not mount a separate target, so children
 * render inline and retain the existing iPhone 12 stacking path.
 */
export default function ViewportModalPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_MODAL_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_MODAL_ID));
  }, []);

  if (!target) return <>{children}</>;

  return createPortal(
    <div
      data-testid="viewport-modal-portal"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {children}
    </div>,
    target,
  );
}
