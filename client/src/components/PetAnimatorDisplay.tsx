import PetAnimator, { type PetAnimatorProps } from "./PetAnimator";

export type { PetAnimatorProps } from "./PetAnimator";

/**
 * Shared presentation policy for PetAnimator call sites.
 *
 * Most callers keep their requested animation mode exactly as-is. Pet House
 * placements are the one intentional exception: those call sites already use
 * the `pet-idle-squish` marker while the pet is resting and remove it while
 * the pet is being dragged. Resting house pets can therefore use the existing
 * lightweight `house` part animation without changing the large Pet House
 * interaction/dragging implementation.
 *
 * While a pet is being dragged the marker disappears, so the renderer falls
 * back to the caller's original static mode. That keeps placement gestures as
 * cheap and stable as they are today.
 */
export default function PetAnimatorDisplay(props: PetAnimatorProps) {
  const housePlacement =
    props.mode === "static" &&
    props.fillContainer === true &&
    props.className?.split(/\s+/).includes("pet-idle-squish") === true;

  if (!housePlacement) return <PetAnimator {...props} />;

  const className = props.className
    ?.split(/\s+/)
    .filter((name) => name && name !== "pet-idle-squish")
    .join(" ");

  return (
    <PetAnimator
      {...props}
      mode="house"
      className={className || undefined}
    />
  );
}
