import { z } from "zod";

/**
 * Player-character artwork is a separate domain from pet templates, mini pets
 * and the old /api/users/avatars profile-image batch endpoint.
 * Positions are relative to a square character canvas, never to a device.
 */
/**
 * Avatar 07A: Eight animation anchors, not clothing slots.
 * "top" is the torso/base body artwork, not an equipped shirt.
 * The old 06/12 "body" and "eyes" records remain readable/archived.
 */
export const PLAYER_CHARACTER_PART_TYPES = [
  "left_leg", "right_leg", "left_foot", "right_foot",
  "top", "left_arm", "right_arm", "head",
] as const;
export type PlayerCharacterPartType = typeof PLAYER_CHARACTER_PART_TYPES[number];

export const PLAYER_CHARACTER_PART_LABELS: Record<PlayerCharacterPartType, string> = {
  head: "Head",
  top: "Torso / Top",
  left_arm: "Left Arm",
  right_arm: "Right Arm",
  left_leg: "Left Leg",
  right_leg: "Right Leg",
  left_foot: "Left Foot",
  right_foot: "Right Foot",
};

export const LEGACY_PLAYER_CHARACTER_PART_TYPES = ["body", "eyes"] as const;
export type LegacyPlayerCharacterPartType = typeof LEGACY_PLAYER_CHARACTER_PART_TYPES[number];

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

const processedImageUrl = z.string().regex(/^\/api\/media\/[a-zA-Z0-9-]{1,80}$/);
export const playerCharacterPartSchema = playerCharacterTransformSchema.extend({
  partType: playerCharacterPartTypeSchema,
  imageUrl: processedImageUrl,
});
export type PlayerCharacterPart = z.infer<typeof playerCharacterPartSchema>;

export const playerCharacterLegacyPartSchema = playerCharacterTransformSchema.extend({
  partType: z.enum(LEGACY_PLAYER_CHARACTER_PART_TYPES),
  imageUrl: processedImageUrl,
});
export type LegacyPlayerCharacterPart = z.infer<typeof playerCharacterLegacyPartSchema>;
export type StoredPlayerCharacterPart = PlayerCharacterPart | LegacyPlayerCharacterPart;

/**
 * Historic 06/12 parts remain in draft JSONB. Avoid eager data deletion:
 * the old Body is a usable Torso source until admin saves a native Top;
 * old Eyes remain archived in the draft for eventual Face clothing conversion.
 * Previously published snapshots are not rewritten by this compatibility layer.
 */
export function parseStoredPlayerCharacterParts(
  value: readonly StoredPlayerCharacterPart[],
): StoredPlayerCharacterPart[] {
  const parts = z.array(z.union([playerCharacterPartSchema, playerCharacterLegacyPartSchema]))
    .max(10).parse(value);
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part.partType)) throw new Error("Duplicate player-character base part");
    seen.add(part.partType);
  }
  return parts;
}

export function resolvePlayerCharacterParts(
  stored: readonly StoredPlayerCharacterPart[],
): PlayerCharacterPart[] {
  const parts = parseStoredPlayerCharacterParts(stored);
  const modern = parts.filter((part): part is PlayerCharacterPart =>
    PLAYER_CHARACTER_PART_TYPES.some(type => type === part.partType)
  );
  const body = parts.find(part => part.partType === "body");
  if (body && !modern.some(part => part.partType === "top")) {
    modern.push(playerCharacterPartSchema.parse({ ...body, partType: "top" }));
  }
  return modern.sort((a, b) => a.zIndex - b.zIndex ||
    PLAYER_CHARACTER_PART_TYPES.indexOf(a.partType) - PLAYER_CHARACTER_PART_TYPES.indexOf(b.partType));
}

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

/**
 * One-click body save. All selected images are validated together and share
 * one revision update, so the admin never needs eight separate Save Part steps.
 * Existing untouched parts stay on the draft; no data URIs are stored in DB.
 */
export const playerCharacterBodyWriteSchema = z.object({
  expectedRevision: z.number().int().min(0),
  parts: z.array(z.object({
    partType: playerCharacterPartTypeSchema,
    imageData: playerCharacterPartWriteSchema.shape.imageData.unwrap(),
  }).strict()).min(1).max(8),
}).strict().superRefine(({ parts }, ctx) => {
  // Express's configured JSON limit is 50 MB; leave margin for encoding and
  // request overhead rather than letting a full eight-image upload hit 413.
  if (parts.reduce((sum, part) => sum + part.imageData.length, 0) > 40_000_000) {
    ctx.addIssue({ code: "custom", path: ["parts"], message: "Body images are too large together" });
  }
  const seen = new Set<PlayerCharacterPartType>();
  for (const [index, part] of parts.entries()) {
    if (seen.has(part.partType)) {
      ctx.addIssue({ code: "custom", path: ["parts", index, "partType"], message: "Duplicate avatar body part" });
    }
    seen.add(part.partType);
  }
});

export const playerCharacterRevisionSchema = z.object({
  expectedRevision: z.number().int().min(0),
}).strict();

export const DEFAULT_PLAYER_CHARACTER_TRANSFORMS: Record<PlayerCharacterPartType, PlayerCharacterTransform> = {
  left_leg:  { xPct: 42, yPct: 72, widthPct: 24, pivotXPct: 50, pivotYPct: 12, rotationDeg: 0, zIndex: 10 },
  right_leg: { xPct: 58, yPct: 72, widthPct: 24, pivotXPct: 50, pivotYPct: 12, rotationDeg: 0, zIndex: 11 },
  left_foot: { xPct: 42, yPct: 88, widthPct: 24, pivotXPct: 50, pivotYPct: 20, rotationDeg: 0, zIndex: 15 },
  right_foot:{ xPct: 58, yPct: 88, widthPct: 24, pivotXPct: 50, pivotYPct: 20, rotationDeg: 0, zIndex: 16 },
  top:       { xPct: 50, yPct: 58, widthPct: 50, pivotXPct: 50, pivotYPct: 45, rotationDeg: 0, zIndex: 30 },
  left_arm:  { xPct: 28, yPct: 48, widthPct: 21, pivotXPct: 70, pivotYPct: 12, rotationDeg: 0, zIndex: 35 },
  right_arm: { xPct: 72, yPct: 48, widthPct: 21, pivotXPct: 30, pivotYPct: 12, rotationDeg: 0, zIndex: 36 },
  head:      { xPct: 50, yPct: 29, widthPct: 42, pivotXPct: 50, pivotYPct: 50, rotationDeg: 0, zIndex: 50 },
};

export function upsertPlayerCharacterPart(
  saved: readonly StoredPlayerCharacterPart[],
  next: PlayerCharacterPart,
): StoredPlayerCharacterPart[] {
  playerCharacterPartSchema.parse(next);
  const checked = parseStoredPlayerCharacterParts(saved);
  // Preserve old Eyes and Body source artwork, including after editing Top.
  const result = [...checked.filter(part => part.partType !== next.partType), next];
  return parseStoredPlayerCharacterParts(result).sort((a, b) => a.zIndex - b.zIndex);
}

export function completePlayerCharacterParts(
  parts: readonly StoredPlayerCharacterPart[],
): boolean {
  try {
    const resolved = resolvePlayerCharacterParts(parts);
    return resolved.length === PLAYER_CHARACTER_PART_TYPES.length &&
      PLAYER_CHARACTER_PART_TYPES.every(type => resolved.some(part => part.partType === type));
  } catch {
    return false;
  }
}
