const PARTICLE_COUNT = 6;
const CLEANUP_DELAY_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Adds a short, pointer-positioned magical burst without causing a React render.
 * The particles are deliberately CSS-only and self-remove after the animation.
 */
export function showClickSparkles(clientX: number, clientY: number): void {
  if (prefersReducedMotion() || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

  const burst = document.createElement("span");
  burst.className = "game-click-sparkles";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${clientX}px`;
  burst.style.top = `${clientY}px`;

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / PARTICLE_COUNT - Math.PI / 2;
    const distance = index % 2 === 0 ? 25 : 19;
    const particle = document.createElement("i");
    particle.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
    particle.style.setProperty("--spark-delay", `${index * 18}ms`);
    burst.appendChild(particle);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), CLEANUP_DELAY_MS);
}
