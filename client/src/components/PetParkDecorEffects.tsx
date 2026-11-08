import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";
import { parkOutdoorEffectOpacity } from "@/lib/parkSceneLighting";

/** Attached decoration effects are positioned in image-local coordinates.
 * The entire wrapper mirrors with the artwork, so the same saved anchors
 * work for flipped and nonflipped copies without a second placement system.
 */
export default function PetParkDecorEffects({
  effects, sunlightStrength, nightStrength = 1 - sunlightStrength, fireflyStrength = 0, reducedMotion,
}: {
  effects: readonly ParkDecorEffect[];
  sunlightStrength: number;
  nightStrength?: number;
  fireflyStrength?: number;
  reducedMotion: boolean;
}) {

  if (!effects.length) return null;
  return <div data-testid="pet-park-attached-decor-effects"
    aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2]">
    {effects.map(effect => <div key={effect.id}
      data-testid={`pet-park-decor-effect-${effect.id}`}
      className="pointer-events-none absolute"
      style={{
        left: `${effect.x * 100}%`, top: `${effect.y * 100}%`,
        width: `${effect.size}%`, aspectRatio: "1",
        transform: "translate(-50%, -50%)",
        opacity: parkOutdoorEffectOpacity(effect.type, nightStrength, fireflyStrength),
        transition: "opacity 1200ms linear",
      }}>
      <ParkEffectVisual type={effect.type} color={effect.color} reducedMotion={reducedMotion} fireflyStrength={fireflyStrength} />
    </div>)}
  </div>;
}
