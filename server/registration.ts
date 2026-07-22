/** New accounts never receive privileged roles during registration. */
export function newAccountPrivileges() {
  return { isAdmin: false, isModerator: false } as const;
}
