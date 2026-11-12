/** Outdoor garden soil tiles in Home Bundle scenes. This is scene layout only;
 * it never grants inventory, modifies crops or affects the Pet Park garden.
 * Positions use normalized Home artwork coordinates across phones/tablets.
 */
export type HomeBundleGardenPlot = {
  id: string;
  bundleId: string;
  xPct: number;
  yPct: number;
  size: number;
  createdAt: string;
};

export const HOME_GARDEN_PLOT_DEFAULT_SIZE = 180;
export const HOME_GARDEN_PLOT_MIN_SIZE = 60;
export const HOME_GARDEN_PLOT_MAX_SIZE = 500;
export const HOME_GARDEN_PLOT_MAX_PER_BUNDLE = 80;

export function validHomeGardenCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.02 && value <= 0.98;
}
export function validHomeGardenSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= HOME_GARDEN_PLOT_MIN_SIZE && value <= HOME_GARDEN_PLOT_MAX_SIZE;
}
export function clampHomeGardenPosition(value: number): number {
  return Math.max(0.02, Math.min(0.98, value));
}
export function clampHomeGardenSize(value: number): number {
  return Math.min(HOME_GARDEN_PLOT_MAX_SIZE, Math.max(HOME_GARDEN_PLOT_MIN_SIZE, Math.round(value)));
}
