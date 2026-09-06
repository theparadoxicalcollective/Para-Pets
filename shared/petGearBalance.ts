export type PetGearStats = {
  atkBoost?: number | null;
  defBoost?: number | null;
  healthBoost?: number | null;
};

export type PetGearBalanceStatus = "unpriced" | "underpowered" | "balanced" | "overpowered";

export const PET_GEAR_POWER_WEIGHTS = {
  atk: 1,
  def: 1,
  hp: 0.05,
} as const;

export const PET_GEAR_PRICE_BANDS = [
  { minPrice: 1, maxPrice: 500, minPower: 8, maxPower: 12 },
  { minPrice: 501, maxPrice: 1000, minPower: 13, maxPower: 18 },
  { minPrice: 1001, maxPrice: 1500, minPower: 19, maxPower: 24 },
  { minPrice: 1501, maxPrice: 2000, minPower: 25, maxPower: 30 },
  { minPrice: 2001, maxPrice: 2500, minPower: 31, maxPower: 35 },
  { minPrice: 2501, maxPrice: 3000, minPower: 36, maxPower: 40 },
  { minPrice: 3001, maxPrice: 3500, minPower: 41, maxPower: 46 },
  { minPrice: 3501, maxPrice: 5000, minPower: 47, maxPower: 55 },
  { minPrice: 5001, maxPrice: Number.POSITIVE_INFINITY, minPower: 56, maxPower: 65 },
] as const;

export const PET_GEAR_RARITY_BANDS = {
  1: { minPower: 8, maxPower: 15 },
  2: { minPower: 16, maxPower: 25 },
  3: { minPower: 26, maxPower: 38 },
  4: { minPower: 39, maxPower: 50 },
  5: { minPower: 51, maxPower: 65 },
} as const;

const safeStat = (value: number | null | undefined) => Math.max(0, Number(value ?? 0) || 0);

/**
 * Generic pet accessory/mini-pet power score.
 *
 * This deliberately does NOT replace Clearing equipment balance. Clearing gear
 * has slot-specific weights in server/clearingEquipmentBalance.ts because a
 * weapon ATK point and an armor DEF point have different combat value there.
 */
export function petGearPower(stats: PetGearStats): number {
  return Math.round(
    safeStat(stats.atkBoost) * PET_GEAR_POWER_WEIGHTS.atk +
      safeStat(stats.defBoost) * PET_GEAR_POWER_WEIGHTS.def +
      safeStat(stats.healthBoost) * PET_GEAR_POWER_WEIGHTS.hp,
  );
}

export function petGearPriceBand(price: number) {
  if (!Number.isFinite(price) || price <= 0) return null;
  return PET_GEAR_PRICE_BANDS.find((band) => price >= band.minPrice && price <= band.maxPrice) ?? null;
}

export function auditPetGearBalance(input: PetGearStats & { price: number }) {
  const power = petGearPower(input);
  const band = petGearPriceBand(input.price);
  if (!band) {
    return { status: "unpriced" as const, power, band: null };
  }
  const status: PetGearBalanceStatus =
    power < band.minPower ? "underpowered" : power > band.maxPower ? "overpowered" : "balanced";
  return { status, power, band };
}

export function rarityBand(stars: number | null | undefined) {
  const rarity = Math.max(1, Math.min(5, Math.trunc(Number(stars ?? 1)))) as keyof typeof PET_GEAR_RARITY_BANDS;
  return PET_GEAR_RARITY_BANDS[rarity];
}
