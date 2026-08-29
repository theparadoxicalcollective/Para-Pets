import type { Express, Request } from "express";

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

    // Railway captures stdout/stderr across application restarts/deploys, so
    // this is substantially more useful than the legacy in-memory-only log.
    // Keep the payload intentionally small and free of request bodies, query
    // strings, email addresses, inventory data, or other player content.
    console.warn("[client-diagnostic]", JSON.stringify(diagnostic));
    return res.status(204).end();
  });
}
