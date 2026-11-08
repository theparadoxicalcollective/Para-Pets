import type { PetAction } from "@/lib/petActionRoutes";

/**
 * Position an inventory action arc on the viewport HUD, not on the
 * scrolling pet card. The four 48px artwork buttons mirror inward and
 * open below the trigger when it is too close to the top of the screen.
 */
export const PET_MENU_WIDTH = 194;
export const PET_MENU_HEIGHT = 134;
export const PET_MENU_BUTTON_SIZE = 48;

export const PET_MENU_ACTIONS: ReadonlyArray<{
  action: PetAction;
  label: string;
  x: number;
  y: number;
}> = [
  { action: "care", label: "Pet Care", x: 0, y: 53 },
  { action: "levelUp", label: "Level Up", x: 49, y: 0 },
  { action: "powerUp", label: "Power Up", x: 98, y: 0 },
  { action: "closet", label: "Closet", x: 146, y: 53 },
];

export type PetMenuAnchor = {
  centerX: number;
  top: number;
  bottom: number;
};

export type PetMenuViewport = { width: number; height: number };

export type PetMenuPosition = {
  left: number;
  top: number;
  side: "left" | "right";
  direction: "up" | "down";
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, Math.max(min, max)));

export function positionPetActionMenu(
  anchor: PetMenuAnchor,
  viewport: PetMenuViewport,
): PetMenuPosition {
  const side = anchor.centerX > viewport.width / 2 ? "left" : "right";
  const direction = anchor.top < PET_MENU_HEIGHT + 36 &&
    viewport.height - anchor.bottom >= PET_MENU_HEIGHT + 20 ? "down" : "up";
  const desiredLeft = side === "right"
    ? anchor.centerX - PET_MENU_BUTTON_SIZE / 2
    : anchor.centerX - (PET_MENU_ACTIONS[3].x + PET_MENU_BUTTON_SIZE / 2);
  const desiredTop = direction === "down"
    ? anchor.bottom + 14
    : anchor.top - PET_MENU_HEIGHT - 8;

  return {
    side,
    direction,
    left: clamp(desiredLeft, 8, viewport.width - PET_MENU_WIDTH - 8),
    top: clamp(desiredTop, 8, viewport.height - PET_MENU_HEIGHT - 8),
  };
}

export function petMenuBubbleLeft(x: number, side: "left" | "right"): number {
  return side === "right" ? x : PET_MENU_ACTIONS[3].x - x;
}
