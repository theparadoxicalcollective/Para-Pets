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
 * `displayQuantity` owns presentation only. Each persisted inventory row gets
 * one stable shelf slot, while `quantity` is always one so a drag or tap can
 * consume exactly one unit. The persisted inventory remains authoritative.
 */
export function buildPetCareInventoryStacks<T extends PetCareInventoryItem>(
  items: readonly T[],
  stackLimit = PET_CARE_STACK_LIMIT,
): PetCareInventoryStack<T>[] {
  if (!Number.isInteger(stackLimit) || stackLimit < 1) {
    throw new Error("Pet care stack limit must be a positive integer");
  }

  return items.map((item) => {
    const persistedQuantity = Math.max(1, Math.floor(item.quantity ?? 1));
    return {
      ...item,
      stackId: `${item.shopItemId}:${item.id}`,
      displayQuantity: persistedQuantity,
      quantity: 1 as const,
    };
  });
}
