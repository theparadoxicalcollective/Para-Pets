import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PgDialect } from "drizzle-orm/pg-core";
import { resolvePetArtwork } from "../server/petArtwork";
import { raidBossSelectionSchema, saveRaidBoss } from "../server/raidBossAdmin";
import { petTemplateQuery } from "../client/src/lib/petTemplateQuery";
import { QueryClient } from "@tanstack/react-query";

const base = [{ view: "front", imageUrl: "/base.png", width: 300, height: 400 }];
const evolution = [{ view: "back", imageUrl: "/evo.png", width: 500, height: 500 }];

test("raid artwork prefers a complete evolution form and a view it actually contains", () => {
  assert.deepEqual(resolvePetArtwork(base, evolution, "front"), { parts: evolution, facing: "back", form: "evolution" });
  assert.deepEqual(resolvePetArtwork(base, [], "front"), { parts: base, facing: "front", form: "base" });
  assert.equal(resolvePetArtwork(base, [{ ...evolution[0], imageUrl: "" }], "front").form, "base");
});

test("base and evolution requests cannot share cached artwork", async () => {
  assert.deepEqual(petTemplateQuery("pet").queryKey, ["/api/pet-template-parts", "pet"]);
  assert.notDeepEqual(petTemplateQuery("pet").queryKey, petTemplateQuery("pet", "evolution").queryKey);
});

test("evolution fallback cache refreshes after admin edits without expiring ordinary pet artwork", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } } });
  try {
    const options = petTemplateQuery("pet", "evolution");
    assert.equal(options.refetchOnWindowFocus, true);
    assert.equal(options.refetchInterval, 30_000);
    client.setQueryData(options.queryKey, { parts: base });
    let reads = 0;
    const queryFn = async () => { reads++; return { parts: evolution }; };
    assert.deepEqual(await client.fetchQuery({ ...options, queryFn }), { parts: base });
    assert.equal(reads, 0, "fresh requests share cached artwork");
    client.setQueryData(options.queryKey, { parts: base }, { updatedAt: Date.now() - 31_000 });
    assert.deepEqual(await client.fetchQuery({ ...options, queryFn }), { parts: evolution });
    assert.equal(reads, 1);
    const regular = petTemplateQuery("pet");
    client.setQueryData(regular.queryKey, { parts: base }, { updatedAt: Date.now() - 60_000 });
    assert.deepEqual(await client.fetchQuery({ ...regular, queryFn }), { parts: base });
    assert.equal(regular.refetchInterval, undefined);
    assert.equal(reads, 1);
  } finally { client.clear(); }
});

test("adding a pet part invalidates both artwork forms for the edited template", () => {
  const source = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");
  const start = source.indexOf("  const addPartMutation =");
  const end = source.indexOf("  const updatePartMutation =", start);
  const invalidated: string[][] = [];
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const mutation = runInNewContext(js + "\naddPartMutation", {
    useMutation: (options: unknown) => options,
    queryClient: { invalidateQueries: ({ queryKey }: { queryKey: string[] }) => invalidated.push(Array.from(queryKey)) },
    selectedTemplateId: "another-template", setUploadPartType: () => {}, toast: () => {},
  });
  mutation.onSuccess({}, { templateId: "edited-template" });
  assert.deepEqual(invalidated, [["/api/admin/pet-templates", "edited-template"], ["/api/pet-template-parts", "edited-template"]]);
});

test("boss input accepts zero HP and rejects invalid replacements before any write", () => {
  assert.equal(raidBossSelectionSchema.parse({ templateId: "pet", hp: 0, maxHp: 100 }).hp, 0);
  assert.equal(raidBossSelectionSchema.parse({ templateId: null }).templateId, null);
  for (const body of [{}, { templateId: "" }, { templateId: "pet", hp: -1 }, { templateId: "pet", hp: 200, maxHp: 100 }, { templateId: "pet", maxHp: 1.2 }, { templateId: "pet", maxHp: 3e9 }]) {
    assert.equal(raidBossSelectionSchema.safeParse(body).success, false);
  }
});

function database(failReset = false, exists = true) {
  const committed: Array<{ sql: string; params: unknown[] }> = [];
  const dialect = new PgDialect();
  let transactions = 0;
  const db = { transaction: async (operation: (tx: any) => Promise<void>) => {
    transactions++;
    const pending: typeof committed = [];
    await operation({ execute: async (query: any) => {
      const statement = dialect.sqlToQuery(query);
      pending.push(statement);
      if (failReset && statement.sql.includes("UPDATE users")) throw new Error("reset failed");
      return { rows: exists ? [{ id: "pet" }] : [] };
    } });
    committed.push(...pending);
  } };
  return { db: db as unknown as Parameters<typeof saveRaidBoss>[0], committed, transactions: () => transactions };
}

test("boss and HP are replaced in one transaction with one leaderboard reset", async () => {
  const state = database();
  await saveRaidBoss(state.db, { templateId: "replacement", hp: 0, maxHp: 20000 });
  assert.equal(state.transactions(), 1);
  const change = state.committed.find(s => s.sql.includes("'raid_boss_template_id'"))!;
  assert.deepEqual(change.params, ["replacement", "0", "20000"]);
  assert.match(change.sql, /raid_boss_hp/);
  assert.match(change.sql, /raid_boss_max_hp/);
  assert.equal(state.committed.filter(s => s.sql.includes("UPDATE users")).length, 1);
});

test("a failed boss replacement commits no partial selection or HP", async () => {
  for (const state of [database(true), database(false, false)]) {
    await assert.rejects(saveRaidBoss(state.db, { templateId: "replacement", hp: 100, maxHp: 100 }));
    assert.equal(state.committed.length, 0);
  }
  const clear = database();
  await saveRaidBoss(clear.db, { templateId: null });
  assert.deepEqual(clear.committed.find(s => s.sql.includes("'raid_boss_template_id'"))!.params, ["", "0", "0"]);
});

test("real parts endpoint isolates evolution cache and falls back without changing normal pets", async () => {
  const source = readFileSync("server/routes.ts", "utf8");
  const start = source.indexOf('  app.get("/api/pet-template-parts/:templateId"');
  const end = source.indexOf("\n  app.", start + 1);
  const cache = new Map<string, any>();
  let handler: any;
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, {
    app: { get: (_path: string, _auth: any, fn: any) => { handler = fn; } }, isAuthenticated: () => {},
    storage: { getPetTemplateParts: async (_id: string, form = "base") => form === "evolution" ? evolution : base, getPetTemplate: async () => ({ facing: "front" }) },
    getCachedTemplateParts: (key: string) => cache.get(key), setCachedTemplateParts: (key: string, value: any) => cache.set(key, value), resolvePetArtwork,
    console,
  });
  const request = async (form?: string) => {
    let body: any; let status = 200;
    const res = { status(code: number) { status = code; return res; }, json(value: any) { body = value; } };
    await handler({ params: { templateId: "pet" }, query: form ? { form } : {} }, res);
    return { body, status };
  };
  assert.equal((await request("evolution")).body.parts[0].imageUrl, "/evo.png");
  assert.equal((await request()).body.parts[0].imageUrl, "/base.png");
  assert.equal((await request("evolution")).body.facing, "back");
  assert.equal((await request("invalid")).status, 400);
  assert.equal(cache.size, 2);
});
