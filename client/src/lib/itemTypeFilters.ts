export const itemTypeLabel = (type: unknown): string => {
  const value = typeof type === "string" && type.trim() ? type.trim() : "item";
  const known: Record<string, string> = {
    accessory: "Gear",
    clearing: "Clearing Gear",
    edibles: "Edibles",
    fishing: "Fishing",
    gift: "Gifts",
    ingredient: "Ingredients",
    item: "Items",
    pet: "Pets",
    potion: "Potions",
    recipe: "Recipes",
    special: "Special",
  };
  return known[value] ?? value.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
};

export const itemTypeOptions = (items: Array<{ type?: unknown }>) =>
  [...new Set(items.map(item => typeof item.type === "string" && item.type.trim() ? item.type.trim() : "item"))]
    .sort((left, right) => itemTypeLabel(left).localeCompare(itemTypeLabel(right)));
