import { scenePointToPlacement } from "./stage";

export const AUTHORED_SCENE_WIDTH = 1000;
export const AUTHORED_SCENE_HEIGHT = 1000;

export type AuthoredScenePoint = Readonly<{ x: number; y: number }>;
export type AuthoredScenePercent = Readonly<{ x: number; y: number }>;

const clampPercent = (value: number) => Math.max(-100, Math.min(100, value));

/**
 * Convert a pointer delta from the rendered square scene back into the stable
 * authored coordinate space. This must not depend on the physical device size.
 */
export function dragAuthoredPercentOffset<T extends { x: number; y: number }>(
  value: T,
  dx: number,
  dy: number,
  renderedSceneWidth: number,
): T {
  const delta = scenePointToPlacement(
    { x: dx, y: dy },
    { width: renderedSceneWidth, height: renderedSceneWidth },
  );
  if (!delta) return value;
  return {
    ...value,
    x: clampPercent(value.x + delta.x * 100),
    y: clampPercent(value.y + delta.y * 100),
  };
}

export function authoredPointToPercent(point: AuthoredScenePoint): AuthoredScenePercent {
  const placement = scenePointToPlacement(point, { width: AUTHORED_SCENE_WIDTH, height: AUTHORED_SCENE_HEIGHT });
  return { x: (placement?.x ?? 0) * 100, y: (placement?.y ?? 0) * 100 };
}
