import type { Express, Request, RequestHandler } from "express";
import {
  clearClientErrors,
  getClientErrors,
  pushClientError,
  type ClientErrorType,
} from "../clientErrorStore";

const MAX_MESSAGE = 500;
const MAX_SOURCE = 200;
const MAX_PATH = 160;
const MAX_BUILD = 80;
const MAX_RUNTIME = 80;

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function safePath(value: unknown): string | null {
  const path = boundedString(value, MAX_PATH);
  if (!path || !path.startsWith("/")) return null;
  // Never accept query strings or fragments in diagnostic paths; those can
  // contain reset tokens or other user-specific data.
  return path.split(/[?#]/, 1)[0] ?? null;
}

/**
 * Early startup diagnostics endpoint. This is registered before the legacy
 * route registry so startup/runtime failures can be reported even when a later
 * feature route is the thing that is broken.
 */
export function registerClientDiagnosticsRoutes(app: Express): void {
  app.post("/api/client-diagnostics", (req: Request, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const event = boundedString((body as any).event, 40);
    const message = boundedString((body as any).message, MAX_MESSAGE);

    if (!event || !message) {
      return res.status(400).json({ message: "Invalid diagnostic payload" });
    }

    const diagnostic = {
      event,
      message,
      source: boundedString((body as any).source, MAX_SOURCE),
      path: safePath((body as any).path),
      buildId: boundedString((body as any).buildId, MAX_BUILD),
      runtime: boundedString((body as any).runtime, MAX_RUNTIME),
      userAgent: String(req.get("user-agent") ?? "").slice(0, 240),
      userId: typeof (req.user as any)?.id === "string" ? (req.user as any).id : undefined,
      timestamp: new Date().toISOString(),
    };

    // Railway captures stdout/stderr across application restarts/deploys. Keep
    // this payload intentionally small and free of request bodies, query
    // strings, email addresses, inventory data, or other player content.
    console.warn("[client-diagnostic]", JSON.stringify(diagnostic));
    return res.status(204).end();
  });
}

export interface ClientErrorRouteDependencies {
  isAdmin: RequestHandler;
}

/**
 * Legacy crash log contract used by ErrorBoundary and Administration
 * Maintenance. Kept separate from the early startup diagnostic endpoint so
 * both existing behaviors retain their original registration order.
 */
export function registerClientErrorRoutes(
  app: Express,
  { isAdmin }: ClientErrorRouteDependencies,
): void {
  // Public — no auth required so crashed/logged-out clients can still report.
  app.post("/api/client-error", (req, res) => {
    try {
      const { type, msg, source, url, ua } = req.body as any;
      const userId = (req.user as any)?.id;
      const safeType: ClientErrorType = (["crash", "unhandled", "error"] as const).includes(type)
        ? type
        : "error";
      pushClientError({
        type: safeType,
        msg: String(msg ?? "").slice(0, 800),
        source: String(source ?? "").slice(0, 600),
        url: String(url ?? "").slice(0, 300),
        ua: String(ua ?? "").slice(0, 200),
        userId,
      });
      console.error(`[client-error:${safeType}] ${String(url ?? "")} :: ${String(msg ?? "").slice(0, 400)} @ ${String(source ?? "").slice(0, 200)}`);
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: false });
    }
  });

  app.get("/api/admin/client-errors", isAdmin, (_req, res) => {
    const entries = getClientErrors();
    return res.json({ entries, total: entries.length });
  });

  app.delete("/api/admin/client-errors", isAdmin, (_req, res) => {
    clearClientErrors();
    return res.json({ ok: true });
  });
}
