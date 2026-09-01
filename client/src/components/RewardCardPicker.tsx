import { useQuery } from "@tanstack/react-query";
import type { CardDefinition } from "@/lib/cardCatalog";

export interface SelectedRewardCard { cardId: string; quantity: number }
export default function RewardCardPicker({ selected, onChange }: {
  selected: SelectedRewardCard[]; onChange: (cards: SelectedRewardCard[]) => void;
}) {
  const { data: cards = [], isError } = useQuery<CardDefinition[]>({ queryKey: ["/api/admin/cards"] });
  return <div className="space-y-2">
    <label className="block text-xs text-[#c4b5fd]">Cards
      <select aria-label="Add card to reward bundle" value="" onChange={event => {
        if (event.target.value) onChange([...selected, { cardId: event.target.value, quantity: 1 }]);
      }} disabled={selected.length >= 100} className="mt-1 w-full rounded-md border border-purple-400/30 bg-[#21132d] p-2 text-sm text-white">
        <option value="">Choose a card…</option>
        {cards.filter(card => !selected.some(entry => entry.cardId === card.id)).map(card => <option key={card.id} value={card.id}>{card.name} ({card.rarity}★)</option>)}
      </select>
    </label>
    {isError && <p role="alert" className="text-xs text-red-300">Could not load cards. Please reopen Rewards to retry.</p>}
    {selected.map(entry => <div key={entry.cardId} className="flex items-center gap-2 rounded-md bg-purple-400/10 p-2">
      <span className="min-w-0 flex-1 truncate text-xs text-purple-100">{cards.find(card => card.id === entry.cardId)?.name ?? "Card"}</span>
      <input aria-label={`Quantity for ${cards.find(card => card.id === entry.cardId)?.name ?? "card"}`} type="number" min={1} max={999} value={entry.quantity}
        onChange={event => onChange(selected.map(item => item.cardId === entry.cardId ? { ...item, quantity: Math.max(1, Math.min(999, Math.floor(Number(event.target.value) || 1))) } : item))}
        className="w-16 rounded bg-white p-1 text-center text-black" />
      <button type="button" aria-label={`Remove ${cards.find(card => card.id === entry.cardId)?.name ?? "card"}`} onClick={() => onChange(selected.filter(item => item.cardId !== entry.cardId))} className="p-2 text-red-300">×</button>
    </div>)}
  </div>;
}
