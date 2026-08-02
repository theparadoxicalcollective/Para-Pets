export const PET_CARE_STACK_LIMIT = 30;

export type PetCareInventoryItem = {
  id: string;
  shopItemId: string;
  quantity?: number | null;
};

export type PetCareInventoryStack<T> = T & {
  stackId: string;
  quantity: number;
};

export type PetCareEffectItem = {
  statBoostAmount?: number | null;
  giftPoints?: number | null;
};

/** Orders care items from the smallest bar increase to the largest. */
export function orderPetCareItemsByEffect<T extends PetCareEffectItem>(
  items: readonly T[],
  kind: "edibles" | "gifts",
): T[] {
  const effectAmount = (item: T) =>
    kind === "edibles" ? item.statBoostAmount : item.giftPoints;

  return [...items].sort(
    (left, right) =>
      (effectAmount(left) ?? Number.POSITIVE_INFINITY) -
      (effectAmount(right) ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * Builds display stacks from the persisted inventory quantities. shopItemId is
 * the stable item-definition identifier; inventory row ids, names, and artwork
 * are deliberately not used to decide whether two items are identical.
 *
 * Inventory rows remain untouched and are still the consumption source of
 * truth. A large persisted quantity is only divided into shelf-sized views.
 */
export function buildPetCareInventoryStacks<T extends PetCareInventoryItem>(
  items: readonly T[],
  stackLimit = PET_CARE_STACK_LIMIT,
): PetCareInventoryStack<T>[] {
  if (!Number.isInteger(stackLimit) || stackLimit < 1) {
    throw new Error("Pet care stack limit must be a positive integer");
  }

  return items.flatMap((item) => {
    const quantity = Math.max(1, Math.floor(item.quantity ?? 1));
    const stackCount = Math.ceil(quantity / stackLimit);

    return Array.from({ length: stackCount }, (_, stackIndex) => ({
      ...item,
      stackId: `${item.shopItemId}:${item.id}:${stackIndex}`,
      quantity: Math.min(stackLimit, quantity - stackIndex * stackLimit),
    }));
  });
}
