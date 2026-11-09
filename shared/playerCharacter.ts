import { z } from "zod";

/**
 * Player-character artwork is a separate domain from pet templates, mini pets
 * and the old /api/users/avatars profile-image batch endpoint.
 * Positions are relative to a square character canvas, never to a device.
 */
export const PLAYER_CHARACTER_PART_TYPES = [
  "left_leg", "right_leg", "body", "left_arm", "right_arm", "head", "eyes",
] as const;
export type PlayerCharacterPartType = typeof PLAYER_CHARACTER_PART_TYPES[number];

export const PLAYER_CHARACTER_PART_LABELS: Record<PlayerCharacterPartType, string> = {
  head: "Head",
  eyes: "Open Eyes",
  body: "Body",
  left_arm: "Left Arm",
  right_arm: "Right Arm",
  left_leg: "Left Leg",
  right_leg: "Right Leg",
};

export const playerCharacterPartTypeSchema = z.enum(PLAYER_CHARACTER_PART_TYPES);
export const playerCharacterTransformSchema = z.object({
  // x/y place the part pivot; 0–100% of the character canvas.
  xPct: z.number().finite().min(0).max(100),
  yPct: z.number().finite().min(0).max(100),
  // Width as % of canvas; natural image aspect ratio remains unchanged.
  widthPct: z.number().finite().min(2).max(150),
  pivotXPct: z.number().finite().min(0).max(100),
  pivotYPct: z.number().finite().min(0).max(100),
  rotationDeg: z.number().finite().min(-180).max(180),
  zIndex: z.number().int().min(0).max(100),
}).strict();
export type PlayerCharacterTransform = z.infer<typeof playerCharacterTransformSchema>;

export const playerCharacterPartSchema = playerCharacterTransformSchema.extend({
  partType: playerCharacterPartTypeSchema,
  // The server alone supplies validated, processed media URLs.
  imageUrl: z.string().regex(/^\/api\/media\/[a-zA-Z0-9-]{1,80}$/),
});
export type PlayerCharacterPart = z.infer<typeof playerCharacterPartSchema>;

export const playerCharacterNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

export const playerCharacterPartWriteSchema = z.object({
  expectedRevision: z.number().int().min(0),
  transform: playerCharacterTransformSchema,
  // PNG/WebP with alpha; converted to bounded transparent PNG via the
  // established image processor. Never store a data URI in JSONB.
  imageData: z.string()
    .max(8_000_000)
    .regex(/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .optional(),
}).strict();

export const playerCharacterRevisionSchema = z.object({
  expectedRevision: z.number().int().min(0),
}).strict();

export const DEFAULT_PLAYER_CHARACTER_TRANSFORMS: Record<PlayerCharacterPartType, PlayerCharacterTransform> = {
  left_leg:  { xPct: 42, yPct: 72, widthPct: 24, pivotXPct: 50, pivotYPct: 12, rotationDeg: 0, zIndex: 10 },
  right_leg: { xPct: 58, yPct: 72, widthPct: 24, pivotXPct: 50, pivotYPct: 12, rotationDeg: 0, zIndex: 11 },
  body:      { xPct: 50, yPct: 58, widthPct: 50, pivotXPct: 50, pivotYPct: 45, rotationDeg: 0, zIndex: 30 },
  left_arm:  { xPct: 28, yPct: 48, widthPct: 21, pivotXPct: 70, pivotYPct: 12, rotationDeg: 0, zIndex: 35 },
  right_arm: { xPct: 72, yPct: 48, widthPct: 21, pivotXPct: 30, pivotYPct: 12, rotationDeg: 0, zIndex: 36 },
  head:      { xPct: 50, yPct: 29, widthPct: 42, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 50 },
  eyes:      { xPct: 50, yPct: 30, widthPct: 23, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 60 },
};

export function upsertPlayerCharacterPart(
  saved: readonly PlayerCharacterPart[],
  next: PlayerCharacterPart,
): PlayerCharacterPart[] {
  playerCharacterPartSchema.parse(next);
  const checked = saved.map(part => playerCharacterPartSchema.parse(part));
  return [...checked.filter(part => part.partType !== next.partType), next]
    .sort((a, b) => a.zIndex - b.zIndex || PLAYER_CHARACTER_PART_TYPES.indexOf(a.partType) -
      PLAYER_CHARACTER_PART_TYPES.indexOf(b.partType));
}

export function completePlayerCharacterParts(parts: readonly PlayerCharacterPart[]): boolean {
  const parsed = z.array(playerCharacterPartSchema).max(7).safeParse(parts);
  if (!parsed.success) return false;
  return PLAYER_CHARACTER_PART_TYPES.every(partType =>
    parsed.data.filter(part => part.partType === partType).length === 1
  );
}
