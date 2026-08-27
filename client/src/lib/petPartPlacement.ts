export interface PetPartTransform {
  posX: number;
  posY: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  rotation?: number;
}

export interface PetPartPoint { x: number; y: number }

export const clampPetPartRotation = (degrees: number): number =>
  Math.max(-180, Math.min(180, Math.round(Number.isFinite(degrees) ? degrees : 0)));

export function getPetPartPivot(part: PetPartTransform): PetPartPoint {
  return {
    x: part.posX + part.width * ((part.pivotX ?? 50) / 100),
    y: part.posY + part.height * ((part.pivotY ?? 50) / 100),
  };
}

export function getUnrotatedPetPartPoint(point: PetPartPoint, part: PetPartTransform): PetPartPoint {
  const radians = (-clampPetPartRotation(part.rotation ?? 0) * Math.PI) / 180;
  if (radians === 0) return point;
  const pivot = getPetPartPivot(part);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function getPetPartDragOffset(pointer: PetPartPoint, part: PetPartTransform): PetPartPoint {
  return { x: pointer.x - part.posX, y: pointer.y - part.posY };
}

export function getDraggedPetPartPosition(pointer: PetPartPoint, offset: PetPartPoint): Pick<PetPartTransform, "posX" | "posY"> {
  return { posX: Math.round(pointer.x - offset.x), posY: Math.round(pointer.y - offset.y) };
}

export function resizePetPartTransform<T extends PetPartTransform>(part: T, nextWidth: number): T {
  const width = Math.max(4, Math.min(1000, Math.round(nextWidth)));
  const ratio = part.width > 0 ? width / part.width : 1;
  return { ...part, width, height: Math.max(4, Math.min(1000, Math.round(part.height * ratio))) };
}
