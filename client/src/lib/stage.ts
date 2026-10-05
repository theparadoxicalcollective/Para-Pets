// Mobile keeps the original, native viewport layout. The logical/scaled frame
// is an additive presentation used only at the tablet breakpoint and above.
export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const WIDE_BREAKPOINT = 768;
// Tablets and desktops render the exact phone composition as one uniformly
// scaled portrait stage. The cap keeps very large monitors from making the
// phone window enormous while allowing tablets to use much more of the screen.
export const MAX_STAGE_SCALE = 1.5;
export const MOBILE_KEYBOARD_MIN_DELTA = 180;

/** Keep the admin's 390px phone layout native when browser chrome changes its height. */
export function usesNativeMiniGamePage(width: number): boolean {
  return Math.round(width) === DESIGN_W;
}

/** Other screens fit the 390×844 reference without cropping its controls. */
export function calculateMiniGameScale(width: number, height: number): number {
  return Math.min(Math.max(0, width) / DESIGN_W, Math.max(0, height) / DESIGN_H);
}

export function calculateMiniGamePage(width: number, height: number) {
  if (usesNativeMiniGamePage(width)) return { width, height, scale: 1, native: true };
  return { width: DESIGN_W, height: DESIGN_H, scale: calculateMiniGameScale(width, height), native: false };
}

export type StageCoordinateOwner = "viewport" | "stage";

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
  coordinateOwner: StageCoordinateOwner;
  referencePortrait: boolean;
};

export type StageLayoutOptions = {
  /**
   * Fit the canonical 390×844 composition into the available portrait surface.
   * Runtime detection is kept outside this pure geometry function so device
   * classification remains independently testable.
   */
  fitPortraitReference?: boolean;
};

export function isNarrowLayout(viewportWidth: number): boolean {
  return viewportWidth < WIDE_BREAKPOINT;
}

/**
 * Public informational pages may opt out of the portrait gameplay frame on
 * larger screens. Keep the decision pure so phone preservation is regression
 * testable without a browser.
 */
export function shouldUseDocumentLayout(pathname: string, viewportWidth: number): boolean {
  return pathname === "/hub" && !isNarrowLayout(viewportWidth);
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
  options: StageLayoutOptions = {},
): StageLayout {
  const viewportWidth = Math.max(1, visibleWidth);
  const viewportHeight = Math.max(1, visibleHeight);
  const narrow = isNarrowLayout(viewportWidth);
  const referencePortrait = options.fitPortraitReference === true;

  // PR #574/#576 made the stage and all important player interactions share one
  // coordinate contract. Portrait touch devices can therefore use the exact
  // 390×844 reference composition as one uniformly scaled unit. Other layouts
  // retain their existing ownership until their own focused follow-up.
  const coordinateOwner: StageCoordinateOwner = referencePortrait || !narrow ? "stage" : "viewport";
  const designWidth = referencePortrait ? DESIGN_W : getDesignWidth(viewportWidth);
  const designHeight = coordinateOwner === "stage" ? DESIGN_H : viewportHeight;
  const scale = coordinateOwner === "stage"
    ? Math.min(viewportWidth / designWidth, viewportHeight / designHeight, MAX_STAGE_SCALE)
    : 1;
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
    top: coordinateOwner === "viewport"
      ? offsetTop
      : offsetTop + Math.max(0, (viewportHeight - renderedHeight) / 2),
    coordinateOwner,
    referencePortrait,
  };
}

function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return navigatorWithStandalone.standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export type VisibleViewport = {
  width: number;
  height: number;
  left: number;
  top: number;
  keyboardReduced: boolean;
};

export function getVisibleViewport(): VisibleViewport {
  if (typeof window === "undefined") {
    return { width: DESIGN_W, height: DESIGN_H, left: 0, top: 0, keyboardReduced: false };
  }

  const viewport = window.visualViewport;
  const layoutWidth = Math.max(1, window.innerWidth);
  const layoutHeight = Math.max(1, window.innerHeight);
  if (!viewport) {
    return { width: layoutWidth, height: layoutHeight, left: 0, top: 0, keyboardReduced: false };
  }

  const standalone = isStandaloneWebApp();
  const narrow = isNarrowLayout(layoutWidth);
  const visualHeight = Math.max(1, viewport.height);
  const resolvedHeight = resolveMobileBrowserHeight(layoutHeight, visualHeight);
  const keyboardReduced = resolvedHeight === visualHeight && visualHeight < layoutHeight;

  // Installed web apps already have the desired full-screen behavior, so keep
  // their visualViewport contract exactly as-is. Normal phone browsers instead
  // use innerHeight for ordinary toolbar changes, falling back to visualViewport
  // only when the much larger keyboard reduction is present.
  if (narrow && !standalone) {
    return {
      width: layoutWidth,
      height: resolvedHeight,
      left: keyboardReduced ? Math.max(0, viewport.offsetLeft) : 0,
      top: keyboardReduced ? Math.max(0, viewport.offsetTop) : 0,
      keyboardReduced,
    };
  }

  return {
    width: Math.max(1, viewport.width || layoutWidth),
    height: visualHeight,
    left: Math.max(0, viewport.offsetLeft || 0),
    top: Math.max(0, viewport.offsetTop || 0),
    keyboardReduced,
  };
}

/**
 * Touch-first is intentionally stricter than "has any touch point" so a
 * touchscreen laptop with a mouse/trackpad is not treated like a phone/tablet.
 */
export function isTouchFirstDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const points = Number(navigator.maxTouchPoints || 0);
  if (points <= 0) return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
  const noHover = window.matchMedia?.("(hover: none)").matches === true;
  return coarse || noHover;
}

export function shouldFitPortraitReference(
  viewportWidth: number,
  viewportHeight: number,
  touchFirst: boolean,
  keyboardReduced = false,
): boolean {
  if (!touchFirst || keyboardReduced) return false;
  if (viewportHeight < viewportWidth) return false;
  // Preserve the proven iPhone 12 / 390 CSS-pixel layout exactly, including
  // Safari/PWA browser-bar height changes and keyboard behavior.
  if (Math.round(viewportWidth) === DESIGN_W) return false;
  return true;
}

export function getDesignW(): number {
  if (typeof document !== "undefined") {
    const stage = document.getElementById("game-stage");
    const logicalWidth = Number(stage?.dataset.designWidth);
    if (logicalWidth > 0) return logicalWidth;
  }
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

/** Convert a client-pixel movement into logical stage-pixel movement. */
export function clientDeltaToStage(deltaX: number, deltaY: number): { x: number; y: number } {
  const scale = getStageScale();
  return { x: deltaX / scale, y: deltaY / scale };
}

/** Convert a client point into logical coordinates local to an element in the stage. */
export function clientPointInStageElement(
  element: Element,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const scale = getStageScale();
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

export type StageSurface = {
  target: HTMLElement;
  viewportOwned: boolean;
  left: number;
  top: number;
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
};

/**
 * Canonical player-facing coordinate surface.
 *
 * Every fixed overlay, tutorial spotlight, drag ghost, reward/message effect,
 * and other player interaction that must follow the game should choose one of
 * two coordinate spaces:
 * - viewport-owned: current native phone behavior (scale 1)
 * - stage-owned: logical game-stage pixels inside #game-stage
 *
 * PRs that later change which devices are stage-owned only need to update the
 * portal policy; consumers using this helper continue to line up automatically.
 */
export function getStageSurface(): StageSurface {
  if (typeof document === "undefined") {
    return {
      target: {} as HTMLElement,
      viewportOwned: true,
      left: 0,
      top: 0,
      logicalWidth: DESIGN_W,
      logicalHeight: DESIGN_H,
      scale: 1,
    };
  }

  const target = getStagePortalTarget();
  const visible = getVisibleViewport();
  if (target === document.body) {
    return {
      target,
      viewportOwned: true,
      left: 0,
      top: 0,
      logicalWidth: visible.width,
      logicalHeight: visible.height,
      scale: 1,
    };
  }

  const stage = document.getElementById("game-stage") ?? target;
  const rect = stage.getBoundingClientRect();
  const logicalWidth = Number(stage.dataset.designWidth) || stage.clientWidth || DESIGN_W;
  const logicalHeight = Number(stage.dataset.designHeight) || stage.clientHeight || DESIGN_H;
  const scale = logicalWidth > 0 && rect.width > 0 ? rect.width / logicalWidth : getStageScale();

  return {
    target,
    viewportOwned: false,
    left: rect.left,
    top: rect.top,
    logicalWidth,
    logicalHeight,
    scale: scale > 0 ? scale : 1,
  };
}

/** Convert a point inside a viewport DOMRect into logical stage coordinates. */
export function clientRectPointToStage(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  xRatio = 0.5,
  yRatio = 0.5,
): { x: number; y: number } {
  return clientToStage(
    rect.left + rect.width * xRatio,
    rect.top + rect.height * yRatio,
  );
}

export type StageLocalRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/** Convert a viewport/client DOMRect into the logical coordinate space of #game-stage. */
export function clientRectToStageRect(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): StageLocalRect {
  const surface = getStageSurface();
  const scale = surface.scale > 0 ? surface.scale : 1;
  const left = (rect.left - surface.left) / scale;
  const top = (rect.top - surface.top) / scale;
  const width = rect.width / scale;
  const height = rect.height / scale;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

/** Stable fallback for stage-local particles/messages when a target is absent. */
export function getStageLogicalCenter(): { x: number; y: number } {
  const surface = getStageSurface();
  return {
    x: surface.logicalWidth / 2,
    y: surface.logicalHeight / 2,
  };
}

/** Client-pixel center for effects that intentionally portal to document.body. */
export function getStageRenderedCenter(): { x: number; y: number } {
  const surface = getStageSurface();
  return {
    x: surface.left + (surface.logicalWidth * surface.scale) / 2,
    y: surface.top + (surface.logicalHeight * surface.scale) / 2,
  };
}

/** Pure inverse helpers make hit-testing independently regression-testable. */
export function logicalToRendered(layout: StageLayout, x: number, y: number) {
  return { x: layout.left + x * layout.scale, y: layout.top + y * layout.scale };
}

export function renderedToLogical(layout: StageLayout, x: number, y: number) {
  return { x: (x - layout.left) / layout.scale, y: (y - layout.top) / layout.scale };
}

export function clientToPortalPoint(layout: StageLayout, clientX: number, clientY: number) {
  return layout.coordinateOwner === "viewport"
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
 * Fixed overlays follow the rendered stage ownership rather than guessing from
 * browser width. This lets portrait phones become stage-owned without breaking
 * PvP/Raid/Pet Care portals, while the preserved 390px reference phone remains
 * viewport-owned.
 */
export function getStagePortalTarget(): HTMLElement {
  const stage = document.getElementById("game-stage");
  if (stage?.dataset.coordinateOwner === "stage") return stage;
  if (stage?.dataset.coordinateOwner === "viewport") return document.body;
  // Compatibility fallback while an older root shell is still mounting.
  if (!isNarrowLayout(getVisibleViewport().width)) return stage ?? document.body;
  return document.body;
}

/** Match coordinates to the adaptive portal target above. */
export function clientToStagePortal(clientX: number, clientY: number): { x: number; y: number } {
  if (typeof document === "undefined") return { x: clientX, y: clientY };
  return getStagePortalTarget() === document.body
    ? { x: clientX, y: clientY }
    : clientToStage(clientX, clientY);
}
