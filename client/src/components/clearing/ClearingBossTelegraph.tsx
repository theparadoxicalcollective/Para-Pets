import { CLEARING_BOSS_ATTACK, type ClearingBossAttack } from "@/lib/clearingBossAttack";

export default function ClearingBossTelegraph({ attack, boss }: { attack: ClearingBossAttack; boss: { x: number; y: number } }) {
  if (attack.phase === "recovery") return <div role="status" className="absolute pointer-events-none whitespace-nowrap rounded bg-emerald-950/95 px-2 py-1 text-[10px] font-bold text-emerald-100" style={{ left: `${boss.x * 100}%`, top: `${boss.y * 100}%`, transform: "translate(-50%, -84px)", zIndex: 2000 }}>Recovering · Strike!</div>;
  if (attack.phase !== "telegraph") return null;
  const progress = 1 - attack.remainingMs / CLEARING_BOSS_ATTACK.warningMs;
  return <div data-testid="clearing-boss-telegraph" className="absolute pointer-events-none rounded-full border-[3px] border-orange-200 bg-red-700/35" style={{ left: `${attack.center.x * 100}%`, top: `${attack.center.y * 100}%`, width: CLEARING_BOSS_ATTACK.radiusPixels * 2, height: CLEARING_BOSS_ATTACK.radiusPixels * 2, transform: "translate(-50%,-50%)", zIndex: 4 }}>
    <div className="absolute inset-0 rounded-full bg-orange-400/35" style={{ transform: `scale(${progress})` }} />
    <span role="status" className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-red-950/95 px-2 py-1 text-[10px] font-bold text-orange-100">Bayou burst · Move out!</span>
  </div>;
}
