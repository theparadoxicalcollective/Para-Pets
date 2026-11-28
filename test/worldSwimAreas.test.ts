import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { containsSwimPoint, readSwimAreas, swimAreaBounds, validSwimAreas, swimAreaKey, type WorldSwimArea } from "../shared/worlds/worldSwimAreas";
import { loadWorldSwimScene, registerWorldSwimAreasRoutes } from "../server/routes/worldSwimAreas.routes";
import { gameSettings, shopItems, worldScenePlacements } from "../shared/schema";

const fishId = randomUUID(), buildingId = randomUUID();
const fish = {id: randomUUID(), fishId, x: .5, y: .4};
const area: WorldSwimArea = {id: randomUUID(), buildingId: null, groundLevel: 1, x: .2, y: .3, width: .4, height: .1, fish: [fish]};
test("swim layouts reject invalid geometry, duplicated IDs, and excessive animations", () => {
  assert.ok(validSwimAreas([area]));
  for (const bad of [
    [{...area, x: -.1}], [{...area, height: .001}], [{...area, width: .9}],
    [{...area, groundLevel: 5}], [{...area, fish: [{...fish,y: 1.01}]}],
    [{...area, fish: [fish,fish]}], [area,area], [{...area, buildingId: "bad"}],
    [{...area, fish: Array.from({length: 13}, () => ({...fish,id: randomUUID()}))}],
    Array.from({length: 41}, () => ({...area,id: randomUUID(),fish: []})),
  ]) assert.equal(validSwimAreas(bad),false);
  assert.deepEqual(readSwimAreas("true"),[]);
  assert.deepEqual(readSwimAreas("invalid"),[]);
  assert.deepEqual(readSwimAreas(JSON.stringify([area])),[area]);
});
test("expanded ground preserves swim areas in world units; room shapes never change", () => {
  const b = swimAreaBounds(area, 2);
  assert.ok(Math.abs(b.x - .3) < 1e-9);
  assert.ok(Math.abs(b.width * 2700 - area.width * 1800) < 1e-9);
  assert.ok(containsSwimPoint(b, {x: b.x + b.width / 2, y: b.y + b.height / 2}));
  assert.equal(containsSwimPoint(b, {x: 0, y: 0}),false);
  const room = {...area, buildingId}; assert.deepEqual(swimAreaBounds(room,4), room);
});
test("scene reads retain only known building IDs and referenced fish artwork", async () => {
  const room = {...area,id: randomUUID(),buildingId,fish:[{...fish,id:randomUUID()}]};
  const missing = {...area,id: randomUUID(),buildingId: randomUUID(),fish:[]};
  const deleted = {...area,id: randomUUID(),fish:[{...fish,id:randomUUID(),fishId:randomUUID()}]};
  const catalog = [{id:fishId,name:"Gold Fish",imageUrl:"/fish.png",facingDirection:"left"}];
  const queried: unknown[] = [];
  const db = {select: () => ({from(table: unknown) {
    queried.push(table);
    const rows = table === gameSettings ? [{value: JSON.stringify([area,room,missing,deleted])}] : catalog;
    return {where: () => ({limit: async () => rows, then: (resolve: (r: unknown[]) => unknown) => Promise.resolve(rows).then(resolve)})};
  }})};
  const result = await loadWorldSwimScene(db as any,"swamp",[{id:buildingId,kind:"building"}]);
  assert.deepEqual(result.swimAreas,[area,room,{...deleted,fish:[]}]);
  assert.deepEqual(result.swimFish,catalog);
  assert.deepEqual(queried,[gameSettings,shopItems]);
});
test("only admin endpoints store world-local references, never inventory or arbitrary payloads", async () => {
  let matchedBuildings: unknown[] = [{id:buildingId}], catalog: unknown[] = [{id:fishId,name:"Gold Fish",imageUrl:"/fish.png"}];
  const writes: unknown[] = [];
  const routes = new Map<string,Function>();
  const admin = () => {};
  const app = {get: (path: string, guard: unknown, handler: Function) => {assert.equal(guard,admin);routes.set(path,handler);},
    put: (path: string, guard: unknown, handler: Function) => {assert.equal(guard,admin);routes.set(path,handler);}};
  const db = {
    select: () => ({from: (table: unknown) => ({where: async () => table === worldScenePlacements ? matchedBuildings : catalog})}),
    insert: (table: unknown) => {assert.equal(table,gameSettings);return {values: (row: unknown) => ({onConflictDoUpdate: async () => {writes.push(row);}})};},
  };
  registerWorldSwimAreasRoutes(app as any,{db:db as any,isAdmin:admin});
  const handler = routes.get("/api/admin/world-editor/:worldId/swim-areas")!;
  async function put(areas: unknown, worldId="swamp") {
    let status = 200, body: any;
    const res = {status(n: number){status=n;return this;},json(b: unknown){body=b;return this;}};
    await handler({params:{worldId},body:{areas}},res); return {status,body};
  }
  const room = {...area,buildingId};
  assert.equal((await put([{...room, imageUrl:"not stored",fish:[{...fish,imageUrl:"not stored"}]}])).status,200);
  assert.equal(writes.length,1);
  const written = writes[0] as {key: string; value: string};
  assert.equal(written.key,swimAreaKey("swamp"));
  assert.deepEqual(JSON.parse(written.value),[room]);
  matchedBuildings = []; assert.equal((await put([room])).status,400);
  catalog = []; assert.equal((await put([area])).status,400);
  assert.equal((await put([area],"invalid")).status,404);
  assert.equal((await put([{...area,width:2}])).status,400);
  assert.equal(writes.length,1);
});
