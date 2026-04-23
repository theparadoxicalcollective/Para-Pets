import { defineConfig } from "drizzle-kit";

// The runtime app (server/db.ts) prefers RAILWAY_DATABASE_URL when present,
// falling back to DATABASE_URL. drizzle-kit must target the SAME database the
// app actually reads/writes — otherwise `db:push` updates the wrong server
// and the live Railway tables silently fall out of sync with the schema.
const connectionString =
  process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database URL set. Provide RAILWAY_DATABASE_URL (preferred) or DATABASE_URL.",
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    // Railway terminates TLS at the proxy and presents a self-signed chain,
    // so we enable SSL but skip strict cert verification (matches server/db.ts).
    ssl: process.env.RAILWAY_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  },
});
