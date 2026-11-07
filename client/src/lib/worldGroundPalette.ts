import { PARK_GROUND_PALETTES, type ParkGroundPalette } from "./petParkGroundPalette";
import type { WorldGroundTheme } from "@shared/worlds/worldGroundTheme";

/** World-only palette choice. Pet Park Haunted remains its original gray. */
const HAUNTED_PURPLE: ParkGroundPalette = {
  base: "#393441", rgb: [57, 52, 65],
  washLight: "rgba(125,105,144,.20)", washLightMid: "rgba(114,96,136,.09)",
  washDark: "rgba(22,19,34,.43)", washDarkMid: "rgba(37,30,52,.20)",
  facetLight: "rgba(155,131,176,.08)", facetDark: "rgba(21,15,31,.14)",
  patchLight: "rgba(137,116,151,.11)", patchDark: "rgba(24,19,36,.23)",
  strokeLight: "rgba(165,147,179,.23)", strokeDark: "rgba(24,18,36,.48)",
};

/**
 * Preserve the existing haunted-gray watercolor texture as City.
 * The Haunted option gets a subtle lilac wash only in World Editor previews.
 * No new images, tile alignment, or coordinate systems are introduced.
 */
export function worldGroundPalette(theme: WorldGroundTheme): ParkGroundPalette | undefined {
  if (theme === "haunted") return HAUNTED_PURPLE;
  if (theme === "city") return PARK_GROUND_PALETTES.haunted;
  return undefined;
}

export function worldGroundRenderTheme(theme: WorldGroundTheme) {
  return theme === "city" ? "haunted" : theme;
}
