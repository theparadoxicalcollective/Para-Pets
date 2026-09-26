import { z } from "zod";

export const MINI_PET_PART_TYPES = ["body", "tail", "left_wing", "right_wing", "head", "left_ear", "right_ear", "eyes", "closed_eyes"] as const;
export type MiniPetPartType = typeof MINI_PET_PART_TYPES[number];

export const MINI_PET_ANIMATIONS = ["breath", "float"] as const;
export type MiniPetAnimation = typeof MINI_PET_ANIMATIONS[number];

export const miniPetCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  imageData: z.string().min(1),
  price: z.coerce.number().int().min(0).max(100000000),
  rarity: z.coerce.number().int().min(1).max(5),
  atkBoost: z.coerce.number().int().min(0).max(100000).default(0),
  healthBoost: z.coerce.number().int().min(0).max(100000).default(0),
  defBoost: z.coerce.number().int().min(0).max(100000).default(0),
  animationStyle: z.enum(MINI_PET_ANIMATIONS),
});

export const miniPetUpdateSchema = miniPetCreateSchema.extend({
  imageData: z.string().min(1).optional(),
});

export const miniPetPartSchema = z.object({
  partType: z.enum(MINI_PET_PART_TYPES),
  imageData: z.string().min(1),
});
