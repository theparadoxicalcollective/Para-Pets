import type { Express, RequestHandler } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { petParkDeposits, users } from "@shared/schema";

/** Visibility is an owner-only presentation choice, not a reward/deposit mutation.
 * Existing Pet Park settlement and checkpoint logic intentionally stays untouched.
 * Database injection permits route-level transaction and rollback tests.
 */
export function registerPetParkDisplayRoutes(
  app: Express,
  isAuthenticated: RequestHandler,
  database: typeof db = db,
): void {
  app.patch("/api/pet-park/deposits/:id/display", isAuthenticated, async (req, res) => {
    const depositId = req.params.id;
    const { display, xPct, yPct } = req.body ?? {};
    const hasX = xPct !== undefined;
    const hasY = yPct !== undefined;
    if (typeof depositId !== "string" || !depositId || depositId.length > 100 ||
        (display !== "idle" && display !== "park") ||
        (hasX !== hasY) ||
        (display === "idle" && hasX) ||
        (hasX && (typeof xPct !== "number" || !Number.isFinite(xPct) || xPct < 0 || xPct > 1 ||
          typeof yPct !== "number" || !Number.isFinite(yPct) || yPct < 0 || yPct > 1))) {
      return res.status(400).json({ message: "Choose idle or park, with valid optional world coordinates" });
    }
    try {
      const userId = (req.user as { id: string }).id;
      const result = await database.transaction(async tx => {
        // Match existing deposit/claim ordering: lock owner, then deposit.
        const [owner] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.id, userId)).for("update");
        if (!owner) return null;
        const [deposit] = await tx.select().from(petParkDeposits)
          .where(and(eq(petParkDeposits.id, depositId), eq(petParkDeposits.userId, userId),
            isNull(petParkDeposits.withdrawnAt))).for("update");
        if (!deposit) return null;
        const updatedFields = display === "idle"
          ? { showInPark: false, buildingId: null, pose: "idle" as const }
          : { showInPark: true, buildingId: null, pose: "idle" as const,
              ...(hasX ? { parkXPct: xPct as number, parkYPct: yPct as number } : {}) };
        const [updated] = await tx.update(petParkDeposits).set(updatedFields)
          .where(eq(petParkDeposits.id, deposit.id)).returning();
        return updated;
      });
      if (!result) return res.status(404).json({ message: "Active pet slot not found" });
      // Return only this owner's updated deposit. Never expose another player's ID.
      return res.json(result);
    } catch (error) {
      console.error("[pet-park] display change failed", error);
      return res.status(500).json({ message: "Unable to update pet park visibility" });
    }
  });
}
