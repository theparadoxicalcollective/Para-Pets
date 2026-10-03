import { GAME_ITEM_CATEGORY_LABELS, getGameItemCategory } from "@shared/itemTaxonomy";

export const itemTypeLabel = (type: unknown, fishingType?: unknown): string => {
  const value = typeof type === "string" && type.trim() ? type.trim() : "item";
  const category = getGameItemCategory({
    type: value,
    fishingType: typeof fishingType === "string" ? fishingType : null,
  });
  return GAME_ITEM_CATEGORY_LABELS[category]
    ?? value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
};

export const itemTypeOptions = (items: Array<{ type?: unknown }>) =>
  [...new Set(items.map(item => typeof item.type === "string" && item.type.trim() ? item.type.trim() : "item"))]
    .sort((left, right) => itemTypeLabel(left).localeCompare(itemTypeLabel(right)));
