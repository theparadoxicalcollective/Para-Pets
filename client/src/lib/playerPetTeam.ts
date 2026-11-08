/** Pure, inventory-aware selectors shared by PvP, Raid, and the upcoming
 * main-page team strip. Only the server can authorize the final saved roster. */
export const PLAYER_PET_TEAM_MAX = 5;

export type PlayerPetTeam = {
  petInventoryIds: string[];
  attackPower: number;
};

export const playerPetTeamQueryKey = (userId: string | null | undefined) =>
  ["/api/player/pet-team", userId ?? ""] as const;

export function samePetTeam(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function eligiblePetIds(inventory: readonly {
  inventoryId?: string; id?: string; type?: string;
  isHatched?: boolean; isListed?: boolean;
}[]): string[] {
  return inventory
    .filter((pet) => pet.type === "pet" && pet.isHatched === true && !pet.isListed)
    .map((pet) => pet.inventoryId || pet.id || "")
    .filter(Boolean);
}

export function cleanPetTeam(ids: readonly string[], allowedIds: readonly string[]): string[] {
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (!allowed.has(id) || seen.has(id) || seen.size >= PLAYER_PET_TEAM_MAX) return false;
    seen.add(id);
    return true;
  });
}

export function togglePetTeamMember(
  current: readonly string[],
  inventoryId: string,
  allowedIds: readonly string[],
): string[] {
  const clean = cleanPetTeam(current, allowedIds);
  if (!allowedIds.includes(inventoryId)) return clean;
  if (clean.includes(inventoryId)) return clean.filter((id) => id !== inventoryId);
  return clean.length < PLAYER_PET_TEAM_MAX ? [...clean, inventoryId] : clean;
}
