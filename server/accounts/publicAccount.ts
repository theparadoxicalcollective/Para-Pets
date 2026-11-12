/** Never send credentials or bearer recovery tokens to a client, including admins. */
export function publicAccount<T extends object>(user: T): Omit<T,
  "password" | "passwordResetToken" | "passwordResetExpires" | "emailVerificationToken" | "emailVerificationExpires" |
  "pendingEmail" | "pendingEmailTokenHash" | "pendingEmailExpires" | "pendingEmailRequestedAt"
> {
  const {
    password, passwordResetToken, passwordResetExpires,
    emailVerificationToken, emailVerificationExpires,
    pendingEmail, pendingEmailTokenHash, pendingEmailExpires, pendingEmailRequestedAt,
    ...safe
  } = user as T & Record<string, unknown>;
  return safe;
}
