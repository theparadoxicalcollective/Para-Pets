export class AccountConflictError extends Error {
  constructor(public readonly field: "username" | "email") {
    super(field === "username" ? "That username is already taken. Please choose another." : "That email is already registered. Try logging in instead.");
  }
}
