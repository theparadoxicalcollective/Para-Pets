import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { PgDialect } from "drizzle-orm/pg-core";

// Exercise the real boot routine without a production database. Record every SQL
// statement so legacy seeds cannot silently return after a restart or deploy.
test("repeated startup never recreates deleted enemy identities or Clearing assignments", async () => {
  const result = await build({
    stdin: {
      contents: `export { runEssentialBoot } from "./server/startup/migrations/runEssentialBoot";
        export { statements } from "boot-test:db";`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
    plugins: [{
      name: "record-boot-sql",
      setup(builder) {
        builder.onResolve({ filter: /^(\.\.\/\.\.\/db|boot-test:db)$/ }, () => ({ path: "db", namespace: "boot-test" }));
        builder.onLoad({ filter: /.*/, namespace: "boot-test" }, () => ({
          contents: `export const statements = [];
            export const db = { execute: async (query) => { statements.push(query); return { rows: [] }; } };`,
        }));
      },
    }],
  });
  const module = { exports: {} as { runEssentialBoot: () => Promise<void>; statements: any[] } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const dialect = new PgDialect();
  for (let restart = 0; restart < 2; restart++) {
    module.exports.statements.length = 0;
    await module.exports.runEssentialBoot();
    const statements = module.exports.statements.map(query => dialect.sqlToQuery(query).sql).join("\n");
    assert.match(statements, /CREATE TABLE IF NOT EXISTS clearing_world_enemies/, "Clearing schema setup still runs");
    assert.doesNotMatch(statements, /\bINSERT\s+INTO\s+"?enemies\b/i, "deleted artwork must stay deleted");
    assert.doesNotMatch(statements, /\bINSERT\s+INTO\s+"?clearing_world_enemies\b/i, "removed assignments and intentionally empty rosters must stay empty");
  }
});
