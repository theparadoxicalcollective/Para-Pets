import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import { Store, Swords, Beer, Landmark, Pickaxe, Sprout, Plus, Trash2, X } from "lucide-react";

import shopFrostpeak from "@assets/shop_frostpeak.png";
import shopSkyRealm from "@assets/shop_sky_realm.png";
import shopVolcanic from "@assets/shop_volcanic.png";
import shopIsland from "@assets/shop_island.png";
import shopDesert from "@assets/shop_desert.png";
import shopEnchantedGrove from "@assets/shop_enchanted_grove_v2.png";
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

const WORLD_CONFIG: Record<string, { name: string; shopIcon: string; bg: string; accent: string; bgGradient: string }> = {
  snowy_mountain: { name: "Frostpeak", shopIcon: shopFrostpeak, bg: bgSnowyMountain, accent: "#88ccff", bgGradient: "linear-gradient(180deg, rgba(20,30,60,0.7) 0%, rgba(40,80,120,0.3) 50%, rgba(10,15,30,0.7) 100%)" },
  sky_realm: { name: "Sky Realm", shopIcon: shopSkyRealm, bg: bgSkyRealm, accent: "#ffd700", bgGradient: "linear-gradient(180deg, rgba(40,30,10,0.7) 0%, rgba(80,60,20,0.3) 50%, rgba(20,15,5,0.7) 100%)" },
  volcanic: { name: "Volcanic Isle", shopIcon: shopVolcanic, bg: bgVolcanic, accent: "#ff4500", bgGradient: "linear-gradient(180deg, rgba(40,10,5,0.7) 0%, rgba(80,20,10,0.3) 50%, rgba(20,5,2,0.7) 100%)" },
  island: { name: "The Lost Island", shopIcon: shopIsland, bg: bgIsland, accent: "#20b2aa", bgGradient: "linear-gradient(180deg, rgba(5,30,30,0.7) 0%, rgba(10,60,60,0.3) 50%, rgba(5,15,15,0.7) 100%)" },
  desert: { name: "Scorched Desert", shopIcon: shopDesert, bg: bgDesert, accent: "#daa520", bgGradient: "linear-gradient(180deg, rgba(40,25,5,0.7) 0%, rgba(80,50,10,0.3) 50%, rgba(20,12,3,0.7) 100%)" },
  enchanted_grove: { name: "Enchanted Grove", shopIcon: shopEnchantedGrove, bg: bgMagicalForest, accent: "#7fffd4", bgGradient: "linear-gradient(180deg, rgba(5,30,20,0.7) 0%, rgba(10,60,40,0.3) 50%, rgba(5,15,10,0.7) 100%)" },
  haunted_woods: { name: "Haunted Woods", shopIcon: shopHauntedWoods, bg: bgHauntedWoods, accent: "#8b008b", bgGradient: "linear-gradient(180deg, rgba(30,5,30,0.7) 0%, rgba(60,10,60,0.3) 50%, rgba(15,3,15,0.7) 100%)" },
  swamp: { name: "The Swamp", shopIcon: shopSwamp, bg: bgSwamp, accent: "#9370db", bgGradient: "linear-gradient(180deg, rgba(20,15,35,0.7) 0%, rgba(40,30,70,0.3) 50%, rgba(10,8,18,0.7) 100%)" },
};

const LOCATION_ICONS: Record<string, typeof Store> = {
  shop: Store,
  arena: Swords,
  tavern: Beer,
  sanctuary: Landmark,
  mine: Pickaxe,
  garden: Sprout,
};

const DEFAULT_LOCATIONS = [
  { id: "default-shop", name: "Shop", type: "shop", description: null },
  { id: "default-arena", name: "Arena", type: "arena", description: null },
  { id: "default-tavern", name: "Tavern", type: "tavern", description: null },
  { id: "default-sanctuary", name: "Sanctuary", type: "sanctuary", description: null },
  { id: "default-mine", name: "Mine", type: "mine", description: null },
  { id: "default-garden", name: "Garden", type: "garden", description: null },
];

interface ShopItem {
  id: string;
  name: string;
  price: number;
  type: string;
  worldId: string;
  imageUrl: string | null;
  rarity: number | null;
  hatchTime: number | null;
  eggImageUrl: string | null;
  hatchedImageUrl: string | null;
  statBoostType: string | null;
  statBoostAmount: number | null;
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

interface WorldLocationData {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
  description: string | null;
  sortOrder: number;
}

interface WorldApiData {
  id: string;
  name: string;
  iconUrl: string | null;
  bgUrl: string | null;
  glowColor: string;
  isDefault: boolean;
}

export default function WorldPage({ user }: WorldPageProps) {
  const params = useParams<{ worldId: string }>();
  const worldId = params.worldId || "";
  const staticWorld = WORLD_CONFIG[worldId];

  const { data: worldApiData } = useQuery<WorldApiData>({
    queryKey: ["/api/worlds", worldId],
    queryFn: async () => {
      const res = await fetch(`/api/worlds/${worldId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !staticWorld,
  });

  const world = staticWorld || (worldApiData ? {
    name: worldApiData.name,
    shopIcon: worldApiData.iconUrl || "",
    bg: worldApiData.bgUrl || "",
    accent: worldApiData.glowColor || "#ffd700",
    bgGradient: "linear-gradient(180deg, rgba(20,15,10,0.7) 0%, rgba(40,30,15,0.3) 50%, rgba(10,8,5,0.7) 100%)",
  } : null);

  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showShop, setShowShop] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocType, setNewLocType] = useState("shop");
  const [newLocDesc, setNewLocDesc] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading: locationsLoading } = useQuery<WorldLocationData[]>({
    queryKey: ["/api/world", worldId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
  });

  const displayLocations = locations.length > 0 ? locations : DEFAULT_LOCATIONS;

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
    staleTime: 0,
  });

  const ownedItemIds = new Set(inventory.map((inv) => inv.shopItemId));

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
      setShopError(msg);
    },
  });

  const addLocationMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; description?: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/location`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      setShowAddLocation(false);
      setNewLocName("");
      setNewLocType("shop");
      setNewLocDesc("");
      toast({ title: "Location Added", description: "New location created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add location" });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await apiRequest("DELETE", `/api/admin/world/location/${locationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      toast({ title: "Deleted", description: "Location removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete location" });
    },
  });

  const handleLocationClick = (loc: { id: string; name: string; type: string }) => {
    if (loc.type === "shop") {
      setShowShop(true);
    } else {
      toast({ title: loc.name, description: "Coming Soon" });
    }
  };

  if (!world) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black" style={{ maxWidth: "768px", margin: "0 auto" }}>
        <p className="font-fantasy text-[#f0c040] animate-pulse">Loading realm...</p>
      </div>
    );
  }

  const accent = world.accent;

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
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex flex-col items-center px-6 pt-4 pb-2">
          <h2
            className="font-fantasy text-3xl font-bold tracking-widest text-center mb-1"
            style={{
              color: accent,
              textShadow: `0 0 25px ${accent}80, 0 0 50px ${accent}40, 0 2px 8px rgba(0,0,0,0.9)`,
            }}
            data-testid={`text-world-name-${worldId}`}
          >
            {world.name}
          </h2>
          <p className="font-fantasy text-[#a89878] text-xs tracking-wider text-center mb-4"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            Explore the realm...
          </p>
        </div>

        <div className="flex-1 px-6 pb-4 overflow-y-auto">
          {locationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="font-fantasy text-sm animate-pulse" style={{ color: accent }}>Loading locations...</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {displayLocations.map((loc) => {
                const IconComponent = LOCATION_ICONS[loc.type] || Store;
                const isDefault = loc.id.startsWith("default-");
                return (
                  <div key={loc.id} className="flex flex-col items-center gap-1.5 relative" data-testid={`location-${loc.id}`}>
                    {currentUser.isAdmin && !isDefault && (
                      <button
                        data-testid={`button-delete-location-${loc.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${loc.name}"?`)) {
                            deleteLocationMutation.mutate(loc.id);
                          }
                        }}
                        className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{
                          background: "rgba(220,38,38,0.8)",
                          border: "1px solid rgba(220,38,38,0.6)",
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    )}
                    <button
                      data-testid={`button-location-${loc.type}-${loc.id}`}
                      onClick={() => handleLocationClick(loc)}
                      className="w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{
                        background: `radial-gradient(ellipse at center, ${accent}20 0%, ${accent}08 60%, transparent 100%)`,
                        border: `2px solid ${accent}80`,
                        boxShadow: `0 0 15px ${accent}30, 0 0 30px ${accent}15, inset 0 0 10px ${accent}10`,
                        cursor: "pointer",
                        animation: "locationPulse 3s ease-in-out infinite",
                      }}
                    >
                      <IconComponent className="w-7 h-7" style={{ color: accent, filter: `drop-shadow(0 0 6px ${accent}60)` }} />
                    </button>
                    <span
                      className="font-fantasy text-[11px] tracking-wider text-center"
                      style={{
                        color: accent,
                        textShadow: `0 0 8px ${accent}40, 0 1px 4px rgba(0,0,0,0.9)`,
                      }}
                    >
                      {loc.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 pb-6">
          <button
            data-testid="button-back-to-map"
            onClick={() => navigate("/map")}
            className="w-full py-2.5 rounded-lg font-fantasy text-sm tracking-wider transition-transform active:scale-98"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.85) 0%, rgba(60,35,10,0.85) 100%)",
              border: `1px solid ${accent}60`,
              color: accent,
              cursor: "pointer",
              boxShadow: `0 4px 15px rgba(0,0,0,0.5), 0 0 10px ${accent}15`,
              textShadow: `0 0 8px ${accent}40`,
            }}
          >
            Back to Map
          </button>
        </div>

        {currentUser.isAdmin && (
          <button
            data-testid="button-add-location"
            onClick={() => setShowAddLocation(true)}
            className="fixed z-30 w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{
              bottom: "80px",
              right: "max(16px, calc((100vw - 768px) / 2 + 16px))",
              background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}88 100%)`,
              border: `2px solid ${accent}`,
              boxShadow: `0 4px 20px ${accent}50, 0 0 30px ${accent}30`,
              cursor: "pointer",
            }}
          >
            <Plus className="w-7 h-7 text-black" />
          </button>
        )}
      </div>

      {showAddLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="overlay-add-location-backdrop" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddLocation(false)} />
          <div
            data-testid="modal-add-location"
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5"
            style={{
              background: "linear-gradient(135deg, rgba(20,10,5,0.98) 0%, rgba(40,25,10,0.98) 100%)",
              border: `1px solid ${accent}50`,
              boxShadow: `0 0 30px ${accent}20`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-base tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
                Add Location
              </h3>
              <button
                data-testid="button-close-add-location"
                onClick={() => setShowAddLocation(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}99` }}>Name</label>
                <input
                  data-testid="input-location-name"
                  type="text"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Location name..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: `1px solid ${accent}30`,
                    color: "#e0d0c0",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}99` }}>Type</label>
                <select
                  data-testid="select-location-type"
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: `1px solid ${accent}30`,
                    color: "#e0d0c0",
                    outline: "none",
                  }}
                >
                  <option value="shop">Shop</option>
                  <option value="arena">Arena</option>
                  <option value="tavern">Tavern</option>
                  <option value="sanctuary">Sanctuary</option>
                  <option value="mine">Mine</option>
                  <option value="garden">Garden</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}99` }}>Description (optional)</label>
                <input
                  data-testid="input-location-description"
                  type="text"
                  value={newLocDesc}
                  onChange={(e) => setNewLocDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: `1px solid ${accent}30`,
                    color: "#e0d0c0",
                    outline: "none",
                  }}
                />
              </div>

              <button
                data-testid="button-submit-add-location"
                onClick={() => {
                  if (!newLocName.trim()) return;
                  addLocationMutation.mutate({
                    name: newLocName.trim(),
                    type: newLocType,
                    description: newLocDesc.trim() || undefined,
                  });
                }}
                disabled={addLocationMutation.isPending || !newLocName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: `linear-gradient(135deg, ${accent}40 0%, ${accent}20 100%)`,
                  border: `1px solid ${accent}60`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {addLocationMutation.isPending ? "Adding..." : "Add Location"}
              </button>
            </div>
          </div>
        </div>
      )}

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

            {shopError && (
              <div
                className="mx-4 mb-2 flex items-center justify-between px-3 py-2 rounded-lg font-fantasy text-xs tracking-wider"
                style={{
                  background: "rgba(220,38,38,0.15)",
                  border: "1px solid rgba(220,38,38,0.4)",
                  color: "#fca5a5",
                }}
                data-testid="shop-error-message"
              >
                <span>{shopError}</span>
                <button
                  onClick={() => setShopError(null)}
                  className="ml-3 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: "rgba(220,38,38,0.3)",
                    color: "#fca5a5",
                    cursor: "pointer",
                    border: "none",
                  }}
                  data-testid="button-close-shop-error"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              

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
                          {item.type === "pet" && item.eggImageUrl ? (
                            <img src={item.eggImageUrl} alt={item.name} className="w-full h-full object-contain rounded-md" />
                          ) : item.imageUrl ? (
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
                        {item.type === "pet" && item.rarity && (
                          <div className="flex items-center gap-0.5" data-testid={`stars-${item.id}`}>
                            {Array.from({ length: item.rarity }).map((_, i) => (
                              <span key={i} className="text-[10px]" style={{ color: "#f0c040", textShadow: "0 0 4px rgba(240,192,64,0.6)" }}>&#9733;</span>
                            ))}
                          </div>
                        )}
                        {item.type === "pet" && item.hatchTime && (
                          <span
                            className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(240,192,64,0.1)", color: "#d4a017", border: "1px solid rgba(212,160,23,0.2)" }}
                          >
                            Hatch: {item.hatchTime}h
                          </span>
                        )}
                        <span
                          className="font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded-full capitalize"
                          style={{ background: "rgba(127,255,212,0.15)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}
                        >
                          {item.type}{item.type === "item" && item.statBoostType ? ` (+${item.statBoostAmount || "?"}${item.statBoostType === "health" ? " HP" : item.statBoostType === "atk" ? " ATK" : item.statBoostType === "def" ? " DEF" : " LVL"})` : ""}
                        </span>
                        {item.type === "pet" && ownedItemIds.has(item.id) ? (
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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

      <style>{`
        @keyframes locationPulse {
          0%, 100% { box-shadow: 0 0 15px ${accent}30, 0 0 30px ${accent}15, inset 0 0 10px ${accent}10; }
          50% { box-shadow: 0 0 25px ${accent}50, 0 0 45px ${accent}25, inset 0 0 15px ${accent}20; }
        }
      `}</style>
    </div>
  );
}
