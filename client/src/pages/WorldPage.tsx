import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";

import shopFrostpeak from "@assets/shop_frostpeak.png";
import shopSkyRealm from "@assets/shop_sky_realm.png";
import shopVolcanic from "@assets/shop_volcanic.png";
import shopIsland from "@assets/shop_island.png";
import shopDesert from "@assets/shop_desert.png";
import shopEnchantedGrove from "@assets/shop_enchanted_grove.png";
import shopHauntedWoods from "@assets/shop_haunted_woods.png";
import shopSwamp from "@assets/shop_swamp.png";

import bgSnowyMountain from "@assets/bg_snowy_mountain.png";
import bgSkyRealm from "@assets/bg_sky_realm.png";
import bgVolcanic from "@assets/bg_volcanic.png";
import bgIsland from "@assets/bg_island.png";
import bgDesert from "@assets/bg_desert.png";
import bgMagicalForest from "@assets/bg_magical_forest.png";
import bgHauntedWoods from "@assets/bg_haunted_woods.png";
import bgSwamp from "@assets/bg_swamp.png";

const WORLD_CONFIG: Record<string, { name: string; shopIcon: string; bg: string }> = {
  snowy_mountain: { name: "Frostpeak", shopIcon: shopFrostpeak, bg: bgSnowyMountain },
  sky_realm: { name: "Sky Realm", shopIcon: shopSkyRealm, bg: bgSkyRealm },
  volcanic: { name: "Volcanic Isle", shopIcon: shopVolcanic, bg: bgVolcanic },
  island: { name: "Treasure Isle", shopIcon: shopIsland, bg: bgIsland },
  desert: { name: "Scorched Desert", shopIcon: shopDesert, bg: bgDesert },
  enchanted_grove: { name: "Enchanted Grove", shopIcon: shopEnchantedGrove, bg: bgMagicalForest },
  haunted_woods: { name: "Haunted Woods", shopIcon: shopHauntedWoods, bg: bgHauntedWoods },
  swamp: { name: "The Swamp", shopIcon: shopSwamp, bg: bgSwamp },
};

const ITEM_TYPES = ["pet", "item", "accessory", "potion"];

interface ShopItem {
  id: string;
  name: string;
  price: number;
  type: string;
  worldId: string;
  imageUrl: string | null;
  createdAt: string;
}

interface WorldPageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
}

export default function WorldPage({ user }: WorldPageProps) {
  const params = useParams<{ worldId: string }>();
  const worldId = params.worldId || "";
  const world = WORLD_CONFIG[worldId];
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showShop, setShowShop] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading: itemsLoading } = useQuery<ShopItem[]>({
    queryKey: ["/api/shop", worldId],
    queryFn: async () => {
      const res = await fetch(`/api/shop/${worldId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: showShop,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    enabled: showShop,
  });

  const ownedItemIds = new Set(inventory.map((inv) => inv.shopItemId));

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/shop/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop", worldId] });
      toast({ title: "Deleted", description: "Item removed from shop" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not delete item", variant: "destructive" });
    },
  });

  const buyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", `/api/shop/${worldId}/buy/${itemId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (data.user) setCurrentUser(data.user);
      toast({ title: "Purchased!", description: "Item added to your inventory" });
    },
    onError: (err: any) => {
      let msg = "Could not purchase item";
      try {
        const parsed = JSON.parse(err.message.split(": ").slice(1).join(": "));
        msg = parsed.message || msg;
      } catch {}
      toast({ title: "Purchase Failed", description: msg, variant: "destructive" });
    },
  });

  if (!world) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black" style={{ maxWidth: "768px", margin: "0 auto" }}>
        <p className="font-fantasy text-[#f0c040]">Unknown realm</p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${world.bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <h2
            className="font-fantasy text-2xl font-bold tracking-widest text-[#f0c040] text-center mb-2"
            style={{ textShadow: "0 0 20px rgba(240,192,64,0.5), 0 2px 8px rgba(0,0,0,0.8)" }}
            data-testid={`text-world-name-${worldId}`}
          >
            {world.name}
          </h2>
          <p className="font-fantasy text-[#a89878] text-xs tracking-wider text-center mb-6">
            This realm awaits exploration...
          </p>
        </div>

        <div className="flex-shrink-0 px-6 pb-6">
          <div className="flex gap-4 justify-center items-end mb-4">
            <button
              data-testid="button-world-shop"
              onClick={() => setShowShop(true)}
              className="flex flex-col items-center gap-1 transition-transform active:scale-95"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <img
                src={world.shopIcon}
                alt={`${world.name} Shop`}
                className="w-16 h-16 rounded-lg object-cover"
                style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.7))", border: "2px solid rgba(212,160,23,0.4)" }}
              />
              <span className="font-fantasy text-[#f0c040] text-[10px] tracking-wider" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                Shop
              </span>
            </button>
          </div>

          <button
            data-testid="button-back-to-map"
            onClick={() => navigate("/map")}
            className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider transition-transform active:scale-98"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
              border: "1px solid rgba(212,160,23,0.5)",
              color: "#f0c040",
              cursor: "pointer",
              boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
            }}
          >
            Back to Map
          </button>
        </div>
      </div>

      {showShop && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShop(false)} />
          <div className="relative z-10 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <img src={world.shopIcon} alt="" className="w-12 h-12 rounded-lg object-cover" style={{ border: "1px solid rgba(212,160,23,0.4)" }} />
                <div>
                  <h3 className="font-fantasy text-[#f0c040] text-base tracking-widest font-semibold" style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}>
                    {world.name} Shop
                  </h3>
                  <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <button
                data-testid="button-close-shop"
                onClick={() => setShowShop(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
                  border: "2px solid rgba(212,160,23,0.6)",
                  color: "#f0c040",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {currentUser.isAdmin && (
                <button
                  data-testid="button-add-item"
                  onClick={() => { setShowAddForm(true); setEditingItem(null); }}
                  className="w-full mb-3 py-2.5 rounded-lg font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(127,255,212,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  <span className="text-xl leading-none">+</span> Add Item
                </button>
              )}

              {itemsLoading ? (
                <div className="text-center py-8">
                  <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse">Loading wares...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12">
                  <p className="font-fantasy text-[#a89878] text-sm tracking-wider">No items in this shop yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      data-testid={`card-shop-item-${item.id}`}
                      className="rounded-lg overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
                        border: "1px solid rgba(212,160,23,0.3)",
                      }}
                    >
                      <div className="p-3 flex flex-col items-center gap-2">
                        <div
                          className="w-full aspect-square rounded-md flex items-center justify-center"
                          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                        >
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain rounded-md" />
                          ) : (
                            <span className="font-fantasy text-[#5a4a3a] text-2xl">?</span>
                          )}
                        </div>
                        <p className="font-fantasy text-[#f0c040] text-xs font-semibold text-center truncate w-full" data-testid={`text-item-name-${item.id}`}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-1">
                          <img src={coinIconImg} alt="" className="w-3.5 h-3.5 object-contain" />
                          <span className="font-fantasy text-[#f0c040] text-xs">{item.price}</span>
                        </div>
                        <span
                          className="font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded-full capitalize"
                          style={{ background: "rgba(127,255,212,0.15)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}
                        >
                          {item.type}
                        </span>
                        {ownedItemIds.has(item.id) ? (
                          <span
                            className="w-full text-center py-1.5 rounded font-fantasy text-[10px] tracking-wider"
                            style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}
                            data-testid={`text-owned-${item.id}`}
                          >
                            Owned
                          </span>
                        ) : (
                          <button
                            data-testid={`button-buy-item-${item.id}`}
                            onClick={() => buyMutation.mutate(item.id)}
                            disabled={buyMutation.isPending}
                            className="w-full py-1.5 rounded font-fantasy text-[10px] tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                            style={{
                              background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                              border: "1px solid rgba(127,255,212,0.4)",
                              color: "#7fffd4",
                              cursor: "pointer",
                            }}
                          >
                            {buyMutation.isPending ? "Buying..." : "Buy"}
                          </button>
                        )}
                        {currentUser.isAdmin && (
                          <div className="flex gap-2 w-full mt-1">
                            <button
                              data-testid={`button-edit-item-${item.id}`}
                              onClick={() => { setEditingItem(item); setShowAddForm(true); }}
                              className="flex-1 py-1 rounded font-fantasy text-[9px] tracking-wider"
                              style={{
                                background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                                border: "1px solid rgba(212,160,23,0.4)",
                                color: "#f0c040",
                                cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              data-testid={`button-delete-item-${item.id}`}
                              onClick={() => deleteMutation.mutate(item.id)}
                              disabled={deleteMutation.isPending}
                              className="flex-1 py-1 rounded font-fantasy text-[9px] tracking-wider disabled:opacity-50"
                              style={{
                                background: "linear-gradient(135deg, rgba(139,0,0,0.6) 0%, rgba(80,0,0,0.6) 100%)",
                                border: "1px solid rgba(200,50,50,0.4)",
                                color: "#ff9999",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <ShopItemForm
          worldId={worldId}
          item={editingItem}
          onClose={() => { setShowAddForm(false); setEditingItem(null); }}
          onSuccess={() => {
            setShowAddForm(false);
            setEditingItem(null);
            queryClient.invalidateQueries({ queryKey: ["/api/shop", worldId] });
          }}
        />
      )}

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}

function ShopItemForm({
  worldId,
  item,
  onClose,
  onSuccess,
}: {
  worldId: string;
  item: ShopItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price?.toString() || "");
  const [type, setType] = useState(item?.type || "item");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.imageUrl || null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid format", description: "Only PNG and GIF files are supported", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageData(dataUrl);
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !price.trim()) {
      toast({ title: "Missing fields", description: "Name and price are required", variant: "destructive" });
      return;
    }
    const priceNum = parseInt(price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast({ title: "Invalid price", description: "Price must be a positive number", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = { name: name.trim(), price: priceNum, type };
      if (imageData) {
        payload.imageData = imageData;
      }

      if (item) {
        await apiRequest("PATCH", `/api/admin/shop/${item.id}`, payload);
        toast({ title: "Updated", description: "Item updated successfully" });
      } else {
        await apiRequest("POST", "/api/admin/shop", { ...payload, worldId });
        toast({ title: "Created", description: "Item added to shop" });
      }
      onSuccess();
    } catch {
      toast({ title: "Failed", description: "Could not save item", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[85%] max-w-sm rounded-lg p-5 animate-slide-up overflow-y-auto"
        style={{
          background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
          border: "1px solid rgba(212,160,23,0.5)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          maxHeight: "85vh",
        }}
      >
        <button
          data-testid="button-close-form"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)",
            border: "2px solid rgba(212,160,23,0.6)",
            color: "#f0c040",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          X
        </button>

        <h3 className="font-fantasy text-[#f0c040] text-center text-base tracking-widest mb-4">
          {item ? "Edit Item" : "Add Item"}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Image (PNG or GIF, max 1000x1000)</label>
            <div className="flex items-center gap-3">
              <div
                className="w-20 h-20 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.3)" }}
                onClick={() => {
                  const input = document.getElementById("shop-item-file-input") as HTMLInputElement;
                  input?.click();
                }}
                data-testid="button-item-image-upload"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center">
                    <span className="text-[#d4a017] text-xl">+</span>
                    <p className="font-fantasy text-[#6a5840] text-[8px] tracking-wider">Upload</p>
                  </div>
                )}
              </div>
              <input
                id="shop-item-file-input"
                data-testid="input-item-image"
                type="file"
                accept="image/png,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById("shop-item-file-input") as HTMLInputElement;
                    input?.click();
                  }}
                  className="w-full py-2 rounded-md font-fantasy text-[10px] tracking-wider"
                  style={{
                    background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                    border: "1px solid rgba(212,160,23,0.4)",
                    color: "#f0c040",
                    cursor: "pointer",
                  }}
                >
                  {imagePreview ? "Change Image" : "Choose Image"}
                </button>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => { setImageData(null); setImagePreview(null); }}
                    className="w-full mt-1 py-1 rounded-md font-fantasy text-[9px] tracking-wider"
                    style={{
                      background: "rgba(139,0,0,0.3)",
                      border: "1px solid rgba(200,50,50,0.3)",
                      color: "#ff9999",
                      cursor: "pointer",
                    }}
                    data-testid="button-remove-image"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Name</label>
            <input
              data-testid="input-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Price</label>
            <input
              data-testid="input-item-price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
            />
          </div>

          <div>
            <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Type</label>
            <select
              data-testid="select-item-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-md font-sans text-sm outline-none"
              style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <button
            data-testid="button-submit-item"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-98 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
              border: "1px solid rgba(127,255,212,0.4)",
              color: "#7fffd4",
              cursor: "pointer",
            }}
          >
            {submitting ? "Saving..." : item ? "Update Item" : "Add to Shop"}
          </button>
        </div>
      </div>
    </div>
  );
}
