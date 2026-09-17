import { z } from "zod";

export const DAILY_CLAIM_SETTING_KEY = "daily_claim_rewards_v1";

export const DEFAULT_DAILY_CLAIM_CONFIG = {
  coinAmount: 100,
  essenceAmount: 100,
  itemIds: [] as string[],
};

export const dailyClaimConfigSchema = z.object({
  coinAmount: z.number().int().min(0).max(1_000_000),
  essenceAmount: z.number().int().min(0).max(1_000_000),
  itemIds: z.array(z.string().min(1)).max(2)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each reward item only once"),
}).strict();

export type DailyClaimConfig = z.infer<typeof dailyClaimConfigSchema>;

export function parseDailyClaimConfig(raw: string | null): DailyClaimConfig {
  if (!raw) return { ...DEFAULT_DAILY_CLAIM_CONFIG, itemIds: [] };
  try {
    const parsed = dailyClaimConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? parsed.data
      : { ...DEFAULT_DAILY_CLAIM_CONFIG, itemIds: [] };
  } catch {
    return { ...DEFAULT_DAILY_CLAIM_CONFIG, itemIds: [] };
  }
}
