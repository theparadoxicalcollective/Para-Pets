// Authoritative cross-device game-frame geometry. All gameplay is authored in
// logical pixels and the complete frame is uniformly scaled into the currently
// visible viewport. Keep pointer math and rendering based on this same layout.
export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const WIDE_BREAKPOINT = 768;
// Larger screens may present the same portrait composition a little larger,
// but never turn it into a tablet/desktop layout or an enormous monitor UI.
export const MAX_STAGE_SCALE = 1.1;

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
  return DESIGN_W;
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
  const maximumScale = isNarrowLayout(viewportWidth) ? 1 : MAX_STAGE_SCALE;
  const scale = Math.min(viewportWidth / designWidth, viewportHeight / DESIGN_H, maximumScale);
  const renderedWidth = designWidth * scale;
  const renderedHeight = DESIGN_H * scale;
  return {
    designWidth,
    designHeight: DESIGN_H,
    viewportWidth,
    viewportHeight,
    scale,
    renderedWidth,
    renderedHeight,
    left: offsetLeft + Math.max(0, (viewportWidth - renderedWidth) / 2),
    top: offsetTop + Math.max(0, (viewportHeight - renderedHeight) / 2),
  };
}

export function getVisibleViewport(): { width: number; height: number; left: number; top: number } {
  if (typeof window === "undefined") return { width: DESIGN_W, height: DESIGN_H, left: 0, top: 0 };
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
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

/** Portal gameplay UI here so fixed overlays remain inside the portrait frame. */
export function getStagePortalTarget(): HTMLElement {
  return document.getElementById("game-stage") ?? document.body;
}
