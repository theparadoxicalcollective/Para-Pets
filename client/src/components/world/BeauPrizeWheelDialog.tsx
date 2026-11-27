import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { getStagePortalTarget } from "@/lib/stage";
import MiniGameFrame from "@/components/world/MiniGameFrame";
import { BEAU_PRIZE_WHEEL_WORLD_ID } from "@shared/beauPrizeWheel";
import type { WheelState } from "@/components/world/BeauPrizeWheelOverlay";

const BeauPrizeWheelOverlay = lazy(() => import("@/components/world/BeauPrizeWheelOverlay"));

/** Both the original Beau NPC and the new world decor use one wheel UI and
 * one authoritative state endpoint. Keep the costly wheel code lazy. */
export async function readBeauPrizeWheelState(signal?: AbortSignal): Promise<WheelState> {
  const response = await fetch("/api/beau-prize-wheel", {
    credentials: "include", cache: "no-store", signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || "Beau's wheel could not be opened.");
  return body as WheelState;
}

export default function BeauPrizeWheelDialog({ state, onClose, onStateChange }: {
  state: WheelState; onClose: () => void; onStateChange: (next: WheelState) => void;
}) {
  return createPortal(
    <MiniGameFrame worldId={BEAU_PRIZE_WHEEL_WORLD_ID}>
      <Suspense fallback={
        <div className="absolute inset-0 z-[2200] grid place-items-center bg-black/90 text-sm text-amber-100">
          Preparing Beau's wheel…
        </div>
      }>
        <BeauPrizeWheelOverlay initialState={state} onClose={onClose} onStateChange={onStateChange} />
      </Suspense>
    </MiniGameFrame>,
    getStagePortalTarget(),
  );
}
