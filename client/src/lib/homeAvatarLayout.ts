import type { ArtworkPoint, BackdropRect } from "./artworkCoverGeometry";

/**
 * Home's actual artwork-platform anchor, shared by the avatar and its
 * elevation stars/name/XP display. Never derive either from a fixed phone stage.
 */
export function homeAvatarPosition(landmark: ArtworkPoint | null, backdrop: BackdropRect) {
  const groundedY = landmark && backdrop.height > 0
    ? landmark.y - backdrop.top
    : null;
  const bottomLimit = backdrop.height > 0 ? backdrop.height - 228 : null;
  const standingY = groundedY != null && bottomLimit != null
    ? Math.max(195, Math.min(groundedY, bottomLimit))
    : null;
  const x = landmark && backdrop.width > 0 ? landmark.x - backdrop.left : null;
  return { x, standingY };
}
