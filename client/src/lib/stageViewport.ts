import { useEffect, useState } from "react";
import {
  calculateStageLayout,
  calculateViewportSurfaceRect,
  getVisibleViewport,
  isTouchFirstDevice,
  shouldBlockTouchLandscape,
  usesDeviceGameplaySurface,
  shouldUseDocumentLayout,
  type StageLayout,
} from "@/lib/stage";

/**
 * Read the current gameplay viewport through the one shared stage contract.
 * Keep this wrapper intentionally thin: stage.ts remains the pure geometry
 * source of truth, while this module owns browser lifecycle observation and
 * publishing the resulting CSS variables.
 */
export type StageViewportLayout = StageLayout & {
  touchPortraitBlocked: boolean;
};

/** Desktop-only portrait presentation. This is a viewport-sized scene, never a
 * scaled phone reference. Touch devices and document routes remain unchanged. */
export function desktopPortraitGameplayLayout(
  layout: StageLayout, pathname: string, touchFirst: boolean,
): StageLayout {
  if (touchFirst || !usesDeviceGameplaySurface(pathname) || shouldUseDocumentLayout(pathname, layout.viewportWidth)
    || layout.viewportWidth < 1024 || layout.viewportWidth <= layout.viewportHeight) return layout;
  const width = Math.min(layout.viewportWidth, Math.round(layout.viewportHeight * 0.72));
  return {
    ...layout,
    designWidth: width,
    designHeight: layout.viewportHeight,
    renderedWidth: width,
    renderedHeight: layout.viewportHeight,
    left: layout.left + (layout.viewportWidth - width) / 2,
    scale: 1,
    coordinateOwner: "viewport",
    referencePortrait: false,
  };
}

export function readStageViewportLayout(pathname = ""): StageViewportLayout {
  const viewport = getVisibleViewport();
  const touchFirst = isTouchFirstDevice();
  // All rendered routes now own the device viewport. Unknown routes still
  // pass through AppRouter's redirect, but must never resurrect a 390×844
  // root reference plane while that redirect resolves.
  const viewportSurface = true;
  const touchPortraitBlocked = shouldBlockTouchLandscape(
    viewport.width,
    viewport.height,
    touchFirst,
    viewport.keyboardReduced,
  );
  const layout = calculateStageLayout(
    viewport.width,
    viewport.height,
    viewport.top,
    viewport.left,
    { viewportSurface },
  );
  return {
    ...desktopPortraitGameplayLayout(layout, pathname, touchFirst),
    touchPortraitBlocked,
  };
}

/**
 * Publish viewport geometry for gameplay CSS and portal surfaces.
 * All runtime root routes now use viewport-owned layout (scale 1); the
 * legacy variable names remain for existing consumers until audited.
 * The surface offsets are measured viewport coordinates, not a 390×844 plane.
 */
export function publishStageViewportCss(layout: StageLayout): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const surface = calculateViewportSurfaceRect(layout);
  const surfaceRight = layout.designWidth - (surface.left + surface.width);
  const surfaceBottom = layout.designHeight - (surface.top + surface.height);

  root.setProperty("--stage-scale", String(layout.scale));
  root.setProperty("--viewport-height", `${layout.viewportHeight}px`);
  root.setProperty("--viewport-width", `${layout.viewportWidth}px`);
  root.setProperty("--fh", `${layout.viewportHeight}px`);
  root.setProperty("--vh", `${layout.viewportHeight * 0.01}px`);
  root.setProperty("--vw", `${layout.viewportWidth * 0.01}px`);
  root.setProperty("--stage-logical-width", `${layout.designWidth}px`);
  root.setProperty("--stage-logical-height", `${layout.designHeight}px`);
  root.setProperty("--viewport-surface-left", `${surface.left}px`);
  root.setProperty("--viewport-surface-top", `${surface.top}px`);
  root.setProperty("--viewport-surface-right", `${surfaceRight}px`);
  root.setProperty("--viewport-surface-bottom", `${surfaceBottom}px`);
  root.setProperty("--viewport-surface-width", `${surface.width}px`);
  root.setProperty("--viewport-surface-height", `${surface.height}px`);
}

type StageViewportListener = (layout: StageViewportLayout) => void;

/**
 * Subscribe to all browser lifecycle events that can change the usable game
 * viewport. requestAnimationFrame coalescing keeps Safari/Chrome toolbar and
 * orientation bursts from producing multiple competing measurements.
 */
export function observeStageViewport(listener: StageViewportListener, pathname = ""): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let animationFrame = 0;

  const update = () => {
    animationFrame = 0;
    const next = readStageViewportLayout(pathname);
    publishStageViewportCss(next);
    listener(next);
  };

  const scheduleUpdate = () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  document.addEventListener("visibilitychange", scheduleUpdate);
  window.visualViewport?.addEventListener("resize", scheduleUpdate);
  window.visualViewport?.addEventListener("scroll", scheduleUpdate);

  return () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", scheduleUpdate);
    window.removeEventListener("orientationchange", scheduleUpdate);
    window.removeEventListener("pageshow", scheduleUpdate);
    document.removeEventListener("visibilitychange", scheduleUpdate);
    window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
  };
}

/**
 * Shared React entry point used by both authenticated gameplay and the
 * unauthenticated/root loading shell. Only one of those stage surfaces is
 * mounted at a time, but they now consume exactly the same viewport observer.
 */
export function useStageViewportLayout(pathname = ""): StageViewportLayout {
  const [snapshot, setSnapshot] = useState(() => ({ pathname, layout: readStageViewportLayout(pathname) }));

  useEffect(() => observeStageViewport(layout => setSnapshot({ pathname, layout }), pathname), [pathname]);

  // Route ownership changes must take effect during render, before portals mount.
  return snapshot.pathname === pathname ? snapshot.layout : readStageViewportLayout(pathname);
}

/**
 * html/body currently use --app-height as their non-stage page-height fallback.
 * Keep its established window.innerHeight behavior, but centralize ownership in
 * this viewport module so there is no second independent sizing implementation.
 */
export function syncAppHeight(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

export function installAppHeightSync(): () => void {
  if (typeof window === "undefined") return () => {};
  syncAppHeight();
  window.addEventListener("resize", syncAppHeight);
  return () => window.removeEventListener("resize", syncAppHeight);
}
