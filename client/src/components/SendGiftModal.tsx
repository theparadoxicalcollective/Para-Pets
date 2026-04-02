import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import giftIconImg from "@assets/generated_images/gift_icon_forest.png";

interface SendGiftModalProps {
  friendId: string;
  friendUsername: string;
  senderCoins: number;
  onClose: () => void;
}

type Tab = "coins" | "items";
type Step = "compose" | "confirm" | "success";

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
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
  const [step, setStep] = useState<Step>("compose");
  const [tab, setTab] = useState<Tab>("coins");
  const [coinInput, setCoinInput] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: decorInventory = [] } = useQuery<DecorItem[]>({
    queryKey: ["/api/pet-house/decor/inventory"],
  });

  const giftableItems = inventory.filter(i => i.type !== "pet");
  const giftableDecor = decorInventory.filter(d => d.quantity > 0);

  const sendMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/gifts/send", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-house/decor/inventory"] });
      setStep("success");
    },
    onError: (err: any) => {
      toast({ title: "Failed to send gift", description: err?.message ?? "Please try again", variant: "destructive" });
      setStep("compose");
    },
  });

  const coinVal = parseInt(coinInput || "0", 10) || 0;
  const canSend = tab === "coins" ? coinVal > 0 && coinVal <= senderCoins : !!selected;

  function handleConfirm() {
    if (tab === "coins") {
      if (coinVal <= 0) return toast({ title: "Enter a coin amount", variant: "destructive" });
      if (coinVal > senderCoins) return toast({ title: "Not enough coins", variant: "destructive" });
    } else {
      if (!selected) return toast({ title: "Select an item to gift", variant: "destructive" });
    }
    setStep("confirm");
  }

  function handleSend() {
    if (tab === "coins") {
      sendMutation.mutate({ receiverId: friendId, message: message.trim() || undefined, coinAmount: coinVal });
    } else if (selected?.kind === "shop") {
      const inv = selected.inv;
      sendMutation.mutate({
        receiverId: friendId,
        message: message.trim() || undefined,
        coinAmount: 0,
        itemType: "shop_item",
        shopItemInventoryId: inv.inventoryId,
        shopItemId: inv.shopItemId,
        itemQuantity: 1,
        itemName: inv.name,
        itemImageUrl: inv.imageUrl ?? undefined,
      });
    } else if (selected?.kind === "decor") {
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

  const giftLabel = tab === "coins"
    ? `${coinVal.toLocaleString()} Coins`
    : selected?.kind === "shop"
      ? selected.inv.name
      : selected?.kind === "decor"
        ? selected.inv.item.name
        : "";

  const giftImage = tab === "coins"
    ? coinIconImg
    : selected?.kind === "shop"
      ? (selected.inv.imageUrl ?? null)
      : selected?.kind === "decor"
        ? (selected.inv.item.imageUrl ?? null)
        : null;

  const modalStyle: React.CSSProperties = {
    top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    width: 300, maxHeight: "82vh",
    background: "linear-gradient(160deg, rgba(4,14,8,0.99) 0%, rgba(3,10,6,0.99) 100%)",
    border: "1.5px solid rgba(127,255,212,0.22)",
    borderRadius: 18,
    boxShadow: "0 12px 60px rgba(0,0,0,0.9)",
    padding: "18px 16px 20px",
    display: "flex", flexDirection: "column",
  };

  if (step === "success") {
    return (
      <>
        <div className="fixed inset-0 z-[99997]" style={{ background: "rgba(0,0,0,0.6)" }} />
        <div data-testid="send-gift-success" className="fixed z-[99998] flex flex-col items-center" style={{ ...modalStyle, padding: "28px 20px 24px" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(74,222,128,0.12)",
            border: "2px solid rgba(74,222,128,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 14,
          }}>
            <img src={giftIconImg} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          </div>
          <p className="font-fantasy font-semibold mb-2 text-center" style={{ color: "#4ade80", fontSize: 14, letterSpacing: "0.05em" }}>
            Gift Sent!
          </p>
          <p className="font-fantasy mb-1 text-center" style={{ fontSize: 11, color: "#d4e8da" }}>
            Your gift to <span style={{ color: "#7fffd4" }}>{friendUsername}</span> is on its way.
          </p>
          <div style={{
            margin: "12px 0 16px",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(127,255,212,0.06)",
            border: "1px solid rgba(127,255,212,0.18)",
            width: "100%",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {giftImage && giftImage !== coinIconImg ? (
              <img src={giftImage} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 7, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
            ) : (
              <img src={coinIconImg} alt="" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
            )}
            <p className="font-fantasy" style={{ fontSize: 12, color: "#ffd700" }}>{giftLabel}</p>
          </div>
          <button
            data-testid="button-gift-success-ok"
            onClick={onClose}
            className="font-fantasy tracking-wider w-full"
            style={{
              padding: "10px 0",
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)",
              border: "1.5px solid rgba(74,222,128,0.5)",
              color: "#4ade80",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: "0.12em",
            }}
          >
            OK
          </button>
        </div>
      </>
    );
  }

  if (step === "confirm") {
    return (
      <>
        <div className="fixed inset-0 z-[99997]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setStep("compose")} />
        <div data-testid="send-gift-confirm" className="fixed z-[99998] flex flex-col" style={{ ...modalStyle }}>
          <button
            onClick={() => setStep("compose")}
            style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(127,255,212,0.4)", fontSize: 20 }}
          >×</button>

          <p className="font-fantasy font-semibold mb-1" style={{ color: "#f0e8c8", fontSize: 13, letterSpacing: "0.05em" }}>
            Confirm Gift
          </p>
          <p className="font-fantasy mb-4" style={{ fontSize: 9, color: "rgba(127,255,212,0.5)", letterSpacing: "0.15em" }}>
            REVIEW BEFORE SENDING
          </p>

          <p className="font-fantasy mb-2" style={{ fontSize: 10, color: "rgba(127,255,212,0.6)" }}>
            Sending to: <span style={{ color: "#7fffd4" }}>{friendUsername}</span>
          </p>

          <div style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(127,255,212,0.05)",
            border: "1px solid rgba(127,255,212,0.18)",
            marginBottom: 12,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            {tab === "coins" ? (
              <img src={coinIconImg} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
            ) : giftImage ? (
              <img src={giftImage} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 7, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 7, background: "rgba(127,255,212,0.08)", flexShrink: 0 }} />
            )}
            <div>
              <p className="font-fantasy" style={{ fontSize: 13, color: tab === "coins" ? "#ffd700" : "#d4e8da", fontWeight: 600 }}>
                {giftLabel}
              </p>
              {tab === "coins" && (
                <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.45)", marginTop: 2 }}>
                  Remaining balance: {(senderCoins - coinVal).toLocaleString()} coins
                </p>
              )}
            </div>
          </div>

          {message.trim() && (
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 9, background: "rgba(127,255,212,0.04)", border: "1px solid rgba(127,255,212,0.12)" }}>
              <p className="font-fantasy" style={{ fontSize: 9, color: "rgba(127,255,212,0.5)", letterSpacing: "0.12em", marginBottom: 4 }}>MESSAGE</p>
              <p className="font-fantasy" style={{ fontSize: 10, color: "rgba(127,255,212,0.75)", fontStyle: "italic", lineHeight: 1.4, wordBreak: "break-word" }}>
                "{message.trim()}"
              </p>
            </div>
          )}

          <div className="flex gap-2 mt-auto">
            <button
              data-testid="button-gift-confirm-back"
              onClick={() => setStep("compose")}
              className="font-fantasy tracking-wider flex-1"
              style={{
                padding: "10px 0",
                borderRadius: 10,
                background: "rgba(127,255,212,0.04)",
                border: "1px solid rgba(127,255,212,0.18)",
                color: "rgba(127,255,212,0.55)",
                cursor: "pointer",
                fontSize: 11,
                letterSpacing: "0.1em",
              }}
            >
              Go Back
            </button>
            <button
              data-testid="button-gift-confirm-send"
              onClick={handleSend}
              disabled={sendMutation.isPending}
              className="font-fantasy tracking-wider flex-1"
              style={{
                padding: "10px 0",
                borderRadius: 10,
                background: sendMutation.isPending
                  ? "rgba(127,255,212,0.04)"
                  : "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)",
                border: sendMutation.isPending ? "1px solid rgba(127,255,212,0.1)" : "1.5px solid rgba(74,222,128,0.5)",
                color: sendMutation.isPending ? "rgba(127,255,212,0.3)" : "#4ade80",
                cursor: sendMutation.isPending ? "not-allowed" : "pointer",
                fontSize: 11,
                letterSpacing: "0.12em",
              }}
            >
              {sendMutation.isPending ? "Sending…" : (
                <>
                  <img src={giftIconImg} alt="" style={{ width: 13, height: 13, objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginRight: 5 }} />
                  Confirm & Send
                </>
              )}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[99997]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        data-testid="send-gift-modal"
        className="fixed z-[99998] flex flex-col"
        style={modalStyle}
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
              <img
                src={t === "coins" ? coinIconImg : giftIconImg}
                alt=""
                style={{ width: 14, height: 14, objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginRight: 4 }}
              />
              {t === "coins" ? "Coins" : "Items"}
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
                  const isSelected = selected?.kind === "shop" && selected.inv.inventoryId === inv.inventoryId;
                  return (
                    <button
                      key={inv.inventoryId}
                      data-testid={`gift-item-shop-${inv.inventoryId}`}
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
                      {inv.imageUrl ? (
                        <img src={inv.imageUrl} alt={inv.name} style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "rgba(0,0,0,0.3)", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(127,255,212,0.08)", flexShrink: 0 }} />
                      )}
                      <div className="min-w-0">
                        <p className="font-fantasy truncate" style={{ fontSize: 11, color: "#d4e8da" }}>{inv.name}</p>
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
          onClick={handleConfirm}
          disabled={!canSend}
          className="font-fantasy tracking-wider w-full"
          style={{
            padding: "10px 0",
            borderRadius: 10,
            background: canSend
              ? "linear-gradient(135deg, rgba(74,222,128,0.22) 0%, rgba(22,163,74,0.18) 100%)"
              : "rgba(127,255,212,0.04)",
            border: canSend ? "1.5px solid rgba(74,222,128,0.5)" : "1px solid rgba(127,255,212,0.1)",
            color: canSend ? "#4ade80" : "rgba(127,255,212,0.3)",
            cursor: canSend ? "pointer" : "not-allowed",
            fontSize: 11,
            letterSpacing: "0.12em",
          }}
        >
          <img src={giftIconImg} alt="" style={{ width: 15, height: 15, objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginRight: 6, opacity: canSend ? 1 : 0.3 }} />
          Review Gift
        </button>
      </div>
    </>
  );
}
