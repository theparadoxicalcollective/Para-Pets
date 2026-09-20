import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthenticatedUserCached } from "@/lib/queryClient";
import { npcNamesMatch } from "@/lib/npcMetadata";
import {
  BEAU_PRIZE_WHEEL_NPC_NAME,
  BEAU_PRIZE_WHEEL_WORLD_ID,
} from "@shared/beauPrizeWheel";
import type { WheelState } from "@/components/world/BeauPrizeWheelOverlay";

const BeauPrizeWheelOverlay = lazy(() => import("@/components/world/BeauPrizeWheelOverlay"));

interface WorldLocationRow {
  id: string;
  worldId: string;
  name: string;
  type: string;
}

function currentWorldId(): string {
  return window.location.pathname.match(/^\/world\/([^/]+)/)?.[1] ?? "";
}

export default function BeauPrizeWheelBridge() {
  const [worldId, setWorldId] = useState(currentWorldId);
  const [beau, setBeau] = useState<WorldLocationRow | null>(null);
  const [casino, setCasino] = useState<WorldLocationRow | null>(null);
  const [casinoMount, setCasinoMount] = useState<HTMLElement | null>(null);
  const [freeBeauSpin, setFreeBeauSpin] = useState(false);
  const [freeBingoGame, setFreeBingoGame] = useState(false);
  const [freeSlotSpin, setFreeSlotSpin] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wheelState, setWheelState] = useState<WheelState | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | null>(null);
  const adminPointer = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentWorldId();
      if (next !== worldId) setWorldId(next);
    }, 350);
    return () => window.clearInterval(timer);
  }, [worldId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAuthenticatedUserCached()
      .then(user => { if (!cancelled) setIsAdmin(Boolean(user?.isAdmin)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [worldId]);

  useEffect(() => {
    setWheelState(null);
    setNotice("");
    setBeau(null);
    setMount(null);
    setCasino(null);
    setCasinoMount(null);
    setFreeBeauSpin(false);
    setFreeBingoGame(false);
    setFreeSlotSpin(false);
    if (worldId !== BEAU_PRIZE_WHEEL_WORLD_ID) return;

    let cancelled = false;
    void fetch(`/api/world/${BEAU_PRIZE_WHEEL_WORLD_ID}/locations`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async response => {
        if (!response.ok) return [] as WorldLocationRow[];
        return await response.json() as WorldLocationRow[];
      })
      .then(rows => {
        if (cancelled) return;
        const match = rows.find(row =>
          row.type === "npc" &&
          row.worldId === BEAU_PRIZE_WHEEL_WORLD_ID &&
          npcNamesMatch(row.name, BEAU_PRIZE_WHEEL_NPC_NAME)
        ) ?? null;
        setBeau(match);
        setCasino(rows.find(row => /haunted casino/i.test(row.name)) ?? null);
      })
      .catch(() => { if (!cancelled) setBeau(null); });

    return () => { cancelled = true; };
  }, [worldId]);

  useEffect(() => {
    if (!beau) {
      setMount(null);
      return;
    }
    const refresh = () => {
      setMount(document.querySelector<HTMLElement>(`[data-testid="location-${beau.id}"]`));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(refresh, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [beau]);

  useEffect(() => {
    if (!casino) { setCasinoMount(null); return; }
    const refresh = () => setCasinoMount(document.querySelector<HTMLElement>(`[data-testid="location-${casino.id}"]`));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [casino]);

  useEffect(() => {
    if (worldId !== BEAU_PRIZE_WHEEL_WORLD_ID || isAdmin) return;
    let active = true;
    const refresh = () => {
      void fetch("/api/beau-prize-wheel", { credentials: "include", cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<WheelState> : null)
        .then(state => { if (active) setFreeBeauSpin(Boolean(state?.ready && state.freeSpinAvailable && (!state.requiresActivePet || state.activePetReady))); })
        .catch(() => { if (active) setFreeBeauSpin(false); });
      void fetch("/api/haunted-casino/bingo", { credentials: "include", cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<{ freeGameAvailable: boolean }> : null)
        .then(state => { if (active) setFreeBingoGame(Boolean(state?.freeGameAvailable)); })
        .catch(() => { if (active) setFreeBingoGame(false); });
      void fetch("/api/haunted-casino/slots", { credentials: "include", cache: "no-store" })
        .then(response => response.ok ? response.json() as Promise<{ freeSpinAvailable: boolean }> : null)
        .then(state => { if (active) setFreeSlotSpin(Boolean(state?.freeSpinAvailable)); })
        .catch(() => { if (active) setFreeSlotSpin(false); });
    };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("para:casino-free-play-changed", refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("para:casino-free-play-changed", refresh); };
  }, [worldId, isAdmin]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 4200);
  }, []);

  const openWheel = useCallback(async () => {
    if (wheelState) return;
    try {
      const response = await fetch("/api/beau-prize-wheel", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Beau's wheel could not be opened.");
      const next = body as WheelState;
      if (!next.ready && !next.isAdmin) {
        showNotice("Beau's prize wheel isn't ready yet. Check back after all prizes have been set.");
        return;
      }
      setWheelState(next);
    } catch (reason) {
      showNotice(reason instanceof Error ? reason.message : "Beau's wheel could not be opened.");
    }
  }, [showNotice, wheelState]);

  useEffect(() => {
    if (!isAdmin || !beau || worldId !== BEAU_PRIZE_WHEEL_WORLD_ID) return;

    const matchesBeauHotspot = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest<HTMLElement>(`[data-testid="admin-location-hotspot-${beau.id}"]`));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!matchesBeauHotspot(event.target)) return;
      adminPointer.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      const pointer = adminPointer.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6) pointer.moved = true;
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (adminPointer.current?.pointerId === event.pointerId) adminPointer.current = null;
    };
    const onClick = (event: MouseEvent) => {
      if (!matchesBeauHotspot(event.target)) return;
      const pointer = adminPointer.current;
      adminPointer.current = null;
      if (pointer?.moved) return;
      void openWheel();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [beau, isAdmin, openWheel, worldId]);

  if (worldId !== BEAU_PRIZE_WHEEL_WORLD_ID || !beau) return null;

  return (
    <>
      {mount && createPortal(
        <>
          {!isAdmin && (
            <button
              type="button"
              aria-label="Open Beau's Prize Wheel"
              data-testid={`button-beau-prize-wheel-${beau.id}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                void openWheel();
              }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                border: 0,
                padding: 0,
                background: "transparent",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            />
          )}
          {notice && (
            <div
              role="status"
              aria-live="polite"
              data-testid="beau-prize-wheel-notice"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "98%",
                transform: "translate(-50%, -8px)",
                zIndex: 24,
                width: "max-content",
                maxWidth: "min(250px, 76vw)",
                padding: "8px 11px",
                borderRadius: 11,
                border: "1px solid rgba(244,199,102,.68)",
                background: "rgba(16,10,13,.95)",
                boxShadow: "0 7px 22px rgba(0,0,0,.68), 0 0 14px rgba(197,121,31,.18)",
                color: "#fff0c2",
                fontFamily: "Lora, serif",
                fontSize: 10,
                lineHeight: 1.35,
                textAlign: "center",
                pointerEvents: "none",
                whiteSpace: "normal",
              }}
            >
              <strong style={{ display: "block", marginBottom: 2, color: "#ffd779", fontSize: 10 }}>Beau</strong>
              {notice}
            </div>
          )}
        </>,
        mount,
      )}

      {casinoMount && !isAdmin && (freeBingoGame || freeSlotSpin) && createPortal(
        <span
          data-testid="casino-free-play-indicator"
          aria-label="Free casino play available"
          style={{
            position: "absolute",
            top: "-12%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "#754413",
            border: "2px solid #ffe29a",
            boxShadow: "0 0 18px #f6be55",
            color: "#fff6cd",
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          <span aria-hidden="true" style={{ display: "block", lineHeight: 1, transform: "translateY(-1px)" }}>!</span>
        </span>,
        casinoMount,
      )}

      {wheelState && createPortal(
        <Suspense fallback={
          <div className="fixed inset-0 z-[2200] grid place-items-center bg-black/90 text-sm text-amber-100">
            Preparing Beau's wheel…
          </div>
        }>
          <BeauPrizeWheelOverlay
            initialState={wheelState}
            onClose={() => setWheelState(null)}
            onStateChange={next => { setWheelState(next); setFreeBeauSpin(Boolean(next.ready && next.freeSpinAvailable && (!next.requiresActivePet || next.activePetReady))); }}
          />
        </Suspense>,
        document.body,
      )}
    </>
  );
}
