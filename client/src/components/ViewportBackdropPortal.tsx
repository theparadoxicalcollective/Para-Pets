import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_BACKDROP_ID = "game-viewport-backdrop";

/**
 * Full-device visual layer that sits behind the canonical gameplay stage.
 *
 * Native iPhone-12-style viewport ownership has no backdrop target, so
 * children render inline and keep the exact existing phone path.
 */
export default function ViewportBackdropPortal({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_BACKDROP_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_BACKDROP_ID));
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !target) return;
    const stage = document.getElementById("game-stage");
    const shell = stage?.closest(".game-stage-shell") as HTMLElement | null;
    if (!stage) return;
    stage.dataset.viewportBackdropActive = "true";
    if (shell) shell.dataset.viewportBackdropActive = "true";
    return () => {
      if (stage.dataset.viewportBackdropActive === "true") {
        delete stage.dataset.viewportBackdropActive;
      }
      if (shell?.dataset.viewportBackdropActive === "true") {
        delete shell.dataset.viewportBackdropActive;
      }
    };
  }, [enabled, target]);

  if (!enabled || !target) return <>{children}</>;

  return createPortal(
    <div
      data-testid="viewport-backdrop-portal"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>,
    target,
  );
}
