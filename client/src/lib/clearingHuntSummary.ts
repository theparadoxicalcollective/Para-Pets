import type { ClearingRewardChest } from "@shared/clearingEquipment";

/** Display-only totals from confirmed responses. This never grants rewards. */
export interface ClearingHuntSummary {
  enemyIds: string[];
  chestIds: string[];
  eggIds: string[];
  claimedChestIds: string[];
  collectedEggIds: string[];
  exp: number;
  coins: number;
  essence: number;
  gear: number;
  bossName: string | null;
}

export function emptyClearingHunt(): ClearingHuntSummary {
  return { enemyIds: [], chestIds: [], eggIds: [], claimedChestIds: [], collectedEggIds: [], exp: 0, coins: 0, essence: 0, gear: 0, bossName: null };
}

export function recordHuntDefeat(hunt: ClearingHuntSummary, defeat: {
  enemyId: string; exp: number; chestId?: string; eggId?: string; bossName?: string;
}): ClearingHuntSummary {
  if (hunt.enemyIds.includes(defeat.enemyId)) return hunt;
  return {
    ...hunt,
    enemyIds: [...hunt.enemyIds, defeat.enemyId],
    chestIds: defeat.chestId ? [...hunt.chestIds, defeat.chestId] : hunt.chestIds,
    eggIds: defeat.eggId ? [...hunt.eggIds, defeat.eggId] : hunt.eggIds,
    exp: hunt.exp + Math.max(0, defeat.exp),
    bossName: defeat.bossName ?? hunt.bossName,
  };
}

export function recordHuntChest(hunt: ClearingHuntSummary, chest: ClearingRewardChest): ClearingHuntSummary {
  if (!hunt.chestIds.includes(chest.chestId) || hunt.claimedChestIds.includes(chest.chestId)) return hunt;
  return {
    ...hunt,
    claimedChestIds: [...hunt.claimedChestIds, chest.chestId],
    coins: hunt.coins + chest.rewards.coins,
    essence: hunt.essence + chest.rewards.essence,
    gear: hunt.gear + chest.rewards.items.filter(item => item.type === "clearing").reduce((total, item) => total + item.quantity, 0),
  };
}

export function recordHuntEgg(hunt: ClearingHuntSummary, eggId: string): ClearingHuntSummary {
  if (!hunt.eggIds.includes(eggId) || hunt.collectedEggIds.includes(eggId)) return hunt;
  return { ...hunt, collectedEggIds: [...hunt.collectedEggIds, eggId] };
}
