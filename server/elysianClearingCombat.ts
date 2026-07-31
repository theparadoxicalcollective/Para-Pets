import crypto from "crypto";
import { CLEARING_BALANCE } from "@shared/clearingConfig";
import { selectClearingSpecialMob, type ClearingSpecialMobTemplate } from "./clearingSpecialMobs";
import { CLEARING_AIM_GEOMETRY, clearingDistanceToRay, clearingPointInDirection, isFiniteClearingPoint, normalizeClearingDirection, type ClearingDirection, type ClearingPoint } from "@shared/clearingCombatGeometry";
import type { ClearingAttackStyle } from "@shared/clearingCombat";
import { layoutClearingEncounter } from "@shared/clearingEncounterLayout";

export const ELYSIAN_CLEARING_COMBAT = {
  locationId: "a1b2c3d4-0011-4000-8000-000000000011",
  baseEnemyPopulation: 8,
  maxEnemyPopulation: 10,
  enemyCount: 10,
  expReward: 5,
  sessionLifetimeMs: 30 * 60_000,
} as const;

export interface ClearingPetStats { level: number; hp: number; atk: number; def?: number; rarity?: number | null }
export interface ClearingEnemyRecord {
  instanceId: string;
  slot: number;
  maxHealth: number;
  health: number;
  attack: number;
  defeated: boolean;
  lastHitAt: number;
  x: number; y: number; positionUpdatedAt: number;
  isBoss: boolean;
  engagedByPlayer: boolean;
  templateId?: string; name?: string; imageUrl?: string | null;
  specialPetShopItemId?:string; specialRarity?:number;
}
export interface ClearingSession { id: string; userId: string; petId: string; expiresAt: number; effectiveStats: { hp: number; atk: number; def: number }; enemies: ClearingEnemyRecord[]; position:{x:number;y:number;updatedAt:number}; lockedTargetInstanceId:string|null; processedAttacks:Map<string,ClearingHitResult> }
type ClearingHitResult={status:"invalid"|"target_locked"|"defeated"|"direction"|"desync"|"range"|"hit"|"killed";enemy?:ClearingEnemyRecord;damage?:number;lockedTargetInstanceId?:string|null;diagnostic?:ClearingAttackDiagnostic};
export type ClearingAttackDiagnostic={enemyInstanceId:string;playerPosition:ClearingPoint;clientTargetPosition:ClearingPoint;serverEnemyPosition:ClearingPoint;edgeDistance:number;allowedRange:number;rejectionReason:string};

type ClearingEnemyTemplate = {enemy_id:string;is_boss:boolean;name:string;image_url:string|null};

const sessions = new Map<string, ClearingSession>();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function scaleClearingEnemy(pet: ClearingPetStats) {
  const levelFactor = 1 + Math.min(0.25, Math.max(0, pet.level - 1) * 0.008);
  const rarityFactor = 1 + Math.min(0.12, Math.max(0, Number(pet.rarity || 1) - 1) * 0.025);
  const petDamage = clamp(Math.round(pet.atk), 20, 5_000);
  return {
    petDamage,
    maxHealth: clamp(Math.round(petDamage * 5 * levelFactor * rarityFactor), 100, 28_000),
    attack: Math.max(1, Math.round(pet.hp * CLEARING_BALANCE.enemyDamagePercent)),
  };
}

/** Builds small same-species packs while retaining the existing boss chance.
 * This makes the population read as intentional encounters rather than eight
 * unrelated rolls, without changing combat stats or reward frequency. */
export function selectClearingEncounterTemplates(count:number,templates:ClearingEnemyTemplate[],random=Math.random){
  const bosses=templates.filter(template=>template.is_boss),regulars=templates.filter(template=>!template.is_boss),selected:(ClearingEnemyTemplate|undefined)[]=[];
  const hasBoss=bosses.length>0&&random()<CLEARING_BALANCE.bossSpawnChance;
  let previousTemplate:ClearingEnemyTemplate|undefined;
  while(selected.length<count-(hasBoss?1:0)){const choices=regulars.length>1?regulars.filter(template=>template!==previousTemplate):regulars,template=choices[Math.floor(random()*choices.length)],packSize=Math.min(2+Math.floor(random()*2),count-(hasBoss?1:0)-selected.length);for(let member=0;member<packSize;member++)selected.push(template);previousTemplate=template;}
  if(hasBoss)selected.push(bosses[Math.floor(random()*bosses.length)]);
  return selected;
}

export function createClearingSession(userId: string, petId: string, stats: ClearingPetStats, now = Date.now(), random=Math.random, templates:ClearingEnemyTemplate[]=[], specialTemplates:ClearingSpecialMobTemplate[]=[]): ClearingSession {
  for (const [id, session] of sessions) if (session.expiresAt <= now || session.userId === userId) sessions.delete(id);
  const scaled = scaleClearingEnemy(stats),special=selectClearingSpecialMob(specialTemplates,random),encounterTemplates=selectClearingEncounterTemplates(ELYSIAN_CLEARING_COMBAT.enemyCount,templates,random);if(special)encounterTemplates[encounterTemplates.length-1]=undefined;const encounterPositions=layoutClearingEncounter(encounterTemplates);
  const session: ClearingSession = {
    id: crypto.randomUUID(), userId, petId, expiresAt: now + ELYSIAN_CLEARING_COMBAT.sessionLifetimeMs,
    effectiveStats: { hp: stats.hp, atk: stats.atk, def: stats.def ?? 0 },
    position:{x:.5,y:.7,updatedAt:now}, lockedTargetInstanceId:null,processedAttacks:new Map(), enemies: encounterTemplates.map((template,slot) => {const isBoss=Boolean(template?.is_boss),maxHealth=Math.round(scaled.maxHealth*(isBoss?CLEARING_BALANCE.bossHealthMultiplier:1)),spawn=encounterPositions[slot];return{
      instanceId: crypto.randomUUID(), slot, maxHealth, health:maxHealth,
      attack:Math.round(scaled.attack*(isBoss?CLEARING_BALANCE.bossDamageMultiplier:1)),isBoss,engagedByPlayer:false,templateId:template?.enemy_id,name:slot===encounterTemplates.length-1&&special?special.name:template?.name,imageUrl:slot===encounterTemplates.length-1&&special?(special.hatched_image_url||special.image_url):template?.image_url,specialPetShopItemId:slot===encounterTemplates.length-1?special?.pet_shop_item_id:undefined,specialRarity:slot===encounterTemplates.length-1?Number(special?.rarity||1):undefined, defeated: false, lastHitAt: 0, x:spawn?.x??.5, y:spawn?.y??.6, positionUpdatedAt:now,
    }}),
  };
  sessions.set(session.id, session);
  return session;
}

export function getClearingSession(sessionId:string){return sessions.get(sessionId)??null;}
export function updateClearingPosition(input:{sessionId:string;userId:string;x:number;y:number;now?:number}){
  const now=input.now??Date.now(),session=sessions.get(input.sessionId);
  if(!session||session.userId!==input.userId||session.expiresAt<=now)return null;
  if(!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<.08||input.x>.92||input.y<.05||input.y>.94)return null;
  const elapsed=Math.max(.1,(now-session.position.updatedAt)/1000),distance=Math.hypot(input.x-session.position.x,input.y-session.position.y);
  if(distance>.17*elapsed+.08)return null;
  session.position={x:input.x,y:input.y,updatedAt:now};return session.position;
}

export function updateClearingEnemyPositions(input:{sessionId:string;userId:string;positions:unknown;worldPixels:unknown;now?:number}){
  const now=input.now??Date.now(),session=sessions.get(input.sessionId),world=input.worldPixels as {width?:unknown;height?:unknown};
  if(!session||session.userId!==input.userId||session.expiresAt<=now||!Array.isArray(input.positions)||input.positions.length>ELYSIAN_CLEARING_COMBAT.enemyCount||!Number.isFinite(world?.width)||!Number.isFinite(world?.height)||Number(world.width)<=0||Number(world.height)<=0)return false;
  const seen=new Set<string>();
  for(const value of input.positions){const p=value as {enemyInstanceId?:unknown;x?:unknown;y?:unknown};if(typeof p?.enemyInstanceId!=="string"||seen.has(p.enemyInstanceId)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Number(p.x)<.08||Number(p.x)>.92||Number(p.y)<.05||Number(p.y)>.94)return false;seen.add(p.enemyInstanceId);const enemy=session.enemies.find(e=>e.instanceId===p.enemyInstanceId);if(!enemy||enemy.defeated)return false;const elapsed=Math.max(.1,(now-enemy.positionUpdatedAt)/1000),distance=Math.hypot((Number(p.x)-enemy.x)*Number(world.width),(Number(p.y)-enemy.y)*Number(world.height));if(distance>90*elapsed+24)return false;}
  for(const value of input.positions){const p=value as {enemyInstanceId:string;x:number;y:number},enemy=session.enemies.find(e=>e.instanceId===p.enemyInstanceId)!;enemy.x=p.x;enemy.y=p.y;enemy.positionUpdatedAt=now;}return true;
}

export function validateAndUpdateClearingCombatPosition(input:{session:ClearingSession;playerPosition:ClearingPoint;worldPixels:{width:number;height:number};now?:number}){const now=input.now??Date.now(),{session,playerPosition,worldPixels}=input;if(!isFiniteClearingPoint(playerPosition)||!Number.isFinite(worldPixels.width)||!Number.isFinite(worldPixels.height)||worldPixels.width<=0||worldPixels.height<=0||playerPosition.x<.08||playerPosition.x>.92||playerPosition.y<.05||playerPosition.y>.94)return false;const elapsed=Math.max(0,(now-session.position.updatedAt)/1000),deltaX=(playerPosition.x-session.position.x)*worldPixels.width,deltaY=(playerPosition.y-session.position.y)*worldPixels.height,maxDistance=CLEARING_AIM_GEOMETRY.playerMovementSpeedPixelsPerSecond*elapsed+CLEARING_AIM_GEOMETRY.positionJitterAllowancePixels;if(Math.hypot(deltaX,deltaY)>maxDistance)return false;session.position={...playerPosition,updatedAt:now};return true;}

export function validateClearingAttackGeometry(input:{style:ClearingAttackStyle;playerPosition:ClearingPoint;aimDirection:ClearingDirection;aimPoint:ClearingPoint;enemyPosition:ClearingPoint;enemyRadiusPixels?:number;worldPixels:{width:number;height:number}}){
  const {worldPixels}=input,n=normalizeClearingDirection(input.aimDirection);
  if(!n||!isFiniteClearingPoint(input.playerPosition)||!isFiniteClearingPoint(input.aimPoint)||!isFiniteClearingPoint(input.enemyPosition)||!Number.isFinite(worldPixels?.width)||!Number.isFinite(worldPixels?.height)||worldPixels.width<=0||worldPixels.height<=0)return false;
  const acquisitionRange=input.style==="staff_orb"?CLEARING_AIM_GEOMETRY.staffAttackRangePixels:CLEARING_AIM_GEOMETRY.meleeAttackRangePixels;
  const expected=clearingPointInDirection(input.playerPosition,n,acquisitionRange,worldPixels);
  if(!expected||Math.hypot((expected.x-input.aimPoint.x)*worldPixels.width,(expected.y-input.aimPoint.y)*worldPixels.height)>CLEARING_AIM_GEOMETRY.serverAimPointTolerancePixels)return false;
  const radius=Math.max(0,Number(input.enemyRadiusPixels)||0);
  if(input.style!=="staff_orb"){const delta={dx:(input.enemyPosition.x-input.playerPosition.x)*worldPixels.width,dy:(input.enemyPosition.y-input.playerPosition.y)*worldPixels.height},distance=Math.hypot(delta.dx,delta.dy),edge=Math.max(0,distance-radius),alignment=distance?(delta.dx*n.dx+delta.dy*n.dy)/distance:1;return edge<=CLEARING_AIM_GEOMETRY.meleeTargetAssistRadiusPixels&&alignment>=Math.cos(CLEARING_AIM_GEOMETRY.meleePreferredConeDegrees*Math.PI/360)||edge<=CLEARING_AIM_GEOMETRY.meleeFallbackRadiusPixels;}
  const ray=clearingDistanceToRay(input.playerPosition,n,input.enemyPosition,acquisitionRange,worldPixels);
  const lane=input.style==="staff_orb"?CLEARING_AIM_GEOMETRY.staffCapsuleRadiusPixels:CLEARING_AIM_GEOMETRY.meleeCapsuleRadiusPixels;
  return Boolean(ray&&ray.along>=0&&ray.distance<=lane+radius);
}

export function applyClearingHit(input: { sessionId: string; instanceId: string; userId: string; petId: string; petDamage?: number; enemyPosition?:{x:number;y:number}; maxRangePixels?:number; attackGeometry?:Parameters<typeof validateClearingAttackGeometry>[0]; attackActionId?:string; now?: number }):ClearingHitResult {
  const now = input.now ?? Date.now();
  const session = sessions.get(input.sessionId);
  if (!session || session.expiresAt <= now || session.userId !== input.userId || session.petId !== input.petId) return { status: "invalid" as const };
  if(input.attackActionId&&session.processedAttacks.has(input.attackActionId))return session.processedAttacks.get(input.attackActionId)!;
  if(session.lockedTargetInstanceId&&session.lockedTargetInstanceId!==input.instanceId)return {status:"target_locked" as const};
  const enemy = session.enemies.find((candidate) => candidate.instanceId === input.instanceId);
  if (!enemy || enemy.defeated) return { status: "defeated" as const };
  const target=input.enemyPosition??enemy;
  const world=input.attackGeometry?.worldPixels??{width:CLEARING_AIM_GEOMETRY.worldWidthPixels,height:CLEARING_AIM_GEOMETRY.worldHeightPixels};
  if(input.attackGeometry&&!validateAndUpdateClearingCombatPosition({session,playerPosition:input.attackGeometry.playerPosition,worldPixels:world,now}))return {status:"direction" as const,enemy};
  const targetRadius=Math.max(0,input.attackGeometry?.enemyRadiusPixels??0),allowedEdgeRange=!input.attackGeometry?(input.maxRangePixels??CLEARING_AIM_GEOMETRY.meleeAttackRangePixels):input.attackGeometry.style==="staff_orb"?(input.maxRangePixels??CLEARING_AIM_GEOMETRY.staffAttackRangePixels):CLEARING_AIM_GEOMETRY.meleeAttackRangePixels+(session.lockedTargetInstanceId?CLEARING_AIM_GEOMETRY.meleeLockHysteresisPixels:0);
  const edgeDistance=Math.max(0,Math.hypot((target.x-session.position.x)*world.width,(target.y-session.position.y)*world.height)-targetRadius),coordinateDelta=Math.hypot((target.x-enemy.x)*world.width,(target.y-enemy.y)*world.height);
  const diagnostic=(reason:string):ClearingAttackDiagnostic=>({enemyInstanceId:enemy.instanceId,playerPosition:{x:session.position.x,y:session.position.y},clientTargetPosition:{x:target.x,y:target.y},serverEnemyPosition:{x:enemy.x,y:enemy.y},edgeDistance,allowedRange:allowedEdgeRange,rejectionReason:reason});
  if(!Number.isFinite(target.x)||!Number.isFinite(target.y)||coordinateDelta>CLEARING_AIM_GEOMETRY.serverEnemyPositionTolerancePixels)return {status:"desync" as const,enemy,diagnostic:diagnostic("enemy_position_desync")};
  if(input.attackGeometry){const geometry=input.attackGeometry;if((!session.lockedTargetInstanceId&&!validateClearingAttackGeometry(geometry))||!normalizeClearingDirection(geometry.aimDirection)||!isFiniteClearingPoint(geometry.aimPoint))return {status:"direction" as const,enemy};}
  if(edgeDistance>allowedEdgeRange)return {status:"range" as const,enemy,diagnostic:diagnostic("target_too_far")};
  // Persist the validated client simulation coordinate so rewards use the
  // enemy's exact final world position rather than its original spawn point.
  enemy.x=target.x;enemy.y=target.y;
  session.lockedTargetInstanceId=enemy.instanceId;
  enemy.lastHitAt = now;
  const previousHealth=enemy.health;
  enemy.health = Math.max(0, enemy.health - clamp(Math.round(input.petDamage ?? session.effectiveStats.atk), 20, 5_000));
  enemy.engagedByPlayer = enemy.health > 0;
  enemy.defeated = enemy.health === 0;
  if(enemy.defeated)session.lockedTargetInstanceId=null;
  const result:ClearingHitResult={ status: enemy.defeated ? "killed" : "hit", enemy, damage:previousHealth-enemy.health,lockedTargetInstanceId:session.lockedTargetInstanceId };if(input.attackActionId){session.processedAttacks.set(input.attackActionId,result);while(session.processedAttacks.size>64)session.processedAttacks.delete(session.processedAttacks.keys().next().value!);}return result;
}

export function respawnClearingEnemy(sessionId: string, instanceId: string) {
  const session = sessions.get(sessionId);
  const enemy = session?.enemies.find((candidate) => candidate.instanceId === instanceId && candidate.defeated);
  if (!enemy) return null;
  if(session?.lockedTargetInstanceId===instanceId)session.lockedTargetInstanceId=null;
  // A special mob is a one-off encounter for this session; it must not turn
  // into an endlessly farmable egg source after its guaranteed drop.
  if (enemy.specialPetShopItemId) return null;
  enemy.instanceId = crypto.randomUUID(); enemy.health = enemy.maxHealth; enemy.defeated = false; enemy.engagedByPlayer=false; enemy.lastHitAt = 0;
  return enemy;
}

export function synchronizeClearingSessions(userId:string,stats:{hp:number;atk:number;def:number}){for(const session of sessions.values())if(session.userId===userId){session.effectiveStats={...stats};}}

export function removeClearingSession(sessionId: string, userId?: string) {
  const session = sessions.get(sessionId);
  if (session && (!userId || session.userId === userId)) sessions.delete(sessionId);
}
