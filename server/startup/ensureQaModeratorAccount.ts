import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { getQaTesterIdentities } from "../qaTester";

export type QaModeratorAccountStatus =
  | { enabled: false }
  | {
      enabled: true;
      accounts: Array<{
        slot: number;
        created: boolean;
        username: string;
        userId: string;
        error?: string;
      }>;
    };

async function provisionOneQaAccount(identity: ReturnType<typeof getQaTesterIdentities>[number]) {
  const { slot, username, email, password } = identity;

  await db.execute(sql`SELECT pg_advisory_lock(7107, hashtext(${username.toLowerCase()}))`);
  try {
    const [byName, byEmail] = await Promise.all([
      storage.getUserByUsernameCaseInsensitive(username),
      storage.getUserByEmail(email),
    ]);

    if ((byName && byEmail && byName.id !== byEmail.id) || (byName && !byEmail) || (!byName && byEmail)) {
      throw new Error("QA username/email collides with an existing account; refusing to repurpose it");
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

    if (!updated) throw new Error("QA account disappeared during provisioning");

    return {
      slot,
      created,
      username: updated.username,
      userId: updated.id,
    };
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(7107, hashtext(${username.toLowerCase()}))`);
  }
}

/**
 * Provision five dedicated player-facing QA accounts without weakening normal
 * registration or email verification.
 *
 * Slot 1 keeps the original Railway-configured account. Slots 2-5 use realistic
 * player-style defaults and the same QA password unless Railway override
 * variables are supplied for their username/email/password.
 */
export async function ensureQaModeratorAccount(): Promise<QaModeratorAccountStatus> {
  const identities = getQaTesterIdentities();
  if (!identities.length) return { enabled: false };

  const accounts: Extract<QaModeratorAccountStatus, { enabled: true }>["accounts"] = [];

  // Provision independently so one accidental name/email collision cannot stop
  // the other reserved QA players from becoming available.
  for (const identity of identities) {
    try {
      accounts.push(await provisionOneQaAccount(identity));
    } catch (error) {
      accounts.push({
        slot: identity.slot,
        created: false,
        username: identity.username,
        userId: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { enabled: true, accounts };
}
