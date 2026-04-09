interface RoleBadgeProps {
  isAdmin?: boolean | null;
  isModerator?: boolean | null;
  size?: "xs" | "sm";
}

export default function RoleBadge({ isAdmin, isModerator, size = "xs" }: RoleBadgeProps) {
  if (!isAdmin && !isModerator) return null;

  const fontSize = size === "sm" ? 9 : 8;
  const px = size === "sm" ? "5px 7px" : "3px 5px";

  if (isAdmin) {
    return (
      <span
        data-testid="badge-role-admin"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          background: "linear-gradient(135deg, rgba(100,70,5,0.9) 0%, rgba(60,38,3,0.9) 100%)",
          border: "1px solid rgba(240,192,64,0.6)",
          borderRadius: 4,
          padding: px,
          fontSize,
          fontFamily: "'Trebuchet MS', 'Gill Sans', system-ui, sans-serif",
          fontWeight: 700,
          color: "#f0c040",
          letterSpacing: "0.08em",
          lineHeight: 1,
          whiteSpace: "nowrap",
          flexShrink: 0,
          boxShadow: "0 0 6px rgba(240,192,64,0.2)",
        }}
      >
        ★ Admin
      </span>
    );
  }

  return (
    <span
      data-testid="badge-role-mod"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        background: "linear-gradient(135deg, rgba(8,55,50,0.9) 0%, rgba(5,35,32,0.9) 100%)",
        border: "1px solid rgba(127,255,212,0.5)",
        borderRadius: 4,
        padding: px,
        fontSize,
        fontFamily: "'Trebuchet MS', 'Gill Sans', system-ui, sans-serif",
        fontWeight: 700,
        color: "#7fffd4",
        letterSpacing: "0.08em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
        boxShadow: "0 0 6px rgba(127,255,212,0.15)",
      }}
    >
      ◆ Mod
    </span>
  );
}
