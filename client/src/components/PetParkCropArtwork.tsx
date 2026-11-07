import { useState } from "react";
import { FULL_BOUNDS, getAlphaBounds, getAlphaBoundsSync, type AlphaBounds } from "@/lib/alphaBounds";
import { DEFAULT_GARDEN_STAGE_PLACEMENT, type GardenStagePlacement } from "@shared/garden";

/** Plot-rooted crop sprite. The visible pixels, rather than transparent PNG
 * margins, determine horizontal center and bottom anchor. All coordinates
 * remain in the already transformed Pet Park world (no separate stage). */
export default function PetParkCropArtwork({
  image, xPct, yPct, size, scale, zIndex, progress, placement,
}: {
  image: string; xPct: number; yPct: number; size: number; scale: number;
  zIndex: number; progress: { value: number; required: number } | null;
  placement?: GardenStagePlacement;
}) {
  const [bounds, setBounds] = useState<AlphaBounds>(() => getAlphaBoundsSync(image) ?? FULL_BOUNDS);
  const [aspect, setAspect] = useState(1);
  const position = placement ?? DEFAULT_GARDEN_STAGE_PLACEMENT;
  const plotWidth = size * scale;
  const width = plotWidth * position.scale;
  const visibleHeight = bounds.height * width * aspect;
  const percent = progress ? Math.min(100, Math.round(progress.value / progress.required * 100)) : 0;
  return <div data-testid="pet-park-garden-crop"
    className="pointer-events-none absolute" style={{
      left: `calc(${xPct * 100}% + ${position.x * plotWidth}px)`,
      top: `calc(${yPct * 100}% + ${position.y * plotWidth}px)`, zIndex,
    }}>
    <img data-testid="pet-park-garden-visible-art" src={image} alt="" draggable={false}
      className="pointer-events-none absolute block max-w-none select-none"
      style={{
        left: 0, top: 0, width, height: "auto",
        // Root the visible shape at the diamond center. The transform
        // respects the image's own aspect ratio and scanned transparency.
        transform: `translate(-${(bounds.left + bounds.width / 2) * 100}%, -${(bounds.top + bounds.height) * 100}%)`,
      }}
      onLoad={event => {
        const element = event.currentTarget;
        if (element.naturalWidth && element.naturalHeight)
          setAspect(old => {
            const next = element.naturalHeight / element.naturalWidth;
            return Math.abs(old - next) < .0001 ? old : next;
          });
        void getAlphaBounds(image, element).then(next => setBounds(old =>
          old.left === next.left && old.top === next.top &&
          old.width === next.width && old.height === next.height ? old : next));
      }} />
    {progress && <div data-testid="pet-park-garden-growth-progress"
      className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-lg border border-[#d7b879]/75 bg-[#102d20]/95 px-2 py-1 text-[#f5dea5] shadow-md"
      style={{ left: 0, bottom: Math.max(16, visibleHeight + 9), width: Math.max(82, Math.min(115, width * .8)) }}>
      <span className="whitespace-nowrap text-[9px] font-semibold">Water {progress.value} / {progress.required}</span>
      <div role="progressbar" aria-label="Water to next growth stage"
        aria-valuemin={0} aria-valuenow={progress.value} aria-valuemax={progress.required}
        className="h-[6px] w-full overflow-hidden rounded-full bg-[#345144]">
        <div className="h-full rounded-full bg-[#80c3bd] transition-[width] duration-300 ease-out"
          style={{ width: percent + "%" }} />
      </div>
    </div>}
  </div>;
}
