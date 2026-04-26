// Custom logical dump for Railway prod (Postgres 18) — bypasses pg_dump
// version mismatch by using the `pg` driver directly.
//
// Output: a single self-restoring SQL file containing:
//   1) Schema reconstruction notes (the project uses Drizzle — restore by
//      running `npm run db:push --force` against an empty DB to recreate
//      tables from `shared/schema.ts`, THEN apply this file's data).
//   2) Per-table COPY ... FROM stdin blocks with CSV data inline.
//
// Restoring: `psql "$TARGET_DATABASE_URL" -f <this_file>` after schema sync.

import { Pool } from "pg";
import { createWriteStream, mkdirSync } from "fs";
import { dirname } from "path";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";
import { pipeline } from "stream/promises";

const RAILWAY_URL = process.env.RAILWAY_DATABASE_URL;
if (!RAILWAY_URL) {
  console.error("RAILWAY_DATABASE_URL not set");
  process.exit(1);
}

const OUT_PATH = process.argv[2] || `backup_staging/db_dumps/parapets_railway_prod_${stamp()}.sql`;

function stamp(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
}

mkdirSync(dirname(OUT_PATH), { recursive: true });

const pool = new Pool({
  connectionString: RAILWAY_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

async function main() {
  const out = createWriteStream(OUT_PATH, { encoding: "utf8" });
  const writeLn = (s: string) => out.write(s + "\n");

  // Header
  writeLn("-- Para Pets — Railway production logical dump");
  writeLn(`-- Generated: ${new Date().toISOString()}`);
  writeLn(`-- Source: ${maskUrl(RAILWAY_URL!)}`);
  writeLn(`-- Postgres server version: ${(await pool.query("SHOW server_version")).rows[0].server_version}`);
  writeLn("--");
  writeLn("-- HOW TO RESTORE:");
  writeLn("--   1. Provision an empty Postgres database.");
  writeLn("--   2. Set RAILWAY_DATABASE_URL (or DATABASE_URL) to it.");
  writeLn("--   3. Run `npm run db:push --force` in the Para Pets repo to");
  writeLn("--      recreate the schema from shared/schema.ts.");
  writeLn("--   4. Run `psql \"$DATABASE_URL\" -f <this file>` to load data.");
  writeLn("--");
  writeLn("BEGIN;");
  writeLn("SET session_replication_role = 'replica'; -- skip FK checks during load");
  writeLn("");

  // List user tables in dependency-friendly order (alphabetical is fine when
  // FK checks are disabled).
  const tablesRes = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`[dump] ${tables.length} tables found`);

  let totalRows = 0;
  for (const t of tables) {
    const countRes = await pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM "${t}"`);
    const rowCount = Number(countRes.rows[0].c);
    totalRows += rowCount;
    process.stdout.write(`  ${t.padEnd(40)} ${String(rowCount).padStart(8)} rows ... `);

    // Always emit a TRUNCATE so re-running the restore is idempotent.
    writeLn(`-- ${t}: ${rowCount} rows`);
    writeLn(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE;`);

    if (rowCount === 0) {
      writeLn("");
      console.log("skip (empty)");
      continue;
    }

    // Get column names (ordered) so the COPY is stable across schema diffs.
    const colsRes = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t]);
    const cols = colsRes.rows.map(r => `"${r.column_name}"`).join(", ");

    writeLn(`COPY "${t}" (${cols}) FROM stdin WITH (FORMAT csv, HEADER false);`);

    const client = await pool.connect();
    try {
      const stream = client.query(copyTo(
        `COPY "${t}" (${cols}) TO STDOUT WITH (FORMAT csv, HEADER false)`
      ));
      await pipeline(stream, async function* (src) {
        for await (const chunk of src) {
          yield chunk;
        }
      }, out, { end: false });
    } finally {
      client.release();
    }
    writeLn("\\.");
    writeLn("");
    console.log("ok");
  }

  // Reset every sequence so newly inserted rows don't collide with restored IDs.
  writeLn("-- Resync sequences to MAX(id) + 1 so future inserts don't collide");
  const seqRes = await pool.query<{ table_name: string; column_name: string; seq: string }>(`
    SELECT
      t.table_name,
      c.column_name,
      pg_get_serial_sequence(format('%I.%I', t.table_schema, t.table_name), c.column_name) AS seq
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND pg_get_serial_sequence(format('%I.%I', t.table_schema, t.table_name), c.column_name) IS NOT NULL
  `);
  for (const r of seqRes.rows) {
    if (!r.seq) continue;
    writeLn(`SELECT setval('${r.seq}', COALESCE((SELECT MAX("${r.column_name}") FROM "${r.table_name}"), 1), true);`);
  }
  writeLn("");
  writeLn("SET session_replication_role = 'origin';");
  writeLn("COMMIT;");
  writeLn(`-- Dump complete: ${tables.length} tables, ${totalRows} rows`);

  await new Promise<void>((res) => out.end(res));
  console.log(`\n[dump] wrote ${OUT_PATH} — ${tables.length} tables, ${totalRows} rows total`);
  await pool.end();
}

function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//<redacted>@${url.host}${url.pathname}`;
  } catch { return "<unparseable>"; }
}

main().catch(e => { console.error("[dump] FAILED", e); process.exit(1); });
