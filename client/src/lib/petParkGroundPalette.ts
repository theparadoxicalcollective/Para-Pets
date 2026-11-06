import type { ParkGroundTheme } from "@shared/petParkGround";

/** Palette-only swaps: the existing world-anchored painterly marks, zoom,
 * geometry and clipping remain exactly the same for every park biome. */
export type ParkGroundPalette = {
  base: string; rgb: readonly [number, number, number];
  washLight: string; washLightMid: string; washDark: string; washDarkMid: string;
  facetLight: string; facetDark: string;
  patchLight: string; patchDark: string;
  strokeLight: string; strokeDark: string;
};
export const PARK_GROUND_PALETTES: Record<ParkGroundTheme, ParkGroundPalette> = {
  grass: {
    base: "#2c4934", rgb: [44, 73, 52],
    washLight: "rgba(103,135,81,.15)", washLightMid: "rgba(102,137,85,.07)",
    washDark: "rgba(15,54,34,.29)", washDarkMid: "rgba(29,79,48,.15)",
    facetLight: "rgba(131,164,102,.023)", facetDark: "rgba(12,45,29,.045)",
    patchLight: "rgba(122,153,102,.07)", patchDark: "rgba(16,53,35,.16)",
    strokeLight: "rgba(145,174,119,.28)", strokeDark: "rgba(17,56,37,.4)",
  },
  snow: {
    base: "#c9d6d3", rgb: [201, 214, 211],
    washLight: "rgba(247,251,240,.52)", washLightMid: "rgba(238,247,243,.24)",
    washDark: "rgba(91,132,145,.24)", washDarkMid: "rgba(129,157,165,.12)",
    facetLight: "rgba(255,255,255,.2)", facetDark: "rgba(88,125,142,.12)",
    patchLight: "rgba(250,255,248,.24)", patchDark: "rgba(84,120,130,.15)",
    strokeLight: "rgba(248,253,250,.58)", strokeDark: "rgba(104,141,145,.34)",
  },
  haunted: {
    base: "#343e3b", rgb: [52, 62, 59],
    washLight: "rgba(101,111,122,.21)", washLightMid: "rgba(111,103,120,.10)",
    washDark: "rgba(17,25,34,.43)", washDarkMid: "rgba(29,31,44,.2)",
    facetLight: "rgba(133,123,152,.08)", facetDark: "rgba(9,19,20,.15)",
    patchLight: "rgba(119,128,111,.11)", patchDark: "rgba(19,25,33,.25)",
    strokeLight: "rgba(153,153,145,.21)", strokeDark: "rgba(10,22,25,.5)",
  },
  swamp: {
    base: "#394b38", rgb: [57, 75, 56],
    washLight: "rgba(125,140,71,.22)", washLightMid: "rgba(118,122,59,.09)",
    washDark: "rgba(23,53,37,.4)", washDarkMid: "rgba(28,56,38,.19)",
    facetLight: "rgba(154,149,77,.068)", facetDark: "rgba(13,40,26,.13)",
    patchLight: "rgba(150,153,75,.12)", patchDark: "rgba(19,49,32,.25)",
    strokeLight: "rgba(164,170,99,.29)", strokeDark: "rgba(18,48,32,.48)",
  },
  volcanic: {
    base: "#332d31", rgb: [51, 45, 49],
    washLight: "rgba(116,83,86,.17)", washLightMid: "rgba(93,61,73,.08)",
    washDark: "rgba(13,13,21,.43)", washDarkMid: "rgba(20,17,25,.2)",
    facetLight: "rgba(151,84,69,.065)", facetDark: "rgba(9,8,16,.16)",
    patchLight: "rgba(148,82,65,.095)", patchDark: "rgba(13,14,19,.25)",
    strokeLight: "rgba(191,102,78,.31)", strokeDark: "rgba(10,9,17,.52)",
  },
};
