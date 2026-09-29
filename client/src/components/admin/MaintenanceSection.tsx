import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CrashEntry {
  id: number;
  type: "crash" | "unhandled" | "error";
  msg: string;
  source: string;
  url: string;
  ua: string;
  ts: string;
  userId?: string;
}

export default function MaintenanceSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ summary: string; cleaned: number; totalRows: number; ranAt: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [crashLog, setCrashLog] = useState<CrashEntry[] | null>(null);
  const [crashTotal, setCrashTotal] = useState(0);
  const [loadingCrash, setLoadingCrash] = useState(false);
  const [clearingCrash, setClearingCrash] = useState(false);
  const [crashExpanded, setCrashExpanded] = useState<number | null>(null);
  const [crashError, setCrashError] = useState<string | null>(null);
  const [crashFilter, setCrashFilter] = useState<"all" | "crash" | "unhandled" | "error">("all");
  const [crashSearch, setCrashSearch] = useState("");

  const fetchCrashLog = async () => {
    setLoadingCrash(true);
    try {
      const res = await apiRequest("GET", "/api/admin/client-errors");
      const data = await res.json();
      setCrashLog(data.entries ?? []);
      setCrashTotal(data.total ?? 0);
      setCrashError(null);
    } catch (err: any) {
      setCrashError(err.message || "Crash log unavailable");
      toast({ title: "Failed to load crash log", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCrash(false);
    }
  };

  const clearCrashLog = async () => {
    if (!window.confirm("Clear all client errors from this server? This cannot be undone.")) return;
    setClearingCrash(true);
    try {
      await apiRequest("DELETE", "/api/admin/client-errors");
      setCrashLog([]);
      setCrashTotal(0);
      void refreshDiagnostics();
      toast({ title: "Crash log cleared" });
    } catch (err: any) {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    } finally {
      setClearingCrash(false);
    }
  };

  useEffect(() => { fetchCrashLog(); }, []);

  const { data: diagnostics, isLoading: maintenanceLoading, isFetching: maintenanceFetching, isError: diagnosticsError, refetch: refreshDiagnostics } = useQuery<{
    maintenance: boolean; database: "online"; uptimeSeconds: number; serverTime: string;
    clientErrors: number; clientErrorLimit: number;
  }>({
    queryKey: ["/api/admin/maintenance/diagnostics"],
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const maintenanceOn = diagnostics?.maintenance === true;
  const maintenanceUnavailable = diagnosticsError || !diagnostics;
  const maintenanceBusy = maintenanceLoading || maintenanceFetching;

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/maintenance", { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/maintenance-status"], { maintenance: data.maintenance });
      queryClient.setQueryData(["/api/admin/maintenance/diagnostics"], (previous: typeof diagnostics) =>
        previous ? { ...previous, maintenance: data.maintenance } : previous
      );
      void refreshDiagnostics();
      toast({
        title: data.maintenance ? "Maintenance mode ON" : "Maintenance mode OFF",
        description: data.maintenance
          ? "Non-admin logins are blocked; active players see the maintenance page."
          : "The realm is open — players can log in again.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const runCleanup = async () => {
    if (!window.confirm("Permanently remove orphaned database rows? This can affect inventory and other records whose original item or template no longer exists.")) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/cleanup-orphans", {});
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      toast({ title: "Cleanup failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const filteredCrashLog = (crashLog ?? []).filter(entry => {
    if (crashFilter !== "all" && entry.type !== crashFilter) return false;
    const term = crashSearch.trim().toLowerCase();
    return !term || [entry.msg, entry.source, entry.url, entry.ua, entry.userId ?? ""].some(value => value.toLowerCase().includes(term));
  });

  return (
    <div className="space-y-5 py-2">

      {/* ── Maintenance Mode Toggle ── */}
      <div
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{
          background: maintenanceOn
            ? "linear-gradient(145deg, rgba(60,10,10,0.9) 0%, rgba(90,14,14,0.9) 100%)"
            : "linear-gradient(145deg, rgba(8,30,20,0.9) 0%, rgba(12,50,30,0.9) 100%)",
          border: maintenanceOn
            ? "1px solid rgba(252,165,165,0.4)"
            : "1px solid rgba(110,231,183,0.3)",
          boxShadow: maintenanceOn
            ? "0 0 20px rgba(200,50,50,0.1)"
            : "0 0 20px rgba(110,231,183,0.06)",
          transition: "all 0.4s ease",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p
              className="font-fantasy text-sm tracking-wide"
              style={{ color: maintenanceOn ? "#fca5a5" : "#6ee7b7" }}
            >
              Maintenance Mode
            </p>
            <p
              className="font-fantasy text-[10px] tracking-wider"
              style={{ color: maintenanceOn ? "#7a3030" : "#2a5a3a" }}
            >
              {maintenanceBusy ? "Checking status..." : maintenanceUnavailable ? "Status unavailable — retry the health check" : maintenanceOn ? "Login closed; active players see the maintenance page" : "Realm is open to players"}
            </p>
          </div>

          {/* Toggle switch */}
          <button
            data-testid="button-toggle-maintenance"
            type="button"
            aria-label={maintenanceOn ? "Turn off maintenance mode" : "Turn on maintenance mode"}
            aria-pressed={maintenanceOn}
            onClick={() => toggleMutation.mutate(!maintenanceOn)}
            disabled={maintenanceBusy || maintenanceUnavailable || toggleMutation.isPending}
            className="relative flex-shrink-0"
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              background: maintenanceOn
                ? "linear-gradient(135deg, #8b1a1a, #c0392b)"
                : "linear-gradient(135deg, #1a5c38, #27ae60)",
              border: maintenanceOn ? "1px solid rgba(252,165,165,0.5)" : "1px solid rgba(110,231,183,0.5)",
              boxShadow: maintenanceOn ? "0 0 10px rgba(200,50,50,0.3)" : "0 0 10px rgba(39,174,96,0.3)",
              cursor: (maintenanceBusy || maintenanceUnavailable || toggleMutation.isPending) ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              opacity: (maintenanceBusy || maintenanceUnavailable || toggleMutation.isPending) ? 0.5 : 1,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 3,
                left: maintenanceOn ? 26 : 3,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                transition: "left 0.3s ease",
              }}
            />
          </button>
        </div>

        {maintenanceOn && (
          <p
            className="font-fantasy text-[10px] tracking-wider text-center"
            style={{ color: "#7a3030" }}
          >
            Admins can still access the realm normally.
          </p>
        )}
      </div>

      {/* ── Live diagnostics ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,24,30,.94)", border: "1px solid rgba(110,231,183,.28)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-fantasy text-sm text-emerald-200">Realm Health</h3>
            <p className="font-fantasy text-[10px] text-emerald-100/70">Live server and database check</p>
          </div>
          <button type="button" data-testid="button-refresh-maintenance-health" onClick={() => void refreshDiagnostics()}
            disabled={maintenanceBusy} className="rounded-lg border border-emerald-300/40 px-3 py-1.5 font-fantasy text-[10px] text-emerald-100 disabled:opacity-50">
            {maintenanceBusy ? "Checking…" : "Refresh"}
          </button>
        </div>
        {diagnosticsError ? <p role="alert" className="font-fantasy text-xs text-red-200">Health check unavailable. Maintenance controls are paused until the server responds.</p>
          : maintenanceLoading && !diagnostics ? <p className="font-fantasy text-xs text-emerald-100/70">Checking realm health…</p>
          : diagnostics && <div className="grid grid-cols-2 gap-2 font-fantasy text-[11px]">
            <div className="rounded-lg bg-black/30 p-2"><span className="block text-emerald-100/70">Database</span><strong className="text-emerald-200">Connected</strong></div>
            <div className="rounded-lg bg-black/30 p-2"><span className="block text-emerald-100/70">Server uptime</span><strong className="text-emerald-200">{Math.floor(diagnostics.uptimeSeconds / 3600)}h {Math.floor((diagnostics.uptimeSeconds % 3600) / 60)}m</strong></div>
            <div className="rounded-lg bg-black/30 p-2"><span className="block text-emerald-100/70">Client errors</span><strong className={diagnostics.clientErrors ? "text-amber-200" : "text-emerald-200"}>{diagnostics.clientErrors} / {diagnostics.clientErrorLimit} stored</strong></div>
            <div className="rounded-lg bg-black/30 p-2"><span className="block text-emerald-100/70">Checked</span><strong className="text-emerald-200">{new Date(diagnostics.serverTime).toLocaleTimeString()}</strong></div>
          </div>}
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
        <p className="font-fantasy text-[10px] text-[#4a3a28] tracking-wider">Client Errors</p>
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
      </div>

      {/* ── Crash & Error Log ── */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(145deg, rgba(10,4,20,0.97) 0%, rgba(18,6,30,0.97) 100%)",
        border: "1px solid rgba(248,113,113,0.2)",
      }}>
        {/* Header row */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="font-fantasy text-sm tracking-wide" style={{ color: "#fca5a5" }}>
              Crash &amp; Debug Log
            </p>
            <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#4a2a2a" }}>
              Client-side errors, unhandled rejections, and crashes — since last server restart
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              data-testid="button-refresh-crash-log"
              onClick={fetchCrashLog}
              disabled={loadingCrash}
              className="rounded-lg px-2.5 py-1 font-fantasy text-[9px] tracking-wider"
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.25)",
                color: loadingCrash ? "#5a2a2a" : "#fca5a5",
                cursor: loadingCrash ? "not-allowed" : "pointer",
              }}
            >
              {loadingCrash ? "Loading…" : "Refresh"}
            </button>
            {crashLog && crashLog.length > 0 && (
              <button
                data-testid="button-clear-crash-log"
                onClick={clearCrashLog}
                disabled={clearingCrash}
                className="rounded-lg px-2.5 py-1 font-fantasy text-[9px] tracking-wider"
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  color: clearingCrash ? "#5a2a2a" : "#f87171",
                  cursor: clearingCrash ? "not-allowed" : "pointer",
                }}
              >
                {clearingCrash ? "Clearing…" : "Clear All"}
              </button>
            )}
          </div>
        </div>

        {crashError && <div role="alert" className="mx-3 mb-3 rounded-lg border border-red-300/30 bg-red-950/50 p-3 font-fantasy text-[11px] text-red-200">Crash log unavailable: {crashError}. Use Refresh to retry.</div>}

        {/* Summary count */}
        {crashLog !== null && (
          <div className="px-4 pb-2 flex items-center gap-2">
            <span className="font-fantasy text-lg leading-none" style={{ color: crashTotal > 0 ? "#f87171" : "#6ee7b7" }}>
              {crashTotal}
            </span>
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: crashTotal > 0 ? "#6a2a2a" : "#2a6a44" }}>
              {crashTotal === 0 ? "no errors recorded — all clear" : crashTotal === 1 ? "error recorded" : "errors recorded"}
            </span>
            {crashTotal > 0 && (() => {
              const crashes   = crashLog?.filter(e => e.type === "crash").length ?? 0;
              const unhandled = crashLog?.filter(e => e.type === "unhandled").length ?? 0;
              const errors    = crashLog?.filter(e => e.type === "error").length ?? 0;
              return (
                <div className="flex items-center gap-1.5 ml-1">
                  {crashes   > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(248,113,113,0.18)", color: "#fca5a5", border: "1px solid rgba(248,113,113,0.3)" }}>{crashes} crash</span>}
                  {unhandled > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(251,191,36,0.18)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>{unhandled} unhandled</span>}
                  {errors    > 0 && <span className="font-fantasy text-[8px] rounded-full px-1.5 py-0.5" style={{ background: "rgba(253,224,71,0.18)", color: "#fde047", border: "1px solid rgba(253,224,71,0.3)" }}>{errors} window error</span>}
                </div>
              );
            })()}
          </div>
        )}

        {crashLog !== null && crashLog.length > 0 && <div className="mx-3 mb-3 flex flex-wrap gap-2">
          <select data-testid="select-crash-type" aria-label="Filter client errors by type" value={crashFilter}
            onChange={event => setCrashFilter(event.target.value as typeof crashFilter)}
            className="rounded-lg border border-red-200/30 bg-[#180e1c] px-2 py-1.5 font-fantasy text-[11px] text-red-100">
            <option value="all">All types</option><option value="crash">Crashes</option><option value="unhandled">Unhandled</option><option value="error">Window errors</option>
          </select>
          <input data-testid="input-search-crash-log" aria-label="Search client errors" value={crashSearch}
            onChange={event => setCrashSearch(event.target.value)} placeholder="Search errors, page, user…"
            className="min-w-0 flex-1 rounded-lg border border-red-200/30 bg-[#180e1c] px-2 py-1.5 font-fantasy text-[11px] text-red-100 placeholder:text-red-100/50" />
          <span className="self-center font-fantasy text-[10px] text-red-100/70">{filteredCrashLog.length} shown</span>
        </div>}

        {/* Entry list */}
        {loadingCrash && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(248,113,113,0.12)" }}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "rgba(248,113,113,0.3)", animation: "pp-glow-pulse 1s ease-in-out infinite" }} />
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#5a2a2a" }}>Loading error log…</span>
          </div>
        )}

        {!loadingCrash && crashLog !== null && filteredCrashLog.length > 0 && (
          <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(248,113,113,0.12)", maxHeight: 320, overflowY: "auto" }}>
            {filteredCrashLog.map((entry, idx) => {
              const typeColor = entry.type === "crash" ? { bg: "rgba(248,113,113,0.12)", badge: "#fca5a5", badgeBg: "rgba(248,113,113,0.2)", label: "CRASH" }
                : entry.type === "unhandled" ? { bg: "rgba(251,191,36,0.08)", badge: "#fbbf24", badgeBg: "rgba(251,191,36,0.18)", label: "UNHANDLED" }
                : { bg: "rgba(253,224,71,0.06)", badge: "#fde047", badgeBg: "rgba(253,224,71,0.14)", label: "ERROR" };
              const isExpanded = crashExpanded === entry.id;
              const ago = (() => {
                const diff = Date.now() - new Date(entry.ts).getTime();
                const s = Math.floor(diff / 1000);
                if (s < 60)  return `${s}s ago`;
                if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                return new Date(entry.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              })();
              const browser = (() => {
                const ua = entry.ua;
                if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
                if (/Edg\//.test(ua)) return "Edge";
                if (/Firefox\//.test(ua)) return "Firefox";
                if (/Safari\//.test(ua)) return "Safari";
                return "Unknown";
              })();
              return (
                <div
                  key={entry.id}
                  style={{
                    background: typeColor.bg,
                    borderBottom: idx < filteredCrashLog.length - 1 ? "1px solid rgba(248,113,113,0.08)" : "none",
                  }}
                >
                  {/* Collapsed row */}
                  <button
                    className="w-full px-3 py-2 flex items-start gap-2 text-left"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    onClick={() => setCrashExpanded(isExpanded ? null : entry.id)}
                  >
                    <span className="font-fantasy text-[8px] tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5"
                      style={{ background: typeColor.badgeBg, color: typeColor.badge }}>
                      {typeColor.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-[10px] tracking-wide truncate" style={{ color: typeColor.badge }}>
                        {entry.msg || "(no message)"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-fantasy text-[8px]" style={{ color: "#3a1a1a" }}>{ago}</span>
                        {entry.url && <span className="font-fantasy text-[8px] truncate" style={{ color: "#3a1a1a" }}>{entry.url}</span>}
                        <span className="font-fantasy text-[8px]" style={{ color: "#3a1a1a" }}>{browser}</span>
                        {entry.userId && <span className="font-fantasy text-[8px]" style={{ color: "#5a2a2a" }}>uid:{entry.userId.slice(0,8)}</span>}
                      </div>
                    </div>
                    <span style={{ color: "#3a1a1a", fontSize: 10, flexShrink: 0, marginTop: 2 }}>{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                        <p className="font-fantasy text-[8px] tracking-wider mb-1" style={{ color: "#5a2a2a" }}>MESSAGE</p>
                        <p className="text-[10px] leading-relaxed break-words" style={{ color: typeColor.badge, fontFamily: "monospace" }}>{entry.msg}</p>
                      </div>
                      {entry.source && (
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-1" style={{ color: "#5a2a2a" }}>SOURCE</p>
                          <p className="text-[9px] leading-relaxed break-words" style={{ color: "rgba(252,165,165,0.5)", fontFamily: "monospace" }}>{entry.source}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>TIME</p>
                          <p className="font-fantasy text-[9px]" style={{ color: "#7a3a3a" }}>{new Date(entry.ts).toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>BROWSER</p>
                          <p className="font-fantasy text-[9px]" style={{ color: "#7a3a3a" }}>{browser}</p>
                        </div>
                      </div>
                      {entry.ua && (
                        <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <p className="font-fantasy text-[8px] tracking-wider mb-0.5" style={{ color: "#5a2a2a" }}>USER AGENT</p>
                          <p className="text-[8px] break-all leading-relaxed" style={{ color: "#3a1a1a", fontFamily: "monospace" }}>{entry.ua}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loadingCrash && crashLog !== null && crashLog.length > 0 && filteredCrashLog.length === 0 && (
          <p className="mx-3 mb-3 font-fantasy text-[11px] text-red-100/70">No errors match these filters.</p>
        )}

        {!loadingCrash && crashLog !== null && crashLog.length === 0 && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-2"
            style={{ background: "rgba(8,40,24,0.6)", border: "1px solid rgba(110,231,183,0.2)" }}
          >
            <span style={{ fontSize: 14 }}>✓</span>
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#2a6a44" }}>No errors recorded since last server restart</span>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
        <p className="font-fantasy text-[10px] text-[#4a3a28] tracking-wider">Database Tools</p>
        <div className="flex-1 h-px" style={{ background: "rgba(168,152,120,0.15)" }} />
      </div>

      {/* ── Orphan Cleanup ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(20,12,28,0.95) 0%, rgba(30,16,40,0.95) 100%)",
          border: "1px solid rgba(249,168,212,0.2)",
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex flex-col gap-1">
          <p className="font-fantasy text-sm tracking-wide" style={{ color: "#f9a8d4" }}>
            Orphaned Row Cleanup
          </p>
          <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#5a3a50" }}>
            Permanently removes references to deleted items, locations, and templates. Review before running.
          </p>
        </div>

        {/* Result display — shown before button once run */}
        {result && (
          <div
            className="mx-3 mb-3 rounded-xl p-3 flex flex-col gap-2"
            style={{
              background: result.totalRows > 0
                ? "linear-gradient(135deg, rgba(60,20,50,0.8) 0%, rgba(80,24,60,0.8) 100%)"
                : "linear-gradient(135deg, rgba(8,40,24,0.8) 0%, rgba(12,60,36,0.8) 100%)",
              border: `1px solid ${result.totalRows > 0 ? "rgba(249,168,212,0.3)" : "rgba(110,231,183,0.3)"}`,
            }}
          >
            {/* Big number + status */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span
                  className="font-fantasy text-2xl leading-none"
                  style={{ color: result.totalRows > 0 ? "#f9a8d4" : "#6ee7b7" }}
                >
                  {result.totalRows}
                </span>
                <span
                  className="font-fantasy text-[10px] tracking-wider mt-0.5"
                  style={{ color: result.totalRows > 0 ? "#8a4870" : "#2a6a44" }}
                >
                  {result.totalRows === 1 ? "orphaned row removed" : result.totalRows > 0 ? "orphaned rows removed" : "orphaned rows — database is clean"}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className="font-fantasy text-[10px] tracking-wider"
                  style={{ color: result.totalRows > 0 ? "#8a4870" : "#2a6a44" }}
                >
                  {result.cleaned} table{result.cleaned !== 1 ? "s" : ""} affected
                </span>
                <span className="font-fantasy text-[9px]" style={{ color: "#3a2a40" }}>
                  {new Date(result.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Per-table breakdown */}
            {result.totalRows > 0 && (
              <div
                className="rounded-lg p-2 flex flex-col gap-1"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                {result.summary.split("\n").map((line, i) => {
                  const match = line.match(/^(.+?):\s*(\d+)\s*row/);
                  if (!match) return null;
                  const [, label, count] = match;
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-fantasy text-[9px] tracking-wide" style={{ color: "#7a5870" }}>
                        {label.trim()}
                      </span>
                      <span className="font-fantasy text-[10px]" style={{ color: "#f9a8d4" }}>
                        -{count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Running state indicator */}
        {running && (
          <div className="mx-3 mb-3 rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(249,168,212,0.15)" }}
          >
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{
                background: "rgba(249,168,212,0.3)",
                animation: "pp-glow-pulse 1s ease-in-out infinite",
              }}
            />
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#7a5870" }}>
              Scanning all tables for orphaned rows...
            </span>
          </div>
        )}

        {/* Button */}
        <div className="px-3 pb-4">
          <button
            data-testid="button-cleanup-orphans"
            onClick={runCleanup}
            disabled={running}
            className="w-full py-2.5 rounded-xl font-fantasy text-xs tracking-wider"
            style={{
              background: running ? "rgba(0,0,0,0.2)" : "linear-gradient(135deg, rgba(61,10,46,0.9), rgba(107,16,80,0.9))",
              border: "1px solid rgba(249,168,212,0.35)",
              color: running ? "#3a1a30" : "#f9a8d4",
              cursor: running ? "not-allowed" : "pointer",
              boxShadow: running ? "none" : "0 0 14px rgba(249,168,212,0.1)",
            }}
          >
            {running ? "Scanning..." : result ? "Run Again" : "Clean Up Orphaned Rows"}
          </button>
        </div>
      </div>
    </div>
  );
}
