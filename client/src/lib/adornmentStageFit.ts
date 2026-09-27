/** Fit authored pet parts into the adornment editor without changing saved 1000-unit coordinates. */
export interface StagePart {
  posX: number;
  posY: number;
  width: number;
  height: number;
  pivotX?: number | null;
  pivotY?: number | null;
  rotation?: number | null;
}

export interface AdornmentStageFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitAdornmentStage(parts: readonly StagePart[], canvasSize = 1000): AdornmentStageFit {
  if (!parts.length) return { scale: 1, offsetX: 0, offsetY: 0 };
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const part of parts) {
    const pivotX = part.posX + part.width * (part.pivotX ?? 50) / 100;
    const pivotY = part.posY + part.height * (part.pivotY ?? 50) / 100;
    const radians = (part.rotation ?? 0) * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    for (const x of [part.posX, part.posX + part.width]) {
      for (const y of [part.posY, part.posY + part.height]) {
        const dx = x - pivotX, dy = y - pivotY;
        const rotatedX = pivotX + dx * cos - dy * sin;
        const rotatedY = pivotY + dx * sin + dy * cos;
        left = Math.min(left, rotatedX);
        top = Math.min(top, rotatedY);
        right = Math.max(right, rotatedX);
        bottom = Math.max(bottom, rotatedY);
      }
    }
  }
  const scale = Math.min(1, canvasSize * .88 / Math.max(right - left, bottom - top, 1));
  return {
    scale,
    offsetX: canvasSize / 2 - (left + right) / 2 * scale,
    offsetY: canvasSize / 2 - (top + bottom) / 2 * scale,
  };
}

export function pointInAdornmentStage(x: number, y: number, fit: AdornmentStageFit) {
  return { x: (x - fit.offsetX) / fit.scale, y: (y - fit.offsetY) / fit.scale };
}
