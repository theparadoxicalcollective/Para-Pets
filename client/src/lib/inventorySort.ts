/** Presentation-only inventory ordering. Never reorders or mutates the API cache.
 * Starred items: highest rarity first, then by the name the player sees.
 * Ordinary items: alphabetical. Equal display names use stable identifiers.
 */
export type InventorySortable = {
  name: string;
  petNickname?: string | null;
  rarity?: number | null;
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
  const starA = typeof a.rarity === "number" && Number.isFinite(a.rarity) ? a.rarity : 0;
  const starB = typeof b.rarity === "number" && Number.isFinite(b.rarity) ? b.rarity : 0;
  const rarityDifference = starB - starA;
  if (rarityDifference !== 0) return rarityDifference;

  const nameDifference = names.compare(visibleInventoryName(a), visibleInventoryName(b));
  if (nameDifference !== 0) return nameDifference;

  // Distinct owned items with the same name keep a predictable presentation.
  return names.compare(a.inventoryId ?? a.shopItemId ?? a.key ?? "",
    b.inventoryId ?? b.shopItemId ?? b.key ?? "");
}
