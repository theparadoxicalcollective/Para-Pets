/** Presentation-only inventory ordering. Never reorders or mutates the API cache.
 * Starred items: highest rarity first, then by the name the player sees.
 * Ordinary items: alphabetical. Equal display names use stable identifiers.
 */
export type InventorySortable = {
  name: string;
  petNickname?: string | null;
  rarity?: number | null;
  starRarity?: number | null;
  inventoryId?: string;
  shopItemId?: string;
  key?: string;
};

const names = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function visibleInventoryName(item: InventorySortable): string {
  return item.petNickname?.trim() || item.name.trim();
}

export function compareInventoryByRarityThenName(
  a: InventorySortable,
  b: InventorySortable,
): number {
  // The inventory API exposes both fields. Most Mini Pets use rarity, while
  // some starred shop categories store the authoritative stars in starRarity.
  const aStars = a.starRarity ?? a.rarity;
  const bStars = b.starRarity ?? b.rarity;
  const starA = typeof aStars === "number" && Number.isFinite(aStars) ? aStars : 0;
  const starB = typeof bStars === "number" && Number.isFinite(bStars) ? bStars : 0;
  const rarityDifference = starB - starA;
  if (rarityDifference !== 0) return rarityDifference;

  const nameDifference = names.compare(visibleInventoryName(a), visibleInventoryName(b));
  if (nameDifference !== 0) return nameDifference;

  // Distinct owned items with the same name keep a predictable presentation.
  return names.compare(a.inventoryId ?? a.shopItemId ?? a.key ?? "",
    b.inventoryId ?? b.shopItemId ?? b.key ?? "");
}
