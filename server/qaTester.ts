export interface QaTesterIdentity {
  username: string;
  email: string;
}

const ENABLED_VALUE = "true";

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getQaTesterIdentity(): QaTesterIdentity | null {
  if (normalize(process.env.QA_MOD_ACCOUNT_ENABLED) !== ENABLED_VALUE) return null;

  const username = process.env.QA_MOD_USERNAME?.trim();
  const email = process.env.QA_MOD_EMAIL?.trim().toLowerCase();
  if (!username || !email) return null;

  return { username, email };
}

/**
 * The dedicated QA account intentionally keeps the normal moderator badge so it
 * looks like a real player/mod account in-game, but this check is narrower than
 * generic moderator authorization: both reserved Railway identifiers must match,
 * the account must be verified, and it must never be an admin or bot.
 */
export function isDedicatedQaTester(user: any): boolean {
  const identity = getQaTesterIdentity();
  if (!identity || !user) return false;

  return user.isAdmin !== true
    && user.isModerator === true
    && user.isBot !== true
    && user.emailVerified === true
    && normalize(user.username) === normalize(identity.username)
    && normalize(user.email) === normalize(identity.email);
}
