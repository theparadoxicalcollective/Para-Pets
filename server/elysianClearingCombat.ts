import crypto from "crypto";
import { CLEARING_BALANCE } from "@shared/clearingConfig";

export const ELYSIAN_CLEARING_COMBAT = {
  locationId: "a1b2c3d4-0011-4000-8000-000000000011",
  baseEnemyPopulation: 8,
  maxEnemyPopulation: 10,
  enemyCount: 8,
  expReward: 5,
  attackCooldownMs: 500,
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
  x: number; y: number;
  isBoss: boolean;
  engagedByPlayer: boolean;
  templateId?: string; name?: string; imageUrl?: string | null;
}
export interface ClearingSession { id: string; userId: string; petId: string; expiresAt: number; effectiveStats: { hp: number; atk: number; def: number }; enemies: ClearingEnemyRecord[]; position:{x:number;y:number;updatedAt:number} }

const sessions = new Map<string, ClearingSession>();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function scaleClearingEnemy(pet: ClearingPetStats) {
  const levelFactor = 1 + Math.min(0.25, Math.max(0, pet.level - 1) * 0.008);
  const rarityFactor = 1 + Math.min(0.12, Math.max(0, Number(pet.rarity || 1) - 1) * 0.025);
  const petDamage = clamp(Math.round(pet.atk), 20, 5_000);
  return {
    petDamage,
    maxHealth: clamp(Math.round(petDamage * 5 * levelFactor * rarityFactor), 100, 28_000),
    attack: clamp(Math.round(pet.hp / (8.5 * levelFactor)), 12, 3_500),
  };
}

export function createClearingSession(userId: string, petId: string, stats: ClearingPetStats, now = Date.now(), random=Math.random, templates:Array<{enemy_id:string;is_boss:boolean;name:string;image_url:string|null}>=[]): ClearingSession {
  for (const [id, session] of sessions) if (session.expiresAt <= now || session.userId === userId) sessions.delete(id);
  const scaled = scaleClearingEnemy(stats);
  const session: ClearingSession = {
    id: crypto.randomUUID(), userId, petId, expiresAt: now + ELYSIAN_CLEARING_COMBAT.sessionLifetimeMs,
    effectiveStats: { hp: stats.hp, atk: stats.atk, def: stats.def ?? 0 },
    position:{x:.5,y:.7,updatedAt:now}, enemies: Array.from({ length: ELYSIAN_CLEARING_COMBAT.enemyCount }, (_, slot) => {const bosses=templates.filter(t=>t.is_boss),regulars=templates.filter(t=>!t.is_boss),isBoss=slot===0&&bosses.length>0&&random()<CLEARING_BALANCE.bossSpawnChance,choices=isBoss?bosses:regulars,template=choices[Math.floor(random()*choices.length)],maxHealth=Math.round(scaled.maxHealth*(isBoss?CLEARING_BALANCE.bossHealthMultiplier:1));return{
      instanceId: crypto.randomUUID(), slot, maxHealth, health:maxHealth,
      attack:Math.round(scaled.attack*(isBoss?CLEARING_BALANCE.bossDamageMultiplier:1)),isBoss,engagedByPlayer:false,templateId:template?.enemy_id,name:template?.name,imageUrl:template?.image_url, defeated: false, lastHitAt: 0, x:[.28,.68,.35,.72,.48,.25,.63,.43][slot]??.5, y:[.24,.28,.43,.48,.58,.72,.72,.82][slot]??.6,
    }}),
  };
  sessions.set(session.id, session);
  return session;
}

export function getClearingSession(sessionId:string){return sessions.get(sessionId)??null;}
export function updateClearingPosition(input:{sessionId:string;userId:string;x:number;y:number;now?:number}){
  const now=input.now??Date.now(),session=sessions.get(input.sessionId);
  if(!session||session.userId!==input.userId||session.expiresAt<=now)return null;
  if(!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<.18||input.x>.82||input.y<.08||input.y>.9)return null;
  const elapsed=Math.max(.1,(now-session.position.updatedAt)/1000),distance=Math.hypot(input.x-session.position.x,input.y-session.position.y);
  if(distance>.17*elapsed+.08)return null;
  session.position={x:input.x,y:input.y,updatedAt:now};return session.position;
}

export function applyClearingHit(input: { sessionId: string; instanceId: string; userId: string; petId: string; petDamage?: number; enemyPosition?:{x:number;y:number}; maxRangePixels?:number; now?: number }) {
  const now = input.now ?? Date.now();
  const session = sessions.get(input.sessionId);
  if (!session || session.expiresAt <= now || session.userId !== input.userId || session.petId !== input.petId) return { status: "invalid" as const };
  const enemy = session.enemies.find((candidate) => candidate.instanceId === input.instanceId);
  if (!enemy || enemy.defeated) return { status: "defeated" as const };
  if (now - enemy.lastHitAt < ELYSIAN_CLEARING_COMBAT.attackCooldownMs) return { status: "cooldown" as const, enemy };
  const target=input.enemyPosition??enemy;
  if(!Number.isFinite(target.x)||!Number.isFinite(target.y)||Math.hypot((target.x-enemy.x)*400,(target.y-enemy.y)*800)>240||Math.hypot((target.x-session.position.x)*400,(target.y-session.position.y)*800)>(input.maxRangePixels??145))return {status:"range" as const,enemy};
  // Persist the validated client simulation coordinate so rewards use the
  // enemy's exact final world position rather than its original spawn point.
  enemy.x=target.x;enemy.y=target.y;
  enemy.lastHitAt = now;
  const previousHealth=enemy.health;
  enemy.health = Math.max(0, enemy.health - clamp(Math.round(input.petDamage ?? session.effectiveStats.atk), 20, 5_000));
  enemy.engagedByPlayer = enemy.health > 0;
  enemy.defeated = enemy.health === 0;
  return { status: enemy.defeated ? "killed" as const : "hit" as const, enemy, damage:previousHealth-enemy.health };
}

export function respawnClearingEnemy(sessionId: string, instanceId: string) {
  const session = sessions.get(sessionId);
  const enemy = session?.enemies.find((candidate) => candidate.instanceId === instanceId && candidate.defeated);
  if (!enemy) return null;
  enemy.instanceId = crypto.randomUUID(); enemy.health = enemy.maxHealth; enemy.defeated = false; enemy.engagedByPlayer=false; enemy.lastHitAt = 0;
  return enemy;
}

export function synchronizeClearingSessions(userId:string,stats:{hp:number;atk:number;def:number}){for(const session of sessions.values())if(session.userId===userId){session.effectiveStats={...stats};}}

export function removeClearingSession(sessionId: string, userId?: string) {
  const session = sessions.get(sessionId);
  if (session && (!userId || session.userId === userId)) sessions.delete(sessionId);
}
