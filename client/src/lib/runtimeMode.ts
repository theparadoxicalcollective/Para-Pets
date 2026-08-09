import { WIDE_BREAKPOINT } from "./stage";

export type DisplayMode = "ios-standalone" | "ios-browser" | "ios-embedded" | "mobile-browser" | "desktop";

export type RuntimeMode = {
  displayMode: DisplayMode;
  isStandalone: boolean;
  browserClassification: string;
};

type RuntimeNavigator = Pick<Navigator, "userAgent"> & { standalone?: boolean };
type RuntimeEnvironment = {
  viewportWidth?: number;
  standalone?: boolean;
  coarsePointer?: boolean;
  canHover?: boolean;
};

/**
 * Browser identity is used only for the iOS hosting-mode workarounds. Layout is
 * classified from the viewport; an Android tablet must never become a phone
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
  const iosPhone = /iP(?:hone|od)/.test(ua);

  if (iosPhone && standalone) return { displayMode: "ios-standalone", isStandalone: true, browserClassification: "ios-standalone" };
  if (iosPhone) {
    const safari = /Safari/.test(ua) && /Version\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua);
    return safari
      ? { displayMode: "ios-browser", isStandalone: false, browserClassification: "safari" }
      : { displayMode: "ios-embedded", isStandalone: false, browserClassification: "ios-embedded" };
  }

  const narrow = viewportWidth < WIDE_BREAKPOINT;
  if (narrow) {
    const touchClassification = coarsePointer && !canHover ? "touch-mobile" : "mobile";
    return { displayMode: "mobile-browser", isStandalone: standalone, browserClassification: touchClassification };
  }
  return {
    displayMode: "desktop",
    isStandalone: standalone,
    browserClassification: coarsePointer && !canHover ? "tablet" : "desktop",
  };
}
