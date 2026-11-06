import { useEffect, useMemo, useState } from "react";
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
  // Anchor once per scene response, then let the 1s tick advance locally.
  // Recomputing the offset on every tick would freeze the progress bars.
  const clockOffset = useMemo(() => {
    const serverStamp = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isFinite(serverStamp) ? serverStamp - Date.now() : 0;
  }, [serverNow]);
  const now = tick + clockOffset;
  const bars: { kind: ParkRewardRate; name: string; color: string; glow: string }[] = [
    { kind: "coins", name: "Coins", color: "linear-gradient(90deg,#91701e,#f5c85a)", glow: "rgba(245,200,90,.45)" },
    { kind: "essence", name: "Essence", color: "linear-gradient(90deg,#564082,#bd9aec)", glow: "rgba(189,154,236,.34)" },
    { kind: "petXp", name: "Pet XP", color: "linear-gradient(90deg,#13645c,#53c6a0)", glow: "rgba(83,198,160,.35)" },
  ];
  return <section aria-label="Pet Park reward progress" data-testid="pet-park-reward-bars"
    className="relative space-y-3 overflow-hidden rounded-xl border border-[#ac8948]/70 bg-[radial-gradient(ellipse_at_50%_0%,#24523a,#0b291c_72%)] px-3 py-3 shadow-[inset_0_1px_10px_rgba(0,0,0,.55)]">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-fantasy text-sm font-semibold tracking-wide text-[#f5d77b]"><span aria-hidden="true" className="mr-1 text-amber-300">✦</span> Park rewards</h3>
      <span className="text-[10px] text-amber-100/65">{timing.pausedAt ? "Earning paused" : "Earning while equipped"}</span>
    </div>
    {bars.map(({ kind, name, color, glow }) => {
      const meter = parkNextRewardProgress(kind, timing, rates, now);
      const percent = Math.round(meter.progress * 100);
      return <div key={kind} className="space-y-1 rounded-lg border border-[#c0a263]/25 bg-[#071b12]/45 px-2 py-2 shadow-[inset_0_1px_5px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-fantasy font-semibold tracking-wide text-amber-100"><span className="mr-1 text-[#d8b96a]" aria-hidden="true">◆</span>{name}</span>
          <span className="tabular-nums text-amber-100/65">
            {meter.disabled ? "Not earning" : meter.paused ? "Paused" : `Next +${meter.nextUnits} in ${meter.secondsRemaining >= 60 ? `${Math.floor(meter.secondsRemaining / 60)}m ${meter.secondsRemaining % 60}s` : `${meter.secondsRemaining}s`}`}
          </span>
        </div>
        <div role="progressbar" aria-label={`${name} toward next reward`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={percent}
          className="relative h-3 overflow-hidden rounded-full border border-[#c7a65e]/60 bg-[#06150e] shadow-[inset_0_1px_4px_rgba(0,0,0,.88),0_1px_2px_rgba(245,213,121,.12)]">
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
