import volcanicBobberIcon from "@assets/bobber_volcanic.png";

// Per-world fishing theme — accent colour, pond surface/glow gradients, shimmer lines and float style.
// Add a new entry here whenever a new fishing world is introduced; all other worlds fall back to "swamp".
export type FloatStyle = "water" | "lava" | "ice" | "sky" | "sand" | "forest" | "dark";
export interface FishingWorldTheme {
  accent: string;
  pondGlow: string;
  pondSurface: string;
  shimmer1: string;
  shimmer2: string;
  floatStyle: FloatStyle;
  pondBottom?: string;
  bobberSrc?: string;
}
const FISHING_WORLD_THEMES: Record<string, FishingWorldTheme> = {
  swamp: {
    accent: "#5eead4",
    pondGlow: "radial-gradient(ellipse at center, rgba(94,234,212,0.12) 0%, rgba(56,189,248,0.06) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(147,210,210,0.18) 0%, rgba(56,180,180,0.10) 40%, rgba(14,90,110,0.08) 70%, transparent 100%)",
    shimmer1: "rgba(200,240,240,0.25)",
    shimmer2: "rgba(200,240,240,0.18)",
    floatStyle: "water",
  },
  volcanic: {
    accent: "#ff6520",
    pondGlow: "radial-gradient(ellipse at center, rgba(255,100,20,0.18) 0%, rgba(200,60,10,0.08) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(255,140,30,0.22) 0%, rgba(200,80,10,0.14) 40%, rgba(100,30,5,0.10) 70%, transparent 100%)",
    shimmer1: "rgba(255,180,80,0.28)",
    shimmer2: "rgba(255,160,60,0.20)",
    floatStyle: "lava",
    pondBottom: "26%",
    bobberSrc: volcanicBobberIcon,
  },
  snowy_mountain: {
    accent: "#88ccff",
    pondGlow: "radial-gradient(ellipse at center, rgba(136,204,255,0.15) 0%, rgba(180,220,255,0.07) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(180,220,255,0.20) 0%, rgba(136,204,255,0.12) 40%, rgba(80,140,200,0.08) 70%, transparent 100%)",
    shimmer1: "rgba(200,230,255,0.30)",
    shimmer2: "rgba(180,210,255,0.22)",
    floatStyle: "ice",
  },
  sky_realm: {
    accent: "#ffd700",
    pondGlow: "radial-gradient(ellipse at center, rgba(255,215,0,0.15) 0%, rgba(255,200,0,0.07) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(255,235,100,0.22) 0%, rgba(255,215,0,0.14) 40%, rgba(200,160,0,0.08) 70%, transparent 100%)",
    shimmer1: "rgba(255,240,160,0.30)",
    shimmer2: "rgba(255,220,100,0.22)",
    floatStyle: "sky",
  },
  island: {
    accent: "#20b2aa",
    pondGlow: "radial-gradient(ellipse at center, rgba(32,178,170,0.14) 0%, rgba(0,180,160,0.07) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(32,200,180,0.20) 0%, rgba(0,180,160,0.12) 40%, rgba(0,120,110,0.08) 70%, transparent 100%)",
    shimmer1: "rgba(100,230,210,0.28)",
    shimmer2: "rgba(80,210,190,0.20)",
    floatStyle: "water",
  },
  desert: {
    accent: "#daa520",
    pondGlow: "radial-gradient(ellipse at center, rgba(218,165,32,0.15) 0%, rgba(200,140,20,0.07) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(218,165,32,0.18) 0%, rgba(180,130,20,0.10) 40%, rgba(120,80,10,0.07) 70%, transparent 100%)",
    shimmer1: "rgba(240,200,80,0.28)",
    shimmer2: "rgba(220,180,60,0.20)",
    floatStyle: "sand",
  },
  enchanted_grove: {
    accent: "#7fffd4",
    pondGlow: "radial-gradient(ellipse at center, rgba(127,255,212,0.14) 0%, rgba(80,220,160,0.07) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(127,255,212,0.18) 0%, rgba(80,220,160,0.10) 40%, rgba(40,160,100,0.07) 70%, transparent 100%)",
    shimmer1: "rgba(160,255,220,0.28)",
    shimmer2: "rgba(127,255,212,0.20)",
    floatStyle: "forest",
  },
  haunted_woods: {
    accent: "#bf5fff",
    pondGlow: "radial-gradient(ellipse at center, rgba(139,0,139,0.20) 0%, rgba(100,0,100,0.09) 50%, transparent 75%)",
    pondSurface: "radial-gradient(ellipse at 40% 38%, rgba(180,50,200,0.18) 0%, rgba(139,0,139,0.10) 40%, rgba(80,0,80,0.07) 70%, transparent 100%)",
    shimmer1: "rgba(200,100,220,0.25)",
    shimmer2: "rgba(180,80,200,0.18)",
    floatStyle: "dark",
  },
};
const DEFAULT_FISHING_THEME = FISHING_WORLD_THEMES.swamp;

export function getFishingWorldTheme(worldId?: string): FishingWorldTheme {
  return FISHING_WORLD_THEMES[worldId ?? ""] ?? DEFAULT_FISHING_THEME;
}
