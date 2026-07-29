import { sql } from "drizzle-orm";

export type ClearingSpecialMobTemplate = { pet_shop_item_id:string; name:string; rarity:number; egg_image_url:string|null; hatched_image_url:string|null; image_url:string|null };

/** Special mobs are intentionally uncommon, and each additional rarity star
 * makes a configured pet half as likely to be selected. */
export function selectClearingSpecialMob(templates:ClearingSpecialMobTemplate[], random=Math.random) {
  if (!templates.length || random() >= .12) return undefined;
  const weighted=templates.map(template=>({template,weight:1/Math.pow(2,Math.max(0,Number(template.rarity||1)-1))}));
  const total=weighted.reduce((sum,item)=>sum+item.weight,0);let roll=random()*total;
  for(const item of weighted){roll-=item.weight;if(roll<0)return item.template;}
  return weighted.at(-1)?.template;
}

const serialize=(row:any)=>({id:row.id,sessionId:row.session_id,petShopItemId:row.pet_shop_item_id,name:row.name,eggImageUrl:row.egg_image_url,stars:Math.max(1,Math.min(5,Number(row.rarity||1))),worldX:Number(row.world_x),worldY:Number(row.world_y),expiresAt:new Date(row.expires_at).toISOString()});

export async function createSpecialEggDrop(tx:any,input:{userId:string;sessionId:string;clearingId:string;enemyId:string;petShopItemId:string;worldX:number;worldY:number}){
  const expiresAt=new Date(Date.now()+10*60_000);const result=await tx.execute(sql`INSERT INTO clearing_special_egg_drops(user_id,session_id,clearing_id,defeated_enemy_id,pet_shop_item_id,world_x,world_y,expires_at) VALUES(${input.userId},${input.sessionId},${input.clearingId},${input.enemyId},${input.petShopItemId},${input.worldX},${input.worldY},${expiresAt}) ON CONFLICT(user_id,defeated_enemy_id) DO UPDATE SET session_id=excluded.session_id RETURNING *`);const row=result.rows[0] as any;const pet=await tx.execute(sql`SELECT name,egg_image_url,rarity FROM shop_items WHERE id=${input.petShopItemId}`);return serialize({...row,...pet.rows[0]});
}
export async function getSpecialEggDrops(db:any,input:{userId:string;sessionId:string;clearingId:string}){const result=await db.execute(sql`SELECT d.*,s.name,s.egg_image_url,s.rarity FROM clearing_special_egg_drops d JOIN shop_items s ON s.id=d.pet_shop_item_id WHERE d.user_id=${input.userId} AND d.session_id=${input.sessionId} AND d.clearing_id=${input.clearingId} AND d.collected_at IS NULL AND d.expires_at>now()`);return result.rows.map(serialize);}
export async function collectSpecialEggDrop(db:any,input:{userId:string;sessionId:string;dropId:string;playerX:number;playerY:number}){return db.transaction(async(tx:any)=>{const found=await tx.execute(sql`SELECT d.*,s.name,s.egg_image_url,s.rarity,s.type FROM clearing_special_egg_drops d JOIN shop_items s ON s.id=d.pet_shop_item_id WHERE d.id=${input.dropId} FOR UPDATE`);const row=found.rows[0] as any;if(!row||row.user_id!==input.userId||row.session_id!==input.sessionId||row.collected_at||new Date(row.expires_at)<=new Date())throw new Error("Special egg is no longer available");if(row.type!=="pet")throw new Error("Special egg pet is no longer available");if(Math.hypot((Number(row.world_x)-input.playerX)*1000,(Number(row.world_y)-input.playerY)*1000)>90)throw new Error("Move closer to collect this egg");await tx.execute(sql`INSERT INTO user_inventory(user_id,shop_item_id,quantity,is_hatched) VALUES(${input.userId},${row.pet_shop_item_id},1,false)`);await tx.execute(sql`UPDATE clearing_special_egg_drops SET collected_at=now() WHERE id=${input.dropId}`);return serialize(row);});}
