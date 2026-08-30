import type { StageLayout } from "./stage";

export const DESKTOP_COMPANION_MIN_WIDTH = 1180;
export const DESKTOP_COMPANION_GAP = 24;
export const DESKTOP_COMPANION_MARGIN = 16;
export const DESKTOP_COMPANION_URL = "/hub?desktopCompanion=1";

export type DesktopCompanionEnvironment = {
  width: number;
  userAgent: string;
  maxTouchPoints: number;
  desktopPointer: boolean;
};

export function isDesktopCompanionEnvironment(
  environment: DesktopCompanionEnvironment,
): boolean {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(environment.userAgent);
  const iPadUsingDesktopUserAgent =
    /Macintosh/i.test(environment.userAgent) && environment.maxTouchPoints > 1;

  return environment.width >= DESKTOP_COMPANION_MIN_WIDTH
    && environment.desktopPointer
    && !mobileUserAgent
    && !iPadUsingDesktopUserAgent;
}

export function isDesktopCompanionRuntime(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return isDesktopCompanionEnvironment({
    width: window.innerWidth,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    desktopPointer: window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true,
  });
}

export function isEmbeddedDesktopCompanion(search?: string): boolean {
  const query = search ?? (typeof window === "undefined" ? "" : window.location.search);
  return new URLSearchParams(query).get("desktopCompanion") === "1";
}

export function shouldShowDesktopCompanionForPath(location: string): boolean {
  const pathname = location.split("?")[0];
  return !(
    pathname === "/hub"
    || pathname === "/auth"
    || pathname === "/privacy"
    || pathname === "/admin"
    || pathname.startsWith("/reset-password/")
  );
}

export function getDesktopCompanionPlacement(
  layout: StageLayout,
  gap = DESKTOP_COMPANION_GAP,
  margin = DESKTOP_COMPANION_MARGIN,
): { left: number; top: number } | null {
  const left = layout.left - layout.renderedWidth - gap;
  if (left < margin) return null;
  return { left, top: layout.top };
}
