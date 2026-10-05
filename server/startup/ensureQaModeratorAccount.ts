import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

const ENABLED_VALUE = "true";

export type QaModeratorAccountStatus =
  | { enabled: false }
  | { enabled: true; created: boolean; username: string; userId: string };

/**
 * Provision one dedicated player-facing QA account without weakening normal
 * registration or email verification.
 *
 * This is intentionally opt-in through Railway environment variables. The
 * account is moderator-only (never admin), email-verified at the database
 * boundary, and uses the normal password login flow. Existing real accounts
 * are never repurposed: username/email collisions fail closed.
 */
export async function ensureQaModeratorAccount(): Promise<QaModeratorAccountStatus> {
  if ((process.env.QA_MOD_ACCOUNT_ENABLED ?? "").toLowerCase() !== ENABLED_VALUE) {
    return { enabled: false };
  }

  const username = process.env.QA_MOD_USERNAME?.trim();
  const email = process.env.QA_MOD_EMAIL?.trim().toLowerCase();
  const password = process.env.QA_MOD_PASSWORD ?? "";

  if (!username || !email || password.length < 6) {
    throw new Error("QA moderator account is enabled but QA_MOD_USERNAME, QA_MOD_EMAIL, or QA_MOD_PASSWORD is missing/invalid");
  }

  // Serialize provisioning across multiple app replicas/restarts.
  await db.execute(sql`SELECT pg_advisory_lock(7107, hashtext(${username.toLowerCase()}))`);
  try {
    const [byName, byEmail] = await Promise.all([
      storage.getUserByUsernameCaseInsensitive(username),
      storage.getUserByEmail(email),
    ]);

    if ((byName && byEmail && byName.id !== byEmail.id) || (byName && !byEmail) || (!byName && byEmail)) {
      throw new Error("QA moderator username/email collides with an existing account; refusing to repurpose it");
    }

    let user = byName ?? byEmail;
    let created = false;

    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await storage.createUser({
        username,
        email,
        password: passwordHash,
        profileImage: null,
        isAdmin: false,
        coins: 0,
      });
      created = true;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    const nextPassword = passwordMatches ? user.password : await bcrypt.hash(password, 10);

    const [updated] = await db.update(users)
      .set({
        password: nextPassword,
        isAdmin: false,
        isModerator: true,
        isBot: false,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      })
      .where(and(eq(users.id, user.id), eq(users.username, user.username)))
      .returning({ id: users.id, username: users.username });

    if (!updated) throw new Error("QA moderator account disappeared during provisioning");

    return {
      enabled: true,
      created,
      username: updated.username,
      userId: updated.id,
    };
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(7107, hashtext(${username.toLowerCase()}))`);
  }
}
