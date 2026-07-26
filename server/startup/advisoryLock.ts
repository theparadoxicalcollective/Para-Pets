import type { Pool } from "pg";

export const STARTUP_ADVISORY_LOCK_KEY = 1_347_191_581;

/** Uses a session advisory lock. try-lock never waits; connection loss releases it. */
export async function withStartupAdvisoryLock(pool: Pool, work: () => Promise<void>): Promise<boolean> {
  const client = await pool.connect();
  let acquired = false;
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [STARTUP_ADVISORY_LOCK_KEY],
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return false;
    await work();
    return true;
  } finally {
    if (acquired) {
      try { await client.query("SELECT pg_advisory_unlock($1)", [STARTUP_ADVISORY_LOCK_KEY]); }
      catch (err) { console.error("Startup advisory lock release error (connection loss releases it automatically):", err); }
    }
    client.release();
  }
}
