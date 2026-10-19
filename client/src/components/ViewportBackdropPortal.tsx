import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { viewportPointerEvents } from "@/lib/viewportLayers";

const VIEWPORT_BACKDROP_ID = "game-viewport-backdrop";

/**
 * Full-device visual layer behind the gameplay scene. If the host does not
 * expose a backdrop portal target, children render inline without creating
 * another viewport or reference stage.
 */
export default function ViewportBackdropPortal({
  children,
  enabled = true,
  targetId = VIEWPORT_BACKDROP_ID,
}: {
  children: ReactNode;
  enabled?: boolean;
  targetId?: string;
}) {
  const resolvePortalState = () => {
    if (typeof document === "undefined") {
      return { target: null as HTMLElement | null, stageOwned: false };
    }
    const stage = document.getElementById("game-stage");
    return {
      target: document.getElementById(targetId),
      stageOwned: stage?.dataset.coordinateOwner === "stage",
    };
  };
  const [portalState, setPortalState] = useState(resolvePortalState);
  const { target, stageOwned } = portalState;

  useLayoutEffect(() => {
    const resolve = () => setPortalState(resolvePortalState());
    resolve();
    // StagePageSurface and the viewport hosts can commit in the same render.
    // Re-check once after layout so a stage-owned page can never get stranded
    // on the canonical inline fallback just because the host appeared later.
    const frame = window.requestAnimationFrame(resolve);
    return () => window.cancelAnimationFrame(frame);
  }, [targetId]);

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

  if (!enabled) return <>{children}</>;
  if (!target) return stageOwned ? null : <>{children}</>;

  return createPortal(
    <div
      data-testid="viewport-backdrop-portal"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: targetId === "game-viewport-page" ? 0 : undefined,
        pointerEvents: viewportPointerEvents("decorative"),
      }}
    >
      {children}
    </div>,
    target,
  );
}
