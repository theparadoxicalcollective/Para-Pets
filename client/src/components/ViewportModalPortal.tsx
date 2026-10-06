import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_HUD_ID = "game-viewport-hud";

/**
 * Blocking modal layer that always renders above persistent HUD chrome.
 *
 * This shares the viewport HUD coordinate surface but establishes a higher
 * stacking context so page dialogs cannot fall behind FloatingNav, TopBar, or
 * Pet Home inventory controls on stage-owned tablets/phones.
 */
export default function ViewportModalPortal({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_HUD_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_HUD_ID));
  }, []);

  if (!enabled || !target) return <>{children}</>;

  return createPortal(
    <div
      data-testid="viewport-modal-portal"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20000,
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>,
    target,
  );
}
