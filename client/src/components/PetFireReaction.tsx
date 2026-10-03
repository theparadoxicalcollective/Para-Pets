import type { CSSProperties } from "react";
import PetXEyesOverlay from "@/components/PetXEyesOverlay";
import type { PetXEyesPlacement } from "@shared/activePetPlacement";

const PET_FIRE_REACTION_STYLES = `
@keyframes para-pet-fire-smoke {
  0% { transform: translate3d(0, 4px, 0) scale(0.55); opacity: 0; }
  18% { opacity: 0.42; }
  65% { opacity: 0.28; }
  100% { transform: translate3d(var(--smoke-x, 8px), -34px, 0) scale(1.18); opacity: 0; }
}
`;

export default function PetFireReaction({
  xEyes = { x: 500, y: 390, scale: 100 },
}: {
  xEyes?: PetXEyesPlacement;
}) {
  const smoke = [
    { left: "43%", delay: "2.2s", x: "-8px", size: 10 },
    { left: "54%", delay: "2.65s", x: "9px", size: 13 },
    { left: "49%", delay: "3.05s", x: "3px", size: 9 },
  ];

  return (
    <div
      aria-hidden
      data-testid="pet-fire-reaction"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 14,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <style>{PET_FIRE_REACTION_STYLES}</style>
      <PetXEyesOverlay x={xEyes.x} y={xEyes.y} scale={xEyes.scale} animated />

      {smoke.map((puff, index) => (
        <span
          key={index}
          style={{
            position: "absolute",
            left: puff.left,
            top: "12%",
            width: puff.size,
            height: puff.size,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(215,215,215,0.58), rgba(135,135,135,0.3) 56%, transparent 74%)",
            filter: "blur(1px)",
            opacity: 0,
            "--smoke-x": puff.x,
            animation: `para-pet-fire-smoke 2.1s ease-out ${puff.delay} infinite`,
          } as CSSProperties & { "--smoke-x": string }}
        />
      ))}
    </div>
  );
}
