import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";

/** World decoration effects are positioned in image-local coordinates.
 * The entire wrapper mirrors with the artwork, so the same saved anchors
 * work for flipped and nonflipped copies without a second placement system.
 */
export default function WorldDecorEffects({
  effects, sunlightStrength, reducedMotion,
}: {
  effects: readonly ParkDecorEffect[];
  sunlightStrength: number;
  reducedMotion: boolean;
}) {
  const sunlight = Math.max(0, Math.min(1, sunlightStrength));
  if (!effects.length) return null;
  return <div data-testid="world-editor-attached-decor-effects"
    aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2]">
    {effects.map(effect => <div key={effect.id}
      data-testid={`world-editor-decor-effect-${effect.id}`}
      className="pointer-events-none absolute"
      style={{
        left: `${effect.x * 100}%`, top: `${effect.y * 100}%`,
        width: `${effect.size}%`, aspectRatio: "1",
        transform: "translate(-50%, -50%)",
        opacity: effect.type === "warm_glow" ? sunlight : 1,
        transition: effect.type === "warm_glow" ? "opacity 1200ms linear" : undefined,
      }}>
      <ParkEffectVisual type={effect.type} reducedMotion={reducedMotion} />
    </div>)}
  </div>;
}
