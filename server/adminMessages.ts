/**
 * Delete an inbox message through an owner-scoped storage operation. The
 * storage implementation must include both values in one database predicate.
 */
export async function deleteOwnedAdminMessage(
  deleteForUsername: (messageId: string, username: string) => Promise<boolean>,
  messageId: string,
  username: string,
): Promise<boolean> {
  return deleteForUsername(messageId, username);
}
