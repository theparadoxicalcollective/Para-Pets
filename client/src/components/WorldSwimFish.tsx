import { memo, useMemo, type CSSProperties } from "react";
import { swimAreaBounds, type WorldSwimArea, type WorldFishCatalogEntry } from "@shared/worlds/worldSwimAreas";
import { planWorldFishMotion } from "@/lib/worldFishMotion";

type Props = {
  areas?: WorldSwimArea[]; fish?: WorldFishCatalogEntry[];
  buildingId: string | null; groundLevel: number;
  width: number; height: number; scale: number;
  panX: number; panY: number; viewportWidth: number; viewportHeight: number;
};
/** Cached, decorative tracks. The existing player/editor art layer owns the camera. */
const SwimArea = memo(function SwimArea({ area, catalog, left, top, width, height, scale }: {
  area: WorldSwimArea; catalog: ReadonlyMap<string, WorldFishCatalogEntry>;
  left: number; top: number; width: number; height: number; scale: number;
}) {
  const tracks = useMemo(() => planWorldFishMotion(area.fish, catalog, width, height, scale), [area.fish, catalog, width, height, scale]);
  return <div data-world-swim-area={area.id} aria-hidden="true"
    className="pointer-events-none absolute overflow-hidden" style={{left, top, width, height, zIndex: 1}}>
    {tracks.map(track => {
      const style: Record<string, string | number> = {
        width: track.size, height: track.size, "--swim-duration": track.duration + "s",
      };
      track.points.forEach((p, i) => {
        style["--swim-x" + i] = p.x + "px";
        style["--swim-y" + i] = p.y + "px";
      });
      track.facing.forEach((facing, i) => { style["--swim-face" + i] = facing; });
      return <div key={track.id} className="world-swim-track" data-world-fish={track.id}
        data-fish-species={track.entry.id} data-fish-zone={track.entry.fishSwimZone ?? "full"}
        data-fish-rarity={track.entry.starRarity ?? 1}
        style={style as CSSProperties}>
        <img className="world-swim-sprite" src={track.entry.imageUrl!}
          alt="" draggable={false} decoding="async" />
      </div>;
    })}
  </div>;
});

export default memo(function WorldSwimFish({areas, fish, buildingId, groundLevel, width, height, scale, panX, panY, viewportWidth, viewportHeight}: Props) {
  const catalog = useMemo(() => new Map((fish ?? []).map(f => [f.id, f])), [fish]);
  return <>{areas?.filter(a => a.buildingId === buildingId && a.fish.length).map(a => {
    const b = swimAreaBounds(a, groundLevel);
    const left = b.x * width, top = b.y * height, w = b.width * width, h = b.height * height;
    // Keep the same exact viewport culling, independent of the swim clock.
    if (w <= 0 || h <= 0 || left + panX + w < -80 || top + panY + h < -80 ||
        left + panX > viewportWidth + 80 || top + panY > viewportHeight + 80) return null;
    return <SwimArea key={a.id} area={a} catalog={catalog} left={left} top={top} width={w} height={h} scale={scale} />;
  })}</>;
});
