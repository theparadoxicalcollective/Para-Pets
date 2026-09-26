import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as database } from "../db";
import { parseCardSpecialEffect } from "../../shared/cardSpecialEffect";

type ProcessCardImage = (imageData: string, maxDimension: number) => Promise<string>;

interface CardRouteDependencies {
  db: typeof database;
  isAdmin: RequestHandler;
  processCardImage: ProcessCardImage;
}

type CardRarity = 1 | 2 | 3 | 4 | 5;

const LAYOUT_FIELDS = [
  "nameX", "nameY", "nameWidth", "nameHeight", "nameFontSize",
  "descriptionX", "descriptionY", "descriptionWidth", "descriptionHeight",
  "descriptionFontSize", "starX", "starY", "starWidth",
] as const;

type LayoutField = (typeof LAYOUT_FIELDS)[number];
type LayoutInput = Record<LayoutField, number> & { nameCurve: number };

function parseRarity(value: unknown): CardRarity | null {
  const rarity = Number(value);
  return Number.isInteger(rarity) && rarity >= 1 && rarity <= 5
    ? rarity as CardRarity
    : null;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function descriptionText(value: unknown, maxLength = 600): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) throw new Error(`Description must be ${maxLength} characters or fewer`);
  return text;
}

function effectColorText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error("Effect color must be a 6-digit hex color");
  }
  return value.trim().toUpperCase();
}


function parseLayout(body: Record<string, unknown>): LayoutInput {
  const parsed = Object.fromEntries(LAYOUT_FIELDS.map((field) => [field, Number(body[field])])) as Record<LayoutField, number>;
  for (const field of LAYOUT_FIELDS) {
    if (!Number.isFinite(parsed[field])) throw new Error(`${field} must be a number`);
  }
  const rawNameCurve = body.nameCurve;
  const nameCurve = rawNameCurve === undefined || rawNameCurve === null || rawNameCurve === ""
    ? 0
    : Number(rawNameCurve);
  if (!Number.isFinite(nameCurve)) throw new Error("nameCurve must be a number");

  const positionFields: LayoutField[] = ["nameX", "nameY", "descriptionX", "descriptionY", "starX", "starY"];
  const sizeFields: LayoutField[] = ["nameWidth", "nameHeight", "descriptionWidth", "descriptionHeight"];
  for (const field of positionFields) {
    if (parsed[field] < 0 || parsed[field] > 100) throw new Error(`${field} must be between 0 and 100`);
  }
  for (const field of sizeFields) {
    if (parsed[field] < 4 || parsed[field] > 100) throw new Error(`${field} must be between 4 and 100`);
  }
  if (parsed.starWidth < 5 || parsed.starWidth > 80) throw new Error("starWidth must be between 5 and 80");
  if (nameCurve < 0 || nameCurve > 8) throw new Error("nameCurve must be between 0 and 8");
  const rarity = parseRarity(body.rarity);
  if (!rarity) throw new Error("Invalid card rarity");
  if (parsed.starX + parsed.starWidth > 100 || parsed.starY + parsed.starWidth / rarity * 2 / 3 > 100) {
    throw new Error("Stars must stay inside the card");
  }
  for (const field of ["nameFontSize", "descriptionFontSize"] as const) {
    if (parsed[field] < 6 || parsed[field] > 32) throw new Error(`${field} must be between 6 and 32`);
  }
  if (parsed.nameX + parsed.nameWidth > 100 || parsed.nameY + parsed.nameHeight > 100) {
    throw new Error("Name box must stay inside the card");
  }
  if (parsed.descriptionX + parsed.descriptionWidth > 100 || parsed.descriptionY + parsed.descriptionHeight > 100) {
    throw new Error("Description box must stay inside the card");
  }
  return { ...parsed, nameCurve };
}

export function serializeCard(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    secondDescription: row.second_description ?? "",
    artworkUrl: row.artwork_url,
    effectColor: row.effect_color ?? null,
    specialEffect: row.special_effect ?? null,
    rarity: Number(row.rarity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeLayout(row: any) {
  return {
    rarity: Number(row.rarity),
    nameX: Number(row.name_x),
    nameY: Number(row.name_y),
    nameWidth: Number(row.name_width),
    nameHeight: Number(row.name_height),
    nameFontSize: Number(row.name_font_size),
    nameCurve: Number(row.name_curve ?? 0),
    descriptionX: Number(row.description_x),
    descriptionY: Number(row.description_y),
    descriptionWidth: Number(row.description_width),
    descriptionHeight: Number(row.description_height),
    descriptionFontSize: Number(row.description_font_size),
    starX: Number(row.star_x),
    starY: Number(row.star_y),
    starWidth: Number(row.star_width),
    updatedAt: row.updated_at,
  };
}

export function registerCardAdminRoutes(
  app: Express,
  { db, isAdmin, processCardImage }: CardRouteDependencies,
): void {
  app.get("/api/admin/cards", isAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT id, name, description, second_description, artwork_url, effect_color, special_effect, rarity, created_at, updated_at
        FROM card_definitions
        ORDER BY rarity DESC, created_at DESC
      `);
      return res.json(result.rows.map(serializeCard));
    } catch (error: any) {
      console.error("[cards] list failed:", error);
      return res.status(500).json({ message: "Failed to load cards" });
    }
  });

  app.post("/api/admin/cards", isAdmin, async (req, res) => {
    try {
      const name = requiredText(req.body?.name, "Name", 80);
      const description = descriptionText(req.body?.description);
      const secondDescription = req.body?.secondDescription === undefined ? null : descriptionText(req.body.secondDescription, 10000);
      const rarity = parseRarity(req.body?.rarity);
      if (!rarity) return res.status(400).json({ message: "Rarity must be between 1 and 5" });
      const effectColor = effectColorText(req.body?.effectColor);
      const specialEffect = parseCardSpecialEffect(req.body?.specialEffect);
      if (typeof req.body?.artworkData !== "string" || !req.body.artworkData) {
        return res.status(400).json({ message: "Card artwork is required" });
      }
      const artworkUrl = await processCardImage(req.body.artworkData, 1600);
      const result = await db.execute(sql`
        INSERT INTO card_definitions (name, description, second_description, artwork_url, effect_color, special_effect, rarity)
        VALUES (${name}, ${description}, ${secondDescription ?? ""}, ${artworkUrl}, ${effectColor}, ${specialEffect}, ${rarity})
        RETURNING id, name, description, second_description, artwork_url, effect_color, special_effect, rarity, created_at, updated_at
      `);
      return res.status(201).json(serializeCard(result.rows[0]));
    } catch (error: any) {
      const message = error?.message || "Failed to create card";
      const status = /required|characters|fewer|effect color|special effect|hex color/i.test(message) ? 400 : 500;
      if (status === 500) console.error("[cards] create failed:", error);
      return res.status(status).json({ message });
    }
  });

  app.patch("/api/admin/cards/:id", isAdmin, async (req, res) => {
    try {
      const name = requiredText(req.body?.name, "Name", 80);
      const description = descriptionText(req.body?.description);
      const secondDescription = req.body?.secondDescription === undefined ? null : descriptionText(req.body.secondDescription, 10000);
      const rarity = parseRarity(req.body?.rarity);
      if (!rarity) return res.status(400).json({ message: "Rarity must be between 1 and 5" });
      const hasEffectColor = Object.prototype.hasOwnProperty.call(req.body ?? {}, "effectColor");
      const effectColor = hasEffectColor ? effectColorText(req.body?.effectColor) : null;
      const hasSpecialEffect = Object.prototype.hasOwnProperty.call(req.body ?? {}, "specialEffect");
      const specialEffect = hasSpecialEffect ? parseCardSpecialEffect(req.body?.specialEffect) : null;
      const artworkUrl = typeof req.body?.artworkData === "string" && req.body.artworkData
        ? await processCardImage(req.body.artworkData, 1600)
        : null;
      const result = await db.execute(sql`
        UPDATE card_definitions
        SET name = ${name}, description = ${description}, rarity = ${rarity},
            second_description = COALESCE(${secondDescription}, second_description),
            effect_color = CASE WHEN ${hasEffectColor} THEN ${effectColor} ELSE effect_color END,
            special_effect = CASE WHEN ${hasSpecialEffect} THEN ${specialEffect} ELSE special_effect END,
            artwork_url = COALESCE(${artworkUrl}, artwork_url), updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING id, name, description, second_description, artwork_url, effect_color, special_effect, rarity, created_at, updated_at
      `);
      if (!result.rows[0]) return res.status(404).json({ message: "Card not found" });
      return res.json(serializeCard(result.rows[0]));
    } catch (error: any) {
      const message = error?.message || "Failed to update card";
      const status = /required|characters|fewer|effect color|special effect|hex color/i.test(message) ? 400 : 500;
      if (status === 500) console.error("[cards] update failed:", error);
      return res.status(status).json({ message });
    }
  });

  app.delete("/api/admin/cards/:id", isAdmin, async (req, res) => {
    try {
      const result = await db.execute(sql`
        DELETE FROM card_definitions WHERE id = ${req.params.id} RETURNING id
      `);
      if (!result.rows[0]) return res.status(404).json({ message: "Card not found" });
      return res.json({ ok: true });
    } catch (error) {
      console.error("[cards] delete failed:", error);
      return res.status(500).json({ message: "Failed to delete card" });
    }
  });

  app.get("/api/admin/card-border-layouts", isAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT rarity, name_x, name_y, name_width, name_height, name_font_size, name_curve,
               description_x, description_y, description_width, description_height,
               description_font_size, star_x, star_y, star_width, updated_at
        FROM card_border_layouts ORDER BY rarity
      `);
      return res.json(result.rows.map(serializeLayout));
    } catch (error) {
      console.error("[cards] layout list failed:", error);
      return res.status(500).json({ message: "Failed to load card border layouts" });
    }
  });

  app.put("/api/admin/card-border-layouts/:rarity", isAdmin, async (req, res) => {
    try {
      const rarity = parseRarity(req.params.rarity);
      if (!rarity) return res.status(400).json({ message: "Rarity must be between 1 and 5" });
      const layout = parseLayout({ ...req.body, rarity });
      const result = await db.execute(sql`
        INSERT INTO card_border_layouts (
          rarity, name_x, name_y, name_width, name_height, name_font_size, name_curve,
          description_x, description_y, description_width, description_height,
          description_font_size, star_x, star_y, star_width, updated_at
        ) VALUES (
          ${rarity}, ${layout.nameX}, ${layout.nameY}, ${layout.nameWidth},
          ${layout.nameHeight}, ${layout.nameFontSize}, ${layout.nameCurve}, ${layout.descriptionX},
          ${layout.descriptionY}, ${layout.descriptionWidth}, ${layout.descriptionHeight},
          ${layout.descriptionFontSize}, ${layout.starX}, ${layout.starY}, ${layout.starWidth}, now()
        )
        ON CONFLICT (rarity) DO UPDATE SET
          name_x = EXCLUDED.name_x, name_y = EXCLUDED.name_y,
          name_width = EXCLUDED.name_width, name_height = EXCLUDED.name_height,
          name_font_size = EXCLUDED.name_font_size, name_curve = EXCLUDED.name_curve,
          description_x = EXCLUDED.description_x, description_y = EXCLUDED.description_y,
          description_width = EXCLUDED.description_width,
          description_height = EXCLUDED.description_height,
          description_font_size = EXCLUDED.description_font_size,
          star_x = EXCLUDED.star_x, star_y = EXCLUDED.star_y, star_width = EXCLUDED.star_width, updated_at = now()
        RETURNING rarity, name_x, name_y, name_width, name_height, name_font_size, name_curve,
                  description_x, description_y, description_width, description_height,
                  description_font_size, star_x, star_y, star_width, updated_at
      `);
      return res.json(serializeLayout(result.rows[0]));
    } catch (error: any) {
      const message = error?.message || "Failed to save card border layout";
      const status = /must|inside/i.test(message) ? 400 : 500;
      if (status === 500) console.error("[cards] layout save failed:", error);
      return res.status(status).json({ message });
    }
  });
}

export const cardAdminValidation = { parseRarity, parseLayout, descriptionText, effectColorText };
