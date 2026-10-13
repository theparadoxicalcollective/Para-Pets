// Mobile keeps the original native viewport layout. Larger devices retain the
// canonical logical stage as a coordinate reference while full-device visual
// surfaces can extend beyond it.
export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const WIDE_BREAKPOINT = 768;
// Tablets and desktops keep the exact authored 390×844 composition as one
// uniformly scaled logical stage. The cap limits coordinate-plane scaling on
// very large monitors; it is not a visible phone-window treatment.
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
  /** Audited pages render in device pixels; artwork keeps its own scene extent. */
  viewportSurface?: boolean;
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
  return pathname === "/hub" || pathname === "/auth";
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
  const viewportSurface = options.viewportSurface === true;
  const referencePortrait = !viewportSurface && options.fitPortraitReference === true;

  // PR #574/#576 made the stage and all important player interactions share one
  // coordinate contract. Portrait touch devices can therefore use the exact
  // 390×844 reference composition as one uniformly scaled unit. Other layouts
  // retain their existing ownership until their own focused follow-up.
  const coordinateOwner: StageCoordinateOwner = !viewportSurface && (referencePortrait || !narrow) ? "stage" : "viewport";
  const designWidth = viewportSurface ? viewportWidth : referencePortrait ? DESIGN_W : getDesignWidth(viewportWidth);
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
  const touchFirst = isTouchFirstDevice();
  const visualHeight = Math.max(1, viewport.height);
  const resolvedHeight = resolveMobileBrowserHeight(layoutHeight, visualHeight);
  const keyboardReduced = resolvedHeight === visualHeight && visualHeight < layoutHeight;

  // Installed web apps already have the desired full-screen behavior, so keep
  // their visualViewport contract exactly as-is. Normal touch-first browsers
  // (phones AND tablets) use innerHeight for ordinary browser-toolbar changes,
  // falling back to visualViewport only when the much larger software-keyboard
  // reduction is present. Without this, iPad/iOS browser chrome can resize the
  // expanded World camera during a drag and immediately reset its transform.
  if (touchFirst && !standalone) {
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

/**
 * Para Pets has one supported touch-device gameplay orientation: portrait.
 *
 * A software keyboard can make a portrait viewport temporarily shorter than
 * it is wide, so never treat that keyboard-owned viewport as a rotation.
 * Non-touch desktop remains free to use a wide browser window around the
 * centered portrait game stage.
 */
export function shouldBlockTouchLandscape(
  viewportWidth: number,
  viewportHeight: number,
  touchFirst: boolean,
  keyboardReduced = false,
): boolean {
  if (!touchFirst || keyboardReduced) return false;
  return viewportWidth > viewportHeight;
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
    const reference = document.getElementById("game-stage-content")
      ?? stage.querySelector<HTMLElement>('[data-testid="root-stage-reference-plane"]');
    const renderedWidth = (reference ?? stage).getBoundingClientRect().width;
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
  const reference = document.getElementById("game-stage-content")
    ?? stage.querySelector<HTMLElement>('[data-testid="root-stage-reference-plane"]');
  const referenceRect = reference?.getBoundingClientRect() ?? rect;
  return { x: (clientX - referenceRect.left) / scale, y: (clientY - referenceRect.top) / scale };
}

/**
 * A scene element inside a stage-owned viewport page can be translated away
 * from the canonical reference plane. Convert through the actual element's
 * rendered rectangle rather than assuming it starts at the center-stage origin.
 *
 * This does not modify saved artwork or admin placement coordinates.
 */
export function clientPointInRenderedElement(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
  logicalWidth: number,
  logicalHeight: number,
): { x: number; y: number } {
  if (!Number.isFinite(logicalWidth) || logicalWidth <= 0 || !Number.isFinite(logicalHeight) || logicalHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: (clientX - rect.left) * logicalWidth / rect.width,
    y: (clientY - rect.top) * logicalHeight / rect.height,
  };
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
  // Preserve the existing stage-pixel semantics for canonical elements.
  // Full-device scenes can call clientPointInRenderedElement with their own
  // authored extent instead of inheriting the unrelated phone-stage origin.
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

/** Stable fallback for stage-local particles/messages when a target is absent. */
export function getStageLogicalCenter(): { x: number; y: number } {
  const surface = getStageSurface();
  return {
    x: surface.logicalWidth / 2,
    y: surface.logicalHeight / 2,
  };
}

/** Client-pixel point inside the rendered stage for effects seeded from browser events. */
export function getStageRenderedPoint(
  xRatio = 0.5,
  yRatio = 0.5,
): { x: number; y: number } {
  const surface = getStageSurface();
  return {
    x: surface.left + surface.logicalWidth * surface.scale * xRatio,
    y: surface.top + surface.logicalHeight * surface.scale * yRatio,
  };
}

/** Client-pixel center for effects that intentionally portal through the stage contract. */
export function getStageRenderedCenter(): { x: number; y: number } {
  return getStageRenderedPoint();
}

/** Pure inverse helpers make hit-testing independently regression-testable. */
export function logicalToRendered(layout: StageLayout, x: number, y: number) {
  return { x: layout.left + x * layout.scale, y: layout.top + y * layout.scale };
}

export function renderedToLogical(layout: StageLayout, x: number, y: number) {
  return { x: (x - layout.left) / layout.scale, y: (y - layout.top) / layout.scale };
}

export type ViewportSurfaceRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Logical rectangle that maps back onto the entire visible device viewport
 * while retaining the same uniform scale as the canonical game stage.
 *
 * HUD controls and opted-in camera/world scenes can share this geometry while
 * the authoritative 390×844 gameplay coordinate system remains unchanged.
 */
export function calculateViewportSurfaceRect(layout: StageLayout): ViewportSurfaceRect {
  const scale = Math.max(layout.scale, 0.0001);
  return {
    left: layout.left === 0 ? 0 : -layout.left / scale,
    top: layout.top === 0 ? 0 : -layout.top / scale,
    width: layout.viewportWidth / scale,
    height: layout.viewportHeight / scale,
  };
}

export type ViewportHudRect = ViewportSurfaceRect;

export function calculateViewportHudRect(layout: StageLayout): ViewportHudRect {
  return calculateViewportSurfaceRect(layout);
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
  const content = document.getElementById("game-stage-content");
  if (stage?.dataset.coordinateOwner === "stage") return content ?? stage;
  if (stage?.dataset.coordinateOwner === "viewport") return document.body;
  // Compatibility fallback while an older root shell is still mounting.
  if (!isNarrowLayout(getVisibleViewport().width)) return content ?? stage ?? document.body;
  return document.body;
}

/** Match coordinates to the adaptive portal target above. */
export function clientToStagePortal(clientX: number, clientY: number): { x: number; y: number } {
  if (typeof document === "undefined") return { x: clientX, y: clientY };
  return getStagePortalTarget() === document.body
    ? { x: clientX, y: clientY }
    : clientToStage(clientX, clientY);
}

/**
 * Device-independent placement coordinates for artwork and admin-authored scenes.
 * These helpers do not alter legacy stage coordinates or migrate saved positions:
 * callers opt in when an actual scene/artwork rectangle is available.
 * A placement belongs to the scene, never to the administrator's phone size.
 */
export type SceneExtent = { width: number; height: number };
export type ScenePoint = { x: number; y: number };
export type ScenePlacement = { x: number; y: number }; // normalized 0..1 scene coordinates

function validSceneExtent(extent: SceneExtent): boolean {
  return Number.isFinite(extent.width) && extent.width > 0
    && Number.isFinite(extent.height) && extent.height > 0;
}

export function scenePointToPlacement(point: ScenePoint, extent: SceneExtent): ScenePlacement | null {
  if (!validSceneExtent(extent) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x / extent.width, y: point.y / extent.height };
}

export function scenePlacementToPoint(placement: ScenePlacement, extent: SceneExtent): ScenePoint | null {
  if (!validSceneExtent(extent) || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return null;
  return { x: placement.x * extent.width, y: placement.y * extent.height };
}

/** Map a client pointer directly to an artwork-relative placement, including panned/scaled scenes. */
export function clientToScenePlacement(
  clientX: number,
  clientY: number,
  renderedScene: Pick<DOMRect, "left" | "top" | "width" | "height">,
): ScenePlacement | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
    || !Number.isFinite(renderedScene.left) || !Number.isFinite(renderedScene.top)
    || !validSceneExtent(renderedScene)) return null;
  return {
    x: (clientX - renderedScene.left) / renderedScene.width,
    y: (clientY - renderedScene.top) / renderedScene.height,
  };
}

export function scenePlacementToClient(
  placement: ScenePlacement,
  renderedScene: Pick<DOMRect, "left" | "top" | "width" | "height">,
): ScenePoint | null {
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)
    || !Number.isFinite(renderedScene.left) || !Number.isFinite(renderedScene.top)
    || !validSceneExtent(renderedScene)) return null;
  return {
    x: renderedScene.left + placement.x * renderedScene.width,
    y: renderedScene.top + placement.y * renderedScene.height,
  };
}

/** Only audited routes may bypass the legacy stage. Expand this as pages migrate. */
export function usesDeviceGameplaySurface(pathname: string): boolean {
  return pathname === "/" || pathname === "/map" || pathname.startsWith("/world/") || pathname === "/pet-house" || pathname === "/friends" || pathname === "/raid/leaderboard" || pathname === "/cards" || pathname === "/badges" || pathname === "/coins" || pathname === "/market" || pathname === "/bag" || pathname === "/pets"
    || /^\/pet-level-up\/[^/]+$/.test(pathname)
    || /^\/pet-care\/[^/]+$/.test(pathname)
    || pathname === "/equip-accessories" || /^\/equip-accessories\/[^/]+$/.test(pathname);
}
