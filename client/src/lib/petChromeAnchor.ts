/** Shared authored-scene displacement for pet-adjacent chrome. */
export function petChromeAnchorOffset(
  anchor: Readonly<{ x: number; y: number }>,
  renderedSceneWidth: number,
): { x: number; y: number } {
  const extent = Number.isFinite(renderedSceneWidth) && renderedSceneWidth > 0 ? renderedSceneWidth : 0;
  return { x: anchor.x * extent / 100, y: anchor.y * extent / 100 };
}
