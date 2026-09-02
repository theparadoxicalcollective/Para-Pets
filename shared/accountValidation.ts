import { z } from "zod";

export const accountEmailSchema = z.string().trim().toLowerCase().max(254).email("Please enter a valid email address");
export const accountUsernameSchema = z.string().trim().min(3, "Username must be between 3 and 20 characters").max(20, "Username must be between 3 and 20 characters")
  .regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/, "Use letters, numbers, underscores, and periods (no leading or trailing periods)");
export const newAccountPasswordSchema = z.string().min(6, "Password must be at least 6 characters")
  .refine(value => new TextEncoder().encode(value).length <= 72, "Password must be no more than 72 bytes (use fewer characters)");

export const registrationSchema = z.object({
  username: accountUsernameSchema,
  email: accountEmailSchema,
  password: newAccountPasswordSchema,
  profileImageData: z.string().max(4_000_000).nullish(),
  referrer: z.string().max(2048).optional(),
});

export const emailCorrectionSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(1, "Enter your current password"),
});
