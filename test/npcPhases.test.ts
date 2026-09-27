import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NPC_PHASES, isNpcPhase, npcPhaseLabel } from "../shared/npcPhases";
import { registerNpcPhaseRoutes } from "../server/routes/npcPhase.routes";

type Handler = (req: any, res: any) => Promise<any>;

function setup() {
  const handlers = new Map<string, Handler>();
  const app = Object.fromEntries(["get", "put", "delete"].map(method => [method, (path: string, _auth: unknown, handler: Handler) => handlers.set(`${method} ${path}`, handler)]));
  const saved: Array<{ npcId: string; phase: string; imageUrl: string }> = [];
  let processed = 0;
  const db = {
    select: () => ({ from: () => ({ where: async () => [{ id: "npc-1", phase: "happy", imageUrl: "/api/media/existing" }] }) }),
    insert: () => ({ values: (row: any) => ({ onConflictDoUpdate: () => ({ returning: async () => { saved.push(row); return [row]; } }) }) }),
    delete: () => ({ where: async () => undefined }),
  };
  registerNpcPhaseRoutes(app as any, { db: db as any, isAdmin: (() => {}) as any, processImage: async () => { processed++; return "/api/media/new"; } });
  const invoke = async (method: string, path: string, params: any, body: any) => {
    let status = 200;
    let response: any;
    await handlers.get(`${method} ${path}`)!({ params, body }, {
      status(code: number) { status = code; return this; },
      json(value: any) { response = value; return this; },
    });
    return { status, response };
  };
  return { invoke, saved, get processed() { return processed; } };
}

test("NPC phase vocabulary is fixed and labels are readable", () => {
  assert.deepEqual(NPC_PHASES, ["sad", "happy", "talking_casual", "talking_eyes_closed", "angry", "shocked", "flirty", "scared"]);
  assert.equal(npcPhaseLabel("talking_eyes_closed"), "Talking Eyes Closed");
  assert.equal(isNpcPhase("talking_eyes_closed"), true);
  assert.equal(isNpcPhase("other"), false);
});

test("invalid phase and oversized images are rejected before processing or saving", async () => {
  const api = setup();
  const path = "/api/admin/npcs/:npcId/phases/:phase";
  assert.equal((await api.invoke("put", path, { npcId: "npc-1", phase: "other" }, { imageData: "data:image/png;base64,AAAA" })).status, 400);
  assert.equal((await api.invoke("put", path, { npcId: "npc-1", phase: "happy" }, { imageData: "data:image/png;base64," + "A".repeat(12 * 1024 * 1024) })).status, 400);
  assert.equal(api.processed, 0);
  assert.equal(api.saved.length, 0);
});

test("a valid image is processed and stored under its NPC and phase", async () => {
  const api = setup();
  const result = await api.invoke("put", "/api/admin/npcs/:npcId/phases/:phase", { npcId: "npc-1", phase: "happy" }, { imageData: "data:image/webp;base64,AAAA" });
  assert.equal(result.status, 200);
  assert.deepEqual(api.saved, [{ npcId: "npc-1", phase: "happy", imageUrl: "/api/media/new" }]);
  assert.equal(api.processed, 1);
});

test("phase schema is created at boot with NPC cascade and unique slot", () => {
  const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
  assert.match(boot, /CREATE TABLE IF NOT EXISTS npc_phases/);
  assert.match(boot, /REFERENCES shop_items\(id\) ON DELETE CASCADE/);
  assert.match(boot, /UNIQUE \(npc_id, phase\)/);
});
