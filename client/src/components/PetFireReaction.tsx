import type { CSSProperties } from "react";

const PET_FIRE_REACTION_STYLES = `
@keyframes para-pet-fire-smoke {
  0% { transform: translate3d(0, 4px, 0) scale(0.55); opacity: 0; }
  18% { opacity: 0.42; }
  65% { opacity: 0.28; }
  100% { transform: translate3d(var(--smoke-x, 8px), -34px, 0) scale(1.18); opacity: 0; }
}
@keyframes para-pet-fire-x-wiggle {
  0%, 100% { transform: rotate(-4deg) scale(0.96); }
  50% { transform: rotate(4deg) scale(1.05); }
}
`;

export default function PetFireReaction() {
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

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "39%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          gap: 5,
          color: "#ff4038",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontWeight: 900,
          fontSize: 20,
          lineHeight: 0.9,
          WebkitTextStroke: "1.2px #b80f0b",
          textShadow: "0 1px 2px rgba(0,0,0,0.88), 0 0 5px rgba(255,55,45,0.52)",
          animation: "para-pet-fire-x-wiggle 0.72s ease-in-out infinite",
        }}
      >
        <span>×</span>
        <span>×</span>
      </div>

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
