import { WIDE_BREAKPOINT } from "./stage";

export type DisplayMode =
  | "ios-standalone"
  | "ios-browser"
  | "ios-embedded"
  | "android-standalone"
  | "android-browser"
  | "mobile-browser"
  | "desktop";

export type RuntimeMode = {
  displayMode: DisplayMode;
  isStandalone: boolean;
  /** Rendering safety follows device capabilities, separately from viewport layout. */
  mobileDevice?: boolean;
  browserClassification: string;
};

type RuntimeNavigator = Pick<Navigator, "userAgent"> & { standalone?: boolean; maxTouchPoints?: number };
type RuntimeEnvironment = {
  viewportWidth?: number;
  standalone?: boolean;
  coarsePointer?: boolean;
  canHover?: boolean;
};

/**
 * Browser identity is used only for hosting-mode compatibility and diagnostics.
 * Layout remains viewport-owned: an Android tablet must never become a phone
 * merely because its user agent contains "Android".
 */
export function detectRuntimeMode(
  nav: RuntimeNavigator = navigator,
  environment: RuntimeEnvironment = {},
): RuntimeMode {
  const ua = nav.userAgent || "";
  const match = (query: string) => typeof window !== "undefined" && window.matchMedia?.(query).matches === true;
  const viewportWidth = environment.viewportWidth
    ?? (typeof window !== "undefined" ? (window.visualViewport?.width ?? window.innerWidth) : WIDE_BREAKPOINT);
  const standalone = environment.standalone ?? (!!nav.standalone || match("(display-mode: standalone)"));
  const coarsePointer = environment.coarsePointer ?? match("(pointer: coarse)");
  const canHover = environment.canHover ?? match("(hover: hover)");
  // Tablet desktop-style user agents and attached mice must not opt mobile
  // hardware out of memory safeguards. Layout still follows viewport width.
  const mobileDevice = /iP(?:hone|ad|od)|Android/i.test(ua)
    || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
    || (coarsePointer && !canHover);
  const iosPhone = /iP(?:hone|od)/.test(ua);
  const android = /Android/i.test(ua);

  if (iosPhone && standalone) return { mobileDevice, displayMode: "ios-standalone", isStandalone: true, browserClassification: "ios-standalone" };
  if (iosPhone) {
    const safari = /Safari/.test(ua) && /Version\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua);
    return safari
      ? { mobileDevice, displayMode: "ios-browser", isStandalone: false, browserClassification: "safari" }
      : { mobileDevice, displayMode: "ios-embedded", isStandalone: false, browserClassification: "ios-embedded" };
  }

  const narrow = viewportWidth < WIDE_BREAKPOINT;
  if (android && narrow) {
    const browserClassification = /EdgA/i.test(ua)
      ? "android-edge"
      : /Firefox|Fennec/i.test(ua)
        ? "android-firefox"
        : /Chrome|CriOS/i.test(ua)
          ? "android-chrome"
          : "android-browser";
    return {
      mobileDevice,
      displayMode: standalone ? "android-standalone" : "android-browser",
      isStandalone: standalone,
      browserClassification,
    };
  }

  if (narrow) {
    const touchClassification = coarsePointer && !canHover ? "touch-mobile" : "mobile";
    return { mobileDevice, displayMode: "mobile-browser", isStandalone: standalone, browserClassification: touchClassification };
  }
  return {
    mobileDevice,
    displayMode: "desktop",
    isStandalone: standalone,
    browserClassification: coarsePointer && !canHover ? "tablet" : "desktop",
  };
}
