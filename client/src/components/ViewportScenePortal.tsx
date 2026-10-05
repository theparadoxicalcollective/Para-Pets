import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_SCENE_ID = "game-viewport-scene";

/**
 * Opt-in scene portal for environments that may use the full visible device
 * camera on stage-owned tablet/desktop layouts.
 *
 * Native iPhone-12-style viewport ownership has no expanded scene target, so
 * the children render inline and retain the exact existing DOM/layout path.
 */
export default function ViewportScenePortal({
  children,
  enabled = true,
  interactive = true,
}: {
  children: ReactNode;
  enabled?: boolean;
  interactive?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_SCENE_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_SCENE_ID));
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !target) return;
    const stage = document.getElementById("game-stage");
    if (!stage) return;
    stage.dataset.viewportSceneActive = "true";
    return () => {
      if (stage.dataset.viewportSceneActive === "true") {
        delete stage.dataset.viewportSceneActive;
      }
    };
  }, [enabled, target]);

  if (!enabled || !target) return <>{children}</>;

  return createPortal(
    <div
      data-testid="viewport-scene-portal"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {children}
    </div>,
    target,
  );
}
