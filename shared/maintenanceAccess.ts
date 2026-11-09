/**
 * Permission to continue into the game while the public realm is under
 * maintenance. This is NOT an administrator authorization helper.
 *
 * Only an existing authenticated account with a current administrator or
 * moderator flag is admitted. Privileged /api/admin routes continue using
 * the separate requireAdmin middleware, so moderators gain no admin powers.
 */
export function canEnterDuringMaintenance(
  user: { isAdmin?: boolean | null; isModerator?: boolean | null } | null | undefined,
): boolean {
  return user?.isAdmin === true || user?.isModerator === true;
}
