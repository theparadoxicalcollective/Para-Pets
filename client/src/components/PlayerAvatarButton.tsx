import type { CSSProperties, ReactNode } from "react";

interface PlayerAvatarButtonProps {
  userId?: string | null;
  username: string;
  onSelectPlayer?: (userId: string) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/** A semantic, visually transparent trigger for an existing player avatar. */
export default function PlayerAvatarButton({
  userId,
  username,
  onSelectPlayer,
  children,
  className = "",
  style,
  testId,
}: PlayerAvatarButtonProps) {
  const canOpen = !!userId && !!onSelectPlayer;

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={canOpen ? `View ${username}'s profile` : undefined}
      disabled={!canOpen}
      onClick={(event) => {
        event.stopPropagation();
        if (canOpen) onSelectPlayer(userId);
      }}
      className={`m-0 inline-flex shrink-0 items-center justify-center p-0 transition-transform active:scale-95 disabled:opacity-100 ${className}`}
      style={{
        background: "none",
        border: "none",
        cursor: canOpen ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
