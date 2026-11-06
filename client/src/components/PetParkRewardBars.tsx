import { useEffect, useState } from "react";
import { parkNextRewardProgress, type ParkRewardRates, type ParkRewardTiming, type ParkRewardRate } from "@/lib/petParkRewardProgress";

/** Compact HUD shown only when an equipped pet spot is open.
 * Three different fill colors match Pet Park's forest green and gold theme.
 * Numbers are progress toward the next actual reward increment, not totals
 * potentially already collected or an invented reward cap.
 */
export default function PetParkRewardBars({
  timing, rates, serverNow,
}: { timing: ParkRewardTiming; rates: ParkRewardRates; serverNow?: string }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const serverStamp = serverNow ? Date.parse(serverNow) : NaN;
  // Server clocks own reward accrual; synchronize the displayed estimate with
  // the most recently fetched server timestamp. No separate polling request.
  const clockOffset = Number.isFinite(serverStamp) ? serverStamp - tick : 0;
  const now = tick + clockOffset;
  const bars: { kind: ParkRewardRate; name: string; color: string; glow: string }[] = [
    { kind: "coins", name: "Coins", color: "linear-gradient(90deg,#91701e,#f5c85a)", glow: "rgba(245,200,90,.45)" },
    { kind: "essence", name: "Essence", color: "linear-gradient(90deg,#564082,#bd9aec)", glow: "rgba(189,154,236,.34)" },
    { kind: "petXp", name: "Pet XP", color: "linear-gradient(90deg,#13645c,#53c6a0)", glow: "rgba(83,198,160,.35)" },
  ];
  return <section aria-label="Pet Park reward progress" data-testid="pet-park-reward-bars"
    className="space-y-2 rounded-xl border border-[#ac8948]/55 bg-[#071d14]/70 px-3 py-3 shadow-[inset_0_1px_8px_rgba(0,0,0,.35)]">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-fantasy text-sm font-semibold text-[#f5d77b]">Park rewards</h3>
      <span className="text-[10px] text-amber-100/65">{timing.pausedAt ? "Earning paused" : "Earning while equipped"}</span>
    </div>
    {bars.map(({ kind, name, color, glow }) => {
      const meter = parkNextRewardProgress(kind, timing, rates, now);
      const percent = Math.round(meter.progress * 100);
      return <div key={kind} className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-amber-100">{name}</span>
          <span className="tabular-nums text-amber-100/65">
            {meter.disabled ? "Not earning" : meter.paused ? "Paused" : `Next +${meter.nextUnits} in ${meter.secondsRemaining}s`}
          </span>
        </div>
        <div role="progressbar" aria-label={`${name} toward next reward`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={percent}
          className="relative h-2.5 overflow-hidden rounded-full border border-[#d6bb78]/25 bg-[#07140f] shadow-[inset_0_1px_3px_rgba(0,0,0,.8)]">
          <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-linear"
            style={{ width: `${percent}%`, background: color, boxShadow: `0 0 7px ${glow}` }}>
            <span className="absolute inset-x-0 top-0 h-[45%] rounded-full bg-white/20" />
          </span>
        </div>
      </div>;
    })}
    <p className="text-[10px] leading-tight text-amber-100/50">Progress toward each next reward increment. Collecting does not interrupt earning.</p>
  </section>;
}
