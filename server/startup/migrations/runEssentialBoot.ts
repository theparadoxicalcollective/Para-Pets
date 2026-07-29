import { db } from "../../db";
import { sql } from "drizzle-orm";

/** Schema work that must finish before routes are registered and the listener starts. */
export async function runEssentialBoot(): Promise<void> {
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
      INSERT INTO clearing_world_enemies(world_id,enemy_id,is_boss)
      SELECT 'swamp',e.id,false FROM enemies e WHERE EXISTS(SELECT 1 FROM worlds WHERE id='swamp') AND NOT EXISTS(SELECT 1 FROM clearing_world_enemies WHERE world_id='swamp') ORDER BY e.created_at LIMIT 1;
      INSERT INTO clearing_world_drops(world_id,shop_item_id,rarity)
      SELECT 'swamp',s.id,CASE WHEN COALESCE(s.star_rarity,1)>=3 THEN 'rare' WHEN s.star_rarity=2 THEN 'uncommon' ELSE 'common' END
      FROM shop_items s WHERE EXISTS(SELECT 1 FROM worlds WHERE id='swamp') AND s.type='clearing' AND s.clearing_active=true AND s.id<>'a1b2c3d4-0011-4000-8000-000000000012' ORDER BY s.star_rarity,s.created_at LIMIT 5
      ON CONFLICT(world_id,shop_item_id) DO NOTHING;
    `],
    ["Elysian Clearing retired helmet cleanup error (non-fatal):", sql`
      UPDATE shop_items SET clearing_active=false WHERE id='a1b2c3d4-0011-4000-8000-000000000022';
      DELETE FROM clearing_world_drops WHERE shop_item_id='a1b2c3d4-0011-4000-8000-000000000022';
    `],
    ["Elysian Clearing Murk enemy reuse error (non-fatal):", sql`
      INSERT INTO enemies(id,name,image_url,atk,health,is_boss,archetype) VALUES
        ('elysian-murk-puddle-grub','Puddle Grub','/world-assets/generated_images/enemy_t1_puddle_grub.png',8,85,false,'slow'),
        ('elysian-murk-boglet','Boglet','/world-assets/generated_images/enemy_t1_boglet.png',9,75,false,'balanced'),
        ('elysian-murk-newt','Murk Newt','/world-assets/generated_images/enemy_t1_murk_newt.png',7,65,false,'nimble')
      ON CONFLICT(id) DO NOTHING;
      INSERT INTO clearing_world_enemies(world_id,enemy_id,is_boss,sort_order)
      SELECT 'swamp',id,false,20+row_number() OVER(ORDER BY id) FROM enemies
      WHERE id IN ('elysian-murk-puddle-grub','elysian-murk-boglet','elysian-murk-newt')
      ON CONFLICT(world_id,enemy_id) DO NOTHING;
    `],
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
