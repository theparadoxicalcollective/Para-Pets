import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";

export const PET_HOME_TUTORIAL_VERSION = 1;

export interface PetHomeTutorialRouteDependencies {
  db: Pick<typeof import("../db").db, "execute">;
  isAuthenticated: RequestHandler;
}

export function registerPetHomeTutorialRoutes(
  app: Express,
  { db, isAuthenticated }: PetHomeTutorialRouteDependencies,
): void {
  app.get("/api/pet-home/tutorial", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await db.execute(sql`
        SELECT tutorial_version
        FROM pet_home_tutorial_progress
        WHERE user_id = ${user.id}
        LIMIT 1
      `);
      const tutorialVersion = Number((result.rows[0] as any)?.tutorial_version ?? 0);
      return res.json({
        completed: tutorialVersion >= PET_HOME_TUTORIAL_VERSION,
        tutorialVersion,
        currentVersion: PET_HOME_TUTORIAL_VERSION,
      });
    } catch (error) {
      console.error("[pet-home-tutorial] status error:", error);
      return res.status(500).json({ message: "Failed to load Pet Home tutorial status" });
    }
  });

  app.post("/api/pet-home/tutorial/complete", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await db.execute(sql`
        INSERT INTO pet_home_tutorial_progress (user_id, tutorial_version, completed_at)
        VALUES (${user.id}, ${PET_HOME_TUTORIAL_VERSION}, now())
        ON CONFLICT (user_id) DO UPDATE
        SET tutorial_version = GREATEST(
              pet_home_tutorial_progress.tutorial_version,
              EXCLUDED.tutorial_version
            ),
            completed_at = CASE
              WHEN pet_home_tutorial_progress.tutorial_version < EXCLUDED.tutorial_version
              THEN now()
              ELSE pet_home_tutorial_progress.completed_at
            END
      `);
      return res.json({
        completed: true,
        tutorialVersion: PET_HOME_TUTORIAL_VERSION,
        currentVersion: PET_HOME_TUTORIAL_VERSION,
      });
    } catch (error) {
      console.error("[pet-home-tutorial] completion error:", error);
      return res.status(500).json({ message: "Failed to save Pet Home tutorial progress" });
    }
  });
}
