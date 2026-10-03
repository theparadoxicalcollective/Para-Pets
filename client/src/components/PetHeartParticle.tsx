import type { CSSProperties } from "react";

export interface PetHeartParticleProps {
  id: string | number;
  left: number | string;
  top: number | string;
  size: number;
  dx: number;
  delay?: number;
  position?: "fixed" | "absolute";
  zIndex?: number;
  style?: CSSProperties;
}

/**
 * Shared floating-heart particle used by Pet Care petting and Pet Home visits.
 * Keeping this in one component prevents the two interactions from drifting
 * into different heart artwork or animation timing.
 */
export default function PetHeartParticle({
  id,
  left,
  top,
  size,
  dx,
  delay = 0,
  position = "fixed",
  zIndex = 514,
  style,
}: PetHeartParticleProps) {
  const gradientId = `pet-heart-${String(id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div
      className="pointer-events-none feed-heart-rise"
      data-testid="pet-heart-particle"
      style={{
        position,
        left,
        top,
        width: size,
        height: size,
        ["--dx" as any]: `${dx}px`,
        animationDelay: `${delay}s`,
        zIndex,
        color: "#ff5d6c",
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffb3bb" />
            <stop offset="55%" stopColor="#ff5d6c" />
            <stop offset="100%" stopColor="#a8112a" />
          </radialGradient>
        </defs>
        <path
          d="M12 21s-7.5-4.6-9.6-9.4C1.1 8.4 3 5 6.3 5c1.9 0 3.6 1 4.7 2.6C12.1 6 13.8 5 15.7 5 19 5 20.9 8.4 19.6 11.6 17.5 16.4 12 21 12 21z"
          fill={`url(#${gradientId})`}
          stroke="#7a0a1c"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
