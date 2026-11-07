/** Stable, image-relative merchandise positions in one Pet Park shop. */
export type ParkShopPlacement = {
  itemId: string;
  xPct: number;
  yPct: number;
  size: number; // percentage of the interior image's height
  rotation?: number; // clockwise degrees, omitted in older saved shops = 0
};
export const PARK_SHOP_MAX_ITEMS = 80;
export const PARK_SHOP_MIN_SIZE = 5;
export const PARK_SHOP_MAX_SIZE = 25;
export const PARK_SHOP_ROTATION_STEP = 15;

/** Keep old JSON placements valid while rejecting malformed/new non-integer rotations. */
export function validParkShopRotation(value: unknown): boolean {
  return value === undefined ||
    (Number.isInteger(value) && (value as number) >= 0 && (value as number) < 360);
}

export function rotateParkShopPlacement(placement: ParkShopPlacement): ParkShopPlacement {
  return { ...placement, rotation: ((placement.rotation ?? 0) + PARK_SHOP_ROTATION_STEP) % 360 };
}

export function validParkShopPlacements(value: unknown): value is ParkShopPlacement[] {
  return Array.isArray(value) && value.length <= PARK_SHOP_MAX_ITEMS &&
    new Set(value.map(item => item?.itemId)).size === value.length &&
    value.every(item => item && typeof item === "object" && !Array.isArray(item) &&
      typeof item.itemId === "string" && item.itemId.length > 0 && item.itemId.length <= 100 &&
      isFraction(item.xPct) && isFraction(item.yPct) &&
      Number.isInteger(item.size) && item.size >= PARK_SHOP_MIN_SIZE && item.size <= PARK_SHOP_MAX_SIZE &&
      validParkShopRotation(item.rotation));
}
function isFraction(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function defaultParkShopPlacement(itemId: string, index: number): ParkShopPlacement {
  // Center the first item for mobile portrait rooms, whose image can
  // extend well outside the visible viewport horizontally.
  const columns = [.5, .35, .65];
  return { itemId, xPct: columns[index % columns.length],
    yPct: .38 + (Math.floor(index / columns.length) % 4) * .14, size: 12, rotation: 0 };
}
export function withParkShopDefaults(ids: readonly string[], placements: readonly ParkShopPlacement[]): ParkShopPlacement[] {
  const byId = new Map(placements.map(value => [value.itemId, value]));
  return ids.map((id, index) => byId.get(id) ?? defaultParkShopPlacement(id, index));
}
