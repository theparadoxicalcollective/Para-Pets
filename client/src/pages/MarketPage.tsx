import { useState, useCallback } from "react";
import { playChime } from "@/lib/sounds";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import homeIconImg from "@assets/icon_home_new.png";
import bgHome from "@assets/bg_home_v2.png";

const ITEM_CATEGORIES = [
  { label: "All", value: "all" },
  { label: "Power-Ups", value: "power_up" },
  { label: "Edibles", value: "edibles" },
  { label: "Special", value: "special" },
  { label: "Accessories", value: "accessory" },
  { label: "Potions", value: "potion" },
  { label: "Fish", value: "fish" },
];

interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  inventoryId: string;
  shopItemId: string;
  itemName: string;
  itemImageUrl: string | null;
  itemType: string;
  price: number;
  status: string;
  buyerId: string | null;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  isListed: boolean;
  isHatched: boolean;
}

function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <img src={coinIconImg} alt="coins" style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }} />
  );
}

function formatCoins(n: number) {
  return n.toLocaleString();
}

function ItemCard({ listing, isMine, user, onBuy, onCollect, onCancel }: {
  listing: Listing;
  isMine: boolean;
  user: any;
  onBuy?: (listing: Listing) => void;
  onCollect?: (listing: Listing) => void;
  onCancel?: (listing: Listing) => void;
}) {
  if (isMine && listing.status === "sold") {
    return (
      <div
        data-testid={`card-market-sold-${listing.id}`}
        style={{
          background: "linear-gradient(135deg, rgba(20,40,20,0.95) 0%, rgba(30,55,30,0.95) 100%)",
          border: "2px solid rgba(250,200,50,0.7)",
          borderRadius: 14,
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          minHeight: 140,
          position: "relative",
          boxShadow: "0 0 18px rgba(250,200,50,0.25)",
        }}
      >
        <div style={{ fontSize: 40, filter: "drop-shadow(0 0 10px rgba(250,200,50,0.8))" }}>🪙</div>
        <p style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 13, textAlign: "center", fontWeight: 700 }}>
          +{formatCoins(listing.price)} coins
        </p>
        <p style={{ color: "rgba(200,180,100,0.7)", fontSize: 10, textAlign: "center" }}>{listing.itemName} sold!</p>
        <button
          data-testid={`button-collect-${listing.id}`}
          onClick={() => onCollect?.(listing)}
          style={{
            background: "linear-gradient(135deg, #f0c040 0%, #c8960c 100%)",
            border: "none",
            borderRadius: 8,
            padding: "6px 16px",
            color: "#1a0a00",
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(240,192,64,0.5)",
          }}
        >
          Collect
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid={`card-market-item-${listing.id}`}
      style={{
        background: "linear-gradient(135deg, rgba(15,35,20,0.96) 0%, rgba(25,50,30,0.96) 100%)",
        border: `2px solid ${isMine ? "rgba(74,222,128,0.45)" : "rgba(74,180,100,0.35)"}`,
        borderRadius: 14,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        minHeight: 140,
        position: "relative",
        transition: "border-color 0.2s",
      }}
    >
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {listing.itemImageUrl ? (
          <img src={listing.itemImageUrl} alt={listing.itemName} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ width: 48, height: 48, background: "rgba(74,222,128,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={powerupBagIcon} alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
          </div>
        )}
      </div>
      <p style={{ color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 11, textAlign: "center", lineHeight: 1.3, fontWeight: 600 }}>
        {listing.itemName}
      </p>
      {!isMine && (
        <p style={{ color: "rgba(150,200,150,0.7)", fontSize: 9, textAlign: "center" }}>
          by {listing.sellerName}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: "auto" }}>
        <CoinIcon size={13} />
        <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
      </div>
      {isMine ? (
        <button
          data-testid={`button-cancel-${listing.id}`}
          onClick={() => onCancel?.(listing)}
          style={{
            background: "rgba(220,50,50,0.2)",
            border: "1px solid rgba(220,80,80,0.5)",
            borderRadius: 7,
            padding: "4px 12px",
            color: "#f87171",
            fontFamily: "Georgia, serif",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      ) : listing.sellerId !== user?.id ? (
        <button
          data-testid={`button-buy-${listing.id}`}
          onClick={() => onBuy?.(listing)}
          style={{
            background: "linear-gradient(135deg, rgba(74,222,128,0.3) 0%, rgba(40,160,80,0.3) 100%)",
            border: "1px solid rgba(74,222,128,0.5)",
            borderRadius: 7,
            padding: "4px 12px",
            color: "#4ade80",
            fontFamily: "Georgia, serif",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Buy
        </button>
      ) : null}
    </div>
  );
}

function EmptySlot({ onSell }: { onSell: () => void }) {
  return (
    <button
      data-testid="button-empty-slot"
      onClick={onSell}
      style={{
        background: "rgba(20,50,25,0.6)",
        border: "2px dashed rgba(74,222,128,0.3)",
        borderRadius: 14,
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        cursor: "pointer",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <span style={{ color: "rgba(74,222,128,0.6)", fontSize: 28, lineHeight: 1 }}>+</span>
      <span style={{ color: "rgba(74,222,128,0.5)", fontFamily: "Georgia, serif", fontSize: 10 }}>List Item</span>
    </button>
  );
}

function SellItemModal({ inventory, onClose, onSubmit, isPending }: {
  inventory: InventoryItem[];
  onClose: () => void;
  onSubmit: (inventoryId: string, price: number) => void;
  isPending: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState("");

  const sellable = inventory.filter(i => i.type !== "pet" && !i.isListed);
  const selected = sellable.find(i => i.id === selectedId);
  const priceNum = parseInt(price.replace(/,/g, ""), 10);
  const priceValid = !isNaN(priceNum) && priceNum >= 1 && priceNum <= 1000000;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(135deg, rgba(10,30,15,0.98) 0%, rgba(20,50,25,0.98) 100%)",
          border: "2px solid rgba(74,222,128,0.45)",
          borderRadius: 18,
          padding: "22px 18px",
          width: "100%",
          maxWidth: 380,
          maxHeight: "80dvh",
          overflowY: "auto",
          boxShadow: "0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(74,222,128,0.1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ color: "#4ade80", fontFamily: "Georgia, serif", fontSize: 18, margin: 0 }}>List Item for Sale</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(150,200,150,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <p style={{ color: "rgba(150,200,150,0.7)", fontSize: 11, marginBottom: 14 }}>Select an item from your inventory to sell. Pets cannot be listed.</p>

        {sellable.length === 0 ? (
          <p style={{ color: "rgba(150,200,150,0.5)", textAlign: "center", fontFamily: "Georgia, serif", fontSize: 13, padding: "20px 0" }}>No sellable items in inventory</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
            {sellable.map(item => (
              <button
                key={item.id}
                data-testid={`button-select-item-${item.id}`}
                onClick={() => setSelectedId(item.id)}
                style={{
                  background: selectedId === item.id ? "rgba(74,222,128,0.2)" : "rgba(20,50,25,0.7)",
                  border: `2px solid ${selectedId === item.id ? "rgba(74,222,128,0.7)" : "rgba(74,180,100,0.25)"}`,
                  borderRadius: 10,
                  padding: 8,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
                ) : (
                  <div style={{ width: 44, height: 44, background: "rgba(74,222,128,0.1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={powerupBagIcon} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                  </div>
                )}
                <span style={{ color: "#c8f0c8", fontSize: 9, fontFamily: "Georgia, serif", textAlign: "center", lineHeight: 1.2 }}>{item.name}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "rgba(150,200,150,0.8)", fontSize: 11, marginBottom: 8 }}>
              Selling: <span style={{ color: "#4ade80", fontWeight: 700 }}>{selected.name}</span>
            </p>
            <label style={{ color: "rgba(150,200,150,0.8)", fontSize: 11, display: "block", marginBottom: 6 }}>
              Set Price (max 1,000,000 coins)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CoinIcon size={16} />
              <input
                data-testid="input-listing-price"
                type="number"
                min={1}
                max={1000000}
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Enter price..."
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${priceValid || !price ? "rgba(74,222,128,0.35)" : "rgba(220,80,80,0.6)"}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  color: "#d4f0d4",
                  fontFamily: "Georgia, serif",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
            {price && !priceValid && (
              <p style={{ color: "#f87171", fontSize: 10, marginTop: 4 }}>Price must be between 1 and 1,000,000</p>
            )}
          </div>
        )}

        <button
          data-testid="button-confirm-listing"
          disabled={!selected || !priceValid || isPending}
          onClick={() => selected && priceValid && onSubmit(selected.id, priceNum)}
          style={{
            width: "100%",
            background: selected && priceValid ? "linear-gradient(135deg, rgba(74,222,128,0.4) 0%, rgba(40,160,80,0.4) 100%)" : "rgba(50,80,55,0.4)",
            border: `1px solid ${selected && priceValid ? "rgba(74,222,128,0.6)" : "rgba(74,180,100,0.2)"}`,
            borderRadius: 10,
            padding: "10px",
            color: selected && priceValid ? "#4ade80" : "rgba(74,180,100,0.4)",
            fontFamily: "Georgia, serif",
            fontSize: 14,
            cursor: selected && priceValid && !isPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending ? "Listing..." : "List for Sale"}
        </button>
      </div>
    </div>
  );
}

function ConfirmBuyModal({ listing, onClose, onConfirm, isPending, userCoins }: {
  listing: Listing;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  userCoins: number;
}) {
  const canAfford = userCoins >= listing.price;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "linear-gradient(135deg, rgba(10,30,15,0.98) 0%, rgba(20,50,25,0.98) 100%)", border: "2px solid rgba(74,222,128,0.45)", borderRadius: 18, padding: "24px 20px", width: "100%", maxWidth: 340, boxShadow: "0 0 40px rgba(0,0,0,0.8)" }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ color: "#4ade80", fontFamily: "Georgia, serif", fontSize: 18, margin: "0 0 12px" }}>Confirm Purchase</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {listing.itemImageUrl && <img src={listing.itemImageUrl} alt={listing.itemName} style={{ width: 56, height: 56, objectFit: "contain" }} />}
          <div>
            <p style={{ color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{listing.itemName}</p>
            <p style={{ color: "rgba(150,200,150,0.7)", fontSize: 11, margin: "0 0 4px" }}>Sold by {listing.sellerName}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <CoinIcon size={13} />
              <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
            </div>
          </div>
        </div>
        {!canAfford && <p style={{ color: "#f87171", fontSize: 12, textAlign: "center", marginBottom: 12, fontFamily: "fantasy" }}>Not enough coins! You have {formatCoins(userCoins)}.</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "rgba(50,80,55,0.4)", border: "1px solid rgba(74,180,100,0.2)", borderRadius: 10, padding: "10px", color: "rgba(150,200,150,0.7)", fontFamily: "Georgia, serif", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button
            data-testid="button-confirm-buy"
            disabled={!canAfford || isPending}
            onClick={onConfirm}
            style={{ flex: 1, background: canAfford ? "linear-gradient(135deg, rgba(74,222,128,0.4) 0%, rgba(40,160,80,0.4) 100%)" : "rgba(50,80,55,0.3)", border: `1px solid ${canAfford ? "rgba(74,222,128,0.6)" : "rgba(74,180,100,0.2)"}`, borderRadius: 10, padding: "10px", color: canAfford ? "#4ade80" : "rgba(74,180,100,0.4)", fontFamily: "Georgia, serif", fontSize: 13, cursor: canAfford && !isPending ? "pointer" : "not-allowed" }}
          >
            {isPending ? "Buying..." : "Confirm Buy"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MarketPage({ user, onUserUpdate }: { user: any; onUserUpdate?: (u: any) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"browse" | "myshop">("browse");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showSellModal, setShowSellModal] = useState(false);
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);

  const marketQuery = useQuery<Listing[]>({
    queryKey: ["/api/market", search, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter !== "all") params.set("itemType", categoryFilter);
      return fetch(`/api/market?${params}`).then(r => r.json());
    },
    refetchInterval: 15000,
  });

  const myListingsQuery = useQuery<Listing[]>({
    queryKey: ["/api/market/my-listings"],
    enabled: activeTab === "myshop",
  });

  const inventoryQuery = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    enabled: showSellModal,
  });

  const listMutation = useMutation({
    mutationFn: ({ inventoryId, price }: { inventoryId: string; price: number }) =>
      apiRequest("POST", "/api/market/list", { inventoryId, price }),
    onSuccess: () => {
      setShowSellModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Item listed!", description: "Your item is now on the market." });
    },
    onError: (e: any) => toast({ title: "Failed to list", description: e.message, variant: "destructive" }),
  });

  const buyMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("POST", `/api/market/${listingId}/buy`, {}),
    onSuccess: async (data: any) => {
      setBuyTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/market"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      const updatedUser = await fetch("/api/auth/me").then(r => r.json());
      onUserUpdate?.(updatedUser);
      playChime();
      toast({ title: "Item purchased!", description: "Check your inventory." });
    },
    onError: (e: any) => toast({ title: "Purchase failed", description: e.message, variant: "destructive" }),
  });

  const collectMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("POST", `/api/market/${listingId}/collect`, {}),
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      const updatedUser = await fetch("/api/auth/me").then(r => r.json());
      onUserUpdate?.(updatedUser);
      toast({ title: `+${formatCoins((data as any).coinsEarned)} coins collected!` });
    },
    onError: (e: any) => toast({ title: "Failed to collect", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("DELETE", `/api/market/${listingId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Listing cancelled", description: "Your item is back in inventory." });
    },
    onError: (e: any) => toast({ title: "Failed to cancel", description: e.message, variant: "destructive" }),
  });

  const buySlotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/market/buy-slot", {}),
    onSuccess: async (data: any) => {
      const updatedUser = await fetch("/api/auth/me").then(r => r.json());
      onUserUpdate?.(updatedUser);
      toast({ title: "New slot unlocked!", description: "You now have an extra listing slot." });
    },
    onError: (e: any) => toast({ title: "Failed to buy slot", description: e.message, variant: "destructive" }),
  });

  const totalSlots = 25 + (user?.marketExtraSlots ?? 0);
  const myListings = myListingsQuery.data ?? [];
  const activeOrPending = myListings.filter(l => l.status === "active" || l.status === "sold");
  const usedSlots = activeOrPending.length;
  const emptySlots = Math.max(0, totalSlots - usedSlots);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const accentGreen = "#4ade80";
  const darkGreen = "rgba(10,30,15,0.97)";

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `url(${bgHome})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "brightness(0.45)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(to bottom, rgba(5,20,10,0.7) 0%, rgba(5,15,8,0.4) 40%, rgba(5,15,8,0.85) 100%)" }} />

      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "100dvh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0", paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
          <button
            data-testid="button-back-home"
            onClick={() => navigate("/")}
            style={{ background: "rgba(10,30,15,0.8)", border: "1.5px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, overflow: "hidden", flexShrink: 0 }}
          >
            <img src={homeIconImg} alt="Home" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: accentGreen, fontFamily: "Georgia, serif", fontSize: 20, margin: 0, textShadow: "0 0 15px rgba(74,222,128,0.5)" }}>
              Player Market
            </h1>
          </div>
          <button
            data-testid="button-market-coin-shop"
            onClick={() => navigate("/coins")}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(10,30,15,0.8)", border: "1px solid rgba(212,160,23,0.4)", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}
          >
            <CoinIcon size={14} />
            <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 13, fontWeight: 700 }} data-testid="text-market-coins">
              {formatCoins(user?.coins ?? 0)}
            </span>
            <span style={{ color: "#d4a017", fontFamily: "Georgia, serif", fontSize: 10, fontWeight: 700 }}>+</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 0, margin: "14px 16px 0", background: "rgba(5,20,10,0.7)", borderRadius: 12, border: "1px solid rgba(74,222,128,0.2)", overflow: "hidden" }}>
          {(["browse", "myshop"] as const).map(tab => (
            <button
              key={tab}
              data-testid={`button-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                background: activeTab === tab ? "rgba(74,222,128,0.18)" : "transparent",
                color: activeTab === tab ? accentGreen : "rgba(150,200,150,0.55)",
                fontFamily: "Georgia, serif", fontSize: 13, fontWeight: activeTab === tab ? 700 : 400,
                borderBottom: activeTab === tab ? `2px solid ${accentGreen}` : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {tab === "browse" ? "Market" : "List Items"}
            </button>
          ))}
        </div>

        {activeTab === "browse" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 16px 0" }}>
            <input
              data-testid="input-market-search"
              type="text"
              placeholder="Search items or sellers..."
              value={search}
              onChange={handleSearch}
              style={{
                width: "100%", background: "rgba(10,30,15,0.85)", border: "1.5px solid rgba(74,222,128,0.3)", borderRadius: 10,
                padding: "10px 14px", color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 13, outline: "none", marginBottom: 10,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10, flexShrink: 0 }}>
              {ITEM_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  data-testid={`button-category-${cat.value}`}
                  onClick={() => setCategoryFilter(cat.value)}
                  style={{
                    whiteSpace: "nowrap", padding: "6px 12px",
                    background: categoryFilter === cat.value ? "rgba(74,222,128,0.25)" : "rgba(10,30,15,0.7)",
                    border: `1.5px solid ${categoryFilter === cat.value ? "rgba(74,222,128,0.7)" : "rgba(74,180,100,0.25)"}`,
                    borderRadius: 20, color: categoryFilter === cat.value ? accentGreen : "rgba(150,200,150,0.6)",
                    fontFamily: "Georgia, serif", fontSize: 11, cursor: "pointer", flexShrink: 0,
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
              {marketQuery.isLoading ? (
                <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(150,200,150,0.5)", fontFamily: "Georgia, serif", fontSize: 14 }}>Loading market...</div>
              ) : !marketQuery.data?.length ? (
                <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(150,200,150,0.4)", fontFamily: "Georgia, serif", fontSize: 14 }}>
                  {search || categoryFilter !== "all" ? "No listings match your search." : "The market is empty. Be the first to sell!"}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {marketQuery.data.map(listing => (
                    <ItemCard
                      key={listing.id}
                      listing={listing}
                      isMine={false}
                      user={user}
                      onBuy={setBuyTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "myshop" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 16px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
              <div>
                <p style={{ color: "rgba(150,200,150,0.7)", fontSize: 11, margin: 0 }}>
                  Slots: <span style={{ color: accentGreen, fontWeight: 700 }}>{usedSlots}/{totalSlots}</span>
                  {totalSlots < 50 && <span style={{ color: "rgba(150,200,150,0.5)", fontSize: 10 }}> (max 50)</span>}
                </p>
              </div>
              {totalSlots < 50 && (
                <button
                  data-testid="button-buy-slot"
                  onClick={() => buySlotMutation.mutate()}
                  disabled={buySlotMutation.isPending || (user?.coins ?? 0) < 300}
                  style={{
                    background: (user?.coins ?? 0) >= 300 ? "rgba(74,222,128,0.15)" : "rgba(50,70,55,0.3)",
                    border: `1px solid ${(user?.coins ?? 0) >= 300 ? "rgba(74,222,128,0.45)" : "rgba(74,180,100,0.2)"}`,
                    borderRadius: 10, padding: "6px 12px", cursor: (user?.coins ?? 0) >= 300 ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <CoinIcon size={12} />
                  <span style={{ color: (user?.coins ?? 0) >= 300 ? accentGreen : "rgba(74,180,100,0.4)", fontFamily: "Georgia, serif", fontSize: 11 }}>
                    +1 Slot (300)
                  </span>
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
              {myListingsQuery.isLoading ? (
                <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(150,200,150,0.5)", fontFamily: "Georgia, serif", fontSize: 14 }}>Loading your shop...</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {myListings.map(listing => (
                    <ItemCard
                      key={listing.id}
                      listing={listing}
                      isMine={true}
                      user={user}
                      onCollect={l => collectMutation.mutate(l.id)}
                      onCancel={l => cancelMutation.mutate(l.id)}
                    />
                  ))}
                  {Array.from({ length: emptySlots }).map((_, i) => (
                    <EmptySlot key={`empty-${i}`} onSell={() => setShowSellModal(true)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSellModal && (
        <SellItemModal
          inventory={inventoryQuery.data ?? []}
          onClose={() => setShowSellModal(false)}
          onSubmit={(inventoryId, price) => listMutation.mutate({ inventoryId, price })}
          isPending={listMutation.isPending}
        />
      )}

      {buyTarget && (
        <ConfirmBuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onConfirm={() => buyMutation.mutate(buyTarget.id)}
          isPending={buyMutation.isPending}
          userCoins={user?.coins ?? 0}
        />
      )}
    </div>
  );
}
