const QUILL_URL = "/exclaim-quill-sm.png";

interface QuillBadgeProps {
  size?: number;
  glow?: string;
  animate?: boolean;
  style?: React.CSSProperties;
  className?: string;
  [key: string]: unknown;
}

export function QuillBadge({ size = 22, glow = "#4ade80", animate = false, style, className }: QuillBadgeProps) {
  return (
    <img
      src={QUILL_URL}
      alt="!"
      className={className}
      style={{
        width: size,
        height: size * 2.4,
        objectFit: "contain",
        filter: `drop-shadow(0 0 5px ${glow}) drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 2px rgba(0,0,0,0.9))`,
        pointerEvents: "none",
        animation: animate ? "pulse-notif 1.8s ease-in-out infinite" : undefined,
        ...style,
      }}
    />
  );
}
