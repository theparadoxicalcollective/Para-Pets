type ArtworkPart = { view: string; imageUrl: string; width: number; height: number };

/** Prefer the evolution as a whole; do not mix base limbs into an evolved pet. */
export function resolvePetArtwork<T extends ArtworkPart>(base: T[], evolution: T[], facing: string) {
  const usableEvolution = evolution.filter(p => p.imageUrl && p.width > 0 && p.height > 0 && (p.view === "front" || p.view === "back"));
  if (!usableEvolution.length) return { parts: base, facing, form: "base" as const };
  return {
    parts: usableEvolution,
    facing: usableEvolution.some(p => p.view === facing) ? facing : usableEvolution[0].view,
    form: "evolution" as const,
  };
}
