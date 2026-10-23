import type { Express, RequestHandler } from "express";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { petParkDeposits, petParkSceneItems, petParkSettings } from "@shared/schema";
import type { db as database } from "../db";

type ParkKind = "decor" | "sleep_spot";
function isKind(value: unknown): value is ParkKind {
  return value === "decor" || value === "sleep_spot";
}
function validPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
function validSize(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000;
}
function validLayer(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -10000 && (value as number) <= 10000;
}

export function registerPetParkAdminRoutes(
  app: Express,
  { db, isAdmin, processWorldImage }: {
    db: typeof database;
    isAdmin: RequestHandler;
    processWorldImage: (imageData: string, maxSize: number) => Promise<string>;
  },
): void {
  // Draft assets are admin-only; players cannot see unpublished park content.
  app.get("/api/admin/pet-park", isAdmin, async (_req, res) => {
    try {
      const [settings] = await db.select().from(petParkSettings).where(eq(petParkSettings.id, "main"));
      const items = await db.select().from(petParkSceneItems).orderBy(asc(petParkSceneItems.layer));
      return res.json({ settings: settings ?? { enabledForPlayers: false, backgroundUrl: null }, items });
    } catch (error) {
      console.error("[pet-park] admin read failed", error);
      return res.status(500).json({ message: "Unable to load Pet Park" });
    }
  });


  app.put("/api/admin/pet-park/publishing", isAdmin, async (req, res) => {
    const { enabledForPlayers, coinsPerHour, essencePerHour, petXpPerHour } = req.body ?? {};
    const validRate = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10000;
    if (typeof enabledForPlayers !== "boolean" || !validRate(coinsPerHour) ||
        !validRate(essencePerHour) || !validRate(petXpPerHour)) {
      return res.status(400).json({ message: "Invalid park settings or reward rates" });
    }
    if (enabledForPlayers && (coinsPerHour + essencePerHour + petXpPerHour) === 0) {
      return res.status(400).json({ message: "Set at least one reward rate before opening" });
    }
    try {
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(petParkSettings)
          .where(eq(petParkSettings.id, "main")).for("update");
        if (!current) throw new Error("Pet Park settings not initialized");
        const now = new Date();
        const [activeDeposit] = await tx.select({ id: petParkDeposits.id }).from(petParkDeposits)
          .where(isNull(petParkDeposits.withdrawnAt)).limit(1);
        if (activeDeposit && (coinsPerHour !== current.coinsPerHour ||
            essencePerHour !== current.essencePerHour || petXpPerHour !== current.petXpPerHour)) {
          return { conflict: true as const };
        }
        if (current.enabledForPlayers !== enabledForPlayers) {
          if (enabledForPlayers) {
            await tx.update(petParkDeposits).set({
              pausedDurationMs: sql`${petParkDeposits.pausedDurationMs} + COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (${now}::timestamp - ${petParkDeposits.pausedAt})) * 1000)::integer, 0)`,
              pausedAt: null,
            }).where(isNull(petParkDeposits.withdrawnAt));
          } else {
            await tx.update(petParkDeposits).set({ pausedAt: now })
              .where(isNull(petParkDeposits.withdrawnAt));
          }
        }
        const [settings] = await tx.update(petParkSettings).set({
          enabledForPlayers, coinsPerHour, essencePerHour, petXpPerHour, updatedAt: now,
        }).where(eq(petParkSettings.id, "main")).returning();
        return settings;
      });
      if ("conflict" in updated) return res.status(409).json({ message: "Retrieve all deposited pets before changing earning rates" });
      return res.json(updated);
    } catch (error) {
      console.error("[pet-park] publishing failed", error);
      return res.status(500).json({ message: "Unable to update Pet Park availability" });
    }
  });

  app.put("/api/admin/pet-park/background", isAdmin, async (req, res) => {
    const imageData = req.body?.imageData;
    if (typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 12_000_000) {
      return res.status(400).json({ message: "Valid image upload required (max 12 MB)" });
    }
    try {
      const imageUrl = await processWorldImage(imageData, 2560);
      const [settings] = await db.insert(petParkSettings)
        .values({ id: "main", enabledForPlayers: false, backgroundUrl: imageUrl, updatedAt: new Date() })
        .onConflictDoUpdate({ target: petParkSettings.id, set: { backgroundUrl: imageUrl, updatedAt: new Date() } })
        .returning();
      return res.json(settings);
    } catch (error) {
      console.error("[pet-park] background save failed", error);
      return res.status(500).json({ message: "Unable to save background" });
    }
  });

  app.post("/api/admin/pet-park/items", isAdmin, async (req, res) => {
    const { kind, imageData, xPct, yPct, size, flipped, layer } = req.body ?? {};
    if (!isKind(kind) || !validPosition(xPct) || !validPosition(yPct) ||
        !validSize(size) || typeof flipped !== "boolean" || !validLayer(layer) ||
        (imageData != null && (typeof imageData !== "string" || !imageData.startsWith("data:image/") || imageData.length > 8_000_000))) {
      return res.status(400).json({ message: "Invalid Pet Park item" });
    }
    if (kind === "decor" && !imageData) return res.status(400).json({ message: "Decor requires an image" });
    try {
      const imageUrl = imageData ? await processWorldImage(imageData, 1200) : null;
      const [item] = await db.insert(petParkSceneItems)
        .values({ kind, imageUrl, xPct, yPct, size, flipped, layer }).returning();
      return res.status(201).json(item);
    } catch (error) {
      console.error("[pet-park] item create failed", error);
      return res.status(500).json({ message: "Unable to add Pet Park item" });
    }
  });

  app.patch("/api/admin/pet-park/items/:id", isAdmin, async (req, res) => {
    const { xPct, yPct, size, flipped, layer } = req.body ?? {};
    if (!validPosition(xPct) || !validPosition(yPct) || !validSize(size) ||
        typeof flipped !== "boolean" || !validLayer(layer)) {
      return res.status(400).json({ message: "Invalid placement" });
    }
    try {
      const [item] = await db.update(petParkSceneItems)
        .set({ xPct, yPct, size, flipped, layer })
        .where(eq(petParkSceneItems.id, String(req.params.id))).returning();
      return item ? res.json(item) : res.status(404).json({ message: "Item not found" });
    } catch (error) {
      console.error("[pet-park] placement update failed", error);
      return res.status(500).json({ message: "Unable to update placement" });
    }
  });

  app.delete("/api/admin/pet-park/items/:id", isAdmin, async (req, res) => {
    try {
      const [item] = await db.delete(petParkSceneItems)
        .where(eq(petParkSceneItems.id, String(req.params.id))).returning({ id: petParkSceneItems.id });
      return item ? res.json({ deleted: true }) : res.status(404).json({ message: "Item not found" });
    } catch (error) {
      console.error("[pet-park] item delete failed", error);
      return res.status(500).json({ message: "Unable to delete item" });
    }
  });
}
