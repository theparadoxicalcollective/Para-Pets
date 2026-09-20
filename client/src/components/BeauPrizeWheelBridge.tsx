import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthenticatedUserCached } from "@/lib/queryClient";
import { npcNamesMatch } from "@/lib/npcMetadata";
import {
  BEAU_PRIZE_WHEEL_NPC_NAME,
  BEAU_PRIZE_WHEEL_WORLD_ID,
} from "@shared/beauPrizeWheel";
import BeauPrizeWheelOverlay, { type WheelState } from "@/components/world/BeauPrizeWheelOverlay";

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

      {wheelState && createPortal(
        <BeauPrizeWheelOverlay
          initialState={wheelState}
          onClose={() => setWheelState(null)}
          onStateChange={setWheelState}
        />,
        document.body,
      )}
    </>
  );
}
