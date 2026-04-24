import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString =
  process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;

// Loud startup log so we can always tell from the workflow output which
// Postgres the app is talking to. Railway is the canonical game DB;
// Replit's DATABASE_URL is only a fallback for offline coding.
const usingRailway = !!process.env.RAILWAY_DATABASE_URL;
const dbHost = (() => {
  try { return connectionString ? new URL(connectionString).host : "(no DATABASE_URL set)"; }
  catch { return "(unparseable)"; }
})();
console.log(
  `[db] Using ${usingRailway ? "RAILWAY" : "REPLIT (fallback)"} Postgres → ${dbHost}`
);

// Railway / most managed Postgres providers terminate TLS at the proxy and
// present a self-signed chain, so we enable SSL but skip strict verification.
// Local dev (Replit's Neon-backed DB or a docker postgres) usually exposes a
// plain connection — detect that and skip SSL there.
function shouldUseSsl(): boolean {
  if (!connectionString) return false;
  if (process.env.PGSSLMODE === "disable") return false;
  if (connectionString.includes("sslmode=disable")) return false;
  // Railway always sets RAILWAY_ENVIRONMENT; production should use SSL.
  if (process.env.RAILWAY_ENVIRONMENT) return true;
  if (process.env.NODE_ENV === "production") return true;
  if (connectionString.includes("sslmode=require")) return true;
  return false;
}

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Database pool error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });
