export const PET_CARE_VISIBLE_SLOTS = 6;
export const PET_CARE_GESTURE_THRESHOLD_PX = 10;
export const PET_CARE_HORIZONTAL_INTENT_RATIO = 1.35;
export const PET_CARE_UPWARD_INTENT_RATIO = 0.65;
export const PET_CARE_DROP_PADDING_PX = 26;
export const PET_CARE_DRAG_GHOST_SIZE_PX = 56;
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
  if (Math.hypot(dx, dy) < threshold) return "pending";
  // Shelves page with buttons rather than native scrolling, so every deliberate
  // movement belongs to the item. This avoids WebKit permanently classifying a
  // slightly diagonal first sample as a shelf pan and losing the drag.
  return "vertical-item-drag";
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

export type PetCareGestureRecord<T> = { pointerId: number; startX: number; startY: number; item: T; intent: PetCareItemGestureIntent };

/** Single-consumer gesture state machine. The component uses this exact controller. */
export function createPetCareGestureController<T>() {
  let active: PetCareGestureRecord<T> | null = null;
  return {
    begin(pointerId: number, x: number, y: number, item: T) {
      active = { pointerId, startX: x, startY: y, item, intent: "pending" };
      return active;
    },
    move(pointerId: number, x: number, y: number) {
      if (!active || active.pointerId !== pointerId) return null;
      if (active.intent === "pending") active.intent = classifyPetCareItemGesture(x - active.startX, y - active.startY);
      return active;
    },
    consume(pointerId: number) {
      if (!active || active.pointerId !== pointerId) return null;
      const result = active;
      active = null;
      return result;
    },
    cancel() { active = null; },
    current() { return active; },
  };
}
