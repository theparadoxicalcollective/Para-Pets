import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { playChime, playClick, playTick } from "@/lib/sounds";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import fishInvIcon from "@assets/icon_fish_inventory.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import coinIconImg from "@assets/icon_coin.png";
import marketBg from "@assets/uploads/MarketBG.png";
import marketSearchBar from "@assets/uploads/MarketSearchBar.png";
import marketItemCard from "@assets/uploads/MarketItemCard.png";
import marketTabs from "@assets/uploads/MarketTabs.png";
import marketPetCard from "@assets/uploads/MarketPetCard.png";

type MainTab = "all" | "pets" | "items" | "fish";

const ITEMS_SUB_FILTERS = [
  { label: "All Items", value: "items" },
  { label: "Power-Ups", value: "power_up" },
  { label: "Edibles", value: "edibles" },
  { label: "Potions", value: "potion" },
  { label: "Special", value: "special" },
  { label: "Accessories", value: "accessory" },
  { label: "Ingredients", value: "ingredient" },
  { label: "Bait", value: "bait" },
  { label: "Poles", value: "pole" },
];

interface Listing {
  id: string;
  sellerId: string;
  sellerName?: string;
  inventoryId: string;
  shopItemId: string;
  itemName: string;
  itemImageUrl: string | null;
  itemType: string;
  price: number;
  status: string;
  buyerId: string | null;
  createdAt: string;
  effectSummary?: string;
  description?: string | null;
  rarity?: number | null;
  speciesName?: string | null;
}

interface InventoryItem {
  id: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  eggImageUrl?: string | null;
  hatchedImageUrl?: string | null;
  isListed: boolean;
  isHatched: boolean;
  petNickname?: string | null;
  petLevel?: number;
  petHealth?: number;
  petAtk?: number;
  petDef?: number;
}

interface FishItem {
  id: string;
  shopItemId: string;
  inAquarium: boolean;
  item: { name: string; imageUrl: string | null } | null;
}

interface PetEggDetails {
  speciesName: string;
  eggImageUrl: string | null;
  petNickname: string | null;
  level: number;
  health: number;
  atk: number;
  def: number;
  rarity?: number | null;
}

interface ItemDetails {
  name: string;
  imageUrl: string | null;
  type: string;
  effects: string[];
  description: string | null;
}

const gold = "#f6c95d";
const cream = "#fff3cf";
const green = "#9df3a8";
const purple = "#e5c9ff";

function CoinIcon({ size = 14 }: { size?: number }) {
  return <img src={coinIconImg} alt="coins" style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }} />;
}

function formatCoins(n: number) {
  return n.toLocaleString();
}

function clampRarity(value?: number | null) {
  if (!value || Number.isNaN(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function stars(value?: number | null) {
  return "★".repeat(clampRarity(value));
}

function artButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: "none",
    background: `url(${marketTabs}) center/100% 100% no-repeat`,
    color: active ? cream : "rgba(255,243,207,.66)",
    fontFamily: "Georgia, serif",
    fontWeight: active ? 700 : 500,
    textShadow: active ? "0 0 9px rgba(255,225,130,.65), 0 1px 2px #160326" : "0 1px 2px #160326",
    filter: active ? "brightness(1.2) drop-shadow(0 0 8px rgba(190,61,255,.45))" : "brightness(.72)",
    cursor: "pointer",
    transition: "filter .15s ease, transform .15s ease",
  };
}

function MarketCard({ listing, isMine, user, onDetail, onCollect, onCancel }: {
  listing: Listing;
  isMine: boolean;
  user: any;
  onDetail?: (listing: Listing) => void;
  onCollect?: (listing: Listing) => void;
  onCancel?: (listing: Listing) => void;
}) {
  const isPet = listing.itemType === "pet_egg";
  const isOwn = listing.sellerId === user?.id;
  const isAdmin = !!user?.isAdmin;
  const cardArt = isPet ? marketPetCard : marketItemCard;

  if (isMine && listing.status === "sold") {
    return (
      <div data-testid={`card-market-sold-${listing.id}`} style={{ minHeight: 218, padding: "30px 20px 22px", background: `url(${marketItemCard}) center/100% 100% no-repeat`, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", filter: "drop-shadow(0 7px 12px rgba(0,0,0,.42))" }}>
        <img src={coinIconImg} alt="" style={{ width: 52, height: 52, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(255,195,50,.7))" }} />
        <div style={{ color: gold, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, marginTop: 5 }}>+{formatCoins(listing.price)}</div>
        <div style={{ color: cream, fontFamily: "Georgia, serif", fontSize: 11, margin: "5px 0 11px", maxWidth: 150 }}>{listing.itemName} sold!</div>
        <button data-testid={`button-collect-${listing.id}`} onClick={() => onCollect?.(listing)} style={{ ...artButtonStyle(true), width: "82%", minHeight: 37, fontSize: 11 }}>Collect Coins</button>
      </div>
    );
  }

  return (
    <div
      data-testid={isMine ? `card-market-active-${listing.id}` : `card-market-listing-${listing.id}`}
      style={{
        position: "relative",
        minHeight: 246,
        aspectRatio: isPet ? "2 / 3" : "2 / 3",
        background: `url(${cardArt}) center/100% 100% no-repeat`,
        filter: "drop-shadow(0 8px 12px rgba(0,0,0,.48))",
        overflow: "hidden",
      }}
    >
      <button
        data-testid={`button-detail-${listing.id}`}
        onClick={!isOwn ? () => onDetail?.(listing) : undefined}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent", cursor: !isOwn ? "pointer" : "default", padding: 0, color: "inherit" }}
      >
        {isPet ? (
          <>
            <div data-market-card-field="pet-rarity" style={{ position: "absolute", top: "10%", left: "34%", right: "8%", textAlign: "center", color: gold, fontFamily: "Georgia, serif", fontSize: "clamp(9px, 2.2vw, 12px)", fontWeight: 700, textShadow: "0 1px 2px #25002f" }}>
              {stars(listing.rarity)}
            </div>
            <div style={{ position: "absolute", top: "24%", left: "18%", right: "18%", height: "36%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {listing.itemImageUrl ? <img src={listing.itemImageUrl} alt={listing.itemName} style={{ maxWidth: "82%", maxHeight: "92%", objectFit: "contain", filter: "drop-shadow(0 5px 10px rgba(193,93,255,.42))" }} /> : <img src={eggMagicIcon} alt="" style={{ width: "58%", opacity: .7 }} />}
            </div>
            <div data-market-card-field="pet-name" style={{ position: "absolute", top: "65%", left: "13%", right: "13%", height: "10%", display: "flex", alignItems: "center", justifyContent: "center", color: cream, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(9px, 2.4vw, 13px)", lineHeight: 1.05, textAlign: "center", textShadow: "0 1px 2px #200026" }}>
              {listing.speciesName || listing.itemName}
            </div>
          </>
        ) : (
          <>
            <div data-market-card-field="item-image" style={{ position: "absolute", top: "12%", left: "20%", right: "20%", height: "34%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {listing.itemImageUrl ? <img src={listing.itemImageUrl} alt={listing.itemName} style={{ maxWidth: "82%", maxHeight: "94%", objectFit: "contain", filter: "drop-shadow(0 5px 8px rgba(40,255,110,.22))" }} /> : <img src={powerupBagIcon} alt="" style={{ width: "55%", opacity: .65 }} />}
            </div>
            <div data-market-card-field="item-name" style={{ position: "absolute", top: "55%", left: "12%", right: "12%", minHeight: "9%", display: "flex", alignItems: "center", justifyContent: "center", color: cream, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(9px, 2.35vw, 13px)", lineHeight: 1.05, textAlign: "center", textShadow: "0 1px 2px #04220e" }}>
              {listing.itemName}
            </div>
            <div data-market-card-field="item-display" style={{ position: "absolute", top: "70%", left: "17%", right: "17%", minHeight: "10%", display: "flex", alignItems: "center", justifyContent: "center", color: "#d8ffdd", fontFamily: "Georgia, serif", fontSize: "clamp(7px, 1.85vw, 10px)", lineHeight: 1.08, textAlign: "center", textShadow: "0 1px 2px #04220e", overflow: "hidden" }}>
              {listing.effectSummary || listing.description || "Market item"}
            </div>
          </>
        )}

        <div data-market-card-field="price" style={{ position: "absolute", left: "18%", right: "15%", bottom: "12%", height: "10%", display: "flex", alignItems: "center", justifyContent: "center", color: gold, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(9px, 2.4vw, 13px)", textShadow: "0 1px 2px #2f1500" }}>
          {formatCoins(listing.price)}
        </div>

        {isAdmin && listing.sellerName && <div style={{ position: "absolute", left: "12%", right: "12%", bottom: "2.4%", textAlign: "center", color: "rgba(255,255,255,.45)", fontSize: 7 }}>by {listing.sellerName}</div>}
      </button>

      {isMine && listing.status === "active" && (
        <button data-testid={`button-cancel-${listing.id}`} onClick={() => onCancel?.(listing)} style={{ position: "absolute", right: 8, top: 8, zIndex: 3, border: "1px solid rgba(255,165,165,.35)", background: "rgba(45,0,18,.78)", color: "#ffb8c5", borderRadius: 8, padding: "4px 7px", fontSize: 8, cursor: "pointer" }}>Cancel</button>
      )}
    </div>
  );
}

function EmptySlot({ onSell }: { onSell: () => void }) {
  return (
    <button data-testid="button-empty-slot" onClick={onSell} style={{ minHeight: 246, aspectRatio: "2 / 3", border: 0, background: `url(${marketItemCard}) center/100% 100% no-repeat`, opacity: .62, filter: "grayscale(.2) drop-shadow(0 8px 12px rgba(0,0,0,.35))", cursor: "pointer", color: cream, fontFamily: "Georgia, serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}>
      <span style={{ fontSize: 32, textShadow: "0 0 10px rgba(120,255,150,.5)" }}>+</span>
      <span style={{ fontSize: 11 }}>List Item</span>
    </button>
  );
}

function RevertToEggModal({ petName, onRevert, onCancel, isPending }: { petName: string; onRevert: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.82)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 330, padding: "25px 22px", borderRadius: 20, border: "2px solid rgba(211,151,255,.55)", background: "linear-gradient(165deg,#180522,#2d0b49)", boxShadow: "0 0 45px rgba(180,50,255,.25)", textAlign: "center" }}>
        <img src={eggMagicIcon} alt="" style={{ width: 62, height: 62, objectFit: "contain" }} />
        <h2 style={{ color: purple, fontFamily: "Georgia, serif", fontSize: 18, margin: "8px 0" }}>Revert to Egg</h2>
        <p style={{ color: "rgba(239,220,255,.75)", fontFamily: "Georgia, serif", fontSize: 12, lineHeight: 1.5 }}>“{petName}” will return to egg form before being listed. Stats remain preserved and equipped accessories are removed.</p>
        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, borderRadius: 10, padding: 10, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.18)", color: "#dbcfea", cursor: "pointer" }}>Cancel</button>
          <button data-testid="button-revert-confirm" disabled={isPending} onClick={onRevert} style={{ flex: 1, borderRadius: 10, padding: 10, background: "rgba(142,70,209,.42)", border: "1px solid rgba(220,170,255,.5)", color: purple, cursor: isPending ? "not-allowed" : "pointer" }}>{isPending ? "Reverting…" : "Revert"}</button>
        </div>
      </div>
    </div>
  );
}

function PetEggDetailModal({ listing, onClose, onBuy, isBuyPending, userCoins, isAdmin }: { listing: Listing; onClose: () => void; onBuy: () => void; isBuyPending: boolean; userCoins: number; isAdmin: boolean }) {
  const detailsQuery = useQuery<PetEggDetails>({ queryKey: ["/api/market/listing", listing.id, "pet-details"], queryFn: () => fetch(`/api/market/listing/${listing.id}/pet-details`).then(r => r.json()) });
  const d = detailsQuery.data;
  const canAfford = userCoins >= listing.price;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 350, background: "rgba(0,0,0,.84)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 330, minHeight: 450, position: "relative", background: `url(${marketPetCard}) center/100% 100% no-repeat`, padding: "66px 44px 58px", boxSizing: "border-box", textAlign: "center", filter: "drop-shadow(0 12px 28px rgba(0,0,0,.75))" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 24, right: 28, border: 0, background: "rgba(20,0,28,.72)", color: purple, borderRadius: 12, width: 27, height: 27, cursor: "pointer" }}>×</button>
        {detailsQuery.isLoading ? <p style={{ color: purple, marginTop: 130, fontFamily: "Georgia, serif" }}>Loading…</p> : d ? <>
          <div style={{ color: gold, fontSize: 16, letterSpacing: 1 }}>{stars(d.rarity ?? listing.rarity)}</div>
          <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.eggImageUrl ? <img src={d.eggImageUrl} alt={d.speciesName} style={{ maxWidth: 120, maxHeight: 130, objectFit: "contain", filter: "drop-shadow(0 6px 15px rgba(180,80,255,.45))" }} /> : <img src={eggMagicIcon} alt="" style={{ width: 90 }} />}</div>
          <div style={{ color: cream, fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700 }}>{d.speciesName}</div>
          {d.petNickname && <div style={{ color: purple, fontFamily: "Georgia, serif", fontSize: 12, marginTop: 3 }}>“{d.petNickname}”</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, margin: "12px 0", color: "#e6d9ee", fontSize: 9 }}><span>Lv {d.level}</span><span>HP {d.health}</span><span>ATK {d.atk}</span><span>DEF {d.def}</span></div>
          <div style={{ color: gold, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><CoinIcon size={17} />{formatCoins(listing.price)}</div>
          {isAdmin && listing.sellerName && <div style={{ color: "rgba(255,255,255,.45)", fontSize: 9, marginTop: 2 }}>by {listing.sellerName}</div>}
          {!canAfford && <p style={{ color: "#ff9da6", fontSize: 10 }}>Not enough coins</p>}
          <button data-testid="button-confirm-buy" disabled={!canAfford || isBuyPending} onClick={e => { burstGoldenOrbs(e.clientX, e.clientY); onBuy(); }} style={{ ...artButtonStyle(canAfford), width: "100%", minHeight: 40, marginTop: 10, opacity: canAfford ? 1 : .5 }}>{isBuyPending ? "Buying…" : "Buy Egg"}</button>
        </> : <p style={{ color: "#ff9da6", marginTop: 130 }}>Could not load egg details.</p>}
      </div>
    </div>
  );
}

function ItemDetailModal({ listing, onClose, onBuy, isBuyPending, userCoins, isAdmin }: { listing: Listing; onClose: () => void; onBuy: () => void; isBuyPending: boolean; userCoins: number; isAdmin: boolean }) {
  const detailsQuery = useQuery<ItemDetails>({ queryKey: ["/api/market/listing", listing.id, "item-details"], queryFn: () => fetch(`/api/market/listing/${listing.id}/item-details`).then(r => r.json()) });
  const d = detailsQuery.data;
  const canAfford = userCoins >= listing.price;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 350, background: "rgba(0,0,0,.84)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 330, minHeight: 450, position: "relative", background: `url(${marketItemCard}) center/100% 100% no-repeat`, padding: "58px 45px 58px", boxSizing: "border-box", textAlign: "center", filter: "drop-shadow(0 12px 28px rgba(0,0,0,.75))" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 24, right: 28, border: 0, background: "rgba(0,22,9,.72)", color: green, borderRadius: 12, width: 27, height: 27, cursor: "pointer" }}>×</button>
        <div style={{ height: 155, display: "flex", alignItems: "center", justifyContent: "center" }}>{listing.itemImageUrl ? <img src={listing.itemImageUrl} alt={listing.itemName} style={{ maxWidth: 120, maxHeight: 135, objectFit: "contain", filter: "drop-shadow(0 6px 12px rgba(70,255,120,.25))" }} /> : <img src={powerupBagIcon} alt="" style={{ width: 85 }} />}</div>
        <div style={{ color: cream, fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700 }}>{listing.itemName}</div>
        <div style={{ margin: "10px 0", minHeight: 52, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, color: "#dbffe0", fontFamily: "Georgia, serif", fontSize: 11, lineHeight: 1.35 }}>
          {detailsQuery.isLoading ? "Loading…" : d?.effects?.length ? d.effects.map((effect, i) => <span key={i}>✦ {effect}</span>) : (d?.description || listing.description || "A useful market item.")}
        </div>
        <div style={{ color: gold, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><CoinIcon size={17} />{formatCoins(listing.price)}</div>
        {isAdmin && listing.sellerName && <div style={{ color: "rgba(255,255,255,.45)", fontSize: 9, marginTop: 2 }}>by {listing.sellerName}</div>}
        {!canAfford && <p style={{ color: "#ff9da6", fontSize: 10 }}>Not enough coins</p>}
        <button data-testid="button-confirm-buy" disabled={!canAfford || isBuyPending} onClick={e => { burstGoldenOrbs(e.clientX, e.clientY); onBuy(); }} style={{ ...artButtonStyle(canAfford), width: "100%", minHeight: 40, marginTop: 12, opacity: canAfford ? 1 : .5 }}>{isBuyPending ? "Buying…" : "Buy Now"}</button>
      </div>
    </div>
  );
}

function SellItemModal({ inventory, fishInventory, onClose, onSubmit, onSubmitFish, onSubmitPet, isPending, isPetPending }: { inventory: InventoryItem[]; fishInventory: FishItem[]; onClose: () => void; onSubmit: (inventoryId: string, price: number) => void; onSubmitFish: (fishInventoryId: string, price: number) => void; onSubmitPet: (inventoryId: string, price: number) => void; isPending: boolean; isPetPending: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<"items" | "fish" | "pets">("items");
  const [price, setPrice] = useState("");
  const [showRevert, setShowRevert] = useState(false);
  const regular = inventory.filter(i => i.type !== "pet" && !i.isListed);
  const pets = inventory.filter(i => i.type === "pet" && !i.isListed);
  const fish = fishInventory.filter(i => !i.inAquarium);
  const selectedItem = kind === "fish" ? fish.find(i => i.id === selectedId) : kind === "pets" ? pets.find(i => i.id === selectedId) : regular.find(i => i.id === selectedId);
  const priceNum = parseInt(price, 10);
  const valid = Number.isFinite(priceNum) && priceNum >= 1 && priceNum <= 1000000;
  const selectedPet = kind === "pets" ? selectedItem as InventoryItem | undefined : undefined;
  const list = kind === "fish" ? fish : kind === "pets" ? pets : regular;

  const nameFor = (item: any) => kind === "fish" ? item.item?.name || "Fish" : item.petNickname || item.name;
  const imageFor = (item: any) => kind === "fish" ? item.item?.imageUrl : kind === "pets" ? (item.isHatched ? item.hatchedImageUrl || item.imageUrl : item.eggImageUrl || item.imageUrl) : item.imageUrl;

  function submit() {
    if (!selectedId || !valid) return;
    if (kind === "pets") return setShowRevert(true);
    if (kind === "fish") onSubmitFish(selectedId, priceNum); else onSubmit(selectedId, priceNum);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.78)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 390, maxHeight: "82vh", overflowY: "auto", borderRadius: 20, padding: 18, background: "linear-gradient(160deg,rgba(14,6,27,.98),rgba(20,52,25,.98))", border: "2px solid rgba(214,166,58,.42)", boxShadow: "0 0 40px rgba(0,0,0,.7)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><h2 style={{ margin: 0, color: cream, fontFamily: "Georgia, serif", fontSize: 18 }}>List Item for Sale</h2><button onClick={onClose} style={{ border: 0, background: "transparent", color: cream, fontSize: 20, cursor: "pointer" }}>×</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>{([['items', powerupBagIcon, regular.length], ['fish', fishInvIcon, fish.length], ['pets', eggMagicIcon, pets.length]] as const).map(([key, icon, count]) => <button key={key} data-testid={`button-sell-tab-${key}`} onClick={() => { setKind(key); setSelectedId(null); playTick(); }} style={{ ...artButtonStyle(kind === key), minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10 }}><img src={icon} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />{key === 'items' ? 'Items' : key === 'fish' ? 'Fish' : 'Pets'} ({count})</button>)}</div>
        {list.length ? <div style={{ display: "grid", gridTemplateColumns: kind === "pets" ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 8, maxHeight: 300, overflowY: "auto", padding: 2 }}>{list.map((item: any) => <button key={item.id} onClick={() => { setSelectedId(item.id); playClick(); }} style={{ borderRadius: 10, border: selectedId === item.id ? "2px solid #e9c164" : "1px solid rgba(255,255,255,.14)", background: selectedId === item.id ? "rgba(174,95,218,.18)" : "rgba(0,0,0,.22)", color: cream, minHeight: 92, padding: 7, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}><div style={{ height: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>{imageFor(item) ? <img src={imageFor(item)} alt="" style={{ maxWidth: 56, maxHeight: 54, objectFit: "contain" }} /> : <img src={powerupBagIcon} alt="" style={{ width: 38, opacity: .6 }} />}</div><span style={{ fontFamily: "Georgia, serif", fontSize: 9, textAlign: "center" }}>{nameFor(item)}</span></button>)}</div> : <div style={{ color: "rgba(255,255,255,.5)", fontFamily: "Georgia, serif", textAlign: "center", padding: 25 }}>No {kind} to sell.</div>}
        {selectedItem && <div style={{ marginTop: 14 }}><label style={{ display: "block", color: "rgba(255,255,255,.75)", fontSize: 11, marginBottom: 5 }}>Price (1–1,000,000 coins)</label><div style={{ display: "flex", alignItems: "center", gap: 6 }}><CoinIcon size={18} /><input data-testid="input-listing-price" type="number" min={1} max={1000000} value={price} onChange={e => setPrice(e.target.value)} placeholder="Enter price" style={{ flex: 1, borderRadius: 9, border: `1px solid ${valid || !price ? "rgba(225,190,90,.4)" : "#ff7d89"}`, background: "rgba(0,0,0,.3)", padding: "9px 11px", color: cream, outline: "none" }} /></div></div>}
        <button data-testid="button-confirm-listing" disabled={!selectedItem || !valid || isPending || isPetPending} onClick={submit} style={{ ...artButtonStyle(!!selectedItem && valid), width: "100%", minHeight: 42, marginTop: 14, opacity: selectedItem && valid ? 1 : .5 }}>{isPending || isPetPending ? "Listing…" : "List for Sale"}</button>
      </div>
      {showRevert && selectedPet && <RevertToEggModal petName={selectedPet.petNickname || selectedPet.name} isPending={isPetPending} onCancel={() => setShowRevert(false)} onRevert={() => valid && onSubmitPet(selectedPet.id, priceNum)} />}
    </div>
  );
}

export default function MarketPage({ user, onUserUpdate }: { user: any; onUserUpdate?: (u: any) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"browse" | "myshop">("browse");
  const [search, setSearch] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("all");
  const [itemsSubFilter, setItemsSubFilter] = useState("items");
  const [showSellModal, setShowSellModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Listing | null>(null);
  const isAdmin = !!user?.isAdmin;

  const effectiveItemType = mainTab === "all" ? "all" : mainTab === "pets" ? "pet_egg" : mainTab === "fish" ? "fish" : itemsSubFilter;

  const marketQuery = useQuery<Listing[]>({
    queryKey: ["/api/market", search, effectiveItemType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (effectiveItemType !== "all") params.set("itemType", effectiveItemType);
      return fetch(`/api/market?${params}`).then(r => r.json());
    },
    refetchInterval: 15000,
  });

  const myListingsQuery = useQuery<Listing[]>({ queryKey: ["/api/market/my-listings"], enabled: activeTab === "myshop" });
  const inventoryQuery = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"], enabled: showSellModal });
  const fishInventoryQuery = useQuery<FishItem[]>({ queryKey: ["/api/fishing/inventory"], enabled: showSellModal });

  const listMutation = useMutation({ mutationFn: ({ inventoryId, price }: { inventoryId: string; price: number }) => apiRequest("POST", "/api/market/list", { inventoryId, price }), onSuccess: () => { setShowSellModal(false); queryClient.invalidateQueries({ queryKey: ["/api/market"] }); queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Listed!", description: "Your item is now on the market." }); }, onError: (e: any) => toast({ title: "Failed to list item", description: e.message, variant: "destructive" }) });
  const listFishMutation = useMutation({ mutationFn: ({ fishInventoryId, price }: { fishInventoryId: string; price: number }) => apiRequest("POST", "/api/market/list-fish", { fishInventoryId, price }), onSuccess: () => { setShowSellModal(false); queryClient.invalidateQueries({ queryKey: ["/api/market"] }); queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] }); queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] }); toast({ title: "Fish listed!", description: "Your fish is now on the market." }); }, onError: (e: any) => toast({ title: "Failed to list fish", description: e.message, variant: "destructive" }) });
  const revertAndListMutation = useMutation({ mutationFn: async ({ inventoryId, price }: { inventoryId: string; price: number }) => { await apiRequest("POST", `/api/pet/${inventoryId}/revert-to-egg`, {}); return apiRequest("POST", "/api/market/list", { inventoryId, price }); }, onSuccess: () => { setShowSellModal(false); queryClient.invalidateQueries({ queryKey: ["/api/market"] }); queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Pet egg listed!", description: "Your pet egg is now on the market." }); }, onError: (e: any) => toast({ title: "Failed to list pet egg", description: e.message, variant: "destructive" }) });
  const buyMutation = useMutation({ mutationFn: (listingId: string) => apiRequest("POST", `/api/market/${listingId}/buy`, {}), onSuccess: async () => { setDetailTarget(null); queryClient.invalidateQueries({ queryKey: ["/api/market"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] }); const updatedUser = await fetch("/api/auth/me").then(r => r.json()); onUserUpdate?.(updatedUser); playChime(); toast({ title: "Purchase complete!", description: "Check your inventory." }); }, onError: (e: any) => { queryClient.invalidateQueries({ queryKey: ["/api/market"] }); toast({ title: "Purchase failed", description: e.message, variant: "destructive" }); } });
  const collectMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("POST", `/api/market/${listingId}/collect`, {}),
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      const updatedUser = await fetch("/api/auth/me").then(r => r.json());
      onUserUpdate?.(updatedUser);
      toast({ title: `+${formatCoins(data.coinsEarned)} coins collected!` });
    },
    onError: (e: any) => toast({ title: "Failed to collect", description: e.message, variant: "destructive" }),
  });
  const cancelMutation = useMutation({ mutationFn: (listingId: string) => apiRequest("DELETE", `/api/market/${listingId}`, {}), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/market"] }); queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] }); toast({ title: "Listing cancelled", description: "Your item is back in inventory." }); }, onError: (e: any) => toast({ title: "Failed to cancel", description: e.message, variant: "destructive" }) });
  const buySlotMutation = useMutation({ mutationFn: () => apiRequest("POST", "/api/market/buy-slot", {}), onSuccess: async () => { const updatedUser = await fetch("/api/auth/me").then(r => r.json()); onUserUpdate?.(updatedUser); toast({ title: "New slot unlocked!" }); }, onError: (e: any) => toast({ title: "Failed to buy slot", description: e.message, variant: "destructive" }) });

  const totalSlots = 25 + (user?.marketExtraSlots ?? 0);
  const myListings = myListingsQuery.data ?? [];
  const activeOrPending = myListings.filter(l => l.status === "active" || l.status === "sold");
  const emptySlots = Math.max(0, totalSlots - activeOrPending.length);
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value), []);

  const mainTabs = useMemo(() => ([{ value: "all", label: "All" }, { value: "pets", label: "Pets" }, { value: "items", label: "Items" }, { value: "fish", label: "Fish" }] as { value: MainTab; label: string }[]), []);

  return (
    <div style={{ minHeight: "calc(100*var(--vh))", width: "100%", position: "relative", overflow: "hidden", background: "#100018" }}>
      <div style={{ position: "absolute", inset: 0, background: `url(${marketBg}) center top/cover no-repeat`, zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(11,0,20,.16),rgba(8,0,16,.26) 52%,rgba(5,0,10,.7))", zIndex: 1 }} />

      <div style={{ position: "relative", zIndex: 2, height: "calc(100*var(--vh))", display: "flex", flexDirection: "column", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ padding: "max(calc(env(safe-area-inset-top,0px) + 10px),46px) 13px 0", display: "grid", gridTemplateColumns: "46px 1fr auto", gap: 8, alignItems: "center" }}>
          <button aria-label="Back" data-testid="button-back-home" onClick={() => navigate("/")} style={{ width: 43, height: 43, padding: 0, border: "1px solid rgba(255,205,90,.46)", borderRadius: 12, background: "linear-gradient(145deg,rgba(20,74,39,.9),rgba(13,35,28,.94))", color: cream, cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(103,255,148,.12),0 4px 12px rgba(0,0,0,.4),0 0 9px rgba(86,238,129,.16)", fontFamily: "Georgia, serif", fontSize: 27, fontWeight: 700, lineHeight: 1, textShadow: "0 1px 2px #07130b,0 0 7px rgba(255,222,120,.45)" }}>←</button>
          <h1 style={{ margin: 0, textAlign: "center", color: cream, fontFamily: "Georgia, serif", fontSize: 22, letterSpacing: .4, textShadow: "0 0 14px #b832ff,0 2px 3px #190021" }}>Player Market</h1>
          <button data-testid="button-market-coin-shop" onClick={() => navigate("/coins")} style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 39, borderRadius: 12, border: "1px solid rgba(255,205,90,.4)", background: "rgba(23,3,37,.76)", padding: "5px 9px", color: gold, fontFamily: "Georgia, serif", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.4)" }}><CoinIcon size={15} /><span data-testid="text-market-coins">{formatCoins(user?.coins ?? 0)}</span><span>+</span></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, margin: "11px 14px 0" }}>
          <button data-testid="button-tab-browse" onClick={() => setActiveTab("browse")} style={{ ...artButtonStyle(activeTab === "browse"), minHeight: 42, fontSize: 13 }}>Market</button>
          <button data-testid="button-tab-myshop" onClick={() => setActiveTab("myshop")} style={{ ...artButtonStyle(activeTab === "myshop"), minHeight: 42, fontSize: 13 }}>List Items</button>
        </div>

        {activeTab === "browse" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 13px 0" }}>
            <div data-testid="market-search-frame" style={{ position: "relative", height: 58, flexShrink: 0, marginBottom: 7, background: `url(${marketSearchBar}) center/100% 100% no-repeat`, filter: "drop-shadow(0 4px 7px rgba(0,0,0,.35))" }}>
              <input data-testid="input-market-search" type="text" value={search} onChange={handleSearch} placeholder={isAdmin ? "Search items or sellers…" : "Search the market…"} style={{ position: "absolute", inset: "11px 16% 11px 12%", width: "72%", boxSizing: "border-box", border: 0, outline: 0, background: "transparent", color: cream, fontFamily: "Georgia, serif", fontSize: 13, textShadow: "0 1px 2px #1d0028" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 6 }}>{mainTabs.map(tab => <button key={tab.value} data-testid={`button-main-tab-${tab.value}`} onClick={() => { setMainTab(tab.value); playTick(); if (tab.value !== "items") setItemsSubFilter("items"); }} style={{ ...artButtonStyle(mainTab === tab.value), minHeight: 34, fontSize: 10 }}>{tab.label}</button>)}</div>

            {mainTab === "items" && <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 5, marginBottom: 5 }}>{ITEMS_SUB_FILTERS.map(sf => <button key={sf.value} data-testid={`button-sub-filter-${sf.value}`} onClick={() => { setItemsSubFilter(sf.value); playTick(); }} style={{ ...artButtonStyle(itemsSubFilter === sf.value), minWidth: 82, minHeight: 30, padding: "0 8px", fontSize: 8.5, flexShrink: 0 }}>{sf.label}</button>)}</div>}

            <div style={{ flex: 1, overflowY: "auto", padding: "3px 2px 20px", scrollbarWidth: "none" }}>
              {marketQuery.isLoading ? <div style={{ textAlign: "center", color: purple, fontFamily: "Georgia, serif", paddingTop: 50 }}>Loading market…</div> : !marketQuery.data?.length ? <div style={{ textAlign: "center", color: "rgba(255,235,255,.62)", fontFamily: "Georgia, serif", paddingTop: 50 }}>{search || mainTab !== "all" ? "No listings match your search." : "The market is empty. Be the first to sell!"}</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9 }}>{marketQuery.data.map(listing => <MarketCard key={listing.id} listing={listing} isMine={false} user={user} onDetail={setDetailTarget} />)}</div>}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "9px 13px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
              <div style={{ color: cream, fontFamily: "Georgia, serif", fontSize: 11, textShadow: "0 1px 2px #190021" }}>Slots: <b style={{ color: gold }}>{activeOrPending.length}/{totalSlots}</b>{totalSlots < 50 ? " · max 50" : ""}</div>
              {totalSlots < 50 && <button data-testid="button-buy-slot" disabled={buySlotMutation.isPending || (user?.coins ?? 0) < 300} onClick={() => buySlotMutation.mutate()} style={{ ...artButtonStyle((user?.coins ?? 0) >= 300), minHeight: 32, minWidth: 112, fontSize: 9, opacity: (user?.coins ?? 0) >= 300 ? 1 : .5 }}><CoinIcon size={11} /> +1 Slot (300)</button>}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "3px 2px 20px", scrollbarWidth: "none" }}>{myListingsQuery.isLoading ? <div style={{ textAlign: "center", color: purple, fontFamily: "Georgia, serif", paddingTop: 50 }}>Loading your shop…</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9 }}>{myListings.map(listing => <MarketCard key={listing.id} listing={listing} isMine user={user} onCollect={l => !collectMutation.isPending && collectMutation.mutate(l.id)} onCancel={l => !cancelMutation.isPending && cancelMutation.mutate(l.id)} />)}{Array.from({ length: emptySlots }).map((_, i) => <EmptySlot key={i} onSell={() => setShowSellModal(true)} />)}</div>}</div>
          </div>
        )}
      </div>

      {showSellModal && <SellItemModal inventory={inventoryQuery.data ?? []} fishInventory={fishInventoryQuery.data ?? []} onClose={() => setShowSellModal(false)} onSubmit={(inventoryId, price) => listMutation.mutate({ inventoryId, price })} onSubmitFish={(fishInventoryId, price) => listFishMutation.mutate({ fishInventoryId, price })} onSubmitPet={(inventoryId, price) => revertAndListMutation.mutate({ inventoryId, price })} isPending={listMutation.isPending || listFishMutation.isPending} isPetPending={revertAndListMutation.isPending} />}
      {detailTarget?.itemType === "pet_egg" && <PetEggDetailModal listing={detailTarget} onClose={() => setDetailTarget(null)} onBuy={() => buyMutation.mutate(detailTarget.id)} isBuyPending={buyMutation.isPending} userCoins={user?.coins ?? 0} isAdmin={isAdmin} />}
      {detailTarget && detailTarget.itemType !== "pet_egg" && <ItemDetailModal listing={detailTarget} onClose={() => setDetailTarget(null)} onBuy={() => buyMutation.mutate(detailTarget.id)} isBuyPending={buyMutation.isPending} userCoins={user?.coins ?? 0} isAdmin={isAdmin} />}
    </div>
  );
}
