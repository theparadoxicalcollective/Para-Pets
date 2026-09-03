import { CLEARING_BLESSINGS, type ClearingBlessingId } from "@shared/clearingBlessings";
import { useState, type ReactNode } from "react";
import { CLEARING_BOSS_ENCOUNTER } from "@shared/clearingConfig";
import type { ClearingHuntSummary } from "@/lib/clearingHuntSummary";
import progressBarUrl from "@assets/uploads/ElysianClearingProgressBar.png";
import "./clearingHuntHud.css";

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
  children?: ReactNode;
}

export default function ClearingHuntHud({ regularDefeats, phase, complete, hunt, blessing, blessingAvailable, onChooseBlessing, onContinue, onReturn, children }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const target = CLEARING_BOSS_ENCOUNTER.regularDefeatThreshold;
  const progress = complete || phase !== "regular" ? target : Math.min(target, Math.max(0, regularDefeats));
  const label = complete ? "Boss defeated" : phase === "active" ? "Defeat the Clearing boss" : phase === "preparing" ? "Something is stirring…" : "Bayou Stirring";

  return <div data-interactive className="pointer-events-auto" onPointerDown={event => event.stopPropagation()}>
    <section aria-label="Bayou hunt progress" className="text-amber-100">
      <div className="clearing-hunt-art">
        <img src={progressBarUrl} alt="" aria-hidden draggable={false} className="pointer-events-none block h-auto w-full" />
        <span role="status" className="clearing-hunt-label">{label}</span>
        <span className="clearing-hunt-count tabular-nums">{progress}/{target}</span>
        <div role="progressbar" aria-label="Progress toward the Clearing boss" aria-valuemin={0} aria-valuemax={target} aria-valuenow={progress} className="clearing-hunt-track">
          <div className="clearing-hunt-fill h-full rounded-full transition-[width] motion-reduce:transition-none" style={{ width: `${progress / target * 100}%` }} />
        </div>
      </div>
      {children}

      {!complete && blessing && <div className="clearing-blessing-pill mt-1.5" title={CLEARING_BLESSINGS[blessing].description}>
        <span aria-hidden="true">✦</span>
        <span>{CLEARING_BLESSINGS[blessing].name}</span>
        <span className="text-emerald-100/55">this hunt</span>
      </div>}

      {!complete && blessingAvailable && <button type="button" className="clearing-blessing-button mt-1.5 min-h-10 w-full rounded-lg border border-amber-200/45 bg-amber-300/95 px-3 text-xs font-bold text-emerald-950 shadow-md" onClick={onChooseBlessing}>
        Choose Clearing blessing
      </button>}

      {complete && <div className="mt-1.5">
        <button type="button" aria-expanded={!collapsed} aria-controls="clearing-hunt-results" className="clearing-results-toggle min-h-10 w-full rounded-lg border border-amber-300/35 bg-emerald-950/80 px-3 text-xs font-bold shadow-md" onClick={() => setCollapsed(value => !value)}>
          {collapsed ? "Boss defeated · View rewards" : "Hide rewards"}
        </button>
        {!collapsed && <div id="clearing-hunt-results" className="clearing-hunt-results mt-1.5 overflow-y-auto rounded-xl border border-amber-300/35 bg-emerald-950/92 px-3 py-3 shadow-lg">
          <p className="text-center font-fantasy text-base text-amber-200">{hunt.bossName || "Clearing boss"} defeated</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-black/20 p-2"><dt className="text-emerald-100/70">Pet EXP earned</dt><dd className="mt-1 text-base font-bold">+{hunt.exp}</dd></div>
            <div className="rounded-lg bg-black/20 p-2"><dt className="text-emerald-100/70">Enemies defeated</dt><dd className="mt-1 text-base font-bold">{hunt.enemyIds.length}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-emerald-100/70">Collected this hunt</p>
          <p className="mt-1 text-xs">{hunt.coins} Coins · {hunt.essence} Essence · {hunt.gear} Gear{hunt.collectedEggIds.length > 0 ? ` · ${hunt.collectedEggIds.length} Egg` : ""}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/70">The next fight is paused. Collect remaining drops before they expire or you leave.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-amber-300 px-2 text-xs font-bold text-emerald-950" onClick={() => { setCollapsed(true); onContinue(); }}>Hunt Again</button>
            <button type="button" className="min-h-11 rounded-xl border border-amber-300/40 px-2 text-xs font-bold" onClick={onReturn}>Return to Bayou</button>
          </div>
        </div>}
      </div>}
    </section>
  </div>;
}
