export type ClearingPotionSlot = {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  healthRestored: number;
  manaRestored: number;
  /** Ordered database rows backing a temporarily consolidated legacy stack. */
  inventoryIds?: string[];
} | null;

export type ClearingPotionInventoryItem = NonNullable<ClearingPotionSlot> & { type?: string; petsRevived?: number };

export const CLEARING_POTION_SLOTS_KEY = "clearing:potion-slots:v2";

export function eligibleClearingPotions(items: ClearingPotionInventoryItem[]): NonNullable<ClearingPotionSlot>[] {
  const eligible=items.filter(item=>item.type==="potion"&&item.quantity>0&&(item.healthRestored>0||item.manaRestored>0)&&Number(item.petsRevived||0)===0);
  const groups=new Map<string,ClearingPotionInventoryItem[]>();
  for(const item of eligible)groups.set(item.shopItemId,[...(groups.get(item.shopItemId)||[]),item]);
  const result:NonNullable<ClearingPotionSlot>[]=[];
  for(const rows of groups.values()){
    let current:NonNullable<ClearingPotionSlot>|null=null;
    for(const row of rows){let remaining=row.quantity;while(remaining>0){if(!current||current.quantity===50){current={inventoryId:row.inventoryId,inventoryIds:[row.inventoryId],shopItemId:row.shopItemId,name:row.name,imageUrl:row.imageUrl,quantity:0,healthRestored:row.healthRestored,manaRestored:row.manaRestored};result.push(current);}else if(!current.inventoryIds?.includes(row.inventoryId))current.inventoryIds=[...(current.inventoryIds||[current.inventoryId]),row.inventoryId];const added=Math.min(50-current.quantity,remaining);current.quantity+=added;remaining-=added;}}
  }
  return result;
}

export function reconcileClearingPotionSlots(slots: ClearingPotionSlot[], potions: NonNullable<ClearingPotionSlot>[]): ClearingPotionSlot[] {
  const byId=new Map(potions.map(item=>[item.inventoryId,item]));const assigned=new Set<string>();
  return [0,1,2].map(index=>{const slot=slots[index];if(!slot||assigned.has(slot.inventoryId))return null;const current=byId.get(slot.inventoryId)??potions.find(item=>item.shopItemId===slot.shopItemId&&!assigned.has(item.inventoryId));if(!current)return null;assigned.add(current.inventoryId);return current;});
}

export function migrateClearingPotionSlots(oldSlots: unknown, potions: NonNullable<ClearingPotionSlot>[]): ClearingPotionSlot[] {
  const assigned=new Set<string>();const values=Array.isArray(oldSlots)?oldSlots:[];
  return [0,1,2].map(index=>{const value=values[index];const shopItemId=typeof value==="string"?value:value&&typeof value==="object"&&"shopItemId" in value?String(value.shopItemId):null;if(!shopItemId)return null;const match=potions.find(item=>item.shopItemId===shopItemId&&!assigned.has(item.inventoryId));if(!match)return null;assigned.add(match.inventoryId);return match;});
}

export function consumeClearingPotionSlot(slots: ClearingPotionSlot[],slotIndex:number,consumedInventoryId:string,remainingQuantity:number):ClearingPotionSlot[]{
  return slots.map((slot,index)=>{
    if(index!==slotIndex||slot?.inventoryId!==consumedInventoryId)return slot;
    // Normally the server row and logical stack are identical. During the
    // legacy-row transition a logical stack can temporarily cover several
    // backing rows, so a depleted backing row still removes only one unit.
    const logicalRemaining=remainingQuantity===slot.quantity-1?remainingQuantity:Math.max(0,slot.quantity-1);
    if(logicalRemaining<=0)return null;
    const inventoryIds=slot.inventoryIds||[slot.inventoryId];
    const nextIds=remainingQuantity===0?inventoryIds.filter(id=>id!==consumedInventoryId):inventoryIds;
    return {...slot,inventoryId:nextIds[0]||slot.inventoryId,inventoryIds:nextIds,quantity:logicalRemaining};
  });
}
