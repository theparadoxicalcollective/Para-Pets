export type ClearingPotionSlot = {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  healthRestored: number;
  manaRestored: number;
} | null;

export type ClearingPotionInventoryItem = NonNullable<ClearingPotionSlot> & { type?: string; petsRevived?: number };

export const CLEARING_POTION_SLOTS_KEY = "clearing:potion-slots:v2";

export function eligibleClearingPotions(items: ClearingPotionInventoryItem[]): NonNullable<ClearingPotionSlot>[] {
  return items.filter(item=>item.type==="potion"&&item.quantity>0&&(item.healthRestored>0||item.manaRestored>0)&&Number(item.petsRevived||0)===0)
    .map(({inventoryId,shopItemId,name,imageUrl,quantity,healthRestored,manaRestored})=>({inventoryId,shopItemId,name,imageUrl,quantity:Math.min(50,quantity),healthRestored,manaRestored}));
}

export function reconcileClearingPotionSlots(slots: ClearingPotionSlot[], potions: NonNullable<ClearingPotionSlot>[]): ClearingPotionSlot[] {
  const byId=new Map(potions.map(item=>[item.inventoryId,item]));const assigned=new Set<string>();
  return [0,1,2].map(index=>{const slot=slots[index];if(!slot||assigned.has(slot.inventoryId))return null;const current=byId.get(slot.inventoryId);if(!current)return null;assigned.add(slot.inventoryId);return current;});
}

export function migrateClearingPotionSlots(oldSlots: unknown, potions: NonNullable<ClearingPotionSlot>[]): ClearingPotionSlot[] {
  const assigned=new Set<string>();const values=Array.isArray(oldSlots)?oldSlots:[];
  return [0,1,2].map(index=>{const shopItemId=values[index];if(typeof shopItemId!=="string")return null;const match=potions.find(item=>item.shopItemId===shopItemId&&!assigned.has(item.inventoryId));if(!match)return null;assigned.add(match.inventoryId);return match;});
}

export function consumeClearingPotionSlot(slots: ClearingPotionSlot[],slotIndex:number,consumedInventoryId:string,remainingQuantity:number):ClearingPotionSlot[]{
  return slots.map((slot,index)=>index===slotIndex&&slot?.inventoryId===consumedInventoryId?(remainingQuantity>0?{...slot,quantity:remainingQuantity}:null):slot);
}
