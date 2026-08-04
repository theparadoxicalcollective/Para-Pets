import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { RequestHandler } from "express";
import { createClearingSession } from "../server/elysianClearingCombat";
import { registerElysianClearingCombatRoutes } from "../server/routes/elysianClearingCombat.routes";

test("an attack from pet A's session is rejected without damage or rewards after switching to pet B", async () => {
  const routes: Array<{ method: string; path: string; handlers: RequestHandler[] }> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "POST", path, handlers }); },
    get(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "GET", path, handlers }); },
    delete(path: string, ...handlers: RequestHandler[]) { routes.push({ method: "DELETE", path, handlers }); },
  };
  let transactions = 0;
  registerElysianClearingCombatRoutes(app as any, {
    db: { transaction: async () => { transactions++; throw new Error("rewards must not run"); } },
    storage: { getUserInventory: async () => [{ id: "pet-b", isHatched: true }] },
    isAuthenticated: ((_req, _res, next) => next()) as RequestHandler,
  });
  const session = createClearingSession("switch-user", "pet-a", { level: 1, hp: 1000, atk: 50 });
  const enemy = session.enemies[0];
  const healthBefore = enemy.health;
  const attack = routes.find(route => route.method === "POST" && route.path.endsWith("/attack"))!.handlers.at(-1)!;
  let status = 200;
  let body: any;
  await attack({
    user: { id: "switch-user", activePetId: "pet-b" },
    body: {
      sessionId: session.id,
      enemyInstanceId: enemy.instanceId,
      targetPosition: { x: enemy.x, y: enemy.y },
      playerPosition: { x: session.position.x, y: session.position.y },
      aimDirection: { dx: 1, dy: 0 },
      aimPoint: { x: enemy.x, y: enemy.y },
      worldPixels: { width: 400, height: 800 },
      attackActionId: "race-attack",
    },
  } as any, {
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any, (() => {}) as any);
  assert.equal(status, 409);
  assert.deepEqual(body, { code: "CLEARING_ACTIVE_PET_CHANGED", message: "Your active pet changed. Recreating the Clearing session." });
  assert.equal(enemy.health, healthBefore, "the stale attack deals no damage");
  assert.equal(transactions, 0, "EXP, currency, chest, equipment, and egg reward work is never reached");
});

test("the Clearing client lifecycle is keyed, abortable, identity checked, and bounded", () => {
  const scene = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
  const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
  assert.match(scene, /key=\{activePetInventoryId\}/);
  assert.match(scene, /setClearingReady\(false\)/);
  assert.match(scene, /setLoadingComplete\(false\)/);
  assert.match(combat, /\[activePetInventoryId,inventoryLoaded,sessionAttempt\]/);
  assert.match(combat, /data\.pet\.inventoryId!==activePetInventoryId/);
  assert.match(combat, /new AbortController\(\)/);
  assert.match(combat, /controller\.abort\(\)/);
  assert.match(combat, /timers\.current\.forEach\(clearTimeout\)/);
  assert.match(combat, /queuedAttackRef\.current=false/);
  assert.match(combat, /updateTargetLock\(null\)/);
  assert.match(combat, /automaticRecoveryUsed\.current/);
  assert.match(combat, /CLEARING_ACTIVE_PET_CHANGED","CLEARING_SESSION_EXPIRED/);
});

test("pet selection waits for server confirmation and preserves the auth user cache shape", () => {
  const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
  assert.match(inventory, /if \(setActivePetMutation\.isPending\) return/);
  assert.match(inventory, /disabled=\{isPending\}/);
  assert.match(inventory, /UPDATING…/);
  assert.match(inventory, /\{ \.\.\.current, activePetId:/);
  assert.match(inventory, /invalidateQueries\(\{ queryKey: \["\/api\/auth\/me"\] \}\)/);
});
