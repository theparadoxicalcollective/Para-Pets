import type { CSSProperties } from "react";

export type HomeTouchStyle = CSSProperties & {
  WebkitTouchCallout?: "none";
  WebkitUserSelect?: "none";
};

export const HOME_TOUCH_SURFACE_STYLE: HomeTouchStyle = {
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  overscrollBehavior: "none",
};

export function safeSetPointerCapture(target: EventTarget | null, pointerId: number): boolean {
  const element = target as (Element & { setPointerCapture?: (id: number) => void }) | null;
  if (!element || typeof element.setPointerCapture !== "function") return false;
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    // Safari/WebView can reject capture if the pointer was cancelled between
    // pointerdown and a delayed drag start. The gesture can still continue
    // through normal pointer events, so treat capture as a best-effort aid.
    return false;
  }
}

export function observeHomeViewport(
  container: Element,
  recalc: () => void,
): () => void {
  recalc();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(recalc);
    resizeObserver.observe(container);
  }

  const onViewportChange = () => recalc();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onViewportChange, { passive: true });
    window.addEventListener("orientationchange", onViewportChange, { passive: true });
    window.visualViewport?.addEventListener("resize", onViewportChange, { passive: true });
  }

  return () => {
    resizeObserver?.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    }
  };
}
