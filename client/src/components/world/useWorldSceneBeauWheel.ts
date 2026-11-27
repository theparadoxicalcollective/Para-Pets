import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readBeauPrizeWheelState } from "./BeauPrizeWheelDialog";
import type { WheelState } from "./BeauPrizeWheelOverlay";

const WHEEL_QUERY_KEY = ["/api/beau-prize-wheel"] as const;

/** The new world's launcher never looks up a legacy NPC or its location ID.
 * An opening always reads fresh server state; simply opening never spins. */
export function useWorldSceneBeauWheel(enabled: boolean) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: WHEEL_QUERY_KEY,
    queryFn: ({ signal }) => readBeauPrizeWheelState(signal),
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: enabled ? 60_000 : false,
  });
  const [state, setState] = useState<WheelState | null>(null);
  const [notice, setNotice] = useState("");
  const opening = useRef<AbortController | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setState(null); setNotice(""); }
    return () => {
      opening.current?.abort();
      opening.current = null;
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, [enabled]);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    if (message) noticeTimer.current = window.setTimeout(() => setNotice(""), 4200);
  }

  async function open() {
    if (!enabled || state || opening.current) return;
    const controller = new AbortController();
    opening.current = controller;
    showNotice("Opening Beau's wheel…");
    try {
      // Cancel any older marker read so it cannot overwrite a fresher state.
      await qc.cancelQueries({ queryKey: WHEEL_QUERY_KEY });
      if (controller.signal.aborted) return;
      const next = await readBeauPrizeWheelState(controller.signal);
      if (controller.signal.aborted) return;
      qc.setQueryData(WHEEL_QUERY_KEY, next);
      if (!next.ready && !next.isAdmin) {
        showNotice("Beau's prize wheel isn't ready yet. Check back after all prizes have been set.");
        return;
      }
      showNotice("");
      setState(next);
    } catch (error) {
      if (!controller.signal.aborted)
        showNotice(error instanceof Error ? error.message : "Beau's wheel could not be opened.");
    } finally {
      if (opening.current === controller) opening.current = null;
    }
  }

  function onStateChange(next: WheelState) {
    // The existing overlay reports the committed spin/admin result. Refresh the
    // marker from that result without letting a pre-spin poll overwrite it.
    void qc.cancelQueries({ queryKey: WHEEL_QUERY_KEY });
    qc.setQueryData(WHEEL_QUERY_KEY, next);
    setState(next);
  }

  return {
    state, open, close: () => setState(null), onStateChange, notice,
    freeSpinAvailable: Boolean(status.data?.ready && !status.data.isAdmin && status.data.freeSpinAvailable),
  };
}
