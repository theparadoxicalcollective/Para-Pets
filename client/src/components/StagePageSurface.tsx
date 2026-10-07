import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAGE_ID = "game-viewport-page";

/**
 * Shared presentation root for authenticated gameplay routes.
 *
 * On native phone layouts there is no viewport-page target, so the page keeps
 * its existing inline DOM and iPhone-12 behavior exactly.
 *
 * On stage-owned tablets/desktops the route is mounted on the physical-device
 * presentation surface. A canonical 390×844 reference layer remains centered
 * inside that surface for authored gameplay/UI coordinates. Pages can now put
 * full-device presentation beside that reference instead of being clipped by
 * #game-stage-content.
 */
export default function StagePageSurface({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_PAGE_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_PAGE_ID));
  }, []);

  const content = (
    <div
      className="page-overlay"
      data-page-presentation={target ? "viewport" : "stage"}
      data-testid="stage-page-surface"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {target && (
        <div
          data-testid="stage-page-viewport-visual"
          data-stage-page-viewport-visual="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
        />
      )}
      <div
        data-stage-reference-plane="true"
        data-testid="stage-page-reference-plane"
        style={{
          position: "absolute",
          left: "var(--stage-reference-left, 0px)",
          top: "var(--stage-reference-top, 0px)",
          width: "var(--stage-reference-width, 100%)",
          height: "var(--stage-reference-height, 100%)",
          overflow: "visible",
        }}
      >
        {children}
      </div>
    </div>
  );

  return target ? createPortal(content, target) : content;
}
