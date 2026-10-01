import shopFrostpeak from "@assets/shop_frostpeak.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const FROSTPEAK_PRESENTATION = {
  worldId: WORLD_IDS.frostpeak,
  shopIcon: shopFrostpeak,
  accent: "#88ccff",
  bgGradient:
    "linear-gradient(180deg, rgba(20,30,60,0.7) 0%, rgba(40,80,120,0.3) 50%, rgba(10,15,30,0.7) 100%)",
} as const;
