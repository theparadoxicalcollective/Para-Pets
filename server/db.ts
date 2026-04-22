import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString =
  process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;

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
