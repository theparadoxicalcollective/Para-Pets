export const COSTUME_ITEM_TYPE = "costume" as const;

export function isCostumeItemType(type: unknown): type is typeof COSTUME_ITEM_TYPE {
  return type === COSTUME_ITEM_TYPE;
}

export function getItemTypeLabel(type: string): string {
  if (type === COSTUME_ITEM_TYPE) return "Costume";
  return type.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
