import { usesDeviceGameplaySurface } from "./stage";

/**
 * Pause player gameplay on desktop browsers without changing responsive stage
 * geometry. Touch-first detection alone misses iPads with a trackpad and
 * Android tablets with a mouse, so recognize those as portable devices too.
 */
export type DesktopNoticeDevice = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  touchFirst: boolean;
};

export function shouldShowDesktopComingSoon(pathname: string, device: DesktopNoticeDevice): boolean {
  // Keep admin tools and informational/account-recovery routes accessible on PC.
  // Pet Park owns its viewport separately but is still player gameplay.
  // Gate it here without changing its camera or stage geometry.
  if (!usesDeviceGameplaySurface(pathname) && pathname !== "/hub" && pathname !== "/pet-park") return false;
  if (device.touchFirst) return false;

  if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(device.userAgent)) return false;
  // Modern iPadOS Safari can identify itself as a desktop Mac.
  if (device.platform === "MacIntel" && device.maxTouchPoints > 1) return false;

  // No viewport-width test: resizing a desktop window must not bypass notice.
  return true;
}
