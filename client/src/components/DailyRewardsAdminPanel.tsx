import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { currencyAssets } from "@/lib/currencyAssets";
import { ItemPickerModal, type ShopItemFull } from "@/components/ItemDatabaseSection";

interface DailyRewardItem {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
}

interface DailyRewardConfig {
  coinAmount: number;
  essenceAmount: number;
  itemIds: string[];
  items: DailyRewardItem[];
  pvpTickets: number;
  raidTickets: number;
}

export default function DailyRewardsAdminPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coinAmount, setCoinAmount] = useState("100");
  const [essenceAmount, setEssenceAmount] = useState("100");
  const [selectedItems, setSelectedItems] = useState<Array<ShopItemFull | null>>([null, null]);
  const [pickerSlot, setPickerSlot] = useState<0 | 1 | null>(null);

  const { data: config, isLoading } = useQuery<DailyRewardConfig>({
    queryKey: ["/api/daily-claim/config"],
  });
  const { data: allItems = [] } = useQuery<ShopItemFull[]>({
    queryKey: ["/api/admin/shop-items-all"],
  });

  useEffect(() => {
    if (!config) return;
    setCoinAmount(String(config.coinAmount));
    setEssenceAmount(String(config.essenceAmount));
    setSelectedItems([
      allItems.find((item) => item.id === config.itemIds[0]) ?? null,
      allItems.find((item) => item.id === config.itemIds[1]) ?? null,
    ]);
  }, [config, allItems]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const coins = Number(coinAmount);
      const essence = Number(essenceAmount);
      if (!Number.isInteger(coins) || coins < 0 || !Number.isInteger(essence) || essence < 0) {
        throw new Error("Coins and essence must be whole numbers of zero or more.");
      }
      const res = await apiRequest("PUT", "/api/admin/daily-claim/config", {
        coinAmount: coins,
        essenceAmount: essence,
        itemIds: selectedItems.filter((item): item is ShopItemFull => !!item).map((item) => item.id),
      });
      return res.json();
    },
    onSuccess: (saved: DailyRewardConfig) => {
      queryClient.setQueryData(["/api/daily-claim/config"], saved);
      toast({ title: "Daily Rewards Saved", description: "The next claim will use this reward setup." });
    },
    onError: (error: Error) => {
      const message = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(message); } catch {}
      toast({
        title: "Could Not Save",
        description: parsed.message ?? message,
        variant: "destructive",
      });
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.32)",
    border: "1px solid rgba(192,132,252,0.28)",
    color: "#f7f0ff",
    outline: "none",
  };

  const displayImage = (item: ShopItemFull) =>
    item.type === "pet" ? (item.eggImageUrl ?? item.imageUrl) : item.imageUrl;

  return (
    <div data-testid="daily-rewards-admin-panel" style={{ paddingBottom: 28 }}>
      <p style={{ color: "#a89878", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
        Set the coins, essence, and up to two items granted by the Hub's Daily Rewards chest.
        PvP and Raid tickets keep their existing capped amounts.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
        marginBottom: 16,
      }}>
        <label style={{
          display: "block",
          padding: 14,
          borderRadius: 12,
          background: "rgba(255,190,55,0.06)",
          border: "1px solid rgba(255,190,55,0.22)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#ffd773", fontSize: 12, marginBottom: 8 }}>
            <img src={currencyAssets.coin} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
            Coins
          </span>
          <input
            data-testid="input-daily-reward-coins"
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            value={coinAmount}
            onChange={(event) => setCoinAmount(event.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{
          display: "block",
          padding: 14,
          borderRadius: 12,
          background: "rgba(127,191,176,0.06)",
          border: "1px solid rgba(127,191,176,0.22)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#9fdcc9", fontSize: 12, marginBottom: 8 }}>
            <img src={currencyAssets.essenceToken} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
            Essence
          </span>
          <input
            data-testid="input-daily-reward-essence"
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            value={essenceAmount}
            onChange={(event) => setEssenceAmount(event.target.value)}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {([0, 1] as const).map((slot) => {
          const item = selectedItems[slot];
          const image = item ? displayImage(item) : null;
          return (
            <div
              key={slot}
              data-testid={`daily-reward-item-slot-${slot + 1}`}
              style={{
                minHeight: 132,
                padding: 12,
                borderRadius: 12,
                background: "rgba(0,0,0,0.28)",
                border: "1px solid rgba(192,132,252,0.24)",
                textAlign: "center",
              }}
            >
              <div style={{ color: "#a89878", fontSize: 10, letterSpacing: "0.1em", marginBottom: 8 }}>
                ITEM {slot + 1}
              </div>
              {item ? (
                <>
                  <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {image
                      ? <img src={image} alt={item.name} style={{ width: 50, height: 50, objectFit: "contain" }} />
                      : <span style={{ fontSize: 30 }}>📦</span>}
                  </div>
                  <div style={{ color: "#e9d5ff", fontSize: 11, minHeight: 28 }}>{item.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setPickerSlot(slot)}
                      style={{ flex: 1, padding: "6px", borderRadius: 7, background: "rgba(192,132,252,0.14)", border: "1px solid rgba(192,132,252,0.35)", color: "#c4b5fd", cursor: "pointer", fontSize: 10 }}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedItems((current) => current.map((value, index) => index === slot ? null : value))}
                      style={{ flex: 1, padding: "6px", borderRadius: 7, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#fca5a5", cursor: "pointer", fontSize: 10 }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  data-testid={`button-select-daily-reward-item-${slot + 1}`}
                  onClick={() => setPickerSlot(slot)}
                  style={{
                    width: "100%",
                    minHeight: 86,
                    borderRadius: 9,
                    background: "rgba(192,132,252,0.06)",
                    border: "1px dashed rgba(192,132,252,0.35)",
                    color: "#a78bfa",
                    cursor: "pointer",
                  }}
                >
                  + Select Item
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="button-save-daily-rewards"
        disabled={isLoading || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        style={{
          width: "100%",
          marginTop: 16,
          padding: "11px 16px",
          borderRadius: 9,
          background: "linear-gradient(135deg, rgba(192,132,252,0.3), rgba(126,34,206,0.25))",
          border: "1px solid rgba(192,132,252,0.55)",
          color: "#ede9fe",
          cursor: saveMutation.isPending ? "wait" : "pointer",
          fontSize: 12,
          fontWeight: 700,
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {saveMutation.isPending ? "Saving…" : "Save Daily Rewards"}
      </button>

      {pickerSlot !== null && (
        <ItemPickerModal
          items={allItems.filter((item) =>
            item.id === selectedItems[pickerSlot]?.id
            || !selectedItems.some((selected) => selected?.id === item.id)
          )}
          onSelect={(item) => {
            setSelectedItems((current) => current.map((value, index) => index === pickerSlot ? item : value));
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
