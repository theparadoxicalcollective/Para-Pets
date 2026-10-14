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

function getExpandedQuestGuideSurface(anchor: Element | null | undefined): QuestGuideSurface | null {
  if (typeof document === "undefined" || !anchor) return null;

  // Include the actual HUD-mounted Pet Menu and its circular action buttons.
  const expandedOwner = anchor.closest("#game-viewport-scene, #game-viewport-hud");
  if (!expandedOwner) return null;

  // Guides for expanded World/Pet Central and the corner Pet Menu must be measured against the
  // same full-device logical rectangle as the scene. Render the guide in the
  // HUD sibling so it stays above the interactive scene without changing the
  // world-coordinate placement.
  // Use the nearest HUD owner for corner menu controls, even if a nested
  // viewport scene is also present. Never derive Pet Menu spotlight positions
  // from the legacy stage rectangle.
  const hudOwner = anchor.closest("#game-viewport-hud");
  const target = (hudOwner ?? document.getElementById("game-viewport-hud") ?? expandedOwner) as HTMLElement;
  const rect = target.getBoundingClientRect();
  // Derive the guide transform from the actual HUD owner, not the root
  // reference stage. The HUD may have a different rendered scale.
  const logicalWidth = target.clientWidth || rect.width;
  const logicalHeight = target.clientHeight || rect.height;
  const scale = Math.max(rect.width / Math.max(1, logicalWidth), 0.0001);

  return {
    target,
    inStage: true,
    left: rect.left,
    top: rect.top,
    width: logicalWidth,
    height: logicalHeight,
    scale,
  };
}

/**
 * Quest guides normally use the canonical player stage surface. When the thing
 * being guided lives inside an expanded scene, use that scene's full-device HUD
 * surface instead so a visibly on-screen NPC is actually considered on-screen.
 */
export function getQuestGuideSurface(anchor?: Element | null): QuestGuideSurface {
  const expanded = getExpandedQuestGuideSurface(anchor);
  if (expanded) return expanded;

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
  // A partially visible NPC remains actionable while the player pans.
  // Require a visible overlap rather than demanding its full center be inside
  // the viewport (large NPC tap wrappers may extend past tablet/phone edges).
  return overlapWidth >= 20 && overlapHeight >= 20
    && centerX >= -Math.max(0, bounds.right - bounds.left) / 2
    && centerX <= width + Math.max(0, bounds.right - bounds.left) / 2
    && centerY >= -Math.max(0, bounds.bottom - bounds.top) / 2
    && centerY <= height + Math.max(0, bounds.bottom - bounds.top) / 2;
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
