import { useEffect, useMemo, useState } from "react";
import { parkNextRewardProgress, type ParkRewardRates, type ParkRewardTiming, type ParkRewardRate } from "@/lib/petParkRewardProgress";

/** A single gold preview of the next REAL reward increment across the three
 * existing accrual cycles. The full slot popup still shows each cycle.
 * Isolated 1s clock means the entire park scene doesn't rerender every second.
 */
export default function PetParkSlotProgress({ timing, rates, serverNow }: {
  timing: ParkRewardTiming; rates: ParkRewardRates; serverNow?: string;
}) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (timing.pausedAt) return;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timing.pausedAt]);
  const clockOffset = useMemo(() => {
    const stamp = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isFinite(stamp) ? stamp - Date.now() : 0;
  }, [serverNow]);
  const now = tick + clockOffset;
  const cycles = (["coins", "essence", "petXp"] as ParkRewardRate[])
    .map(kind => ({ kind, meter: parkNextRewardProgress(kind, timing, rates, now) }))
    .filter(cycle => !cycle.meter.disabled);
  const next = cycles.reduce<(typeof cycles)[number] | null>((best, cycle) =>
    best === null || cycle.meter.secondsRemaining < best.meter.secondsRemaining ? cycle : best, null);
  const percent = next ? Math.round(next.meter.progress * 100) : 0;
  const label = next ? { coins: "Coins", essence: "Essence", petXp: "Pet XP" }[next.kind] : "Rewards";
  const state = timing.pausedAt ? "paused" : next ? "earning" : "inactive";
  return <div data-testid="pet-park-slot-progress" data-state={state}
    className="pet-park-slot-progress pointer-events-none relative z-[3] w-[79%] min-w-0"
    title={next ? `${label}: ${percent}% toward next increment` : "No rewards earning"}
    role="progressbar" aria-label={next ? `Next ${label} reward` : "Park reward progress"}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <div className="pet-park-slot-progress__track">
      <div className="pet-park-slot-progress__fill"
        style={{ width: `${percent}%` }} />
      <span className="pet-park-slot-progress__shine" aria-hidden="true" />
    </div>
  </div>;
}
