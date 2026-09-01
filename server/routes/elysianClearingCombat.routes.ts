import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import {
  ELYSIAN_CLEARING_COMBAT,
  advanceClearingBossEncounter,
  applyClearingHit,
  completeClearingBossEncounter,
  createClearingSession,
  getClearingSession,
  removeClearingSession,
  recordClearingRegularDefeat,
  respawnClearingEnemy,
  scaleClearingEnemy,
  updateClearingEnemyPositions,
  updateClearingPosition,
} from "../elysianClearingCombat";
import { calculateClearingStats, ensureClearingStarterWeapon, getClearingLoadout } from "../clearingEquipment";
import { clearingSpecialDamage, resolveClearingAttackStyle, resolveClearingSpecialKind } from "@shared/clearingCombat";
import { claimClearingRewardChest, ClearingChestError, createClearingRewardChest, getClearingRewardChests } from "../clearingRewardChests";
import { CLEARING_BALANCE } from "@shared/clearingConfig";
import { collectSpecialEggDrop, createSpecialEggDrop, getSpecialEggDrops } from "../clearingSpecialMobs";

type RequestedStrikeTarget = {
  enemyInstanceId: string;
  targetPosition: { x: number; y: number };
};

export function resolveClearingPetBaseStats(pet: { petHealth?: unknown; petAtk?: unknown; petDef?: unknown }) {
  return {
    hp: Number(pet.petHealth) || 1000,
    atk: Number(pet.petAtk) || 50,
    def: Number(pet.petDef) || 50,
  };
}

export function registerElysianClearingCombatRoutes(app: Express, deps: { db: any; storage: any; isAuthenticated: RequestHandler }) {
  const { db, storage, isAuthenticated } = deps;

  const grantDefeatReward = async (input: { userId: string; pet: any; sessionId: string; enemyInstanceId: string; enemy: any }) => {
    const { userId, pet, sessionId, enemyInstanceId } = input;
    const enemy = { ...input.enemy };
    const claimKey = `elysian-clearing-defeat:${userId}:${enemyInstanceId}`;

    return db.transaction(async (tx: any) => {
      const inserted = await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES (${claimKey}, ${new Date().toISOString()}) ON CONFLICT (key) DO NOTHING RETURNING key`);
      if (!inserted.rows.length) return null;

      const current = await tx.execute(sql`SELECT xp_boost_until, xp_boost_pct, pet_level, pet_level_points FROM user_inventory WHERE id = ${pet.id} AND user_id = ${userId} FOR UPDATE`);
      if (!current.rows.length) throw new Error("Active pet disappeared during reward grant");

      const row = current.rows[0] as any;
      const baseExp = enemy.isBoss ? CLEARING_BALANCE.bossExp : CLEARING_BALANCE.regularExp;
      const boostedExp = row.xp_boost_until && new Date(row.xp_boost_until).getTime() > Date.now()
        ? Math.round(baseExp * (1 + Number(row.xp_boost_pct || 0) / 100))
        : baseExp;
      let level = Number(row.pet_level || pet.petLevel || 1);
      let points = Number(row.pet_level_points || 0) + boostedExp;
      while (level < 100) {
        const needed = Math.floor(100 + level * 30 + level * level * 5);
        if (points < needed) break;
        points -= needed;
        level++;
      }
      if (level >= 100) {
        level = 100;
        points = 0;
      }

      await tx.execute(sql`UPDATE user_inventory SET pet_level=${level},pet_level_points=${points} WHERE id=${pet.id} AND user_id=${userId}`);
      const eggDrop = enemy.specialPetShopItemId
        ? await createSpecialEggDrop(tx, {
            userId,
            sessionId,
            clearingId: ELYSIAN_CLEARING_COMBAT.locationId,
            enemyId: enemyInstanceId,
            petShopItemId: enemy.specialPetShopItemId,
            worldX: enemy.x,
            worldY: enemy.y,
          })
        : null;
      const chest = eggDrop
        ? null
        : await createClearingRewardChest(tx, {
            userId,
            sessionId,
            clearingId: ELYSIAN_CLEARING_COMBAT.locationId,
            worldId: "swamp",
            enemyId: enemyInstanceId,
            petInventoryId: pet.id,
            worldX: enemy.x,
            worldY: enemy.y,
            boss: enemy.isBoss,
          });
      return { chest, eggDrop, expAwarded: boostedExp, boss: enemy.isBoss, pet: { level, levelPoints: points } };
    });
  };

  app.post("/api/explore/elysian-clearing/session", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    try {
      const inventory = await storage.getUserInventory(user.id);
      const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
      if (!pet) return res.status(400).json({ code: "CLEARING_ACTIVE_PET_REQUIRED", message: "Choose a hatched active pet before entering the Clearing" });

      let loadout;
      try {
        loadout = await ensureClearingStarterWeapon(db, user.id);
      } catch (error: any) {
        const migrationFailure = ["42P01", "42703", "42830"].includes(error?.code);
        console.error("Clearing starter weapon preparation failed", {
          userId: user.id,
          code: error?.code ?? "unknown",
          message: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({
          code: migrationFailure ? "CLEARING_MIGRATION_REQUIRED" : "CLEARING_STARTER_WEAPON_FAILED",
          message: "Unable to prepare Clearing equipment",
        });
      }

      const baseStats = resolveClearingPetBaseStats(pet);
      const effective = calculateClearingStats(baseStats, loadout.totals);
      const stats = { level: pet.petLevel || 1, ...effective, rarity: pet.rarity };
      const configured = await db.execute(sql`SELECT a.enemy_id,a.is_boss,e.name,e.image_url FROM clearing_world_enemies a JOIN enemies e ON e.id=a.enemy_id WHERE a.world_id='swamp' ORDER BY a.sort_order`);
      const special = await db.execute(sql`SELECT a.pet_shop_item_id,s.name,COALESCE(s.rarity,1) rarity,s.egg_image_url,s.hatched_image_url,s.image_url FROM clearing_world_special_mobs a JOIN shop_items s ON s.id=a.pet_shop_item_id WHERE a.world_id='swamp' AND s.type='pet'`);
      if (!configured.rows.length) console.warn("No Clearing enemies configured for swamp; using temporary Elysian fallback");

      const session = createClearingSession(user.id, pet.id, stats, Date.now(), Math.random, configured.rows as any, special.rows as any, { ...stats, ...baseStats });
      const chests = await getClearingRewardChests(db, { userId: user.id, sessionId: session.id, clearingId: ELYSIAN_CLEARING_COMBAT.locationId });
      const eggDrops = await getSpecialEggDrops(db, { userId: user.id, sessionId: session.id, clearingId: ELYSIAN_CLEARING_COMBAT.locationId });
      return res.json({
        sessionId: session.id,
        loadout,
        pet: { inventoryId: pet.id, maxHealth: stats.hp, attack: scaleClearingEnemy(stats).petDamage, defense: stats.def },
        enemies: session.enemies.map(({ lastHitAt: _lastHitAt, positionUpdatedAt: _positionUpdatedAt, ...enemy }) => enemy),
        chests,
        eggDrops,
        clearingBossProgress:session.clearingBossProgress,
      });
    } catch (error: any) {
      console.error("Clearing session creation failed", {
        userId: user.id,
        code: error?.code ?? "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ code: "CLEARING_TEMPORARILY_UNAVAILABLE", message: "The Clearing is temporarily unavailable" });
    }
  });

  app.post("/api/explore/elysian-clearing/boss/advance", isAuthenticated, (req, res) => {
    const sessionId=req.body?.sessionId;
    if(typeof sessionId!=="string")return res.status(400).json({code:"CLEARING_MALFORMED_REQUEST",message:"Invalid boss encounter request"});
    const boss=advanceClearingBossEncounter({sessionId,userId:(req.user as any).id});
    if(!boss)return res.status(409).json({code:"CLEARING_BOSS_NOT_READY",message:"The boss encounter is not ready"});
    return res.json({boss,clearingBossProgress:getClearingSession(sessionId)!.clearingBossProgress});
  });

  app.post("/api/explore/elysian-clearing/attack", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    try {
      const body = req.body ?? {};
      const sessionId = body.sessionId;
      const attackActionId = body.attackActionId;
      const rawTargets: unknown[] = Array.isArray(body.targets)
        ? body.targets
        : [{ enemyInstanceId: body.enemyInstanceId, targetPosition: body.targetPosition }];

      if (typeof sessionId !== "string" || typeof attackActionId !== "string" || attackActionId.length > 100 || rawTargets.length < 1 || rawTargets.length > 2) {
        return res.status(400).json({ code: "CLEARING_MALFORMED_REQUEST", message: "Invalid combat request" });
      }

      const targets = rawTargets.map(value => {
        const candidate = value as { enemyInstanceId?: unknown; targetPosition?: { x?: unknown; y?: unknown } };
        return { enemyInstanceId: candidate?.enemyInstanceId, targetPosition: candidate?.targetPosition };
      });
      const malformedTarget = targets.some(target => {
        const x = target.targetPosition?.x;
        const y = target.targetPosition?.y;
        return typeof target.enemyInstanceId !== "string" || typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y);
      });
      if (malformedTarget || new Set(targets.map(target => target.enemyInstanceId)).size !== targets.length) {
        return res.status(400).json({ code: "CLEARING_MALFORMED_REQUEST", message: "Invalid combat targets" });
      }
      const validatedTargets = targets as RequestedStrikeTarget[];

      const { playerPosition, aimDirection, aimPoint, worldPixels, isSpecial } = body;
      if (!playerPosition || !aimDirection || !aimPoint || !worldPixels) return res.status(400).json({ message: "Invalid directional combat request" });

      const session = getClearingSession(sessionId);
      if (!session || session.userId !== user.id || session.expiresAt <= Date.now()) {
        return res.status(409).json({ code: "CLEARING_SESSION_EXPIRED", message: "Combat session expired" });
      }

      const inventory = await storage.getUserInventory(user.id);
      const pet = inventory.find((item: any) => item.id === user.activePetId && item.isHatched);
      if (!pet) return res.status(400).json({ message: "An active hatched pet is required" });
      if (session.petId !== pet.id) return res.status(409).json({ code: "CLEARING_ACTIVE_PET_CHANGED", message: "Your active pet changed. Recreating the Clearing session." });

      const loadout = await getClearingLoadout(db, user.id);
      const style = resolveClearingAttackStyle(loadout.weapon ? { attackStyle: loadout.weapon.attackStyle, name: loadout.weapon.name } : undefined);
      const specialKind = resolveClearingSpecialKind(pet);
      const sessionDamage = session.effectiveStats.atk;
      const petDamage = isSpecial === true && specialKind === "damage" && sessionDamage ? clearingSpecialDamage(sessionDamage) : undefined;
      const hits: any[] = [];

      for (let index = 0; index < validatedTargets.length; index++) {
        const target = validatedTargets[index];
        const enemy = session.enemies.find(candidate => candidate.instanceId === target.enemyInstanceId);
        if (!enemy) {
          if (index === 0) return res.status(400).json({ message: "Invalid directional combat request" });
          continue;
        }

        const result = applyClearingHit({
          sessionId,
          instanceId: target.enemyInstanceId,
          userId: user.id,
          petId: pet.id,
          petDamage,
          enemyPosition: target.targetPosition,
          maxRangePixels: style === "staff_orb" ? 250 : undefined,
          attackActionId: index === 0 ? attackActionId : `${attackActionId}:${index}`,
          secondaryStrike: index > 0,
          attackGeometry: {
            style,
            playerPosition,
            aimDirection,
            aimPoint,
            enemyPosition: target.targetPosition,
            enemyRadiusPixels: enemy.isBoss ? 25 : 19,
            worldPixels,
          },
        });

        if (process.env.NODE_ENV !== "production" && result.diagnostic) console.debug("Clearing attack geometry rejection", result.diagnostic);
        if (!["hit", "killed"].includes(result.status)) {
          if (index > 0) continue;
          if (result.status === "invalid") return res.status(409).json({ code: "CLEARING_SESSION_EXPIRED", message: "Combat session expired" });
          if (result.status === "range") return res.status(409).json({ code: "CLEARING_TARGET_TOO_FAR", message: "Target is out of range" });
          if (result.status === "desync") return res.status(409).json({ code: "CLEARING_ENEMY_POSITION_DESYNC", message: "Enemy position could not be synchronized" });
          if (result.status === "direction") return res.status(409).json({ code: "CLEARING_INVALID_POSITION", message: "Attack position or direction was rejected" });
          if (result.status === "target_locked") return res.status(409).json({ code: "CLEARING_TARGET_LOCKED", message: "Combat is locked to another target" });
          return res.status(409).json({ message: "Enemy already defeated" });
        }

        if (result.status === "hit") {
          hits.push({
            enemyInstanceId: target.enemyInstanceId,
            defeated: false,
            health: result.enemy!.health,
            maxHealth: result.enemy!.maxHealth,
            damage: result.damage,
          });
          continue;
        }

        const enemySnapshot = { ...result.enemy! };
        const reward = await grantDefeatReward({ userId: user.id, pet, sessionId, enemyInstanceId: target.enemyInstanceId, enemy: enemySnapshot });
        if (!reward) {
          if (index === 0) return res.status(409).json({ message: "Reward already claimed" });
          continue;
        }
        const bossProgress=enemySnapshot.isBoss?session.clearingBossProgress:recordClearingRegularDefeat(sessionId,target.enemyInstanceId);
        const nextEnemies=enemySnapshot.isBoss?completeClearingBossEncounter(sessionId,target.enemyInstanceId):null;
        const nextEnemy = enemySnapshot.isBoss ? null : respawnClearingEnemy(sessionId, target.enemyInstanceId);
        if (reward.eggDrop && nextEnemy) {
          nextEnemy.specialPetShopItemId = undefined;
          nextEnemy.specialRarity = undefined;
        }
        hits.push({
          enemyInstanceId: target.enemyInstanceId,
          defeated: true,
          health: 0,
          maxHealth: enemySnapshot.maxHealth,
          damage: result.damage,
          chest: reward.chest,
          eggDrop: reward.eggDrop,
          boss: reward.boss,
          expAwarded: reward.expAwarded,
          pet: reward.pet,
          nextEnemy: nextEnemy ? { ...nextEnemy } : null,
          nextEnemies:nextEnemies?.map(enemy=>({...enemy}))??null,
          clearingBossProgress:session.clearingBossProgress??bossProgress,
        });
      }

      const primary = hits[0];
      if (!primary) return res.status(409).json({ code: "CLEARING_NO_TARGET", message: "No enemy could be struck" });
      return res.json({ ...primary, hits, lockedTargetInstanceId: session.lockedTargetInstanceId });
    } catch (error: any) {
      console.error("Clearing attack failed", { userId: user.id, code: error?.code ?? "unknown" });
      return res.status(500).json({ code: "CLEARING_ATTACK_FAILED", message: "The Clearing attack could not be completed" });
    }
  });

  app.get("/api/explore/elysian-clearing/chests/:sessionId", isAuthenticated, async (req, res) => {
    return res.json(await getClearingRewardChests(db, {
      userId: (req.user as any).id,
      sessionId: req.params.sessionId as string,
      clearingId: ELYSIAN_CLEARING_COMBAT.locationId,
    }));
  });

  app.post("/api/explore/elysian-clearing/chests/:chestId/claim", isAuthenticated, async (req, res) => {
    try {
      return res.json(await claimClearingRewardChest(db, { userId: (req.user as any).id, chestId: req.params.chestId as string }));
    } catch (error) {
      if (error instanceof ClearingChestError) return res.status(error.code === "not_found" ? 404 : 409).json({ code: error.code, message: error.message });
      throw error;
    }
  });

  app.get("/api/explore/elysian-clearing/eggs/:sessionId", isAuthenticated, async (req, res) => {
    return res.json(await getSpecialEggDrops(db, {
      userId: (req.user as any).id,
      sessionId: req.params.sessionId as string,
      clearingId: ELYSIAN_CLEARING_COMBAT.locationId,
    }));
  });

  app.post("/api/explore/elysian-clearing/eggs/:dropId/collect", isAuthenticated, async (req, res) => {
    const session = getClearingSession(String(req.body?.sessionId || ""));
    if (!session || session.userId !== (req.user as any).id) return res.status(409).json({ message: "Clearing session expired" });
    try {
      return res.json(await collectSpecialEggDrop(db, {
        userId: session.userId,
        sessionId: session.id,
        dropId: req.params.dropId as string,
        playerX: session.position.x,
        playerY: session.position.y,
      }));
    } catch (error) {
      return res.status(409).json({ message: error instanceof Error ? error.message : "Unable to collect egg" });
    }
  });

  app.post("/api/explore/elysian-clearing/position", isAuthenticated, (req, res) => {
    const { sessionId, x, y, enemyPositions, worldPixels } = req.body ?? {};
    if (typeof sessionId !== "string" || typeof x !== "number" || typeof y !== "number") return res.status(400).json({ message: "Invalid Clearing position" });
    const accepted = updateClearingPosition({ sessionId, userId: (req.user as any).id, x, y, worldPixels });
    if (!accepted) return res.status(409).json({ message: "Clearing position was rejected" });
    if (enemyPositions !== undefined && !updateClearingEnemyPositions({ sessionId, userId: (req.user as any).id, positions: enemyPositions, worldPixels })) {
      return res.status(409).json({ code: "CLEARING_ENEMY_POSITION_DESYNC", message: "Enemy position update was rejected" });
    }
    return res.json(accepted);
  });

  app.delete("/api/explore/elysian-clearing/session/:sessionId", isAuthenticated, (req, res) => {
    removeClearingSession(req.params.sessionId as string, (req.user as any).id);
    return res.status(204).end();
  });
}

