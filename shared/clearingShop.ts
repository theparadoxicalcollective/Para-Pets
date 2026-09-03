import { z } from "zod";
export const CLEARING_SHOP_LIMITS={xMin:.08,xMax:.92,yMin:.05,yMax:.94,widthMin:64,widthMax:112,radiusMin:36,radiusMax:140,maxPrice:1_000_000} as const;
export const DEFAULT_CLEARING_SHOP={id:"",worldId:"swamp",enabled:false,portalX:.5,portalY:.55,portalWidth:88,interactionRadiusPixels:58,items:[]} as const;
/** Radius around the portal's visible ground-level glow that accepts the pet's movement center. */
export const CLEARING_PORTAL_ACTIVATION_RADIUS=30;
/**
 * Position reports run on a cadence. Opening the shop pauses combat immediately,
 * so the last server position can legitimately trail the portal-crossing frame.
 * Keep purchase validation server-side, but tolerate one bounded sync gap.
 */
export const CLEARING_SHOP_PURCHASE_POSITION_GRACE_PIXELS=96;
export const normalizeClearingPortalWidth=(value:unknown)=>Math.min(CLEARING_SHOP_LIMITS.widthMax,Math.max(CLEARING_SHOP_LIMITS.widthMin,Number.isFinite(Number(value))?Math.round(Number(value)):DEFAULT_CLEARING_SHOP.portalWidth));
/** Player entry begins inside the portal's inner glow, not at its outer motes. */
export const clearingShopActivationRadius=(_interactionRadiusPixels:number)=>CLEARING_PORTAL_ACTIVATION_RADIUS;
export const clearingShopPurchaseRadius=(interactionRadiusPixels:number)=>Math.max(CLEARING_SHOP_LIMITS.radiusMin,Number(interactionRadiusPixels)||DEFAULT_CLEARING_SHOP.interactionRadiusPixels)+CLEARING_SHOP_PURCHASE_POSITION_GRACE_PIXELS;
export const clearingShopPatchSchema=z.object({enabled:z.boolean().optional(),portalX:z.number().finite().min(.08).max(.92).optional(),portalY:z.number().finite().min(.05).max(.94).optional(),portalWidth:z.number().int().min(64).max(CLEARING_SHOP_LIMITS.widthMax).optional(),interactionRadiusPixels:z.number().int().min(36).max(140).optional()}).strict();
export const clearingShopItemCreateSchema=z.object({shopItemId:z.string().min(1).max(200),essencePrice:z.number().int().positive().max(CLEARING_SHOP_LIMITS.maxPrice),active:z.boolean().optional(),sortOrder:z.number().int().min(-10000).max(10000).optional()}).strict();
export const clearingShopItemPatchSchema=clearingShopItemCreateSchema.omit({shopItemId:true}).partial().strict();
export const clearingShopPurchaseSchema=z.object({sessionId:z.string().uuid(),assignmentId:z.string().min(1),quantity:z.literal(1),purchaseActionId:z.string().uuid()}).strict();
export type ClearingShopConfig={id:string;worldId:string;enabled:boolean;portalX:number;portalY:number;portalWidth:number;interactionRadiusPixels:number;items:ClearingShopItem[]};
export type ClearingShopItem={assignmentId:string;shopItemId:string;name:string;imageUrl:string|null;type:string;description?:string|null;essencePrice:number;active:boolean;sortOrder:number;starRarity?:number|null;healthRestored?:number|null;manaRestored?:number|null;atkBoost?:number|null;defBoost?:number|null;healthBoost?:number|null};
export const activeClearingShopItems=(items:ClearingShopItem[])=>items.filter(item=>item.active);
export function isWithinClearingShopRadius(player:{x:number;y:number},portal:{x:number;y:number},world:{width:number;height:number},radius:number){return Math.hypot((player.x-portal.x)*world.width,(player.y-portal.y)*world.height)<=radius;}
