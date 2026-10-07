import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getViewportHost } from "@/lib/viewportOwnership";


/**
 * Persistent controls can live on the visible-device HUD while gameplay keeps
 * using the canonical iPhone-12-based stage. The target itself is still a
 * child of #game-stage, so existing modal/z-index relationships remain local
 * to the game rather than escaping into document.body.
 */
export default function ViewportHudPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(getViewportHost("hud"));
  }, []);

  return target ? createPortal(children, target) : null;
}
