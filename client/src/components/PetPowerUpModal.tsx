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
 *
 * Power Up deliberately prefers the layered idle renderer when template data
 * exists. Level Up keeps the already-available flattened pet image because its
 * drag interaction re-renders frequently and the layered renderer made that
 * page unstable on mobile. Legacy pets still retain each page's fallback.
 */
export default function PetPowerUpModal(props: PetUpgradeModalProps) {
  const isLevelUp = props.title?.trim().toUpperCase() === "LEVEL UP";
  if (isLevelUp) return <PetLevelUpPage {...props} />;

  const powerUpProps = props.petTemplateId ? { ...props, petImage: null } : props;
  return <PetPowerUpPage {...powerUpProps} />;
}
