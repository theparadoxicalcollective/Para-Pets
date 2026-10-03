import type { CSSProperties } from "react";

export default function PetXEyes({
  x,
  y,
  size,
  rotation = 0,
  style,
}: {
  x: number;
  y: number;
  size: number;
  rotation?: number;
  style?: CSSProperties;
}) {
  return <div
    aria-hidden
    data-testid="pet-x-eyes"
    data-x-eye-rotation={rotation}
    style={{
      position: "absolute",
      left: `${x / 10}%`,
      top: `${y / 10}%`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      transformOrigin: "50% 50%",
      color: "#ff4038",
      fontFamily: "Arial Black, Arial, sans-serif",
      fontWeight: 900,
      fontSize: `${size / 10}cqw`,
      lineHeight: 0.9,
      WebkitTextStroke: "1px #b80f0b",
      textShadow: "0 1px 2px rgba(0,0,0,.88), 0 0 5px rgba(255,55,45,.52)",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 25000,
      ...style,
    }}
  >
    <style>{`@keyframes para-pet-fire-x-wiggle { 0%, 100% { transform: rotate(-4deg) scale(.96); } 50% { transform: rotate(4deg) scale(1.05); } }`}</style>
    <span style={{ display: "inline-block", animation: "para-pet-fire-x-wiggle .72s ease-in-out infinite" }}>× ×</span>
  </div>;
}
