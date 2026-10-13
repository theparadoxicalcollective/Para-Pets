import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAGE_ID = "game-viewport-page";

/**
 * Shared presentation root for authenticated gameplay routes.
 *
 * Every gameplay route now owns the device viewport. Scene-relative placement
 * and world camera coordinates remain the responsibility of each scene.
 * This component no longer creates a 390x844 reference plane.
 */
export default function StagePageSurface({ children, layout = "viewport" }: { children: ReactNode; layout?: "viewport" }) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(VIEWPORT_PAGE_ID),
  );

  useLayoutEffect(() => {
    setTarget(document.getElementById(VIEWPORT_PAGE_ID));
  }, []);

  const content = (
    <div
      className="page-overlay"
      data-page-presentation="full-viewport"
      data-testid="stage-page-surface"
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        ...(target ? {
          "--fh": "var(--viewport-surface-height)",
          "--vh": "calc(var(--viewport-surface-height) / 100)",
          "--vw": "calc(var(--viewport-surface-width) / 100)",
        } as CSSProperties : {}),
      }}
    >
      {children}
    </div>
  );

  return target ? createPortal(content, target) : content;
}
