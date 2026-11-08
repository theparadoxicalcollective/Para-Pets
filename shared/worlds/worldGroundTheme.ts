import {
  PET_PARK_GROUND_THEMES, isParkGroundTheme, type ParkGroundTheme,
} from "../petParkGround";

/**
 * World-only visual themes. Pet Park keeps its existing themes and palette.
 * City deliberately uses the original gray Haunted surface; Haunted in the
 * World Editor uses a restrained purple variant of the same texture.
 */
export type WorldGroundTheme = ParkGroundTheme | "city";
export const WORLD_GROUND_THEMES: ReadonlyArray<{
  type: WorldGroundTheme; label: string; swatch: string;
}> = [
  ...PET_PARK_GROUND_THEMES.map(theme => theme.type === "haunted"
    ? { ...theme, swatch: "#393441" }
    : theme),
  { type: "city", label: "City", swatch: "#343e3b" },
];

export function isWorldGroundTheme(value: unknown): value is WorldGroundTheme {
  return value === "city" || isParkGroundTheme(value);
}
