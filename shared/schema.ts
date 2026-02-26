import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  profileImage: text("profile_image"),
  coins: integer("coins").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  lastUsernameChange: timestamp("last_username_change"),
  lastProfilePicChange: timestamp("last_profile_pic_change"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  profileImage: true,
  isAdmin: true,
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const updateUsernameSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers"),
});

export const updateProfilePicSchema = z.object({
  profileImage: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginData = z.infer<typeof loginSchema>;
