const ORB_COLORS = ["#ffd700", "#fbbf24", "#f59e0b", "#fde68a", "#fff3a0", "#ffe066"];

export function burstGoldenOrbs(x: number, y: number, count = 12) {
  for (let i = 0; i < count; i++) {
    const orb = document.createElement("div");
    const size = 4 + Math.random() * 6;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const distance = 28 + Math.random() * 48;
    const color = ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)];
    const duration = 550 + Math.random() * 500;
    const delay = Math.random() * 80;

    orb.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #fff9c4, ${color});
      box-shadow: 0 0 ${size + 3}px 1px ${color}, 0 0 ${size * 2 + 4}px 2px rgba(255,215,0,0.45);
      pointer-events: none;
      z-index: 9999999;
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
      will-change: transform, opacity;
    `;

    document.body.appendChild(orb);

    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    setTimeout(() => {
      orb.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.4, 1), opacity ${duration * 0.8}ms ease-in ${duration * 0.2}ms`;
      orb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.15)`;
      orb.style.opacity = "0";
    }, delay);

    setTimeout(() => orb.remove(), delay + duration + 50);
  }
}
