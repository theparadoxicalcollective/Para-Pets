import { useEffect, useState } from "react";
import {
  calculateStageLayout,
  calculateViewportSurfaceRect,
  getVisibleViewport,
  isTouchFirstDevice,
  shouldBlockTouchLandscape,
  shouldFitPortraitReference,
  usesDeviceGameplaySurface,
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

export function readStageViewportLayout(pathname = ""): StageViewportLayout {
  const viewport = getVisibleViewport();
  const touchFirst = isTouchFirstDevice();
  const fitPortraitReference = shouldFitPortraitReference(
    viewport.width,
    viewport.height,
    touchFirst,
    viewport.keyboardReduced,
  );
  const touchPortraitBlocked = shouldBlockTouchLandscape(
    viewport.width,
    viewport.height,
    touchFirst,
    viewport.keyboardReduced,
  );
  return {
    ...calculateStageLayout(
      viewport.width,
      viewport.height,
      viewport.top,
      viewport.left,
      { fitPortraitReference, viewportSurface: usesDeviceGameplaySurface(pathname) },
    ),
    touchPortraitBlocked,
  };
}

/**
 * Publish the same viewport/stage variables used by existing gameplay CSS.
 * This deliberately preserves their current meanings:
 * - root --fh/--vh/--vw describe the visible viewport
 * - #game-stage overrides those variables with logical stage dimensions
 *
 * The viewport-surface offsets describe the real device camera in logical
 * stage pixels. They let presentation-only UI reach device edges without
 * widening or rewriting the authored gameplay coordinate plane.
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
