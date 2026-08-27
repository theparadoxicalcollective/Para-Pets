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
 * Both pages already have the canonical idle PetAnimator as their fallback.
 * When template data is available, suppress the legacy flattened pet image so
 * those existing renderers are actually used. Pets without a template keep the
 * current still-image fallback, so older/partial inventory records remain safe.
 */
export default function PetPowerUpModal(props: PetUpgradeModalProps) {
  const isLevelUp = props.title?.trim().toUpperCase() === "LEVEL UP";
  const displayProps = props.petTemplateId ? { ...props, petImage: null } : props;
  return isLevelUp ? <PetLevelUpPage {...displayProps} /> : <PetPowerUpPage {...displayProps} />;
}
