// Mobile keeps the original, native viewport layout. The logical/scaled frame
// is an additive presentation used only at the tablet breakpoint and above.
export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const WIDE_BREAKPOINT = 768;
// Larger screens may present the same portrait composition a little larger,
// but never turn it into a tablet/desktop layout or an enormous monitor UI.
export const MAX_STAGE_SCALE = 1.1;
export const MOBILE_KEYBOARD_MIN_DELTA = 180;

export type StageLayout = {
  designWidth: number;
  designHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  left: number;
  top: number;
};

export function isNarrowLayout(viewportWidth: number): boolean {
  return viewportWidth < WIDE_BREAKPOINT;
}

export function getDesignWidth(viewportWidth: number): number {
  return isNarrowLayout(viewportWidth) ? Math.min(DESIGN_W, viewportWidth) : DESIGN_W;
}

/**
 * Mobile browsers can temporarily report a visualViewport that is shorter than
 * the actual page viewport just because browser chrome is expanded. Treating
 * that toolbar delta as the game height leaves a black strip below the stage.
 * A software keyboard creates a much larger reduction, and that one should be
 * respected so focused fields remain usable.
 */
export function resolveMobileBrowserHeight(layoutHeight: number, visualHeight: number): number {
  const layout = Math.max(1, layoutHeight);
  const visual = Math.max(1, visualHeight);
  const delta = Math.max(0, layout - visual);
  const keyboardThreshold = Math.max(MOBILE_KEYBOARD_MIN_DELTA, layout * 0.22);
  return delta >= keyboardThreshold ? visual : layout;
}

/** Pure layout shared by the renderer, input conversion, and regression tests. */
export function calculateStageLayout(
  visibleWidth: number,
  visibleHeight: number,
  offsetTop = 0,
  offsetLeft = 0,
): StageLayout {
  const viewportWidth = Math.max(1, visibleWidth);
  const viewportHeight = Math.max(1, visibleHeight);
  const designWidth = getDesignWidth(viewportWidth);
  const narrow = isNarrowLayout(viewportWidth);
  // Phones own the real viewport and are never transformed into a fixed canvas.
  // This preserves the iPhone layout while allowing browser/PWA height changes.
  const designHeight = narrow ? viewportHeight : DESIGN_H;
  const scale = narrow
    ? 1
    : Math.min(viewportWidth / designWidth, viewportHeight / designHeight, MAX_STAGE_SCALE);
  const renderedWidth = designWidth * scale;
  const renderedHeight = designHeight * scale;
  return {
    designWidth,
    designHeight,
    viewportWidth,
    viewportHeight,
    scale,
    renderedWidth,
    renderedHeight,
    left: offsetLeft + Math.max(0, (viewportWidth - renderedWidth) / 2),
    top: narrow ? offsetTop : offsetTop + Math.max(0, (viewportHeight - renderedHeight) / 2),
  };
}

function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return navigatorWithStandalone.standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function getVisibleViewport(): { width: number; height: number; left: number; top: number } {
  if (typeof window === "undefined") return { width: DESIGN_W, height: DESIGN_H, left: 0, top: 0 };

  const viewport = window.visualViewport;
  const layoutWidth = Math.max(1, window.innerWidth);
  const layoutHeight = Math.max(1, window.innerHeight);
  if (!viewport) return { width: layoutWidth, height: layoutHeight, left: 0, top: 0 };

  const standalone = isStandaloneWebApp();
  const narrow = isNarrowLayout(layoutWidth);

  // Installed web apps already have the desired full-screen behavior, so keep
  // their visualViewport contract exactly as-is. Normal phone browsers instead
  // use innerHeight for ordinary toolbar changes, falling back to visualViewport
  // only when the much larger keyboard reduction is present.
  if (narrow && !standalone) {
    const visualHeight = Math.max(1, viewport.height);
    const resolvedHeight = resolveMobileBrowserHeight(layoutHeight, visualHeight);
    const keyboardOwnsViewport = resolvedHeight === visualHeight && visualHeight < layoutHeight;
    return {
      width: layoutWidth,
      height: resolvedHeight,
      left: keyboardOwnsViewport ? Math.max(0, viewport.offsetLeft) : 0,
      top: keyboardOwnsViewport ? Math.max(0, viewport.offsetTop) : 0,
    };
  }

  return {
    width: Math.max(1, viewport.width || layoutWidth),
    height: Math.max(1, viewport.height || layoutHeight),
    left: Math.max(0, viewport.offsetLeft || 0),
    top: Math.max(0, viewport.offsetTop || 0),
  };
}

export function getDesignW(): number {
  return getDesignWidth(getVisibleViewport().width);
}

export function getStageScale(): number {
  if (typeof document === "undefined") return 1;
  const stage = document.getElementById("game-stage");
  if (stage) {
    const logicalWidth = Number(stage.dataset.designWidth) || stage.offsetWidth;
    const renderedWidth = stage.getBoundingClientRect().width;
    if (logicalWidth > 0 && renderedWidth > 0) return renderedWidth / logicalWidth;
  }
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-scale"));
  return value > 0 ? value : 1;
}

export function clientToStage(clientX: number, clientY: number): { x: number; y: number } {
  if (typeof document === "undefined") return { x: clientX, y: clientY };
  const stage = document.getElementById("game-stage");
  if (!stage) return { x: clientX, y: clientY };
  const rect = stage.getBoundingClientRect();
  const scale = getStageScale();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/** Pure inverse helpers make hit-testing independently regression-testable. */
export function logicalToRendered(layout: StageLayout, x: number, y: number) {
  return { x: layout.left + x * layout.scale, y: layout.top + y * layout.scale };
}

export function renderedToLogical(layout: StageLayout, x: number, y: number) {
  return { x: (x - layout.left) / layout.scale, y: (y - layout.top) / layout.scale };
}

export function clientToPortalPoint(layout: StageLayout, clientX: number, clientY: number) {
  return isNarrowLayout(layout.viewportWidth)
    ? { x: clientX, y: clientY }
    : renderedToLogical(layout, clientX, clientY);
}

/**
 * Do not create a transformed containing block for native phone layouts.
 * Even an explicit `transform: none` is unnecessary there; omitting the
 * property makes the phone coordinate ownership contract unambiguous.
 */
export function getStageTransform(layout: StageLayout): string | undefined {
  return layout.scale === 1 ? undefined : `scale(${layout.scale})`;
}

/**
 * Preserve viewport-owned fixed overlays on phones. On larger screens the
 * transformed portrait stage owns them so they do not spill into the gutters.
 */
export function getStagePortalTarget(): HTMLElement {
  if (isNarrowLayout(getVisibleViewport().width)) return document.body;
  return document.getElementById("game-stage") ?? document.body;
}

/** Match coordinates to the adaptive portal target above. */
export function clientToStagePortal(clientX: number, clientY: number): { x: number; y: number } {
  if (typeof window === "undefined" || isNarrowLayout(getVisibleViewport().width)) {
    return { x: clientX, y: clientY };
  }
  return clientToStage(clientX, clientY);
}
