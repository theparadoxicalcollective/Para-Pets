export const GAME_ITEM_GROUPS = [
  { key: "pets", label: "Pets", categories: ["pets", "mini_pets", "costumes", "accessories"] },
  { key: "fish", label: "Fish", categories: ["fish", "poles", "bait"] },
  { key: "home", label: "Home", categories: ["objects", "decor", "homes"] },
  { key: "items", label: "Items", categories: ["potions", "power_ups", "specials", "edibles", "gifts", "ingredients", "recipes", "clearing"] },
] as const;

export type GameItemGroupKey = typeof GAME_ITEM_GROUPS[number]["key"];
export type GameItemCategoryKey = typeof GAME_ITEM_GROUPS[number]["categories"][number];

export const GAME_ITEM_CATEGORY_LABELS: Record<GameItemCategoryKey, string> = {
  pets: "Pets",
  mini_pets: "Mini Pets",
  costumes: "Adornments",
  accessories: "Accessories",
  fish: "Fish",
  poles: "Poles",
  bait: "Bait",
  objects: "Objects",
  decor: "Decor",
  homes: "Homes",
  potions: "Potion",
  power_ups: "Power-Ups",
  specials: "Special",
  edibles: "Edibles",
  gifts: "Gifts",
  ingredients: "Ingredients",
  recipes: "Recipes",
  clearing: "Clearing Equipment",
};

export const GAME_ITEM_CATEGORY_ORDER: GameItemCategoryKey[] = GAME_ITEM_GROUPS.flatMap(
  group => [...group.categories],
) as GameItemCategoryKey[];

export interface GameItemTaxonomyInput {
  type?: string | null;
  fishingType?: string | null;
  assetKind?: "home_bundle" | "home_decor" | "home_object" | null;
  itemType?: string | null;
}

export function getGameItemCategory(input: GameItemTaxonomyInput): GameItemCategoryKey {
  if (input.assetKind === "home_bundle") return "homes";
  if (input.assetKind === "home_decor") return "decor";
  if (input.assetKind === "home_object") return "objects";

  const rawType = String(input.itemType ?? input.type ?? "").trim().toLowerCase();
  const fishingType = String(input.fishingType ?? "").trim().toLowerCase();

  if (rawType === "pet" || rawType === "pet_egg") return "pets";
  if (rawType === "mini_pet") return "mini_pets";
  if (rawType === "costume" || rawType === "adornment") return "costumes";
  if (rawType === "accessory") return "accessories";

  if (rawType === "fish") return "fish";
  if (rawType === "pole") return "poles";
  if (rawType === "bait") return "bait";
  if (rawType === "fishing") {
    if (fishingType === "pole") return "poles";
    if (fishingType === "bait") return "bait";
    return "fish";
  }

  if (rawType === "object" || rawType === "home_object") return "objects";
  if (rawType === "decor" || rawType === "home_decor") return "decor";
  if (rawType === "home" || rawType === "house" || rawType === "home_bundle") return "homes";

  if (rawType === "potion") return "potions";
  if (rawType === "power_up" || rawType === "item") return "power_ups";
  if (rawType === "special") return "specials";
  if (rawType === "edibles" || rawType === "edible") return "edibles";
  if (rawType === "gift") return "gifts";
  if (rawType === "ingredient") return "ingredients";
  if (rawType === "recipe") return "recipes";
  if (rawType === "clearing" || rawType === "clearing_equipment") return "clearing";

  // Unknown player-facing inventory types stay visible instead of being
  // silently dropped. "Special" is the safest catch-all until Admin assigns
  // a first-class taxonomy category.
  return "specials";
}

export function getGameItemGroup(category: GameItemCategoryKey): GameItemGroupKey {
  return GAME_ITEM_GROUPS.find(group =>
    (group.categories as readonly string[]).includes(category),
  )?.key ?? "items";
}

export function getGameItemTaxonomy(input: GameItemTaxonomyInput): {
  group: GameItemGroupKey;
  category: GameItemCategoryKey;
  groupLabel: string;
  categoryLabel: string;
} {
  const category = getGameItemCategory(input);
  const group = getGameItemGroup(category);
  return {
    group,
    category,
    groupLabel: GAME_ITEM_GROUPS.find(entry => entry.key === group)?.label ?? "Items",
    categoryLabel: GAME_ITEM_CATEGORY_LABELS[category],
  };
}

export function gameItemCategoriesForGroup(group: GameItemGroupKey): GameItemCategoryKey[] {
  const match = GAME_ITEM_GROUPS.find(entry => entry.key === group);
  return match ? [...match.categories] as GameItemCategoryKey[] : [];
}
