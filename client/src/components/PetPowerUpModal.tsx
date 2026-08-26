import PetPowerUpPage from "@/components/PetPowerUpPage";
import PetLevelUpPage from "@/components/PetLevelUpPage";
import type { PetUpgradeModalProps } from "@/components/powerup/PowerUpModalTypes";

export type { PowerUpItem } from "@/components/powerup/PowerUpModalTypes";

/**
 * Compatibility entry point used by the existing HomePage call sites.
 *
 * Power Up and Level Up deliberately live in separate components so changes to
 * the PUP artwork/layout cannot leak into the Level Up page. This adapter only
 * chooses which independent page to mount.
 */
export default function PetPowerUpModal(props: PetUpgradeModalProps) {
  const isLevelUp = props.title?.trim().toUpperCase() === "LEVEL UP";
  return isLevelUp ? <PetLevelUpPage {...props} /> : <PetPowerUpPage {...props} />;
}
