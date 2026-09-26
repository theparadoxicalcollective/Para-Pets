import { db } from "../../db";
import { sql } from "drizzle-orm";

/** Schema work that must finish before routes are registered and the listener starts. */
export async function runEssentialBoot(): Promise<void> {
  // Required by inventory/catalog reads: do not start with a partial schema.
  await db.execute(sql`
    ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS evolution_image_url TEXT;
    ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS adornment_slot TEXT;
    ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS pet_exp INTEGER CHECK (pet_exp >= 0);
    ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS is_evolved BOOLEAN NOT NULL DEFAULT false;
  `);

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  } catch (err) { console.error("Session table setup error (non-fatal):", err); }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_blobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        mime_type text NOT NULL,
        data text NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);
  } catch (err) { console.error("media_blobs table setup error (non-fatal):", err); }

  const migrations: Array<[string, ReturnType<typeof sql>]> = [
    ["Redeem code schema migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS redeem_codes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL UNIQUE,
        bundle_id VARCHAR NOT NULL REFERENCES reward_bundles(id) ON DELETE CASCADE,
        active BOOLEAN NOT NULL DEFAULT true,
        expires_at TIMESTAMP,
        max_redemptions INTEGER CHECK (max_redemptions > 0),
        created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS redeem_code_redemptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code_id VARCHAR NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redeemed_at TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE(code_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS redeem_code_redemptions_user_idx
        ON redeem_code_redemptions(user_id, redeemed_at DESC);
      ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS max_redemptions INTEGER;
    `],
    ["Mini Pets schema migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS mini_pet_definitions (
        shop_item_id VARCHAR PRIMARY KEY REFERENCES shop_items(id) ON DELETE CASCADE,
        animation_style TEXT NOT NULL DEFAULT 'breath' CHECK(animation_style IN ('breath','float')),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS mini_pet_parts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
        part_type TEXT NOT NULL CHECK(part_type IN ('eyes','head','left_ear','right_ear','body','tail','left_wing','right_wing')),
        image_url TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE(shop_item_id, part_type)
      );
      CREATE TABLE IF NOT EXISTS pet_equipped_mini_pets (
        pet_inventory_id VARCHAR PRIMARY KEY REFERENCES user_inventory(id) ON DELETE CASCADE,
        mini_pet_inventory_id VARCHAR NOT NULL UNIQUE REFERENCES user_inventory(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mini_pet_parts_item_idx ON mini_pet_parts(shop_item_id);
    `],
    ["Card catalog and border layout migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS card_definitions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        artwork_url TEXT NOT NULL,
        rarity INTEGER NOT NULL CHECK (rarity BETWEEN 1 AND 5),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      ALTER TABLE card_definitions ADD COLUMN IF NOT EXISTS second_description TEXT NOT NULL DEFAULT '';
      ALTER TABLE card_definitions ADD COLUMN IF NOT EXISTS effect_color TEXT;
      ALTER TABLE card_definitions ADD COLUMN IF NOT EXISTS special_effect TEXT;
      ALTER TABLE card_definitions ADD COLUMN IF NOT EXISTS card_label TEXT;
      CREATE TABLE IF NOT EXISTS user_cards (
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_id VARCHAR NOT NULL REFERENCES card_definitions(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
        first_collected_at TIMESTAMP NOT NULL DEFAULT now(),
        first_reward_claimed_at TIMESTAMP,
        PRIMARY KEY (user_id, card_id)
      );
      CREATE TABLE IF NOT EXISTS reward_bundle_cards (
        bundle_id VARCHAR NOT NULL REFERENCES reward_bundles(id) ON DELETE CASCADE,
        card_id VARCHAR NOT NULL REFERENCES card_definitions(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
        PRIMARY KEY (bundle_id, card_id)
      );

      CREATE INDEX IF NOT EXISTS card_definitions_rarity_created_idx
        ON card_definitions(rarity, created_at DESC);

      CREATE TABLE IF NOT EXISTS card_border_layouts (
        rarity INTEGER PRIMARY KEY CHECK (rarity BETWEEN 1 AND 5),
        name_x REAL NOT NULL DEFAULT 13 CHECK (name_x BETWEEN 0 AND 100),
        name_y REAL NOT NULL DEFAULT 6 CHECK (name_y BETWEEN 0 AND 100),
        name_width REAL NOT NULL DEFAULT 74 CHECK (name_width BETWEEN 4 AND 100),
        name_height REAL NOT NULL DEFAULT 10 CHECK (name_height BETWEEN 4 AND 100),
        name_font_size REAL NOT NULL DEFAULT 14 CHECK (name_font_size BETWEEN 6 AND 32),
        description_x REAL NOT NULL DEFAULT 13 CHECK (description_x BETWEEN 0 AND 100),
        description_y REAL NOT NULL DEFAULT 76 CHECK (description_y BETWEEN 0 AND 100),
        description_width REAL NOT NULL DEFAULT 74 CHECK (description_width BETWEEN 4 AND 100),
        description_height REAL NOT NULL DEFAULT 16 CHECK (description_height BETWEEN 4 AND 100),
        description_font_size REAL NOT NULL DEFAULT 10 CHECK (description_font_size BETWEEN 6 AND 32),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CHECK (name_x + name_width <= 100),
        CHECK (name_y + name_height <= 100),
        CHECK (description_x + description_width <= 100),
        CHECK (description_y + description_height <= 100)
      );
      ALTER TABLE card_border_layouts ADD COLUMN IF NOT EXISTS name_curve REAL NOT NULL DEFAULT 0 CHECK (name_curve BETWEEN 0 AND 8);
      ALTER TABLE card_border_layouts ADD COLUMN IF NOT EXISTS star_x REAL NOT NULL DEFAULT 47;
      ALTER TABLE card_border_layouts ADD COLUMN IF NOT EXISTS star_y REAL NOT NULL DEFAULT 18;
      ALTER TABLE card_border_layouts ADD COLUMN IF NOT EXISTS star_width REAL NOT NULL DEFAULT 6;
      INSERT INTO card_border_layouts (rarity)
      SELECT generated.rarity FROM generate_series(1, 5) AS generated(rarity)
      ON CONFLICT (rarity) DO NOTHING;
      UPDATE card_border_layouts SET star_x = 50 - rarity * 3, star_width = rarity * 6
      WHERE star_x = 47 AND star_width = 6 AND rarity > 1;
      -- Enlarge groups that still use the original default star size. Keep each
      -- group's center and leave explicitly resized groups at their chosen size.
      UPDATE card_border_layouts
      SET star_x = GREATEST(0, LEAST(100 - rarity * 7.8, star_x - rarity * 0.9)),
          star_y = GREATEST(0, LEAST(94.8, star_y - 0.6)),
          star_width = rarity * 7.8
      WHERE star_width = rarity * 6;
    `],
    ["Pet part rotation migration error (non-fatal):", sql`
      ALTER TABLE pet_template_parts ADD COLUMN IF NOT EXISTS rotation INTEGER NOT NULL DEFAULT 0
    `],
    ["Pet evolution artwork form migration error (non-fatal):", sql`
      ALTER TABLE pet_template_parts ADD COLUMN IF NOT EXISTS form TEXT NOT NULL DEFAULT 'base';
      CREATE INDEX IF NOT EXISTS pet_template_parts_template_form_idx
        ON pet_template_parts(template_id, form)
    `],
    ["Soul Exchange history migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS soul_exchange_transactions (
      exchange_action_id UUID PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pet_inventory_id VARCHAR NOT NULL, shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
      pet_name TEXT NOT NULL, rarity INTEGER NOT NULL CHECK(rarity BETWEEN 1 AND 5),
      essence_awarded INTEGER NOT NULL CHECK(essence_awarded > 0), resulting_essence INTEGER NOT NULL,
      exchanged_pets JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    ); ALTER TABLE soul_exchange_transactions ADD COLUMN IF NOT EXISTS exchanged_pets JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS soul_exchange_transactions_user_created_idx ON soul_exchange_transactions(user_id,created_at DESC)`],
    ["Costume definitions migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS pet_costume_definitions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_item_id VARCHAR NOT NULL,
        template_id VARCHAR NOT NULL,
        placements JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pet_costume_definitions_item_template_uidx
        ON pet_costume_definitions(shop_item_id, template_id)
    `],
    ["Costume slot unlock migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS pet_costume_slot_unlocks (
        pet_inventory_id VARCHAR PRIMARY KEY REFERENCES user_inventory(id) ON DELETE CASCADE,
        extra_slots INTEGER NOT NULL DEFAULT 0 CHECK(extra_slots BETWEEN 0 AND 2),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `],
    ["Equipped costumes migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS pet_equipped_costumes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        pet_inventory_id VARCHAR NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
        costume_inventory_id VARCHAR NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
        copy_index INTEGER NOT NULL DEFAULT 0 CHECK(copy_index >= 0),
        slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT pet_equipped_costumes_pet_slot_unique UNIQUE(pet_inventory_id, slot),
        CONSTRAINT pet_equipped_costumes_inventory_copy_unique UNIQUE(costume_inventory_id, copy_index)
      );
      ALTER TABLE pet_equipped_costumes ADD COLUMN IF NOT EXISTS copy_index INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE pet_equipped_costumes DROP CONSTRAINT IF EXISTS pet_equipped_costumes_costume_inventory_id_key;
      CREATE UNIQUE INDEX IF NOT EXISTS pet_equipped_costumes_inventory_copy_uidx
        ON pet_equipped_costumes(costume_inventory_id, copy_index)
    `],
    ["Accessory physical-copy inventory migration error (non-fatal):", sql`
      -- Accessories are equippable physical copies, but legacy inventory code
      -- stacked duplicate copies into one user_inventory row. Equipment stores
      -- that row id, so equipping one copy made every copy in the stack look
      -- equipped. Enforce one inventory row per accessory copy at the database
      -- boundary so every acquisition path follows the same ownership model.
      CREATE OR REPLACE FUNCTION enforce_individual_accessory_inventory_rows()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        item_type TEXT;
        extra_count INTEGER := 0;
      BEGIN
        SELECT type INTO item_type FROM shop_items WHERE id = NEW.shop_item_id;
        IF item_type IS DISTINCT FROM 'accessory' THEN
          RETURN NEW;
        END IF;

        -- A listed row is marketplace escrow. Do not split it while listed;
        -- it will be normalized atomically when it returns to an owner.
        IF COALESCE(NEW.is_listed, false) THEN
          RETURN NEW;
        END IF;

        IF TG_OP = 'INSERT' THEN
          extra_count := GREATEST(COALESCE(NEW.quantity, 1) - 1, 0);
          NEW.quantity := 1;
        ELSIF COALESCE(OLD.is_listed, false) AND NOT COALESCE(NEW.is_listed, false) AND COALESCE(NEW.quantity, 1) > 1 THEN
          -- Legacy listed stacks are split when cancelled or transferred to
          -- a buyer. The original row remains the canonical first copy.
          extra_count := COALESCE(NEW.quantity, 1) - 1;
          NEW.quantity := 1;
        ELSIF COALESCE(NEW.quantity, 1) > COALESCE(OLD.quantity, 1) THEN
          -- Existing application code may still try quantity = quantity + N.
          -- Turn only the increment into new physical rows and leave this
          -- row as the already-existing physical copy.
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

      -- Repair historical unlisted stacks now. Preserve the original row id
      -- because pet_equipped_accessories may already reference it; only the
      -- remaining copies receive fresh ids and become available in the bag.
      WITH stacked AS (
        SELECT ui.id, ui.user_id, ui.shop_item_id, ui.acquired_at, ui.quantity
        FROM user_inventory ui
        INNER JOIN shop_items si ON si.id = ui.shop_item_id
        WHERE si.type = 'accessory'
          AND ui.is_listed = false
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
      WHERE ui.id = s.id;
    `],
    ["watcher_shoutouts_enabled migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS watcher_shoutouts_enabled boolean NOT NULL DEFAULT true`],
    ["is_bot migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false`],
    ["pvp_battle_groups.attack_power migration error (non-fatal):", sql`ALTER TABLE pvp_battle_groups ADD COLUMN IF NOT EXISTS attack_power integer NOT NULL DEFAULT 0`],
    ["users.molten_blocks_high_score migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS molten_blocks_high_score INTEGER NOT NULL DEFAULT 0`],
    ["users.essence early migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS essence INTEGER NOT NULL DEFAULT 0`],
    ["users.raid_total_damage early migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS raid_total_damage INTEGER NOT NULL DEFAULT 0`],
    ["shop_items.clearing_slot migration error (non-fatal):", sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS clearing_slot text`],
    ["shop_items Clearing combat metadata migration error (non-fatal):", sql`ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS clearing_attack_style text; ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS clearing_active boolean NOT NULL DEFAULT true`],
    ["user_clearing_loadouts migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS user_clearing_loadouts (
      user_id VARCHAR PRIMARY KEY,
      helmet_inventory_id VARCHAR NULL,
      weapon_inventory_id VARCHAR NULL,
      armor_inventory_id VARCHAR NULL,
      charm_inventory_id VARCHAR NULL,
      boots_inventory_id VARCHAR NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT user_clearing_loadouts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT user_clearing_loadouts_helmet_fk FOREIGN KEY (helmet_inventory_id) REFERENCES user_inventory(id) ON DELETE SET NULL,
      CONSTRAINT user_clearing_loadouts_weapon_fk FOREIGN KEY (weapon_inventory_id) REFERENCES user_inventory(id) ON DELETE SET NULL,
      CONSTRAINT user_clearing_loadouts_armor_fk FOREIGN KEY (armor_inventory_id) REFERENCES user_inventory(id) ON DELETE SET NULL,
      CONSTRAINT user_clearing_loadouts_charm_fk FOREIGN KEY (charm_inventory_id) REFERENCES user_inventory(id) ON DELETE SET NULL,
      CONSTRAINT user_clearing_loadouts_boots_fk FOREIGN KEY (boots_inventory_id) REFERENCES user_inventory(id) ON DELETE SET NULL
    )`],
    ["user_clearing_loadouts five-slot migration error (non-fatal):", sql`ALTER TABLE user_clearing_loadouts ADD COLUMN IF NOT EXISTS helmet_inventory_id VARCHAR REFERENCES user_inventory(id) ON DELETE SET NULL; ALTER TABLE user_clearing_loadouts ADD COLUMN IF NOT EXISTS boots_inventory_id VARCHAR REFERENCES user_inventory(id) ON DELETE SET NULL`],
    ["Clearing starter identity migration error (non-fatal):", sql`UPDATE shop_items SET name='Training Sword', clearing_slot='weapon', clearing_attack_style='sword_slash', clearing_active=true WHERE id='a1b2c3d4-0011-4000-8000-000000000012'`],
    ["Clearing starter deduplication migration error (non-fatal):", sql`DELETE FROM user_inventory duplicate USING user_inventory keeper WHERE duplicate.shop_item_id='a1b2c3d4-0011-4000-8000-000000000012' AND keeper.shop_item_id=duplicate.shop_item_id AND keeper.user_id=duplicate.user_id AND keeper.id < duplicate.id`],
    ["Clearing starter uniqueness migration error (non-fatal):", sql`CREATE UNIQUE INDEX IF NOT EXISTS user_inventory_clearing_basic_sword_uidx ON user_inventory(user_id, shop_item_id) WHERE shop_item_id = 'a1b2c3d4-0011-4000-8000-000000000012'`],
    ["clearing_ground_drops migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS clearing_ground_drops (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR NOT NULL, clearing_id VARCHAR NOT NULL, shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
      reward_id VARCHAR NOT NULL UNIQUE, world_x REAL NOT NULL, world_y REAL NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(), expires_at TIMESTAMP NOT NULL, collected_at TIMESTAMP NULL
    )`],
    ["clearing_ground_drops lookup index migration error (non-fatal):", sql`CREATE INDEX IF NOT EXISTS clearing_ground_drops_active_idx ON clearing_ground_drops(user_id, session_id, expires_at) WHERE collected_at IS NULL`],
    ["clearing_currency_drops migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS clearing_currency_drops (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR NOT NULL, clearing_id VARCHAR NOT NULL, reward_id VARCHAR NOT NULL UNIQUE,
      currency TEXT NOT NULL CHECK (currency IN ('coins','essence')), amount INTEGER NOT NULL CHECK (amount > 0),
      world_x REAL NOT NULL, world_y REAL NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(), expires_at TIMESTAMP NOT NULL, collected_at TIMESTAMP NULL
    )`],
    ["clearing_currency_drops lookup index migration error (non-fatal):", sql`CREATE INDEX IF NOT EXISTS clearing_currency_drops_active_idx ON clearing_currency_drops(user_id, session_id, expires_at) WHERE collected_at IS NULL`],
    ["clearing_reward_chests migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS clearing_reward_chests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR NOT NULL, clearing_id VARCHAR NOT NULL, defeated_enemy_id VARCHAR NOT NULL, pet_inventory_id VARCHAR NOT NULL REFERENCES user_inventory(id) ON DELETE RESTRICT,
      world_x REAL NOT NULL, world_y REAL NOT NULL, rewards JSONB NOT NULL, highest_equipment_rarity INTEGER NOT NULL DEFAULT 0 CHECK(highest_equipment_rarity BETWEEN 0 AND 5),
      created_at TIMESTAMP NOT NULL DEFAULT now(), expires_at TIMESTAMP NOT NULL, claimed_at TIMESTAMP NULL,
      UNIQUE(user_id, defeated_enemy_id)
    )`],
    ["clearing_reward_chests lookup index migration error (non-fatal):", sql`CREATE INDEX IF NOT EXISTS clearing_reward_chests_active_idx ON clearing_reward_chests(user_id, session_id, created_at) WHERE claimed_at IS NULL`],
    ["Clearing world configuration migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS clearing_world_drops (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), world_id VARCHAR NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE, rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare')), created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(world_id,shop_item_id));
      CREATE TABLE IF NOT EXISTS clearing_world_enemies (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), world_id VARCHAR NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, enemy_id VARCHAR NOT NULL REFERENCES enemies(id) ON DELETE CASCADE, is_boss BOOLEAN NOT NULL DEFAULT false, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(world_id,enemy_id));
      CREATE TABLE IF NOT EXISTS clearing_world_special_mobs (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), world_id VARCHAR NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, pet_shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE, created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(world_id,pet_shop_item_id));
      CREATE TABLE IF NOT EXISTS clearing_special_egg_drops (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id VARCHAR NOT NULL, clearing_id VARCHAR NOT NULL, defeated_enemy_id VARCHAR NOT NULL, pet_shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT, world_x REAL NOT NULL, world_y REAL NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(), expires_at TIMESTAMP NOT NULL, collected_at TIMESTAMP NULL, UNIQUE(user_id,defeated_enemy_id));
      CREATE INDEX IF NOT EXISTS clearing_world_drops_world_idx ON clearing_world_drops(world_id);
      CREATE INDEX IF NOT EXISTS clearing_world_enemies_world_idx ON clearing_world_enemies(world_id,sort_order);
      CREATE INDEX IF NOT EXISTS clearing_world_special_mobs_world_idx ON clearing_world_special_mobs(world_id);
      CREATE INDEX IF NOT EXISTS clearing_special_egg_drops_active_idx ON clearing_special_egg_drops(user_id,session_id,expires_at) WHERE collected_at IS NULL;
    `],
    ["Elysian Clearing configuration backfill error (non-fatal):", sql`
      INSERT INTO clearing_world_drops(world_id,shop_item_id,rarity)
      SELECT 'swamp',s.id,CASE WHEN COALESCE(s.star_rarity,1)>=3 THEN 'rare' WHEN s.star_rarity=2 THEN 'uncommon' ELSE 'common' END
      FROM shop_items s WHERE EXISTS(SELECT 1 FROM worlds WHERE id='swamp') AND s.type='clearing' AND s.clearing_active=true AND s.id<>'a1b2c3d4-0011-4000-8000-000000000012' ORDER BY s.star_rarity,s.created_at LIMIT 5
      ON CONFLICT(world_id,shop_item_id) DO NOTHING;
    `],
    ["Elysian Clearing retired helmet cleanup error (non-fatal):", sql`
      UPDATE shop_items SET clearing_active=false WHERE id='a1b2c3d4-0011-4000-8000-000000000022';
      DELETE FROM clearing_world_drops WHERE shop_item_id='a1b2c3d4-0011-4000-8000-000000000022';
    `],
    ["Clearing world shops migration error (non-fatal):", sql`
      CREATE TABLE IF NOT EXISTS clearing_world_shops (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), world_id VARCHAR NOT NULL UNIQUE REFERENCES worlds(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false, portal_x REAL NOT NULL DEFAULT .50 CHECK(portal_x BETWEEN .08 AND .92),
        portal_y REAL NOT NULL DEFAULT .55 CHECK(portal_y BETWEEN .05 AND .94), portal_width INTEGER NOT NULL DEFAULT 96 CHECK(portal_width BETWEEN 64 AND 160),
        interaction_radius_pixels INTEGER NOT NULL DEFAULT 58 CHECK(interaction_radius_pixels BETWEEN 36 AND 140), updated_at TIMESTAMP NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS clearing_world_shop_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), world_id VARCHAR NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE, essence_price INTEGER NOT NULL CHECK(essence_price BETWEEN 1 AND 1000000),
        active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(world_id,shop_item_id));
      CREATE INDEX IF NOT EXISTS clearing_world_shop_items_order_idx ON clearing_world_shop_items(world_id,active,sort_order);
      CREATE TABLE IF NOT EXISTS clearing_shop_purchases (
        purchase_action_id UUID PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assignment_id VARCHAR NOT NULL, inventory_id VARCHAR NOT NULL REFERENCES user_inventory(id) ON DELETE RESTRICT,
        essence_spent INTEGER NOT NULL, resulting_essence INTEGER NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now());
    `],
    // Enemy identities and Clearing assignments are admin-owned. Re-seeding them
    // during boot would resurrect deleted enemies or repopulate an empty roster.
    ["molten_blocks_drop_items migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS molten_blocks_drop_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_item_id VARCHAR NOT NULL,
      rarity VARCHAR(16) NOT NULL DEFAULT 'common',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`],
  ];
  for (const [errorMessage, statement] of migrations) {
    try { await db.execute(statement); }
    catch (err) { console.error(errorMessage, err); }
  }
}
