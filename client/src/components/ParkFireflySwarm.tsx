import { useId } from "react";

/** One set of trajectories is used for both moving visible orbs and the
 * corresponding holes in the OUTDOOR darkness mask. Distances are percentages
 * of each swarm's own square footprint. SVG animation requires no JS timers.
 */
export const PARK_FIREFLY_PARTICLES = [
  { x: 13, y: 36, path: 0, duration: 7.3, delay: -1.2 },
  { x: 31, y: 18, path: 1, duration: 9.2, delay: -4.7 },
  { x: 50, y: 41, path: 2, duration: 6.8, delay: -3.4 },
  { x: 76, y: 20, path: 3, duration: 8.5, delay: -5.8 },
  { x: 86, y: 64, path: 0, duration: 9.8, delay: -2.9 },
  { x: 61, y: 78, path: 1, duration: 7.7, delay: -6.2 },
  { x: 26, y: 69, path: 2, duration: 9.5, delay: -1.8 },
  { x: 45, y: 91, path: 3, duration: 8.3, delay: -4.1 },
  { x: 69, y: 49, path: 0, duration: 10.1, delay: -7 },
] as const;
const FIREFLY_PATHS = [
  "0 0;6 -5;2 3;-4 7;0 0",
  "0 0;-7 -2;-3 -8;5 1;0 0",
  "0 0;5 4;-5 6;-6 -3;0 0",
  "0 0;-2 7;6 2;2 -6;0 0",
] as const;

/** Rendered in the same SVG (once for the luminance mask and once above it).
 * Nested translations preserve the particle's author-defined center.
 */
export function ParkFireflyParticles({ mode, gradientId, reducedMotion = false }: {
  mode: "mask" | "visible";
  gradientId: string;
  reducedMotion?: boolean;
}) {
  return <>{PARK_FIREFLY_PARTICLES.map((particle, index) =>
    <g key={index} transform={`translate(${particle.x} ${particle.y})`}>
      <g>
        {!reducedMotion && <animateTransform attributeName="transform" type="translate"
          values={FIREFLY_PATHS[particle.path]}
          keyTimes="0;0.25;0.5;0.75;1"
          dur={`${particle.duration}s`} begin={`${particle.delay}s`}
          repeatCount="indefinite" calcMode="linear" />}
        {mode === "mask"
          ? <circle data-testid="park-firefly-light-cutout" cx={0} cy={0} r={5.5}
              fill={`url(#${gradientId})`} style={{ mixBlendMode: "darken" }}/>
          : <>
            <circle r={3.5} fill={`url(#${gradientId})`}/>
            <circle r={1.05} fill="#fff4a3" opacity={0.82}/>
            <circle r={0.63} fill="#fffbd9"/>
          </>}
      </g>
    </g>)}</>;
}

/** Static/animated preview for effect editors. Live scenes render fireflies
 * once above their own moving illumination, so their centers stay aligned.
 */
export function ParkFireflyPreview({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const gradientId = "park-firefly-preview-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return <svg aria-hidden="true" data-testid="park-fireflies" viewBox="0 0 100 100"
    className="h-full w-full overflow-visible pointer-events-none">
    <defs>
      <radialGradient id={gradientId}>
        <stop offset="0%" stopColor="#fff2ad" stopOpacity={0.5}/>
        <stop offset="48%" stopColor="#ffe18c" stopOpacity={0.18}/>
        <stop offset="100%" stopColor="#fcd87d" stopOpacity={0}/>
      </radialGradient>
    </defs>
    <ParkFireflyParticles mode="visible" gradientId={gradientId} reducedMotion={reducedMotion}/>
  </svg>;
}
