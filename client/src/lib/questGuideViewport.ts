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

  const expandedOwner = anchor.closest("#game-viewport-scene, #game-viewport-hud");
  if (!expandedOwner) return null;

  // World/Pet Central guides use the rendered full-device HUD surface.
  // Saved scene coordinates are independent from guide positioning.
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

  // Prefer the actual HUD whenever it is mounted. All root routes now use
  // viewport ownership; a stale/missing stage data attribute must not send
  // an unanchored spotlight back through the legacy stage fallback.
  if (typeof document !== "undefined") {
    const hud = document.getElementById("game-viewport-hud");
    if (hud) {
      const rect = hud.getBoundingClientRect();
      const width = hud.clientWidth || rect.width;
      const height = hud.clientHeight || rect.height;
      return {
        target: hud,
        inStage: false,
        left: rect.left,
        top: rect.top,
        width,
        height,
        scale: Math.max(rect.width / Math.max(1, width), 0.0001),
      };
    }
  }

  // The HUD may not exist during initial route mounting. Preserve the
  // established stage-surface fallback until its callers are migrated.
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
