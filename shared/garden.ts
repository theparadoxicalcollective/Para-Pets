/** Garden configuration and progression shared by server, Admin Realm and Pet Park.
 * All quantities are measured in individual water drops. The server owns
 * transitions, inventory deductions, rewards and the harvest cooldown.
 */
export const GARDEN_WATER_CAPACITY = 100;
/** Maximum drops poured by one tool tap; never cross a crop stage boundary. */
export const GARDEN_WATER_POUR_DROPS = 10;
/** UI and server use the same eligibility rule for a refillable inventory
 * row. An unopened container (NULL charges) is already full, not empty. */
export function gardenItemNeedsRefill(item: {
  isRefillable?: boolean | null;
  isListed?: boolean | null;
  quantity?: number | null;
  gardenWaterLeft?: number | null;
}): boolean {
  // Admin's explicit Refillable flag authorizes use at water sources.
  // Item type and special effects remain unchanged by refilling.
  return item.isRefillable === true && item.isListed !== true &&
    (item.quantity ?? 1) > 0 &&
    Number.isInteger(item.gardenWaterLeft ?? GARDEN_WATER_CAPACITY) &&
    (item.gardenWaterLeft ?? GARDEN_WATER_CAPACITY) >= 0 &&
    (item.gardenWaterLeft ?? GARDEN_WATER_CAPACITY) < GARDEN_WATER_CAPACITY;
}


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
/** Each crop growth image has an independent plot-relative placement.
 * x/y are offsets measured in plot-width units; scale is a multiplier of
 * the plot width. Admin preview and player renderer share this contract. */
export type GardenStagePlacement = { x: number; y: number; scale: number };
export type GardenStagePlacements = Partial<Record<GardenPhase, GardenStagePlacement>>;
export const DEFAULT_GARDEN_STAGE_PLACEMENT: GardenStagePlacement = { x: 0, y: 0, scale: 0.55 };
export const GARDEN_PLACEMENT_MIN_SCALE = 0.15;
export const GARDEN_PLACEMENT_MAX_SCALE = 1.5;
export const GARDEN_PLACEMENT_MAX_OFFSET = 1.25;
export function validGardenStagePlacement(value: unknown): value is GardenStagePlacement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).length === 3 &&
    ["x", "y", "scale"].every(key => typeof data[key] === "number" && Number.isFinite(data[key])) &&
    Math.abs(data.x as number) <= GARDEN_PLACEMENT_MAX_OFFSET &&
    Math.abs(data.y as number) <= GARDEN_PLACEMENT_MAX_OFFSET &&
    (data.scale as number) >= GARDEN_PLACEMENT_MIN_SCALE &&
    (data.scale as number) <= GARDEN_PLACEMENT_MAX_SCALE;
}

export type GardenToolKind = "watering_pail" | "hoe" | "scythe";
export type GardenShopType = "garden_seed" | "garden_fruit" | "garden_tool";
/** Base garden equipment is unique by *kind* across different catalog items.
 * Seed packets, harvested fruit, and future consumables remain stackable. */
export function baseGardenToolKind(item: { type?: string | null; specialType?: string | null }):
  GardenToolKind | null {
  return item.type === "garden_tool" &&
    (item.specialType === "hoe" || item.specialType === "scythe" ||
      item.specialType === "watering_pail") ? item.specialType : null;
}

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

export type GardenPlotPhase = "empty" | "tilled" | GardenPhase;
export type GardenGrowingPhase = "planted" | "seedling" | "partial" | "grown";
export type GardenWaterRequirements = Record<GardenGrowingPhase, number>;
export type GardenGrowth = {
  phase: GardenPlotPhase;
  waterApplied: number;
  harvestReady: boolean;
};
/** Exactly one water drop advances at most one phase. No elapsed-time growth,
 * client-provided stage skips or implicit free watering.
 */
export function gardenAfterWaterDrop(current: GardenGrowth, required: GardenWaterRequirements): GardenGrowth {
  if (!(current.phase === "planted" || current.phase === "seedling" ||
        current.phase === "partial" || current.phase === "grown") || current.harvestReady)
    throw new Error("This plot cannot be watered now");
  const threshold = required[current.phase];
  if (!validGardenDrops(threshold) || !Number.isSafeInteger(current.waterApplied) ||
      current.waterApplied < 0 || current.waterApplied >= threshold)
    throw new Error("Invalid garden growth progress");
  const progress = current.waterApplied + 1;
  if (progress < threshold)
    return { phase: current.phase, waterApplied: progress, harvestReady: false };
  const next: Record<GardenGrowingPhase, GardenGrowingPhase> = {
    planted: "seedling", seedling: "partial", partial: "grown", grown: "grown",
  };
  return current.phase === "grown"
    ? { phase: "grown", waterApplied: threshold, harvestReady: true }
    : { phase: next[current.phase], waterApplied: 0, harvestReady: false };
}
/** One authenticated watering action uses up to ten real drops. It stops at
 * the next stage, harvest readiness, or the remaining water in the pail.
 * No surplus drops vanish and the next stage must be watered separately. */
export function gardenAfterWaterPour(
  current: GardenGrowth, required: GardenWaterRequirements, availableDrops: number,
): { growth: GardenGrowth; dropsUsed: number } {
  if (!Number.isSafeInteger(availableDrops) || availableDrops < 1)
    throw new Error("The Watering Pail is empty");
  const maxDrops = Math.min(GARDEN_WATER_POUR_DROPS, availableDrops);
  let growth = current;
  let dropsUsed = 0;
  for (let i = 0; i < maxDrops; i++) {
    const next = gardenAfterWaterDrop(growth, required);
    growth = next;
    dropsUsed++;
    if (growth.phase !== current.phase || growth.harvestReady) break;
  }
  return { growth, dropsUsed };
}

/** Called at read and before mutation: picked plots have a server 30s lockout
 * and return to an unprepared empty diamond afterward.
 */
export function gardenEffectivePhase(
  phase: GardenPlotPhase, pickedUntil: Date | null | undefined, now: Date = new Date(),
): GardenPlotPhase {
  return phase === "picked" && pickedUntil && pickedUntil.getTime() <= now.getTime()
    ? "empty" : phase;
}

/** Player endpoint contract; positions and progression are server-authored, not
 * inferred from client timers or a second set of Pet Park coordinates. */
export type GardenPlayerPlot = {
  plotItemId: string; xPct: number; yPct: number; size: number;
  phase: GardenPlotPhase; cropId: string | null; waterApplied: number;
  harvestReady: boolean; pickedUntil: string | null;
};
export type GardenPlayerCrop = {
  id: string; seedItemId: string; fruitItemId: string;
  seedName: string; fruitName: string; ready: boolean;
  images: GardenImages; drops: GardenWaterRequirements;
  stagePlacements: GardenStagePlacements;
};
export type GardenPlayerState = {
  serverNow: string; plots: GardenPlayerPlot[]; crops: GardenPlayerCrop[];
};
export type GardenPlayerAction = "hoe" | "plant" | "water" | "harvest";
export type GardenActionResult = {
  plot: GardenPlayerPlot; replayed: boolean;
  remainingQuantity?: number; waterLeft?: number;
  reward?: { fruitItemId: string; quantity: number };
};
/** UI affordances follow server state; no client-side free growth/reset. */
export function gardenActionForPlot(plot: Pick<GardenPlayerPlot, "phase" | "harvestReady">): GardenPlayerAction | null {
  if (plot.phase === "empty") return "hoe";
  if (plot.phase === "tilled") return "plant";
  if (plot.phase === "picked") return null;
  if (plot.phase === "grown" && plot.harvestReady) return "harvest";
  return "water";
}
export function gardenCropProgress(
  plot: Pick<GardenPlayerPlot, "phase" | "waterApplied" | "harvestReady">,
  crop?: GardenPlayerCrop | null,
): { value: number; required: number } | null {
  if (!crop || !["planted", "seedling", "partial", "grown"].includes(plot.phase) || plot.harvestReady) return null;
  const required = crop.drops[plot.phase as GardenGrowingPhase];
  return validGardenDrops(required)
    ? { value: Math.max(0, Math.min(required, plot.waterApplied)), required } : null;
}
