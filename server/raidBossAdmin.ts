import { sql } from "drizzle-orm";
import { z } from "zod";
import type { db as database } from "./db";

const hp = z.number().int().min(0).max(2_000_000_000);
export const raidBossSelectionSchema = z.object({
  templateId: z.string().trim().min(1).nullable(),
  hp: hp.optional(),
  maxHp: hp.min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.templateId && (value.hp ?? value.maxHp ?? 10000) > (value.maxHp ?? 10000)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Starting HP cannot exceed Max HP" });
  }
});

/** All selection changes, HP, and per-raid resets commit or roll back together. */
export async function saveRaidBoss(db: Pick<typeof database, "transaction">, selection: z.infer<typeof raidBossSelectionSchema>) {
  await db.transaction(async tx => {
    if (selection.templateId) {
      const template = await tx.execute(sql`SELECT id FROM pet_templates WHERE id = ${selection.templateId} FOR SHARE`);
      if (!template.rows.length) throw Object.assign(new Error("Pet template no longer exists. Choose another boss."), { status: 404 });
    }
    const maxHp = selection.templateId ? selection.maxHp ?? 10000 : 0;
    const startingHp = selection.templateId ? selection.hp ?? maxHp : 0;
    await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES
      ('raid_boss_template_id', ${selection.templateId ?? ""}),
      ('raid_boss_hp', ${String(startingHp)}), ('raid_boss_max_hp', ${String(maxHp)}),
      ('raid_defeat_lock_current', 'pending')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await tx.execute(sql`INSERT INTO game_settings (key, value) VALUES
      ('raid_boss_normal_atk_pct', '20'), ('raid_boss_large_atk_pct', '30')
      ON CONFLICT (key) DO NOTHING`);
    await tx.execute(sql`UPDATE users SET raid_total_damage = 0 WHERE COALESCE(raid_total_damage, 0) > 0`);
  });
}
