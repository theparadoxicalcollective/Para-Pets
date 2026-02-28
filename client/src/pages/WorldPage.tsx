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

const WORLD_CONFIG: Record<string, { name: string; shopIcon: string; bg: string }> = {
  snowy_mountain: { name: "Frostpeak", shopIcon: shopFrostpeak, bg: bgSnowyMountain },
  sky_realm: { name: "Sky Realm", shopIcon: shopSkyRealm, bg: bgSkyRealm },
  volcanic: { name: "Volcanic Isle", shopIcon: shopVolcanic, bg: bgVolcanic },
  island: { name: "The Lost Island", shopIcon: shopIsland, bg: bgIsland },
  desert: { name: "Scorched Desert", shopIcon: shopDesert, bg: bgDesert },
  enchanted_grove: { name: "Enchanted Grove", shopIcon: shopEnchantedGrove, bg: bgMagicalForest },
  haunted_woods: { name: "Haunted Woods", shopIcon: shopHauntedWoods, bg: bgHauntedWoods },
  swamp: { name: "The Swamp", shopIcon: shopSwamp, bg: bgSwamp },
};

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

export default function WorldPage({ user }: WorldPageProps) {
  const params = useParams<{ worldId: string }>();
  const worldId = params.worldId || "";
  const world = WORLD_CONFIG[worldId];
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showShop, setShowShop] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
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
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

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
    </div>
  );
}

