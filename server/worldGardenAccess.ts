import { eq } from "drizzle-orm";
import { gameSettings, users } from "@shared/schema";
import { canPreviewLockedWorld, effectiveWorldLocked, worldLockKey } from "@shared/worlds/worldAccess";
import type { WorldId } from "@shared/worlds/worldRegistry";
import type { db } from "./db";

type GardenTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WorldGardenMode = "preview" | "player";

/** Keep old admin previews private. Player gardening follows the same saved
 * world lock as the player scene, including administrator previews. Mutations take the
 * existing account row lock before touching the shared garden inventory. */
export async function worldGardenAccess(
  tx: GardenTx, userId: string, worldId: WorldId, mode: WorldGardenMode, lock: boolean,
): Promise<{ status: 403 | 404; message: string } | null> {
  const query = tx.select({ id: users.id, isAdmin: users.isAdmin, isModerator: users.isModerator })
    .from(users).where(eq(users.id, userId));
  const [player] = lock ? await query.for("update") : await query;
  if (!player) return { status: 404, message: "Player not found" };
  if (mode === "preview")
    return player.isAdmin ? null : { status: 403, message: "World drafts are admin-only" };
  if (canPreviewLockedWorld(player)) return null;
  const [saved] = await tx.select({ value: gameSettings.value }).from(gameSettings)
    .where(eq(gameSettings.key, worldLockKey(worldId))).limit(1);
  return effectiveWorldLocked(worldId, saved?.value) ? { status: 403, message: "Coming Soon" } : null;
}
