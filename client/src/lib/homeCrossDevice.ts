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

export const HOME_FIXED_VIEWPORT_STYLE: CSSProperties = {
  // inset-0 remains the fallback for browsers without dynamic viewport units.
  // The custom property is refreshed from VisualViewport where available.
  height: "var(--home-visual-height, 100dvh)",
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
  let raf = 0;

  const syncAndRecalc = () => {
    if (typeof window !== "undefined" && container instanceof HTMLElement) {
      const visualHeight = window.visualViewport?.height;
      if (visualHeight && Number.isFinite(visualHeight)) {
        container.style.setProperty("--home-visual-height", `${Math.round(visualHeight)}px`);
      } else {
        container.style.removeProperty("--home-visual-height");
      }
    }
    recalc();
  };

  const scheduleRecalc = () => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      syncAndRecalc();
      return;
    }
    if (raf) window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      syncAndRecalc();
    });
  };

  syncAndRecalc();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleRecalc);
    resizeObserver.observe(container);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("resize", scheduleRecalc, { passive: true });
    window.addEventListener("orientationchange", scheduleRecalc, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleRecalc, { passive: true });
  }

  return () => {
    resizeObserver?.disconnect();
    if (typeof window !== "undefined") {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", scheduleRecalc);
      window.removeEventListener("orientationchange", scheduleRecalc);
      window.visualViewport?.removeEventListener("resize", scheduleRecalc);
    }
    if (container instanceof HTMLElement) {
      container.style.removeProperty("--home-visual-height");
    }
  };
}
