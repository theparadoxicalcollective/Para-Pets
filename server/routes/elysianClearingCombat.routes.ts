import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, getClearingSession, removeClearingSession, respawnClearingEnemy, scaleClearingEnemy, updateClearingEnemyPositions, updateClearingPosition } from "../elysianClearingCombat";
import { calculateClearingStats, ensureClearingStarterWeapon, getClearingLoadout } from "../clearingEquipment";
import { clearingSpecialDamage, resolveClearingAttackStyle, resolveClearingSpecialKind } from "@shared/clearingCombat";
import { claimClearingRewardChest, ClearingChestError, createClearingRewardChest, getClearingRewardChests } from "../clearingRewardChests";
import { CLEARING_BALANCE } from "@shared/clearingConfig";
import { collectSpecialEggDrop, createSpecialEggDrop, getSpecialEggDrops } from "../clearingSpecialMobs";

export function resolveClearingPetBaseStats(pet: { petHealth?: unknown; petAtk?: unknown; petDef?: unknown }) {
  return {
    hp: Number(pet.petHealth) || 1000,
    atk: Number(pet.petAtk) || 50,
    def: Number(pet.petDef) || 50,
  };
}

export function registerElysianClearingCombatRoutes(app: Express, deps: { db: any; storage: any; isAuthenticated: RequestHandler }) {
  const { db, storage, isAuthenticated } = deps;

  app.post("/api/explore/elysian-clearing/session", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    try {
      const inventory = await storage.getUserInventory(user.id);
      const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
      if (!pet) return res.status(400).json({ code: "CLEARING_ACTIVE_PET_REQUIRED", message: "Choose a hatched active pet before entering the Clearing" });
      let loadout;
      try { loadout = await ensureClearingStarterWeapon(db, user.id); }
      catch (error: any) {
        const migrationFailure = ["42P01", "42703", "42830"].includes(error?.code);
        console.error("Clearing starter weapon preparation failed", { userId: user.id, code: error?.code ?? "unknown", message: error instanceof Error ? error.message : String(error) });
        return res.status(500).json({ code: migrationFailure ? "CLEARING_MIGRATION_REQUIRED" : "CLEARING_STARTER_WEAPON_FAILED", message: "Unable to prepare Clearing equipment" });
      }
      // Clearing starts from the active inventory pet's real stats; equipped
      // Clearing gear is then added by the existing stat calculator.
      const effective = calculateClearingStats(resolveClearingPetBaseStats(pet), loadout.totals);
      const stats = { level: pet.petLevel || 1, ...effective, rarity: pet.rarity };
      const configured=await db.execute(sql`SELECT a.enemy_id,a.is_boss,e.name,e.image_url FROM clearing_world_enemies a JOIN enemies e ON e.id=a.enemy_id WHERE a.world_id='swamp' ORDER BY a.sort_order`);
      const special=await db.execute(sql`SELECT a.pet_shop_item_id,s.name,COALESCE(s.rarity,1) rarity,s.egg_image_url,s.hatched_image_url,s.image_url FROM clearing_world_special_mobs a JOIN shop_items s ON s.id=a.pet_shop_item_id WHERE a.world_id='swamp' AND s.type='pet'`);
      if(!configured.rows.length)console.warn("No Clearing enemies configured for swamp; using temporary Elysian fallback");
      const session = createClearingSession(user.id, pet.id, stats,Date.now(),Math.random,configured.rows as any,special.rows as any);
      const chests=await getClearingRewardChests(db,{userId:user.id,sessionId:session.id,clearingId:ELYSIAN_CLEARING_COMBAT.locationId});
      const eggDrops=await getSpecialEggDrops(db,{userId:user.id,sessionId:session.id,clearingId:ELYSIAN_CLEARING_COMBAT.locationId});
      return res.json({ sessionId: session.id, loadout,
        pet: { inventoryId: pet.id, maxHealth: stats.hp, attack: scaleClearingEnemy(stats).petDamage, defense: stats.def },
        enemies: session.enemies.map(({ lastHitAt: _lastHitAt, positionUpdatedAt: _positionUpdatedAt, ...enemy }) => enemy), chests,eggDrops });
    } catch (error: any) {
      console.error("Clearing session creation failed", { userId: user.id, code: error?.code ?? "unknown", message: error instanceof Error ? error.message : String(error) });
      return res.status(503).json({ code: "CLEARING_TEMPORARILY_UNAVAILABLE", message: "The Clearing is temporarily unavailable" });
    }
  });

  app.post("/api/explore/elysian-clearing/attack", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const { sessionId, enemyInstanceId, playerPosition, aimDirection, aimPoint, targetPosition, worldPixels, isSpecial,attackActionId } = req.body ?? {};
    if (typeof sessionId !== "string" || typeof enemyInstanceId !== "string"||typeof attackActionId!=="string"||attackActionId.length>100) return res.status(400).json({code:"CLEARING_MALFORMED_REQUEST", message: "Invalid combat request" });
    const inventory = await storage.getUserInventory(user.id);
    const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
    if (!pet) return res.status(400).json({ message: "An active hatched pet is required" });
    const loadout=await getClearingLoadout(db,user.id),style=resolveClearingAttackStyle(loadout.weapon?{attackStyle:loadout.weapon.attackStyle,name:loadout.weapon.name}:undefined);
    const specialKind=resolveClearingSpecialKind(pet),sessionDamage=getClearingSession(sessionId)?.effectiveStats.atk;
    const petDamage=isSpecial===true&&specialKind==="damage"&&sessionDamage?clearingSpecialDamage(sessionDamage):undefined;
    const enemy=getClearingSession(sessionId)?.enemies.find(candidate=>candidate.instanceId===enemyInstanceId);
    if(!enemy||!playerPosition||!aimDirection||!aimPoint||!targetPosition||!worldPixels)return res.status(400).json({message:"Invalid directional combat request"});
    const result = applyClearingHit({ sessionId, instanceId: enemyInstanceId, userId: user.id, petId: pet.id, petDamage, enemyPosition:targetPosition,maxRangePixels:style==="staff_orb"?250:undefined,attackActionId,attackGeometry:{style,playerPosition,aimDirection,aimPoint,enemyPosition:targetPosition,enemyRadiusPixels:enemy.isBoss?25:19,worldPixels} });
    if(process.env.NODE_ENV!=="production"&&result.diagnostic)console.debug("Clearing attack geometry rejection",result.diagnostic);
    if (result.status === "invalid") return res.status(409).json({code:"CLEARING_SESSION_EXPIRED", message: "Combat session expired" });
    if (result.status === "range") return res.status(409).json({code:"CLEARING_TARGET_TOO_FAR", message: "Target is out of range" });
    if (result.status === "desync") return res.status(409).json({code:"CLEARING_ENEMY_POSITION_DESYNC", message: "Enemy position could not be synchronized" });
    if (result.status === "direction") return res.status(409).json({code:"CLEARING_INVALID_POSITION", message: "Attack position or direction was rejected" });
    if (result.status === "target_locked") return res.status(409).json({ code:"CLEARING_TARGET_LOCKED",message: "Combat is locked to another target" });
    if (result.status === "defeated") return res.status(409).json({ message: "Enemy already defeated" });
    if (result.status === "hit") return res.json({ defeated: false, health: result.enemy!.health, maxHealth: result.enemy!.maxHealth, damage:result.damage,lockedTargetInstanceId:result.lockedTargetInstanceId });

    const claimKey = `elysian-clearing-defeat:${user.id}:${enemyInstanceId}`;
    const reward = await db.transaction(async (tx: any) => {
      const inserted = await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES (${claimKey}, ${new Date().toISOString()}) ON CONFLICT (key) DO NOTHING RETURNING key`);
      if (!inserted.rows.length) return null;
      const current = await tx.execute(sql`SELECT xp_boost_until, xp_boost_pct, pet_level, pet_level_points FROM user_inventory WHERE id = ${pet.id} AND user_id = ${user.id} FOR UPDATE`);
      if (!current.rows.length) throw new Error("Active pet disappeared during reward grant");
      const row = current.rows[0] as any;
      const baseExp = result.enemy!.isBoss ? CLEARING_BALANCE.bossExp : CLEARING_BALANCE.regularExp;
      const boostedExp = row.xp_boost_until && new Date(row.xp_boost_until).getTime() > Date.now()
        ? Math.round(baseExp * (1 + Number(row.xp_boost_pct || 0) / 100)) : baseExp;
      let level=Number((current.rows[0] as any).pet_level||pet.petLevel||1), points=Number((current.rows[0] as any).pet_level_points||0)+boostedExp;
      while(level<100){const needed=Math.floor(100+level*30+level*level*5);if(points<needed)break;points-=needed;level++;} if(level>=100){level=100;points=0;}
      await tx.execute(sql`UPDATE user_inventory SET pet_level=${level},pet_level_points=${points} WHERE id=${pet.id} AND user_id=${user.id}`);
      const eggDrop=result.enemy!.specialPetShopItemId?await createSpecialEggDrop(tx,{userId:user.id,sessionId,clearingId:ELYSIAN_CLEARING_COMBAT.locationId,enemyId:enemyInstanceId,petShopItemId:result.enemy!.specialPetShopItemId,worldX:result.enemy!.x,worldY:result.enemy!.y}):null;
      const chest=eggDrop?null:await createClearingRewardChest(tx,{userId:user.id,sessionId,clearingId:ELYSIAN_CLEARING_COMBAT.locationId,worldId:"swamp",enemyId:enemyInstanceId,petInventoryId:pet.id,worldX:result.enemy!.x,worldY:result.enemy!.y,boss:result.enemy!.isBoss});
      return { chest,eggDrop, expAwarded:boostedExp, boss:result.enemy!.isBoss, pet:{level,levelPoints:points} };
    });
    if (!reward) return res.status(409).json({ message: "Reward already claimed" });
    const nextEnemy = respawnClearingEnemy(sessionId, enemyInstanceId);
    if(reward.eggDrop&&nextEnemy){nextEnemy.specialPetShopItemId=undefined;nextEnemy.specialRarity=undefined;}
    return res.json({ defeated: true, health: 0, maxHealth: result.enemy!.maxHealth, chest:reward.chest,eggDrop:reward.eggDrop, boss:reward.boss, expAwarded:reward.expAwarded, pet:reward.pet, nextEnemy });
  });

  app.get("/api/explore/elysian-clearing/chests/:sessionId",isAuthenticated,async(req,res)=>res.json(await getClearingRewardChests(db,{userId:(req.user as any).id,sessionId:req.params.sessionId as string,clearingId:ELYSIAN_CLEARING_COMBAT.locationId})));
  app.post("/api/explore/elysian-clearing/chests/:chestId/claim",isAuthenticated,async(req,res)=>{try{return res.json(await claimClearingRewardChest(db,{userId:(req.user as any).id,chestId:req.params.chestId as string}));}catch(error){if(error instanceof ClearingChestError)return res.status(error.code==="not_found"?404:409).json({code:error.code,message:error.message});throw error;}});
  app.get("/api/explore/elysian-clearing/eggs/:sessionId",isAuthenticated,async(req,res)=>res.json(await getSpecialEggDrops(db,{userId:(req.user as any).id,sessionId:req.params.sessionId as string,clearingId:ELYSIAN_CLEARING_COMBAT.locationId})));
  app.post("/api/explore/elysian-clearing/eggs/:dropId/collect",isAuthenticated,async(req,res)=>{const session=getClearingSession(String(req.body?.sessionId||""));if(!session||session.userId!==(req.user as any).id)return res.status(409).json({message:"Clearing session expired"});try{return res.json(await collectSpecialEggDrop(db,{userId:session.userId,sessionId:session.id,dropId:req.params.dropId as string,playerX:session.position.x,playerY:session.position.y}));}catch(error){return res.status(409).json({message:error instanceof Error?error.message:"Unable to collect egg"})}});

  app.post("/api/explore/elysian-clearing/position",isAuthenticated,(req,res)=>{
    const {sessionId,x,y,enemyPositions,worldPixels}=req.body??{};
    if(typeof sessionId!=="string"||typeof x!=="number"||typeof y!=="number")return res.status(400).json({message:"Invalid Clearing position"});
    const accepted=updateClearingPosition({sessionId,userId:(req.user as any).id,x,y});
    if(!accepted)return res.status(409).json({message:"Clearing position was rejected"});
    if(enemyPositions!==undefined&&!updateClearingEnemyPositions({sessionId,userId:(req.user as any).id,positions:enemyPositions,worldPixels}))return res.status(409).json({code:"CLEARING_ENEMY_POSITION_DESYNC",message:"Enemy position update was rejected"});
    return res.json(accepted);
  });

  app.delete("/api/explore/elysian-clearing/session/:sessionId", isAuthenticated, (req, res) => {
    removeClearingSession(req.params.sessionId as string, (req.user as any).id);
    return res.status(204).end();
  });
}
