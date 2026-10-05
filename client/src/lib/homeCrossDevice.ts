import type { CSSProperties } from "react";
import { getStageSurface } from "@/lib/stage";

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

/**
 * Clamp horizontal camera motion against the real authored Home artwork.
 * Wider cameras center a smaller scene instead of creating fake world space.
 */
export function clampHomeCameraPanX(
  requestedPanX: number,
  cameraWidth: number,
  imageWidth: number,
): number {
  if (
    !Number.isFinite(requestedPanX)
    || !Number.isFinite(cameraWidth)
    || !Number.isFinite(imageWidth)
    || cameraWidth <= 0
    || imageWidth <= 0
  ) return 0;

  if (imageWidth <= cameraWidth) return (cameraWidth - imageWidth) / 2;
  return Math.max(cameraWidth - imageWidth, Math.min(0, requestedPanX));
}

export function centeredHomeCameraPanX(cameraWidth: number, imageWidth: number): number {
  return clampHomeCameraPanX((cameraWidth - imageWidth) / 2, cameraWidth, imageWidth);
}

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
      const surface = getStageSurface();
      const visualHeight = window.visualViewport?.height;
      const homeHeight = surface.viewportOwned
        ? (visualHeight && Number.isFinite(visualHeight) ? visualHeight : null)
        : surface.logicalHeight;
      if (homeHeight && Number.isFinite(homeHeight)) {
        container.style.setProperty("--home-visual-height", `${Math.round(homeHeight)}px`);
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
