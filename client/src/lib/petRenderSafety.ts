import type { RuntimeMode } from "@/lib/runtimeMode";

export type RenderablePetPart = {
  id: string;
  templateId: string;
  partType: string;
  view: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
  pivotX: number;
  pivotY: number;
  rotation: number;
};

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Pet data is admin-authored and older rows can be incomplete. Never let one
 * malformed layer take down every surface that renders the same owned pet.
 */
export function normalizePetParts(value: unknown): RenderablePetPart[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    const part = record(candidate);
    if (!part) return [];

    const id = typeof part.id === "string" ? part.id : "";
    const partType = typeof part.partType === "string" ? part.partType.trim() : "";
    const view = typeof part.view === "string" ? part.view : "";
    const imageUrl = typeof part.imageUrl === "string" ? part.imageUrl.trim() : "";
    const width = positiveNumber(part.width);
    const height = positiveNumber(part.height);
    if (!id || !partType || !view || !imageUrl || width === null || height === null) return [];

    return [{
      id,
      templateId: typeof part.templateId === "string" ? part.templateId : "",
      partType,
      view,
      imageUrl,
      posX: finiteNumber(part.posX, 0),
      posY: finiteNumber(part.posY, 0),
      width,
      height,
      zIndex: finiteNumber(part.zIndex, 0),
      pivotX: finiteNumber(part.pivotX, 50),
      pivotY: finiteNumber(part.pivotY, 50),
      rotation: finiteNumber(part.rotation, 0),
    }];
  });
}

export function shouldUseLowMemoryPetRenderer(runtime: RuntimeMode): boolean {
  return runtime.displayMode === "ios-browser"
    || runtime.displayMode === "ios-embedded"
    || runtime.displayMode === "ios-standalone";
}
