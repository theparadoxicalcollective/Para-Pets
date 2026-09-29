import type { Express, RequestHandler } from "express";
import {
  clearClientErrors,
  getClientErrors,
  pushClientError,
  type ClientErrorType,
} from "../clientErrorStore";

export interface ClientDiagnosticsRouteDependencies {
  isAdmin: RequestHandler;
}

export function registerClientDiagnosticsRoutes(
  app: Express,
  { isAdmin }: ClientDiagnosticsRouteDependencies,
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
