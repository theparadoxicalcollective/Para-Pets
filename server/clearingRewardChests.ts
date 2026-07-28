import { sql } from "drizzle-orm";
import type { ClearingRewardBundle, ClearingRewardChest } from "@shared/clearingEquipment";
import { normalizeEligibleLoot, selectClearingLoot, type EligibleLoot, type RandomSource } from "./clearingLoot";

export const CLEARING_CHEST_REWARDS = {
  expirationMs: 7 * 24 * 60 * 60_000,
  firstEquipmentChance: .05,
  secondEquipmentChance: .01,
  maxEquipment: 2,
} as const;

const serialize = (row:any): ClearingRewardChest => ({
  chestId:row.id, sessionId:row.session_id, defeatedEnemyId:row.defeated_enemy_id,
  worldX:Number(row.world_x), worldY:Number(row.world_y), createdAt:new Date(row.created_at).toISOString(),
  expiresAt:new Date(row.expires_at).toISOString(), claimedAt:row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
  status:row.claimed_at ? "claimed" : "unclaimed", highestEquipmentRarity:Number(row.highest_equipment_rarity) as any,
  rewards:{ exp:Number(row.rewards?.exp||0), coins:Number(row.rewards?.coins||0), essence:Number(row.rewards?.essence||0), equipment:Array.isArray(row.rewards?.equipment)?row.rewards.equipment:[], consumables:Array.isArray(row.rewards?.consumables)?row.rewards.consumables:[] },
});

async function rollEquipment(tx:any, clearingId:string, random:RandomSource) {
  const result=await tx.execute(sql`SELECT id,name,image_url,clearing_slot,star_rarity,atk_boost,def_boost,health_boost FROM shop_items
    WHERE id<>'a1b2c3d4-0011-4000-8000-000000000012' AND type='clearing' AND clearing_active=true AND clearing_slot IN ('helmet','weapon','armor','boots','charm') AND star_rarity BETWEEN 1 AND 5
    AND world_id IN ('swamp','global') AND (location_id IS NULL OR location_id=${clearingId})`);
  const pool=result.rows.map(normalizeEligibleLoot).filter((item:EligibleLoot|null):item is EligibleLoot=>item!==null);
  return selectClearingLoot(pool,random);
}

export async function createClearingRewardChest(tx:any,input:{userId:string;sessionId:string;clearingId:string;enemyId:string;petInventoryId:string;worldX:number;worldY:number;now?:Date;random?:RandomSource;forceEquipment?:boolean}) {
  const random=input.random??Math.random, now=input.now??new Date();
  const equipment:EligibleLoot[]=[];
  if(input.forceEquipment||random()<CLEARING_CHEST_REWARDS.firstEquipmentChance){const item=await rollEquipment(tx,input.clearingId,random);if(item)equipment.push(item);}
  if(random()<CLEARING_CHEST_REWARDS.secondEquipmentChance){const item=await rollEquipment(tx,input.clearingId,random);if(item)equipment.push(item);}
  if(!equipment.length)return null;
  const rewards:ClearingRewardBundle={exp:0,coins:0,essence:0,
    equipment:equipment.map(item=>({shopItemId:item.id,name:item.name,imageUrl:item.image_url,slot:item.clearing_slot,stars:item.star_rarity,atkBonus:Number(item.atk_boost??0),defBonus:Number(item.def_boost??0),hpBonus:Number(item.health_boost??0)})),consumables:[]};
  const offsetSeed=[...input.enemyId].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5;
  const x=Math.max(.2,Math.min(.8,input.worldX+(offsetSeed-2)*.018)),y=Math.max(.1,Math.min(.88,input.worldY+(offsetSeed%2?.012:-.008)));
  const highest=equipment.reduce((value,item)=>Math.max(value,item.star_rarity),0);
  const inserted=await tx.execute(sql`INSERT INTO clearing_reward_chests(user_id,session_id,clearing_id,defeated_enemy_id,pet_inventory_id,world_x,world_y,rewards,highest_equipment_rarity,expires_at)
    VALUES(${input.userId},${input.sessionId},${input.clearingId},${input.enemyId},${input.petInventoryId},${x},${y},${JSON.stringify(rewards)}::jsonb,${highest},${new Date(now.getTime()+CLEARING_CHEST_REWARDS.expirationMs)})
    ON CONFLICT(user_id,defeated_enemy_id) DO UPDATE SET session_id=excluded.session_id RETURNING *`);
  return serialize(inserted.rows[0]);
}

export async function getClearingRewardChests(db:any,input:{userId:string;sessionId:string;clearingId:string}) {
  await db.execute(sql`UPDATE clearing_reward_chests SET session_id=${input.sessionId} WHERE user_id=${input.userId} AND clearing_id=${input.clearingId} AND claimed_at IS NULL AND expires_at>now()`);
  const result=await db.execute(sql`SELECT * FROM clearing_reward_chests WHERE user_id=${input.userId} AND session_id=${input.sessionId} AND clearing_id=${input.clearingId} AND claimed_at IS NULL AND expires_at>now() ORDER BY created_at`);
  return result.rows.map(serialize);
}

export class ClearingChestError extends Error { constructor(public code:"not_found"|"expired"|"invalid_reward",message:string){super(message);} }

export async function claimClearingRewardChest(db:any,input:{userId:string;chestId:string;now?:Date}) {
  return db.transaction(async(tx:any)=>{
    const found=await tx.execute(sql`SELECT * FROM clearing_reward_chests WHERE id=${input.chestId} FOR UPDATE`),row=found.rows[0] as any;
    if(!row||row.user_id!==input.userId)throw new ClearingChestError("not_found","Treasure chest was not found");
    if(row.claimed_at)return {alreadyClaimed:true,chest:serialize(row)};
    if(new Date(row.expires_at)<= (input.now??new Date()))throw new ClearingChestError("expired","Treasure chest expired");
    const rewards=row.rewards as ClearingRewardBundle;
    if(!rewards||!Array.isArray(rewards.equipment)||rewards.equipment.length>CLEARING_CHEST_REWARDS.maxEquipment)throw new ClearingChestError("invalid_reward","Treasure rewards are invalid");
    const pet=await tx.execute(sql`SELECT pet_level,pet_level_points FROM user_inventory WHERE id=${row.pet_inventory_id} AND user_id=${input.userId} FOR UPDATE`);
    if(!pet.rows.length)throw new ClearingChestError("invalid_reward","The rewarded pet is no longer available");
    let level=Number((pet.rows[0] as any).pet_level||1),points=Number((pet.rows[0] as any).pet_level_points||0)+Number(rewards.exp||0);
    while(level<100){const needed=Math.floor(100+level*30+level*level*5);if(points<needed)break;points-=needed;level++;}if(level>=100){level=100;points=0;}
    await tx.execute(sql`UPDATE user_inventory SET pet_level=${level},pet_level_points=${points} WHERE id=${row.pet_inventory_id} AND user_id=${input.userId}`);
    const balances=await tx.execute(sql`UPDATE users SET coins=coins+${Number(rewards.coins||0)},essence=essence+${Number(rewards.essence||0)},total_coins_earned=total_coins_earned+${Number(rewards.coins||0)} WHERE id=${input.userId} RETURNING coins,essence`);
    for(const item of rewards.equipment){const granted=await tx.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity) SELECT ${input.userId},${item.shopItemId},1 WHERE EXISTS(SELECT 1 FROM shop_items WHERE id=${item.shopItemId} AND type='clearing' AND clearing_active=true) RETURNING id`);if(!granted.rows.length)throw new ClearingChestError("invalid_reward","Reward equipment is no longer available");}
    const claimed=await tx.execute(sql`UPDATE clearing_reward_chests SET claimed_at=${input.now??new Date()} WHERE id=${input.chestId} AND claimed_at IS NULL RETURNING *`);
    return {alreadyClaimed:false,chest:serialize(claimed.rows[0]),balances:{coins:Number((balances.rows[0] as any).coins),essence:Number((balances.rows[0] as any).essence)},pet:{level,levelPoints:points}};
  });
}
