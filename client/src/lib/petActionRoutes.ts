/** Inventory-identified pet actions. Keep the existing home and pet-house
 * entry points intact until the inventory Pet Menu ships in Avatar 04/12. */
export type PetAction = "care" | "levelUp" | "powerUp" | "closet";

const PET_ACTION_ROUTES: Record<PetAction, string> = {
  care: "/pet-care",
  levelUp: "/pet-level-up",
  powerUp: "/pet-power-up",
  closet: "/equip-accessories",
};

/** URLs generated for the upcoming inventory Pet Menu always return to Pets. */
export function petInventoryActionHref(action: PetAction, inventoryId: string): string {
  if (!inventoryId.trim()) throw new Error("A pet inventory ID is required");
  return `${PET_ACTION_ROUTES[action]}/${encodeURIComponent(inventoryId)}?from=pets`;
}

/** A tiny allowlist, not an arbitrary return URL; never navigate to a value
 * supplied directly by the query string. Old Home and Pet House callers keep
 * their historical return destinations. */
export function petActionReturnPath(search: string, fallback = "/"): string {
  return new URLSearchParams(search).get("from") === "pets" ? "/pets" : fallback;
}
