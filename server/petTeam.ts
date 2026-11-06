/** Domain rules for the player's persistent five-pet battle team.
 * Kept independent of PvP screens and database access so both the legacy
 * PvP endpoint and future player-team consumers enforce identical rules.
 */
export const PET_TEAM_LIMIT = 5;

export class PetTeamSelectionError extends Error {
  constructor(message: string, public readonly status: 400 | 422 = 400) {
    super(message);
    this.name = "PetTeamSelectionError";
  }
}

export interface PetTeamRecord {
  id: string;
  userId: string;
  type: string;
  isHatched: boolean;
  isListed: boolean;
  petAtk: number | null;
  petDef: number | null;
  petLevel: number | null;
}

export function parsePetTeamSelection(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new PetTeamSelectionError("petInventoryIds must be an array");
  }
  if (value.length > PET_TEAM_LIMIT) {
    throw new PetTeamSelectionError("A pet team can contain at most five pets");
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !id.trim() || id !== id.trim() || id.length > 128) {
      throw new PetTeamSelectionError("Every pet must have a valid inventory ID");
    }
    if (seen.has(id)) {
      throw new PetTeamSelectionError("A pet cannot occupy more than one team slot");
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Read-time reconciliation: exclude invalid legacy/stale IDs without writing to
 * the database. A subsequent explicit save persists the cleaned selection.
 * The order of surviving pets is never changed.
 */
export function resolvePetTeam(
  savedIds: readonly string[] | null | undefined,
  ownerId: string,
  records: readonly PetTeamRecord[],
): { petInventoryIds: string[]; attackPower: number } {
  const eligible = new Map(
    records
      .filter((pet) =>
        pet.userId === ownerId &&
        pet.type === "pet" &&
        pet.isHatched &&
        !pet.isListed
      )
      .map((pet) => [pet.id, pet] as const),
  );
  const petInventoryIds: string[] = [];
  const seen = new Set<string>();
  let attackPower = 0;
  for (const id of (Array.isArray(savedIds) ? savedIds : []).slice(0, PET_TEAM_LIMIT)) {
    if (typeof id !== "string" || seen.has(id)) continue;
    const pet = eligible.get(id);
    if (!pet) continue;
    seen.add(id);
    petInventoryIds.push(id);
    // Preserve the established PvP matchmaking power formula.
    attackPower += (pet.petAtk ?? 50) + Math.floor((pet.petDef ?? 50) / 2) + (pet.petLevel ?? 1) * 5;
  }
  return { petInventoryIds, attackPower };
}
