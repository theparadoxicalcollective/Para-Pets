import { useState, useCallback } from "react";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { playChime, playClick, playTick } from "@/lib/sounds";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import powerupBagIcon from "@assets/generated_images/icon_powerup_bag.png";
import fishInvIcon from "@assets/icon_fish_inventory.png";
import eggMagicIcon from "@assets/generated_images/icon_egg_magic.png";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import coinIconImg from "@assets/icon_coin.png";
import homeIconImg from "@assets/icon_home_new.png";
import bgHome from "@assets/bg_home_v2.png";

// ── Main browse tabs ──────────────────────────────────────────────────────────
type MainTab = "all" | "pets" | "items" | "fish";

// Sub-filters shown under the "Items" main tab
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
}

interface ItemDetails {
  name: string;
  imageUrl: string | null;
  type: string;
  effects: string[];
  description: string | null;
}

function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <img src={coinIconImg} alt="coins" style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle" }} />
  );
}

function formatCoins(n: number) {
  return n.toLocaleString();
}

function ItemCard({ listing, isMine, user, onDetail, onCollect, onCancel }: {
  listing: Listing;
  isMine: boolean;
  user: any;
  onDetail?: (listing: Listing) => void;
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
            background: "linear-gradient(135deg, rgba(250,200,50,0.35) 0%, rgba(180,140,20,0.35) 100%)",
            border: "1.5px solid rgba(250,200,50,0.6)",
            borderRadius: 8,
            padding: "7px 14px",
            color: "#f0c040",
            fontFamily: "Georgia, serif",
            fontSize: 12,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Collect Coins
        </button>
      </div>
    );
  }

  if (isMine && listing.status === "active") {
    return (
      <div
        data-testid={`card-market-active-${listing.id}`}
        style={{
          background: "linear-gradient(135deg, rgba(10,30,15,0.95) 0%, rgba(20,50,25,0.95) 100%)",
          border: "2px solid rgba(74,222,128,0.35)",
          borderRadius: 14,
          padding: "12px 10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          minHeight: 140,
          position: "relative",
        }}
      >
        {listing.itemType === "pet_egg" && (
          <span style={{ position: "absolute", top: 5, left: 6, fontSize: 8, color: "rgba(180,140,255,0.8)", fontFamily: "Georgia, serif", background: "rgba(60,20,100,0.7)", borderRadius: 4, padding: "1px 4px" }}>🥚 Egg</span>
        )}
        {listing.itemImageUrl ? (
          <img
            src={listing.itemImageUrl}
            alt={listing.itemName}
            style={{ width: 52, height: 52, objectFit: "contain", marginTop: listing.itemType === "pet_egg" ? 8 : 0 }}
          />
        ) : (
          <div style={{ width: 52, height: 52, background: "rgba(74,222,128,0.07)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={powerupBagIcon} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
          </div>
        )}
        <span style={{ color: "#c8f0c8", fontSize: 9, fontFamily: "Georgia, serif", textAlign: "center", lineHeight: 1.2 }}>{listing.itemName}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <CoinIcon size={11} />
          <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 11, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
        </div>
        <button
          data-testid={`button-cancel-${listing.id}`}
          onClick={() => onCancel?.(listing)}
          style={{
            background: "rgba(80,20,20,0.5)",
            border: "1px solid rgba(220,80,80,0.35)",
            borderRadius: 7,
            padding: "5px 10px",
            color: "rgba(220,120,120,0.8)",
            fontFamily: "Georgia, serif",
            fontSize: 10,
            cursor: "pointer",
            width: "100%",
            marginTop: "auto",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Browse listing card
  const isPetEgg = listing.itemType === "pet_egg";
  const isOwn = listing.sellerId === user?.id;
  const isAdmin = !!user?.isAdmin;
  return (
    <div
      data-testid={`card-market-listing-${listing.id}`}
      style={{
        background: isPetEgg
          ? "linear-gradient(135deg, rgba(30,10,50,0.95) 0%, rgba(50,20,80,0.95) 100%)"
          : "linear-gradient(135deg, rgba(10,30,15,0.95) 0%, rgba(20,50,25,0.95) 100%)",
        border: `2px solid ${isPetEgg ? "rgba(180,130,255,0.4)" : "rgba(74,222,128,0.2)"}`,
        borderRadius: 14,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        minHeight: 140,
        position: "relative",
      }}
    >
      {isPetEgg && (
        <span style={{ position: "absolute", top: 5, left: 6, fontSize: 8, color: "rgba(200,160,255,0.9)", fontFamily: "Georgia, serif", background: "rgba(60,20,100,0.8)", borderRadius: 4, padding: "1px 5px" }}>🥚 Pet Egg</span>
      )}
      <button
        data-testid={`button-detail-${listing.id}`}
        onClick={!isOwn ? () => onDetail?.(listing) : undefined}
        style={{
          background: "none", border: "none", padding: 0,
          cursor: !isOwn ? "pointer" : "default",
          marginTop: isPetEgg ? 10 : 0,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          width: "100%",
        }}
      >
        <div>
          {listing.itemImageUrl ? (
            <img
              src={listing.itemImageUrl}
              alt={listing.itemName}
              style={{ width: 52, height: 52, objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: 52, height: 52, background: "rgba(74,222,128,0.07)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={powerupBagIcon} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
            </div>
          )}
        </div>
        <span style={{ color: isPetEgg ? "#d4b8ff" : "#c8f0c8", fontSize: 9, fontFamily: "Georgia, serif", textAlign: "center", lineHeight: 1.2 }}>{listing.itemName}</span>
        {/* Effect summary badge */}
        {listing.effectSummary && !isPetEgg && (
          <span style={{
            color: "#a3e635",
            fontSize: 8,
            fontFamily: "Georgia, serif",
            textAlign: "center",
            lineHeight: 1.2,
            background: "rgba(74,222,128,0.1)",
            borderRadius: 4,
            padding: "2px 5px",
            border: "1px solid rgba(74,222,128,0.18)",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {listing.effectSummary}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <CoinIcon size={11} />
          <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 11, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
        </div>
        {/* Seller name — only visible to admins */}
        {isAdmin && listing.sellerName && (
          <span style={{ color: "rgba(150,200,150,0.4)", fontSize: 8 }}>{listing.sellerName}</span>
        )}
      </button>
      {!isOwn && (
        <button
          data-testid={`button-buy-${listing.id}`}
          onClick={() => onDetail?.(listing)}
          style={{
            marginTop: "auto",
            width: "100%",
            background: isPetEgg
              ? "linear-gradient(135deg, rgba(140,80,220,0.35) 0%, rgba(100,40,180,0.35) 100%)"
              : "linear-gradient(135deg, rgba(74,222,128,0.3) 0%, rgba(40,160,80,0.3) 100%)",
            border: `1px solid ${isPetEgg ? "rgba(180,130,255,0.5)" : "rgba(74,222,128,0.5)"}`,
            borderRadius: 7,
            padding: "5px 10px",
            color: isPetEgg ? "#c8a0ff" : "#4ade80",
            fontFamily: "Georgia, serif",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {isPetEgg ? "View" : "Buy"}
        </button>
      )}
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

// ── Revert to Egg confirmation modal ─────────────────────────────────────────
function RevertToEggModal({ petName, onRevert, onCancel, isPending }: {
  petName: string;
  onRevert: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "linear-gradient(160deg, rgba(20,8,40,0.98) 0%, rgba(40,15,70,0.98) 100%)",
          border: "2px solid rgba(180,130,255,0.6)",
          borderRadius: 20,
          padding: "28px 22px",
          width: "100%",
          maxWidth: 340,
          boxShadow: "0 0 50px rgba(120,60,200,0.35), 0 0 20px rgba(0,0,0,0.9)",
          textAlign: "center",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 48, marginBottom: 10, filter: "drop-shadow(0 0 12px rgba(180,130,255,0.7))" }}>🥚</div>
        <h2 style={{
          color: "#c8a0ff",
          fontFamily: "Georgia, serif",
          fontSize: 19,
          margin: "0 0 10px",
          textShadow: "0 0 12px rgba(180,130,255,0.5)",
        }}>
          Revert to Egg
        </h2>
        <p style={{
          color: "rgba(200,170,255,0.85)",
          fontFamily: "Georgia, serif",
          fontSize: 13,
          lineHeight: 1.6,
          margin: "0 0 8px",
        }}>
          <em>"{petName}"</em> shall be sealed within its egg once more to continue the listing.
        </p>
        <p style={{
          color: "rgba(180,140,255,0.6)",
          fontSize: 11,
          fontFamily: "Georgia, serif",
          margin: "0 0 22px",
          fontStyle: "italic",
        }}>
          All equipped accessories shall be unequipped. Stats are preserved within the egg.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            data-testid="button-revert-cancel"
            onClick={onCancel}
            style={{
              flex: 1,
              background: "rgba(40,20,60,0.6)",
              border: "1.5px solid rgba(120,80,180,0.4)",
              borderRadius: 10,
              padding: "11px",
              color: "rgba(180,140,255,0.65)",
              fontFamily: "Georgia, serif",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            data-testid="button-revert-confirm"
            disabled={isPending}
            onClick={onRevert}
            style={{
              flex: 1,
              background: "linear-gradient(135deg, rgba(140,80,220,0.5) 0%, rgba(100,40,180,0.5) 100%)",
              border: "1.5px solid rgba(180,130,255,0.7)",
              borderRadius: 10,
              padding: "11px",
              color: "#c8a0ff",
              fontFamily: "Georgia, serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              textShadow: "0 0 8px rgba(180,130,255,0.5)",
            }}
          >
            {isPending ? "Reverting..." : "⟳ Revert"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pet Egg Detail popup (browse tab) ────────────────────────────────────────
function PetEggDetailModal({ listing, onClose, onBuy, isBuyPending, userCoins, isAdmin }: {
  listing: Listing;
  onClose: () => void;
  onBuy: () => void;
  isBuyPending: boolean;
  userCoins: number;
  isAdmin: boolean;
}) {
  const detailsQuery = useQuery<PetEggDetails>({
    queryKey: ["/api/market/listing", listing.id, "pet-details"],
    queryFn: () => fetch(`/api/market/listing/${listing.id}/pet-details`).then(r => r.json()),
  });

  const d = detailsQuery.data;
  const canAfford = userCoins >= listing.price;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(170deg, rgba(12,4,28,0.99) 0%, rgba(28,8,56,0.99) 55%, rgba(10,28,14,0.99) 100%)",
          border: "2px solid rgba(212,160,23,0.55)",
          borderRadius: 22,
          padding: "28px 22px 22px",
          width: "100%",
          maxWidth: 320,
          boxShadow: "0 0 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(212,160,23,0.15)",
          textAlign: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(212,160,23,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
        >
          ✕
        </button>

        <p style={{ color: "rgba(212,160,23,0.55)", fontFamily: "Georgia, serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 14px" }}>
          Pet Egg
        </p>

        {detailsQuery.isLoading ? (
          <p style={{ color: "rgba(212,160,23,0.5)", fontFamily: "Georgia, serif", fontSize: 13, padding: "30px 0" }}>Consulting the oracle…</p>
        ) : d ? (
          <>
            <div style={{ marginBottom: 14 }}>
              {d.eggImageUrl ? (
                <img src={d.eggImageUrl} alt={d.speciesName} style={{ width: 96, height: 96, objectFit: "contain", filter: "drop-shadow(0 4px 18px rgba(212,160,23,0.35))" }} />
              ) : (
                <div style={{ fontSize: 72, lineHeight: 1 }}>🥚</div>
              )}
            </div>

            {d.petNickname && (
              <p style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, margin: "0 0 3px", textShadow: "0 0 10px rgba(240,192,64,0.3)" }}>
                "{d.petNickname}"
              </p>
            )}
            <p style={{ color: "rgba(212,160,23,0.7)", fontFamily: "Georgia, serif", fontSize: 12, margin: "0 0 16px", fontStyle: "italic" }}>
              {d.speciesName}
            </p>

            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)", marginBottom: 14 }} />

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "rgba(212,160,23,0.5)", fontFamily: "Georgia, serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Level</div>
              <div style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{d.level}</div>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16,
              background: "rgba(0,0,0,0.35)", borderRadius: 14, padding: "12px 8px",
              border: "1px solid rgba(74,222,128,0.18)",
            }}>
              {[
                { label: "HP", value: d.health, color: "#f87171" },
                { label: "ATK", value: d.atk, color: "#fbbf24" },
                { label: "DEF", value: d.def, color: "#60a5fa" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ color: "rgba(150,200,150,0.55)", fontSize: 9, fontFamily: "Georgia, serif", marginBottom: 3, letterSpacing: "0.08em" }}>{s.label}</div>
                  <div style={{ color: s.color, fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.25), transparent)", marginBottom: 14 }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
              <CoinIcon size={16} />
              <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
            </div>
            {isAdmin && listing.sellerName && (
              <p style={{ color: "rgba(150,200,150,0.45)", fontSize: 10, margin: "0 0 14px", fontFamily: "Georgia, serif" }}>
                Sold by {listing.sellerName}
              </p>
            )}
            {!isAdmin && <div style={{ marginBottom: 14 }} />}

            {!canAfford && (
              <p style={{ color: "#f87171", fontSize: 11, margin: "0 0 10px", fontFamily: "Georgia, serif" }}>
                Not enough coins (you have {formatCoins(userCoins)})
              </p>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(212,160,23,0.2)", borderRadius: 11, padding: "11px", color: "rgba(212,160,23,0.5)", fontFamily: "Georgia, serif", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                data-testid="button-confirm-buy"
                disabled={!canAfford || isBuyPending}
                onClick={(e) => { burstGoldenOrbs(e.clientX, e.clientY); onBuy(); }}
                style={{
                  flex: 2,
                  background: canAfford
                    ? "linear-gradient(135deg, rgba(74,222,128,0.35) 0%, rgba(40,160,80,0.35) 100%)"
                    : "rgba(0,0,0,0.25)",
                  border: `1.5px solid ${canAfford ? "rgba(74,222,128,0.6)" : "rgba(74,180,100,0.15)"}`,
                  borderRadius: 11, padding: "11px",
                  color: canAfford ? "#4ade80" : "rgba(74,180,100,0.35)",
                  fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700,
                  cursor: canAfford && !isBuyPending ? "pointer" : "not-allowed",
                  letterSpacing: "0.04em",
                }}
              >
                {isBuyPending ? "Buying…" : "Buy Egg"}
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: "rgba(220,80,80,0.7)", fontFamily: "Georgia, serif", fontSize: 12, padding: "10px 0" }}>Could not load egg details.</p>
        )}
      </div>
    </div>
  );
}

// ── Sell Item Modal ───────────────────────────────────────────────────────────
function SellItemModal({ inventory, fishInventory, onClose, onSubmit, onSubmitFish, onSubmitPet, isPending, isPetPending }: {
  inventory: InventoryItem[];
  fishInventory: FishItem[];
  onClose: () => void;
  onSubmit: (inventoryId: string, price: number) => void;
  onSubmitFish: (fishInventoryId: string, price: number) => void;
  onSubmitPet: (inventoryId: string, price: number) => void;
  isPending: boolean;
  isPetPending: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIsFish, setSelectedIsFish] = useState(false);
  const [selectedIsPet, setSelectedIsPet] = useState(false);
  const [price, setPrice] = useState("");
  const [showRevert, setShowRevert] = useState(false);
  const [sellTab, setSellTab] = useState<"items" | "fish" | "pets">("items");

  const regularSellable = inventory.filter(i => i.type !== "pet" && !i.isListed);
  const petSellable = inventory.filter(i => i.type === "pet" && !i.isListed);
  const fishSellable = fishInventory.filter(f => !f.inAquarium);

  const selectedItem = selectedIsFish
    ? fishSellable.find(f => f.id === selectedId)
    : selectedIsPet
      ? petSellable.find(i => i.id === selectedId)
      : regularSellable.find(i => i.id === selectedId);

  const selectedName = selectedIsFish
    ? (selectedItem as FishItem | undefined)?.item?.name ?? "Unknown"
    : selectedIsPet
      ? ((selectedItem as InventoryItem | undefined)?.petNickname || (selectedItem as InventoryItem | undefined)?.name) ?? ""
      : (selectedItem as InventoryItem | undefined)?.name ?? "";

  const priceNum = parseInt(price.replace(/,/g, ""), 10);
  const priceValid = !isNaN(priceNum) && priceNum >= 1 && priceNum <= 1000000;

  function handleListForSale() {
    if (!selectedItem || !priceValid) return;
    if (selectedIsPet) {
      setShowRevert(true);
      return;
    }
    if (selectedIsFish) onSubmitFish(selectedItem.id, priceNum);
    else onSubmit(selectedItem.id, priceNum);
  }

  const selectedPet = selectedIsPet ? (selectedItem as InventoryItem | undefined) : undefined;
  const petDisplayName = selectedPet?.petNickname || selectedPet?.name || "this pet";

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
          maxHeight: "calc(80*var(--vh))",
          overflowY: "auto",
          boxShadow: "0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(74,222,128,0.1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ color: "#4ade80", fontFamily: "Georgia, serif", fontSize: 18, margin: 0 }}>List Item for Sale</h2>
          <button onClick={() => { playClick(); onClose(); }} style={{ background: "none", border: "none", color: "rgba(150,200,150,0.7)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {([
            { key: "items" as const, icon: powerupBagIcon, label: "Items", count: regularSellable.length, activeColor: "#4ade80", activeBg: "rgba(74,222,128,0.15)", activeBorder: "rgba(74,222,128,0.55)" },
            { key: "fish"  as const, icon: fishInvIcon,    label: "Fish",  count: fishSellable.length,    activeColor: "#67e8f9", activeBg: "rgba(103,232,249,0.12)", activeBorder: "rgba(103,232,249,0.5)" },
            { key: "pets"  as const, icon: eggMagicIcon,   label: "Pets",  count: petSellable.length,     activeColor: "#c084fc", activeBg: "rgba(192,132,252,0.15)", activeBorder: "rgba(192,132,252,0.55)" },
          ]).map(tab => {
            const active = sellTab === tab.key;
            return (
              <button
                key={tab.key}
                data-testid={`button-sell-tab-${tab.key}`}
                onClick={() => {
                  if (sellTab !== tab.key) {
                    setSellTab(tab.key);
                    playTick();
                    setSelectedId(null);
                    setSelectedIsFish(false);
                    setSelectedIsPet(false);
                  }
                }}
                style={{
                  flex: 1,
                  background: active ? tab.activeBg : "rgba(0,0,0,0.2)",
                  border: `1px solid ${active ? tab.activeBorder : "rgba(74,180,100,0.15)"}`,
                  borderRadius: 8, padding: "6px 4px",
                  color: active ? tab.activeColor : "rgba(150,200,150,0.45)",
                  fontFamily: "Georgia, serif", fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}
              >
                <img src={tab.icon} alt="" style={{ width: 16, height: 16, objectFit: "contain", opacity: active ? 1 : 0.45 }} />
                {tab.label}
                <span style={{
                  background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "1px 5px",
                  fontSize: 10, color: active ? tab.activeColor : "rgba(150,200,150,0.35)",
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {regularSellable.length === 0 && fishSellable.length === 0 && petSellable.length === 0 ? (
          <p style={{ color: "rgba(150,200,150,0.5)", textAlign: "center", fontFamily: "Georgia, serif", fontSize: 13, padding: "20px 0" }}>No sellable items in inventory</p>
        ) : (
          <>
            {sellTab === "items" && (
              regularSellable.length === 0 ? (
                <p style={{ color: "rgba(150,200,150,0.4)", textAlign: "center", fontFamily: "Georgia, serif", fontSize: 12, padding: "16px 0" }}>No items to sell</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16, maxHeight: 280, overflowY: "auto" }}>
                  {regularSellable.map(item => (
                    <button
                      key={item.id}
                      data-testid={`button-select-item-${item.id}`}
                      onClick={() => { setSelectedId(item.id); setSelectedIsFish(false); setSelectedIsPet(false); playClick(); }}
                      style={{
                        background: selectedId === item.id && !selectedIsFish && !selectedIsPet ? "rgba(74,222,128,0.2)" : "rgba(20,50,25,0.7)",
                        border: `2px solid ${selectedId === item.id && !selectedIsFish && !selectedIsPet ? "rgba(74,222,128,0.7)" : "rgba(74,180,100,0.25)"}`,
                        borderRadius: 10, padding: 8, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
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
              )
            )}

            {sellTab === "fish" && (
              fishSellable.length === 0 ? (
                <p style={{ color: "rgba(150,200,150,0.4)", textAlign: "center", fontFamily: "Georgia, serif", fontSize: 12, padding: "16px 0" }}>No fish to sell</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16, maxHeight: 280, overflowY: "auto" }}>
                  {fishSellable.map(fish => (
                    <button
                      key={fish.id}
                      data-testid={`button-select-fish-${fish.id}`}
                      onClick={() => { setSelectedId(fish.id); setSelectedIsFish(true); setSelectedIsPet(false); playClick(); }}
                      style={{
                        background: selectedId === fish.id && selectedIsFish ? "rgba(103,232,249,0.15)" : "rgba(10,30,40,0.7)",
                        border: `2px solid ${selectedId === fish.id && selectedIsFish ? "rgba(103,232,249,0.7)" : "rgba(74,180,200,0.25)"}`,
                        borderRadius: 10, padding: 8, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative",
                      }}
                    >
                      {fish.item?.imageUrl ? (
                        <img src={fish.item.imageUrl} alt={fish.item.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
                      ) : (
                        <div style={{ width: 44, height: 44, background: "rgba(74,200,222,0.1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🐟</div>
                      )}
                      <span style={{ color: "#a0e8f0", fontSize: 9, fontFamily: "Georgia, serif", textAlign: "center", lineHeight: 1.2 }}>{fish.item?.name ?? "Fish"}</span>
                      <span style={{ position: "absolute", top: 3, right: 3, fontSize: 8, color: "rgba(127,200,255,0.7)" }}>🎣</span>
                    </button>
                  ))}
                </div>
              )
            )}

            {sellTab === "pets" && (
              petSellable.length === 0 ? (
                <p style={{ color: "rgba(150,200,150,0.4)", textAlign: "center", fontFamily: "Georgia, serif", fontSize: 12, padding: "16px 0" }}>No pets to sell</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16, maxHeight: 300, overflowY: "auto" }}>
                  {petSellable.map(pet => {
                    const isSelected = selectedId === pet.id && selectedIsPet;
                    const displayImg = pet.isHatched
                      ? (pet.hatchedImageUrl || pet.imageUrl)
                      : (pet.eggImageUrl || pet.imageUrl);
                    return (
                      <button
                        key={pet.id}
                        data-testid={`button-select-pet-${pet.id}`}
                        onClick={() => { setSelectedId(pet.id); setSelectedIsFish(false); setSelectedIsPet(true); playClick(); }}
                        style={{
                          background: isSelected ? "rgba(140,80,220,0.25)" : "rgba(30,10,50,0.7)",
                          border: `2px solid ${isSelected ? "rgba(180,130,255,0.7)" : "rgba(140,80,200,0.25)"}`,
                          borderRadius: 10, padding: "8px 10px", cursor: "pointer",
                          display: "flex", flexDirection: "row", alignItems: "center", gap: 10,
                          position: "relative", textAlign: "left",
                        }}
                      >
                        <div style={{ flexShrink: 0, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {displayImg ? (
                            <img src={displayImg} alt={pet.name} style={{ width: 52, height: 52, objectFit: "contain" }} />
                          ) : (
                            <div style={{ width: 52, height: 52, background: "rgba(140,80,220,0.15)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🥚</div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ color: "#d4b8ff", fontSize: 10, fontFamily: "Georgia, serif", lineHeight: 1.2, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {pet.petNickname || pet.name}
                          </span>
                          {pet.isHatched ? (
                            <>
                              <span style={{ color: "rgba(192,132,252,0.7)", fontSize: 9, fontFamily: "Georgia, serif" }}>
                                Lv.{pet.petLevel ?? 1}
                              </span>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 8, color: "#f87171", fontFamily: "Georgia, serif" }}>HP {pet.petHealth ?? "—"}</span>
                                <span style={{ fontSize: 8, color: "#fb923c", fontFamily: "Georgia, serif" }}>ATK {pet.petAtk ?? "—"}</span>
                                <span style={{ fontSize: 8, color: "#60a5fa", fontFamily: "Georgia, serif" }}>DEF {pet.petDef ?? "—"}</span>
                              </div>
                            </>
                          ) : (
                            <span style={{ fontSize: 8, color: "rgba(180,130,255,0.55)", fontFamily: "Georgia, serif" }}>🥚 Egg</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        {selectedItem && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "rgba(150,200,150,0.8)", fontSize: 11, marginBottom: 8 }}>
              Selling: <span style={{ color: selectedIsPet ? "#c8a0ff" : "#4ade80", fontWeight: 700 }}>
                {selectedName}{selectedIsPet && !selectedPet?.isHatched ? " (Egg)" : ""}
              </span>
            </p>
            {selectedIsPet && selectedPet?.isHatched && (
              <p style={{ color: "rgba(180,140,255,0.6)", fontSize: 10, fontFamily: "Georgia, serif", fontStyle: "italic", marginBottom: 8 }}>
                Pet will be reverted to egg before listing.
              </p>
            )}
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
                  borderRadius: 8, padding: "8px 10px",
                  color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 14, outline: "none",
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
          disabled={!selectedItem || !priceValid || isPending || isPetPending}
          onClick={handleListForSale}
          style={{
            width: "100%",
            background: selectedItem && priceValid
              ? selectedIsPet
                ? "linear-gradient(135deg, rgba(140,80,220,0.4) 0%, rgba(100,40,180,0.4) 100%)"
                : "linear-gradient(135deg, rgba(74,222,128,0.4) 0%, rgba(40,160,80,0.4) 100%)"
              : "rgba(50,80,55,0.4)",
            border: `1px solid ${selectedItem && priceValid ? (selectedIsPet ? "rgba(180,130,255,0.6)" : "rgba(74,222,128,0.6)") : "rgba(74,180,100,0.2)"}`,
            borderRadius: 10, padding: "10px",
            color: selectedItem && priceValid ? (selectedIsPet ? "#c8a0ff" : "#4ade80") : "rgba(74,180,100,0.4)",
            fontFamily: "Georgia, serif", fontSize: 14,
            cursor: selectedItem && priceValid && !isPending && !isPetPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending || isPetPending ? "Listing..." : "List for Sale"}
        </button>
      </div>

      {showRevert && selectedPet && (
        <RevertToEggModal
          petName={petDisplayName}
          isPending={isPetPending}
          onRevert={() => {
            if (selectedPet && priceValid) {
              onSubmitPet(selectedPet.id, priceNum);
            }
          }}
          onCancel={() => setShowRevert(false)}
        />
      )}
    </div>
  );
}

// ── Item Detail + Buy popup (browse tab, non-pet-egg items) ──────────────────
const ITEM_TYPE_LABELS: Record<string, string> = {
  power_up: "Power-Up",
  edibles: "Edible",
  potion: "Potion",
  special: "Special",
  accessory: "Accessory",
  fish: "Fish",
  bait: "Fishing Bait",
  pole: "Fishing Rod",
  ingredient: "Ingredient",
};

function ItemDetailModal({ listing, onClose, onBuy, isBuyPending, userCoins, isAdmin }: {
  listing: Listing;
  onClose: () => void;
  onBuy: () => void;
  isBuyPending: boolean;
  userCoins: number;
  isAdmin: boolean;
}) {
  const detailsQuery = useQuery<ItemDetails>({
    queryKey: ["/api/market/listing", listing.id, "item-details"],
    queryFn: () => fetch(`/api/market/listing/${listing.id}/item-details`).then(r => r.json()),
  });

  const d = detailsQuery.data;
  const canAfford = userCoins >= listing.price;
  const typeLabel = ITEM_TYPE_LABELS[listing.itemType] ?? listing.itemType;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "linear-gradient(170deg, rgba(6,22,10,0.99) 0%, rgba(10,35,16,0.99) 60%, rgba(8,24,12,0.99) 100%)",
          border: "2px solid rgba(212,160,23,0.5)",
          borderRadius: 22,
          padding: "28px 22px 22px",
          width: "100%",
          maxWidth: 320,
          boxShadow: "0 0 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(212,160,23,0.12)",
          textAlign: "center",
          position: "relative",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(212,160,23,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
        >
          ✕
        </button>

        <p style={{ color: "rgba(212,160,23,0.55)", fontFamily: "Georgia, serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 14px" }}>
          {typeLabel}
        </p>

        <div style={{ marginBottom: 14 }}>
          {listing.itemImageUrl ? (
            <img src={listing.itemImageUrl} alt={listing.itemName} style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 4px 16px rgba(74,222,128,0.2))" }} />
          ) : (
            <img src={powerupBagIcon} alt="" style={{ width: 72, height: 72, objectFit: "contain", opacity: 0.7 }} />
          )}
        </div>

        <p style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, margin: "0 0 14px", textShadow: "0 0 10px rgba(240,192,64,0.25)" }}>
          {listing.itemName}
        </p>

        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.3), transparent)", marginBottom: 14 }} />

        {detailsQuery.isLoading ? (
          <p style={{ color: "rgba(150,200,150,0.4)", fontFamily: "Georgia, serif", fontSize: 12, margin: "0 0 14px" }}>Loading…</p>
        ) : d && d.effects.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <p style={{ color: "rgba(150,200,150,0.5)", fontFamily: "Georgia, serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Effect</p>
            {d.effects.map((effect, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                borderRadius: 10, padding: "8px 14px", marginBottom: i < d.effects.length - 1 ? 6 : 0,
              }}>
                <span style={{ color: "#4ade80", fontSize: 13 }}>✦</span>
                <span style={{ color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700 }}>{effect}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
              borderRadius: 10, padding: "10px 14px",
            }}>
              <span style={{ color: "rgba(150,200,150,0.5)", fontFamily: "Georgia, serif", fontSize: 12, fontStyle: "italic" }}>
                {d?.description ?? "A useful market item."}
              </span>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.25), transparent)", marginBottom: 14 }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
          <CoinIcon size={16} />
          <span style={{ color: "#f0c040", fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700 }}>{formatCoins(listing.price)}</span>
        </div>
        {isAdmin && listing.sellerName && (
          <p style={{ color: "rgba(150,200,150,0.4)", fontSize: 10, margin: "0 0 14px", fontFamily: "Georgia, serif" }}>
            Sold by {listing.sellerName}
          </p>
        )}
        {!isAdmin && <div style={{ marginBottom: 14 }} />}

        {!canAfford && (
          <p style={{ color: "#f87171", fontSize: 11, margin: "0 0 10px", fontFamily: "Georgia, serif" }}>
            Not enough coins (you have {formatCoins(userCoins)})
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(212,160,23,0.18)", borderRadius: 11, padding: "11px", color: "rgba(212,160,23,0.5)", fontFamily: "Georgia, serif", fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            data-testid="button-confirm-buy"
            disabled={!canAfford || isBuyPending}
            onClick={(e) => { burstGoldenOrbs(e.clientX, e.clientY); onBuy(); }}
            style={{
              flex: 2,
              background: canAfford
                ? "linear-gradient(135deg, rgba(74,222,128,0.35) 0%, rgba(40,160,80,0.35) 100%)"
                : "rgba(0,0,0,0.25)",
              border: `1.5px solid ${canAfford ? "rgba(74,222,128,0.6)" : "rgba(74,180,100,0.15)"}`,
              borderRadius: 11, padding: "11px",
              color: canAfford ? "#4ade80" : "rgba(74,180,100,0.35)",
              fontFamily: "Georgia, serif", fontSize: 14, fontWeight: 700,
              cursor: canAfford && !isBuyPending ? "pointer" : "not-allowed",
              letterSpacing: "0.04em",
            }}
          >
            {isBuyPending ? "Buying…" : "Buy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MarketPage({ user, onUserUpdate }: { user: any; onUserUpdate?: (u: any) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"browse" | "myshop">("browse");
  const [search, setSearch] = useState("");

  // Browse filter state: main tab + items sub-filter
  const [mainTab, setMainTab] = useState<MainTab>("all");
  const [itemsSubFilter, setItemsSubFilter] = useState("items");

  const [showSellModal, setShowSellModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Listing | null>(null);

  const isAdmin = !!user?.isAdmin;

  // Compute the itemType to send to the API
  const effectiveItemType = (() => {
    if (mainTab === "all") return "all";
    if (mainTab === "pets") return "pet_egg";
    if (mainTab === "fish") return "fish";
    // mainTab === "items"
    return itemsSubFilter; // "items" or specific sub-type
  })();

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

  const myListingsQuery = useQuery<Listing[]>({
    queryKey: ["/api/market/my-listings"],
    enabled: activeTab === "myshop",
  });

  const inventoryQuery = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    enabled: showSellModal,
  });

  const fishInventoryQuery = useQuery<FishItem[]>({
    queryKey: ["/api/fishing/inventory"],
    enabled: showSellModal,
  });

  const listMutation = useMutation({
    mutationFn: ({ inventoryId, price }: { inventoryId: string; price: number }) =>
      apiRequest("POST", "/api/market/list", { inventoryId, price }),
    onSuccess: () => {
      setShowSellModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Listed!", description: "Your item is now on the market." });
    },
    onError: (e: any) => toast({ title: "Failed to list item", description: e.message, variant: "destructive" }),
  });

  const listFishMutation = useMutation({
    mutationFn: ({ fishInventoryId, price }: { fishInventoryId: string; price: number }) =>
      apiRequest("POST", "/api/market/list-fish", { fishInventoryId, price }),
    onSuccess: () => {
      setShowSellModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
      toast({ title: "Fish listed!", description: "Your fish is now on the market." });
    },
    onError: (e: any) => toast({ title: "Failed to list fish", description: e.message, variant: "destructive" }),
  });

  const revertAndListMutation = useMutation({
    mutationFn: async ({ inventoryId, price }: { inventoryId: string; price: number }) => {
      await apiRequest("POST", `/api/pet/${inventoryId}/revert-to-egg`, {});
      return apiRequest("POST", "/api/market/list", { inventoryId, price });
    },
    onSuccess: () => {
      setShowSellModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Pet egg listed!", description: "Your pet egg is now on the market." });
    },
    onError: (e: any) => toast({ title: "Failed to list pet egg", description: e.message, variant: "destructive" }),
  });

  const buyMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("POST", `/api/market/${listingId}/buy`, {}),
    onSuccess: async () => {
      setDetailTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/market"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fishing/inventory"] });
      const updatedUser = await fetch("/api/auth/me").then(r => r.json());
      onUserUpdate?.(updatedUser);
      playChime();
      toast({ title: "Purchase complete!", description: "Check your inventory." });
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
    onSuccess: async () => {
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

  // Main tab config
  const MAIN_TABS: { value: MainTab; label: string; color: string; activeBg: string; activeBorder: string }[] = [
    { value: "all",   label: "All",   color: accentGreen,    activeBg: "rgba(74,222,128,0.18)",  activeBorder: accentGreen },
    { value: "pets",  label: "Pets",  color: "#c084fc",      activeBg: "rgba(192,132,252,0.18)", activeBorder: "#c084fc" },
    { value: "items", label: "Items", color: "#fbbf24",      activeBg: "rgba(251,191,36,0.15)",  activeBorder: "#fbbf24" },
    { value: "fish",  label: "Fish",  color: "#67e8f9",      activeBg: "rgba(103,232,249,0.15)", activeBorder: "#67e8f9" },
  ];

  return (
    <div
      style={{
        minHeight: "calc(100*var(--vh))",
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

      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", height: "calc(100*var(--vh))" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0", paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 52px)" }}>
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

        {/* Market / List Items switch */}
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
            {/* Search bar */}
            <input
              data-testid="input-market-search"
              type="text"
              placeholder={isAdmin ? "Search items or sellers..." : "Search items..."}
              value={search}
              onChange={handleSearch}
              style={{
                width: "100%", background: "rgba(10,30,15,0.85)", border: "1.5px solid rgba(74,222,128,0.3)", borderRadius: 10,
                padding: "10px 14px", color: "#d4f0d4", fontFamily: "Georgia, serif", fontSize: 13, outline: "none", marginBottom: 10,
                boxSizing: "border-box",
              }}
            />

            {/* Main category tabs: All | Pets | Items | Fish */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexShrink: 0 }}>
              {MAIN_TABS.map(tab => {
                const active = mainTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    data-testid={`button-main-tab-${tab.value}`}
                    onClick={() => {
                      setMainTab(tab.value);
                      playTick();
                      if (tab.value !== "items") setItemsSubFilter("items");
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      background: active ? tab.activeBg : "rgba(10,30,15,0.7)",
                      border: `1.5px solid ${active ? tab.activeBorder : "rgba(74,180,100,0.2)"}`,
                      borderRadius: 10,
                      color: active ? tab.color : "rgba(150,200,150,0.55)",
                      fontFamily: "Georgia, serif",
                      fontSize: 12,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Items sub-filter pills — shown only when "Items" tab is active */}
            {mainTab === "items" && (
              <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 6, marginBottom: 8, flexShrink: 0 }}>
                {ITEMS_SUB_FILTERS.map(sf => {
                  const active = itemsSubFilter === sf.value;
                  return (
                    <button
                      key={sf.value}
                      data-testid={`button-sub-filter-${sf.value}`}
                      onClick={() => { setItemsSubFilter(sf.value); playTick(); }}
                      style={{
                        whiteSpace: "nowrap",
                        padding: "5px 10px",
                        background: active ? "rgba(251,191,36,0.2)" : "rgba(10,30,15,0.7)",
                        border: `1.5px solid ${active ? "rgba(251,191,36,0.7)" : "rgba(150,140,80,0.2)"}`,
                        borderRadius: 18,
                        color: active ? "#fbbf24" : "rgba(180,170,120,0.6)",
                        fontFamily: "Georgia, serif",
                        fontSize: 10,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {sf.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Listings grid */}
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
              {marketQuery.isLoading ? (
                <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(150,200,150,0.5)", fontFamily: "Georgia, serif", fontSize: 14 }}>Loading market...</div>
              ) : !marketQuery.data?.length ? (
                <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(150,200,150,0.4)", fontFamily: "Georgia, serif", fontSize: 14 }}>
                  {search || mainTab !== "all" ? "No listings match your search." : "The market is empty. Be the first to sell!"}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {marketQuery.data.map(listing => (
                    <ItemCard
                      key={listing.id}
                      listing={listing}
                      isMine={false}
                      user={user}
                      onDetail={setDetailTarget}
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
                    borderRadius: 10, padding: "6px 12px",
                    cursor: (user?.coins ?? 0) >= 300 ? "pointer" : "not-allowed",
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
          fishInventory={fishInventoryQuery.data ?? []}
          onClose={() => setShowSellModal(false)}
          onSubmit={(inventoryId, price) => listMutation.mutate({ inventoryId, price })}
          onSubmitFish={(fishInventoryId, price) => listFishMutation.mutate({ fishInventoryId, price })}
          onSubmitPet={(inventoryId, price) => revertAndListMutation.mutate({ inventoryId, price })}
          isPending={listMutation.isPending || listFishMutation.isPending}
          isPetPending={revertAndListMutation.isPending}
        />
      )}

      {detailTarget && detailTarget.itemType === "pet_egg" && (
        <PetEggDetailModal
          listing={detailTarget}
          onClose={() => setDetailTarget(null)}
          onBuy={() => buyMutation.mutate(detailTarget.id)}
          isBuyPending={buyMutation.isPending}
          userCoins={user?.coins ?? 0}
          isAdmin={isAdmin}
        />
      )}

      {detailTarget && detailTarget.itemType !== "pet_egg" && (
        <ItemDetailModal
          listing={detailTarget}
          onClose={() => setDetailTarget(null)}
          onBuy={() => buyMutation.mutate(detailTarget.id)}
          isBuyPending={buyMutation.isPending}
          userCoins={user?.coins ?? 0}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
