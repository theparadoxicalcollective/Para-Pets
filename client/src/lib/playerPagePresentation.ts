export type PlayerRoutePresentation = "home" | "stage" | "isolated";

const ISOLATED_EXACT = new Set([
  "/auth",
  "/privacy",
  "/hub",
  "/forum",
  "/founders",
  "/admin",
]);

const ISOLATED_PREFIXES = [
  "/reset-password/",
  "/visit/",
] as const;

const NAV_HIDDEN_EXACT = new Set([
  "/auth",
  "/hub",
  "/privacy",
  "/admin",
  "/equip-accessories",
  "/pvp",
  "/games/molten-blocks",
  "/games/lava-crawl",
  "/coins",
  "/bag",
  "/pets",
  "/explore/elysian-bayou-clearing",
]);

const NAV_HIDDEN_PREFIXES = [
  "/reset-password/",
  "/visit/",
  "/pet-care/",
  "/equip-accessories/",
  "/pet-level-up/",
] as const;

function hasPrefix(path: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * One routing-level presentation policy for player-facing surfaces.
 *
 * "isolated" is reserved for routes that render outside the gameplay stage.
 * Level Up is a stage-owned full-viewport route: the Home page still unmounts
 * because App renders only the active stage route, avoiding WebKit overlap.
 */
export function getPlayerRoutePresentation(path: string): PlayerRoutePresentation {
  if (path === "/") return "home";
  if (ISOLATED_EXACT.has(path) || hasPrefix(path, ISOLATED_PREFIXES)) return "isolated";
  return "stage";
}

export function isIsolatedPlayerRoute(path: string) {
  return getPlayerRoutePresentation(path) === "isolated";
}

/**
 * Floating navigation visibility is kept separate from route isolation: some
 * stage-owned pages (Closet, Pet Care, mini-games, etc.) intentionally own all
 * player input while open.
 */
export function shouldHideFloatingNav(path: string) {
  return NAV_HIDDEN_EXACT.has(path) || hasPrefix(path, NAV_HIDDEN_PREFIXES);
}
