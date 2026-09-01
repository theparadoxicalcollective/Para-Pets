import { CLEARING_BLESSINGS, type ClearingBlessingId } from "@shared/clearingBlessings";
import { useState } from "react";
import { CLEARING_BOSS_ENCOUNTER } from "@shared/clearingConfig";
import type { ClearingHuntSummary } from "@/lib/clearingHuntSummary";

interface Props {
  regularDefeats: number;
  phase: "regular" | "preparing" | "active";
  complete: boolean;
  hunt: ClearingHuntSummary;
  blessing?: ClearingBlessingId | null;
  blessingAvailable?: boolean;
  onChooseBlessing?: () => void;
  onContinue: () => void;
  onReturn: () => void;
}

export default function ClearingHuntHud({ regularDefeats, phase, complete, hunt, blessing, blessingAvailable, onChooseBlessing, onContinue, onReturn }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const target = CLEARING_BOSS_ENCOUNTER.regularDefeatThreshold;
  const progress = complete || phase !== "regular" ? target : Math.min(target, Math.max(0, regularDefeats));
  const label = complete ? "Hunt complete" : phase === "active" ? "Defeat the Clearing boss" : phase === "preparing" ? "Something is stirring…" : "Bayou Stirring";

  return <div data-interactive className="absolute left-1/2 w-[calc(100%-32px)] max-w-[320px] -translate-x-1/2 pointer-events-auto" style={{ top: "calc(var(--clearing-hud-top-row, max(42px, calc(env(safe-area-inset-top, 0px) + 42px))) + 52px)", zIndex: 19 }} onPointerDown={event => event.stopPropagation()}>
    <section aria-label="Bayou hunt progress" className="rounded-xl border border-amber-300/40 bg-emerald-950/95 px-3 py-2 text-amber-100 shadow-lg">
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span role="status">{label}</span>
        {!complete && phase === "regular" && <span className="tabular-nums">{progress}/{target}</span>}
        {complete && <button type="button" aria-expanded={!collapsed} aria-controls="clearing-hunt-results" className="min-h-9 rounded-lg border border-amber-300/30 px-2 text-[11px]" onClick={() => setCollapsed(value => !value)}>{collapsed ? "View results" : "Collect drops"}</button>}
      </div>
      <div role="progressbar" aria-label="Progress toward the Clearing boss" aria-valuemin={0} aria-valuemax={target} aria-valuenow={progress} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full bg-amber-300 transition-[width] motion-reduce:transition-none" style={{ width: `${progress / target * 100}%` }} />
      </div>
      {!complete && blessing && <p className="mt-2 text-[11px] text-emerald-100" title={CLEARING_BLESSINGS[blessing].description}>{CLEARING_BLESSINGS[blessing].name} · This hunt</p>}
      {!complete && blessingAvailable && <button type="button" className="mt-2 min-h-11 w-full rounded-lg bg-amber-300 px-2 text-xs font-bold text-emerald-950" onClick={onChooseBlessing}>Choose your blessing</button>}
      {complete && !collapsed && <div id="clearing-hunt-results" className="mt-3 max-h-[42dvh] overflow-y-auto border-t border-amber-300/20 pt-3">
        <p className="text-center font-fantasy text-base text-amber-200">{hunt.bossName || "Clearing boss"} defeated</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg bg-black/20 p-2"><dt className="text-emerald-100/70">Pet EXP earned</dt><dd className="mt-1 text-base font-bold">+{hunt.exp}</dd></div>
          <div className="rounded-lg bg-black/20 p-2"><dt className="text-emerald-100/70">Enemies defeated</dt><dd className="mt-1 text-base font-bold">{hunt.enemyIds.length}</dd></div>
        </dl>
        <p className="mt-3 text-[11px] text-emerald-100/70">Collected this hunt</p>
        <p className="mt-1 text-xs">{hunt.coins} Coins · {hunt.essence} Essence · {hunt.gear} Gear{hunt.collectedEggIds.length > 0 ? ` · ${hunt.collectedEggIds.length} Egg` : ""}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/70">The next fight is paused. Collect remaining drops before they expire or you leave.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="min-h-11 rounded-xl bg-amber-300 px-2 text-xs font-bold text-emerald-950" onClick={() => { setCollapsed(false); onContinue(); }}>Hunt Again</button>
          <button type="button" className="min-h-11 rounded-xl border border-amber-300/40 px-2 text-xs font-bold" onClick={onReturn}>Return to Bayou</button>
        </div>
      </div>}
    </section>
  </div>;
}
