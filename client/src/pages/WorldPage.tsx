import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import { Plus, Trash2, X, MapPin, Package, Pencil, Settings, Swords, FlipHorizontal } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import ExploreAdminPanel from "@/components/ExploreAdminPanel";
import BattleArena from "@/components/BattleArena";

import shopFrostpeak from "@assets/shop_frostpeak.png";
import shopSkyRealm from "@assets/shop_sky_realm.png";
import shopVolcanic from "@assets/shop_volcanic.png";
import shopIsland from "@assets/shop_island.png";
import shopDesert from "@assets/shop_desert.png";
import shopEnchantedGrove from "@assets/shop_enchanted_grove_v2.png";
import shopHauntedWoods from "@assets/shop_haunted_woods.png";
import shopSwamp from "@assets/shop_swamp.png";

import bgSnowyMountain from "@assets/bg_snowy_mountain_td.png";
import bgSkyRealm from "@assets/bg_sky_realm_td.png";
import bgVolcanic from "@assets/bg_volcanic_td.png";
import bgIsland from "@assets/bg_island_td.png";
import bgDesert from "@assets/bg_desert_td.png";
import bgMagicalForest from "@assets/bg_enchanted_grove_td.png";
import bgHauntedWoods from "@assets/bg_haunted_woods_td.png";
import bgSwamp from "@assets/bg_swamp_v5.png";

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
  flipped: boolean;
  sortOrder: number;
  ownerImageUrl: string | null;
  isShop: boolean;
  glowColor: string | null;
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
  });

  const dbName = worldApiData?.name;
  const world = staticWorld ? {
    ...staticWorld,
    name: dbName || staticWorld.name,
    bg: worldApiData?.bgUrl || staticWorld.bg,
  } : (worldApiData ? {
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
  const [newLocType, setNewLocType] = useState("battle");
  const [newLocDesc, setNewLocDesc] = useState("");
  const [newLocIcon, setNewLocIcon] = useState<string | null>(null);
  const [newLocBg, setNewLocBg] = useState<string | null>(null);
  const [newLocOwner, setNewLocOwner] = useState<string | null>(null);
  const [newLocGlowColor, setNewLocGlowColor] = useState("");
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocDesc, setEditLocDesc] = useState("");
  const [editLocIcon, setEditLocIcon] = useState<string | null>(null);
  const [editLocBg, setEditLocBg] = useState<string | null>(null);
  const [editLocOwner, setEditLocOwner] = useState<string | null>(null);
  const [editLocType, setEditLocType] = useState("battle");
  const [editLocGlowColor, setEditLocGlowColor] = useState("");
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [showLocationView, setShowLocationView] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showAddObject, setShowAddObject] = useState(false);
  const [newObjectImage, setNewObjectImage] = useState<string | null>(null);
  const [showExploreAdmin, setShowExploreAdmin] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [showNoPetMessage, setShowNoPetMessage] = useState(false);
  const [showDangerWarning, setShowDangerWarning] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [battleLocationId, setBattleLocationId] = useState<string | null>(null);
  const [objDragPos, setObjDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const objDragRef = useRef<{ objId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const objDidDrag = useRef(false);
  const locViewRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const areaRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ locId: string; startCanvasX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const [topLocId, setTopLocId] = useState<string | null>(null);

  const { data: locations = [], isLoading: locationsLoading } = useQuery<WorldLocationData[]>({
    queryKey: ["/api/world", worldId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
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
    enabled: showShop,
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
    mutationFn: async (data: { name: string; isShop: boolean; type?: string; description?: string; iconData?: string | null; bgData?: string | null; ownerImageData?: string | null; glowColor?: string | null }) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/location`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      setShowAddLocation(false);
      setNewLocName("");
      setNewLocType("battle");
      setNewLocDesc("");
      setNewLocIcon(null);
      setNewLocBg(null);
      setNewLocOwner(null);
      setNewLocGlowColor("");
      toast({ title: "Place Added", description: "New place created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add place", variant: "destructive" });
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
      toast({ title: "Deleted", description: "Object removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete object", variant: "destructive" });
    },
  });

  const objPositionMutation = useMutation({
    mutationFn: async ({ objectId, posX, posY }: { objectId: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/location/object/${objectId}/position`, { posX, posY });
      return res.json();
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
    onError: () => {
      toast({ title: "Error", description: "Failed to delete place", variant: "destructive" });
    },
  });

  const editLocationMutation = useMutation({
    mutationFn: async ({ locationId, data }: { locationId: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      setEditingLocation(null);
      toast({ title: "Updated", description: "Place updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update place", variant: "destructive" });
    },
  });

  const positionMutation = useMutation({
    mutationFn: async ({ locationId, posX, posY }: { locationId: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}/position`, { posX, posY });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
    },
  });

  const flipMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}/flip`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
    },
  });

  const handlePointerDown = useCallback((e: React.PointerEvent, loc: WorldLocationData) => {
    if (!currentUser.isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    const canvasLeft = areaRef.current ? areaRef.current.getBoundingClientRect().left : 0;
    dragRef.current = {
      locId: loc.id,
      startCanvasX: e.clientX - canvasLeft,
      startY: e.clientY,
      origPosX: loc.posX,
      origPosY: loc.posY,
    };
  }, [currentUser.isAdmin]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !areaRef.current) return;
    e.preventDefault();
    const canvasLeft = areaRef.current.getBoundingClientRect().left;
    const canvasWidth = areaRef.current.offsetWidth;
    const canvasHeight = areaRef.current.offsetHeight || areaRef.current.getBoundingClientRect().height;
    const currentCanvasX = e.clientX - canvasLeft;
    const dx = currentCanvasX - dragRef.current.startCanvasX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const pxPerPercX = canvasWidth / 100;
    const pxPerPercY = canvasHeight / 100;
    const newX = Math.max(0, Math.min(95, dragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(0, Math.min(90, dragRef.current.origPosY + dy / pxPerPercY));
    setDragPos({ id: dragRef.current.locId, x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const d = dragRef.current;
    dragRef.current = null;
    if (didDrag.current && dragPos) {
      setTopLocId(d.locId);
      positionMutation.mutate({ locationId: d.locId, posX: dragPos.x, posY: dragPos.y });
    }
    setDragPos(null);
  }, [dragPos, positionMutation]);

  const activePetInv = currentUser.activePetId
    ? inventory.find((item) => item.shopItemId === currentUser.activePetId && item.type === "pet")
    : null;
  const hasHatchedActivePet = activePetInv && activePetInv.isHatched;

  const handleLocationClick = useCallback((loc: WorldLocationData) => {
    if (didDrag.current) return;
    if ((loc.type === "battle" || loc.type === "explore") && !currentUser.isAdmin && (!currentUser.activePetId || !hasHatchedActivePet)) {
      setShowNoPetMessage(true);
      return;
    }
    setTopLocId(null);
    setActiveLocationId(loc.id);
    if (loc.isShop) {
      setShowLocationView(false);
      setShowShop(true);
    } else if ((loc.type === "battle" || loc.type === "explore") && !currentUser.isAdmin) {
      setShowDangerWarning(true);
    } else {
      setShowShop(false);
      setShowLocationView(true);
    }
  }, [currentUser.activePetId, currentUser.isAdmin, hasHatchedActivePet]);

  const handleObjPointerDown = useCallback((e: React.PointerEvent, obj: LocationObjectData) => {
    if (!currentUser.isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    objDidDrag.current = false;
    objDragRef.current = {
      objId: obj.id,
      startX: e.clientX,
      startY: e.clientY,
      origPosX: obj.posX,
      origPosY: obj.posY,
    };
  }, [currentUser.isAdmin]);

  const handleObjPointerMove = useCallback((e: React.PointerEvent) => {
    if (!objDragRef.current || !locViewRef.current) return;
    e.preventDefault();
    const rect = locViewRef.current.getBoundingClientRect();
    const dx = e.clientX - objDragRef.current.startX;
    const dy = e.clientY - objDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) objDidDrag.current = true;
    const pxPerPercX = rect.width / 100;
    const pxPerPercY = rect.height / 100;
    const newX = Math.max(0, Math.min(95, objDragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(0, Math.min(95, objDragRef.current.origPosY + dy / pxPerPercY));
    setObjDragPos({ id: objDragRef.current.objId, x: newX, y: newY });
  }, []);

  const handleObjPointerUp = useCallback((e: React.PointerEvent) => {
    if (!objDragRef.current) return;
    e.preventDefault();
    const d = objDragRef.current;
    objDragRef.current = null;
    if (objDidDrag.current && objDragPos) {
      objPositionMutation.mutate({ objectId: d.objId, posX: Math.round(objDragPos.x), posY: Math.round(objDragPos.y) });
    }
    setObjDragPos(null);
  }, [objDragPos, objPositionMutation]);

  if (!world) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-black" style={{ maxWidth: "768px", margin: "0 auto" }}>
        <p className="font-fantasy text-[#f0c040] animate-pulse" style={{ textShadow: "0 0 20px rgba(240,192,64,0.5)" }}>Loading realm...</p>
      </div>
    );
  }

  const accent = world.accent;

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden"
      style={{
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <style>{`
        @keyframes locFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes locGlow {
          0%, 100% { opacity: 0.5; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes locRingPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.12); opacity: 0.6; }
        }
        @keyframes worldMote {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.6; }
          100% { transform: translate(var(--mx), var(--my)) scale(0.2); opacity: 0; }
        }
        @keyframes emptyPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .loc-node { transition: filter 0.2s ease; touch-action: none; }
        .loc-node:active { filter: brightness(1.15); }
        .world-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .world-scroll::-webkit-scrollbar-track { background: transparent; }
        .world-scroll::-webkit-scrollbar-thumb { background: ${accent}40; border-radius: 4px; }
        .world-scroll::-webkit-scrollbar-thumb:hover { background: ${accent}70; }
      `}</style>

      <div
        className="absolute top-0 left-0 right-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
      </div>

      <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden world-scroll">
          <div
            ref={areaRef}
            style={{
              position: "relative",
              width: "100%",
              paddingBottom: "200%",
              minHeight: "100dvh",
              backgroundImage: world.bg ? `url(${world.bg})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.1) 70%, rgba(0,0,0,0.65) 100%)`,
            }} />

            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[
                { left: "12%", top: "25%", mx: "30px", my: "-60px", dur: "7s", delay: "0s", size: "3px" },
                { left: "78%", top: "40%", mx: "-40px", my: "-50px", dur: "9s", delay: "2s", size: "2px" },
                { left: "45%", top: "65%", mx: "20px", my: "-70px", dur: "8s", delay: "1s", size: "3px" },
                { left: "25%", top: "80%", mx: "-25px", my: "-55px", dur: "10s", delay: "3s", size: "2px" },
                { left: "65%", top: "30%", mx: "35px", my: "-45px", dur: "6s", delay: "4s", size: "2px" },
              ].map((mote, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    left: mote.left,
                    top: mote.top,
                    width: mote.size,
                    height: mote.size,
                    background: accent,
                    boxShadow: `0 0 6px ${accent}80, 0 0 12px ${accent}40`,
                    animation: `worldMote ${mote.dur} ease-in-out infinite`,
                    animationDelay: mote.delay,
                    "--mx": mote.mx,
                    "--my": mote.my,
                  } as React.CSSProperties}
                />
              ))}
            </div>

            <div
              className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
              data-testid={`text-world-name-${worldId}`}
              style={{ top: "7%", zIndex: 5 }}
            >
              <h2
                className="font-fantasy font-bold tracking-widest text-center leading-none px-5"
                style={{
                  fontSize: "clamp(13px, 3.6vw, 19px)",
                  color: "#fff5b0",
                  textShadow: "0 0 6px #f0c040, 0 0 14px #d4a017, 0 0 28px rgba(212,160,23,0.65), 0 0 50px rgba(240,192,64,0.28), 0 1px 3px rgba(0,0,0,1)",
                  letterSpacing: "0.14em",
                }}
              >
                {world.name}
              </h2>
            </div>

            {locationsLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="font-fantasy text-sm animate-pulse" style={{ color: accent, textShadow: `0 0 15px ${accent}60` }}>Loading places...</p>
              </div>
            ) : locations.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center px-8">
                <div className="text-center">
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{
                      background: `radial-gradient(circle, ${accent}20 0%, transparent 70%)`,
                      border: `1px solid ${accent}25`,
                      animation: "emptyPulse 3s ease-in-out infinite",
                    }}
                  >
                    <MapPin className="w-7 h-7" style={{ color: `${accent}70`, filter: `drop-shadow(0 0 8px ${accent}40)` }} />
                  </div>
                  <p className="font-fantasy text-base tracking-wider mb-2" style={{ color: `${accent}aa`, textShadow: `0 0 15px ${accent}40` }}>
                    No places discovered yet
                  </p>
                  {currentUser.isAdmin && (
                    <p className="font-fantasy text-[10px] tracking-[0.15em]" style={{ color: `${accent}60`, textShadow: `0 0 8px ${accent}20` }}>
                      Tap + to conjure new places
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="absolute inset-0">
                {locations.map((loc, i) => {
                  const pos = dragPos?.id === loc.id ? { x: dragPos.x, y: dragPos.y } : { x: loc.posX, y: loc.posY };
                  const isDragging = dragRef.current?.locId === loc.id;
                  const glow = loc.glowColor || accent;
                  return (
                    <div
                      key={loc.id}
                      data-testid={`location-${loc.id}`}
                      className="absolute loc-node flex flex-col items-center"
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        width: "17%",
                        cursor: currentUser.isAdmin ? "grab" : "pointer",
                        zIndex: isDragging ? 60 : topLocId === loc.id ? 45 : 10 + i,
                      }}
                      onPointerDown={(e) => handlePointerDown(e, loc)}
                      onClick={() => handleLocationClick(loc)}
                    >
                      <div className="relative w-full" style={{ aspectRatio: "1" }}>
                        <div
                          className="absolute inset-[-35%] rounded-full pointer-events-none"
                          style={{
                            background: `radial-gradient(circle, ${glow}90 0%, ${glow}50 30%, ${glow}20 55%, transparent 75%)`,
                            animation: `locGlow ${3 + (i % 2)}s ease-in-out infinite`,
                            animationDelay: `${i * 0.25}s`,
                          }}
                        />
                        {loc.iconUrl ? (
                          <img
                            src={loc.iconUrl}
                            alt={loc.name}
                            className="w-full h-full object-contain relative z-10"
                            draggable={false}
                            style={{
                              filter: `drop-shadow(0 3px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 18px ${glow}80) drop-shadow(0 0 30px ${glow}40)`,
                              transform: loc.flipped ? "scaleX(-1)" : undefined,
                            }}
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-full flex items-center justify-center relative z-10"
                            style={{
                              background: `radial-gradient(circle at 40% 35%, ${glow}55, ${glow}20)`,
                              border: `2px solid ${glow}70`,
                              boxShadow: `inset 0 0 20px ${glow}30, 0 0 30px ${glow}40, 0 0 50px ${glow}15`,
                            }}
                          >
                            <MapPin className="w-7 h-7" style={{ color: glow, filter: `drop-shadow(0 0 12px ${glow}90)` }} />
                          </div>
                        )}

                        {currentUser.isAdmin && (
                          <>
                            <button
                              data-testid={`button-edit-location-${loc.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLocation(loc);
                                setEditLocName(loc.name);
                                setEditLocDesc(loc.description || "");
                                setEditLocIcon(null);
                                setEditLocBg(null);
                                setEditLocOwner(null);
                                setEditLocType(loc.type || (loc.isShop ? "shop" : "battle"));
                                setEditLocGlowColor(loc.glowColor || "");
                              }}
                              className="absolute -top-1 -right-1 z-30 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{
                                background: "rgba(45,106,79,0.9)",
                                border: "1px solid rgba(127,255,212,0.5)",
                                cursor: "pointer",
                              }}
                            >
                              <Pencil className="w-2.5 h-2.5 text-white" />
                            </button>
                            <button
                              data-testid={`button-flip-location-${loc.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                flipMutation.mutate(loc.id);
                              }}
                              className="absolute -bottom-1 -right-1 z-30 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{
                                background: "rgba(0,80,180,0.9)",
                                border: "1px solid rgba(100,180,255,0.5)",
                                cursor: "pointer",
                              }}
                            >
                              <FlipHorizontal className="w-2.5 h-2.5 text-white" />
                            </button>
                            <button
                              data-testid={`button-delete-location-${loc.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete "${loc.name}"?`)) {
                                  deleteLocationMutation.mutate(loc.id);
                                }
                              }}
                              className="absolute -top-1 -left-1 z-30 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{
                                background: "rgba(220,38,38,0.9)",
                                border: "1px solid rgba(255,100,100,0.5)",
                                cursor: "pointer",
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
        </div>

      <button
        data-testid="button-back-to-map"
        onClick={() => navigate("/map")}
        className="fixed z-30 font-fantasy text-sm tracking-[0.15em] transition-transform active:scale-95 px-4 py-2 rounded-lg"
        style={{
          bottom: "24px",
          left: "max(16px, calc((100vw - 768px) / 2 + 16px))",
          background: `linear-gradient(135deg, rgba(10,5,15,0.92) 0%, rgba(25,15,35,0.92) 50%, rgba(10,5,15,0.92) 100%)`,
          border: `1.5px solid ${accent}70`,
          color: accent,
          cursor: "pointer",
          boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 20px ${accent}20, inset 0 1px 0 ${accent}15`,
          textShadow: `0 0 12px ${accent}50, 0 0 25px ${accent}25`,
        }}
      >
        ← Map
      </button>

      {currentUser.isAdmin && (
        <button
          data-testid="button-add-location"
          onClick={() => setShowAddLocation(true)}
          className="fixed z-30 w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{
            bottom: "16px",
            right: "max(16px, calc((100vw - 768px) / 2 + 16px))",
            background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}88 100%)`,
            border: `2px solid ${accent}`,
            boxShadow: `0 4px 25px ${accent}60, 0 0 40px ${accent}35`,
            cursor: "pointer",
          }}
        >
          <Plus className="w-7 h-7 text-black" />
        </button>
      )}

      {showAddLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="overlay-add-location-backdrop" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddLocation(false)} />
          <div
            data-testid="modal-add-location"
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: `linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 50%, rgba(8,5,18,0.98) 100%)`,
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25, 0 0 80px ${accent}10`,
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-fantasy text-lg tracking-widest" style={{ color: accent, textShadow: `0 0 15px ${accent}50` }}>
                Add Place
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
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name</label>
                <input
                  data-testid="input-location-name"
                  type="text"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="Place name..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: `1px solid ${accent}35`,
                    color: "#e8ddd0",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Owner Character (PNG)</label>
                <input
                  data-testid="input-location-owner"
                  type="file"
                  accept="image/png"
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
                {newLocOwner && (
                  <div className="mt-2 flex justify-center">
                    <img src={newLocOwner} alt="Preview" className="w-16 h-16 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Place Type</label>
                <select
                  data-testid="select-location-type"
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: `1px solid ${accent}35`,
                    color: "#e8ddd0",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="battle">Battle</option>
                  <option value="mini_game">Mini Game</option>
                  <option value="shop">Shop</option>
                  <option value="garden">Garden</option>
                  <option value="quest">Quest</option>
                  <option value="fishing">Fishing</option>
                  <option value="explore">Explore</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Icon (PNG or GIF)</label>
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
                {newLocIcon && (
                  <div className="mt-2 flex justify-center">
                    <img src={newLocIcon} alt="Preview" className="w-16 h-16 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              {newLocType !== "shop" && (
                <div>
                  <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Background (PNG/GIF/JPEG)</label>
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
                  {newLocBg && (
                    <div className="mt-2 flex justify-center">
                      <img src={newLocBg} alt="Preview" className="w-full h-20 object-cover rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Description (optional)</label>
                <input
                  data-testid="input-location-description"
                  type="text"
                  value={newLocDesc}
                  onChange={(e) => setNewLocDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: `1px solid ${accent}35`,
                    color: "#e8ddd0",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Glow Color (optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="input-location-glow-color"
                    type="color"
                    value={newLocGlowColor || accent}
                    onChange={(e) => setNewLocGlowColor(e.target.value)}
                    className="w-10 h-8 rounded border-0 cursor-pointer"
                    style={{ background: "transparent" }}
                  />
                  <span className="font-fantasy text-[10px]" style={{ color: `${accent}88` }}>{newLocGlowColor || "Default (world accent)"}</span>
                </div>
              </div>

              <button
                data-testid="button-submit-add-location"
                onClick={() => {
                  if (!newLocName.trim()) return;
                  addLocationMutation.mutate({
                    name: newLocName.trim(),
                    isShop: newLocType === "shop",
                    type: newLocType,
                    description: newLocDesc.trim() || undefined,
                    iconData: newLocIcon,
                    bgData: newLocBg,
                    ownerImageData: newLocOwner,
                    glowColor: newLocGlowColor || undefined,
                  });
                }}
                disabled={addLocationMutation.isPending || !newLocName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                  boxShadow: `0 0 15px ${accent}20`,
                  textShadow: `0 0 8px ${accent}40`,
                }}
              >
                {addLocationMutation.isPending ? "Adding..." : "Add Place"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingLocation(null)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-xl p-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(30,20,10,0.97) 0%, rgba(20,12,5,0.97) 100%)",
              border: `1px solid ${accent}40`,
              boxShadow: `0 0 30px ${accent}15`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-wider" style={{ color: accent }}>Edit Place</h3>
              <button onClick={() => setEditingLocation(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${accent}88` }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Name</label>
                <input
                  data-testid="input-edit-location-name"
                  type="text"
                  value={editLocName}
                  onChange={(e) => setEditLocName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Description</label>
                <input
                  data-testid="input-edit-location-description"
                  type="text"
                  value={editLocDesc}
                  onChange={(e) => setEditLocDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Place Type</label>
                <select
                  data-testid="select-edit-location-type"
                  value={editLocType}
                  onChange={(e) => setEditLocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: `1px solid ${accent}35`,
                    color: "#e8ddd0",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="battle">Battle</option>
                  <option value="mini_game">Mini Game</option>
                  <option value="shop">Shop</option>
                  <option value="garden">Garden</option>
                  <option value="quest">Quest</option>
                  <option value="fishing">Fishing</option>
                  <option value="explore">Explore</option>
                </select>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>
                  Replace Icon (PNG or GIF)
                </label>
                {editingLocation.iconUrl && !editLocIcon && (
                  <div className="mb-2 flex items-center gap-2">
                    <img src={editingLocation.iconUrl} alt="" className="w-12 h-12 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                    <span className="font-fantasy text-[9px] tracking-wider" style={{ color: `${accent}66` }}>Current icon</span>
                  </div>
                )}
                <input
                  data-testid="input-edit-location-icon"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setEditLocIcon(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {editLocIcon && (
                  <div className="mt-2 flex justify-center">
                    <img src={editLocIcon} alt="Preview" className="w-14 h-14 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              {editLocType !== "shop" && (
                <div>
                  <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Replace Background</label>
                  <input
                    data-testid="input-edit-location-bg"
                    type="file"
                    accept="image/png,image/gif,image/jpeg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const dataUrl = await readFileAsDataUrl(file);
                        setEditLocBg(dataUrl);
                      }
                    }}
                    className="w-full text-xs font-fantasy"
                    style={{ color: `${accent}cc` }}
                  />
                  {editLocBg && (
                    <div className="mt-2 flex justify-center">
                      <img src={editLocBg} alt="Preview" className="w-full h-16 object-cover rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Replace Owner Character</label>
                <input
                  data-testid="input-edit-location-owner"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setEditLocOwner(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {editLocOwner && (
                  <div className="mt-2 flex justify-center">
                    <img src={editLocOwner} alt="Preview" className="w-14 h-14 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Glow Color</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="input-edit-location-glow-color"
                    type="color"
                    value={editLocGlowColor || accent}
                    onChange={(e) => setEditLocGlowColor(e.target.value)}
                    className="w-10 h-8 rounded border-0 cursor-pointer"
                    style={{ background: "transparent" }}
                  />
                  <span className="font-fantasy text-[10px]" style={{ color: `${accent}88` }}>{editLocGlowColor || "Default (world accent)"}</span>
                  {editLocGlowColor && (
                    <button
                      onClick={() => setEditLocGlowColor("")}
                      className="font-fantasy text-[9px] px-2 py-0.5 rounded"
                      style={{ background: `${accent}20`, color: accent, cursor: "pointer" }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <button
                data-testid="button-submit-edit-location"
                onClick={() => {
                  const data: Record<string, any> = {};
                  if (editLocName.trim() && editLocName.trim() !== editingLocation.name) data.name = editLocName.trim();
                  if (editLocDesc !== (editingLocation.description || "")) data.description = editLocDesc.trim();
                  const editIsShop = editLocType === "shop";
                  if (editIsShop !== editingLocation.isShop) data.isShop = editIsShop;
                  const existingType = editingLocation.type || (editingLocation.isShop ? "shop" : "battle");
                  if (editLocType !== existingType) data.type = editLocType;
                  if (editLocIcon) data.iconData = editLocIcon;
                  if (editLocBg) data.bgData = editLocBg;
                  if (editLocOwner) data.ownerImageData = editLocOwner;
                  if (editLocGlowColor !== (editingLocation.glowColor || "")) data.glowColor = editLocGlowColor || null;
                  if (Object.keys(data).length === 0) {
                    setEditingLocation(null);
                    return;
                  }
                  editLocationMutation.mutate({ locationId: editingLocation.id, data });
                }}
                disabled={editLocationMutation.isPending}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                  boxShadow: `0 0 15px ${accent}20`,
                  textShadow: `0 0 8px ${accent}40`,
                }}
              >
                {editLocationMutation.isPending ? "Saving..." : "Save Changes"}
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
                      background: `linear-gradient(135deg, ${accent}40 0%, ${accent}20 100%)`,
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

            {activeLoc?.ownerImageUrl && (
              <div className="absolute bottom-4 left-4 z-20 pointer-events-none" style={{ animation: "locFloat 4s ease-in-out infinite" }}>
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
                        background: "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
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
        );
      })()}

      {showItemPicker && currentUser.isAdmin && activeLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowItemPicker(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg p-4 max-h-[80vh] overflow-y-auto"
            style={{
              background: `linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)`,
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
                Assign Items
              </h3>
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
              <div className="w-full h-full" style={{ background: `linear-gradient(180deg, rgba(5,3,15,1) 0%, rgba(15,10,30,1) 50%, rgba(5,3,15,1) 100%)` }} />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.7) 100%)` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, ${accent}08 0%, transparent 60%)` }} />
          </div>

          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <div className="flex items-center gap-3">
                {activeLoc.iconUrl && (
                  <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-lg object-contain" style={{ border: `1px solid ${accent}40`, filter: `drop-shadow(0 0 8px ${accent}30)` }} />
                )}
                <div>
                  <h3 className="font-fantasy text-lg tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 15px ${accent}50` }}>
                    {activeLoc.name}
                  </h3>
                  {activeLoc.description && (
                    <p className="font-fantasy text-[10px] tracking-wider" style={{ color: `${accent}88` }}>
                      {activeLoc.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                data-testid="button-close-location-view"
                onClick={() => { setShowLocationView(false); setActiveLocationId(null); }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: `linear-gradient(135deg, ${accent}30 0%, ${accent}15 100%)`,
                  border: `2px solid ${accent}60`,
                  color: accent,
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                X
              </button>
            </div>

            <div
              ref={locViewRef}
              className="flex-1 relative overflow-hidden"
              onPointerMove={handleObjPointerMove}
              onPointerUp={handleObjPointerUp}
            >
              {locationObjects.map((obj) => {
                const pos = objDragPos?.id === obj.id ? { x: objDragPos.x, y: objDragPos.y } : { x: obj.posX, y: obj.posY };
                const isDragging = objDragRef.current?.objId === obj.id;
                return (
                  <div
                    key={obj.id}
                    data-testid={`location-object-${obj.id}`}
                    className="absolute"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: `${obj.width}px`,
                      cursor: currentUser.isAdmin ? "grab" : "default",
                      zIndex: isDragging ? 30 : 10,
                      touchAction: "none",
                      transition: isDragging ? "none" : "left 0.1s, top 0.1s",
                    }}
                    onPointerDown={(e) => handleObjPointerDown(e, obj)}
                  >
                    <img
                      src={obj.imageUrl}
                      alt=""
                      className="w-full h-auto object-contain pointer-events-none"
                      draggable={false}
                      style={{ filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.5)) drop-shadow(0 0 8px ${accent}20)` }}
                    />
                    {currentUser.isAdmin && (
                      <button
                        data-testid={`button-delete-object-${obj.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!objDidDrag.current) deleteObjectMutation.mutate(obj.id);
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center z-20"
                        style={{ background: "rgba(220,38,38,0.9)", border: "1px solid rgba(255,100,100,0.5)", cursor: "pointer" }}
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                );
              })}

              {activeLoc.ownerImageUrl && (
                <div className="absolute bottom-4 left-4 z-20 pointer-events-none" style={{ animation: "locFloat 4s ease-in-out infinite" }}>
                  <img src={activeLoc.ownerImageUrl} alt="Owner" className="w-24 h-24 object-contain" style={{ filter: `drop-shadow(0 3px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 15px ${accent}30)` }} />
                </div>
              )}

              {currentUser.isAdmin && (
                <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
                  {(activeLoc.type === "battle" || activeLoc.type === "explore") && (
                    <>
                      <button
                        data-testid="button-explore-admin"
                        onClick={() => setShowExploreAdmin(true)}
                        className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90"
                        style={{
                          background: `linear-gradient(135deg, rgba(192,132,252,0.8) 0%, rgba(120,80,200,0.6) 100%)`,
                          border: `2px solid rgba(192,132,252,0.9)`,
                          boxShadow: `0 4px 20px rgba(192,132,252,0.4)`,
                          cursor: "pointer",
                        }}
                      >
                        <Settings className="w-5 h-5 text-white" />
                      </button>
                      {currentUser.activePetId && (
                        <button
                          data-testid="button-start-battle"
                          onClick={() => {
                            setBattleLocationId(activeLoc.id);
                            setShowBattle(true);
                            setShowLocationView(false);
                          }}
                          className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90"
                          style={{
                            background: `linear-gradient(135deg, rgba(239,68,68,0.8) 0%, rgba(180,40,40,0.6) 100%)`,
                            border: `2px solid rgba(239,68,68,0.9)`,
                            boxShadow: `0 4px 20px rgba(239,68,68,0.4)`,
                            cursor: "pointer",
                          }}
                        >
                          <Swords className="w-5 h-5 text-white" />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    data-testid="button-add-object"
                    onClick={() => setShowAddObject(true)}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90"
                    style={{
                      background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}88 100%)`,
                      border: `2px solid ${accent}`,
                      boxShadow: `0 4px 20px ${accent}50`,
                      cursor: "pointer",
                    }}
                  >
                    <Plus className="w-6 h-6 text-black" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {showAddObject && activeLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowAddObject(false); setNewObjectImage(null); }} />
          <div
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5"
            style={{
              background: `linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)`,
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
                Add Object
              </h3>
              <button
                data-testid="button-close-add-object"
                onClick={() => { setShowAddObject(false); setNewObjectImage(null); }}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: `${accent}bb` }}>Image (PNG or GIF)</label>
                <input
                  data-testid="input-object-image"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewObjectImage(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                />
                {newObjectImage && (
                  <div className="mt-2 flex justify-center">
                    <img src={newObjectImage} alt="Preview" className="w-20 h-20 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                  </div>
                )}
              </div>
              <button
                data-testid="button-submit-add-object"
                onClick={() => {
                  if (!newObjectImage || !activeLocationId) return;
                  addObjectMutation.mutate({ locationId: activeLocationId, imageData: newObjectImage });
                }}
                disabled={addObjectMutation.isPending || !newObjectImage}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                  border: `1px solid ${accent}70`,
                  color: accent,
                  cursor: "pointer",
                  boxShadow: `0 0 15px ${accent}20`,
                }}
              >
                {addObjectMutation.isPending ? "Adding..." : "Add Object"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoPetMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowNoPetMessage(false)} />
          <div
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: `${accent}15`, border: `2px solid ${accent}40` }}>
              <Swords className="w-8 h-8" style={{ color: `${accent}88` }} />
            </div>
            <h3 className="font-fantasy text-sm tracking-widest mb-2" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
              Not Safe to Explore
            </h3>
            <p className="font-fantasy text-[11px] tracking-wider leading-relaxed mb-4" style={{ color: `${accent}aa` }}>
              Keepers must have a pet to explore safely
            </p>
            <button
              data-testid="button-close-no-pet"
              onClick={() => setShowNoPetMessage(false)}
              className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${accent}50 0%, ${accent}25 100%)`,
                border: `1px solid ${accent}70`,
                color: accent,
                cursor: "pointer",
              }}
            >
              Return
            </button>
          </div>
        </div>
      )}

      {showExploreAdmin && activeLocationId && (
        <ExploreAdminPanel
          locationId={activeLocationId}
          accent={accent}
          onClose={() => setShowExploreAdmin(false)}
          bgUploading={bgUploading}
          onBgUpload={async (imageData: string) => {
            setBgUploading(true);
            try {
              await apiRequest("PATCH", `/api/admin/world/location/${activeLocationId}`, { bgData: imageData });
              queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
              toast({ title: "Background Updated" });
            } catch {
              toast({ title: "Failed to upload background", variant: "destructive" });
            } finally {
              setBgUploading(false);
            }
          }}
        />
      )}

      {showDangerWarning && activeLocationId && (() => {
        const dangerLoc = locations.find(l => l.id === activeLocationId);
        if (!dangerLoc) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDangerWarning(false)} />
            <div
              className="relative z-10 w-[85%] max-w-sm rounded-lg p-5 text-center"
              style={{
                background: "linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)",
                border: `1px solid #ff444455`,
                boxShadow: `0 0 40px #ff444425`,
              }}
              data-testid="modal-danger-warning"
            >
              <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: "#ff444415", border: "2px solid #ff444440" }}>
                <Swords className="w-8 h-8 text-red-400 animate-pulse" />
              </div>
              <h3 className="font-fantasy text-base tracking-widest mb-2 text-red-400" style={{ textShadow: "0 0 10px #ff444440" }}>
                Danger Ahead!
              </h3>
              <p className="font-fantasy text-[11px] tracking-wider leading-relaxed mb-5 text-red-300/80">
                Wild creatures lurk in {dangerLoc.name}. Prepare for battle!
              </p>
              <div className="flex gap-3">
                <button
                  data-testid="button-danger-go-back"
                  onClick={() => { setShowDangerWarning(false); setActiveLocationId(null); }}
                  className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-600/50"
                >
                  Go Back
                </button>
                <button
                  data-testid="button-danger-move-forward"
                  onClick={() => {
                    setShowDangerWarning(false);
                    setBattleLocationId(activeLocationId);
                    setShowBattle(true);
                  }}
                  className="flex-1 py-2.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 bg-red-600/80 border border-red-500/70 text-white hover:bg-red-500/80"
                  style={{ boxShadow: "0 0 15px #ff444430" }}
                >
                  Move Forward
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showBattle && battleLocationId && (() => {
        const battleLoc = locations.find(l => l.id === battleLocationId);
        if (!battleLoc) return null;
        return (
          <BattleArena
            locationId={battleLocationId}
            locationName={battleLoc.name}
            bgUrl={battleLoc.bgUrl}
            accent={accent}
            onClose={() => {
              setShowBattle(false);
              setBattleLocationId(null);
              setActiveLocationId(null);
            }}
            onBattleEnd={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
              queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            }}
          />
        );
      })()}

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
