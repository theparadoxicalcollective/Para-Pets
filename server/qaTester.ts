export interface QaTesterIdentity {
  slot: number;
  username: string;
  email: string;
  password: string;
}

const ENABLED_VALUE = "true";
const COMPANION_DEFAULTS = [
  { username: "maddyrae13", email: "maddyrae13@qa.parapets.invalid" },
  { username: "RhettM87", email: "rhettm87@qa.parapets.invalid" },
  { username: "pixelpaws", email: "pixelpaws@qa.parapets.invalid" },
  { username: "jaybird_7", email: "jaybird7@qa.parapets.invalid" },
] as const;

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getQaTesterIdentities(): QaTesterIdentity[] {
  if (normalize(process.env.QA_MOD_ACCOUNT_ENABLED) !== ENABLED_VALUE) return [];

  const primaryUsername = process.env.QA_MOD_USERNAME?.trim();
  const primaryEmail = process.env.QA_MOD_EMAIL?.trim().toLowerCase();
  const sharedPassword = process.env.QA_MOD_PASSWORD ?? "";
  if (!primaryUsername || !primaryEmail || sharedPassword.length < 6) return [];

  const identities: QaTesterIdentity[] = [{
    slot: 1,
    username: primaryUsername,
    email: primaryEmail,
    password: sharedPassword,
  }];

  COMPANION_DEFAULTS.forEach((fallback, index) => {
    const slot = index + 2;
    const username = process.env[`QA_MOD_USERNAME_${slot}`]?.trim() || fallback.username;
    const email = process.env[`QA_MOD_EMAIL_${slot}`]?.trim().toLowerCase() || fallback.email;
    const password = process.env[`QA_MOD_PASSWORD_${slot}`] || sharedPassword;
    identities.push({ slot, username, email, password });
  });

  return identities;
}

export function getQaTesterIdentity(): QaTesterIdentity | null {
  return getQaTesterIdentities()[0] ?? null;
}

export function isConfiguredQaIdentity(user: any): boolean {
  if (!user) return false;
  return getQaTesterIdentities().some(identity =>
    normalize(user.username) === normalize(identity.username)
    && normalize(user.email) === normalize(identity.email)
  );
}

/**
 * QA accounts intentionally keep a normal moderator badge so they look like
 * real player/mod accounts in-game. Their QA-only powers are still narrower
 * than moderator access and require an exact reserved username/email match.
 */
export function isDedicatedQaTester(user: any): boolean {
  return isConfiguredQaIdentity(user)
    && user?.isAdmin !== true
    && user?.isModerator === true
    && user?.isBot !== true
    && user?.emailVerified === true;
}
