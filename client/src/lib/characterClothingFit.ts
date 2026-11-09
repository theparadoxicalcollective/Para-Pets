import type { PlayerCharacterPart } from "@shared/playerCharacter";

/** A fitted clothing image is positioned in its BODY PART's image coordinate
 * space, not the overall square canvas. Rotation is inverted before storing
 * the point, so a pant-leg overlay stays on that leg when it swings.
 */
export interface CharacterCanvasMetrics {
  left: number;
  top: number;
  renderedWidth: number;
  renderedHeight: number;
  logicalWidth: number;
  logicalHeight: number;
}

export function pointerToCharacterPartLocal(
  clientX: number,
  clientY: number,
  canvas: CharacterCanvasMetrics,
  part: PlayerCharacterPart,
  partImageHeightOverWidth: number,
): { xPct: number; yPct: number } | null {
  if (!Number.isFinite(partImageHeightOverWidth) || partImageHeightOverWidth <= 0 ||
      canvas.renderedWidth <= 0 || canvas.renderedHeight <= 0 ||
      canvas.logicalWidth <= 0 || canvas.logicalHeight <= 0) return null;

  const canvasX = (clientX - canvas.left) / canvas.renderedWidth * canvas.logicalWidth;
  const canvasY = (clientY - canvas.top) / canvas.renderedHeight * canvas.logicalHeight;
  const partWidth = part.widthPct / 100 * canvas.logicalWidth;
  const partHeight = partWidth * partImageHeightOverWidth;
  if (partWidth <= 0 || partHeight <= 0) return null;

  const dx = canvasX - part.xPct / 100 * canvas.logicalWidth;
  const dy = canvasY - part.yPct / 100 * canvas.logicalHeight;
  const radians = part.rotationDeg * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // The existing renderer's translate(-pivot) + rotation puts the part pivot
  // at xPct/yPct. Undo rotation, then recover that part-local pivot.
  const localX = dx * cos + dy * sin + part.pivotXPct / 100 * partWidth;
  const localY = -dx * sin + dy * cos + part.pivotYPct / 100 * partHeight;

  return { xPct: localX / partWidth * 100, yPct: localY / partHeight * 100 };
}

export function clampClothingFitCoordinate(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}
