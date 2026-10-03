import { z } from "zod";

export const petPresentationSchema = z.object({
  x: z.number().finite().min(-100).max(100).default(0),
  y: z.number().finite().min(-100).max(100).default(0),
  scale: z.number().finite().min(0.2).max(3).default(1),
  eyes: z.record(z.object({
    x: z.number().finite().min(-1000).max(2000),
    y: z.number().finite().min(-1000).max(2000),
    size: z.number().finite().min(10).max(400),
  })).default({}),
});
export type PetPresentation = z.infer<typeof petPresentationSchema>;
export const DEFAULT_PET_PRESENTATION: PetPresentation = { x: 0, y: 0, scale: 1, eyes: {} };
export interface PresentationPart { partType: string; posX: number; posY: number; width: number; height: number }
export function defaultXEyes(head: PresentationPart, parts: readonly PresentationPart[]) {
  const prefix = head.partType.replace(/head$/, "");
  const eyes = parts.find(p => p.partType === `${prefix}eyes`) ?? parts.find(p => p.partType === `${prefix}eyes_closed`);
  const anchor = eyes ?? head;
  return { x: anchor.posX + anchor.width / 2, y: anchor.posY + anchor.height * (eyes ? 0.5 : 0.45), size: Math.max(10, Math.min(400, anchor.width * (eyes ? 0.3 : 0.12))) };
}
export function parsePetPresentation(raw: unknown): PetPresentation {
  const result = petPresentationSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_PET_PRESENTATION;
}
