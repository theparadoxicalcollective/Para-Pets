import type { InsertUser } from "@shared/schema";

/** The fixed, least-privilege fields used for every self-service registration. */
export function createRegisteredUser(input: Pick<InsertUser, "username" | "email" | "password" | "profileImage">): InsertUser {
  return {
    ...input,
    isAdmin: false,
    isModerator: false,
    coins: 0,
    essence: 1000,
  } as InsertUser;
}
