import type { CSSProperties } from "react";

export default function HomeCapacityIndicator({
  petCount,
  petLimit,
  decorCount,
  decorLimit,
  style,
}: {
  petCount: number;
  petLimit: number;
  decorCount: number;
  decorLimit: number;
  style?: CSSProperties;
}) {
  return (
    <div
      data-testid="home-capacity-indicator"
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-3 py-1 pointer-events-none"
      style={{
        zIndex: 50,
        top: "max(56px, calc(env(safe-area-inset-top, 0px) + 48px))",
        background: "rgba(6,8,6,0.62)",
        border: "1px solid rgba(255,215,0,0.22)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        backdropFilter: "blur(5px)",
        color: "rgba(255,240,190,0.86)",
        fontFamily: "Lora, serif",
        fontSize: 9,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span>Pets {petCount}/{petLimit}</span>
      <span style={{ opacity: 0.35 }}>•</span>
      <span>Decor {decorCount}/{decorLimit}</span>
    </div>
  );
}
