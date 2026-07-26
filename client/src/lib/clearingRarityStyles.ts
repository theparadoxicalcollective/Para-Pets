import type { ClearingStarRarity } from "@shared/clearingEquipment";

export const CLEARING_DROP_RARITY_STYLES:Record<ClearingStarRarity,{label:string;color:string;shadow:string}>={
  1:{label:"Common",color:"#4ade80",shadow:"0 0 15px #22c55e"},
  2:{label:"Uncommon",color:"#60a5fa",shadow:"0 0 18px #3b82f6"},
  3:{label:"Rare",color:"#c084fc",shadow:"0 0 21px #a855f7"},
  4:{label:"Very Rare",color:"#fbbf24",shadow:"0 0 24px #f59e0b"},
  5:{label:"Highest Rarity",color:"#fde047",shadow:"0 0 30px #eab308,0 0 14px #fff3a3"},
};
