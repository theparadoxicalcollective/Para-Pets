import closedChest from "@assets/uploads/ClosedChest.png";
import openedChest from "@assets/uploads/OpenedChest.png";

/**
 * Canonical reward-chest artwork used across Para Pets.
 * Keep reward flows pointed here so opened/closed chest states stay visually consistent.
 */
export const chestAssets = Object.freeze({
  closed: closedChest,
  opened: openedChest,
});

export function chestImageForOpenState(opened: boolean): string {
  return opened ? chestAssets.opened : chestAssets.closed;
}
