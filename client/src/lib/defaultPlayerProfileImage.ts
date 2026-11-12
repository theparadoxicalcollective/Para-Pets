// A single game-themed fallback for the current player's portrait.
// Removing a custom image sets the database field to null, not a new upload.
import mascot from "@assets/hub_mascot.png";

export const DEFAULT_PLAYER_PROFILE_IMAGE = mascot;
