import shopVolcanic from "@assets/shop_volcanic.png";
import { VOLCANIC_WORLD_ID } from "@shared/worlds/volcanic";

export const VOLCANIC_PRESENTATION = {
  worldId: VOLCANIC_WORLD_ID,
  shopIcon: shopVolcanic,
  accent: "#ff4500",
  bgGradient:
    "linear-gradient(180deg, rgba(40,10,5,0.7) 0%, rgba(80,20,10,0.3) 50%, rgba(20,5,2,0.7) 100%)",
} as const;
