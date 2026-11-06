/** Stable, image-relative merchandise positions in one Pet Park shop. */
export type ParkShopPlacement = {
  itemId: string;
  xPct: number;
  yPct: number;
  size: number; // percentage of the interior image's height
};
export const PARK_SHOP_MAX_ITEMS = 80;
export const PARK_SHOP_MIN_SIZE = 5;
export const PARK_SHOP_MAX_SIZE = 25;

export function validParkShopPlacements(value: unknown): value is ParkShopPlacement[] {
  return Array.isArray(value) && value.length <= PARK_SHOP_MAX_ITEMS &&
    new Set(value.map(item => item?.itemId)).size === value.length &&
    value.every(item => item && typeof item === "object" && !Array.isArray(item) &&
      typeof item.itemId === "string" && item.itemId.length > 0 && item.itemId.length <= 100 &&
      isFraction(item.xPct) && isFraction(item.yPct) &&
      Number.isInteger(item.size) && item.size >= PARK_SHOP_MIN_SIZE && item.size <= PARK_SHOP_MAX_SIZE);
}
function isFraction(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function defaultParkShopPlacement(itemId: string, index: number): ParkShopPlacement {
  return { itemId, xPct: .22 + (index % 4) * .18,
    yPct: .33 + (Math.floor(index / 4) % 4) * .14, size: 12 };
}
export function withParkShopDefaults(ids: readonly string[], placements: readonly ParkShopPlacement[]): ParkShopPlacement[] {
  const byId = new Map(placements.map(value => [value.itemId, value]));
  return ids.map((id, index) => byId.get(id) ?? defaultParkShopPlacement(id, index));
}
