import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Power, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ItemPickerModal, type ShopItemFull } from "@/components/ItemDatabaseSection";
import type { CardDefinition } from "@/lib/cardCatalog";

interface AdminCode {
  id: string;
  code: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  bundle_name: string;
  message: string | null;
  coin_amount: number;
  redemption_count: number;
}

export default function RedeemCodeAdminPanel() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [coins, setCoins] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [items, setItems] = useState<Array<{ item: ShopItemFull; qty: number }>>([]);
  const [cards, setCards] = useState<Array<{ card: CardDefinition; qty: number }>>([]);
  const [showPicker, setShowPicker] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: codes = [], isLoading } = useQuery<AdminCode[]>({ queryKey: ["/api/admin/redeem-codes"] });
  const { data: catalog = [] } = useQuery<ShopItemFull[]>({ queryKey: ["/api/admin/shop-items-all"] });
  const { data: cardCatalog = [] } = useQuery<CardDefinition[]>({ queryKey: ["/api/admin/cards"] });

  const createCode = useMutation({
    mutationFn: async () => {
      const shopItemIds = items.flatMap(({ item, qty }) => Array.from({ length: Math.max(1, Math.min(999, qty)) }, () => item.id));
      const response = await apiRequest("POST", "/api/admin/redeem-codes", {
        code, name, message: message || undefined, coinAmount: Number(coins) || 0,
        shopItemIds,
        cards: cards.map(({ card, qty }) => ({ cardId: card.id, quantity: Math.max(1, Math.min(999, qty)) })),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      return response.json();
    },
    onSuccess: async () => {
      setCode(""); setName(""); setMessage(""); setCoins(""); setExpiresAt(""); setItems([]); setCards([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] });
      toast({ title: "Redeem Code Created", description: "Verified players can now use it once each." });
    },
    onError: (error: Error) => toast({ title: "Could Not Create Code", description: readableError(error), variant: "destructive" }),
  });

  const toggleCode = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/redeem-codes/${id}`, { active });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] }),
    onError: (error: Error) => toast({ title: "Could Not Update Code", description: readableError(error), variant: "destructive" }),
  });

  const canCreate = code.trim().length >= 3 && name.trim().length > 0 && ((Number(coins) || 0) > 0 || items.length > 0 || cards.length > 0);
  const inputStyle = { background: "rgba(242,232,208,.94)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="space-y-4" data-testid="admin-redeem-code-panel">
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(145deg,rgba(35,16,64,.92),rgba(15,42,31,.94))", border: "1px solid rgba(192,132,252,.38)", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
        <div className="flex items-center gap-2 mb-1"><Gift size={18} color="#c4b5fd" /><h3 className="font-fantasy text-[#e0d0f0] text-sm tracking-widest">Create Redeem Code</h3></div>
        <p className="font-fantasy text-[#a89878] text-[9px] mb-4">Every verified account may redeem each active code one time.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input data-testid="input-admin-redeem-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={32} placeholder="CODE (EX: MOON-GIFT)" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <input data-testid="input-admin-code-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Reward name" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <input data-testid="input-admin-code-coins" value={coins} onChange={e => setCoins(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Coins (optional)" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <label className="font-fantasy text-[9px] text-[#a89878]">Optional expiration<input data-testid="input-admin-code-expiration" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="block w-full mt-1 rounded-md px-3 py-2 font-sans text-xs outline-none" style={inputStyle} /></label>
        </div>
        <textarea data-testid="input-admin-code-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder="Message shown with the reward (optional)" className="w-full mt-2 rounded-md px-3 py-2 font-sans text-xs outline-none resize-none" rows={2} style={inputStyle} />

        {items.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{items.map(({ item, qty }, index) => <div key={item.id} className="flex items-center gap-1 rounded-md px-2 py-1" style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(212,168,67,.28)" }}><span className="font-fantasy text-[#f0c040] text-[9px]">{item.name}</span><input aria-label={`${item.name} quantity`} value={qty} onChange={e => setItems(prev => prev.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : entry))} inputMode="numeric" className="w-10 rounded px-1 text-center text-[10px]" style={inputStyle} /><button aria-label={`Remove ${item.name}`} onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}><X size={12} color="#d98b8b" /></button></div>)}</div>}

        {cards.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{cards.map(({ card, qty }, index) => <div key={card.id} className="flex items-center gap-1 rounded-md px-2 py-1" style={{ background: "rgba(246,211,101,.1)", border: "1px solid rgba(246,211,101,.35)" }}><span className="font-fantasy text-[#f6d365] text-[9px]">{card.name} · {card.rarity}★</span><input aria-label={`${card.name} quantity`} value={qty} onChange={e => setCards(prev => prev.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : entry))} inputMode="numeric" className="w-10 rounded px-1 text-center text-[10px]" style={inputStyle} /><button aria-label={`Remove ${card.name}`} onClick={() => setCards(prev => prev.filter((_, i) => i !== index))}><X size={12} color="#d98b8b" /></button></div>)}</div>}

        <div className="flex gap-2 mt-3">
          <button data-testid="button-admin-code-add-item" onClick={() => setShowPicker(true)} className="flex-1 rounded-md py-2 font-fantasy text-[10px] tracking-wider" style={{ background: "rgba(10,40,25,.8)", border: "1px dashed rgba(110,231,183,.45)", color: "#6ee7b7" }}>+ Add Reward</button>
          <button data-testid="button-admin-create-code" disabled={!canCreate || createCode.isPending} onClick={() => createCode.mutate()} className="flex-1 rounded-md py-2 font-fantasy text-[10px] tracking-wider disabled:opacity-40" style={{ background: "linear-gradient(135deg,rgba(120,80,200,.8),rgba(55,105,65,.8))", border: "1px solid rgba(192,132,252,.55)", color: "#efe1ff" }}>{createCode.isPending ? "Creating…" : "Create Code"}</button>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: "rgba(5,20,14,.88)", border: "1px solid rgba(192,132,252,.25)" }}>
        <h3 className="font-fantasy text-[#c4b5fd] text-xs tracking-widest mb-3">Existing Codes</h3>
        {isLoading ? <p className="font-fantasy text-[#a89878] text-[10px]">Loading codes…</p> : codes.length === 0 ? <p className="font-fantasy text-[#a89878] text-[10px]">No redeem codes have been created yet.</p> : <div className="space-y-2">{codes.map(entry => {
          const expired = !!entry.expires_at && new Date(entry.expires_at) <= new Date();
          return <div key={entry.id} data-testid={`admin-code-${entry.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(0,0,0,.3)", border: `1px solid ${entry.active && !expired ? "rgba(110,231,183,.28)" : "rgba(140,120,110,.2)"}` }}>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="font-fantasy text-[#f0c040] text-xs tracking-wider">{entry.code}</span>{entry.active && !expired ? <Check size={11} color="#6ee7b7" /> : null}</div><p className="font-fantasy text-[#b9aa8c] text-[9px] truncate">{entry.bundle_name} · {Number(entry.coin_amount || 0).toLocaleString()} coins · {entry.redemption_count} redeemed{expired ? " · expired" : ""}</p></div>
            <button data-testid={`button-toggle-code-${entry.id}`} onClick={() => toggleCode.mutate({ id: entry.id, active: !entry.active })} disabled={toggleCode.isPending} className="rounded-full p-2" title={entry.active ? "Deactivate code" : "Activate code"} style={{ background: entry.active ? "rgba(110,231,183,.1)" : "rgba(130,110,100,.12)", border: "1px solid rgba(192,132,252,.25)" }}><Power size={14} color={entry.active ? "#6ee7b7" : "#a89878"} /></button>
          </div>;
        })}</div>}
      </div>

      {showPicker && <ItemPickerModal title="Select Code Reward" items={catalog} cards={cardCatalog.filter(card => !cards.some(entry => entry.card.id === card.id))} onSelect={item => { setItems(prev => { const found = prev.findIndex(entry => entry.item.id === item.id); return found >= 0 ? prev.map((entry, i) => i === found ? { ...entry, qty: Math.min(999, entry.qty + 1) } : entry) : [...prev, { item, qty: 1 }]; }); setShowPicker(false); }} onSelectCard={card => { setCards(prev => [...prev, { card, qty: 1 }]); setShowPicker(false); }} onClose={() => setShowPicker(false)} />}
    </div>
  );
}

function readableError(error: Error): string {
  const json = error.message.match(/\{.*\}$/)?.[0];
  if (json) { try { return JSON.parse(json).message || error.message; } catch {} }
  return error.message;
}
