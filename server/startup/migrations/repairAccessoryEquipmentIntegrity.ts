import { db } from "../../db";
import { sql } from "drizzle-orm";

/**
 * Repairs the legacy accessory model before routes are registered.
 *
 * Accessory rules:
 * - one physical accessory copy = one user_inventory row with quantity = 1
 * - one physical accessory copy may be equipped to at most one pet
 * - one pet slot may contain at most one accessory
 * - equipped rows must point at inventory owned by the same player
 *
 * Older versions did not enforce those rules in the database. In particular,
 * the same accessory_inventory_id could be attached to multiple pets. The
 * Closet hides any inventory id that appears in pet_equipped_accessories, so
 * removing one legacy duplicate made the item briefly appear and then vanish
 * again when the global equipped-id query found the second row.
 */
export async function repairAccessoryEquipmentIntegrity(): Promise<void> {
  await db.transaction(async (tx) => {
    // Multiple web instances can boot at once. Serialize this repair so two
    // servers cannot try to remap the same legacy equipment row concurrently.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext('para-pets-accessory-equipment-integrity-v2')::int)
    `);

    // Keep the physical-copy rule at the DB boundary. The application still
    // has old generic inventory paths that may try to increase quantity; this
    // trigger converts any such increment into separate rows. Normalize type
    // text because older/admin-authored rows may contain casing/whitespace.
    await tx.execute(sql`
      CREATE OR REPLACE FUNCTION enforce_individual_accessory_inventory_rows()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        normalized_item_type TEXT;
        extra_count INTEGER := 0;
      BEGIN
        SELECT lower(btrim(type)) INTO normalized_item_type
        FROM shop_items
        WHERE id = NEW.shop_item_id;

        IF normalized_item_type IS DISTINCT FROM 'accessory' THEN
          RETURN NEW;
        END IF;

        IF TG_OP = 'INSERT' THEN
          -- Even marketplace escrow represents exactly one physical copy.
          -- Any extra legacy quantity becomes separate, unlisted ownership rows.
          extra_count := GREATEST(COALESCE(NEW.quantity, 1) - 1, 0);
          NEW.quantity := 1;
        ELSIF COALESCE(OLD.is_listed, false)
          AND NOT COALESCE(NEW.is_listed, false)
          AND COALESCE(NEW.quantity, 1) > 1 THEN
          extra_count := COALESCE(NEW.quantity, 1) - 1;
          NEW.quantity := 1;
        ELSIF COALESCE(NEW.quantity, 1) > COALESCE(OLD.quantity, 1) THEN
          extra_count := COALESCE(NEW.quantity, 1) - COALESCE(OLD.quantity, 1);
          NEW.quantity := COALESCE(OLD.quantity, 1);
        END IF;

        IF extra_count > 0 THEN
          INSERT INTO user_inventory (user_id, shop_item_id, acquired_at, is_listed, quantity)
          SELECT NEW.user_id, NEW.shop_item_id, COALESCE(NEW.acquired_at, now()), false, 1
          FROM generate_series(1, extra_count);
        END IF;

        RETURN NEW;
      END
      $function$;

      DROP TRIGGER IF EXISTS user_inventory_accessory_copy_insert_trg ON user_inventory;
      CREATE TRIGGER user_inventory_accessory_copy_insert_trg
      BEFORE INSERT ON user_inventory
      FOR EACH ROW EXECUTE FUNCTION enforce_individual_accessory_inventory_rows();

      DROP TRIGGER IF EXISTS user_inventory_accessory_copy_update_trg ON user_inventory;
      CREATE TRIGGER user_inventory_accessory_copy_update_trg
      BEFORE UPDATE OF quantity, is_listed, user_id ON user_inventory
      FOR EACH ROW EXECUTE FUNCTION enforce_individual_accessory_inventory_rows();
    `);

    // Normalize every legacy stack, including a listed row. A market listing
    // may escrow one copy only; any additional legacy quantity is returned to
    // the same owner as separate unlisted physical copies.
    await tx.execute(sql`
      WITH stacked AS (
        SELECT ui.id, ui.user_id, ui.shop_item_id, ui.acquired_at, ui.quantity
        FROM user_inventory ui
        INNER JOIN shop_items si ON si.id = ui.shop_item_id
        WHERE lower(btrim(si.type)) = 'accessory'
          AND COALESCE(ui.quantity, 1) > 1
      ), inserted_copies AS (
        INSERT INTO user_inventory (user_id, shop_item_id, acquired_at, is_listed, quantity)
        SELECT s.user_id, s.shop_item_id, s.acquired_at, false, 1
        FROM stacked s
        CROSS JOIN LATERAL generate_series(2, s.quantity)
        RETURNING id
      )
      UPDATE user_inventory ui
      SET quantity = 1
      FROM stacked s
      WHERE ui.id = s.id
    `);

    // Remove equipment rows that cannot represent valid ownership. Where the
    // accessory still exists, also remove its stat contribution from the pet
    // so deleting a bad relationship does not leave a phantom permanent boost.
    await tx.execute(sql`
      CREATE TEMP TABLE accessory_equipment_rows_to_remove (
        id VARCHAR PRIMARY KEY
      ) ON COMMIT DROP;

      INSERT INTO accessory_equipment_rows_to_remove (id)
      SELECT pea.id
      FROM pet_equipped_accessories pea
      LEFT JOIN user_inventory pet ON pet.id = pea.pet_inventory_id
      LEFT JOIN shop_items pet_item ON pet_item.id = pet.shop_item_id
      LEFT JOIN user_inventory acc ON acc.id = pea.accessory_inventory_id
      LEFT JOIN shop_items acc_item ON acc_item.id = acc.shop_item_id
      WHERE pet.id IS NULL
         OR acc.id IS NULL
         OR pet.user_id IS DISTINCT FROM acc.user_id
         OR lower(btrim(COALESCE(pet_item.type, ''))) <> 'pet'
         OR lower(btrim(COALESCE(acc_item.type, ''))) <> 'accessory'
         OR COALESCE(pet.is_listed, false)
         OR COALESCE(acc.is_listed, false)
      ON CONFLICT DO NOTHING;

      WITH losses AS (
        SELECT pea.pet_inventory_id,
               SUM(COALESCE(si.atk_boost, 0))::int AS atk_loss,
               SUM(COALESCE(si.def_boost, 0))::int AS def_loss,
               SUM(COALESCE(si.health_boost, 0))::int AS health_loss
        FROM accessory_equipment_rows_to_remove bad
        JOIN pet_equipped_accessories pea ON pea.id = bad.id
        JOIN user_inventory acc ON acc.id = pea.accessory_inventory_id
        JOIN shop_items si ON si.id = acc.shop_item_id
        WHERE lower(btrim(si.type)) = 'accessory'
        GROUP BY pea.pet_inventory_id
      )
      UPDATE user_inventory pet
      SET pet_atk = GREATEST(0, pet.pet_atk - losses.atk_loss),
          pet_def = GREATEST(0, pet.pet_def - losses.def_loss),
          pet_health = GREATEST(0, pet.pet_health - losses.health_loss)
      FROM losses
      WHERE pet.id = losses.pet_inventory_id;

      DELETE FROM pet_equipped_accessories pea
      USING accessory_equipment_rows_to_remove bad
      WHERE pea.id = bad.id;
    `);

    // Legacy versions allowed the same physical inventory id on multiple pets.
    // The stack repair above creates individual rows first, so remap duplicate
    // equipment rows onto an unused physical copy of the same shop item. This
    // preserves legitimate multi-copy equipment instead of arbitrarily
    // unequipping pets. If there truly are more equipped rows than owned copies,
    // remove only the impossible extras and roll back their stat contribution.
    await tx.execute(sql`
      DO $repair_accessory_duplicates$
      DECLARE
        dup RECORD;
        spare_inventory_id VARCHAR;
      BEGIN
        FOR dup IN
          WITH ranked AS (
            SELECT pea.id,
                   pea.pet_inventory_id,
                   pea.accessory_inventory_id,
                   acc.user_id,
                   acc.shop_item_id,
                   COALESCE(si.atk_boost, 0) AS atk_boost,
                   COALESCE(si.def_boost, 0) AS def_boost,
                   COALESCE(si.health_boost, 0) AS health_boost,
                   ROW_NUMBER() OVER (
                     PARTITION BY pea.accessory_inventory_id
                     ORDER BY pea.created_at ASC, pea.id ASC
                   ) AS copy_rank
            FROM pet_equipped_accessories pea
            JOIN user_inventory acc ON acc.id = pea.accessory_inventory_id
            JOIN shop_items si ON si.id = acc.shop_item_id
            WHERE lower(btrim(si.type)) = 'accessory'
          )
          SELECT * FROM ranked WHERE copy_rank > 1
          ORDER BY accessory_inventory_id, copy_rank
        LOOP
          spare_inventory_id := NULL;

          SELECT ui.id INTO spare_inventory_id
          FROM user_inventory ui
          WHERE ui.user_id = dup.user_id
            AND ui.shop_item_id = dup.shop_item_id
            AND ui.is_listed = false
            AND COALESCE(ui.quantity, 1) = 1
            AND NOT EXISTS (
              SELECT 1
              FROM pet_equipped_accessories in_use
              WHERE in_use.accessory_inventory_id = ui.id
            )
          ORDER BY ui.acquired_at ASC, ui.id ASC
          LIMIT 1
          FOR UPDATE;

          IF spare_inventory_id IS NOT NULL THEN
            UPDATE pet_equipped_accessories
            SET accessory_inventory_id = spare_inventory_id
            WHERE id = dup.id;
          ELSE
            UPDATE user_inventory
            SET pet_atk = GREATEST(0, pet_atk - dup.atk_boost),
                pet_def = GREATEST(0, pet_def - dup.def_boost),
                pet_health = GREATEST(0, pet_health - dup.health_boost)
            WHERE id = dup.pet_inventory_id;

            DELETE FROM pet_equipped_accessories WHERE id = dup.id;
          END IF;
        END LOOP;
      END
      $repair_accessory_duplicates$;
    `);

    // A second old race could put multiple different accessories into the same
    // pet slot. Move extras into another unlocked slot when possible; otherwise
    // remove only the impossible extra and its stat contribution.
    await tx.execute(sql`
      DO $repair_accessory_slots$
      DECLARE
        dup RECORD;
        replacement_slot INTEGER;
        max_slots INTEGER;
      BEGIN
        FOR dup IN
          WITH ranked AS (
            SELECT pea.id,
                   pea.pet_inventory_id,
                   pea.slot,
                   COALESCE(si.atk_boost, 0) AS atk_boost,
                   COALESCE(si.def_boost, 0) AS def_boost,
                   COALESCE(si.health_boost, 0) AS health_boost,
                   ROW_NUMBER() OVER (
                     PARTITION BY pea.pet_inventory_id, pea.slot
                     ORDER BY pea.created_at ASC, pea.id ASC
                   ) AS slot_rank
            FROM pet_equipped_accessories pea
            JOIN user_inventory acc ON acc.id = pea.accessory_inventory_id
            JOIN shop_items si ON si.id = acc.shop_item_id
          )
          SELECT * FROM ranked WHERE slot_rank > 1
          ORDER BY pet_inventory_id, slot, slot_rank
        LOOP
          replacement_slot := NULL;
          SELECT 3 + COALESCE(accessory_extra_slots, 0)
          INTO max_slots
          FROM user_inventory
          WHERE id = dup.pet_inventory_id;

          SELECT candidate INTO replacement_slot
          FROM generate_series(
            0,
            GREATEST(COALESCE(max_slots, 3) - 1, 0)
          ) AS slots(candidate)
          WHERE NOT EXISTS (
            SELECT 1
            FROM pet_equipped_accessories occupied
            WHERE occupied.pet_inventory_id = dup.pet_inventory_id
              AND occupied.slot = candidate
          )
          ORDER BY candidate
          LIMIT 1;

          IF replacement_slot IS NOT NULL THEN
            UPDATE pet_equipped_accessories
            SET slot = replacement_slot
            WHERE id = dup.id;
          ELSE
            UPDATE user_inventory
            SET pet_atk = GREATEST(0, pet_atk - dup.atk_boost),
                pet_def = GREATEST(0, pet_def - dup.def_boost),
                pet_health = GREATEST(0, pet_health - dup.health_boost)
            WHERE id = dup.pet_inventory_id;

            DELETE FROM pet_equipped_accessories WHERE id = dup.id;
          END IF;
        END LOOP;
      END
      $repair_accessory_slots$;
    `);

    // Make the rules structural so future route/cache changes cannot recreate
    // the same corruption. These are the missing DB constraints that the old
    // accessory implementation never had.
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pet_equipped_accessories_inventory_uidx
        ON pet_equipped_accessories(accessory_inventory_id);

      CREATE UNIQUE INDEX IF NOT EXISTS pet_equipped_accessories_pet_slot_uidx
        ON pet_equipped_accessories(pet_inventory_id, slot);

      DO $accessory_fk_constraints$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'pet_equipped_accessories_pet_inventory_fk'
        ) THEN
          ALTER TABLE pet_equipped_accessories
            ADD CONSTRAINT pet_equipped_accessories_pet_inventory_fk
            FOREIGN KEY (pet_inventory_id)
            REFERENCES user_inventory(id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'pet_equipped_accessories_accessory_inventory_fk'
        ) THEN
          ALTER TABLE pet_equipped_accessories
            ADD CONSTRAINT pet_equipped_accessories_accessory_inventory_fk
            FOREIGN KEY (accessory_inventory_id)
            REFERENCES user_inventory(id)
            ON DELETE CASCADE;
        END IF;
      END
      $accessory_fk_constraints$;
    `);
  });
}
