/** Stable, image-relative merchandise positions in one Pet Park shop. */
export type ParkShopPlacement = {
  itemId: string;
  xPct: number;
  yPct: number;
  size: number; // percentage of the interior image's height
  rotation?: number; // clockwise degrees, omitted in older saved shops = 0
  flippedX?: boolean; // mirrored artwork, omitted in older shops = false
  priceTagXPct?: number; // price tag anchor within the item artwork, 0..1
  priceTagYPct?: number;
};
export const PARK_SHOP_MAX_ITEMS = 80;
export const PARK_SHOP_MIN_SIZE = 5;
export const PARK_SHOP_MAX_SIZE = 25;
export const PARK_SHOP_ROTATION_STEP = 15;
export const PARK_SHOP_PRICE_TAG_MIN = .15;
export const PARK_SHOP_PRICE_TAG_MAX = .85;
export const PARK_SHOP_DEFAULT_PRICE_TAG = { xPct: .72, yPct: .78 } as const;
// A 52px tag inside the admin editor's 148px merchandise preview. Use the
// same image-relative proportion in the live shop, including small items:
// fixed min/max pixel clamps made the player tag look larger than the preview.
export const PARK_SHOP_PRICE_TAG_PREVIEW_BOX_SIZE = 148;
export const PARK_SHOP_PRICE_TAG_PREVIEW_SIZE = 52;
export function parkShopPriceTagSize(itemBoxPixels: number): number {
  return itemBoxPixels * PARK_SHOP_PRICE_TAG_PREVIEW_SIZE / PARK_SHOP_PRICE_TAG_PREVIEW_BOX_SIZE;
}

/** Item-local price tag position. Existing shop JSON without tag coordinates
 * displays the same sensible lower-right default without a migration. */
export function parkShopPriceTagPoint(placement: ParkShopPlacement) {
  return { xPct: placement.priceTagXPct ?? PARK_SHOP_DEFAULT_PRICE_TAG.xPct,
    yPct: placement.priceTagYPct ?? PARK_SHOP_DEFAULT_PRICE_TAG.yPct };
}

/** Works in actual preview pixels on either a phone or tablet; bounded so the
 * price tag remains accessible within the selected merchandise artwork. */
export function parkShopPriceTagFromPointer(clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number }) {
  const clamp = (value: number) => Math.max(PARK_SHOP_PRICE_TAG_MIN, Math.min(PARK_SHOP_PRICE_TAG_MAX, value));
  return { priceTagXPct: clamp(rect.width > 0 ? (clientX - rect.left) / rect.width : PARK_SHOP_DEFAULT_PRICE_TAG.xPct),
    priceTagYPct: clamp(rect.height > 0 ? (clientY - rect.top) / rect.height : PARK_SHOP_DEFAULT_PRICE_TAG.yPct) };
}

function validParkShopPriceTag(point: ParkShopPlacement): boolean {
  return (point.priceTagXPct === undefined && point.priceTagYPct === undefined) ||
    (typeof point.priceTagXPct === "number" && Number.isFinite(point.priceTagXPct) &&
     point.priceTagXPct >= PARK_SHOP_PRICE_TAG_MIN && point.priceTagXPct <= PARK_SHOP_PRICE_TAG_MAX &&
     typeof point.priceTagYPct === "number" && Number.isFinite(point.priceTagYPct) &&
     point.priceTagYPct >= PARK_SHOP_PRICE_TAG_MIN && point.priceTagYPct <= PARK_SHOP_PRICE_TAG_MAX);
}


/** Keep old JSON placements valid while rejecting malformed/new non-integer rotations. */
export function validParkShopRotation(value: unknown): boolean {
  return value === undefined ||
    (Number.isInteger(value) && (value as number) >= 0 && (value as number) < 360);
}

export function rotateParkShopPlacement(placement: ParkShopPlacement): ParkShopPlacement {
  return { ...placement, rotation: ((placement.rotation ?? 0) + PARK_SHOP_ROTATION_STEP) % 360 };
}

/** Mirror only the item artwork; the independently positioned price marker stays upright. */
export function flipParkShopPlacement(placement: ParkShopPlacement): ParkShopPlacement {
  return { ...placement, flippedX: !(placement.flippedX ?? false) };
}

export function validParkShopPlacements(value: unknown): value is ParkShopPlacement[] {
  return Array.isArray(value) && value.length <= PARK_SHOP_MAX_ITEMS &&
    new Set(value.map(item => item?.itemId)).size === value.length &&
    value.every(item => item && typeof item === "object" && !Array.isArray(item) &&
      typeof item.itemId === "string" && item.itemId.length > 0 && item.itemId.length <= 100 &&
      isFraction(item.xPct) && isFraction(item.yPct) &&
      Number.isInteger(item.size) && item.size >= PARK_SHOP_MIN_SIZE && item.size <= PARK_SHOP_MAX_SIZE &&
      validParkShopRotation(item.rotation) &&
      (item.flippedX === undefined || typeof item.flippedX === "boolean") && validParkShopPriceTag(item));
}
function isFraction(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function defaultParkShopPlacement(itemId: string, index: number): ParkShopPlacement {
  // Center the first item for mobile portrait rooms, whose image can
  // extend well outside the visible viewport horizontally.
  const columns = [.5, .35, .65];
  return { itemId, xPct: columns[index % columns.length],
    yPct: .38 + (Math.floor(index / columns.length) % 4) * .14, size: 12, rotation: 0, flippedX: false,
    priceTagXPct: PARK_SHOP_DEFAULT_PRICE_TAG.xPct,
    priceTagYPct: PARK_SHOP_DEFAULT_PRICE_TAG.yPct };
}
export function withParkShopDefaults(ids: readonly string[], placements: readonly ParkShopPlacement[]): ParkShopPlacement[] {
  const byId = new Map(placements.map(value => [value.itemId, value]));
  return ids.map((id, index) => byId.get(id) ?? defaultParkShopPlacement(id, index));
}
