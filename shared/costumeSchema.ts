import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { ADORNMENT_ANIMATIONS, ADORNMENT_IMAGE_URL_PATTERN } from "./adornmentAnimation";
import { COSTUME_MAX_PLACEMENT_INSTANCES } from "./costumeFeature";

/**
 * One row per pet that has purchased additional costume capacity.
 * Existing pets need no row: the shared costume contract treats that as the
 * default one free slot.
 */
export const petCostumeSlotUnlocks = pgTable("pet_costume_slot_unlocks", {
  petInventoryId: varchar("pet_inventory_id").primaryKey(),
  extraSlots: integer("extra_slots").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

/**
 * A physical costume inventory item equipped to one pet and one slot.
 * Each physical copy in a possibly stacked inventory row can be equipped once.
 * copyIndex reserves a specific copy without splitting inventory stacks.
 */
export const petEquippedCostumes = pgTable("pet_equipped_costumes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  petInventoryId: varchar("pet_inventory_id").notNull(),
  costumeInventoryId: varchar("costume_inventory_id").notNull(),
  copyIndex: integer("copy_index").notNull().default(0),
  slot: integer("slot").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => [
  unique("pet_equipped_costumes_pet_slot_unique").on(table.petInventoryId, table.slot),
  unique("pet_equipped_costumes_inventory_copy_unique").on(table.costumeInventoryId, table.copyIndex),
]);

/**
 * Admin-authored placement for a costume on a pet template. `placements`
 * stores the shared CostumePlacement[] contract as JSON so the definition can
 * support independent front/side placements without adding a row for every
 * view/depth combination.
 */
export const petCostumeDefinitions = pgTable("pet_costume_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopItemId: varchar("shop_item_id").notNull(),
  templateId: varchar("template_id").notNull(),
  placements: jsonb("placements").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  unique("pet_costume_definitions_item_template_unique").on(table.shopItemId, table.templateId),
]);

export const costumePlacementSchema = z.object({
  view: z.enum(["front", "side"]),
  anchorPart: z.string().min(1),
  animation: z.enum(ADORNMENT_ANIMATIONS).optional(),
  animationSpeed: z.number().min(0.25).max(2).optional(),
  mirroredWingImageUrl: z.string().max(100).regex(ADORNMENT_IMAGE_URL_PATTERN).optional(),
  replacesWings: z.boolean().optional(),
  instance: z.number().int().min(1).max(COSTUME_MAX_PLACEMENT_INSTANCES).default(1),
  posX: z.number(),
  posY: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  pivotX: z.number(),
  pivotY: z.number(),
  rotation: z.number().min(-180).max(180).default(0),
  flipX: z.boolean().default(false),
  depth: z.enum(["front", "back"]),
});

export const costumePlacementsSchema = z.array(costumePlacementSchema).superRefine((placements, ctx) => {
  const seen = new Set<string>();
  placements.forEach((placement, index) => {
    const key = `${placement.view}:${placement.instance}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "instance"],
        message: "Each costume copy can only have one placement per view",
      });
    }
    seen.add(key);
  });
});

export const insertPetCostumeDefinitionSchema = createInsertSchema(petCostumeDefinitions).extend({
  placements: costumePlacementsSchema,
});

export type PetCostumeSlotUnlock = typeof petCostumeSlotUnlocks.$inferSelect;
export type PetEquippedCostume = typeof petEquippedCostumes.$inferSelect;
export type PetCostumeDefinition = typeof petCostumeDefinitions.$inferSelect;

