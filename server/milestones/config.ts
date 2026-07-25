export type PurchaseMilestoneDefinition = {
  id: string;
  threshold: number;
  repeatable: true;
  advancesCycle: boolean;
};

// Stable IDs and thresholds intentionally match the existing contribution bar.
// Reward contents remain administrator-configured in purchase_milestone_rewards;
// that database row is resolved and locked by the server during every claim.
export const PURCHASE_MILESTONES: readonly PurchaseMilestoneDefinition[] = [
  { id: "500", threshold: 500, repeatable: true, advancesCycle: false },
  { id: "2500", threshold: 2500, repeatable: true, advancesCycle: false },
  { id: "5000", threshold: 5000, repeatable: true, advancesCycle: false },
  { id: "10000", threshold: 10000, repeatable: true, advancesCycle: true },
] as const;

export function purchaseMilestoneById(id: string): PurchaseMilestoneDefinition | undefined {
  return PURCHASE_MILESTONES.find((milestone) => milestone.id === id);
}
