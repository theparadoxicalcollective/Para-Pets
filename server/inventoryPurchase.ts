/**
 * The small transaction boundary used by the coin shop.  Keeping the debit
 * and grant behind the same callback makes it impossible for callers to
 * accidentally introduce a compensating-refund path.
 */
export type PurchaseResult<User, Inventory> =
  | { ok: true; user: User; inventory: Inventory; quantity: number; totalCost: number }
  | { ok: false; reason: "insufficient-funds" };

export interface InventoryPurchaseOperations<Transaction, User, Inventory> {
  transaction<Result>(work: (transaction: Transaction) => Promise<Result>): Promise<Result>;
  deductCoins(transaction: Transaction, userId: string, cost: number): Promise<User | undefined>;
  grant(transaction: Transaction, input: { userId: string; quantity: number }): Promise<Inventory>;
}

export async function purchaseInventoryItem<Transaction, User, Inventory>(
  operations: InventoryPurchaseOperations<Transaction, User, Inventory>,
  input: { userId: string; unitPrice: number; quantity: number },
): Promise<PurchaseResult<User, Inventory>> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 20) {
    throw new RangeError("Quantity must be a whole number between 1 and 20");
  }

  const totalCost = input.unitPrice * input.quantity;
  return operations.transaction(async (transaction) => {
    const user = await operations.deductCoins(transaction, input.userId, totalCost);
    if (!user) return { ok: false, reason: "insufficient-funds" };

    // If grant throws, Drizzle rejects the transaction callback and rolls the
    // guarded debit back with it.
    const inventory = await operations.grant(transaction, { userId: input.userId, quantity: input.quantity });
    return { ok: true, user, inventory, quantity: input.quantity, totalCost };
  });
}
