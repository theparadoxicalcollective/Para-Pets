export const PET_CARE_VISIBLE_SLOTS = 6;
export const PET_CARE_GESTURE_THRESHOLD_PX = 8;
export const PET_CARE_DROP_PADDING_PX = 26;
export const PET_CARE_DRAG_GHOST_SIZE_PX = 86;
export const PET_CARE_DRAG_GHOST_FINGER_GAP_PX = 12;

export function getPetCareDragGhostTransform(x: number, y: number): string {
  return `translate3d(${x - PET_CARE_DRAG_GHOST_SIZE_PX / 2}px, ${y - PET_CARE_DRAG_GHOST_SIZE_PX - PET_CARE_DRAG_GHOST_FINGER_GAP_PX}px, 0)`;
}

export type PetCareItemGestureIntent =
  | "pending"
  | "horizontal-scroll"
  | "vertical-item-drag";

export function classifyPetCareItemGesture(
  dx: number,
  dy: number,
  threshold = PET_CARE_GESTURE_THRESHOLD_PX,
): PetCareItemGestureIntent {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.hypot(dx, dy) < threshold) return "pending";
  if (absX >= absY) return "horizontal-scroll";
  // The pet is above the shelves. Only a clearly upward gesture may pick up
  // an item; downward and ambiguous diagonal gestures remain native pans.
  if (dy < 0 && absY >= absX * 1.2) return "vertical-item-drag";
  return "horizontal-scroll";
}

export type PetCarePoint = { x: number; y: number };
export type PetCareRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export function pointInsideExpandedPetDropZone(
  point: PetCarePoint,
  rect: PetCareRect,
  padding = PET_CARE_DROP_PADDING_PX,
): boolean {
  return point.x >= rect.left - padding
    && point.x <= rect.right + padding
    && point.y >= rect.top - padding
    && point.y <= rect.bottom + padding;
}
