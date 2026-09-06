export interface GinnyGuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GinnyGuidePlacement {
  highlightLeft: number;
  highlightTop: number;
  highlightWidth: number;
  highlightHeight: number;
  tooltipLeft: number;
  tooltipTop: number;
  tooltipWidth: number;
  tooltipAbove: boolean;
  arrowX: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Position Ginny's coachmark around the actual highlighted control rather than
 * around the viewport center. The tooltip may have to clamp against a screen
 * edge, but the arrow still tracks the target's true horizontal center.
 */
export function calculateGinnyGuidePlacement(
  rect: GinnyGuideRect,
  viewportWidth: number,
  viewportHeight: number,
  tooltipHeight = 84,
): GinnyGuidePlacement {
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390;
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 844;
  const safeTooltipHeight = Number.isFinite(tooltipHeight) && tooltipHeight > 0 ? tooltipHeight : 84;

  const pad = Math.max(8, Math.min(16, Math.min(rect.width, rect.height) * 0.16));
  const highlightLeft = Math.max(6, rect.left - pad);
  const highlightTop = Math.max(6, rect.top - pad);
  const highlightWidth = Math.max(0, Math.min(safeWidth - highlightLeft - 6, rect.width + pad * 2));
  const highlightHeight = Math.max(0, Math.min(safeHeight - highlightTop - 6, rect.height + pad * 2));

  const tooltipWidth = Math.min(260, Math.max(190, safeWidth - 24));
  const targetCenterX = rect.left + rect.width / 2;
  const tooltipLeft = clamp(targetCenterX - tooltipWidth / 2, 12, safeWidth - tooltipWidth - 12);

  // Arrow position is relative to the tooltip border box. Keeping a little
  // room from the rounded corners makes edge-clamped tips look intentional.
  const arrowX = clamp(targetCenterX - tooltipLeft, 24, tooltipWidth - 24);

  const gap = 12;
  const spaceAbove = highlightTop - 8 - gap;
  const highlightBottom = highlightTop + highlightHeight;
  const spaceBelow = safeHeight - highlightBottom - 8 - gap;
  const tooltipAbove = spaceAbove >= safeTooltipHeight || spaceAbove >= spaceBelow;
  const tooltipTop = tooltipAbove
    ? Math.max(8, highlightTop - safeTooltipHeight - gap)
    : Math.min(safeHeight - safeTooltipHeight - 8, highlightBottom + gap);

  return {
    highlightLeft,
    highlightTop,
    highlightWidth,
    highlightHeight,
    tooltipLeft,
    tooltipTop,
    tooltipWidth,
    tooltipAbove,
    arrowX,
  };
}
