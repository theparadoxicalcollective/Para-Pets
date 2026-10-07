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
  if (!Number.isFinite(renderedSceneWidth) || renderedSceneWidth <= 0) return value;
  return {
    ...value,
    x: clampPercent(value.x + dx / renderedSceneWidth * 100),
    y: clampPercent(value.y + dy / renderedSceneWidth * 100),
  };
}

export function authoredPointToPercent(point: AuthoredScenePoint): AuthoredScenePercent {
  return {
    x: point.x / AUTHORED_SCENE_WIDTH * 100,
    y: point.y / AUTHORED_SCENE_HEIGHT * 100,
  };
}
