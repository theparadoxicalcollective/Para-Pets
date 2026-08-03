export type DisplayMode = "ios-standalone" | "ios-browser" | "ios-embedded" | "mobile-browser" | "desktop";

export type RuntimeMode = {
  displayMode: DisplayMode;
  isStandalone: boolean;
  browserClassification: string;
};

export function detectRuntimeMode(nav: Pick<Navigator, "userAgent"> & { standalone?: boolean } = navigator): RuntimeMode {
  const ua = nav.userAgent || "";
  // Para Pets' fixed phone presentation applies to iPhone/iPod. iPad remains
  // in the existing tablet/desktop layout rather than being UA-scaled.
  const ios = /iP(?:hone|od)/.test(ua);
  const standalone = !!nav.standalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
  if (ios && standalone) return { displayMode: "ios-standalone", isStandalone: true, browserClassification: "ios-standalone" };
  if (ios) {
    const safari = /Safari/.test(ua) && /Version\//.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua);
    return safari
      ? { displayMode: "ios-browser", isStandalone: false, browserClassification: "safari" }
      : { displayMode: "ios-embedded", isStandalone: false, browserClassification: "ios-embedded" };
  }
  if (/Mobi|Android|Mobile/.test(ua)) return { displayMode: "mobile-browser", isStandalone: standalone, browserClassification: "mobile" };
  return { displayMode: "desktop", isStandalone: standalone, browserClassification: "desktop" };
}
