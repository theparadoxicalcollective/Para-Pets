import { z } from "zod";

/** Player-selected skin tone. null keeps the artist's original base artwork. */
export const playerSkinToneSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

export const PLAYER_SKIN_TONE_SWATCHES = [
  { label: "Porcelain", value: "#f3cfb1" },
  { label: "Fair", value: "#e5b48b" },
  { label: "Warm", value: "#d39a71" },
  { label: "Golden", value: "#bc8052" },
  { label: "Tan", value: "#a86b46" },
  { label: "Brown", value: "#855238" },
  { label: "Deep", value: "#623d2d" },
  { label: "Rich", value: "#42291f" },
] as const;
