import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import { Plus, Trash2, X, MapPin, Package, Pencil, Settings, Swords, ChevronUp, ChevronDown, ImageIcon } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import ExploreAdminPanel from "@/components/ExploreAdminPanel";
import BattleArena from "@/components/BattleArena";
import PetAnimator from "@/components/PetAnimator";

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
import bgSwamp from "@assets/bg_swamp_v2.png";

const WORLD_CONFIG: Record<string, { name: string; shopIcon: string; bg: string; accent: string }> = {
  snowy_mountain: { name: "Frostpeak", shopIcon: shopFrostpeak, bg: bgSnowyMountain, accent: "#88ccff" },
  sky_realm: { name: "Sky Realm", shopIcon: shopSkyRealm, bg: bgSkyRealm, accent: "#ffd700" },
  volcanic: { name: "Volcanic Isle", shopIcon: shopVolcanic, bg: bgVolcanic, accent: "#ff4500" },
  island: { name: "The Lost Island", shopIcon: shopIsland, bg: bgIsland, accent: "#20b2aa" },
  desert: { name: "Scorched Desert", shopIcon: shopDesert, bg: bgDesert, accent: "#daa520" },
  enchanted_grove: { name: "Enchanted Grove", shopIcon: shopEnchantedGrove, bg: bgMagicalForest, accent: "#7fffd4" },
  haunted_woods: { name: "Haunted Woods", shopIcon: shopHauntedWoods, bg: bgHauntedWoods, accent: "#8b008b" },
  swamp: { name: "The Swamp", shopIcon: shopSwamp, bg: bgSwamp, accent: "#9370db" },
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
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  isHatched?: boolean;
  hatchedImageUrl?: string | null;
  imageUrl?: string | null;
  petTemplateId?: string | null;
}

interface WorldLocationData {
  id: string;
  worldId: string;
  name: string;
  type: string;
  iconUrl: string | null;
  bgUrl: string | null;
  description: string | null;
  posX: number;
  posY: number;
  sortOrder: number;
  ownerImageUrl: string | null;
  isShop: boolean;
}

interface LocationObjectData {
  id: string;
  locationId: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
}

interface WorldApiData {
  id: string;
  name: string;
  iconUrl: string | null;
  bgUrl: string | null;
  skyImageUrl: string | null;
  groundImageUrl: string | null;
  glowColor: string;
  isDefault: boolean;
}

interface WorldBuildingData {
  id: string;
  worldId: string;
  name: string;
  imageUrl: string | null;
  side: string;
  posY: number;
  destinationPage: string | null;
  destinationLocationId: string | null;
  sortOrder: number;
}

const WORLD_HEIGHT = 3000;

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
  });

  const world = staticWorld ? {
    ...staticWorld,
    skyImageUrl: worldApiData?.skyImageUrl || null,
    groundImageUrl: worldApiData?.groundImageUrl || null,
  } : (worldApiData ? {
    name: worldApiData.name,
    shopIcon: worldApiData.iconUrl || "",
    bg: worldApiData.bgUrl || "",
    accent: worldApiData.glowColor || "#ffd700",
    skyImageUrl: worldApiData.skyImageUrl || null,
    groundImageUrl: worldApiData.groundImageUrl || null,
  } : null);

  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showShop, setShowShop] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [showLocationView, setShowLocationView] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showAddObject, setShowAddObject] = useState(false);
  const [newObjectImage, setNewObjectImage] = useState<string | null>(null);
  const [showExploreAdmin, setShowExploreAdmin] = useState(false);
  const [showNoPetMessage, setShowNoPetMessage] = useState(false);
  const [showDangerWarning, setShowDangerWarning] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [battleLocationId, setBattleLocationId] = useState<string | null>(null);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState<WorldBuildingData | null>(null);
  const [showWorldSettings, setShowWorldSettings] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocType, setNewLocType] = useState("explore");
  const [newLocDesc, setNewLocDesc] = useState("");
  const [newLocIcon, setNewLocIcon] = useState<string | null>(null);
  const [newLocBg, setNewLocBg] = useState<string | null>(null);
  const [newLocOwner, setNewLocOwner] = useState<string | null>(null);
  const [showManageLocations, setShowManageLocations] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [highlightedBuilding, setHighlightedBuilding] = useState<string | null>(null);
  const [settingsSkyImg, setSettingsSkyImg] = useState<string | null>(null);
  const [settingsGroundImg, setSettingsGroundImg] = useState<string | null>(null);
  const [settingsWorldName, setSettingsWorldName] = useState("");

  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingSide, setNewBuildingSide] = useState("left");
  const [newBuildingPosY, setNewBuildingPosY] = useState(50);
  const [newBuildingImage, setNewBuildingImage] = useState<string | null>(null);
  const [newBuildingDest, setNewBuildingDest] = useState("");
  const [newBuildingLocId, setNewBuildingLocId] = useState("");

  const [editBuildingName, setEditBuildingName] = useState("");
  const [editBuildingSide, setEditBuildingSide] = useState("left");
  const [editBuildingPosY, setEditBuildingPosY] = useState(50);
  const [editBuildingImage, setEditBuildingImage] = useState<string | null>(null);
  const [editBuildingDest, setEditBuildingDest] = useState("");
  const [editBuildingLocId, setEditBuildingLocId] = useState("");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations = [] } = useQuery<WorldLocationData[]>({
    queryKey: ["/api/world", worldId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
  });

  const { data: buildings = [] } = useQuery<WorldBuildingData[]>({
    queryKey: ["/api/world", worldId, "buildings"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/buildings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch buildings");
      return res.json();
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<ShopItem[]>({
    queryKey: ["/api/location", activeLocationId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeLocationId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: showShop && !!activeLocationId,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });

  const { data: allShopItems = [] } = useQuery<ShopItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
    enabled: showItemPicker && currentUser.isAdmin,
  });

  const { data: locationObjects = [] } = useQuery<LocationObjectData[]>({
    queryKey: ["/api/location", activeLocationId, "objects"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeLocationId}/objects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: (showLocationView || showShop) && !!activeLocationId,
  });

  const ownedItemIds = new Set(inventory.map((inv) => inv.shopItemId));

  const activePet = currentUser.activePetId
    ? inventory.find((item) => item.shopItemId === currentUser.activePetId && item.type === "pet")
    : null;
  const hasHatchedActivePet = activePet && activePet.isHatched;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const maxScroll = WORLD_HEIGHT - container.clientHeight;
    container.scrollTop = maxScroll;
    setScrollY(maxScroll);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setScrollY(container.scrollTop);
      const containerHeight = container.clientHeight;
      const centerY = container.scrollTop + containerHeight * 0.5;
      const centerPercent = (centerY / WORLD_HEIGHT) * 100;
      let closest: string | null = null;
      let closestDist = Infinity;
      buildings.forEach((b) => {
        const dist = Math.abs(b.posY - centerPercent);
        if (dist < closestDist && dist < 15) {
          closestDist = dist;
          closest = b.id;
        }
      });
      setHighlightedBuilding(closest);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [buildings]);

  const startMoving = useCallback((direction: "up" | "down") => {
    setIsMoving(true);
    const container = scrollContainerRef.current;
    if (!container) return;
    const speed = direction === "up" ? -4 : 4;
    moveIntervalRef.current = setInterval(() => {
      container.scrollTop += speed;
    }, 16);
  }, []);

  const stopMoving = useCallback(() => {
    setIsMoving(false);
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = null;
      }
    };
  }, []);

  const handleBuildingClick = useCallback((building: WorldBuildingData) => {
    if (building.destinationLocationId) {
      const loc = locations.find(l => l.id === building.destinationLocationId);
      if (loc) {
        setActiveLocationId(loc.id);
        if (loc.isShop) {
          setShowLocationView(false);
          setShowShop(true);
        } else if (loc.type === "explore" && !currentUser.isAdmin) {
          if (!currentUser.activePetId || !hasHatchedActivePet) {
            setShowNoPetMessage(true);
          } else {
            setShowDangerWarning(true);
          }
        } else {
          setShowShop(false);
          setShowLocationView(true);
        }
        return;
      }
    }
    if (building.destinationPage) {
      navigate(building.destinationPage);
    }
  }, [locations, currentUser, hasHatchedActivePet, navigate]);

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

  const assignItemMutation = useMutation({
    mutationFn: async ({ locationId, itemId }: { locationId: string; itemId: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/assign-item/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeLocationId, "items"] });
      toast({ title: "Assigned", description: "Item added to shop" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign item", variant: "destructive" });
    },
  });

  const unassignItemMutation = useMutation({
    mutationFn: async ({ locationId, itemId }: { locationId: string; itemId: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/location/${locationId}/unassign-item/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeLocationId, "items"] });
      toast({ title: "Removed", description: "Item removed from shop" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove item", variant: "destructive" });
    },
  });

  const addLocationMutation = useMutation({
    mutationFn: async (data: { name: string; isShop: boolean; type?: string; description?: string; iconData?: string | null; bgData?: string | null; ownerImageData?: string | null }) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/location`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      setShowAddLocation(false);
      setNewLocName("");
      setNewLocType("explore");
      setNewLocDesc("");
      setNewLocIcon(null);
      setNewLocBg(null);
      setNewLocOwner(null);
      toast({ title: "Location Added", description: "New location created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add location", variant: "destructive" });
    },
  });

  const addBuildingMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/building`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "buildings"] });
      setShowAddBuilding(false);
      setNewBuildingName("");
      setNewBuildingSide("left");
      setNewBuildingPosY(50);
      setNewBuildingImage(null);
      setNewBuildingDest("");
      setNewBuildingLocId("");
      toast({ title: "Building Added", description: "New building created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add building", variant: "destructive" });
    },
  });

  const editBuildingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/building/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "buildings"] });
      setShowEditBuilding(null);
      toast({ title: "Updated", description: "Building updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update building", variant: "destructive" });
    },
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/world/building/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "buildings"] });
      toast({ title: "Deleted", description: "Building removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete building", variant: "destructive" });
    },
  });

  const updateWorldMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/admin/worlds/${worldId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds", worldId] });
      setShowWorldSettings(false);
      toast({ title: "Updated", description: "World settings saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update world", variant: "destructive" });
    },
  });

  const addObjectMutation = useMutation({
    mutationFn: async (data: { locationId: string; imageData: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${data.locationId}/object`, { imageData: data.imageData });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeLocationId, "objects"] });
      setShowAddObject(false);
      setNewObjectImage(null);
      toast({ title: "Added", description: "Object added to location" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add object", variant: "destructive" });
    },
  });

  const deleteObjectMutation = useMutation({
    mutationFn: async (objectId: string) => {
      await apiRequest("DELETE", `/api/admin/location/object/${objectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeLocationId, "objects"] });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      await apiRequest("DELETE", `/api/admin/world/location/${locationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      toast({ title: "Deleted", description: "Place removed" });
    },
  });

  if (!world) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-black" style={{ maxWidth: "768px", margin: "0 auto" }}>
        <p className="font-fantasy text-[#f0c040] animate-pulse" style={{ textShadow: "0 0 20px rgba(240,192,64,0.5)" }}>Loading realm...</p>
      </div>
    );
  }

  const accent = world.accent;
  const skyImage = world.skyImageUrl || world.bg;
  const groundImage = world.groundImageUrl;

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto", background: "#0a0a0a" }}
    >
      <style>{`
        @keyframes petBounce {
          0%, 100% { transform: translateY(0px) scaleY(1); }
          30% { transform: translateY(-8px) scaleY(1.02); }
          50% { transform: translateY(-12px) scaleY(1.04); }
          70% { transform: translateY(-6px) scaleY(1.01); }
        }
        @keyframes petIdle {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-3px) scale(1.01); }
        }
        @keyframes buildingGlow {
          0%, 100% { filter: drop-shadow(0 0 8px ${accent}60) brightness(1.1); }
          50% { filter: drop-shadow(0 0 16px ${accent}90) brightness(1.25); }
        }
        @keyframes buildingPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .world-path {
          background: linear-gradient(
            to right,
            transparent 0%,
            transparent 20%,
            rgba(139,119,86,0.15) 25%,
            rgba(139,119,86,0.3) 35%,
            rgba(160,140,100,0.4) 45%,
            rgba(160,140,100,0.4) 55%,
            rgba(139,119,86,0.3) 65%,
            rgba(139,119,86,0.15) 75%,
            transparent 80%,
            transparent 100%
          );
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="relative z-30">
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto scrollbar-hide"
          style={{ scrollBehavior: "auto" }}
        >
          <div className="relative" style={{ height: `${WORLD_HEIGHT}px`, width: "100%" }}>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${skyImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
                backgroundRepeat: "no-repeat",
              }}
            />

            <div className="absolute inset-0" style={{
              background: `linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.8) 100%)`,
            }} />

            {groundImage ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${groundImage})`,
                  backgroundRepeat: "repeat-y",
                  backgroundSize: "40% auto",
                  backgroundPosition: "center",
                  opacity: 0.8,
                }}
              />
            ) : (
              <div className="absolute inset-0 world-path" />
            )}

            <div className="absolute left-0 top-0 bottom-0" style={{
              width: "25%",
              background: "linear-gradient(to right, rgba(0,0,0,0.4) 0%, transparent 100%)",
            }} />
            <div className="absolute right-0 top-0 bottom-0" style={{
              width: "25%",
              background: "linear-gradient(to left, rgba(0,0,0,0.4) 0%, transparent 100%)",
            }} />

            {buildings.map((building) => {
              const isHighlighted = highlightedBuilding === building.id;
              const isLeft = building.side === "left";
              const topPx = (building.posY / 100) * WORLD_HEIGHT;

              return (
                <div
                  key={building.id}
                  data-testid={`building-${building.id}`}
                  className="absolute cursor-pointer"
                  style={{
                    top: `${topPx}px`,
                    [isLeft ? "left" : "right"]: "2%",
                    width: "35%",
                    transform: "translateY(-50%)",
                    zIndex: isHighlighted ? 20 : 10,
                    animation: isHighlighted ? "buildingPulse 1.5s ease-in-out infinite" : "none",
                  }}
                  onClick={() => handleBuildingClick(building)}
                >
                  <div className="relative">
                    {building.imageUrl ? (
                      <img
                        src={building.imageUrl}
                        alt={building.name}
                        className="w-full h-auto object-contain"
                        style={{
                          animation: isHighlighted ? "buildingGlow 2s ease-in-out infinite" : "none",
                          filter: isHighlighted ? `drop-shadow(0 0 12px ${accent}80)` : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                          transition: "filter 0.3s ease",
                        }}
                      />
                    ) : (
                      <div
                        className="w-full aspect-square rounded-lg flex items-center justify-center"
                        style={{
                          background: isHighlighted
                            ? `linear-gradient(135deg, ${accent}40, ${accent}20)`
                            : "linear-gradient(135deg, rgba(60,40,20,0.8), rgba(40,25,10,0.8))",
                          border: `2px solid ${isHighlighted ? accent : accent + "40"}`,
                          boxShadow: isHighlighted ? `0 0 20px ${accent}50` : "0 4px 12px rgba(0,0,0,0.4)",
                          transition: "all 0.3s ease",
                        }}
                      >
                        <MapPin className="w-8 h-8" style={{ color: accent }} />
                      </div>
                    )}

                    <div
                      className="text-center mt-1 px-1"
                      style={{
                        opacity: isHighlighted ? 1 : 0.7,
                        transition: "opacity 0.3s ease",
                      }}
                    >
                      <p
                        className="font-fantasy text-xs tracking-wider font-semibold truncate"
                        style={{
                          color: isHighlighted ? accent : "#e8ddd0",
                          textShadow: isHighlighted
                            ? `0 0 10px ${accent}80, 0 1px 3px rgba(0,0,0,0.8)`
                            : "0 1px 3px rgba(0,0,0,0.8)",
                        }}
                        data-testid={`text-building-name-${building.id}`}
                      >
                        {building.name}
                      </p>
                      {isHighlighted && (
                        <p
                          className="font-fantasy text-[9px] tracking-widest mt-0.5 animate-pulse"
                          style={{ color: `${accent}cc` }}
                        >
                          TAP TO ENTER
                        </p>
                      )}
                    </div>

                    {currentUser.isAdmin && (
                      <div className="absolute top-0 right-0 flex gap-1">
                        <button
                          data-testid={`button-edit-building-${building.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEditBuilding(building);
                            setEditBuildingName(building.name);
                            setEditBuildingSide(building.side);
                            setEditBuildingPosY(building.posY);
                            setEditBuildingDest(building.destinationPage || "");
                            setEditBuildingLocId(building.destinationLocationId || "");
                            setEditBuildingImage(null);
                          }}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: `${accent}60`, border: `1px solid ${accent}`, cursor: "pointer" }}
                        >
                          <Pencil className="w-3 h-3 text-white" />
                        </button>
                        <button
                          data-testid={`button-delete-building-${building.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBuildingMutation.mutate(building.id);
                          }}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(220,38,38,0.8)", border: "1px solid rgba(255,100,100,0.5)", cursor: "pointer" }}
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pointer-events-none pb-2">
          <div
            className="w-24 h-24 sm:w-28 sm:h-28"
            style={{
              animation: isMoving ? "petBounce 0.5s ease-in-out infinite" : "petIdle 2s ease-in-out infinite",
            }}
          >
            {hasHatchedActivePet && activePet ? (
              activePet.petTemplateId ? (
                <PetAnimator
                  petTemplateId={activePet.petTemplateId}
                  mode={isMoving ? "walk" : "idle"}
                  view="back"
                  size={200}
                  className="w-full h-full"
                />
              ) : (activePet.hatchedImageUrl || activePet.imageUrl) ? (
                <img
                  src={activePet.hatchedImageUrl || activePet.imageUrl || ""}
                  alt="Pet"
                  className="w-full h-full object-contain"
                  style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${accent}30)` }}
                />
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center"
                  style={{ background: `${accent}20`, border: `2px dashed ${accent}40` }}
                >
                  <span className="font-fantasy text-sm" style={{ color: accent }}>?</span>
                </div>
              )
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)" }}
              >
                <span className="font-fantasy text-[10px] text-center px-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                  No pet
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-28 right-3 z-25 flex flex-col gap-2 pointer-events-auto">
          <button
            data-testid="button-move-forward"
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
              border: `2px solid ${accent}60`,
              cursor: "pointer",
              boxShadow: `0 0 15px ${accent}20`,
            }}
            onPointerDown={() => startMoving("up")}
            onPointerUp={stopMoving}
            onPointerLeave={stopMoving}
            onPointerCancel={stopMoving}
          >
            <ChevronUp className="w-6 h-6" style={{ color: accent }} />
          </button>
          <button
            data-testid="button-move-backward"
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
              border: `2px solid ${accent}60`,
              cursor: "pointer",
              boxShadow: `0 0 15px ${accent}20`,
            }}
            onPointerDown={() => startMoving("down")}
            onPointerUp={stopMoving}
            onPointerLeave={stopMoving}
            onPointerCancel={stopMoving}
          >
            <ChevronDown className="w-6 h-6" style={{ color: accent }} />
          </button>
        </div>

        {currentUser.isAdmin && (
          <div className="absolute bottom-28 left-3 z-25 flex flex-col gap-2 pointer-events-auto">
            <button
              data-testid="button-add-building"
              onClick={() => setShowAddBuilding(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
                border: `2px solid ${accent}60`,
                cursor: "pointer",
              }}
            >
              <Plus className="w-5 h-5" style={{ color: accent }} />
            </button>
            <button
              data-testid="button-world-settings"
              onClick={() => {
                setSettingsWorldName(world.name);
                setSettingsSkyImg(null);
                setSettingsGroundImg(null);
                setShowWorldSettings(true);
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
                border: `2px solid ${accent}60`,
                cursor: "pointer",
              }}
            >
              <Settings className="w-5 h-5" style={{ color: accent }} />
            </button>
            <button
              data-testid="button-manage-locations"
              onClick={() => setShowManageLocations(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
                border: `2px solid ${accent}60`,
                cursor: "pointer",
              }}
            >
              <MapPin className="w-5 h-5" style={{ color: accent }} />
            </button>
          </div>
        )}

        <button
          data-testid="button-back-to-map"
          onClick={() => navigate("/map")}
          className="absolute top-2 left-3 z-25 px-3 py-1.5 rounded-full font-fantasy text-xs tracking-wider pointer-events-auto"
          style={{
            background: "rgba(0,0,0,0.6)",
            border: `1px solid ${accent}50`,
            color: accent,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          ← Map
        </button>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUpdate={(u: any) => setCurrentUser(u)}
        />
      )}

      {showAddBuilding && currentUser.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddBuilding(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>Add Building</h3>
              <button
                data-testid="button-close-add-building"
                onClick={() => setShowAddBuilding(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name</label>
                <input
                  data-testid="input-building-name"
                  value={newBuildingName}
                  onChange={(e) => setNewBuildingName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  placeholder="Building name"
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Side</label>
                <select
                  data-testid="select-building-side"
                  value={newBuildingSide}
                  onChange={(e) => setNewBuildingSide(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none", cursor: "pointer" }}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Vertical Position ({newBuildingPosY}%)
                </label>
                <input
                  data-testid="input-building-posY"
                  type="range"
                  min="5"
                  max="95"
                  value={newBuildingPosY}
                  onChange={(e) => setNewBuildingPosY(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Building Image (PNG/GIF)</label>
                <input
                  data-testid="input-building-image"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewBuildingImage(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {newBuildingImage && (
                  <div className="mt-2 flex justify-center">
                    <img src={newBuildingImage} alt="Preview" className="w-20 h-20 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Destination Location (from this world)
                </label>
                <select
                  data-testid="select-building-location"
                  value={newBuildingLocId}
                  onChange={(e) => setNewBuildingLocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none", cursor: "pointer" }}
                >
                  <option value="">None</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Or Destination Page URL
                </label>
                <input
                  data-testid="input-building-dest"
                  value={newBuildingDest}
                  onChange={(e) => setNewBuildingDest(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  placeholder="e.g. /coins or /map"
                />
              </div>

              <button
                data-testid="button-submit-building"
                onClick={() => {
                  if (!newBuildingName.trim()) return;
                  addBuildingMutation.mutate({
                    name: newBuildingName.trim(),
                    side: newBuildingSide,
                    posY: newBuildingPosY,
                    imageData: newBuildingImage,
                    destinationPage: newBuildingDest || null,
                    destinationLocationId: newBuildingLocId || null,
                  });
                }}
                disabled={addBuildingMutation.isPending || !newBuildingName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50, ${accent}25)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {addBuildingMutation.isPending ? "Adding..." : "Add Building"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditBuilding && currentUser.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowEditBuilding(null)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>Edit Building</h3>
              <button
                onClick={() => setShowEditBuilding(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name</label>
                <input
                  data-testid="input-edit-building-name"
                  value={editBuildingName}
                  onChange={(e) => setEditBuildingName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Side</label>
                <select
                  data-testid="select-edit-building-side"
                  value={editBuildingSide}
                  onChange={(e) => setEditBuildingSide(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none", cursor: "pointer" }}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Vertical Position ({editBuildingPosY}%)
                </label>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={editBuildingPosY}
                  onChange={(e) => setEditBuildingPosY(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Replace Image</label>
                {showEditBuilding.imageUrl && !editBuildingImage && (
                  <div className="mb-2 flex items-center gap-2">
                    <img src={showEditBuilding.imageUrl} alt="" className="w-12 h-12 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                    <span className="font-fantasy text-[9px]" style={{ color: `${accent}66` }}>Current</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setEditBuildingImage(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Destination Location</label>
                <select
                  data-testid="select-edit-building-location"
                  value={editBuildingLocId}
                  onChange={(e) => setEditBuildingLocId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none", cursor: "pointer" }}
                >
                  <option value="">None</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Or Destination Page URL</label>
                <input
                  data-testid="input-edit-building-dest"
                  value={editBuildingDest}
                  onChange={(e) => setEditBuildingDest(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  placeholder="e.g. /coins or /map"
                />
              </div>

              <button
                data-testid="button-submit-edit-building"
                onClick={() => {
                  const data: Record<string, any> = {};
                  if (editBuildingName.trim() !== showEditBuilding!.name) data.name = editBuildingName.trim();
                  if (editBuildingSide !== showEditBuilding!.side) data.side = editBuildingSide;
                  if (editBuildingPosY !== showEditBuilding!.posY) data.posY = editBuildingPosY;
                  if (editBuildingDest !== (showEditBuilding!.destinationPage || "")) data.destinationPage = editBuildingDest || null;
                  if (editBuildingLocId !== (showEditBuilding!.destinationLocationId || "")) data.destinationLocationId = editBuildingLocId || null;
                  if (editBuildingImage) data.imageData = editBuildingImage;
                  if (Object.keys(data).length === 0) {
                    setShowEditBuilding(null);
                    return;
                  }
                  editBuildingMutation.mutate({ id: showEditBuilding!.id, data });
                }}
                disabled={editBuildingMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50, ${accent}25)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {editBuildingMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorldSettings && currentUser.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowWorldSettings(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>World Settings</h3>
              <button
                data-testid="button-close-world-settings"
                onClick={() => setShowWorldSettings(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>World Name</label>
                <input
                  data-testid="input-world-name"
                  value={settingsWorldName}
                  onChange={(e) => setSettingsWorldName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Sky Image
                </label>
                {world.skyImageUrl && (
                  <div className="mb-2">
                    <img src={world.skyImageUrl} alt="Sky" className="w-full h-16 object-cover rounded-lg" style={{ border: `1px solid ${accent}20` }} />
                    <span className="font-fantasy text-[8px]" style={{ color: `${accent}55` }}>Current sky</span>
                  </div>
                )}
                <input
                  data-testid="input-sky-image"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setSettingsSkyImg(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {settingsSkyImg && (
                  <div className="mt-2">
                    <img src={settingsSkyImg} alt="Preview" className="w-full h-16 object-cover rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Ground/Path Image
                </label>
                {world.groundImageUrl && (
                  <div className="mb-2">
                    <img src={world.groundImageUrl} alt="Ground" className="w-full h-16 object-cover rounded-lg" style={{ border: `1px solid ${accent}20` }} />
                    <span className="font-fantasy text-[8px]" style={{ color: `${accent}55` }}>Current ground</span>
                  </div>
                )}
                <input
                  data-testid="input-ground-image"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setSettingsGroundImg(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {settingsGroundImg && (
                  <div className="mt-2">
                    <img src={settingsGroundImg} alt="Preview" className="w-full h-16 object-cover rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              <button
                data-testid="button-save-world-settings"
                onClick={() => {
                  const data: Record<string, any> = {};
                  if (settingsWorldName.trim() && settingsWorldName.trim() !== world.name) data.name = settingsWorldName.trim();
                  if (settingsSkyImg) data.skyImageData = settingsSkyImg;
                  if (settingsGroundImg) data.groundImageData = settingsGroundImg;
                  if (Object.keys(data).length === 0) {
                    setShowWorldSettings(false);
                    return;
                  }
                  updateWorldMutation.mutate(data);
                }}
                disabled={updateWorldMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50, ${accent}25)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                }}
              >
                {updateWorldMutation.isPending ? "Saving..." : "Save World Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoPetMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowNoPetMessage(false)} />
          <div className="relative z-10 w-[80%] max-w-xs rounded-lg p-5 text-center" style={{
            background: "linear-gradient(135deg, rgba(15,10,25,0.98), rgba(25,15,40,0.98))",
            border: `1px solid ${accent}40`,
          }}>
            <p className="font-fantasy text-sm tracking-wider mb-3" style={{ color: accent }}>
              Keepers must have a pet to explore safely
            </p>
            <button
              data-testid="button-close-no-pet"
              onClick={() => setShowNoPetMessage(false)}
              className="px-6 py-2 rounded-md font-fantasy text-xs tracking-wider"
              style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {showDangerWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDangerWarning(false)} />
          <div className="relative z-10 w-[80%] max-w-xs rounded-lg p-5 text-center" style={{
            background: "linear-gradient(135deg, rgba(25,5,5,0.98), rgba(40,10,10,0.98))",
            border: "1px solid rgba(255,60,60,0.4)",
          }}>
            <p className="font-fantasy text-lg tracking-wider mb-1" style={{ color: "#ff4444", textShadow: "0 0 10px rgba(255,60,60,0.5)" }}>
              Danger Ahead
            </p>
            <p className="font-fantasy text-xs tracking-wider mb-4" style={{ color: "rgba(255,150,150,0.8)" }}>
              Creatures lurk in this area. Are you ready?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                data-testid="button-cancel-explore"
                onClick={() => setShowDangerWarning(false)}
                className="px-4 py-2 rounded-md font-fantasy text-xs"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#ccc", cursor: "pointer" }}
              >
                Retreat
              </button>
              <button
                data-testid="button-confirm-explore"
                onClick={() => {
                  setShowDangerWarning(false);
                  if (activeLocationId) {
                    setBattleLocationId(activeLocationId);
                    setShowBattle(true);
                  }
                }}
                className="px-4 py-2 rounded-md font-fantasy text-xs"
                style={{ background: "rgba(220,38,38,0.5)", border: "1px solid rgba(255,60,60,0.6)", color: "#ff8888", cursor: "pointer" }}
              >
                Enter
              </button>
            </div>
          </div>
        </div>
      )}

      {showShop && (() => {
        const activeLoc = locations.find(l => l.id === activeLocationId);
        const shopName = activeLoc?.name || world.name;
        return (
          <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowShop(false); setShowItemPicker(false); }} />
            <div className="relative z-10 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  {activeLoc?.iconUrl ? (
                    <img src={activeLoc.iconUrl} alt="" className="w-12 h-12 rounded-lg object-cover" style={{ border: `1px solid ${accent}40` }} />
                  ) : (
                    <img src={world.shopIcon} alt="" className="w-12 h-12 rounded-lg object-cover" style={{ border: "1px solid rgba(212,160,23,0.4)" }} />
                  )}
                  <div>
                    <h3 className="font-fantasy text-base tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 10px ${accent}30` }}>
                      {shopName} Shop
                    </h3>
                    <p className="font-fantasy text-[#a89878] text-[10px] tracking-wider">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {currentUser.isAdmin && (
                    <button
                      data-testid="button-add-shop-item"
                      onClick={() => setShowItemPicker(true)}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{
                        background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
                        border: `2px solid ${accent}60`,
                        color: accent,
                        cursor: "pointer",
                      }}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    data-testid="button-close-shop"
                    onClick={() => { setShowShop(false); setShowItemPicker(false); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                    style={{
                      background: "linear-gradient(135deg, #5c3a1e, #3a2010)",
                      border: "2px solid rgba(212,160,23,0.6)",
                      color: "#f0c040",
                      cursor: "pointer",
                    }}
                  >
                    X
                  </button>
                </div>
              </div>

              {shopError && (
                <div
                  className="mx-4 mb-2 flex items-center justify-between px-3 py-2 rounded-lg font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)", color: "#fca5a5" }}
                  data-testid="shop-error-message"
                >
                  <span>{shopError}</span>
                  <button
                    onClick={() => setShopError(null)}
                    className="ml-3 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "rgba(220,38,38,0.3)", color: "#fca5a5", cursor: "pointer", border: "none" }}
                    data-testid="button-close-shop-error"
                  >
                    ✕
                  </button>
                </div>
              )}

              {activeLoc?.ownerImageUrl && (
                <div className="absolute bottom-4 left-4 z-20 pointer-events-none" style={{ animation: "petIdle 4s ease-in-out infinite" }}>
                  <img src={activeLoc.ownerImageUrl} alt="Owner" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${accent}30)` }} />
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 pb-6">
                {itemsLoading ? (
                  <div className="text-center py-8">
                    <p className="font-fantasy text-sm animate-pulse" style={{ color: `${accent}cc` }}>Loading wares...</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="font-fantasy text-[#a89878] text-sm tracking-wider">No items in this shop yet.</p>
                    {currentUser.isAdmin && (
                      <p className="font-fantasy text-[10px] tracking-wider mt-2" style={{ color: `${accent}60` }}>Tap + to assign items from the Item DB</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        data-testid={`card-shop-item-${item.id}`}
                        className="rounded-lg overflow-hidden relative"
                        style={{
                          background: "linear-gradient(135deg, rgba(30,15,5,0.95), rgba(50,30,10,0.95))",
                          border: `1px solid ${accent}30`,
                        }}
                      >
                        {currentUser.isAdmin && (
                          <button
                            data-testid={`button-unassign-item-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeLocationId) unassignItemMutation.mutate({ locationId: activeLocationId, itemId: item.id });
                            }}
                            className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: "rgba(220,38,38,0.9)", border: "1px solid rgba(255,100,100,0.5)", cursor: "pointer" }}
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        )}
                        <div className="p-3 flex flex-col items-center gap-2">
                          <div
                            className="w-full aspect-square rounded-md flex items-center justify-center"
                            style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${accent}15` }}
                          >
                            {item.type === "pet" && item.eggImageUrl ? (
                              <img src={item.eggImageUrl} alt={item.name} className="w-full h-full object-contain rounded-md" />
                            ) : item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain rounded-md" />
                            ) : (
                              <span className="font-fantasy text-2xl" style={{ color: `${accent}30` }}>?</span>
                            )}
                          </div>
                          <p className="font-fantasy text-xs font-semibold text-center truncate w-full" style={{ color: accent }} data-testid={`text-item-name-${item.id}`}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-1">
                            <img src={coinIconImg} alt="" className="w-3.5 h-3.5 object-contain" />
                            <span className="font-fantasy text-xs" style={{ color: accent }}>{item.price}</span>
                          </div>
                          {item.type === "pet" && item.rarity && (
                            <div className="flex items-center gap-0.5" data-testid={`stars-${item.id}`}>
                              {Array.from({ length: item.rarity }).map((_, i) => (
                                <span key={i} className="text-[10px]" style={{ color: accent, textShadow: `0 0 4px ${accent}60` }}>&#9733;</span>
                              ))}
                            </div>
                          )}
                          {item.type === "pet" && item.hatchTime && (
                            <span
                              className="font-fantasy text-[8px] tracking-wider px-2 py-0.5 rounded-full"
                              style={{ background: `${accent}10`, color: `${accent}cc`, border: `1px solid ${accent}20` }}
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
                                background: "linear-gradient(135deg, #2d6a4f, #1a4a2e)",
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
        );
      })()}

      {showItemPicker && currentUser.isAdmin && activeLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowItemPicker(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[80vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>Assign Items</h3>
              <button
                data-testid="button-close-item-picker"
                onClick={() => setShowItemPicker(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {allShopItems.length === 0 ? (
              <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No items in the database yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allShopItems.map((si) => {
                  const alreadyAssigned = items.some(it => it.id === si.id);
                  return (
                    <div
                      key={si.id}
                      data-testid={`picker-item-${si.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg"
                      style={{
                        background: alreadyAssigned ? `${accent}15` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${alreadyAssigned ? accent + "40" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.3)" }}>
                        {si.imageUrl ? (
                          <img src={si.imageUrl} alt="" className="w-full h-full object-contain rounded-md" />
                        ) : si.eggImageUrl ? (
                          <img src={si.eggImageUrl} alt="" className="w-full h-full object-contain rounded-md" />
                        ) : (
                          <Package className="w-5 h-5" style={{ color: `${accent}40` }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{si.name}</p>
                        <p className="font-fantasy text-[9px]" style={{ color: `${accent}70` }}>{si.price} coins - {si.type}</p>
                      </div>
                      {alreadyAssigned ? (
                        <span className="font-fantasy text-[9px] px-2 py-1 rounded-full" style={{ background: `${accent}20`, color: accent }}>Added</span>
                      ) : (
                        <button
                          data-testid={`button-assign-${si.id}`}
                          onClick={() => assignItemMutation.mutate({ locationId: activeLocationId, itemId: si.id })}
                          disabled={assignItemMutation.isPending}
                          className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                          style={{
                            background: `${accent}30`,
                            border: `1px solid ${accent}50`,
                            color: accent,
                            cursor: "pointer",
                          }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showLocationView && (() => {
        const activeLoc = locations.find(l => l.id === activeLocationId);
        if (!activeLoc) return null;
        return (
          <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0">
              {activeLoc.bgUrl ? (
                <img src={activeLoc.bgUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: "linear-gradient(180deg, rgba(5,3,15,1), rgba(15,10,30,1), rgba(5,3,15,1))" }} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.7))" }} />
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between px-4 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  {activeLoc.iconUrl && (
                    <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-lg object-contain" style={{ border: `1px solid ${accent}40` }} />
                  )}
                  <div>
                    <h3 className="font-fantasy text-lg tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 15px ${accent}50` }}>
                      {activeLoc.name}
                    </h3>
                    {activeLoc.description && (
                      <p className="font-fantasy text-[10px] tracking-wider" style={{ color: `${accent}88` }}>{activeLoc.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {currentUser.isAdmin && activeLoc.type === "explore" && (
                    <button
                      data-testid="button-explore-settings"
                      onClick={() => setShowExploreAdmin(true)}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {currentUser.isAdmin && activeLoc.type === "explore" && (
                    <button
                      data-testid="button-admin-battle"
                      onClick={() => {
                        setBattleLocationId(activeLoc.id);
                        setShowBattle(true);
                        setShowLocationView(false);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(220,38,38,0.4)", border: "1px solid rgba(255,60,60,0.5)", color: "#ff8888", cursor: "pointer" }}
                    >
                      <Swords className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    data-testid="button-close-location"
                    onClick={() => setShowLocationView(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}40`, color: accent, cursor: "pointer" }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 relative overflow-y-auto">
                {locationObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className="absolute"
                    style={{
                      left: `${obj.posX}%`,
                      top: `${obj.posY}%`,
                      width: `${obj.width}px`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <img src={obj.imageUrl} alt="" className="w-full h-auto object-contain" />
                    {currentUser.isAdmin && (
                      <button
                        onClick={() => deleteObjectMutation.mutate(obj.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(220,38,38,0.9)", cursor: "pointer" }}
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ))}

                {activeLoc.ownerImageUrl && (
                  <div className="absolute bottom-4 left-4 pointer-events-none" style={{ animation: "petIdle 4s ease-in-out infinite" }}>
                    <img src={activeLoc.ownerImageUrl} alt="Owner" className="w-24 h-24 object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6))` }} />
                  </div>
                )}

                {currentUser.isAdmin && !activeLoc.isShop && (
                  <button
                    data-testid="button-add-object"
                    onClick={() => setShowAddObject(true)}
                    className="absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      background: `${accent}30`,
                      border: `2px solid ${accent}60`,
                      color: accent,
                      cursor: "pointer",
                    }}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showAddObject && currentUser.isAdmin && activeLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAddObject(false)} />
          <div className="relative z-10 w-[80%] max-w-xs rounded-lg p-4" style={{
            background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
            border: `1px solid ${accent}55`,
          }}>
            <h3 className="font-fantasy text-sm tracking-widest mb-3" style={{ color: accent }}>Add Object</h3>
            <input
              type="file"
              accept="image/png,image/gif"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const dataUrl = await readFileAsDataUrl(file);
                  setNewObjectImage(dataUrl);
                }
              }}
              className="w-full text-xs font-fantasy mb-3"
              style={{ color: `${accent}cc` }}
            />
            {newObjectImage && (
              <div className="mb-3 flex justify-center">
                <img src={newObjectImage} alt="Preview" className="w-16 h-16 object-contain" />
              </div>
            )}
            <button
              onClick={() => {
                if (newObjectImage && activeLocationId) {
                  addObjectMutation.mutate({ locationId: activeLocationId, imageData: newObjectImage });
                }
              }}
              disabled={!newObjectImage || addObjectMutation.isPending}
              className="w-full py-2 rounded-md font-fantasy text-xs tracking-wider disabled:opacity-50"
              style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
            >
              {addObjectMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {showExploreAdmin && activeLocationId && (
        <ExploreAdminPanel
          locationId={activeLocationId}
          accent={accent}
          onClose={() => setShowExploreAdmin(false)}
        />
      )}

      {showBattle && battleLocationId && (
        <BattleArena
          locationId={battleLocationId}
          worldAccent={accent}
          onClose={() => {
            setShowBattle(false);
            setBattleLocationId(null);
          }}
        />
      )}

      {showManageLocations && currentUser.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowManageLocations(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>Manage Locations</h3>
              <div className="flex items-center gap-2">
                <button
                  data-testid="button-add-location"
                  onClick={() => setShowAddLocation(true)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${accent}30`, border: `1px solid ${accent}50`, cursor: "pointer", color: accent }}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  data-testid="button-close-manage-locations"
                  onClick={() => setShowManageLocations(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {locations.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: `${accent}66` }}>
                No locations yet. Tap + to create one.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {locations.map((loc) => (
                  <div
                    key={loc.id}
                    data-testid={`location-item-${loc.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${accent}20`,
                    }}
                  >
                    {loc.iconUrl ? (
                      <img src={loc.iconUrl} alt="" className="w-8 h-8 rounded-md object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${accent}15` }}>
                        <MapPin className="w-4 h-4" style={{ color: `${accent}50` }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{loc.name}</p>
                      <p className="font-fantasy text-[9px]" style={{ color: `${accent}60` }}>
                        {loc.type} {loc.isShop ? "(shop)" : ""}
                      </p>
                    </div>
                    <button
                      data-testid={`button-delete-location-${loc.id}`}
                      onClick={() => {
                        deleteLocationMutation.mutate(loc.id);
                      }}
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.6)", cursor: "pointer" }}
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddLocation && currentUser.isAdmin && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddLocation(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98), rgba(18,12,30,0.98))",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent }}>Add Location</h3>
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
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name</label>
                <input
                  data-testid="input-location-name"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  placeholder="Location name"
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Type</label>
                <select
                  data-testid="select-location-type"
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none", cursor: "pointer" }}
                >
                  <option value="explore">Explore</option>
                  <option value="shop">Shop</option>
                  <option value="mini_game">Mini Game</option>
                  <option value="garden">Garden</option>
                  <option value="quest">Quest</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Description</label>
                <input
                  data-testid="input-location-desc"
                  value={newLocDesc}
                  onChange={(e) => setNewLocDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Icon (PNG/GIF)</label>
                <input
                  data-testid="input-location-icon"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewLocIcon(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Background</label>
                <input
                  data-testid="input-location-bg"
                  type="file"
                  accept="image/png,image/gif,image/jpeg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewLocBg(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Owner Character (PNG)</label>
                <input
                  data-testid="input-location-owner"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewLocOwner(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
              </div>

              <button
                data-testid="button-submit-location"
                onClick={() => {
                  if (!newLocName.trim()) return;
                  addLocationMutation.mutate({
                    name: newLocName.trim(),
                    isShop: newLocType === "shop",
                    type: newLocType,
                    description: newLocDesc || undefined,
                    iconData: newLocIcon,
                    bgData: newLocBg,
                    ownerImageData: newLocOwner,
                  });
                }}
                disabled={addLocationMutation.isPending || !newLocName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50, ${accent}25)`,
                  border: `1px solid ${accent}70`,
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
    </div>
  );
}
