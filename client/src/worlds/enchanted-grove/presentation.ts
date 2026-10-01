import shopEnchantedGrove from "@assets/shop_enchanted_grove_v2.png";
import { WORLD_IDS } from "@shared/worlds/worldRegistry";

export const ENCHANTED_GROVE_PRESENTATION = {
  worldId: WORLD_IDS.enchantedGrove,
  shopIcon: shopEnchantedGrove,
  accent: "#7fffd4",
  bgGradient:
    "linear-gradient(180deg, rgba(5,30,20,0.7) 0%, rgba(10,60,40,0.3) 50%, rgba(5,15,10,0.7) 100%)",
} as const;
