import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SendGiftModalProps {
  friendId: string;
  friendUsername: string;
  senderCoins: number;
  onClose: () => void;
}

type Tab = "coins" | "items";

interface InventoryItem {
  id: string;
  shopItemId: string;
  quantity: number | null;
  shopItem: {
    id: string;
    name: string;
    imageUrl: string | null;
    type: string;
  };
}

interface DecorItem {
  id: string;
  decorItemId: string;
  quantity: number;
  item: { id: string; name: string; imageUrl: string | null };
}

type SelectedItem =
  | { kind: "shop"; inv: InventoryItem }
  | { kind: "decor"; inv: DecorItem };

export default function SendGiftModal({ friendId, friendUsername, senderCoins, onClose }: SendGiftModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("coins");
  const [coinInput, setCoinInput] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: decorInventory = [] } = useQuery<DecorItem[]>({
    queryKey: ["/api/pet-house/decor/inventory"],
    queryFn: () => fetch("/api/pet-house/decor/inventory", { credentials: "include" }).then(r => r.json()),
  });

  const giftableItems = inventory.filter(i => i.shopItem?.type !== "pet");
  const giftableDecor = decorInventory.filter(d => d.quantity > 0);

  const sendMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/gifts/send", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-house/decor/inventory"] });
      toast({ title: "Gift sent!", description: `Your gift is on its way to ${friendUsername}` });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to send gift", description: err?.message ?? "Please try again", variant: "destructive" });
    },
  });

  function handleSend() {
    const coins = parseInt(coinInput || "0", 10) || 0;
    if (tab === "coins") {
      if (coins <= 0) return toast({ title: "Enter a coin amount", variant: "destructive" });
      if (coins > senderCoins) return toast({ title: "Not enough coins", variant: "destructive" });
      sendMutation.mutate({ receiverId: friendId, message: message.trim() || undefined, coinAmount: coins });
    } else {
      if (!selected) return toast({ title: "Select an item to gift", variant: "destructive" });
      if (selected.kind === "shop") {
        const inv = selected.inv;
        sendMutation.mutate({
          receiverId: friendId,
          message: message.trim() || undefined,
          coinAmount: 0,
          itemType: "shop_item",
          shopItemInventoryId: inv.id,
          shopItemId: inv.shopItemId,
          itemQuantity: 1,
          itemName: inv.shopItem.name,
          itemImageUrl: inv.shopItem.imageUrl ?? undefined,
        });
      } else {
        const inv = selected.inv;
        sendMutation.mutate({
          receiverId: friendId,
          message: message.trim() || undefined,
          coinAmount: 0,
          itemType: "decor",
          decorItemId: inv.decorItemId,
          itemQuantity: 1,
          itemName: inv.item.name,
          itemImageUrl: inv.item.imageUrl ?? undefined,
        });
      }
    }
  }

  const coinVal = parseInt(coinInput || "0", 10) || 0;
  const canSend = tab === "coins" ? coinVal > 0 && coinVal <= senderCoins : !!selected;

  return (
    <>
      <div className="fixed inset-0 z-[99997]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        data-testid="send-gift-modal"
        className="fixed z-[99998] flex flex-col"
        style={{
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300, maxHeight: "82vh",
          background: "linear-gradient(160deg, rgba(4,14,8,0.99) 0%, rgba(3,10,6,0.99) 100%)",
          border: "1.5px solid rgba(127,255,212,0.22)",
          borderRadius: 18,
          boxShadow: "0 12px 60px rgba(0,0,0,0.9)",
          padding: "18px 16px 20px",
          display: "flex", flexDirection: "column",
        }}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(127,255,212,0.4)", fontSize: 20 }}
        >×</button>

        <p className="font-fantasy font-semibold mb-1" style={{ color: "#f0e8c8", fontSize: 13, letterSpacing: "0.05em" }}>
          Send Gift to {friendUsername}
        </p>
        <p className="font-fantasy mb-3" style={{ fontSize: 9, color: "rgba(127,255,212,0.5)", letterSpacing: "0.15em" }}>
          YOUR BALANCE: {senderCoins.toLocaleString()} coins
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          {(["coins", "items"] as Tab[]).map((t) => (
            <button
              key={t}
              data-testid={`tab-gift-${t}`}
              onClick={() => { setTab(t); setSelected(null); }}
              className="flex-1 font-fantasy"
              style={{
                padding: "6px 0",
                borderRadius: 8,
                fontSize: 10,
                letterSpacing: "0.1em",
                border: tab === t ? "1.5px solid rgba(127,255,212,0.55)" : "1px solid rgba(127,255,212,0.15)",
                background: tab === t ? "rgba(127,255,212,0.12)" : "rgba(127,255,212,0.03)",
                color: tab === t ? "#7fffd4" : "rgba(127,255,212,0.4)",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {t === "coins" ? "🪙 Coins" : "🎁 Items"}
            </button>
          ))}
        </div>

        {tab === "coins" && (
          <div className="mb-3">
            <p className="font-fantasy mb-1" style={{ fontSize: 9, color: "rgba(127,255,212,0.6)", letterSpacing: "0.15em" }}>AMOUNT</p>
            <input
              data-testid="input-gift-coins"
              type="number"
              min={1}
              max={senderCoins}
              value={coinInput}
              onChange={(e) => setCoinInput(e.target.value)}
              placeholder="Enter coin amount…"
              className="font-fantasy w-full"
              style={{
                padding: "8px 10px",
                borderRadius: 9,
                background: "rgba(127,255,212,0.06)",
                border: "1px solid rgba(127,255,212,0.2)",
                color: "#d4e8da",
                fontSize: 12,
                outline: "none",
              }}
            />
            {coinVal > senderCoins && (
              <p className="font-fantasy mt-1" style={{ fontSize: 9, color: "#f87171" }}>Exceeds your balance</p>
            )}
          </div>
        )}

        {tab === "items" && (
          <div className="mb-3" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {giftableItems.length === 0 && giftableDecor.length === 0 ? (
              <p className="font-fantasy text-center py-4" style={{ fontSize: 10, color: "rgba(127,255,212,0.4)" }}>No giftable items in inventory</p>
            ) : (
              <div className="flex flex-col gap-1">
                {giftableItems.map((inv) => {
                  const isSelected = selected?.kind === "shop" && selected.inv.id === inv.id;
                  return (
                    <button
                      key={inv.id}
                      data-testid={`gift-item-shop-${inv.id}`}
                      onClick={() => setSelected(isSelected ? null : { kind: "shop", inv })}
                      className="flex items-center gap-2 text-left"
                      style={{
                        padding: "7px 9px",
                        borderRadius: 10,
                        border: isSelected ? "1.5px solid rgba(127,255,212,0.6)" : "1px solid rgba(127,255,212,0.12)",
                        background: isSelected ? "rgba(127,255,212,0.1)" : "rgba(127,255,212,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      {inv.shopItem.imageUrl ? (
                        <img src={inv.shopItem.imageUrl} alt={inv.shopItem.name} style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(127,255,212,0.08)", flexShrink: 0 }} />
                      )}
                      <div className="min-w-0">
                        <p className="font-fantasy truncate" style={{ fontSize: 11, color: "#d4e8da" }}>{inv.shopItem.name}</p>
                        {(inv.quantity ?? 1) > 1 && (
                          <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.5)" }}>×{inv.quantity}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {giftableDecor.map((inv) => {
                  const isSelected = selected?.kind === "decor" && selected.inv.id === inv.id;
                  return (
                    <button
                      key={inv.id}
                      data-testid={`gift-item-decor-${inv.id}`}
                      onClick={() => setSelected(isSelected ? null : { kind: "decor", inv })}
                      className="flex items-center gap-2 text-left"
                      style={{
                        padding: "7px 9px",
                        borderRadius: 10,
                        border: isSelected ? "1.5px solid rgba(127,255,212,0.6)" : "1px solid rgba(127,255,212,0.12)",
                        background: isSelected ? "rgba(127,255,212,0.1)" : "rgba(127,255,212,0.03)",
                        cursor: "pointer",
                      }}
                    >
                      {inv.item.imageUrl ? (
                        <img src={inv.item.imageUrl} alt={inv.item.name} style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(127,255,212,0.08)", flexShrink: 0 }} />
                      )}
                      <div className="min-w-0">
                        <p className="font-fantasy truncate" style={{ fontSize: 11, color: "#d4e8da" }}>{inv.item.name}</p>
                        <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.4)" }}>Decor ×{inv.quantity}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Message */}
        <div className="mb-3">
          <p className="font-fantasy mb-1" style={{ fontSize: 9, color: "rgba(127,255,212,0.6)", letterSpacing: "0.15em" }}>MESSAGE (OPTIONAL)</p>
          <textarea
            data-testid="input-gift-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 500))}
            placeholder="Write a message…"
            rows={2}
            className="font-fantasy w-full resize-none"
            style={{
              padding: "8px 10px",
              borderRadius: 9,
              background: "rgba(127,255,212,0.06)",
              border: "1px solid rgba(127,255,212,0.2)",
              color: "#d4e8da",
              fontSize: 11,
              outline: "none",
            }}
          />
          <p className="font-fantasy text-right" style={{ fontSize: 8, color: "rgba(127,255,212,0.3)", marginTop: 2 }}>{message.length}/500</p>
        </div>

        <button
          data-testid="button-send-gift"
          onClick={handleSend}
          disabled={!canSend || sendMutation.isPending}
          className="font-fantasy tracking-wider w-full"
          style={{
            padding: "10px 0",
            borderRadius: 10,
            background: canSend && !sendMutation.isPending
              ? "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)"
              : "rgba(127,255,212,0.04)",
            border: canSend ? "1.5px solid rgba(74,222,128,0.5)" : "1px solid rgba(127,255,212,0.1)",
            color: canSend ? "#4ade80" : "rgba(127,255,212,0.3)",
            cursor: canSend ? "pointer" : "not-allowed",
            fontSize: 11,
            letterSpacing: "0.12em",
          }}
        >
          {sendMutation.isPending ? "Sending…" : "Send Gift 🎁"}
        </button>
      </div>
    </>
  );
}
