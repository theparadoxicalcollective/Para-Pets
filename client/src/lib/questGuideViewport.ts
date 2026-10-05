import { getStageSurface } from "./stage";

type Bounds = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export interface QuestGuideSurface {
  target: HTMLElement;
  inStage: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

/** Quest guides use the same player coordinate surface as drag ghosts and overlays. */
export function getQuestGuideSurface(): QuestGuideSurface {
  const surface = getStageSurface();
  return {
    target: surface.target,
    inStage: !surface.viewportOwned,
    left: surface.left,
    top: surface.top,
    width: surface.logicalWidth,
    height: surface.logicalHeight,
    scale: surface.scale,
  };
}

export function guideBoundsInSurface(bounds: Bounds, surface: Pick<QuestGuideSurface, "left" | "top" | "scale">): Bounds {
  return {
    left: (bounds.left - surface.left) / surface.scale,
    right: (bounds.right - surface.left) / surface.scale,
    top: (bounds.top - surface.top) / surface.scale,
    bottom: (bounds.bottom - surface.top) / surface.scale,
  };
}

/** A target outside a panned scene must not leave its guide arrow offscreen. */
export function guideTargetOnScreen(bounds: Bounds | null, width: number, height: number): boolean {
  if (!bounds) return false;
  const overlapWidth = Math.min(bounds.right, width) - Math.max(bounds.left, 0);
  const overlapHeight = Math.min(bounds.bottom, height) - Math.max(bounds.top, 0);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return overlapWidth >= 20 && overlapHeight >= 20
    && centerX >= 12 && centerX <= width - 12
    && centerY >= 20 && centerY <= height - 20;
}

export function guideCardShouldMoveUp(bounds: Bounds | null, height: number, cardHeight: number): boolean {
  if (!bounds) return false;
  const bottomCardTop = height - 112 - cardHeight;
  return bounds.bottom > bottomCardTop - 12 && bounds.top < height - 100;
}

/** Size modal content in logical game-frame pixels, not physical browser vh. */
export function guideDialogMaxHeight(surfaceHeight: number, inset = 32): number {
  return Math.max(160, Math.max(0, surfaceHeight) - Math.max(0, inset));
}

/** Match Begin Journey's compact circular spotlight without inheriting oversized tap wrappers. */
export function guideSpotlightCircle(bounds: Bounds, width: number, height: number, focus: "pet" | "control" | null = null) {
  if (focus) return guideFocusPoint(bounds, width, height, focus);
  const targetWidth = Math.max(0, bounds.right - bounds.left);
  const targetHeight = Math.max(0, bounds.bottom - bounds.top);
  const size = Math.min(108, Math.max(60, Math.min(targetWidth, targetHeight) + 28));
  return {
    x: Math.min(width - 28, Math.max(28, (bounds.left + bounds.right) / 2)),
    y: Math.min(height - 36, Math.max(48, (bounds.top + bounds.bottom) / 2)),
    size,
  };
}

/** Keep the Lonelle spotlight on the intended control, never on a full-size tap wrapper. */
export function guideFocusPoint(bounds: Bounds, width: number, height: number, kind: "pet" | "control") {
  const centerX = Math.min(width - 28, Math.max(28, (bounds.left + bounds.right) / 2));
  const y = kind === "pet" ? bounds.top + (bounds.bottom - bounds.top) * 0.45 : (bounds.top + bounds.bottom) / 2;
  return { x: centerX, y: Math.min(height - 36, Math.max(48, y)), size: kind === "pet" ? 108 : 66 };
}
