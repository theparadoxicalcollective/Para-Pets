import { useEffect, useState } from "react";
import {
  calculateStageLayout,
  getVisibleViewport,
  type StageLayout,
} from "@/lib/stage";

/**
 * Read the current gameplay viewport through the one shared stage contract.
 * Keep this wrapper intentionally thin: stage.ts remains the pure geometry
 * source of truth, while this module owns browser lifecycle observation and
 * publishing the resulting CSS variables.
 */
export function readStageViewportLayout(): StageLayout {
  const viewport = getVisibleViewport();
  return calculateStageLayout(
    viewport.width,
    viewport.height,
    viewport.top,
    viewport.left,
  );
}

/**
 * Publish the same viewport/stage variables used by existing gameplay CSS.
 * This deliberately preserves their current meanings:
 * - root --fh/--vh/--vw describe the visible viewport
 * - #game-stage overrides those variables with logical stage dimensions
 */
export function publishStageViewportCss(layout: StageLayout): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--stage-scale", String(layout.scale));
  root.setProperty("--viewport-height", `${layout.viewportHeight}px`);
  root.setProperty("--viewport-width", `${layout.viewportWidth}px`);
  root.setProperty("--fh", `${layout.viewportHeight}px`);
  root.setProperty("--vh", `${layout.viewportHeight * 0.01}px`);
  root.setProperty("--vw", `${layout.viewportWidth * 0.01}px`);
  root.setProperty("--stage-logical-width", `${layout.designWidth}px`);
  root.setProperty("--stage-logical-height", `${layout.designHeight}px`);
}

type StageViewportListener = (layout: StageLayout) => void;

/**
 * Subscribe to all browser lifecycle events that can change the usable game
 * viewport. requestAnimationFrame coalescing keeps Safari/Chrome toolbar and
 * orientation bursts from producing multiple competing measurements.
 */
export function observeStageViewport(listener: StageViewportListener): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let animationFrame = 0;

  const update = () => {
    animationFrame = 0;
    const next = readStageViewportLayout();
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
export function useStageViewportLayout(): StageLayout {
  const [layout, setLayout] = useState<StageLayout>(() => readStageViewportLayout());

  useEffect(() => observeStageViewport(setLayout), []);

  return layout;
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
