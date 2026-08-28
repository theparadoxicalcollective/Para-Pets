import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Give the Forest Squirrel Fox its own opt-in idle animation profile.
 *
 * This is intentionally name-scoped instead of changing the global pet
 * animation defaults. Existing custom profiles are preserved, while ordinary
 * ground/flying defaults are upgraded to the Squirrel Fox profile.
 */
export async function tagSquirrelFoxAnimationProfile(): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE pet_templates
      SET idle_style = 'squirrel_fox'
      WHERE lower(trim(name)) IN ('forest squirrel fox', 'squirrel fox')
        AND (
          idle_style IS NULL
          OR idle_style IN ('standard_ground', 'standard_flying')
        )
    `);
  } catch (err) {
    console.error("Forest Squirrel Fox animation profile backfill failed (non-fatal):", err);
  }
}
