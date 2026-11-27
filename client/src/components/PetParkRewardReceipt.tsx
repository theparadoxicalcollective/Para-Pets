import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { currencyAssets } from "@/lib/currencyAssets";
import type { PetParkRewardAmounts } from "@shared/petParkAccrual";

export type ParkRewardReceipt = { id: number; rewards: PetParkRewardAmounts };

/** Non-blocking, viewport-level receipt. Never animates guessed amounts. */
export default function PetParkRewardReceipt({ receipt, onDismiss }: {
  receipt: ParkRewardReceipt | null;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => onDismiss(receipt.id), 6000);
    return () => window.clearTimeout(timer);
  }, [receipt, onDismiss]);
  const amounts = receipt?.rewards;
  return <div role="status" aria-live="polite" aria-atomic="true"
    className="pointer-events-none absolute inset-x-3 top-[max(70px,env(safe-area-inset-top))] z-[80] mx-auto max-w-sm">
    {receipt && amounts && <div key={receipt.id} data-testid="pet-park-reward-receipt"
      className="pet-park-reward-receipt rounded-2xl border-2 border-[#d7b45e] bg-[#102e20] px-3 py-3 text-center text-amber-100 shadow-2xl">
      <h2 className="font-fantasy text-base font-bold text-[#f9df95]">
        <span className="pet-park-reward-receipt__spark" aria-hidden="true">✦ </span>
        {amounts.coins || amounts.essence || amounts.petXp ? "Rewards collected!" : "No rewards ready yet"}
      </h2>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {([
          { kind: "coins", name: "Coins", image: currencyAssets.coin },
          { kind: "essence", name: "Essence", image: currencyAssets.essenceToken },
          { kind: "petXp", name: "Pet XP", image: null },
        ] as const).map(({ kind, name, image }) => <div key={kind}
          className="pet-park-reward-receipt__amount flex min-w-0 flex-col items-center rounded-lg bg-[#061c13]/75 px-1 py-2">
          {image ? <img src={image} alt="" className="h-7 w-7 object-contain" /> : <Sparkles className="h-7 w-7 text-emerald-300" aria-hidden="true" />}
          <span data-testid={`pet-park-claimed-${kind}`} className="max-w-full break-all text-sm font-bold tabular-nums text-[#f9df95]">+{amounts[kind].toLocaleString()}</span>
          <span className="text-[11px] text-amber-100/80">{name}</span>
        </div>)}
      </div>
    </div>}
  </div>;
}
