import { memo, useMemo, type CSSProperties } from "react";
import { swimAreaBounds, type WorldSwimArea, type WorldFishCatalogEntry } from "@shared/worlds/worldSwimAreas";

type Props = {
  areas?: WorldSwimArea[]; fish?: WorldFishCatalogEntry[];
  buildingId: string | null; groundLevel: number;
  width: number; height: number; scale: number;
  panX: number; panY: number; viewportWidth: number; viewportHeight: number;
};
/** Decorative fish only. The existing player/editor art layer owns the camera. */
export default memo(function WorldSwimFish({areas, fish, buildingId, groundLevel, width, height, scale, panX, panY, viewportWidth, viewportHeight}: Props) {
  const catalog = useMemo(() => new Map((fish ?? []).map(f => [f.id, f])), [fish]);
  return <>{areas?.filter(a => a.buildingId === buildingId && a.fish.length).map(a => {
    const b = swimAreaBounds(a, groundLevel);
    const left = b.x * width, top = b.y * height, w = b.width * width, h = b.height * height;
    // Avoid mounting fish in distant parts of large maps or other rooms.
    if (w <= 0 || h <= 0 || left + panX + w < -80 || top + panY + h < -80 ||
        left + panX > viewportWidth + 80 || top + panY > viewportHeight + 80) return null;
    const size = Math.min(w * .28, h * .45, 100 * scale);
    const travel = w - size;
    const wobble = Math.min(h * .07, size * .15);
    return <div key={a.id} data-world-swim-area={a.id} aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden" style={{left, top, width: w, height: h, zIndex: 1}}>
      {a.fish.map((f, i) => {
        const entry = catalog.get(f.fishId);
        if (!entry?.imageUrl) return null;
        const duration = 9 + i % 6;
        const y = Math.max(wobble, Math.min(h - size - wobble, f.y * h - size / 2));
        const x = Math.max(0, Math.min(travel, f.x * w - size / 2));
        // Negative delay starts near the admin's drop location. Flip at the two
        // ends of the track, rather than advancing position in React every frame.
        const phase = travel > 0 ? x / travel : 0;
        return <div key={f.id} className="world-swim-track" data-world-fish={f.id}
          style={{top: y, width: size, height: size, "--swim-travel": `${travel}px`,
            "--swim-start": `${x}px`, "--swim-duration": `${duration}s`,
            "--swim-delay": `-${phase * duration / 2}s`, "--swim-wobble": `${wobble}px`,
            "--swim-facing": entry.facingDirection === "left" ? -1 : 1} as CSSProperties}>
          <div className="world-swim-bob"><img className="world-swim-sprite" src={entry.imageUrl}
            alt="" draggable={false} decoding="async" /></div>
        </div>;
      })}
    </div>;
  })}</>;
});
