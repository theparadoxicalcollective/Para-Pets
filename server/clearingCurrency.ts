import { sql } from "drizzle-orm";
import type { ClearingCurrency, ClearingCurrencyDrop } from "@shared/clearingEquipment";

export const CLEARING_CURRENCY_REWARDS = {
  coins: { min: 1, max: 2 }, essence: { min: 10, max: 20 },
  expirationMs: 45_000, pickupRadiusPixels: 82,
} as const;

export class ClearingCurrencyError extends Error {
  constructor(public code: "not_found" | "wrong_session" | "expired" | "distance", message: string) { super(message); }
}

const serialize = (row: any): ClearingCurrencyDrop => ({ dropId: row.id, currency: row.currency, amount: Number(row.amount), worldX: Number(row.world_x), worldY: Number(row.world_y), expiresAt: new Date(row.expires_at).toISOString() });

/** Reward kind and amount are rolled here, never accepted from the client. */
export async function createCurrencyDrop(tx: any, input: { userId:string; sessionId:string; clearingId:string; rewardId:string; worldX:number; worldY:number; random?:()=>number }) {
  const random=input.random??Math.random, currency:ClearingCurrency=random()<.5?"coins":"essence", range=CLEARING_CURRENCY_REWARDS[currency];
  const amount=range.min+Math.floor(random()*(range.max-range.min+1)), now=new Date();
  const result=await tx.execute(sql`INSERT INTO clearing_currency_drops(user_id,session_id,clearing_id,reward_id,currency,amount,world_x,world_y,expires_at)
    VALUES(${input.userId},${input.sessionId},${input.clearingId},${input.rewardId},${currency},${amount},${Math.max(.2,Math.min(.8,input.worldX+.012))},${Math.max(.1,Math.min(.88,input.worldY+.008))},${new Date(now.getTime()+CLEARING_CURRENCY_REWARDS.expirationMs)})
    ON CONFLICT(reward_id) DO NOTHING RETURNING *`);
  return result.rows[0]?serialize(result.rows[0]):null;
}

export async function getCurrencyDrops(db:any,input:{userId:string;sessionId:string;clearingId:string;now?:Date}) { const now=input.now??new Date(); await db.execute(sql`DELETE FROM clearing_currency_drops WHERE expires_at<${now}`); const result=await db.execute(sql`SELECT * FROM clearing_currency_drops WHERE user_id=${input.userId} AND session_id=${input.sessionId} AND clearing_id=${input.clearingId} AND collected_at IS NULL AND expires_at>${now}`); return result.rows.map(serialize); }

export async function collectCurrencyDrop(db:any,input:{userId:string;sessionId:string;clearingId:string;dropId:string;playerX:number;playerY:number;worldPixels:{width:number;height:number};now?:Date}) {
  return db.transaction(async(tx:any)=>{ const result=await tx.execute(sql`SELECT * FROM clearing_currency_drops WHERE id=${input.dropId} FOR UPDATE`),row=result.rows[0] as any;
    if(!row||row.user_id!==input.userId)throw new ClearingCurrencyError("not_found","Currency pickup was not found");
    if(row.session_id!==input.sessionId||row.clearing_id!==input.clearingId)throw new ClearingCurrencyError("wrong_session","Currency pickup belongs to another session");
    if(row.collected_at)return {alreadyCollected:true,drop:serialize(row)};
    if(new Date(row.expires_at)<= (input.now??new Date()))throw new ClearingCurrencyError("expired","Currency pickup expired");
    if(Math.hypot((input.playerX-Number(row.world_x))*input.worldPixels.width,(input.playerY-Number(row.world_y))*input.worldPixels.height)>CLEARING_CURRENCY_REWARDS.pickupRadiusPixels)throw new ClearingCurrencyError("distance","Move closer to collect this pickup");
    const field=row.currency==="coins"?sql`coins`:sql`essence`, total=row.currency==="coins"?sql`, total_coins_earned=total_coins_earned+${Number(row.amount)}`:sql``;
    const updated=await tx.execute(sql`UPDATE users SET ${field}=${field}+${Number(row.amount)} ${total} WHERE id=${input.userId} RETURNING coins,essence`);
    await tx.execute(sql`UPDATE clearing_currency_drops SET collected_at=${input.now??new Date()} WHERE id=${input.dropId} AND collected_at IS NULL`);
    return {alreadyCollected:false,drop:serialize(row),balances:{coins:Number((updated.rows[0] as any).coins),essence:Number((updated.rows[0] as any).essence)}};
  });
}
