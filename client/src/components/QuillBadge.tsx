const QUILL_URL = "/exclaim-quill-sm.png";

interface QuillBadgeProps {
  size?: number;
  glow?: string;
  style?: React.CSSProperties;
  className?: string;
  [key: string]: unknown;
}

export function QuillBadge({ size = 22, glow = "#4ade80", style, className }: QuillBadgeProps) {
  const isPositioned = style?.position === "absolute" || style?.position === "fixed";
  return (
    <span
      className={className}
      style={{
        position: style?.position,
        top: style?.top,
        zIndex: style?.zIndex,
        pointerEvents: "none",
        display: "inline-block",
        ...(isPositioned ? { left: "50%", transform: "translateX(-50%)" } : {}),
      }}
    >
      <img
        src={QUILL_URL}
        alt="!"
        style={{
          width: size,
          height: size * 2.4,
          objectFit: "contain",
          filter: `drop-shadow(0 0 5px ${glow}) drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 2px rgba(0,0,0,0.9))`,
          display: "block",
          animation: "quill-bounce 1.6s ease-in-out infinite",
        }}
      />
    </span>
  );
}
