import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Pencil, Power, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ItemPickerModal, type ShopItemFull } from "@/components/ItemDatabaseSection";
import type { CardDefinition } from "@/lib/cardCatalog";

interface AdminCode {
  id: string;
  code: string;
  active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  created_at: string;
  bundle_name: string;
  message: string | null;
  coin_amount: number;
  redemption_count: number;
  shop_item_ids?: string[];
  cards?: Array<{ cardId: string; quantity: number }>;
}

export default function RedeemCodeAdminPanel() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [coins, setCoins] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [items, setItems] = useState<Array<{ item: ShopItemFull; qty: number }>>([]);
  const [cards, setCards] = useState<Array<{ card: CardDefinition; qty: number }>>([]);
  const [showPicker, setShowPicker] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: codes = [], isLoading } = useQuery<AdminCode[]>({ queryKey: ["/api/admin/redeem-codes"] });
  const { data: catalog = [] } = useQuery<ShopItemFull[]>({ queryKey: ["/api/admin/shop-items-all"] });
  const { data: cardCatalog = [] } = useQuery<CardDefinition[]>({ queryKey: ["/api/admin/cards"] });

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setName("");
    setMessage("");
    setCoins("");
    setMaxRedemptions("");
    setItems([]);
    setCards([]);
    setShowPicker(false);
  };

  const buildPayload = () => ({
    code,
    name,
    message: message || undefined,
    coinAmount: Number(coins) || 0,
    shopItemIds: items.flatMap(({ item, qty }) =>
      Array.from({ length: Math.max(1, Math.min(999, qty)) }, () => item.id)
    ),
    cards: cards.map(({ card, qty }) => ({
      cardId: card.id,
      quantity: Math.max(1, Math.min(999, qty)),
    })),
    maxRedemptions: Number(maxRedemptions),
  });

  const saveCode = useMutation({
    mutationFn: async () => {
      const response = editingId
        ? await apiRequest("PUT", `/api/admin/redeem-codes/${editingId}`, buildPayload())
        : await apiRequest("POST", "/api/admin/redeem-codes", buildPayload());
      return response.json();
    },
    onSuccess: async () => {
      const wasEditing = !!editingId;
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] });
      toast({
        title: wasEditing ? "Redeem Code Updated" : "Redeem Code Created",
        description: wasEditing
          ? "The code and its reward bundle were updated."
          : "Verified players can now use it once each.",
      });
    },
    onError: (error: Error) => toast({
      title: editingId ? "Could Not Edit Code" : "Could Not Create Code",
      description: readableError(error),
      variant: "destructive",
    }),
  });

  const toggleCode = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/redeem-codes/${id}`, { active });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] }),
    onError: (error: Error) => toast({ title: "Could Not Update Code", description: readableError(error), variant: "destructive" }),
  });

  const deleteCode = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/redeem-codes/${id}`);
      return response.json();
    },
    onSuccess: async (_data, id) => {
      if (editingId === id) resetForm();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] });
      toast({ title: "Redeem Code Deleted", description: "The code can no longer be redeemed." });
    },
    onError: (error: Error) => toast({ title: "Could Not Delete Code", description: readableError(error), variant: "destructive" }),
  });

  const beginEdit = (entry: AdminCode) => {
    if (Number(entry.redemption_count) > 0) {
      toast({
        title: "Editing Locked",
        description: "A redeem code cannot be edited after its first redemption.",
        variant: "destructive",
      });
      return;
    }

    const itemCounts = new Map<string, number>();
    for (const id of entry.shop_item_ids ?? []) itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1);
    const resolvedItems: Array<{ item: ShopItemFull; qty: number }> = [];
    for (const [id, qty] of itemCounts) {
      const item = catalog.find(candidate => candidate.id === id);
      if (!item) {
        toast({ title: "Cannot Edit This Code", description: "One of its reward items no longer exists in the catalog.", variant: "destructive" });
        return;
      }
      resolvedItems.push({ item, qty });
    }

    const resolvedCards: Array<{ card: CardDefinition; qty: number }> = [];
    for (const rewardCard of entry.cards ?? []) {
      const card = cardCatalog.find(candidate => candidate.id === rewardCard.cardId);
      if (!card) {
        toast({ title: "Cannot Edit This Code", description: "One of its reward cards no longer exists in the catalog.", variant: "destructive" });
        return;
      }
      resolvedCards.push({ card, qty: rewardCard.quantity });
    }

    setEditingId(entry.id);
    setCode(entry.code);
    setName(entry.bundle_name);
    setMessage(entry.message ?? "");
    setCoins(String(Number(entry.coin_amount || 0)));
    setMaxRedemptions(entry.max_redemptions === null ? "" : String(entry.max_redemptions));
    setItems(resolvedItems);
    setCards(resolvedCards);
  };

  const handleDelete = (entry: AdminCode) => {
    const redeemed = Number(entry.redemption_count) > 0;
    const warning = redeemed
      ? `Delete ${entry.code}? Existing rewards already delivered to players will stay intact, but this code will be permanently removed.`
      : `Delete ${entry.code}? This code has not been redeemed and this cannot be undone.`;
    if (window.confirm(warning)) deleteCode.mutate(entry.id);
  };

  const canSave = code.trim().length >= 3
    && name.trim().length > 0
    && Number.isSafeInteger(Number(maxRedemptions))
    && Number(maxRedemptions) >= 1
    && Number(maxRedemptions) <= 1_000_000
    && ((Number(coins) || 0) > 0 || items.length > 0 || cards.length > 0);

  const inputStyle = { background: "rgba(242,232,208,.94)", border: "1px solid #8b5e3c", color: "#2a1a0a" };

  return (
    <div className="space-y-4" data-testid="admin-redeem-code-panel">
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(145deg,rgba(35,16,64,.92),rgba(15,42,31,.94))", border: "1px solid rgba(192,132,252,.38)", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Gift size={18} color="#c4b5fd" />
          <h3 className="font-fantasy text-[#e0d0f0] text-sm tracking-widest">{editingId ? "Edit Redeem Code" : "Create Redeem Code"}</h3>
        </div>
        <p className="font-fantasy text-[#a89878] text-[9px] mb-4">
          {editingId
            ? "Codes can only be edited before their first redemption. Saving updates this code and its reward bundle."
            : "Set how many verified accounts may use this code. Each account can use it once, and can use other codes too."}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input data-testid="input-admin-redeem-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={32} placeholder="CODE (EX: MOON-GIFT)" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <input data-testid="input-admin-code-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Reward name" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <input data-testid="input-admin-code-coins" value={coins} onChange={e => setCoins(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Coins (optional)" className="rounded-md px-3 py-2 font-fantasy text-xs outline-none" style={inputStyle} />
          <label className="font-fantasy text-[9px] text-[#a89878]">
            Number of redemptions
            <input data-testid="input-admin-code-max-redemptions" type="number" min="1" max="1000000" step="1" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="e.g. 100" className="block w-full mt-1 rounded-md px-3 py-2 font-sans text-xs outline-none" style={inputStyle} />
          </label>
        </div>

        <textarea data-testid="input-admin-code-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder="Message shown with the reward (optional)" className="w-full mt-2 rounded-md px-3 py-2 font-sans text-xs outline-none resize-none" rows={2} style={inputStyle} />

        {items.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{items.map(({ item, qty }, index) => <div key={item.id} className="flex items-center gap-1 rounded-md px-2 py-1" style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(212,168,67,.28)" }}><span className="font-fantasy text-[#f0c040] text-[9px]">{item.name}</span><input aria-label={`${item.name} quantity`} value={qty} onChange={e => setItems(prev => prev.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : entry))} inputMode="numeric" className="w-10 rounded px-1 text-center text-[10px]" style={inputStyle} /><button aria-label={`Remove ${item.name}`} onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}><X size={12} color="#d98b8b" /></button></div>)}</div>}

        {cards.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{cards.map(({ card, qty }, index) => <div key={card.id} className="flex items-center gap-1 rounded-md px-2 py-1" style={{ background: "rgba(246,211,101,.1)", border: "1px solid rgba(246,211,101,.35)" }}><span className="font-fantasy text-[#f6d365] text-[9px]">{card.name} · {card.rarity}★</span><input aria-label={`${card.name} quantity`} value={qty} onChange={e => setCards(prev => prev.map((entry, i) => i === index ? { ...entry, qty: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : entry))} inputMode="numeric" className="w-10 rounded px-1 text-center text-[10px]" style={inputStyle} /><button aria-label={`Remove ${card.name}`} onClick={() => setCards(prev => prev.filter((_, i) => i !== index))}><X size={12} color="#d98b8b" /></button></div>)}</div>}

        <div className="flex gap-2 mt-3">
          <button data-testid="button-admin-code-add-item" onClick={() => setShowPicker(true)} className="flex-1 rounded-md py-2 font-fantasy text-[10px] tracking-wider" style={{ background: "rgba(10,40,25,.8)", border: "1px dashed rgba(110,231,183,.45)", color: "#6ee7b7" }}>+ Add Reward</button>
          {editingId && (
            <button data-testid="button-admin-cancel-code-edit" onClick={resetForm} disabled={saveCode.isPending} className="rounded-md px-3 py-2 font-fantasy text-[10px] tracking-wider disabled:opacity-40" style={{ background: "rgba(90,70,70,.45)", border: "1px solid rgba(180,140,140,.35)", color: "#d9b8b8" }}>Cancel</button>
          )}
          <button data-testid={editingId ? "button-admin-save-code" : "button-admin-create-code"} disabled={!canSave || saveCode.isPending} onClick={() => saveCode.mutate()} className="flex-1 rounded-md py-2 font-fantasy text-[10px] tracking-wider disabled:opacity-40" style={{ background: "linear-gradient(135deg,rgba(120,80,200,.8),rgba(55,105,65,.8))", border: "1px solid rgba(192,132,252,.55)", color: "#efe1ff" }}>
            {saveCode.isPending ? (editingId ? "Saving…" : "Creating…") : (editingId ? "Save Changes" : "Create Code")}
          </button>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: "rgba(5,20,14,.88)", border: "1px solid rgba(192,132,252,.25)" }}>
        <h3 className="font-fantasy text-[#c4b5fd] text-xs tracking-widest mb-3">Existing Codes</h3>
        {isLoading ? <p className="font-fantasy text-[#a89878] text-[10px]">Loading codes…</p> : codes.length === 0 ? <p className="font-fantasy text-[#a89878] text-[10px]">No redeem codes have been created yet.</p> : <div className="space-y-2">{codes.map(entry => {
          const expired = !!entry.expires_at && new Date(entry.expires_at) <= new Date();
          const redemptionCount = Number(entry.redemption_count || 0);
          const usedUp = entry.max_redemptions !== null && redemptionCount >= entry.max_redemptions;
          const canEdit = redemptionCount === 0;
          return <div key={entry.id} data-testid={`admin-code-${entry.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: editingId === entry.id ? "rgba(100,70,150,.18)" : "rgba(0,0,0,.3)", border: `1px solid ${entry.active && !expired && !usedUp ? "rgba(110,231,183,.28)" : "rgba(140,120,110,.2)"}` }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-fantasy text-[#f0c040] text-xs tracking-wider">{entry.code}</span>
                {entry.active && !expired && !usedUp ? <Check size={11} color="#6ee7b7" /> : null}
              </div>
              <p className="font-fantasy text-[#b9aa8c] text-[9px] truncate">{entry.bundle_name} · {Number(entry.coin_amount || 0).toLocaleString()} coins · {redemptionCount}{entry.max_redemptions === null ? " redeemed (no limit)" : ` / ${entry.max_redemptions} redeemed`}{usedUp ? " · limit reached" : expired ? " · expired" : ""}</p>
              {!canEdit && <p className="font-fantasy text-[#8f7f72] text-[8px] mt-0.5">Editing locked after first redemption</p>}
            </div>

            <button
              data-testid={`button-edit-code-${entry.id}`}
              aria-label={`Edit ${entry.code}`}
              onClick={() => beginEdit(entry)}
              disabled={!canEdit || saveCode.isPending || deleteCode.isPending}
              className="rounded-full p-2 disabled:opacity-30"
              title={canEdit ? "Edit code" : "Cannot edit after a redemption"}
              style={{ background: "rgba(192,132,252,.1)", border: "1px solid rgba(192,132,252,.25)" }}
            >
              <Pencil size={13} color="#c4b5fd" />
            </button>

            <button data-testid={`button-toggle-code-${entry.id}`} onClick={() => toggleCode.mutate({ id: entry.id, active: !entry.active })} disabled={toggleCode.isPending || deleteCode.isPending} className="rounded-full p-2 disabled:opacity-40" title={entry.active ? "Deactivate code" : "Activate code"} style={{ background: entry.active ? "rgba(110,231,183,.1)" : "rgba(130,110,100,.12)", border: "1px solid rgba(192,132,252,.25)" }}><Power size={14} color={entry.active ? "#6ee7b7" : "#a89878"} /></button>

            <button
              data-testid={`button-delete-code-${entry.id}`}
              aria-label={`Delete ${entry.code}`}
              onClick={() => handleDelete(entry)}
              disabled={deleteCode.isPending}
              className="rounded-full p-2 disabled:opacity-40"
              title="Delete code"
              style={{ background: "rgba(185,70,70,.1)", border: "1px solid rgba(210,100,100,.25)" }}
            >
              <Trash2 size={13} color="#d98b8b" />
            </button>
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
