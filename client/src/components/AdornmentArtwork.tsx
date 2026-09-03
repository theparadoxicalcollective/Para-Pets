import type { CostumePlacement } from "@shared/costumeFeature";
import { adornmentMotion, normalizeAdornmentAnimation } from "@shared/adornmentAnimation";

/** Shared by the fitting preview and player renderer; placement owns its pivot. */
export default function AdornmentArtwork({ src, placement, animated = true }: {
  src: string; placement: CostumePlacement; animated?: boolean;
}) {
  const profile = placement.anchorPart === "independent" ? normalizeAdornmentAnimation(placement.animation) : "none";
  const origin = `${placement.pivotX}% ${placement.pivotY}%`;
  return <>{(profile === "wings" ? [false, true] : [false]).map(mirrored => (
    <div key={String(mirrored)} data-adornment-mirrored={mirrored}
      style={{ position: "absolute", inset: 0, transform: mirrored ? "scaleX(-1)" : undefined, transformOrigin: origin, pointerEvents: "none" }}>
      <div className="adornment-motion" style={{ position: "absolute", inset: 0, transformOrigin: origin, animation: adornmentMotion(profile, placement.animationSpeed, animated) }}>
        {/* Counter-reflect custom artwork about its center: keep the partner's
            mirrored position/motion without reversing the uploaded drawing. */}
        <img src={mirrored ? placement.mirroredWingImageUrl || src : src} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none",
            transform: mirrored && placement.mirroredWingImageUrl ? "scaleX(-1)" : undefined,
            transformOrigin: "50% 50%" }} />
      </div>
    </div>
  ))}</>;
}
