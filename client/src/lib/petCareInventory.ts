export const PET_CARE_STACK_LIMIT = 30;

export type PetCareInventoryItem = {
  id: string;
  shopItemId: string;
  quantity?: number | null;
  type?: string | null;
};

export type PetCareInventoryStack<T> = T & {
  stackId: string;
  /** The number shown on this shelf slot. */
  displayQuantity: number;
  /** Every drag/tap applies exactly one inventory unit. */
  quantity: 1;
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
 * Builds shelf slots from persisted inventory quantities. `shopItemId` is the
 * stable item-definition identifier; inventory row ids, names, and artwork are
 * deliberately not used to decide whether two items are identical.
 *
 * `displayQuantity` owns presentation only. Edibles still appear in visible
 * stacks of at most 30 and Gifts remain one per slot, but `quantity` is always
 * one so a single drag can never open a bulk-use flow or consume more than the
 * item the player actually moved. The persisted inventory row remains the
 * authoritative source for the remaining amount.
 */
export function buildPetCareInventoryStacks<T extends PetCareInventoryItem>(
  items: readonly T[],
  stackLimit = PET_CARE_STACK_LIMIT,
): PetCareInventoryStack<T>[] {
  if (!Number.isInteger(stackLimit) || stackLimit < 1) {
    throw new Error("Pet care stack limit must be a positive integer");
  }

  return items.flatMap((item) => {
    const persistedQuantity = Math.max(1, Math.floor(item.quantity ?? 1));
    const displayLimit = item.type === "gift" ? 1 : stackLimit;
    const stackCount = Math.ceil(persistedQuantity / displayLimit);

    return Array.from({ length: stackCount }, (_, stackIndex) => ({
      ...item,
      stackId: `${item.shopItemId}:${item.id}:${stackIndex}`,
      displayQuantity: Math.min(
        displayLimit,
        persistedQuantity - stackIndex * displayLimit,
      ),
      quantity: 1 as const,
    }));
  });
}
