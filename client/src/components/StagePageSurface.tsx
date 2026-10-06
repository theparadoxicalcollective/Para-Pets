import type { ReactNode } from "react";

/**
 * Canonical root for authenticated gameplay pages that live inside GameStage.
 *
 * This intentionally owns only the route-sized surface. Background expansion,
 * explorable scenes, device-edge controls, and blocking dialogs continue to use
 * the dedicated viewport portals so iPhone 12 keeps its native path while
 * tablet/desktop presentation can use the larger visible device safely.
 */
export default function StagePageSurface({ children }: { children: ReactNode }) {
  return (
    <div
      className="page-overlay"
      data-page-presentation="stage"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {children}
    </div>
  );
}
