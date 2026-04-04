import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Database pool error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });
