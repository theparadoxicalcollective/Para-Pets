/** Garden configuration and progression shared by server, Admin Realm and Pet Park.
 * All quantities are measured in individual water drops. The server owns
 * transitions, inventory deductions, rewards and the harvest cooldown.
 */
export const GARDEN_WATER_CAPACITY = 100;
export const GARDEN_PICKED_COOLDOWN_MS = 30_000;
export const GARDEN_HARVEST_COUNTS = [1, 2, 3] as const;
export const GARDEN_PHASES = [
  { key: "planted", label: "Planted seed", waterLabel: "Drops to seedling" },
  { key: "seedling", label: "Seedling", waterLabel: "Drops to partial growth" },
  { key: "partial", label: "Partially grown", waterLabel: "Drops to full growth" },
  { key: "grown", label: "Fully grown", waterLabel: "Drops until harvest-ready" },
  { key: "picked", label: "Picked", waterLabel: "" },
] as const;
export type GardenPhase = typeof GARDEN_PHASES[number]["key"];
export type GardenToolKind = "watering_pail" | "hoe" | "scythe";
export type GardenShopType = "garden_seed" | "garden_fruit" | "garden_tool";
export const GARDEN_TOOL_OPTIONS = [
  { key: "watering_pail", label: "Watering Pail", description: "Carries 100 drops of water" },
  { key: "hoe", label: "Hoe", description: "Prepares an empty garden plot" },
  { key: "scythe", label: "Scythe", description: "Harvests a fully grown plant" },
] as const;
export const GARDEN_IMAGE_KEYS = [
  "seedPack", "planted", "seedling", "partial", "grown", "picked", "fruit",
] as const;
export type GardenImageKey = typeof GARDEN_IMAGE_KEYS[number];
export type GardenImages = Record<GardenImageKey, string | null>;

export function validGardenDrops(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 1000;
}
export function validGardenPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}
export function validGardenArtwork(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8_000_000 &&
    /^data:image\/(?:png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(value);
}
/** Crop artwork may be saved as a draft; only complete crops are plantable. */
export function isCompleteGardenCrop(input: {
  images: GardenImages;
  drops: readonly number[];
}): boolean {
  return GARDEN_IMAGE_KEYS.every(key => !!input.images[key]) &&
    input.drops.length === 4 && input.drops.every(validGardenDrops);
}
/** Discrete, server-side harvest rarity: 75% one, 20% two, 5% three.
 * A random source is injectable for deterministic tests, never provided by clients.
 */
export function gardenHarvestQuantity(random: number = Math.random()): 1 | 2 | 3 {
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid server random source");
  return random < .75 ? 1 : random < .95 ? 2 : 3;
}
/** Display images are bottom-center anchored on the garden diamond, so
 * growth never shifts sideways even when admin images have different dimensions.
 */
export const GARDEN_PLANT_ANCHOR = { x: .5, y: .5 } as const;
