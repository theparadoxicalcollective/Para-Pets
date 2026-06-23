import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { setNavHidden } from "@/lib/navVisibility";
import { playChime, playTick, playShopBell, playMapTap } from "@/lib/sounds";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import { DESIGN_W, DESIGN_H, getStageScale } from "@/lib/stage";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import coinIconImg from "@assets/icon_coin.png";
import fishCommonIconWp from "@assets/generated_images/icon_fish_common.png";
import fishRodIconWp from "@assets/icon_fishing_pole.png";
import { Plus, Minus, Trash2, X, MapPin, Package, Pencil, Settings, Swords, FlipHorizontal, Copy, Waves, Palette, Heart, Droplets } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import ExploreAdminPanel from "@/components/ExploreAdminPanel";
import BattleArena, { BattlePotionSlot } from "@/components/BattleArena";
import FishingPage from "@/pages/FishingPage";
import SellFishPage from "@/pages/SellFishPage";
import fishBarrelImg from "@assets/fish_barrel.png";
import tutorialArrow from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";

import bgShopMystical from "@assets/bg_shop_mystical.png";
import bgShopBayou from "@assets/bg_shop_bayou.png";
import bgShopFishing from "@assets/bg_shop_fishing.png";
import bgShopCentralMarket from "@assets/bg_central_market.png";
import bgShopVolcanic from "@assets/bg_shop_volcanic.png";
import mixingTreeCauldronImg from "@assets/icon_mixing_tree_cauldron.png";
import bgShopVolcanicPets from "@assets/bg_shop_volcanic_pets.png";
import bgShopForgeFang from "@assets/bg_shop_forge_fang_volcanic.png";
import bgShopBookshopVolcanic from "@assets/bg_shop_bookshop_volcanic.png";
import bgShopFoodVolcanic from "@assets/bg_shop_food_volcanic.png";
import bgShopFoodSwamp from "@assets/bg_shop_food_swamp.png";
import shopVolcanicFishing from "@assets/icon_fishing_shop_volcanic.png";
import npcLavaHook from "@assets/npc_lava_hook_shopkeeper.png";
import shopFrostpeak from "@assets/shop_frostpeak.png";
import shopSkyRealm from "@assets/shop_sky_realm.png";
import shopVolcanic from "@assets/shop_volcanic.png";
import shopIsland from "@assets/shop_island.png";
import shopDesert from "@assets/shop_desert.png";
import shopEnchantedGrove from "@assets/shop_enchanted_grove_v2.png";
import shopHauntedWoods from "@assets/shop_haunted_woods.png";
import shopSwamp from "@assets/shop_swamp.png";


const LIGHT_ORB_SENTINEL = "__light_orb__";
const LIGHT_ORB_BLUE_SENTINEL = "__light_orb_blue__";
const LIGHT_ORB_GREEN_SENTINEL = "__light_orb_green__";
const LIGHT_ORB_PURPLE_SENTINEL = "__light_orb_purple__";
const FIREFLIES_SENTINEL = "__fireflies__";
const PASS_THROUGH_SENTINELS = new Set([LIGHT_ORB_SENTINEL, LIGHT_ORB_BLUE_SENTINEL, LIGHT_ORB_GREEN_SENTINEL, LIGHT_ORB_PURPLE_SENTINEL, FIREFLIES_SENTINEL]);

function getOrbGradient(sentinel: string): string {
  if (sentinel === LIGHT_ORB_BLUE_SENTINEL)
    return "radial-gradient(circle, rgba(150,200,255,0.48) 0%, rgba(90,155,255,0.28) 20%, rgba(60,110,255,0.14) 45%, rgba(40,80,220,0.05) 65%, transparent 80%)";
  if (sentinel === LIGHT_ORB_GREEN_SENTINEL)
    return "radial-gradient(circle, rgba(150,255,190,0.48) 0%, rgba(80,230,130,0.28) 20%, rgba(50,190,90,0.14) 45%, rgba(40,160,70,0.05) 65%, transparent 80%)";
  if (sentinel === LIGHT_ORB_PURPLE_SENTINEL)
    return "radial-gradient(circle, rgba(220,150,255,0.48) 0%, rgba(175,95,252,0.28) 20%, rgba(140,65,225,0.14) 45%, rgba(110,45,205,0.05) 65%, transparent 80%)";
  return "radial-gradient(circle, rgba(255,235,150,0.48) 0%, rgba(255,200,70,0.28) 20%, rgba(255,145,10,0.14) 45%, rgba(255,110,0,0.05) 65%, transparent 80%)";
}

function seededRand(seed: string, n: number): number {
  let h = (n + 1) * 2654435761;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const WORLD_CONFIG: Record<string, { name: string; shopIcon: string; accent: string; bgGradient: string }> = {
  snowy_mountain: { name: "Frostpeak", shopIcon: shopFrostpeak, accent: "#88ccff", bgGradient: "linear-gradient(180deg, rgba(20,30,60,0.7) 0%, rgba(40,80,120,0.3) 50%, rgba(10,15,30,0.7) 100%)" },
  sky_realm: { name: "Sky Realm", shopIcon: shopSkyRealm, accent: "#ffd700", bgGradient: "linear-gradient(180deg, rgba(40,30,10,0.7) 0%, rgba(80,60,20,0.3) 50%, rgba(20,15,5,0.7) 100%)" },
  volcanic: { name: "Volcanic Isle", shopIcon: shopVolcanic, accent: "#ff4500", bgGradient: "linear-gradient(180deg, rgba(40,10,5,0.7) 0%, rgba(80,20,10,0.3) 50%, rgba(20,5,2,0.7) 100%)" },
  island: { name: "The Lost Island", shopIcon: shopIsland, accent: "#20b2aa", bgGradient: "linear-gradient(180deg, rgba(5,30,30,0.7) 0%, rgba(10,60,60,0.3) 50%, rgba(5,15,15,0.7) 100%)" },
  desert: { name: "Scorched Desert", shopIcon: shopDesert, accent: "#daa520", bgGradient: "linear-gradient(180deg, rgba(40,25,5,0.7) 0%, rgba(80,50,10,0.3) 50%, rgba(20,12,3,0.7) 100%)" },
  enchanted_grove: { name: "Enchanted Grove", shopIcon: shopEnchantedGrove, accent: "#7fffd4", bgGradient: "linear-gradient(180deg, rgba(5,30,20,0.7) 0%, rgba(10,60,40,0.3) 50%, rgba(5,15,10,0.7) 100%)" },
  haunted_woods: { name: "Haunted Woods", shopIcon: shopHauntedWoods, accent: "#8b008b", bgGradient: "linear-gradient(180deg, rgba(30,5,30,0.7) 0%, rgba(60,10,60,0.3) 50%, rgba(15,3,15,0.7) 100%)" },
  swamp: { name: "Elysian Swamplands", shopIcon: shopSwamp, accent: "#5cb87a", bgGradient: "linear-gradient(180deg, rgba(20,15,35,0.7) 0%, rgba(40,30,70,0.3) 50%, rgba(10,8,18,0.7) 100%)" },
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
  specialSkill: string | null;
  healthRestored: number | null;
  manaRestored: number | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
  petsRevived: number | null;
  specialType: string | null;
  specialAmount: number | null;
  shopPosX: number;
  shopPosY: number;
  shopWidth: number;
  fishingType: string | null;
  rarityBoostPercent: number | null;
  baitRarityBoostStar: number | null;
  poleMaxUses: number | null;
  catchEasePercent: number | null;
  giftPoints: number | null;
  locationId: string | null;
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
  onContentReady?: () => void;
}

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  // Stack size for the row. The server collapses identical purchases
  // (e.g. potions) into a single row with quantity > 1 (capped at the
  // type's stack limit, currently 50). Older single-use items leave
  // this missing or set to 1.
  quantity?: number;
  isHatched?: boolean;
  imageUrl?: string | null;
  hatchedImageUrl?: string | null;
  healthRestored?: number | null;
  manaRestored?: number | null;
  petsRevived?: number | null;
  petNickname?: string | null;
  petLevel?: number | null;
  petAtk?: number | null;
  petDef?: number | null;
  petHealth?: number | null;
  petTemplateId?: string | null;
  specialSkill?: string | null;
  rarity?: number | null;
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
  iconSize: number;
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

const MAP_W = 1080;
const MAP_H_DEFAULT = 1920;

// Per-world fixed map heights (in MAP_W=1080 pixel space).
// NEVER change these after admin has placed items — all positions are stored
// as percentages of (MAP_W × mapH), so a different mapH shifts everything.
// To derive the value: Math.round(1080 * imgH / imgW) for the canonical bg image.
const WORLD_FIXED_MAP_H: Record<string, number> = {
  swamp:           1621, // bg_swamp_map_v6.jpeg 2729×4096 — natural at MAP_W=1080
  snowy_mountain:  1980, // bg_snowy_mountain_map.webp 768×1408
  sky_realm:       1980, // bg_sky_realm_map.webp 768×1408
  volcanic:        1619, // bg_volcanic_map_v2.jpeg 843×1264 — natural at MAP_W=1080
  haunted_woods:   1619, // bg_haunted_woods_v2.png 1024×1535 — natural at MAP_W=1080
  enchanted_grove: 1980, // bg_enchanted_grove_map.webp 768×1408
  island:          1980, // bg_island_map.webp 768×1408
  desert:          1980, // bg_desert_map.webp 768×1408
};

// Frame dimensions track the real viewport so the map fills every screen.
// isMobilePhone kept as true to always enable pinch/scroll controls.
const isMobilePhone = () => true;

export default function WorldPage({ user, onContentReady }: WorldPageProps) {
  const params = useParams<{ worldId: string }>();
  const [rawLocation] = useLocation();
  const worldId = params.worldId || rawLocation.replace(/^\/world\//, "").split("/")[0] || "";
  const staticWorld = WORLD_CONFIG[worldId];

  const { data: worldApiData } = useQuery<WorldApiData>({
    queryKey: ["/api/worlds", worldId],
    queryFn: async () => {
      const res = await fetch(`/api/worlds/${worldId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchOnMount: true,
    staleTime: 0,
  });

  const dbName = worldApiData?.name;
  const world = staticWorld ? {
    ...staticWorld,
    name: dbName || staticWorld.name,
    bg: worldApiData?.bgUrl ?? null,
  } : (worldApiData ? {
    name: worldApiData.name,
    shopIcon: worldApiData.iconUrl || "",
    bg: worldApiData.bgUrl || null,
    accent: worldApiData.glowColor || "#ffd700",
    bgGradient: "linear-gradient(180deg, rgba(20,15,10,0.7) 0%, rgba(40,30,15,0.3) 50%, rgba(10,8,5,0.7) 100%)",
  } : null);

  const contentReadyFiredRef = useRef(false);
  useEffect(() => {
    if (worldApiData && !contentReadyFiredRef.current) {
      contentReadyFiredRef.current = true;
      onContentReady?.();
    }
  }, [!!worldApiData]);

  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showShop, setShowShop] = useState(false);
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
  const [pickerFilter, setPickerFilter] = useState("all");
  const [pickerTab, setPickerTab] = useState<"items" | "house" | "decor">("items");
  const [showAddObject, setShowAddObject] = useState(false);
  const [newObjectImage, setNewObjectImage] = useState<string | null>(null);
  const [showExploreAdmin, setShowExploreAdmin] = useState(false);
  const [showPondAdmin, setShowPondAdmin] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [showNoPetMessage, setShowNoPetMessage] = useState(false);
  const [showDangerWarning, setShowDangerWarning] = useState(false);
  const [showCauldronConstruction, setShowCauldronConstruction] = useState(false);
  const [showBattlePrep, setShowBattlePrep] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [battleLocationId, setBattleLocationId] = useState<string | null>(null);
  const [battlePotionSlots, setBattlePotionSlots] = useState<(BattlePotionSlot | null)[]>([null, null, null, null, null]);
  const [battlePets, setBattlePets] = useState<(InventoryItem | null)[]>([null, null, null]);
  // Ref guard: prevents the save effect from writing stale state back to
  // localStorage on the same render that the load effect runs.
  const battleTeamReadyRef = useRef(false);
  const [petPickerSlot, setPetPickerSlot] = useState<number | null>(null);
  // World-battle prep now uses the same tap-to-open picker model as the
  // PvP arena: an empty slot opens the inventory picker on tap; a filled
  // slot clears itself on tap. The drag-and-drop rig was removed.
  const [potionPickerOpen, setPotionPickerOpen] = useState(false);
  const [showFishing, setShowFishing] = useState(false);
  const [showSellFish, setShowSellFish] = useState(false);
  const [fishingShopTab, setFishingShopTab] = useState<"pole" | "bait" | "aquarium">("pole");
  const [barrelDragPos, setBarrelDragPos] = useState<{ x: number; y: number } | null>(null);
  const barrelDragRef = useRef<{ startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const barrelDidDrag = useRef(false);
  const [objDragPos, setObjDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const objDragRef = useRef<{ objId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const objDidDrag = useRef(false);
  const [selectedDecorAdminId, setSelectedDecorAdminId] = useState<string | null>(null);

  const [showDecorPanel, setShowDecorPanel] = useState(false);
  const [showAddDecorForm, setShowAddDecorForm] = useState(false);
  const [newDecorName, setNewDecorName] = useState("");
  const [newDecorImage, setNewDecorImage] = useState<string | null>(null);
  const [editingDecorItem, setEditingDecorItem] = useState<{ id: string; name: string; imageUrl: string } | null>(null);
  const [editDecorName, setEditDecorName] = useState("");
  const [editDecorMessage, setEditDecorMessage] = useState("");
  const [editDecorImage, setEditDecorImage] = useState<string | null>(null);
  const [decorDragPos, setDecorDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const decorDragRef = useRef<{ placementId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const decorDidDrag = useRef(false);
  const panelDragRef = useRef<{ item: { id: string; name: string; imageUrl: string } } | null>(null);
  const [panelDragGhost, setPanelDragGhost] = useState<{ clientX: number; clientY: number; item: { id: string; name: string; imageUrl: string } } | null>(null);
  const [showDecorMsg, setShowDecorMsg] = useState<{ text: string; clientX: number; clientY: number } | null>(null);
  const locViewRef = useRef<HTMLDivElement>(null);

  const [selectedShopItem, setSelectedShopItem] = useState<ShopItem | null>(null);
  const [buyStep, setBuyStep] = useState<0 | 1 | 2>(0);
  const [buyQty, setBuyQty] = useState(1);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyConfirmPending, setBuyConfirmPending] = useState(false);
  const [buyFlash, setBuyFlash] = useState(0);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [barrelSelected, setBarrelSelected] = useState(false);
  const draggableLocIdRef = useRef<string | null>(null);
  const shopJustOpened = useRef<number>(0);
  const shopScrollRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const areaRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);

  // Frame dimensions are the fixed phone-frame design size (#game-stage in
  // App.tsx scales the whole frame uniformly to fit the device). The map must
  // be laid out in this design space, NOT the real window, so it fills the
  // frame identically on every device.
  const FRAME_W = DESIGN_W;
  const FRAME_H = DESIGN_H;
  const frameWRef = useRef(FRAME_W);
  const frameHRef = useRef(FRAME_H);
  const [frameW] = useState(FRAME_W);
  const [frameH] = useState(FRAME_H);

  const dragRef = useRef<{ locId: string; startCanvasX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const adminLocTapRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [worldBgLoaded, setWorldBgLoaded] = useState(false);
  const [committedWorldBg, setCommittedWorldBg] = useState<string>("");
  const lastLoadedBgRef = useRef("");

  const mapTransformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [mapX, setMapX] = useState(0);
  const [mapY, setMapY] = useState(0);
  const [mapScale, setMapScale] = useState(1);
  const [mapH, setMapH] = useState(MAP_H_DEFAULT);
  const mapHRef = useRef(MAP_H_DEFAULT);
  const mapPanPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const mapPanStartRef = useRef<{ x: number; y: number; mapX: number; mapY: number } | null>(null);
  const mapPinchRef = useRef<{ dist: number; midX: number; midY: number; mapX: number; mapY: number; scale: number } | null>(null);
  const mapPanningRef = useRef(false);
  const mapJustPannedRef = useRef(false);
  const [locBgLoaded, setLocBgLoaded] = useState(false);
  const [showFishHint, setShowFishHint] = useState(() =>
    worldId === "swamp" && new URLSearchParams(window.location.search).get("fishHint") === "1"
  );
  const [showShopHint, setShowShopHint] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("shopHint")
  );
  const [showMoltenHint, setShowMoltenHint] = useState(() =>
    worldId === "volcanic" && new URLSearchParams(window.location.search).get("moltenHint") === "1"
  );
  const [showBarrelHint, setShowBarrelHint] = useState(() =>
    worldId === "swamp" && new URLSearchParams(window.location.search).get("barrelHint") === "1"
  );
  const autoOpenShopId = useRef(new URLSearchParams(window.location.search).get("openShop"));
  const autoOpenDone = useRef(false);
  const [committedLocBgUrl, setCommittedLocBgUrl] = useState<string | null>(null);

  const { data: locations = [], isLoading: locationsLoading } = useQuery<WorldLocationData[]>({
    queryKey: ["/api/world", worldId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
    refetchOnMount: true,
    staleTime: 0,
  });

  // Auto-open a shop when ?openShop=<locationId> is in the URL (e.g. from a
  // quest hint "Buy Edibles" button).  Runs once after locations load.
  useEffect(() => {
    if (!autoOpenShopId.current || autoOpenDone.current || !locations.length) return;
    const loc = locations.find((l) => l.id === autoOpenShopId.current && l.isShop);
    if (loc) {
      autoOpenDone.current = true;
      setActiveLocationId(loc.id);
      setShowShop(true);
    }
  }, [locations]);

  // Hide the floating nav whenever a full-screen overlay (shop, fishing spot,
  // or fish market) is open so the nav button doesn't float over the UI.
  useEffect(() => {
    setNavHidden(showShop || showFishing || showSellFish);
    return () => { setNavHidden(false); };
  }, [showShop, showFishing, showSellFish]);

  const { data: activeLocDetail } = useQuery<WorldLocationData>({
    queryKey: ["/api/location", activeLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeLocationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch location");
      return res.json();
    },
    enabled: !!activeLocationId,
  });

  const { data: battleLocDetail } = useQuery<WorldLocationData>({
    queryKey: ["/api/location", battleLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/location/${battleLocationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch location");
      return res.json();
    },
    enabled: !!battleLocationId,
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

  const { data: shopBundlesForSale = [], refetch: refetchShopBundlesForSale } = useQuery<{ id: string; name: string; shopImageUrl: string | null; price: number }[]>({
    queryKey: ["/api/locations", activeLocationId, "shop-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${activeLocationId}/shop-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showShop && !!activeLocationId,
    staleTime: 0,
  });

  const { data: shopDecorForSale = [] } = useQuery<{ id: string; name: string; imageUrl: string | null; price: number }[]>({
    queryKey: ["/api/locations", activeLocationId, "shop-decor"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${activeLocationId}/shop-decor`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showShop && !!activeLocationId,
    staleTime: 0,
  });

  // The cauldron panel needs the inventory available too so players can see
  // which ingredients they own and drop them in.
  const [cauldronOpen, setCauldronOpen] = useState(false);

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    enabled: showShop || showBattlePrep || cauldronOpen,
    staleTime: 0,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Mixing Tree cauldron layout — admin-controlled position+size shared by
  // all players. Stored server-side in game_settings so it survives restarts
  // and is identical for every player.
  const { data: cauldronLayout } = useQuery<{ x: number; y: number; size: number }>({
    queryKey: ["/api/cauldron/layout"],
    staleTime: 60 * 1000,
  });
  const cauldronX = cauldronLayout?.x ?? 50;
  const cauldronY = cauldronLayout?.y ?? 8;
  const cauldronSize = cauldronLayout?.size ?? 38;

  const cauldronLayoutMutation = useMutation({
    mutationFn: async (payload: { x: number; y: number; size: number }) => {
      const res = await apiRequest("PATCH", "/api/admin/cauldron/layout", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/cauldron/layout"], data);
    },
  });

  // Per-user cauldron contents — what the player has dropped in so far.
  const { data: cauldronContents = [] } = useQuery<Array<{ shopItemId: string; quantity: number; name: string; imageUrl: string | null }>>({
    queryKey: ["/api/cauldron/contents"],
    enabled: cauldronOpen,
    staleTime: 0,
  });

  const addToCauldronMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const res = await apiRequest("POST", "/api/cauldron/contents", { inventoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cauldron/contents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not add to the cauldron", variant: "destructive" });
    },
  });

  const clearCauldronMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/cauldron/contents");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cauldron/contents"] });
    },
  });

  const { data: allShopItems = [], refetch: refetchAllShopItems, isLoading: isAllShopItemsLoading } = useQuery<ShopItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
    enabled: currentUser.isAdmin,
    staleTime: 0,
  });

  const { data: allAdminBundles = [], refetch: refetchAdminBundles } = useQuery<{ id: string; name: string; shopImageUrl: string | null; price: number }[]>({
    queryKey: ["/api/admin/house-bundles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/house-bundles", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentUser.isAdmin,
    staleTime: 30000,
  });

  const { data: allAdminDecor = [], refetch: refetchAdminDecor } = useQuery<{ id: string; name: string; imageUrl: string | null; price: number }[]>({
    queryKey: ["/api/admin/home-decor"],
    queryFn: async () => {
      const res = await fetch("/api/admin/home-decor", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentUser.isAdmin,
    staleTime: 30000,
  });

  const { data: locationShopBundles = [], refetch: refetchLocationBundles } = useQuery<{ id: string; bundleId: string }[]>({
    queryKey: ["/api/admin/location", activeLocationId, "shop-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${activeLocationId}/shop-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentUser.isAdmin && !!activeLocationId && showItemPicker,
    staleTime: 0,
  });

  const { data: locationShopDecor = [], refetch: refetchLocationDecor } = useQuery<{ id: string; decorId: string }[]>({
    queryKey: ["/api/admin/location", activeLocationId, "shop-decor"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${activeLocationId}/shop-decor`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentUser.isAdmin && !!activeLocationId && showItemPicker,
    staleTime: 0,
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


  const ownedItemIds = useMemo(() => new Set(inventory.map((inv) => inv.shopItemId)), [inventory]);

  const buyMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await apiRequest("POST", `/api/shop/${worldId}/buy/${itemId}`, { quantity });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (data.user) setCurrentUser(data.user);
      setBuyError(null);
      setBuyConfirmPending(false);
      setBuyFlash(n => n + 1);
      playChime();
      const qty = data.quantity ?? 1;
      toast({ title: "Purchased!", description: qty > 1 ? `${qty}x added to your inventory` : "Added to your inventory" });
    },
    onError: (err: any) => {
      let msg = "Could not purchase item";
      try {
        const parsed = JSON.parse(err.message.split(": ").slice(1).join(": "));
        msg = parsed.message || msg;
      } catch {}
      setBuyError(msg);
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

  const addFishingSpotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/fishing-spot`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      toast({ title: "Fishing Spot Added", description: "Drag it to where you want it on the map" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add fishing spot", variant: "destructive" });
    },
  });

  const { data: decorItems = [] } = useQuery<{ id: string; worldId: string; name: string; imageUrl: string; createdAt: string }[]>({
    queryKey: ["/api/world", worldId, "decor", "items"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/decor/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch decor items");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!worldId,
  });

  const { data: decorPlacements = [] } = useQuery<{ id: string; worldId: string; decorItemId: string; name: string; imageUrl: string; posX: number; posY: number; size: number; flipped: boolean; message: string | null; createdAt: string }[]>({
    queryKey: ["/api/world", worldId, "decor", "placements"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${worldId}/decor/placements`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch decor placements");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!worldId,
  });

  const { data: fishBarrel, refetch: refetchBarrel } = useQuery<{ id: string; worldId: string; posX: number; posY: number; size: number } | null>({
    queryKey: ["/api/world", worldId, "fish-barrel"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/world/${worldId}/fish-barrel`);
      const data = await res.json();
      return data || null;
    },
    enabled: !!worldId,
  });

  const createBarrelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/fish-barrel`, {});
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "fish-barrel"] }); },
  });

  const updateBarrelMutation = useMutation({
    mutationFn: async (data: { posX?: number; posY?: number; size?: number }) => {
      if (!fishBarrel) return;
      const res = await apiRequest("PATCH", `/api/admin/fish-barrel/${fishBarrel.id}`, data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "fish-barrel"] }); },
  });

  const deleteBarrelMutation = useMutation({
    mutationFn: async () => {
      if (!fishBarrel) return;
      await apiRequest("DELETE", `/api/admin/fish-barrel/${fishBarrel.id}`);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "fish-barrel"] }); },
  });

  const addDecorItemMutation = useMutation({
    mutationFn: async (data: { name: string; imageUrl: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/decor/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "items"] });
      setShowAddDecorForm(false);
      setNewDecorName("");
      setNewDecorImage(null);
      toast({ title: "Decor Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add decor", variant: "destructive" }),
  });

  const updateDecorItemMutation = useMutation({
    mutationFn: async ({ id, name, imageUrl, message }: { id: string; name?: string; imageUrl?: string; message?: string | null }) => {
      await apiRequest("PATCH", `/api/admin/world/decor/items/${id}`, { name, imageUrl, message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "placements"] });
      setEditingDecorItem(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update decor item", variant: "destructive" }),
  });

  const deleteDecorItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/admin/world/decor/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "placements"] });
    },
  });

  const addDecorPlacementMutation = useMutation({
    mutationFn: async (data: { item: { id: string; name: string; imageUrl: string }; posX: number; posY: number }) => {
      const res = await apiRequest("POST", `/api/admin/world/${worldId}/decor/placements`, {
        decorItemId: data.item.id,
        name: data.item.name,
        imageUrl: data.item.imageUrl,
        posX: data.posX,
        posY: data.posY,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "placements"] }),
    onError: () => toast({ title: "Error", description: "Failed to place decor", variant: "destructive" }),
  });

  const updateDecorPlacementMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; posX?: number; posY?: number; size?: number; flipped?: boolean; message?: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/decor/placements/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "placements"] }),
  });

  const deleteDecorPlacementMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/world/decor/placements/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "decor", "placements"] }),
  });

  const assignItemMutation = useMutation({
    mutationFn: async ({ locationId, itemId }: { locationId: string; itemId: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/assign-item/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeLocationId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Removed", description: "Item removed from shop" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove item", variant: "destructive" });
    },
  });

  const assignBundleMutation = useMutation({
    mutationFn: async ({ locationId, bundleId }: { locationId: string; bundleId: string }) => {
      await apiRequest("POST", `/api/admin/location/${locationId}/assign-bundle/${bundleId}`);
    },
    onSuccess: () => {
      refetchLocationBundles();
      toast({ title: "Added", description: "Bundle added to shop" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add bundle", variant: "destructive" }),
  });

  const unassignBundleMutation = useMutation({
    mutationFn: async ({ locationId, bundleId }: { locationId: string; bundleId: string }) => {
      await apiRequest("DELETE", `/api/admin/location/${locationId}/unassign-bundle/${bundleId}`);
    },
    onSuccess: () => {
      refetchLocationBundles();
      toast({ title: "Removed", description: "Bundle removed from shop" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove bundle", variant: "destructive" }),
  });

  const assignDecorMutation = useMutation({
    mutationFn: async ({ locationId, decorId }: { locationId: string; decorId: string }) => {
      await apiRequest("POST", `/api/admin/location/${locationId}/assign-decor/${decorId}`);
    },
    onSuccess: () => {
      refetchLocationDecor();
      toast({ title: "Added", description: "Decor added to shop" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add decor", variant: "destructive" }),
  });

  const unassignDecorMutation = useMutation({
    mutationFn: async ({ locationId, decorId }: { locationId: string; decorId: string }) => {
      await apiRequest("DELETE", `/api/admin/location/${locationId}/unassign-decor/${decorId}`);
    },
    onSuccess: () => {
      refetchLocationDecor();
      toast({ title: "Removed", description: "Decor removed from shop" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove decor", variant: "destructive" }),
  });

  const buyBundleMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const res = await apiRequest("POST", `/api/house-bundles/${bundleId}/purchase`, {});
      return res.json();
    },
    onSuccess: (_, bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchShopBundlesForSale();
      toast({ title: "Bundle purchased!", description: "Find it in your Home Inventory." });
    },
    onError: (e: any) => toast({ title: "Purchase failed", description: e?.message ?? "Not enough coins", variant: "destructive" }),
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
    onMutate: async ({ objectId, posX, posY }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/location", activeLocationId, "objects"] });
      const previous = queryClient.getQueryData(["/api/location", activeLocationId, "objects"]);
      queryClient.setQueryData(["/api/location", activeLocationId, "objects"], (old: any[]) =>
        old?.map(obj => obj.id === objectId ? { ...obj, posX, posY } : obj)
      );
      return { previous };
    },
    onError: (_err: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/location", activeLocationId, "objects"], ctx.previous);
    },
    onSuccess: () => {},
  });

  const objWidthMutation = useMutation({
    mutationFn: async ({ objectId, width }: { objectId: string; width: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/location/object/${objectId}/size`, { width });
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

  const iconSizeMutation = useMutation({
    mutationFn: async ({ locationId, iconSize }: { locationId: string; iconSize: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}`, { iconSize });
      return res.json();
    },
    onMutate: async ({ locationId, iconSize }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/world", worldId, "locations"] });
      const previous = queryClient.getQueryData(["/api/world", worldId, "locations"]);
      queryClient.setQueryData(["/api/world", worldId, "locations"], (old: any[]) =>
        old?.map(loc => loc.id === locationId ? { ...loc, iconSize } : loc)
      );
      return { previous };
    },
    onError: (_err: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/world", worldId, "locations"], ctx.previous);
    },
    onSuccess: () => {},
  });

  const shopItemSizeMutation = useMutation({
    mutationFn: async ({ itemId, width }: { itemId: string; width: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/shop-item/${itemId}/size`, { width });
      return res.json();
    },
    onMutate: async ({ itemId, width }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/location", activeLocationId, "items"] });
      const previous = queryClient.getQueryData(["/api/location", activeLocationId, "items"]);
      queryClient.setQueryData(["/api/location", activeLocationId, "items"], (old: any[]) =>
        old?.map(item => item.id === itemId ? { ...item, shopWidth: width } : item)
      );
      return { previous };
    },
    onError: (_err: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/location", activeLocationId, "items"], ctx.previous);
    },
    onSuccess: () => {},
  });

  const resetBgMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", `/api/admin/world/location/${locationId}/reset-bg`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
      setEditingLocation(null);
      toast({ title: "Background Reset", description: "Restored to original generated background" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset background", variant: "destructive" });
    },
  });

  const positionMutation = useMutation({
    mutationFn: async ({ locationId, posX, posY }: { locationId: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}/position`, { posX, posY });
      return res.json();
    },
    onMutate: async ({ locationId, posX, posY }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/world", worldId, "locations"] });
      const previous = queryClient.getQueryData(["/api/world", worldId, "locations"]);
      queryClient.setQueryData(["/api/world", worldId, "locations"], (old: any[]) => {
        if (!old) return old;
        const maxOrder = old.reduce((m: number, l: any) => Math.max(m, l.sortOrder ?? 0), 0);
        return old.map((loc: any) => loc.id === locationId ? { ...loc, posX, posY, sortOrder: maxOrder + 1 } : loc);
      });
      return { previous };
    },
    onError: (_err: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/world", worldId, "locations"], ctx.previous);
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/world", worldId, "locations"], (old: any[]) =>
        old?.map(loc => loc.id === data.id ? { ...loc, ...data } : loc)
      );
    },
  });

  const flipMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}/flip`, {});
      return res.json();
    },
    onMutate: async (locationId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/world", worldId, "locations"] });
      const previous = queryClient.getQueryData(["/api/world", worldId, "locations"]);
      queryClient.setQueryData(["/api/world", worldId, "locations"], (old: any[]) =>
        old?.map(loc => loc.id === locationId ? { ...loc, flipped: !loc.flipped } : loc)
      );
      return { previous };
    },
    onError: (_err: any, _vars: any, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/world", worldId, "locations"], ctx.previous);
    },
    onSuccess: (_data: any, locationId: string) => {
      queryClient.setQueryData(["/api/world", worldId, "locations"], (old: any[]) =>
        old?.map(loc => loc.id === locationId ? { ...loc, ..._data } : loc)
      );
    },
  });

  const duplicateLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", `/api/admin/world/location/${locationId}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", worldId, "locations"] });
    },
  });

  // On world change: immediately clear stale bg and reset map height so the
  // old world's background and wrong icon scale never flash on first entry.
  // This runs before the bg-load effect, ensuring worldBgLoaded stays false
  // (showing the spinner) until the correct background is confirmed loaded.
  useEffect(() => {
    mapHRef.current = MAP_H_DEFAULT;
    setMapH(MAP_H_DEFAULT);
    setWorldBgLoaded(false);
    setCommittedWorldBg("");
    lastLoadedBgRef.current = "";
  }, [worldId]);

  useEffect(() => {
    // If world data hasn't resolved yet (API-only world on first visit),
    // stay in loading state — the spinner will show until data arrives.
    if (!world) return;
    if (!world.bg) { setWorldBgLoaded(true); return; }
    // If we already loaded this exact URL (e.g. stale cache returned same bg),
    // skip the reload entirely to prevent a flash of the loading screen.
    if (world.bg === lastLoadedBgRef.current) { setWorldBgLoaded(true); return; }
    setWorldBgLoaded(false);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const h = WORLD_FIXED_MAP_H[worldId] ?? Math.round(MAP_W * img.naturalHeight / img.naturalWidth);
        mapHRef.current = h;
        setMapH(h);
      }
      lastLoadedBgRef.current = world.bg!;
      setCommittedWorldBg(world.bg!);
      setWorldBgLoaded(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      lastLoadedBgRef.current = world.bg!;
      setCommittedWorldBg(world.bg!);
      setWorldBgLoaded(true);
    };
    img.src = world.bg;
    return () => { cancelled = true; };
  }, [worldId, world?.bg]);

  const clampTransform = useCallback((x: number, y: number, sc: number) => {
    const mw = MAP_W * sc;
    const mh = mapHRef.current * sc;
    const cx = mw <= frameWRef.current ? (frameWRef.current - mw) / 2 : Math.max(frameWRef.current - mw, Math.min(0, x));
    const cy = mh <= frameHRef.current ? (frameHRef.current - mh) / 2 : Math.max(frameHRef.current - mh, Math.min(0, y));
    return { x: cx, y: cy };
  }, []);

  const applyMapTransform = useCallback((x: number, y: number, _sc: number) => {
    const coverSc = Math.max(frameWRef.current / MAP_W, frameHRef.current / mapHRef.current);
    const { x: cx, y: cy } = clampTransform(x, y, coverSc);
    mapTransformRef.current = { x: cx, y: cy, scale: coverSc };
    setMapX(cx);
    setMapY(cy);
    setMapScale(coverSc);
  }, [clampTransform]);

  useEffect(() => {
    const coverSc = Math.max(frameWRef.current / MAP_W, frameHRef.current / mapHRef.current);
    const ix = (frameWRef.current - MAP_W * coverSc) / 2;
    const iy = (frameHRef.current - mapHRef.current * coverSc) / 2;
    mapTransformRef.current = { x: ix, y: iy, scale: coverSc };
    setMapX(ix);
    setMapY(iy);
    setMapScale(coverSc);
  }, [worldId, mapH, frameW, frameH]);

  const handleVpPointerDown = useCallback((e: React.PointerEvent) => {
    // Safety: clear any stale drag state that wasn't cleaned up (e.g. after pointerCancel)
    if (dragRef.current && !mapPanPointersRef.current.size) { dragRef.current = null; setDragPos(null); }
    if (dragRef.current || objDragRef.current) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ptrs = Array.from(mapPanPointersRef.current.values());
    if (ptrs.length === 1) {
      mapPanStartRef.current = { x: e.clientX, y: e.clientY, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
      mapPinchRef.current = null;
      mapPanningRef.current = false;
    }
  }, []);

  const handleVpPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current || objDragRef.current) return;
    if (!mapPanPointersRef.current.has(e.pointerId)) return;
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ptrs = Array.from(mapPanPointersRef.current.values());
    if (ptrs.length === 1 && mapPanStartRef.current) {
      const s = getStageScale();
      const dx = (e.clientX - mapPanStartRef.current.x) / s;
      const dy = (e.clientY - mapPanStartRef.current.y) / s;
      if (!mapPanningRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) mapPanningRef.current = true;
      if (mapPanningRef.current) applyMapTransform(mapPanStartRef.current.mapX + dx, mapPanStartRef.current.mapY + dy, mapTransformRef.current.scale);
    }
  }, [applyMapTransform]);

  const handleVpPointerUp = useCallback((e: React.PointerEvent) => {
    mapPanPointersRef.current.delete(e.pointerId);
    const remaining = mapPanPointersRef.current.size;
    if (remaining === 0) {
      if (mapPanningRef.current) { mapJustPannedRef.current = true; setTimeout(() => { mapJustPannedRef.current = false; }, 80); }
      mapPanStartRef.current = null;
      mapPanningRef.current = false;
      mapPinchRef.current = null;
    } else if (remaining === 1) {
      mapPinchRef.current = null;
      const [ptr] = Array.from(mapPanPointersRef.current.values());
      mapPanStartRef.current = { x: ptr.x, y: ptr.y, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
      mapPanningRef.current = false;
    }
  }, []);

  const handleVpWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleVpWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleVpWheel);
  }, [handleVpWheel]);

  useEffect(() => {
    setLocBgLoaded(false);
    if (!activeLocationId) return;
    if (!activeLocDetail) return;
    const bgUrl = activeLocDetail.bgUrl;
    if (!bgUrl) { setCommittedLocBgUrl(null); setLocBgLoaded(true); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setCommittedLocBgUrl(bgUrl);
        setLocBgLoaded(true);
      }
    };
    img.onerror = () => { if (!cancelled) { setCommittedLocBgUrl(bgUrl); setLocBgLoaded(true); } };
    img.src = bgUrl;
    const fallback = setTimeout(() => { if (!cancelled) { setCommittedLocBgUrl(bgUrl); setLocBgLoaded(true); } }, 5000);
    return () => { cancelled = true; clearTimeout(fallback); };
  }, [activeLocationId, activeLocDetail?.bgUrl]);

  // Keep ref in sync so handlePointerDown never sees stale state
  useEffect(() => { draggableLocIdRef.current = selectedLocId; }, [selectedLocId]);
  useEffect(() => {
    if (showItemPicker) {
      setPickerFilter("all");
      setPickerTab("items");
      refetchAllShopItems();
      refetchAdminBundles();
      refetchAdminDecor();
      refetchLocationBundles();
      refetchLocationDecor();
    }
  }, [showItemPicker]);

  const handlePointerDown = useCallback((e: React.PointerEvent, loc: WorldLocationData) => {
    if (!currentUser.isAdmin) return;
    // Always stop propagation so the map pan handler doesn't engage on location touches
    e.stopPropagation();
    // Only allow dragging if this location is already selected — use ref to avoid stale closure
    if (draggableLocIdRef.current !== loc.id) return;
    // Do NOT preventDefault here — we still want click events to fire for double-tap-to-open
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    const rect = areaRef.current ? areaRef.current.getBoundingClientRect() : { left: 0 };
    dragRef.current = {
      locId: loc.id,
      startCanvasX: e.clientX - rect.left,
      startY: e.clientY,
      origPosX: loc.posX,
      origPosY: loc.posY,
    };
  }, [currentUser.isAdmin]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !areaRef.current) return;
    e.preventDefault();
    const rect = areaRef.current.getBoundingClientRect();
    const currentCanvasX = e.clientX - rect.left;
    const dx = currentCanvasX - dragRef.current.startCanvasX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const pxPerPercX = rect.width / 100;
    const pxPerPercY = rect.height / 100;
    const newX = Math.max(-10, Math.min(110, dragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(-10, Math.min(110, dragRef.current.origPosY + dy / pxPerPercY));
    setDragPos({ id: dragRef.current.locId, x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    dragRef.current = null;
    if (didDrag.current && dragPos) {
      // Suppress the click that fires synchronously after pointerup — keep didDrag true
      // until after click fires, then clear. Also clear the double-tap ref so the next
      // touch starts a fresh first-tap selection (not an accidental openLocation).
      e.preventDefault();
      if (adminLocTapRef.current) { clearTimeout(adminLocTapRef.current.timer); adminLocTapRef.current = null; }
      positionMutation.mutate({ locationId: d.locId, posX: dragPos.x, posY: dragPos.y });
      setTimeout(() => { didDrag.current = false; }, 50);
    } else {
      didDrag.current = false;
    }
    setDragPos(null);
  }, [dragPos, positionMutation]);

  const activePetInv = currentUser.activePetId
    ? inventory.find((item) => item.inventoryId === currentUser.activePetId && item.type === "pet")
    : null;
  const hasHatchedActivePet = activePetInv && activePetInv.isHatched;

  const BAYOUS_HEART_ID = "8e211716-0448-496e-8582-6ce1025ac4e4";

  const openLocation = useCallback((loc: WorldLocationData) => {
    setActiveLocationId(loc.id);
    // The Molten Bastion launches the Molten Blocks mini-game instead of a
    // generic scenic view. Detect by stable seeded ID so renames don't break it.
    if (loc.id === "c3d4e5f6-0005-4000-8000-000000000005") {
      navigate("/games/molten-blocks");
      return;
    }
    if (loc.type === "fishing" && !loc.isShop) {
      setShowLocationView(false);
      setShowShop(false);
      setShowFishing(true);
    } else if (loc.isShop) {
      setShowLocationView(false);
      setShowShop(true);
      shopJustOpened.current = Date.now();
      playShopBell();
    } else if ((loc.type === "battle" || loc.type === "explore") && !currentUser.isAdmin) {
      setShowDangerWarning(true);
    } else {
      setShowShop(false);
      setShowLocationView(true);
    }
  }, [currentUser.isAdmin, navigate]);

  const handleLocationClick = useCallback((loc: WorldLocationData) => {
    if (didDrag.current || mapJustPannedRef.current) return;
    if (currentUser.isAdmin) {
      if (adminLocTapRef.current?.id === loc.id) {
        clearTimeout(adminLocTapRef.current.timer);
        adminLocTapRef.current = null;
        setSelectedLocId(null);
        openLocation(loc);
      } else {
        if (adminLocTapRef.current) clearTimeout(adminLocTapRef.current.timer);
        setSelectedLocId(loc.id);
        const timer = setTimeout(() => { adminLocTapRef.current = null; }, 400);
        adminLocTapRef.current = { id: loc.id, timer };
      }
      return;
    }
    if (!loc.isShop && loc.type !== "fishing" && (loc.type === "battle" || loc.type === "explore") && (!currentUser.activePetId || !hasHatchedActivePet)) {
      setShowNoPetMessage(true);
      return;
    }
    playMapTap();
    openLocation(loc);
  }, [currentUser.activePetId, currentUser.isAdmin, hasHatchedActivePet, openLocation]);

  // LOAD saved team when battle prep opens (or when the location changes).
  useEffect(() => {
    battleTeamReadyRef.current = false;
    if (!showBattlePrep || !battleLocationId) return;

    const activePet =
      inventory.find(
        (i) => i.inventoryId === currentUser.activePetId && i.type === "pet" && i.isHatched,
      ) ?? null;

    const key = `battle_team_v1_${currentUser.id}_${battleLocationId}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const { petIds, potionSlots } = JSON.parse(saved) as {
          petIds: (string | null)[];
          potionSlots: (BattlePotionSlot | null)[];
        };

        // Match saved inventoryIds against current inventory (items may have been used/removed)
        const restoredPets: (InventoryItem | null)[] = (petIds ?? []).map((id) =>
          id
            ? (inventory.find((i) => i.inventoryId === id && i.type === "pet" && i.isHatched) ?? null)
            : null,
        );
        // Slot 0 must always have the active pet
        if (!restoredPets[0]) restoredPets[0] = activePet;
        while (restoredPets.length < 3) restoredPets.push(null);

        // Validate potions against live inventory (items may have been consumed)
        const restoredPotions: (BattlePotionSlot | null)[] = (potionSlots ?? []).map((slot) => {
          if (!slot) return null;
          const live = inventory.find((i) => i.inventoryId === slot.inventoryId);
          if (!live || (live.quantity ?? 0) <= 0) return null;
          return { ...slot, qty: Math.min(slot.qty, live.quantity ?? slot.qty) };
        });
        while (restoredPotions.length < 5) restoredPotions.push(null);

        setBattlePets(restoredPets.slice(0, 3));
        setBattlePotionSlots(restoredPotions.slice(0, 5));
        return;
      }
    } catch {}

    // No saved state — fall back to just the active pet
    setBattlePets([activePet, null, null]);
    // potionSlots stay as the [null×5] set by the trigger
  }, [showBattlePrep, battleLocationId]);

  // SAVE team to localStorage whenever slots change.
  // The ref guard skips the very first run after the load effect so we don't
  // overwrite the just-loaded state with the pre-load empty state.
  useEffect(() => {
    if (!showBattlePrep || !battleLocationId) return;
    if (!battleTeamReadyRef.current) {
      battleTeamReadyRef.current = true;
      return;
    }
    const key = `battle_team_v1_${currentUser.id}_${battleLocationId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        petIds: battlePets.map((p) => p?.inventoryId ?? null),
        potionSlots: battlePotionSlots,
      }),
    );
  }, [battlePets, battlePotionSlots, showBattlePrep, battleLocationId]);

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
    const newX = Math.max(-10, Math.min(110, objDragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(-10, Math.min(110, objDragRef.current.origPosY + dy / pxPerPercY));
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


  // Panel drag: subscribe to document events while dragging a decor item from the inventory panel
  useEffect(() => {
    if (!panelDragGhost) return;
    const onMove = (e: PointerEvent) => {
      if (!panelDragRef.current) return;
      setPanelDragGhost(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null);
    };
    const onUp = (e: PointerEvent) => {
      if (!panelDragRef.current) return;
      const item = panelDragRef.current.item;
      panelDragRef.current = null;
      setPanelDragGhost(null);
      if (areaRef.current) {
        const rect = areaRef.current.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          addDecorPlacementMutation.mutate({ item, posX: x, posY: y });
        }
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [!!panelDragGhost]);

  const handleDecorPointerDown = useCallback((e: React.PointerEvent, placement: { id: string; posX: number; posY: number }) => {
    if (!currentUser.isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    decorDidDrag.current = false;
    decorDragRef.current = {
      placementId: placement.id,
      startX: e.clientX,
      startY: e.clientY,
      origPosX: placement.posX,
      origPosY: placement.posY,
    };
  }, [currentUser.isAdmin]);

  const handleDecorPointerMove = useCallback((e: React.PointerEvent) => {
    if (!decorDragRef.current || !areaRef.current) return;
    e.preventDefault();
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - decorDragRef.current.startX;
    const dy = e.clientY - decorDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) decorDidDrag.current = true;
    const pxPerPercX = rect.width / 100;
    const pxPerPercY = rect.height / 100;
    const newX = Math.max(0, Math.min(100, decorDragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(0, Math.min(100, decorDragRef.current.origPosY + dy / pxPerPercY));
    setDecorDragPos({ id: decorDragRef.current.placementId, x: newX, y: newY });
  }, []);

  const handleDecorPointerUp = useCallback(() => {
    if (!decorDragRef.current) return;
    const d = decorDragRef.current;
    decorDragRef.current = null;
    if (decorDidDrag.current && decorDragPos) {
      updateDecorPlacementMutation.mutate({ id: d.placementId, posX: decorDragPos.x, posY: decorDragPos.y });
    } else {
      // Tap (no drag) — toggle selection
      setSelectedDecorId(prev => prev === d.placementId ? null : d.placementId);
      setBarrelSelected(false);
    }
    decorDidDrag.current = false;
    setDecorDragPos(null);
  }, [decorDragPos, updateDecorPlacementMutation]);

  const handleBarrelPointerDown = useCallback((e: React.PointerEvent) => {
    if (!currentUser.isAdmin || !fishBarrel) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    barrelDidDrag.current = false;
    barrelDragRef.current = { startX: e.clientX, startY: e.clientY, origPosX: fishBarrel.posX, origPosY: fishBarrel.posY };
  }, [currentUser.isAdmin, fishBarrel]);

  const handleBarrelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!barrelDragRef.current || !areaRef.current) return;
    e.preventDefault();
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - barrelDragRef.current.startX;
    const dy = e.clientY - barrelDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) barrelDidDrag.current = true;
    const newX = Math.max(0, Math.min(100, barrelDragRef.current.origPosX + (dx / rect.width) * 100));
    const newY = Math.max(0, Math.min(100, barrelDragRef.current.origPosY + (dy / rect.height) * 100));
    setBarrelDragPos({ x: newX, y: newY });
  }, []);

  const handleBarrelPointerUp = useCallback(() => {
    if (!barrelDragRef.current) return;
    barrelDragRef.current = null;
    if (barrelDidDrag.current && barrelDragPos) {
      updateBarrelMutation.mutate({ posX: barrelDragPos.x, posY: barrelDragPos.y });
    }
    barrelDidDrag.current = false;
    setBarrelDragPos(null);
  }, [barrelDragPos, updateBarrelMutation]);

  const isShopItemTransparentClick = useCallback((e: React.MouseEvent<HTMLImageElement>): boolean => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const natX = Math.round((clickX / rect.width) * img.naturalWidth);
    const natY = Math.round((clickY / rect.height) * img.naturalHeight);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0);
      const pixel = ctx.getImageData(natX, natY, 1, 1).data;
      return pixel[3] < 20;
    } catch {
      return false;
    }
  }, []);

  const getItemDescription = (item: ShopItem): string[] => {
    const lines: string[] = [];
    if (item.type === "fishing") {
      if (item.fishingType === "pole") {
        if (item.catchEasePercent) lines.push(`Easy Catch +${item.catchEasePercent}%`);
        lines.push(item.poleMaxUses ? `${item.poleMaxUses} uses` : "Unlimited uses");
      } else if (item.fishingType === "bait") {
        if (item.rarityBoostPercent && item.baitRarityBoostStar) {
          lines.push(`+${item.rarityBoostPercent}% Rarity Boost`);
          lines.push(`Targets ${"★".repeat(item.baitRarityBoostStar)} fish`);
        } else if (item.rarityBoostPercent) {
          lines.push(`+${item.rarityBoostPercent}% Rarity Boost`);
        }
        if (item.specialSkill) lines.push(item.specialSkill);
      } else if (item.fishingType === "fish") {
        if (item.rarity) lines.push(`${"★".repeat(item.rarity)} Rarity`);
      }
    } else if (item.type === "pet") {
      if (item.rarity) lines.push(`${"★".repeat(item.rarity)} Rarity`);
      if (item.hatchTime) lines.push(`Hatch time: ${item.hatchTime}h`);
    } else {
      if (item.healthRestored) lines.push(`Restores ${item.healthRestored} HP`);
      if (item.manaRestored) lines.push(`Restores ${item.manaRestored} Mana`);
      if (item.atkBoost) lines.push(`Boosts ATK by ${item.atkBoost}`);
      if (item.defBoost) lines.push(`Boosts DEF by ${item.defBoost}`);
      if (item.healthBoost) lines.push(`Boosts HP by ${item.healthBoost}`);
      if (item.statBoostType && item.statBoostAmount) {
        const label = item.statBoostType === "health" ? "HP" : item.statBoostType === "atk" ? "ATK" : item.statBoostType === "def" ? "DEF" : item.statBoostType === "lvl" ? "Feed pts" : item.statBoostType === "level" ? "Level Points" : item.statBoostType;
        lines.push(`+${item.statBoostAmount} ${label}`);
      }
      if (item.petsRevived) lines.push(`Revives ${item.petsRevived} pet(s)`);
      if (item.specialSkill) lines.push(item.specialSkill);
      if (item.specialType && item.specialAmount) {
        const specialLabel = item.specialType === "level" ? "Level Points" : item.specialType === "hatch_time" ? `Hatching Reduced by ${item.specialAmount}min` : item.specialType;
        if (item.specialType === "hatch_time") lines.push(specialLabel);
        else lines.push(`+${item.specialAmount} ${specialLabel}`);
      }
    }
    return lines;
  };

  if (!world || !worldApiData || !worldBgLoaded || locationsLoading) {
    const loadAccent = world?.accent ?? "#9370db";
    return (
      <div className="w-full h-screen-frame flex flex-col items-center justify-center" style={{ background: "rgba(8,5,20,1)" }}>
        <div
          className="animate-spin rounded-full"
          style={{ width: 48, height: 48, border: `3px solid ${loadAccent}25`, borderTopColor: loadAccent }}
        />
      </div>
    );
  }

  const accent = world.accent;

  return (
    <div
      className="relative w-full h-screen-frame overflow-hidden"
    >
      <style>{`
        @keyframes locFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
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
        @keyframes locGlowPulse {
          0%, 100% { opacity: 0.18; transform: scale(0.80); }
          50% { opacity: 0.62; transform: scale(1.10); }
        }
        @keyframes locGlowRimPulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.80; }
        }
        @keyframes ffloat0 {
          0%,100% { transform: translate(0,0) scale(1); opacity: 0.7; }
          25% { transform: translate(5px,-9px) scale(1.15); opacity: 1; }
          50% { transform: translate(-4px,-14px) scale(0.85); opacity: 0.75; }
          75% { transform: translate(-8px,-4px) scale(1.08); opacity: 0.9; }
        }
        @keyframes ffloat1 {
          0%,100% { transform: translate(0,0) scale(0.88); opacity: 0.55; }
          33% { transform: translate(-8px,-12px) scale(1.18); opacity: 1; }
          66% { transform: translate(6px,-7px) scale(0.92); opacity: 0.7; }
        }
        @keyframes ffloat2 {
          0%,100% { transform: translate(0,0) scale(1); opacity: 0.65; }
          40% { transform: translate(10px,-8px) scale(1.2); opacity: 1; }
          72% { transform: translate(2px,-16px) scale(0.85); opacity: 0.6; }
        }
        @keyframes lightOrbPulse {
          0%, 100% { opacity: 0.72; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes fishBubbleRise {
          0%   { transform: translate3d(0px,0px,0) scale(0.35); opacity: 0; }
          10%  { opacity: 0.55; transform: translate3d(1px,-4px,0) scale(1); }
          40%  { opacity: 0.45; transform: translate3d(-3px,-28px,0) scale(0.92); }
          75%  { opacity: 0.22; transform: translate3d(3px,-62px,0) scale(0.78); }
          100% { transform: translate3d(0px,-90px,0) scale(0.5); opacity: 0; }
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

      <div
        ref={vpRef}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={handleVpPointerDown}
        onPointerMove={handleVpPointerMove}
        onPointerUp={handleVpPointerUp}
        onPointerCancel={handleVpPointerUp}
      >
          <div
            ref={areaRef}
            style={{
              position: "absolute",
              width: MAP_W,
              height: mapH,
              transformOrigin: "0 0",
              transform: `translate(${mapX}px, ${mapY}px) scale(${mapScale})`,
              backgroundImage: committedWorldBg ? `url(${committedWorldBg})` : undefined,
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center top",
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { dragRef.current = null; didDrag.current = false; setDragPos(null); }}
            onClick={() => { if (currentUser.isAdmin) { if (adminLocTapRef.current) { clearTimeout(adminLocTapRef.current.timer); adminLocTapRef.current = null; } setSelectedLocId(null); setSelectedDecorId(null); setBarrelSelected(false); } }}
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
                  fontSize: "clamp(13px, calc(3.6*var(--vw)), 19px)",
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

            {decorPlacements.map(p => {
              const dpos = decorDragPos?.id === p.id ? { x: decorDragPos.x, y: decorDragPos.y } : { x: p.posX, y: p.posY };
              const isPassThrough = PASS_THROUGH_SENTINELS.has(p.imageUrl);
              const isGlowOrb = isPassThrough && p.imageUrl !== FIREFLIES_SENTINEL;
              const isFireflies = p.imageUrl === FIREFLIES_SENTINEL;
              const FF_COUNT = 7;
              const FF_ANIMS = ["ffloat0", "ffloat1", "ffloat2"];
              return (
                <div
                  key={p.id}
                  className="absolute"
                  style={{
                    left: `${dpos.x}%`,
                    top: `${dpos.y}%`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    transform: "translate(-50%, -50%)",
                    zIndex: isPassThrough ? 300 : (decorDragPos?.id === p.id ? 200 : 8),
                    cursor: currentUser.isAdmin ? "grab" : (p.message && !isPassThrough ? "pointer" : "default"),
                    touchAction: currentUser.isAdmin ? "none" : "auto",
                    pointerEvents: (!currentUser.isAdmin && isPassThrough) ? "none" : "auto",
                  }}
                  onPointerDown={(e) => { handleDecorPointerDown(e, p); setSelectedLocId(null); setBarrelSelected(false); }}
                  onPointerMove={handleDecorPointerMove}
                  onPointerUp={handleDecorPointerUp}
                  onPointerCancel={() => { decorDragRef.current = null; decorDidDrag.current = false; setDecorDragPos(null); }}
                  onClick={(e) => {
                    if (!currentUser.isAdmin && p.message && !isPassThrough) {
                      e.stopPropagation();
                      setShowDecorMsg({ text: p.message, clientX: e.clientX, clientY: e.clientY });
                    }
                  }}
                >
                  {/* No selection ring — controls appear as circular buttons around the item */}

                  {isGlowOrb ? (
                    <div style={{
                      width: "100%", height: "100%", borderRadius: "50%",
                      background: getOrbGradient(p.imageUrl),
                      mixBlendMode: "screen",
                      animation: "lightOrbPulse 2.4s ease-in-out infinite",
                      pointerEvents: "none",
                    }} />
                  ) : isFireflies ? (
                    <div style={{ width: "100%", height: "100%", position: "relative", pointerEvents: "none" }}>
                      {Array.from({ length: FF_COUNT }, (_, i) => {
                        const fx = seededRand(p.id, i * 3) * 80 + 10;
                        const fy = seededRand(p.id, i * 3 + 1) * 80 + 10;
                        const fsz = 8 + seededRand(p.id, i * 3 + 2) * 6;
                        const dur = 2.8 + seededRand(p.id, i * 7 + 3) * 2.4;
                        const delay = -(seededRand(p.id, i * 11 + 5) * 3);
                        return (
                          <div key={i} style={{
                            position: "absolute",
                            left: `${fx}%`, top: `${fy}%`,
                            width: 3, height: 3,
                            borderRadius: "50%",
                            background: "rgba(255,252,180,1)",
                            filter: "blur(0.4px)",
                            boxShadow: `0 0 3px 2px rgba(255,248,120,0.95), 0 0 10px 5px rgba(255,220,30,0.55), 0 0 24px 12px rgba(255,190,0,0.25), 0 0 48px 22px rgba(255,160,0,0.09)`,
                            mixBlendMode: "screen",
                            animation: `${FF_ANIMS[i % 3]} ${dur}s ease-in-out ${delay}s infinite`,
                          }} />
                        );
                      })}
                    </div>
                  ) : (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", transform: p.flipped ? "scaleX(-1)" : undefined }}
                    />
                  )}

                  {currentUser.isAdmin && selectedDecorId === p.id && (
                    <div onPointerDown={(e) => e.stopPropagation()} style={{ pointerEvents: "auto" }}>
                      {/* Delete — top-left */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteDecorPlacementMutation.mutate(p.id); setSelectedDecorId(null); }}
                        className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ top: -16, left: -16, background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                        title="Delete placement"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                      {/* Flip — top-right (non-pass-through only) */}
                      {!isPassThrough && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, flipped: !p.flipped }); }}
                          className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ top: -16, right: -16, background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                          title="Flip"
                        >
                          <FlipHorizontal className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                      {/* Shrink — bottom-left */}
                      <button
                        onClick={(e) => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.max(20, p.size - 10) }); }}
                        className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ bottom: -16, left: -16, background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                        title="Shrink"
                      >
                        <Minus className="w-3.5 h-3.5 text-white" />
                      </button>
                      {/* Grow — bottom-right */}
                      <button
                        onClick={(e) => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.min(500, p.size + 10) }); }}
                        className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ bottom: -16, right: -16, background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                        title="Grow"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                      </button>
                      {/* Size label — center-bottom */}
                      <div className="absolute z-30 flex items-center justify-center"
                        style={{ bottom: -22, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,200,50,0.4)", borderRadius: 5, padding: "1px 7px", pointerEvents: "none" }}>
                        <span className="font-fantasy text-[9px] text-yellow-300">{p.size}px</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}


            {/* Fish Barrel */}
            {fishBarrel && (() => {
              const bpos = barrelDragPos ? barrelDragPos : { x: fishBarrel.posX, y: fishBarrel.posY };
              const sz = fishBarrel.size;
              return (
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    left: `${bpos.x}%`,
                    top: `${bpos.y}%`,
                    width: sz,
                    transform: "translate(-50%, -50%)",
                    zIndex: 80,
                    cursor: currentUser.isAdmin ? "grab" : "pointer",
                    touchAction: "none",
                  }}
                  onPointerDown={handleBarrelPointerDown}
                  onPointerMove={handleBarrelPointerMove}
                  onPointerUp={handleBarrelPointerUp}
                  onPointerCancel={() => { barrelDragRef.current = null; barrelDidDrag.current = false; setBarrelDragPos(null); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (barrelDidDrag.current) return;
                    if (currentUser.isAdmin) {
                      setBarrelSelected(prev => !prev);
                      setSelectedDecorId(null);
                      setSelectedLocId(null);
                    } else {
                      setShowSellFish(true);
                    }
                  }}
                  data-testid="button-fish-barrel"
                >
                  <img
                    src={fishBarrelImg}
                    alt="Fish Market"
                    draggable={false}
                    style={{
                      width: sz,
                      height: sz,
                      objectFit: "contain",
                      filter: currentUser.isAdmin && barrelSelected
                        ? "drop-shadow(0 4px 12px rgba(0,0,0,0.6)) drop-shadow(0 0 8px rgba(255,255,255,0.5))"
                        : "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
                      transition: "filter 0.15s ease",
                    }}
                  />
                  {currentUser.isAdmin && barrelSelected && (
                    <div className="flex gap-1 mt-1" onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        data-testid="button-barrel-shrink"
                        onClick={(e) => { e.stopPropagation(); updateBarrelMutation.mutate({ size: Math.max(50, sz - 10) }); }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs"
                        style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.3)" }}
                      >−</button>
                      <button
                        data-testid="button-barrel-grow"
                        onClick={(e) => { e.stopPropagation(); updateBarrelMutation.mutate({ size: Math.min(220, sz + 10) }); }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs"
                        style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.3)" }}
                      >+</button>
                      <button
                        data-testid="button-barrel-delete"
                        onClick={(e) => { e.stopPropagation(); deleteBarrelMutation.mutate(); setBarrelSelected(false); }}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs"
                        style={{ background: "rgba(180,20,20,0.85)", border: "1px solid rgba(255,80,80,0.5)" }}
                      >✕</button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="absolute inset-0">
                {[...locations].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((loc, i) => {
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
                        width: `${loc.iconSize || 300}px`,
                        cursor: currentUser.isAdmin ? "grab" : "pointer",
                        zIndex: isDragging ? 200 : selectedLocId === loc.id ? 150 : (loc.type === "fishing" && !loc.isShop ? 100 + i : 10 + i),
                      }}
                      onPointerDown={(e) => handlePointerDown(e, loc)}
                    >
                      <div className="relative w-full" style={{ aspectRatio: "1", pointerEvents: "none" }}>
                        {/* Pulsing glow orb behind icon — all location types */}
                        {(loc.iconUrl || (loc.type === "fishing" && !loc.isShop)) && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: `radial-gradient(circle, ${glow}45 0%, ${glow}18 45%, transparent 70%)`,
                              animation: `locGlowPulse ${2.6 + (i * 0.31) % 1.2}s ease-in-out infinite`,
                              animationDelay: `${(i * 0.38) % 2.2}s`,
                              borderRadius: "50%",
                              zIndex: 0,
                            }}
                          />
                        )}
                        {(loc.iconUrl || (loc.type === "fishing" && !loc.isShop && worldId === "volcanic")) ? (
                          <div
                            className="w-full h-full"
                            style={loc.type === "fishing" && !loc.isShop ? { animation: "breathe 3s ease-in-out infinite" } : undefined}
                          >
                          <img
                            src={loc.type === "fishing" && !loc.isShop && worldId === "volcanic" ? "/world-assets/icon_fishing_volcanic.png" : loc.iconUrl!}
                            alt={loc.name}
                            className="w-full h-full object-contain relative z-10"
                            draggable={false}
                            style={{
                              filter: loc.type === "fishing" && !loc.isShop
                                ? worldId === "volcanic"
                                  // Tight rim glow: 1–2 px shadow hugs the icon silhouette so
                                  // it reads as a shiny outline rather than a large square bloom.
                                  // Gold inner rim → orange mid → no far spread.
                                  ? "drop-shadow(0 2px 5px rgba(0,0,0,0.65)) drop-shadow(0 0 1.5px rgba(251,191,36,1)) drop-shadow(0 0 5px rgba(251,146,60,0.65))"
                                  : worldId === "swamp"
                                    ? "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1.5px rgba(167,243,208,0.9)) drop-shadow(0 0 5px rgba(45,212,191,0.5))"
                                    : "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1.5px rgba(186,230,253,0.9)) drop-shadow(0 0 5px rgba(56,189,248,0.5))"
                                // Non-fishing location icons (shops, NPCs, etc.) get a subtle
                                // rim using the location's own glow colour so each icon has
                                // a hint of its own identity without a large bloom. Bayou
                                // (swamp) world uses a unified deep-forest-teal rim so the
                                // icons feel of-a-piece with the swamp atmosphere instead
                                // of each shouting its own colour.
                                : worldId === "swamp"
                                  ? "drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(45,138,120,0.85)) drop-shadow(0 0 4px rgba(20,83,75,0.55))"
                                  : `drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 1px ${glow}cc) drop-shadow(0 0 4px ${glow}55)`,
                              transform: loc.flipped ? "scaleX(-1)" : undefined,
                              transition: "filter 0.15s ease, transform 0.15s ease",
                            }}
                          />
                          {/* Glow layer — same img with intense drop-shadow, opacity pulses.
                              drop-shadow follows PNG transparency so only the icon outline glows. */}
                          <img
                            src={loc.type === "fishing" && !loc.isShop && worldId === "volcanic" ? "/world-assets/icon_fishing_volcanic.png" : loc.iconUrl!}
                            aria-hidden
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                            draggable={false}
                            style={{
                              filter: `drop-shadow(0 0 5px ${glow}) drop-shadow(0 0 12px ${glow}bb) drop-shadow(0 0 20px ${glow}66)`,
                              opacity: 0.15,
                              animation: `locGlowRimPulse ${3.0 + (i * 0.41) % 1.6}s ease-in-out infinite`,
                              animationDelay: `${(i * 0.57) % 2.8}s`,
                              zIndex: 11,
                              transform: loc.flipped ? "scaleX(-1)" : undefined,
                            }}
                          />
                          {/* Floating bubbles — fishing spots only (not shop buildings) */}
                          {loc.type === "fishing" && !loc.isShop && (
                            <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none", overflow: "visible" }}>
                              {([
                                { left: "22%", bottom: "26%", size: 5, dur: "5.5s", delay: "0.0s" },
                                { left: "50%", bottom: "20%", size: 6, dur: "5.2s", delay: "2.8s" },
                                { left: "78%", bottom: "30%", size: 4, dur: "6.4s", delay: "1.2s" },
                              ].map((b, bi) => (
                                <div
                                  key={bi}
                                  style={{
                                    position: "absolute",
                                    bottom: b.bottom,
                                    left: b.left,
                                    width: b.size,
                                    height: b.size,
                                    borderRadius: "50%",
                                    background: `radial-gradient(circle at 35% 30%, ${glow}88, ${glow}30)`,
                                    border: `0.5px solid ${glow}55`,
                                    animation: `fishBubbleRise ${b.dur} ease-in-out ${b.delay} infinite`,
                                    willChange: "transform, opacity",
                                    pointerEvents: "none",
                                  }}
                                />
                              )))}
                            </div>
                          )}
                          </div>
                        ) : (
                          <div
                            className="w-full h-full rounded-full flex items-center justify-center relative z-10"
                            style={{
                              background: `radial-gradient(circle at 40% 35%, ${glow}40, ${glow}15)`,
                              border: `1.5px solid ${glow}70`,
                              boxShadow: `0 0 4px ${glow}55, 0 0 8px ${glow}25`,
                            }}
                          >
                            <MapPin className="w-7 h-7" style={{ color: glow, filter: `drop-shadow(0 0 3px ${glow}66)` }} />
                          </div>
                        )}
                        {/* Tight circular hit-zone — only the visible centre of the icon fires clicks */}
                        <div
                          onClick={(e) => { e.stopPropagation(); handleLocationClick(loc); }}
                          style={{
                            position: "absolute",
                            top: "20%", left: "20%", right: "20%", bottom: "20%",
                            borderRadius: "50%",
                            pointerEvents: "auto",
                            cursor: currentUser.isAdmin ? "grab" : "pointer",
                            zIndex: 20,
                          }}
                        />

                        {currentUser.isAdmin && selectedLocId === loc.id && (
                          <div style={{ pointerEvents: "auto" }}>
                            <button
                              data-testid={`button-edit-location-${loc.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLocation(loc);
                                setEditLocName(loc.name);
                                setEditLocDesc(loc.description || "");
                                setEditLocIcon(null);
                                setEditLocBg(null);
                                setEditLocOwner(null);
                                setEditLocType(loc.isShop ? "shop" : (loc.type || "battle"));
                                setEditLocGlowColor(loc.glowColor || "");
                              }}
                              className="absolute -top-5 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(45,106,79,0.95)", border: "2px solid rgba(127,255,212,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                            >
                              <Pencil className="w-5 h-5 text-white" />
                            </button>
                            <button
                              data-testid={`button-flip-location-${loc.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); flipMutation.mutate(loc.id); }}
                              className="absolute -bottom-5 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                            >
                              <FlipHorizontal className="w-5 h-5 text-white" />
                            </button>
                            <button
                              data-testid={`button-delete-location-${loc.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${loc.name}"?`)) { deleteLocationMutation.mutate(loc.id); } }}
                              className="absolute -top-5 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                            >
                              <Trash2 className="w-5 h-5 text-white" />
                            </button>
                            <button
                              data-testid={`button-size-down-location-${loc.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); const next = Math.max(64, (loc.iconSize || 300) - 10); iconSizeMutation.mutate({ locationId: loc.id, iconSize: next }); }}
                              className="absolute -bottom-5 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                            >
                              <Minus className="w-5 h-5 text-white" />
                            </button>
                            {loc.type === "fishing" && (
                              <button
                                data-testid={`button-duplicate-location-${loc.id}`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); duplicateLocationMutation.mutate(loc.id); }}
                                className="absolute top-1/2 -left-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ transform: "translateY(-50%)", background: "rgba(80,0,140,0.95)", border: "2px solid rgba(180,100,255,0.8)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                              >
                                <Copy className="w-5 h-5 text-white" />
                              </button>
                            )}
                            <div
                              className="absolute z-30 flex items-center justify-center"
                              style={{ bottom: "-28px", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,200,50,0.5)", borderRadius: "6px", padding: "2px 8px", pointerEvents: "none" }}
                            >
                              <span className="font-fantasy text-xs text-yellow-300">{loc.iconSize || 300}px</span>
                            </div>
                            <button
                              data-testid={`button-size-up-location-${loc.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); const next = Math.min(900, (loc.iconSize || 300) + 10); iconSizeMutation.mutate({ locationId: loc.id, iconSize: next }); }}
                              className="absolute top-1/2 -right-5 z-30 w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ transform: "translateY(-50%)", background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                            >
                              <Plus className="w-5 h-5 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Fish-hint arrows ────────────────────────────────────────
                  Bright green floating arrows pointing to every fishing spot.
                  Only shown when the player arrives via the Gone Fishing quest
                  shortcut (?fishHint=1). Tap anywhere to dismiss.            */}
              {showFishHint && worldId === "swamp" && (() => {
                const fishingSpots = locations.filter(l => l.type === "fishing" && !l.isShop);
                if (fishingSpots.length === 0) return null;
                return (
                  <>
                    {/* Full-screen dismiss layer */}
                    <div
                      className="absolute inset-0"
                      style={{ zIndex: 498, cursor: "pointer" }}
                      onClick={() => setShowFishHint(false)}
                    />
                    {fishingSpots.map((spot, si) => {
                      const sz = spot.iconSize || 300;
                      const cx = `calc(${spot.posX}% + ${sz / 2}px)`;
                      const cy = `calc(${spot.posY}% - 12px)`;
                      return (
                        <div
                          key={`fh-${spot.id}`}
                          className="absolute pointer-events-none"
                          style={{
                            left: cx,
                            top: cy,
                            transform: "translate(-50%, -100%)",
                            zIndex: 499,
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          {/* Glowing orbs drifting around the arrow */}
                          <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "rgba(74,222,128,0.95)", boxShadow: "0 0 8px rgba(34,197,94,1), 0 0 18px rgba(34,197,94,0.8)", animation: `hintOrb1 2.4s ease-in-out ${si * 0.3}s infinite` }} />
                          <span style={{ position: "absolute", width: 5, height: 5, borderRadius: "50%", background: "rgba(134,239,172,0.9)", boxShadow: "0 0 6px rgba(74,222,128,1), 0 0 14px rgba(34,197,94,0.7)", animation: `hintOrb2 2.1s ease-in-out ${si * 0.3 + 0.5}s infinite` }} />
                          <span style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: "rgba(187,247,208,0.85)", boxShadow: "0 0 5px rgba(74,222,128,0.9), 0 0 10px rgba(34,197,94,0.6)", animation: `hintOrb3 1.8s ease-in-out ${si * 0.3 + 1.0}s infinite` }} />
                          <img
                            src={tutorialArrow}
                            alt=""
                            style={{
                              width: 44, height: 56, objectFit: "contain",
                              animation: `fishHintFloat 1.2s ease-in-out ${si * 0.2}s infinite`,
                              filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))",
                            }}
                          />
                        </div>
                      );
                    })}
                    <style>{`
                      @keyframes fishHintFloat {
                        0%, 100% { transform: translateY(0px); }
                        50%       { transform: translateY(12px); }
                      }
                      @keyframes hintOrb1 {
                        0%   { transform: translate(-22px, 10px);  opacity: 0.8; }
                        33%  { transform: translate(20px, -14px);  opacity: 1;   }
                        66%  { transform: translate(8px, 22px);    opacity: 0.6; }
                        100% { transform: translate(-22px, 10px);  opacity: 0.8; }
                      }
                      @keyframes hintOrb2 {
                        0%   { transform: translate(20px, -8px);   opacity: 0.7; }
                        33%  { transform: translate(-18px, 16px);  opacity: 1;   }
                        66%  { transform: translate(-8px, -22px);  opacity: 0.8; }
                        100% { transform: translate(20px, -8px);   opacity: 0.7; }
                      }
                      @keyframes hintOrb3 {
                        0%   { transform: translate(2px, -24px);   opacity: 0.9; }
                        33%  { transform: translate(-24px, 6px);   opacity: 0.6; }
                        66%  { transform: translate(20px, 16px);   opacity: 1;   }
                        100% { transform: translate(2px, -24px);   opacity: 0.9; }
                      }
                    `}</style>
                  </>
                );
              })()}

              {/* ── Molten Blocks hint arrow — ?moltenHint=1 from quest Go button ── */}
              {showMoltenHint && worldId === "volcanic" && (() => {
                const moltenLoc = locations.find(l => l.id === "c3d4e5f6-0005-4000-8000-000000000005");
                if (!moltenLoc) return null;
                const sz = (moltenLoc as any).iconSize || 120;
                const cx = `calc(${moltenLoc.posX}% + ${sz / 2}px)`;
                const cy = `calc(${moltenLoc.posY}% - 10px)`;
                return (
                  <>
                    <div className="absolute inset-0" style={{ zIndex: 498, cursor: "pointer" }} onClick={() => setShowMoltenHint(false)} />
                    <div className="absolute pointer-events-none" style={{ left: cx, top: cy, transform: "translate(-50%, -100%)", zIndex: 499, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "rgba(251,191,36,0.95)", boxShadow: "0 0 8px rgba(245,158,11,1), 0 0 18px rgba(245,158,11,0.8)", animation: "hintOrb1 2.4s ease-in-out infinite" }} />
                      <span style={{ position: "absolute", width: 5, height: 5, borderRadius: "50%", background: "rgba(253,230,138,0.9)", boxShadow: "0 0 6px rgba(251,191,36,1), 0 0 14px rgba(245,158,11,0.7)", animation: "hintOrb2 2.1s ease-in-out 0.5s infinite" }} />
                      <span style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: "rgba(254,243,199,0.85)", boxShadow: "0 0 5px rgba(251,191,36,0.9), 0 0 10px rgba(245,158,11,0.6)", animation: "hintOrb3 1.8s ease-in-out 1s infinite" }} />
                      <div style={{ animation: "fishHintFloat 1.2s ease-in-out infinite", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ background: "rgba(8,4,0,0.88)", border: "1.5px solid rgba(251,191,36,0.7)", borderRadius: 8, padding: "5px 12px", marginBottom: 6, boxShadow: "0 0 14px rgba(245,158,11,0.4), 0 4px 10px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "Lora, serif", color: "#fde68a", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>Molten Blocks</span>
                        </div>
                        <img src={tutorialArrow} alt="" style={{ width: 44, height: 56, objectFit: "contain", filter: "hue-rotate(-30deg) saturate(1.5) drop-shadow(0 0 10px rgba(240,100,10,0.95)) drop-shadow(0 0 24px rgba(240,100,10,0.6))" }} />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── Barrel hint arrow — ?barrelHint=1 from sell_fish quest Go button ── */}
              {showBarrelHint && fishBarrel && worldId === "swamp" && (() => {
                const bpos = barrelDragPos ? barrelDragPos : { x: fishBarrel.posX, y: fishBarrel.posY };
                const cx = `${bpos.x}%`;
                const cy = `${bpos.y}%`;
                return (
                  <>
                    <div className="absolute inset-0" style={{ zIndex: 498, cursor: "pointer" }} onClick={() => setShowBarrelHint(false)} />
                    <div className="absolute pointer-events-none" style={{ left: cx, top: cy, transform: "translate(-50%, -100%) translateY(-16px)", zIndex: 499, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "rgba(74,222,128,0.95)", boxShadow: "0 0 8px rgba(34,197,94,1), 0 0 18px rgba(34,197,94,0.8)", animation: "hintOrb1 2.4s ease-in-out infinite" }} />
                      <span style={{ position: "absolute", width: 5, height: 5, borderRadius: "50%", background: "rgba(134,239,172,0.9)", boxShadow: "0 0 6px rgba(74,222,128,1), 0 0 14px rgba(34,197,94,0.7)", animation: "hintOrb2 2.1s ease-in-out 0.5s infinite" }} />
                      <span style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: "rgba(187,247,208,0.85)", boxShadow: "0 0 5px rgba(74,222,128,0.9), 0 0 10px rgba(34,197,94,0.6)", animation: "hintOrb3 1.8s ease-in-out 1s infinite" }} />
                      <div style={{ animation: "fishHintFloat 1.2s ease-in-out infinite", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ background: "rgba(8,22,8,0.94)", border: "1.5px solid rgba(74,222,128,0.7)", borderRadius: 8, padding: "5px 12px", marginBottom: 6, boxShadow: "0 0 14px rgba(34,197,94,0.4), 0 4px 10px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "Lora, serif", color: "#86efac", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>Sell Fish Here</span>
                        </div>
                        <img src={tutorialArrow} alt="" style={{ width: 44, height: 56, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))" }} />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── Shop hint arrow — shown when ?shopHint=<locationId> is in URL ──
                  Navigating from the "Buy Edibles" quest hint lands here first so
                  the player can see WHICH shop to enter before it auto-opens.     */}
              {showShopHint && (() => {
                const hintLoc = locations.find(l => l.id === showShopHint);
                if (!hintLoc) return null;
                const sz = (hintLoc as any).iconSize || 120;
                const cx = `calc(${hintLoc.posX}% + ${sz / 2}px)`;
                const cy = `calc(${hintLoc.posY}% - 10px)`;
                return (
                  <>
                    {/* Dismiss layer */}
                    <div
                      className="absolute inset-0"
                      style={{ zIndex: 498, cursor: "pointer" }}
                      onClick={() => setShowShopHint(null)}
                    />
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: cx,
                        top: cy,
                        transform: "translate(-50%, -100%)",
                        zIndex: 499,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      {/* Glowing orbs drifting around the arrow */}
                      <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "rgba(74,222,128,0.95)", boxShadow: "0 0 8px rgba(34,197,94,1), 0 0 18px rgba(34,197,94,0.8)", animation: "hintOrb1 2.4s ease-in-out infinite" }} />
                      <span style={{ position: "absolute", width: 5, height: 5, borderRadius: "50%", background: "rgba(134,239,172,0.9)", boxShadow: "0 0 6px rgba(74,222,128,1), 0 0 14px rgba(34,197,94,0.7)", animation: "hintOrb2 2.1s ease-in-out 0.5s infinite" }} />
                      <span style={{ position: "absolute", width: 4, height: 4, borderRadius: "50%", background: "rgba(187,247,208,0.85)", boxShadow: "0 0 5px rgba(74,222,128,0.9), 0 0 10px rgba(34,197,94,0.6)", animation: "hintOrb3 1.8s ease-in-out 1.0s infinite" }} />
                      {/* Label + arrow bob together */}
                      <div style={{ animation: "fishHintFloat 1.2s ease-in-out infinite", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{
                          background: "rgba(8,22,8,0.94)",
                          border: "1.5px solid rgba(74,222,128,0.7)",
                          borderRadius: 8,
                          padding: "5px 12px",
                          marginBottom: 6,
                          boxShadow: "0 0 14px rgba(34,197,94,0.4), 0 4px 10px rgba(0,0,0,0.7)",
                          whiteSpace: "nowrap",
                        }}>
                          <span style={{ fontFamily: "Lora, serif", color: "#86efac", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                            {hintLoc.name}
                          </span>
                        </div>
                        <img src={tutorialArrow} alt="" style={{ width: 44, height: 56, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(212,168,67,0.95)) drop-shadow(0 0 24px rgba(212,168,67,0.6))" }} />
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
        </div>

      <button
        data-testid="button-back-to-map"
        onClick={() => navigate("/map")}
        className="fixed z-30 font-fantasy text-sm tracking-[0.15em] transition-transform active:scale-95 px-4 py-2 rounded-lg"
        style={{
          bottom: "24px",
          left: 16,
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
        <div className="fixed z-30 flex items-center gap-2"
          style={{ bottom: "82px", right: 16 }}
        >
          <button
            data-testid="button-world-decor"
            onClick={() => { setShowDecorPanel(true); }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: "linear-gradient(135deg, #9b5de5cc 0%, #9b5de588 100%)",
              border: "2px solid #9b5de5",
              boxShadow: "0 4px 20px #9b5de560, 0 0 30px #9b5de535",
              cursor: "pointer",
            }}
            title="World Decor"
          >
            <Palette className="w-4 h-4 text-white" />
          </button>
          <button
            data-testid="button-add-fishing-spot"
            onClick={() => addFishingSpotMutation.mutate()}
            disabled={addFishingSpotMutation.isPending}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: "linear-gradient(135deg, #3dc7c0cc 0%, #3dc7c088 100%)",
              border: "2px solid #3dc7c0",
              boxShadow: "0 4px 20px #3dc7c060, 0 0 30px #3dc7c035",
              cursor: "pointer",
            }}
            title="Add fishing spot"
          >
            <Waves className="w-4 h-4 text-black" />
          </button>
          <button
            data-testid="button-toggle-fish-barrel"
            onClick={() => fishBarrel ? deleteBarrelMutation.mutate() : createBarrelMutation.mutate()}
            disabled={createBarrelMutation.isPending || deleteBarrelMutation.isPending}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 text-base"
            style={{
              background: fishBarrel ? "linear-gradient(135deg, rgba(180,20,20,0.85), rgba(120,10,10,0.85))" : "linear-gradient(135deg, rgba(180,130,40,0.85), rgba(140,90,20,0.85))",
              border: fishBarrel ? "2px solid rgba(255,80,80,0.6)" : "2px solid rgba(220,160,50,0.6)",
              boxShadow: fishBarrel ? "0 4px 12px rgba(200,20,20,0.4)" : "0 4px 12px rgba(200,150,40,0.4)",
              cursor: "pointer",
            }}
            title={fishBarrel ? "Remove Fish Market" : "Add Fish Market"}
          >
            <img src={fishBarrelImg} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          </button>
          <button
            data-testid="button-add-location"
            onClick={() => setShowAddLocation(true)}
            className="w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}88 100%)`,
              border: `2px solid ${accent}`,
              boxShadow: `0 4px 25px ${accent}60, 0 0 40px ${accent}35`,
              cursor: "pointer",
            }}
          >
            <Plus className="w-7 h-7 text-black" />
          </button>
        </div>
      )}

      {showAddLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="overlay-add-location-backdrop" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowAddLocation(false)} />
          <div
            data-testid="modal-add-location"
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5 max-h-[calc(85*var(--vh))] overflow-y-auto"
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

      {/* Drag-from-panel ghost */}
      {panelDragGhost && (
        <div
          style={{
            position: "fixed",
            left: panelDragGhost.clientX - 32,
            top: panelDragGhost.clientY - 32,
            width: 64,
            height: 64,
            pointerEvents: "none",
            zIndex: 9999,
            opacity: 0.85,
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.7))",
            transform: "scale(1.1)",
          }}
        >
          {PASS_THROUGH_SENTINELS.has(panelDragGhost.item.imageUrl) ? (
            panelDragGhost.item.imageUrl === FIREFLIES_SENTINEL ? (
              <div style={{ width: "100%", height: "100%", position: "relative" }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    position: "absolute",
                    left: `${[20,55,35,70][i]}%`, top: `${[35,20,65,50][i]}%`,
                    width: 3, height: 3, borderRadius: "50%",
                    background: "rgba(255,252,180,1)",
                    filter: "blur(0.4px)",
                    boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 10px 5px rgba(255,220,30,0.55), 0 0 22px 10px rgba(255,190,0,0.25)",
                  }} />
                ))}
              </div>
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: getOrbGradient(panelDragGhost.item.imageUrl) }} />
            )
          ) : (
            <img src={panelDragGhost.item.imageUrl} alt={panelDragGhost.item.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          )}
        </div>
      )}

      {/* World Decor Panel */}
      {showDecorPanel && (
        <div
          className="fixed z-40 flex flex-col"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "calc(60*var(--vh))",
            background: "linear-gradient(180deg, rgba(8,5,18,0.97) 0%, rgba(15,8,28,0.99) 100%)",
            borderTop: `1.5px solid ${accent}50`,
            borderLeft: `1.5px solid ${accent}30`,
            borderRight: `1.5px solid ${accent}30`,
            borderRadius: "16px 16px 0 0",
            boxShadow: `0 -8px 40px rgba(0,0,0,0.7), 0 0 40px ${accent}15`,
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${accent}25` }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 12px ${accent}50` }}>
              World Decor
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-decor-item"
                onClick={() => setShowAddDecorForm(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: `linear-gradient(135deg, ${accent}50 0%, ${accent}30 100%)`,
                  border: `1.5px solid ${accent}80`,
                  cursor: "pointer",
                }}
                title="Add custom decor item"
              >
                <Plus className="w-4 h-4" style={{ color: accent }} />
              </button>
              <button
                onClick={() => { setShowDecorPanel(false); setShowAddDecorForm(false); }}
                style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
              >
                <X className="w-5 h-5" style={{ color: `${accent}88` }} />
              </button>
            </div>
          </div>
          {/* Light decor quick-add row */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${accent}18` }}>
            <span className="font-fantasy text-[9px] tracking-wider shrink-0" style={{ color: `${accent}66` }}>Light:</span>
            {([
              { label: "Warm", sentinel: LIGHT_ORB_SENTINEL, bg: "radial-gradient(circle, rgba(255,220,100,0.75) 0%, rgba(255,150,0,0.4) 55%, transparent 80%)", border: "rgba(255,200,80,0.7)" },
              { label: "Blue", sentinel: LIGHT_ORB_BLUE_SENTINEL, bg: "radial-gradient(circle, rgba(120,190,255,0.75) 0%, rgba(60,120,255,0.4) 55%, transparent 80%)", border: "rgba(100,170,255,0.7)" },
              { label: "Green", sentinel: LIGHT_ORB_GREEN_SENTINEL, bg: "radial-gradient(circle, rgba(120,255,170,0.75) 0%, rgba(50,200,90,0.4) 55%, transparent 80%)", border: "rgba(80,230,130,0.7)" },
              { label: "Purple", sentinel: LIGHT_ORB_PURPLE_SENTINEL, bg: "radial-gradient(circle, rgba(210,130,255,0.75) 0%, rgba(150,60,230,0.4) 55%, transparent 80%)", border: "rgba(190,100,255,0.7)" },
            ] as const).map(({ label, sentinel, bg, border }) => (
              <button
                key={sentinel}
                onClick={() => addDecorItemMutation.mutate({ name: `${label} Orb`, imageUrl: sentinel })}
                className="transition-transform active:scale-90"
                style={{ width: 26, height: 26, borderRadius: "50%", background: bg, border: `1.5px solid ${border}`, cursor: "pointer", flexShrink: 0 }}
                title={`Add ${label} light orb`}
              />
            ))}
            <button
              onClick={() => addDecorItemMutation.mutate({ name: "Fireflies", imageUrl: FIREFLIES_SENTINEL })}
              className="transition-transform active:scale-90"
              style={{
                width: 36, height: 26, borderRadius: 8,
                background: "rgba(30,30,10,0.85)", border: "1.5px solid rgba(255,220,0,0.45)",
                cursor: "pointer", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Add fireflies cluster"
            >
              {[0,1,2].map(i => (
                <div key={i} style={{
                  position: "absolute",
                  left: `${[28,52,38][i]}%`, top: `${[40,25,62][i]}%`,
                  width: 3, height: 3, borderRadius: "50%",
                  background: "rgba(255,252,180,1)",
                  filter: "blur(0.4px)",
                  boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.6), 0 0 16px 7px rgba(255,190,0,0.25)",
                }} />
              ))}
            </button>
          </div>

          {/* Edit decor item form */}
          {editingDecorItem && (
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${accent}20`, background: "rgba(0,0,0,0.55)" }}>
              <p className="font-fantasy text-[10px] tracking-wider mb-2" style={{ color: `${accent}aa` }}>Edit Decor Item</p>
              <div className="flex gap-3 mb-2 items-center">
                <img
                  src={editDecorImage ?? editingDecorItem.imageUrl}
                  alt="Preview"
                  className="w-12 h-12 object-contain rounded-lg shrink-0"
                  style={{ border: `1px solid ${accent}30` }}
                />
                <div className="flex flex-col gap-1.5 flex-1">
                  <input
                    type="text"
                    placeholder="Name..."
                    value={editDecorName}
                    onChange={(e) => setEditDecorName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md font-fantasy text-xs"
                    style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  />
                  <input
                    type="text"
                    placeholder="Click message for players... (optional)"
                    value={editDecorMessage}
                    onChange={(e) => setEditDecorMessage(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md font-fantasy text-xs"
                    style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${accent}35`, color: "#e8ddd0", outline: "none" }}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <span className="font-fantasy text-[9px]" style={{ color: `${accent}88` }}>Replace Photo:</span>
                <input
                  type="file"
                  accept="image/png,image/gif,image/webp"
                  className="text-xs font-fantasy"
                  style={{ color: `${accent}cc` }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) { const dataUrl = await readFileAsDataUrl(file); setEditDecorImage(dataUrl); }
                  }}
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingDecorItem(null); setEditDecorName(""); setEditDecorMessage(""); setEditDecorImage(null); }}
                  className="flex-1 py-1.5 rounded-md font-fantasy text-xs"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${accent}25`, color: `${accent}88`, cursor: "pointer" }}
                >Cancel</button>
                <button
                  onClick={() => {
                    if (!editDecorName.trim()) return;
                    updateDecorItemMutation.mutate({
                      id: editingDecorItem.id,
                      name: editDecorName.trim(),
                      imageUrl: editDecorImage ?? undefined,
                      message: editDecorMessage.trim() || null,
                    });
                  }}
                  disabled={!editDecorName.trim() || updateDecorItemMutation.isPending}
                  className="flex-1 py-1.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${accent}40 0%, ${accent}20 100%)`,
                    border: `1px solid ${accent}60`,
                    color: accent,
                    cursor: "pointer",
                  }}
                >
                  {updateDecorItemMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {showAddDecorForm && (
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${accent}20` }}>
              <p className="font-fantasy text-[10px] tracking-wider mb-2" style={{ color: `${accent}aa` }}>New Decor Item</p>
              <div className="flex gap-2 mb-2">
                <input
                  data-testid="input-decor-item-name"
                  type="text"
                  placeholder="Name..."
                  value={newDecorName}
                  onChange={(e) => setNewDecorName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-md font-fantasy text-xs"
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: `1px solid ${accent}35`,
                    color: "#e8ddd0",
                    outline: "none",
                  }}
                />
              </div>
              <input
                data-testid="input-decor-item-image"
                type="file"
                accept="image/png,image/gif,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const dataUrl = await readFileAsDataUrl(file);
                    setNewDecorImage(dataUrl);
                  }
                }}
                className="w-full text-xs font-fantasy mb-2"
                style={{ color: `${accent}cc` }}
              />
              {newDecorImage && (
                <div className="mb-2 flex justify-center">
                  <img src={newDecorImage} alt="Preview" className="w-14 h-14 object-contain rounded-lg" style={{ border: `1px solid ${accent}30` }} />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddDecorForm(false); setNewDecorName(""); setNewDecorImage(""); }}
                  className="flex-1 py-1.5 rounded-md font-fantasy text-xs"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${accent}25`, color: `${accent}88`, cursor: "pointer" }}
                >Cancel</button>
                <button
                  data-testid="button-save-decor-item"
                  onClick={() => {
                    if (!newDecorName.trim() || !newDecorImage) return;
                    addDecorItemMutation.mutate({ name: newDecorName.trim(), imageUrl: newDecorImage });
                  }}
                  disabled={!newDecorName.trim() || !newDecorImage || addDecorItemMutation.isPending}
                  className="flex-1 py-1.5 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${accent}40 0%, ${accent}20 100%)`,
                    border: `1px solid ${accent}60`,
                    color: accent,
                    cursor: "pointer",
                  }}
                >
                  {addDecorItemMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Decor item grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {decorItems.length === 0 ? (
              <p className="text-center font-fantasy text-xs py-6" style={{ color: `${accent}55` }}>
                No decor items yet.<br />Tap + to add one.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {decorItems.map(item => (
                  <div
                    key={item.id}
                    className="relative flex flex-col items-center gap-1 rounded-lg p-2 select-none"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${accent}25`,
                      cursor: "grab",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      panelDragRef.current = { item: { id: item.id, name: item.name, imageUrl: item.imageUrl } };
                      setPanelDragGhost({ clientX: e.clientX, clientY: e.clientY, item: { id: item.id, name: item.name, imageUrl: item.imageUrl } });
                    }}
                  >
                    {PASS_THROUGH_SENTINELS.has(item.imageUrl) ? (
                      item.imageUrl === FIREFLIES_SENTINEL ? (
                        <div style={{ width: 56, height: 56, background: "rgba(10,10,10,0.75)", borderRadius: 8, position: "relative", flexShrink: 0 }}>
                          {[0,1,2,3,4].map(i => (
                            <div key={i} style={{
                              position: "absolute",
                              left: `${[22,50,30,65,42][i]}%`, top: `${[38,20,60,45,75][i]}%`,
                              width: 3, height: 3, borderRadius: "50%",
                              background: "rgba(255,252,180,1)",
                              filter: "blur(0.4px)",
                              boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.55), 0 0 18px 8px rgba(255,190,0,0.22)",
                            }} />
                          ))}
                        </div>
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: getOrbGradient(item.imageUrl), flexShrink: 0 }} />
                      )
                    ) : (
                      <img src={item.imageUrl} alt={item.name} className="w-14 h-14 object-contain" draggable={false} />
                    )}
                    <span className="font-fantasy text-[9px] tracking-wider text-center leading-tight" style={{ color: `${accent}cc` }}>
                      {item.name}
                    </span>
                    <span className="font-fantasy text-[8px]" style={{ color: `${accent}55` }}>drag to place</span>
                    {/* Edit button — top-left */}
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDecorItem({ id: item.id, name: item.name, imageUrl: item.imageUrl });
                        setEditDecorName(item.name);
                        setEditDecorMessage("");
                        setEditDecorImage(null);
                      }}
                      style={{
                        position: "absolute", top: 4, left: 4,
                        width: 16, height: 16, borderRadius: "50%",
                        background: "rgba(20,120,60,0.9)",
                        border: "1px solid rgba(80,200,100,0.7)",
                        cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        lineHeight: 1,
                      }}
                      title="Edit decor item"
                    >
                      <Pencil style={{ width: 8, height: 8, color: "white" }} />
                    </button>
                    {/* Delete button — top-right */}
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); deleteDecorItemMutation.mutate(item.id); }}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        width: 16, height: 16, borderRadius: "50%",
                        background: "rgba(220,38,38,0.85)",
                        border: "1px solid rgba(255,100,100,0.7)",
                        cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: "white", fontWeight: "bold",
                        lineHeight: 1,
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingLocation(null)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-xl p-5 max-h-[calc(85*var(--vh))] overflow-y-auto"
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
        const sortedItems = [...items].sort((a, b) => a.price - b.price);
        const isFishingShop = activeLoc?.type === "fishing";
        const isVolcanicFishing = isFishingShop && worldId === "volcanic";
        const isVolcanicShop = worldId === "volcanic" && !isFishingShop;
        const isCentralMarket = worldId === "pet_world";
        const volcanicShopBg = (() => {
          const id = activeLoc?.id ?? "";
          if (id === "c3d4e5f6-0003-4000-8000-000000000003") return bgShopForgeFang;
          if (id === "c3d4e5f6-0004-4000-8000-000000000004") return bgShopBookshopVolcanic;
          if (id === "c3d4e5f6-0006-4000-8000-000000000006") return bgShopFoodVolcanic;
          return bgShopVolcanicPets;
        })();
        const isSwampFishing = isFishingShop && worldId === "swamp";
        const shopBg = isFishingShop
          ? (isVolcanicFishing ? bgShopVolcanic : isSwampFishing ? bgShopBayou : bgShopFishing)
          : isCentralMarket ? bgShopCentralMarket
          : isVolcanicShop ? volcanicShopBg
          : worldId === "swamp"
            ? (activeLoc?.id === "a1b2c3d4-0010-4000-8000-000000000010" ? bgShopFoodSwamp : bgShopBayou)
            : bgShopMystical;
        return (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, background: isCentralMarket ? "#08060a" : (isVolcanicFishing || isVolcanicShop) ? "#0d0502" : "#080510", overflow: "hidden" }}>
          {/* Themed background image — fixed, not admin-uploaded */}
          <img src={shopBg} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: 0, opacity: (isVolcanicFishing || isVolcanicShop) ? 0.45 : 0.55 }} />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: (isVolcanicFishing || isVolcanicShop) ? "linear-gradient(180deg, rgba(10,3,2,0.88) 0%, rgba(18,6,3,0.62) 40%, rgba(10,3,2,0.82) 100%)" : isFishingShop ? "linear-gradient(180deg, rgba(2,10,6,0.86) 0%, rgba(4,14,8,0.60) 40%, rgba(2,10,5,0.80) 100%)" : isCentralMarket ? "linear-gradient(180deg, rgba(6,4,10,0.82) 0%, rgba(10,7,18,0.55) 40%, rgba(6,4,12,0.72) 100%)" : "linear-gradient(180deg, rgba(4,2,14,0.82) 0%, rgba(8,4,22,0.55) 40%, rgba(6,3,18,0.72) 100%)" }} />
          {/* Subtle accent shimmer at top */}
          <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none" style={{ zIndex: 2, background: (isVolcanicFishing || isVolcanicShop) ? "linear-gradient(180deg, rgba(180,60,20,0.28) 0%, transparent 100%)" : isFishingShop ? "linear-gradient(180deg, rgba(40,120,60,0.18) 0%, transparent 100%)" : `linear-gradient(180deg, ${accent}18 0%, transparent 100%)` }} />
          {/* Lava ember particles for volcanic fishing shop */}
          {isVolcanicFishing && (
            <>
              <style>{`
                @keyframes lavaSpark1 {
                  0%   { transform: translate(0,0) scale(1); opacity: 0; }
                  10%  { opacity: 0.9; }
                  80%  { opacity: 0.4; }
                  100% { transform: translate(8px,-60px) scale(0.3); opacity: 0; }
                }
                @keyframes lavaSpark2 {
                  0%   { transform: translate(0,0) scale(0.8); opacity: 0; }
                  15%  { opacity: 0.85; }
                  75%  { opacity: 0.3; }
                  100% { transform: translate(-10px,-72px) scale(0.2); opacity: 0; }
                }
                @keyframes lavaSpark3 {
                  0%   { transform: translate(0,0) scale(1.1); opacity: 0; }
                  12%  { opacity: 0.95; }
                  85%  { opacity: 0.35; }
                  100% { transform: translate(5px,-55px) scale(0.25); opacity: 0; }
                }
                @keyframes lavaGlow {
                  0%,100% { opacity: 0.3; transform: scale(1); }
                  50%     { opacity: 0.7; transform: scale(1.3); }
                }
              `}</style>
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                <div style={{ position: "absolute", left: "15%", bottom: "28%", width: 6, height: 6, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,180,50,0.95) 0%, rgba(255,80,10,0.4) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark1 4.2s ease-out 0s infinite" }} />
                <div style={{ position: "absolute", left: "38%", bottom: "22%", width: 4, height: 4, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,80,0.9) 0%, rgba(255,100,20,0.35) 60%, transparent 80%)", filter: "blur(0.8px)", animation: "lavaSpark2 5.1s ease-out 1.4s infinite" }} />
                <div style={{ position: "absolute", left: "62%", bottom: "30%", width: 5, height: 5, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,160,30,0.95) 0%, rgba(240,60,10,0.4) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark3 3.8s ease-out 2.7s infinite" }} />
                <div style={{ position: "absolute", left: "80%", bottom: "20%", width: 3, height: 3, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,220,100,0.9) 0%, rgba(255,120,30,0.3) 65%, transparent 80%)", filter: "blur(0.6px)", animation: "lavaSpark1 6.3s ease-out 0.8s infinite" }} />
                <div style={{ position: "absolute", left: "25%", bottom: "15%", width: 5, height: 5, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,140,20,0.9) 0%, rgba(220,50,5,0.35) 60%, transparent 80%)", filter: "blur(1px)", animation: "lavaSpark2 4.7s ease-out 3.5s infinite" }} />
                <div style={{ position: "absolute", left: "50%", bottom: "10%", width: 60, height: 60, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,80,10,0.18) 0%, rgba(200,40,5,0.06) 55%, transparent 75%)", filter: "blur(16px)", animation: "lavaGlow 5s ease-in-out infinite 1s" }} />
                <div style={{ position: "absolute", left: "20%", bottom: "5%", width: 50, height: 50, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,120,20,0.15) 0%, rgba(180,40,5,0.05) 55%, transparent 75%)", filter: "blur(14px)", animation: "lavaGlow 7s ease-in-out infinite 3s" }} />
              </div>
            </>
          )}

          {/* ── Header ─────────────────────────────────────── */}
          <div className="relative flex items-center justify-between px-4 pb-3 flex-shrink-0" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 72px)", zIndex: 10 }}>
            <div className="flex items-center gap-2.5">
              {activeLoc?.iconUrl && (
                <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-xl object-contain" style={{ border: `1.5px solid ${accent}50`, boxShadow: `0 0 12px ${accent}30` }} />
              )}
              <div>
                <h3 className="font-fantasy text-base tracking-widest font-semibold" style={{ color: accent, textShadow: `0 0 14px ${accent}60` }} data-testid="text-shop-name">
                  {shopName}
                </h3>
                <div className="flex items-center gap-1">
                  <img src={coinIconImg} alt="" className="w-3 h-3 object-contain" />
                  <span className="font-fantasy text-[11px]" style={{ color: `${accent}cc` }}>{currentUser.coins} coins</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentUser.isAdmin && (
                <button
                  data-testid="button-add-shop-item"
                  onClick={() => { setShowItemPicker(true); refetchAllShopItems(); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                  style={{ background: `${accent}35`, border: `2px solid ${accent}70`, color: accent, cursor: "pointer", boxShadow: `0 0 10px ${accent}25` }}
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
              <button
                data-testid="button-close-shop"
                onClick={() => { setShowShop(false); setShowItemPicker(false); setSelectedShopItem(null); }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}40`, color: accent, cursor: "pointer" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── Volcanic Fishing Shop NPC ─────────────────────── */}
          {isVolcanicFishing && (
            <div className="relative flex-shrink-0 flex flex-col items-center px-4 pb-1" style={{ zIndex: 10 }}>
              {/* aspectRatio 1/1 = shows top 75% of the 3:4 NPC (container height = width, image is taller) */}
              <div className="relative overflow-hidden" style={{ width: "min(240px, calc(64*var(--vw)))", aspectRatio: "1/1" }}>
                {/* warm lava glow behind NPC */}
                <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "130%", height: "70%", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,80,10,0.30) 0%, rgba(180,40,5,0.10) 55%, transparent 75%)", filter: "blur(16px)" }} />
                <img
                  src={npcLavaHook}
                  alt="Shopkeeper"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", filter: "drop-shadow(0 4px 18px rgba(255,80,10,0.6)) drop-shadow(0 0 36px rgba(255,60,5,0.25))" }}
                  draggable={false}
                />
              </div>
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────── */}
          <div className="relative flex-shrink-0 mx-4 mb-3" style={{ zIndex: 10, height: "1px", background: isVolcanicFishing ? "linear-gradient(90deg, transparent, rgba(255,100,30,0.55), transparent)" : isFishingShop ? "linear-gradient(90deg, transparent, rgba(74,180,100,0.5), transparent)" : `linear-gradient(90deg, transparent, ${accent}50, transparent)` }} />

          {/* ── Type tabs (non-fishing) ──────────────────────── */}
          {!isFishingShop && (() => {
            const TYPE_ORDER = ["pet","edibles","power_up","potion","special","accessory","item","fishing","gift"];
            const TYPE_LABELS: Record<string,string> = { pet:"Pets", edibles:"Edibles", power_up:"Power-Ups", potion:"Potions", special:"Special", accessory:"Accessories", item:"Items", fishing:"Fishing", gift:"Gifts" };
            const allPresentTypes = [...new Set(sortedItems.map(i => i.type))];
            const presentTypes = [...TYPE_ORDER.filter(t => allPresentTypes.includes(t)), ...allPresentTypes.filter(t => !TYPE_ORDER.includes(t))];
            const hasHomeGoods = shopBundlesForSale.length > 0 || shopDecorForSale.length > 0;
            if (presentTypes.length === 0 && !hasHomeGoods) return null;
            const allTabs = [...presentTypes, ...(hasHomeGoods ? ["home_goods"] : [])];
            if (allTabs.length <= 1) return null;
            return (
              <div className="relative flex-shrink-0 flex gap-2 px-3 pb-3 overflow-x-auto" style={{ zIndex: 10, scrollbarWidth: "none" }}>
                {allTabs.map(t => {
                  const label = t === "home_goods" ? "Home Goods" : (TYPE_LABELS[t] ?? t);
                  return (
                    <button
                      key={t}
                      data-testid={`button-shop-tab-${t}`}
                      onClick={() => {
                        const el = shopScrollRef.current?.querySelector(`[data-section="${t}"]`) as HTMLElement | null;
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex-shrink-0 font-fantasy tracking-widest transition-all active:scale-95"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        padding: "6px 14px",
                        borderRadius: 20,
                        background: `${accent}18`,
                        border: `1.5px solid ${accent}55`,
                        color: accent,
                        cursor: "pointer",
                        boxShadow: `0 0 10px ${accent}18`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Fishing Shop Category Tabs ──────────────────── */}
          {isFishingShop && (
            <div className="relative flex-shrink-0 flex gap-2 px-3 pb-3" style={{ zIndex: 10 }}>
              {(["pole", "bait", "aquarium"] as const).map(tab => {
                const labels: Record<string, string> = { pole: "🎣  Fishing Poles", bait: "🪱  Bait", aquarium: "🐟  Aquarium" };
                const isActive = fishingShopTab === tab;
                const isComingSoon = tab === "aquarium";
                return (
                  <button
                    key={tab}
                    data-testid={`button-fishing-tab-${tab}`}
                    onClick={() => !isComingSoon && setFishingShopTab(tab)}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      borderRadius: 10,
                      border: isVolcanicFishing
                        ? isActive ? "1.5px solid rgba(255,100,30,0.75)" : "1.5px solid rgba(255,100,30,0.22)"
                        : isActive ? "1.5px solid rgba(74,180,100,0.7)" : "1.5px solid rgba(74,180,100,0.2)",
                      background: isVolcanicFishing
                        ? isActive ? "linear-gradient(160deg, rgba(120,40,10,0.60) 0%, rgba(80,20,5,0.45) 100%)" : "rgba(30,8,3,0.55)"
                        : isActive ? "linear-gradient(160deg, rgba(40,120,55,0.55) 0%, rgba(20,80,35,0.4) 100%)" : "rgba(10,30,15,0.55)",
                      cursor: isComingSoon ? "default" : "pointer",
                      opacity: isComingSoon ? 0.55 : 1,
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div className="font-fantasy text-center" style={{ fontSize: 10, letterSpacing: "0.05em", color: isVolcanicFishing ? (isActive ? "#ff9060" : "rgba(255,160,80,0.65)") : (isActive ? "#7dde9a" : "rgba(150,220,170,0.65)"), lineHeight: 1.3 }}>
                      {labels[tab]}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Scrollable Items Body ────────────────────────── */}
          <div ref={shopScrollRef} className="relative flex-1 overflow-y-auto pb-6" style={{ zIndex: 10, scrollbarWidth: "none" }}>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full" style={{ width: 40, height: 40, border: `3px solid ${accent}25`, borderTopColor: `${accent}90` }} />
              </div>
            ) : isFishingShop ? (
              (() => {
                const displayItems = fishingShopTab !== "aquarium"
                  ? sortedItems.filter(i => i.fishingType === fishingShopTab)
                  : [];
                const emptyBorder = isVolcanicFishing ? "1px solid rgba(255,100,30,0.22)" : "1px solid rgba(74,180,100,0.2)";
                const emptyAdminColor = isVolcanicFishing ? "rgba(255,100,30,0.65)" : "rgba(74,180,100,0.6)";
                if (fishingShopTab === "aquarium") return (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: emptyBorder }}>
                      <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                    </div>
                  </div>
                );
                if (displayItems.length === 0) return (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: emptyBorder }}>
                      <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                      {currentUser.isAdmin && <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: emptyAdminColor }}>Tap + to add items</p>}
                    </div>
                  </div>
                );
                return (
                  <div className="grid grid-cols-3 gap-3 px-3 pt-2">
                    {displayItems.map(item => {
                      const imgSrc = item.imageUrl;
                      const canAfford = currentUser.coins >= item.price;
                      const descLines = getItemDescription(item);
                      return (
                        <div
                          key={item.id}
                          className="relative flex flex-col items-center rounded-2xl transition-transform active:scale-95"
                          style={{ background: "linear-gradient(160deg,rgba(0,0,0,0.42),rgba(0,0,0,0.58))", border: `1.5px solid ${accent}30`, boxShadow: `0 2px 16px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05)`, cursor: "pointer", padding: "10px 8px 8px" }}
                          onClick={() => { if (currentUser.isAdmin) return; playTick(); setSelectedShopItem(item); setBuyError(null); setBuyConfirmPending(false); setBuyFlash(0); }}
                        >
                          {currentUser.isAdmin && (
                            <button data-testid={`button-unassign-item-${item.id}`} onClick={e => { e.stopPropagation(); if (activeLocationId) unassignItemMutation.mutate({ locationId: activeLocationId, itemId: item.id }); }} className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(220,38,38,0.95)", border: "1px solid rgba(255,100,100,0.6)", cursor: "pointer" }}><X className="w-3 h-3 text-white" /></button>
                          )}
                          <div className="w-full flex items-center justify-center mb-2" style={{ height: "72px" }}>
                            {imgSrc ? <img src={imgSrc} alt={item.name} className="max-w-full max-h-full object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 6px ${accent}30)` }} /> : <Package className="w-10 h-10" style={{ color: `${accent}60` }} />}
                          </div>
                          <p className="font-fantasy text-center text-white leading-tight mb-1.5" style={{ fontSize: "10px", lineHeight: "1.3" }}>{item.name}</p>
                          {descLines.length > 0 && <p className="font-fantasy text-center leading-tight mb-1.5" style={{ fontSize: "8px", color: `${accent}bb`, lineHeight: "1.2" }}>{descLines[0]}</p>}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: canAfford ? `${accent}20` : "rgba(80,60,40,0.25)", border: `1px solid ${canAfford ? accent + "50" : "rgba(100,80,50,0.35)"}` }}>
                            <img src={coinIconImg} alt="" style={{ width: "9px", height: "9px", objectFit: "contain" }} />
                            <span className="font-fantasy" style={{ fontSize: "9px", color: canAfford ? accent : "#7a6040", fontWeight: 700 }}>{item.price}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : sortedItems.length === 0 && shopBundlesForSale.length === 0 && shopDecorForSale.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${accent}20` }}>
                  <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                  {currentUser.isAdmin && <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: `${accent}60` }}>Tap + to add items</p>}
                </div>
              </div>
            ) : (
              (() => {
                const TYPE_ORDER = ["pet","edibles","power_up","potion","special","accessory","item","fishing","gift"];
                const TYPE_LABELS: Record<string,string> = { pet:"Pets", edibles:"Edibles", power_up:"Power-Ups", potion:"Potions", special:"Special", accessory:"Accessories", item:"Items", fishing:"Fishing", gift:"Gifts" };
                const allPresentTypes = [...new Set(sortedItems.map(i => i.type))];
                const orderedTypes = [...TYPE_ORDER.filter(t => allPresentTypes.includes(t)), ...allPresentTypes.filter(t => !TYPE_ORDER.includes(t))];
                const grouped = orderedTypes.map(t => ({ type: t, label: TYPE_LABELS[t] ?? t.replace(/_/g, " "), groupItems: sortedItems.filter(i => i.type === t) }));
                const hasHomeGoods = shopBundlesForSale.length > 0 || shopDecorForSale.length > 0;
                return (
                  <>
                    {grouped.map(({ type, label, groupItems }) => (
                      <div key={type} data-section={type} className="mb-6 pt-2">
                        {/* Centered section label */}
                        <div className="text-center mb-1 px-4">
                          <span className="font-fantasy tracking-[0.22em]" style={{ fontSize: 13, color: accent, textShadow: `0 0 14px ${accent}55`, letterSpacing: "0.22em" }}>
                            {label.toUpperCase()}
                          </span>
                        </div>
                        {/* Full-width divider */}
                        <div className="mb-4 mx-4" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}70, transparent)` }} />
                        {/* Items grid */}
                        <div className="grid grid-cols-3 gap-3 px-3">
                          {groupItems.map(item => {
                            const imgSrc = item.type === "pet" ? (item.eggImageUrl || item.imageUrl) : item.imageUrl;
                            const isOwned = item.type === "pet" && ownedItemIds.has(item.id);
                            const canAfford = currentUser.coins >= item.price;
                            const descLines = getItemDescription(item);
                            return (
                              <div
                                key={item.id}
                                className="relative flex flex-col items-center rounded-2xl transition-transform active:scale-95"
                                style={{ background: "linear-gradient(160deg,rgba(0,0,0,0.42),rgba(0,0,0,0.58))", border: `1.5px solid ${accent}30`, boxShadow: `0 2px 16px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05)`, cursor: "pointer", padding: "10px 8px 8px" }}
                                onClick={() => { if (currentUser.isAdmin) return; playTick(); setSelectedShopItem(item); setBuyError(null); setBuyConfirmPending(false); setBuyFlash(0); }}
                              >
                                {currentUser.isAdmin && (
                                  <button data-testid={`button-unassign-item-${item.id}`} onClick={e => { e.stopPropagation(); if (activeLocationId) unassignItemMutation.mutate({ locationId: activeLocationId, itemId: item.id }); }} className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(220,38,38,0.95)", border: "1px solid rgba(255,100,100,0.6)", cursor: "pointer" }}><X className="w-3 h-3 text-white" /></button>
                                )}
                                {isOwned && (
                                  <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full font-fantasy" style={{ fontSize: "7px", background: "rgba(232,168,0,0.25)", border: "1px solid rgba(232,168,0,0.5)", color: "#e8c84a" }}>Owned</div>
                                )}
                                <div className="w-full flex items-center justify-center mb-2" style={{ height: "72px" }}>
                                  {imgSrc ? <img src={imgSrc} alt={item.name} className="max-w-full max-h-full object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 6px ${accent}30)` }} /> : <Package className="w-10 h-10" style={{ color: `${accent}60` }} />}
                                </div>
                                <p className="font-fantasy text-center text-white leading-tight mb-1.5" style={{ fontSize: "10px", lineHeight: "1.3" }}>{item.name}</p>
                                {descLines.length > 0 && <p className="font-fantasy text-center leading-tight mb-1.5" style={{ fontSize: "8px", color: `${accent}bb`, lineHeight: "1.2" }}>{descLines[0]}</p>}
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: canAfford ? `${accent}20` : "rgba(80,60,40,0.25)", border: `1px solid ${canAfford ? accent + "50" : "rgba(100,80,50,0.35)"}` }}>
                                  <img src={coinIconImg} alt="" style={{ width: "9px", height: "9px", objectFit: "contain" }} />
                                  <span className="font-fantasy" style={{ fontSize: "9px", color: canAfford ? accent : "#7a6040", fontWeight: 700 }}>{item.price}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* ── Home Goods section ───────────────────── */}
                    {hasHomeGoods && (
                      <div data-section="home_goods" className="mb-6 pt-2">
                        <div className="text-center mb-1 px-4">
                          <span className="font-fantasy tracking-[0.22em]" style={{ fontSize: 13, color: accent, textShadow: `0 0 14px ${accent}55`, letterSpacing: "0.22em" }}>
                            HOME GOODS
                          </span>
                        </div>
                        <div className="mb-4 mx-4" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}70, transparent)` }} />
                        <div className="flex gap-3 overflow-x-auto px-3 pb-2" style={{ scrollbarWidth: "none" }}>
                          {shopBundlesForSale.map(bundle => (
                            <button key={bundle.id} data-testid={`button-buy-bundle-shop-${bundle.id}`} onClick={() => { if (!currentUser.isAdmin) buyBundleMutation.mutate(bundle.id); }} disabled={buyBundleMutation.isPending || currentUser.isAdmin} className="flex-shrink-0 flex flex-col items-center gap-1.5 group" style={{ cursor: currentUser.isAdmin ? "default" : "pointer" }}>
                              <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-active:scale-90" style={{ background: "rgba(255,255,255,0.07)", border: `1.5px solid ${accent}40`, boxShadow: `0 2px 10px rgba(0,0,0,0.5)` }}>
                                {bundle.shopImageUrl ? <img src={bundle.shopImageUrl} alt={bundle.name} className="w-full h-full object-cover" /> : <span className="text-2xl">🏡</span>}
                              </div>
                              <p className="font-fantasy text-[8px] text-white/80 max-w-[64px] text-center truncate leading-tight">{bundle.name}</p>
                              <span className="font-fantasy text-[8px] px-2 py-0.5 rounded-full" style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}40` }}>{bundle.price}c</span>
                            </button>
                          ))}
                          {shopDecorForSale.map(decor => (
                            <div key={decor.id} data-testid={`button-buy-decor-shop-${decor.id}`} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                              <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.07)", border: `1.5px solid ${accent}40`, boxShadow: `0 2px 10px rgba(0,0,0,0.5)` }}>
                                {decor.imageUrl ? <img src={decor.imageUrl} alt={decor.name} className="w-full h-full object-cover" /> : <span className="text-2xl">🪴</span>}
                              </div>
                              <p className="font-fantasy text-[8px] text-white/80 max-w-[64px] text-center truncate leading-tight">{decor.name}</p>
                              <span className="font-fantasy text-[8px] px-2 py-0.5 rounded-full" style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}40` }}>{decor.price}c</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </div>

          {/* Owner character floating bottom-left */}
          {activeLoc?.ownerImageUrl && (
            <div className="absolute bottom-4 left-4 pointer-events-none" style={{ zIndex: 10, animation: "locFloat 4s ease-in-out infinite" }}>
              <img src={activeLoc.ownerImageUrl} alt="Owner" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${accent}30)` }} />
            </div>
          )}
        </div>
        );
      })()}

      {selectedShopItem && (() => {
        const item = selectedShopItem;
        const imgSrc = item.type === "pet" ? (item.eggImageUrl || item.imageUrl) : item.imageUrl;
        const descLines = getItemDescription(item);
        const ownedCount = item.type === "pet" ? inventory.filter(inv => inv.shopItemId === item.id).length : 0;
        const canAfford = currentUser.coins >= item.price;
        const shopAccent = staticWorld?.accent || "#d4af37";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/75" onClick={() => { setSelectedShopItem(null); setBuyError(null); setBuyConfirmPending(false); }} />

            <div className="relative z-10 flex flex-col items-center" style={{ gap: 12, width: "min(calc(85*var(--vw)), 300px)" }}>
              {/* ── Styled shop card ── */}
              <div
                className="relative w-full"
                style={{
                  background: `linear-gradient(160deg, ${shopAccent}1a 0%, #080808 100%)`,
                  border: "2px solid #d4af37",
                  borderRadius: 14,
                  padding: "20px 20px 16px",
                  boxShadow: `0 0 50px rgba(0,0,0,0.97), 0 0 28px ${shopAccent}44`,
                }}
              >
                {/* Item image */}
                <div className="flex justify-center" style={{ marginBottom: 10 }}>
                  {imgSrc ? (
                    <img src={imgSrc} alt={item.name} style={{ width: 90, height: 90, objectFit: "contain", filter: `drop-shadow(0 4px 14px rgba(0,0,0,0.8)) drop-shadow(0 0 10px ${shopAccent}55)` }} />
                  ) : (
                    <Package style={{ width: 80, height: 80, color: `${shopAccent}88` }} />
                  )}
                </div>

                {/* Owned badge */}
                {ownedCount > 0 && item.type === "pet" && (
                  <div className="text-center font-fantasy font-bold" style={{ fontSize: 9.5, color: "#e8a800", textShadow: "0 0 6px rgba(232,168,0,0.5)", marginBottom: 4 }}>
                    Owned{ownedCount > 1 ? ` ×${ownedCount}` : ""}
                  </div>
                )}

                {/* Item name */}
                <h3
                  className="font-fantasy font-bold text-center"
                  style={{ fontSize: 15, color: "#ffd04a", marginBottom: 6, lineHeight: 1.3 }}
                  data-testid="text-detail-item-name"
                >
                  {item.name}
                </h3>

                {/* Description lines */}
                {descLines.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {descLines.slice(0, 3).map((line, i) => (
                      <div key={i} className="font-fantasy text-center" style={{ fontSize: 10, color: "rgba(255,240,200,0.75)", lineHeight: 1.45 }}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${shopAccent}33`, marginBottom: 8 }} />

                {/* Price */}
                <div className="flex items-center justify-center" style={{ gap: 5 }}>
                  <img src={coinIconImg} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                  <span className="font-fantasy font-bold" style={{ fontSize: 16, color: canAfford ? "#ffd04a" : "#e84040" }}>
                    {item.price} coins
                  </span>
                </div>

                {/* Confirm prompt — shown for pets or items over 500 coins */}
                {buyConfirmPending && (
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.35)", textAlign: "center" }}>
                    <span className="font-fantasy" style={{ fontSize: 11, color: "#fde68a", fontWeight: 700 }}>
                      Spend {item.price.toLocaleString()} coins on this?
                    </span>
                  </div>
                )}
              </div>

              {/* Error message */}
              {buyError && (
                <div className="font-fantasy text-center w-full" style={{ fontSize: 9.5, padding: "5px 10px", borderRadius: 8, background: "rgba(150,10,10,0.35)", color: "#ffaaaa", border: "1px solid rgba(200,50,50,0.4)" }} data-testid="text-buy-error">
                  {buyError}
                </div>
              )}

              {/* Button row — with +1 flash */}
              <div className="relative flex w-full" style={{ gap: 8 }}>
                {/* Green +1 flash after purchase */}
                {buyFlash > 0 && (
                  <div
                    key={buyFlash}
                    className="pointer-events-none font-fantasy font-bold"
                    style={{
                      position: "absolute",
                      top: -32,
                      left: "50%",
                      transform: "translateX(-50%)",
                      animation: "shopBuyFlash 1s ease-out forwards",
                      fontSize: 20,
                      color: "#4ade80",
                      textShadow: "0 0 14px rgba(74,222,128,1), 0 0 28px rgba(74,222,128,0.6)",
                      zIndex: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    +1
                  </div>
                )}
                <style>{`@keyframes shopBuyFlash { 0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.2)} 70%{opacity:0.9;transform:translateX(-50%) translateY(-24px) scale(1)} 100%{opacity:0;transform:translateX(-50%) translateY(-38px) scale(0.85)} }`}</style>

                {!buyConfirmPending ? (
                  <>
                    {/* Close button (secondary, smaller) */}
                    <button
                      data-testid="button-close-item-detail"
                      onClick={() => { setSelectedShopItem(null); setBuyError(null); setBuyConfirmPending(false); }}
                      className="font-fantasy font-semibold transition-transform active:scale-95 flex-shrink-0"
                      style={{ padding: "10px 14px", fontSize: 12, borderRadius: 10, background: "rgba(30,15,5,0.8)", border: "1.5px solid rgba(140,100,40,0.4)", color: "#a07840", cursor: "pointer", letterSpacing: "0.04em" }}
                    >
                      Close
                    </button>
                    {/* Buy button (primary) */}
                    <button
                      data-testid="button-price-buy"
                      onClick={(e) => {
                        if (!canAfford || buyMutation.isPending) return;
                        const requiresConfirm = item.type === "pet" || item.price > 500;
                        if (requiresConfirm) { setBuyConfirmPending(true); return; }
                        burstGoldenOrbs(e.clientX, e.clientY);
                        buyMutation.mutate({ itemId: item.id, quantity: 1 });
                      }}
                      disabled={!canAfford || buyMutation.isPending}
                      className="flex-1 font-fantasy font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        padding: "11px 0",
                        fontSize: 14,
                        borderRadius: 10,
                        background: canAfford ? "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)" : "rgba(60,42,18,0.55)",
                        border: `2px solid ${canAfford ? "#d4af37" : "rgba(100,75,40,0.3)"}`,
                        color: canAfford ? "#ffd04a" : "#7a6040",
                        cursor: canAfford ? "pointer" : "default",
                        boxShadow: canAfford ? "0 4px 16px rgba(90,45,0,0.5)" : "none",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {buyMutation.isPending ? "Buying…" : "Buy"}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Cancel (back to normal view) */}
                    <button
                      data-testid="button-confirm-cancel"
                      onClick={() => setBuyConfirmPending(false)}
                      className="font-fantasy font-semibold transition-transform active:scale-95 flex-shrink-0"
                      style={{ padding: "10px 14px", fontSize: 12, borderRadius: 10, background: "rgba(30,15,5,0.8)", border: "1.5px solid rgba(140,100,40,0.4)", color: "#a07840", cursor: "pointer", letterSpacing: "0.04em" }}
                    >
                      Cancel
                    </button>
                    {/* Confirm purchase */}
                    <button
                      data-testid="button-confirm-buy"
                      onClick={(e) => {
                        if (!canAfford || buyMutation.isPending) return;
                        burstGoldenOrbs(e.clientX, e.clientY);
                        buyMutation.mutate({ itemId: item.id, quantity: 1 });
                      }}
                      disabled={!canAfford || buyMutation.isPending}
                      className="flex-1 font-fantasy font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        padding: "11px 0",
                        fontSize: 13,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)",
                        border: "2px solid #d4af37",
                        color: "#ffd04a",
                        cursor: "pointer",
                        boxShadow: "0 4px 16px rgba(90,45,0,0.5)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {buyMutation.isPending ? "Buying…" : "Confirm!"}
                    </button>
                  </>
                )}
              </div>

              {!canAfford && (
                <p className="font-fantasy text-center" style={{ fontSize: 10, color: "#e84040", marginTop: -6 }} data-testid="text-not-enough-coins">
                  Not enough coins
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {showItemPicker && currentUser.isAdmin && activeLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowItemPicker(false)} />
          <div
            className="relative z-10 w-[90%] max-w-sm rounded-lg max-h-[calc(82*var(--vh))] flex flex-col"
            style={{
              background: `linear-gradient(135deg, rgba(8,5,18,0.98) 0%, rgba(18,12,30,0.98) 100%)`,
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 40px ${accent}25`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
              <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>Add Items to Shop</h3>
              <button
                data-testid="button-close-item-picker"
                onClick={() => setShowItemPicker(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${accent}20`, border: `1px solid ${accent}40`, cursor: "pointer", color: accent }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Top-level tabs: Items / House / Decor */}
            <div className="flex-shrink-0 px-3 pb-2 flex gap-1 border-b" style={{ borderColor: `${accent}20` }}>
              {([
                { label: "Items", value: "items" as const },
                { label: "House", value: "house" as const },
                { label: "Decor", value: "decor" as const },
              ] as { label: string; value: "items" | "house" | "decor" }[]).map(t => (
                <button
                  key={t.value}
                  data-testid={`button-picker-tab-${t.value}`}
                  onClick={() => setPickerTab(t.value)}
                  className="font-fantasy text-[10px] px-3 py-1.5 rounded-t-md transition-all flex-1"
                  style={{
                    background: pickerTab === t.value ? `${accent}25` : "transparent",
                    borderBottom: pickerTab === t.value ? `2px solid ${accent}` : "2px solid transparent",
                    color: pickerTab === t.value ? accent : `${accent}60`,
                    cursor: "pointer",
                  }}
                >{t.label}</button>
              ))}
            </div>

            {/* Sub-filter tabs (only on Items tab) */}
            {pickerTab === "items" && (
              <div className="flex-shrink-0 px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: "All", value: "all" },
                    { label: "Potions", value: "potion" },
                    { label: "Power-Ups", value: "power_up" },
                    { label: "Edibles", value: "edibles" },
                    { label: "Gifts", value: "gift" },
                    { label: "Special", value: "special" },
                    { label: "Accessories", value: "accessory" },
                    { label: "Pets", value: "pet" },
                    { label: "Fishing", value: "fishing" },
                  ].map(f => (
                    <button
                      key={f.value}
                      data-testid={`button-picker-filter-${f.value}`}
                      onClick={() => setPickerFilter(f.value)}
                      className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-all"
                      style={{
                        background: pickerFilter === f.value ? `${accent}35` : "rgba(255,255,255,0.05)",
                        border: `1px solid ${pickerFilter === f.value ? accent + "70" : "rgba(255,255,255,0.1)"}`,
                        color: pickerFilter === f.value ? accent : `${accent}70`,
                        cursor: "pointer",
                      }}
                    >{f.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Content list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {pickerTab === "items" && (() => {
                if (isAllShopItemsLoading) {
                  return <p className="font-fantasy text-[#a89878] text-xs text-center py-6 animate-pulse">Loading items...</p>;
                }
                const pickable = (allShopItems ?? []).filter(si => {
                  if (si.fishingType === "fish") return false;
                  if (si.fishingType === "bait" && si.locationId != null) return false;
                  if (pickerFilter === "all") return true;
                  if (pickerFilter === "fishing") return si.type === "fishing";
                  return si.type === pickerFilter;
                });
                return pickable.length === 0 ? (
                  <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No items match this filter.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pickable.map((si) => {
                      const alreadyAssigned = si.fishingType === "bait"
                        ? items.some(it => it.fishingType === "bait" && it.name === si.name)
                        : items.some(it => it.id === si.id);
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
                            {(() => {
                              const pickerImg = si.type === "pet" ? (si.eggImageUrl || si.imageUrl) : si.imageUrl;
                              return pickerImg
                                ? <img src={pickerImg} alt="" className="w-full h-full object-contain rounded-md" />
                                : <Package className="w-5 h-5" style={{ color: `${accent}40` }} />;
                            })()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{si.name}</p>
                            <p className="font-fantasy text-[9px]" style={{ color: `${accent}70` }}>
                              {si.price} coins · {si.fishingType ?? si.type}
                            </p>
                            {si.type === "gift" && si.giftPoints != null && (
                              <p className="font-fantasy text-[8px]" style={{ color: "#ec4899" }}>+{si.giftPoints} loyalty pts</p>
                            )}
                          </div>
                          {alreadyAssigned ? (
                            <span className="font-fantasy text-[9px] px-2 py-1 rounded-full" style={{ background: `${accent}20`, color: accent }}>In Shop</span>
                          ) : (
                            <button
                              data-testid={`button-assign-${si.id}`}
                              onClick={() => assignItemMutation.mutate({ locationId: activeLocationId, itemId: si.id })}
                              disabled={assignItemMutation.isPending}
                              className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                              style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
                            >Add</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {pickerTab === "house" && (
                <div className="flex flex-col gap-2 pt-2">
                  {allAdminBundles.length === 0 ? (
                    <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No house bundles created yet.</p>
                  ) : allAdminBundles.map(bundle => {
                    const inShop = locationShopBundles.some(lb => lb.bundleId === bundle.id);
                    return (
                      <div
                        key={bundle.id}
                        data-testid={`picker-bundle-${bundle.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg"
                        style={{
                          background: inShop ? `${accent}15` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${inShop ? accent + "40" : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                          {bundle.shopImageUrl
                            ? <img src={bundle.shopImageUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="w-full h-full flex items-center justify-center text-lg">🏡</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{bundle.name}</p>
                          <p className="font-fantasy text-[9px]" style={{ color: `${accent}70` }}>{bundle.price} coins · house bundle</p>
                        </div>
                        {inShop ? (
                          <button
                            data-testid={`button-unassign-bundle-${bundle.id}`}
                            onClick={() => unassignBundleMutation.mutate({ locationId: activeLocationId, bundleId: bundle.id })}
                            disabled={unassignBundleMutation.isPending}
                            className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-transform active:scale-95"
                            style={{ background: "rgba(200,60,60,0.2)", border: "1px solid rgba(200,60,60,0.4)", color: "#f87171", cursor: "pointer" }}
                          >Remove</button>
                        ) : (
                          <button
                            data-testid={`button-assign-bundle-${bundle.id}`}
                            onClick={() => assignBundleMutation.mutate({ locationId: activeLocationId, bundleId: bundle.id })}
                            disabled={assignBundleMutation.isPending}
                            className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                            style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
                          >Add</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {pickerTab === "decor" && (
                <div className="flex flex-col gap-2 pt-2">
                  {allAdminDecor.length === 0 ? (
                    <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No decor items created yet.</p>
                  ) : allAdminDecor.map(decor => {
                    const inShop = locationShopDecor.some(ld => ld.decorId === decor.id);
                    return (
                      <div
                        key={decor.id}
                        data-testid={`picker-decor-${decor.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg"
                        style={{
                          background: inShop ? `${accent}15` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${inShop ? accent + "40" : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                          {decor.imageUrl
                            ? <img src={decor.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="w-full h-full flex items-center justify-center text-lg">🪴</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{decor.name}</p>
                          <p className="font-fantasy text-[9px]" style={{ color: `${accent}70` }}>{decor.price} coins · home decor</p>
                        </div>
                        {inShop ? (
                          <button
                            data-testid={`button-unassign-decor-${decor.id}`}
                            onClick={() => unassignDecorMutation.mutate({ locationId: activeLocationId, decorId: decor.id })}
                            disabled={unassignDecorMutation.isPending}
                            className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-transform active:scale-95"
                            style={{ background: "rgba(200,60,60,0.2)", border: "1px solid rgba(200,60,60,0.4)", color: "#f87171", cursor: "pointer" }}
                          >Remove</button>
                        ) : (
                          <button
                            data-testid={`button-assign-decor-${decor.id}`}
                            onClick={() => assignDecorMutation.mutate({ locationId: activeLocationId, decorId: decor.id })}
                            disabled={assignDecorMutation.isPending}
                            className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                            style={{ background: `${accent}30`, border: `1px solid ${accent}50`, color: accent, cursor: "pointer" }}
                          >Add</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLocationView && (() => {
        const activeLoc = locations.find(l => l.id === activeLocationId);
        if (!activeLoc) return null;
        const isBattleAdmin = activeLoc.type === "battle" && currentUser.isAdmin;

        if (isBattleAdmin) {
          return (
            <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
              {/* Top banner: bg image preview */}
              <div className="relative flex-shrink-0" style={{ height: "210px" }}>
                {committedLocBgUrl ? (
                  <img src={committedLocBgUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: "linear-gradient(180deg, rgba(20,4,4,1) 0%, rgba(40,8,8,1) 100%)" }} />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.6) 100%)" }} />
                <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(220,38,38,0.06) 0%, transparent 70%)" }} />
                {/* Header row */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pb-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
                  <div className="flex items-center gap-3">
                    {activeLoc.iconUrl && (
                      <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-lg object-contain" style={{ border: "1px solid rgba(220,38,38,0.4)", filter: "drop-shadow(0 0 8px rgba(220,38,38,0.3))" }} />
                    )}
                    <div>
                      <h3 className="font-fantasy text-lg tracking-widest font-semibold" style={{ color: "#ef4444", textShadow: "0 0 15px rgba(239,68,68,0.5)" }}>
                        {activeLoc.name}
                      </h3>
                      {activeLoc.description && (
                        <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(239,68,68,0.6)" }}>
                          {activeLoc.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentUser.activePetId && (
                      <button
                        data-testid="button-start-battle"
                        onClick={() => {
                          setBattleLocationId(activeLoc.id);
                          setBattlePotionSlots([null, null, null, null, null]);
                          setShowBattlePrep(true);
                          setShowLocationView(false);
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                        style={{
                          background: "linear-gradient(135deg, rgba(239,68,68,0.8) 0%, rgba(180,40,40,0.6) 100%)",
                          border: "2px solid rgba(239,68,68,0.9)",
                          boxShadow: "0 4px 16px rgba(239,68,68,0.4)",
                          cursor: "pointer",
                        }}
                      >
                        <Swords className="w-4 h-4 text-white" />
                      </button>
                    )}
                    <button
                      data-testid="button-close-location-view"
                      onClick={() => { setShowLocationView(false); setActiveLocationId(null); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{
                        background: "rgba(220,38,38,0.25)",
                        border: "2px solid rgba(220,38,38,0.5)",
                        color: "#ef4444",
                        cursor: "pointer",
                      }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom: inline battle zone setup */}
              <div
                className="flex-1 flex flex-col overflow-hidden"
                style={{
                  background: "linear-gradient(160deg, rgba(10,4,4,1) 0%, rgba(18,5,5,1) 100%)",
                  borderTop: "2px solid rgba(220,38,38,0.35)",
                }}
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0"
                  style={{ borderBottom: "1px solid rgba(220,38,38,0.15)" }}
                >
                  <Swords className="w-4 h-4" style={{ color: "#ef4444" }} />
                  <h4 className="font-fantasy tracking-widest" style={{ fontSize: "13px", color: "#ef4444", textShadow: "0 0 12px rgba(239,68,68,0.45)" }}>
                    Battle Zone Setup
                  </h4>
                </div>
                <ExploreAdminPanel
                  locationId={activeLoc.id}
                  locationType={activeLoc.type}
                  accent={accent}
                  inline={true}
                  onClose={() => {}}
                  onBgUpload={async (imageData) => {
                    if (!activeLocationId) return;
                    setBgUploading(true);
                    try {
                      await apiRequest("PATCH", `/api/admin/location/${activeLocationId}/bg`, { imageData });
                      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
                    } catch {
                      /* ignore */
                    } finally {
                      setBgUploading(false);
                    }
                  }}
                  bgUploading={bgUploading}
                />
              </div>
            </div>
          );
        }

        return (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0">
            {committedLocBgUrl ? (
              <img src={committedLocBgUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ background: `linear-gradient(180deg, rgba(5,3,15,1) 0%, rgba(15,10,30,1) 50%, rgba(5,3,15,1) 100%)` }} />
            )}
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.7) 100%)` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, ${accent}08 0%, transparent 60%)` }} />
          </div>
          {/* Loading gate */}
          {!locBgLoaded && (
            <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(8,5,20,1)" }}>
              <div className="animate-spin rounded-full" style={{ width: 48, height: 48, border: `3px solid ${accent}25`, borderTopColor: accent }} />
            </div>
          )}

          {/* Bayou's Heart floating lights */}
          {activeLoc?.id === BAYOUS_HEART_ID && (
            <>
              <style>{`
                @keyframes bayouOrb1 {
                  0%   { transform: translate(0,0) scale(1);    opacity: 0.4; }
                  25%  { transform: translate(14px,-22px) scale(1.2); opacity: 0.9; }
                  55%  { transform: translate(-9px,-38px) scale(0.85); opacity: 0.55; }
                  78%  { transform: translate(18px,-16px) scale(1.1); opacity: 0.75; }
                  100% { transform: translate(0,0) scale(1);    opacity: 0.4; }
                }
                @keyframes bayouOrb2 {
                  0%   { transform: translate(0,0) scale(0.9);  opacity: 0.3; }
                  30%  { transform: translate(-16px,-26px) scale(1.25); opacity: 0.8; }
                  65%  { transform: translate(9px,-42px) scale(0.8); opacity: 0.45; }
                  100% { transform: translate(0,0) scale(0.9);  opacity: 0.3; }
                }
                @keyframes bayouOrb3 {
                  0%   { transform: translate(0,0) scale(1.1);  opacity: 0.35; }
                  40%  { transform: translate(22px,-14px) scale(0.75); opacity: 0.75; }
                  72%  { transform: translate(-11px,-32px) scale(1.2); opacity: 0.4; }
                  100% { transform: translate(0,0) scale(1.1);  opacity: 0.35; }
                }
                @keyframes bayouOrbPulse {
                  0%,100% { opacity: 0.25; transform: scale(1); }
                  50%     { opacity: 0.7; transform: scale(1.4); }
                }
              `}</style>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 5, opacity: 1 }}
              >
                {/* Soft diffuse light — left mid */}
                <div style={{ position: "absolute", left: "10%", top: "38%", width: 50, height: 50, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,200,255,0.55) 0%, rgba(100,170,255,0.15) 50%, transparent 75%)", filter: "blur(10px)", animation: "bayouOrb1 9s ease-in-out infinite" }} />
                {/* Soft diffuse light — right upper */}
                <div style={{ position: "absolute", right: "14%", top: "30%", width: 40, height: 40, borderRadius: "50%", background: "radial-gradient(circle, rgba(170,215,255,0.5) 0%, rgba(120,185,255,0.12) 52%, transparent 75%)", filter: "blur(9px)", animation: "bayouOrb2 11s ease-in-out infinite 1.5s" }} />
                {/* Smaller crisp light — center upper */}
                <div style={{ position: "absolute", left: "40%", top: "25%", width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,230,255,0.75) 0%, rgba(150,205,255,0.2) 50%, transparent 72%)", filter: "blur(5px)", animation: "bayouOrb3 8s ease-in-out infinite 3s" }} />
                {/* Tiny bright point — lower right */}
                <div style={{ position: "absolute", right: "28%", top: "55%", width: 14, height: 14, borderRadius: "50%", background: "radial-gradient(circle, rgba(210,235,255,0.9) 0%, rgba(160,210,255,0.25) 48%, transparent 70%)", filter: "blur(4px)", animation: "bayouOrb1 13s ease-in-out infinite 5s" }} />
                {/* Medium diffuse — right center */}
                <div style={{ position: "absolute", left: "64%", top: "44%", width: 36, height: 36, borderRadius: "50%", background: "radial-gradient(circle, rgba(130,195,255,0.55) 0%, rgba(90,160,255,0.14) 50%, transparent 74%)", filter: "blur(8px)", animation: "bayouOrb2 10s ease-in-out infinite 2s" }} />
                {/* Tiny point — far right upper */}
                <div style={{ position: "absolute", left: "82%", top: "28%", width: 16, height: 16, borderRadius: "50%", background: "radial-gradient(circle, rgba(215,235,255,0.8) 0%, rgba(175,215,255,0.18) 50%, transparent 72%)", filter: "blur(4px)", animation: "bayouOrb3 12s ease-in-out infinite 7s" }} />
                {/* Large slow pulse — lower left */}
                <div style={{ position: "absolute", left: "22%", top: "60%", width: 60, height: 60, borderRadius: "50%", background: "radial-gradient(circle, rgba(120,185,255,0.4) 0%, rgba(80,150,255,0.08) 55%, transparent 75%)", filter: "blur(14px)", animation: "bayouOrbPulse 7s ease-in-out infinite 4s" }} />
              </div>
              <CauldronOverlay
                isAdmin={!!currentUser.isAdmin}
                x={cauldronX}
                y={cauldronY}
                size={cauldronSize}
                onCommit={(layout) => cauldronLayoutMutation.mutate(layout)}
                onClick={() => {
                  if (currentUser.isAdmin) {
                    setCauldronOpen(true);
                  } else {
                    setShowCauldronConstruction(true);
                  }
                }}
              />
            </>
          )}

          <div className="relative z-10 flex flex-col h-full">
            {activeLoc.id === BAYOUS_HEART_ID ? (
              <div className="relative flex items-center justify-center px-4 pb-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
                <h3
                  className="font-fantasy text-xl tracking-[0.18em] font-semibold text-center"
                  style={{
                    color: "#d4a017",
                    textShadow: "0 0 18px rgba(212,160,23,0.65), 0 0 36px rgba(212,160,23,0.28)",
                  }}
                >
                  {activeLoc.name}
                </h3>
                <button
                  data-testid="button-close-location-view"
                  onClick={() => { setShowLocationView(false); setActiveLocationId(null); }}
                  className="absolute right-4 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                  style={{
                    background: "linear-gradient(135deg, rgba(212,160,23,0.22) 0%, rgba(212,160,23,0.10) 100%)",
                    border: "2px solid rgba(212,160,23,0.55)",
                    color: "#d4a017",
                    cursor: "pointer",
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 12H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M10.5 6.5L5 12L10.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 12L16.5 9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
                    <path d="M19 12L16.5 14.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px) + 12px, 48px)" }}>
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
            )}

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
                  {activeLoc.type === "fishing" && (
                    <button
                      data-testid="button-pond-admin"
                      onClick={() => setShowPondAdmin(true)}
                      className="w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{
                        background: "linear-gradient(135deg, rgba(30,58,138,0.9) 0%, rgba(15,30,80,0.8) 100%)",
                        border: "2px solid rgba(96,165,250,0.9)",
                        boxShadow: "0 4px 20px rgba(96,165,250,0.4)",
                        cursor: "pointer",
                        fontSize: "22px",
                      }}
                    >
                      <img src={fishRodIconWp} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                    </button>
                  )}
                  {activeLoc.type === "explore" && (
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
                  )}
                  {activeLoc.type === "explore" && currentUser.activePetId && (
                    <button
                      data-testid="button-start-battle"
                      onClick={() => {
                        setBattleLocationId(activeLoc.id);
                        setBattlePotionSlots([null, null, null, null, null]);
                        setShowBattlePrep(true);
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
                  {activeLoc.type !== "battle" && (
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
                  )}
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

      {showPondAdmin && activeLocationId && (
        <PondAdminModal
          locationId={activeLocationId}
          accent="#60a5fa"
          onClose={() => setShowPondAdmin(false)}
        />
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
          locationType={locations.find(l => l.id === activeLocationId)?.type || "explore"}
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
            {/* Bayou's Heart entrance mist — renders over backdrop, under modal */}
            {dangerLoc.id === BAYOUS_HEART_ID && (
              <>
                <style>{`
                  @keyframes bayouBase {
                    0%   { transform: translateX(-6%) scaleX(1); }
                    50%  { transform: translateX(6%) scaleX(1.14); }
                    100% { transform: translateX(-6%) scaleX(1); }
                  }
                  @keyframes bayouDrift {
                    0%   { transform: translateX(8%) scaleX(0.95); }
                    50%  { transform: translateX(-8%) scaleX(1.1); }
                    100% { transform: translateX(8%) scaleX(0.95); }
                  }
                  @keyframes bayouWisp1 {
                    0%   { transform: translate(0,0) scale(1); opacity: 0; }
                    12%  { opacity: 1; }
                    85%  { opacity: 0.55; }
                    100% { transform: translate(11%,-42%) scale(1.65); opacity: 0; }
                  }
                  @keyframes bayouWisp2 {
                    0%   { transform: translate(0,0) scale(0.85); opacity: 0; }
                    18%  { opacity: 0.8; }
                    80%  { opacity: 0.35; }
                    100% { transform: translate(-13%,-36%) scale(1.55); opacity: 0; }
                  }
                  @keyframes bayouWisp3 {
                    0%   { transform: translate(0,0) scale(1.05); opacity: 0; }
                    10%  { opacity: 0.65; }
                    88%  { opacity: 0.2; }
                    100% { transform: translate(5%,-52%) scale(1.75); opacity: 0; }
                  }
                  @keyframes bayouWisp4 {
                    0%   { transform: translate(0,0) scale(0.9); opacity: 0; }
                    15%  { opacity: 0.7; }
                    82%  { opacity: 0.3; }
                    100% { transform: translate(-8%,-44%) scale(1.6); opacity: 0; }
                  }
                  @keyframes bayouOrb1 {
                    0%   { transform: translate(0,0) scale(1);    opacity: 0.35; }
                    25%  { transform: translate(14px,-22px) scale(1.25); opacity: 0.85; }
                    55%  { transform: translate(-9px,-38px) scale(0.88); opacity: 0.5; }
                    78%  { transform: translate(18px,-16px) scale(1.15); opacity: 0.7; }
                    100% { transform: translate(0,0) scale(1);    opacity: 0.35; }
                  }
                  @keyframes bayouOrb2 {
                    0%   { transform: translate(0,0) scale(0.9);  opacity: 0.28; }
                    30%  { transform: translate(-16px,-26px) scale(1.3); opacity: 0.75; }
                    65%  { transform: translate(9px,-42px) scale(0.82); opacity: 0.4; }
                    100% { transform: translate(0,0) scale(0.9);  opacity: 0.28; }
                  }
                  @keyframes bayouOrb3 {
                    0%   { transform: translate(0,0) scale(1.1);  opacity: 0.3; }
                    40%  { transform: translate(22px,-14px) scale(0.78); opacity: 0.7; }
                    72%  { transform: translate(-11px,-32px) scale(1.22); opacity: 0.38; }
                    100% { transform: translate(0,0) scale(1.1);  opacity: 0.3; }
                  }
                  @keyframes bayouOrbPulse {
                    0%,100% { opacity: 0.22; transform: scale(1); }
                    50%     { opacity: 0.65; transform: scale(1.45); }
                  }
                `}</style>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: 1, opacity: 1 }}
                >
                {/* Soft diffuse light — left mid */}
                <div style={{ position: "absolute", left: "10%", top: "38%", width: 50, height: 50, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,200,255,0.55) 0%, rgba(100,170,255,0.15) 50%, transparent 75%)", filter: "blur(10px)", animation: "bayouOrb1 9s ease-in-out infinite" }} />
                {/* Soft diffuse light — right upper */}
                <div style={{ position: "absolute", right: "14%", top: "30%", width: 40, height: 40, borderRadius: "50%", background: "radial-gradient(circle, rgba(170,215,255,0.5) 0%, rgba(120,185,255,0.12) 52%, transparent 75%)", filter: "blur(9px)", animation: "bayouOrb2 11s ease-in-out infinite 1.5s" }} />
                {/* Smaller crisp light — center upper */}
                <div style={{ position: "absolute", left: "40%", top: "25%", width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,230,255,0.75) 0%, rgba(150,205,255,0.2) 50%, transparent 72%)", filter: "blur(5px)", animation: "bayouOrb3 8s ease-in-out infinite 3s" }} />
                {/* Tiny bright point — lower right */}
                <div style={{ position: "absolute", right: "28%", top: "55%", width: 14, height: 14, borderRadius: "50%", background: "radial-gradient(circle, rgba(210,235,255,0.9) 0%, rgba(160,210,255,0.25) 48%, transparent 70%)", filter: "blur(4px)", animation: "bayouOrb1 13s ease-in-out infinite 5s" }} />
                {/* Medium diffuse — right center */}
                <div style={{ position: "absolute", left: "64%", top: "44%", width: 36, height: 36, borderRadius: "50%", background: "radial-gradient(circle, rgba(130,195,255,0.55) 0%, rgba(90,160,255,0.14) 50%, transparent 74%)", filter: "blur(8px)", animation: "bayouOrb2 10s ease-in-out infinite 2s" }} />
                {/* Tiny point — far right upper */}
                <div style={{ position: "absolute", left: "82%", top: "28%", width: 16, height: 16, borderRadius: "50%", background: "radial-gradient(circle, rgba(215,235,255,0.8) 0%, rgba(175,215,255,0.18) 50%, transparent 72%)", filter: "blur(4px)", animation: "bayouOrb3 12s ease-in-out infinite 7s" }} />
                {/* Large slow pulse — lower left */}
                <div style={{ position: "absolute", left: "22%", top: "60%", width: 60, height: 60, borderRadius: "50%", background: "radial-gradient(circle, rgba(120,185,255,0.4) 0%, rgba(80,150,255,0.08) 55%, transparent 75%)", filter: "blur(14px)", animation: "bayouOrbPulse 7s ease-in-out infinite 4s" }} />
                </div>
              </>
            )}
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
                    setBattlePotionSlots([null, null, null, null, null]);
                    setShowBattlePrep(true);
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

      {showBattlePrep && battleLocationId && (() => {
        const battleLoc = locations.find(l => l.id === battleLocationId);
        if (!battleLoc) return null;

        const potions = inventory.filter(i => i.type === "potion" && ((i.healthRestored ?? 0) > 0 || (i.manaRestored ?? 0) > 0 || (i.petsRevived ?? 0) > 0));
        // Per-row stacks for the picker — each inventory row is its own
        // stack tile (the server already merges identical purchases up
        // to POTION_STACK_SIZE per row). Same model as PvP. 137 potions
        // bought lands as 3 rows (50/50/37) and renders as 3 tiles.
        const POTION_STACK_SIZE = 50;
        const potionGroups: Array<{
          key: string; inventoryId: string; qty: number;
          shopItemId: string; name: string;
          imageUrl?: string | null;
          healthRestored?: number | null;
          manaRestored?: number | null;
          petsRevived?: number | null;
        }> = potions.map(p => ({
          key: p.inventoryId,
          inventoryId: p.inventoryId,
          qty: Math.max(1, p.quantity ?? 1),
          shopItemId: p.shopItemId,
          name: p.name,
          imageUrl: p.imageUrl,
          healthRestored: p.healthRestored,
          manaRestored: p.manaRestored,
          petsRevived: p.petsRevived,
        }));

        // Tap a slot to clear it (matches PvP behavior).
        const removeFromSlot = (slotIdx: number) => {
          const updated = [...battlePotionSlots] as (BattlePotionSlot | null)[];
          if (!updated[slotIdx]) return;
          updated[slotIdx] = null;
          setBattlePotionSlots(updated);
        };

        // Picker → drop the chosen inventory row into the first empty
        // slot. The slot owns the row id and a snapshot of its qty
        // (capped at POTION_STACK_SIZE for safety). Already-bound rows
        // are skipped so a player can't double-bind one stack into two
        // slots.
        const equipPotionFromGroup = (group: typeof potionGroups[0]) => {
          const updated = [...battlePotionSlots] as (BattlePotionSlot | null)[];
          const emptyIdx = updated.findIndex(s => s === null);
          if (emptyIdx === -1) return;
          const allAssignedIds = new Set(
            updated.filter((s): s is BattlePotionSlot => s !== null).map(s => s.inventoryId),
          );
          if (allAssignedIds.has(group.inventoryId)) return;
          const safeQty = Math.max(1, Math.min(POTION_STACK_SIZE, group.qty));
          updated[emptyIdx] = {
            shopItemId: group.shopItemId,
            inventoryId: group.inventoryId,
            qty: safeQty,
            name: group.name,
            imageUrl: group.imageUrl ?? null,
            healthRestored: group.healthRestored ?? null,
            manaRestored: group.manaRestored ?? null,
            petsRevived: group.petsRevived ?? null,
          };
          setBattlePotionSlots(updated);
          setPotionPickerOpen(false);
        };

        return (
          <div
            className="absolute inset-0 z-50 flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
          >
            <div className="w-full max-w-sm mx-auto rounded-t-3xl"
              style={{ background: "linear-gradient(180deg, #1a0a2e 0%, #0f0a1a 100%)", border: "1px solid rgba(167,139,250,0.2)", borderBottom: "none", maxHeight: "calc(88*var(--vh))", overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <div>
                  <h2 className="font-fantasy text-lg text-white tracking-widest">PREPARE FOR BATTLE</h2>
                  <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#a78bfa" }}>{battleLoc.name}</p>
                </div>
                <button
                  data-testid="button-cancel-battle-prep"
                  onClick={() => { setShowBattlePrep(false); setBattleLocationId(null); setPotionPickerOpen(false); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* Potion slots — tap empty to open picker, tap filled to remove */}
              <div className="px-5 pb-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-fantasy text-[9px] tracking-widest text-white/40">BATTLE POTIONS</p>
                  <span className="font-fantasy text-[9px] tracking-wider text-white/40" data-testid="text-potion-slot-count">
                    {battlePotionSlots.filter(Boolean).length}/5
                  </span>
                </div>
                <div className="flex gap-2.5 justify-center mb-1">
                  {Array.from({ length: 5 }, (_, i) => {
                    const slot = battlePotionSlots[i];
                    const isHeal = slot && (slot.healthRestored ?? 0) > 0;
                    const isMana = slot && (slot.manaRestored ?? 0) > 0;
                    return (
                      <button
                        key={i}
                        data-testid={`div-prep-slot-${i}`}
                        onClick={() => slot ? removeFromSlot(i) : setPotionPickerOpen(true)}
                        className="relative flex items-center justify-center rounded-2xl border-2 transition-all active:scale-95"
                        style={{
                          width: 56, height: 56, flexShrink: 0,
                          background: slot ? (isMana ? "rgba(76,29,149,0.5)" : "rgba(20,80,30,0.5)") : "rgba(0,0,0,0.3)",
                          borderColor: slot ? (isMana ? "rgba(167,139,250,0.6)" : "rgba(34,197,94,0.5)") : "rgba(255,255,255,0.12)",
                          boxShadow: slot ? (isMana ? "0 0 8px rgba(124,58,237,0.35)" : "0 0 8px rgba(34,197,94,0.25)") : undefined,
                          cursor: "pointer",
                        }}
                      >
                        {slot ? (
                          <>
                            {slot.imageUrl ? (
                              <img src={slot.imageUrl} alt={slot.name} className="w-8 h-8 object-contain" />
                            ) : isHeal
                              ? <Heart className="w-5 h-5" style={{ color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />
                              : <Droplets className="w-5 h-5" style={{ color: "#a78bfa" }} />}
                            {/* Stack quantity badge — slots now hold up
                                to 50 of one potion type. */}
                            <div
                              className="absolute -bottom-1 -right-1 min-w-[20px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums"
                              data-testid={`text-prep-slot-qty-${i}`}
                              style={{
                                background: "rgba(0,0,0,0.85)",
                                border: `1px solid ${isMana ? "rgba(167,139,250,0.55)" : "rgba(34,197,94,0.55)"}`,
                                color: isMana ? "#c4b5fd" : "#86efac",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                              }}
                            >
                              ×{slot.qty}
                            </div>
                          </>
                        ) : (
                          <span className="text-2xl" style={{ color: "rgba(255,255,255,0.18)" }}>+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="font-fantasy text-[8px] tracking-wider text-white/20 text-center">Tap an empty slot to add a potion · tap a filled slot to remove</p>
              </div>

              {/* ── Equip Pets ── */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                <div>
                  <p className="font-fantasy text-[9px] tracking-widest text-white/40 mb-2">EQUIP PETS — up to 3 pets in battle</p>
                  <div className="flex gap-3 justify-start">
                    {[0, 1, 2].map((slotIdx) => {
                      const petSlot = battlePets[slotIdx];
                      const petImg = petSlot?.hatchedImageUrl || petSlot?.imageUrl || null;
                      const petName = petSlot?.petNickname || petSlot?.name || null;
                      const isActive = slotIdx === 0;
                      return (
                        <div key={slotIdx} className="flex flex-col items-center gap-1">
                          <div
                            data-testid={`div-battle-pet-slot-${slotIdx}`}
                            onClick={() => { if (isActive) return; setPetPickerSlot(slotIdx); }}
                            className="relative flex items-center justify-center rounded-2xl border-2 transition-all"
                            style={{
                              width: 64, height: 64, flexShrink: 0,
                              background: petSlot ? "rgba(120,80,220,0.25)" : "rgba(0,0,0,0.3)",
                              borderColor: petSlot ? "rgba(167,139,250,0.6)" : isActive ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.12)",
                              boxShadow: petSlot ? "0 0 12px rgba(167,139,250,0.3)" : undefined,
                              cursor: isActive ? "default" : "pointer",
                            }}
                          >
                            {petImg ? (
                              <img src={petImg} alt={petName || ""} className="w-12 h-12 object-contain" />
                            ) : petSlot ? (
                              <span className="text-white/60 text-xl">🐾</span>
                            ) : (
                              <span className="text-2xl font-bold" style={{ color: isActive ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.15)" }}>+</span>
                            )}
                            {isActive && (
                              <div className="absolute -top-1 -right-1 rounded-full text-[7px] font-bold px-1 py-0.5"
                                style={{ background: "#7c3aed", color: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>★</div>
                            )}
                            {!isActive && petSlot && (
                              <button
                                onClick={(e) => { e.stopPropagation(); const updated = [...battlePets]; updated[slotIdx] = null; setBattlePets(updated); }}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                                style={{ background: "rgba(220,38,38,0.8)", color: "white", border: "1px solid rgba(220,38,38,0.5)" }}
                              >✕</button>
                            )}
                          </div>
                          <p className="font-fantasy text-[8px] tracking-wide text-center truncate"
                            style={{ color: "rgba(167,139,250,0.7)", maxWidth: 64 }}>
                            {petName ? petName.split(" ")[0] : isActive ? "Active" : "Empty"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="font-fantasy text-[8px] tracking-wider text-white/20 mt-1.5 mb-2">Slot 1 is your active pet · tap + to add more</p>
                </div>
              </div>

              {/* Begin battle button */}
              <div className="px-5 pb-8 pt-3 flex-shrink-0">
                <button
                  data-testid="button-begin-battle"
                  onClick={() => {
                    setShowBattlePrep(false);
                    setShowBattle(true);
                    setShowLocationView(false);
                    setPotionPickerOpen(false);
                  }}
                  className="w-full py-3.5 rounded-2xl font-fantasy text-sm tracking-widest text-white transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #7f1d1d 100%)",
                    border: "2px solid rgba(239,68,68,0.7)",
                    boxShadow: "0 4px 24px rgba(239,68,68,0.35)",
                  }}
                >
                  <Swords className="w-4 h-4 inline-block mr-1 -mt-0.5" />BEGIN BATTLE
                </button>
              </div>
            </div>

            {/* Pet picker modal */}
            {petPickerSlot !== null && (() => {
              const hatchedPets = inventory.filter(i => i.type === "pet" && i.isHatched && i.inventoryId !== battlePets[0]?.inventoryId && !battlePets.some(bp => bp?.inventoryId === i.inventoryId));
              return (
                <div className="absolute inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
                  onClick={() => setPetPickerSlot(null)}>
                  <div
                    className="w-full max-w-sm rounded-t-3xl overflow-hidden"
                    style={{ background: "linear-gradient(180deg, #1a0a2e 0%, #0f0a1a 100%)", border: "1px solid rgba(167,139,250,0.25)", borderBottom: "none", maxHeight: "calc(55*var(--vh))" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 pt-4 pb-3">
                      <p className="font-fantasy text-xs tracking-widest" style={{ color: "#a78bfa" }}>CHOOSE PET — SLOT {petPickerSlot + 1}</p>
                      <button data-testid="button-close-pet-picker" onClick={() => setPetPickerSlot(null)}
                        className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10">
                        <X className="w-3.5 h-3.5 text-white/60" />
                      </button>
                    </div>
                    <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: "calc(44*var(--vh))" }}>
                      {hatchedPets.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="font-fantasy text-[10px] tracking-wider text-white/30">No other hatched pets available</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3">
                          {hatchedPets.map((pet) => {
                            const petImg = pet.hatchedImageUrl || pet.imageUrl || null;
                            const petName = pet.petNickname || pet.name;
                            return (
                              <div
                                key={pet.inventoryId}
                                data-testid={`button-pick-pet-${pet.inventoryId}`}
                                onClick={() => {
                                  if (petPickerSlot === null) return;
                                  const updated = [...battlePets];
                                  updated[petPickerSlot] = pet;
                                  setBattlePets(updated);
                                  setPetPickerSlot(null);
                                }}
                                className="flex flex-col items-center gap-1.5 cursor-pointer"
                              >
                                <div className="w-18 h-18 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95"
                                  style={{ width: 72, height: 72, background: "rgba(120,80,220,0.2)", borderColor: "rgba(167,139,250,0.35)" }}>
                                  {petImg ? (
                                    <img src={petImg} alt={petName} className="w-14 h-14 object-contain" />
                                  ) : (
                                    <span className="text-3xl">🐾</span>
                                  )}
                                </div>
                                <p className="font-fantasy text-[8px] tracking-wide text-center truncate text-white/70" style={{ maxWidth: 72 }}>
                                  {petName}
                                </p>
                                {pet.petLevel && (
                                  <p className="font-fantasy text-[7px]" style={{ color: "#a78bfa" }}>Lv.{pet.petLevel}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Potion picker modal — opens only when an empty slot is tapped */}
            {potionPickerOpen && (
              <div
                className="absolute inset-0 z-[70] flex items-end justify-center"
                style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
                onClick={() => setPotionPickerOpen(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm rounded-t-3xl overflow-hidden"
                  style={{
                    background: "linear-gradient(180deg, #15102a 0%, #0a0814 100%)",
                    border: "1px solid rgba(167,139,250,0.25)",
                    borderBottom: "none",
                    maxHeight: "calc(70*var(--vh))",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5 flex-shrink-0">
                    <p className="font-fantasy text-xs tracking-widest" style={{ color: "#a78bfa" }}>CHOOSE A POTION</p>
                    <button
                      data-testid="button-close-potion-picker"
                      onClick={() => setPotionPickerOpen(false)}
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20"
                    >
                      <X className="w-3.5 h-3.5 text-white/60" />
                    </button>
                  </div>
                  <div className="overflow-y-auto px-4 py-4">
                    {potionGroups.length === 0 ? (
                      <div className="text-center py-10">
                        <p className="font-fantasy text-[10px] tracking-wider text-white/30">No battle potions in your bag.</p>
                        <p className="font-fantasy text-[8px] tracking-wider text-white/20 mt-1">Visit a shop to stock up!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {potionGroups.map((group) => {
                          const isHeal = (group.healthRestored ?? 0) > 0;
                          const isMana = (group.manaRestored ?? 0) > 0;
                          // Whether this exact inventory row is bound
                          // to a slot already (one row → at most one
                          // slot in the new model). Tile is disabled
                          // once it's bound or the loadout is full.
                          const isEquipped = battlePotionSlots.some(s => s?.inventoryId === group.inventoryId);
                          const remaining = isEquipped ? 0 : group.qty;
                          const loadoutFull = battlePotionSlots.every((s) => s !== null);
                          const disabled = isEquipped || loadoutFull;
                          return (
                            <button
                              key={group.key}
                              data-testid={`button-potion-stack-${group.key}`}
                              disabled={disabled}
                              onClick={() => equipPotionFromGroup(group)}
                              className="relative rounded-xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: `1px solid ${isMana ? "rgba(167,139,250,0.35)" : isHeal ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.08)"}`,
                                opacity: disabled ? 0.4 : 1,
                                cursor: disabled ? "not-allowed" : "pointer",
                              }}
                            >
                              {/* ×N remaining badge — same as PvP */}
                              <div
                                className="absolute top-1 right-1 min-w-[22px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums shrink-0"
                                data-testid={`text-potion-stack-count-${group.shopItemId}`}
                                style={{
                                  background: "rgba(0,0,0,0.7)",
                                  border: `1px solid ${isMana ? "rgba(167,139,250,0.5)" : "rgba(34,197,94,0.5)"}`,
                                  color: isMana ? "#c4b5fd" : "#86efac",
                                }}
                              >
                                ×{remaining}
                              </div>
                              <div className="w-14 h-14 flex items-center justify-center">
                                {group.imageUrl ? (
                                  <img src={group.imageUrl} alt={group.name} className="w-12 h-12 object-contain" />
                                ) : isMana ? (
                                  <Droplets className="w-9 h-9" style={{ color: "#a78bfa" }} />
                                ) : (
                                  <Heart className="w-9 h-9" style={{ color: "#f87171", fill: "rgba(248,113,113,0.3)" }} />
                                )}
                              </div>
                              <div className="text-white/85 text-[10px] truncate w-full text-center font-medium">{group.name}</div>
                              <div className="text-[8px]" style={{ color: isMana ? "#c4b5fd" : "#86efac" }}>
                                {isHeal ? `+${group.healthRestored} HP` : isMana ? `+${group.manaRestored} MP` : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {showBattle && battleLocationId && (() => {
        const battleLoc = locations.find(l => l.id === battleLocationId);
        if (!battleLoc) return null;
        return (
          <div className="absolute inset-0 z-50">
            <BattleArena
              locationId={battleLocationId}
              locationName={battleLoc.name}
              bgUrl={battleLocDetail?.bgUrl ?? null}
              accent={accent}
              battlePotionSlots={battlePotionSlots}
              equippedPets={battlePets as any}
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
          </div>
        );
      })()}

      {showFishing && activeLocationId && (() => {
        const fishLoc = locations.find(l => l.id === activeLocationId);
        if (!fishLoc) return null;
        return (
          <FishingPage
            locationId={activeLocationId}
            locationName={fishLoc.name}
            bgUrl={fishLoc.bgUrl ?? activeLocDetail?.bgUrl ?? null}
            worldId={worldId}
            user={currentUser}
            onClose={() => {
              setShowFishing(false);
              setActiveLocationId(null);
            }}
          />
        );
      })()}

      {showSellFish && (
        <SellFishPage
          user={currentUser}
          worldId={worldId}
          onClose={() => setShowSellFish(false)}
          onUserUpdate={(u) => setCurrentUser(u)}
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

      {cauldronOpen && (
        <CauldronPanel
          inventory={inventory}
          contents={cauldronContents}
          onAdd={(invId) => addToCauldronMutation.mutate(invId)}
          onClear={() => clearCauldronMutation.mutate()}
          onClose={() => setCauldronOpen(false)}
          isAdding={addToCauldronMutation.isPending}
          isClearing={clearCauldronMutation.isPending}
        />
      )}

      {/* Cauldron "Under Construction" modal for non-admins */}
      {showCauldronConstruction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCauldronConstruction(false)} />
          <div
            className="relative z-10 flex flex-col items-center justify-center px-6 py-10 rounded-xl text-center"
            style={{
              maxWidth: 300,
              background: "linear-gradient(135deg, rgba(20,10,40,0.97) 0%, rgba(35,15,60,0.97) 100%)",
              border: "1.5px solid rgba(240,192,64,0.35)",
              boxShadow: "0 0 30px rgba(240,192,64,0.15), 0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            <div className="text-4xl mb-3">🛠️</div>
            <h3 className="font-fantasy text-lg font-semibold tracking-wider mb-2" style={{ color: "#f0c040" }}>
              Under Construction
            </h3>
            <p className="font-fantasy text-sm" style={{ color: "#e8ddd0", lineHeight: 1.5 }}>
              The Mixing Tree is not yet ready for visitors.
            </p>
            <button
              onClick={() => setShowCauldronConstruction(false)}
              className="mt-5 font-fantasy text-xs tracking-wider transition-transform active:scale-95"
              style={{
                background: "rgba(240,192,64,0.18)",
                border: "1px solid rgba(240,192,64,0.35)",
                color: "#f0c040",
                borderRadius: "8px",
                padding: "8px 20px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Player decor message popup */}
      {showDecorMsg && (
        <div
          className="fixed z-50"
          style={{ inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "90px" }}
          onClick={() => setShowDecorMsg(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="font-fantasy text-sm text-center px-5 py-3 rounded-2xl"
            style={{
              maxWidth: 300,
              background: "linear-gradient(135deg, rgba(20,10,40,0.97) 0%, rgba(35,15,60,0.97) 100%)",
              border: `1.5px solid ${accent}60`,
              boxShadow: `0 0 30px ${accent}30, 0 8px 32px rgba(0,0,0,0.7)`,
              color: "#e8ddd0",
              textShadow: "0 0 10px rgba(255,255,255,0.15)",
              lineHeight: 1.5,
            }}
          >
            <p style={{ marginBottom: 8 }}>{showDecorMsg.text}</p>
            <button
              onClick={() => setShowDecorMsg(null)}
              className="font-fantasy text-[10px] tracking-wider"
              style={{ background: "none", border: "none", color: `${accent}88`, cursor: "pointer" }}
            >[ dismiss ]</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PondFishEntry {
  id: string;
  locationId: string;
  shopItemId: string;
  createdAt: string;
  item: {
    id: string;
    name: string;
    imageUrl: string | null;
    starRarity: number | null;
  } | null;
}

interface FishingShopItem {
  id: string;
  name: string;
  imageUrl: string | null;
  starRarity: number | null;
  fishingType: string | null;
  type: string;
}

function PondAdminModal({ locationId, accent, onClose }: { locationId: string; accent: string; onClose: () => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pondFish = [], isLoading } = useQuery<PondFishEntry[]>({
    queryKey: ["/api/admin/location", locationId, "pond-fish"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${locationId}/pond-fish`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allFishItems = [] } = useQuery<FishingShopItem[], Error, FishingShopItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
    select: (data) => (data as FishingShopItem[]).filter((i) => i.type === "fishing" && i.fishingType === "fish"),
    enabled: showPicker,
  });

  const addMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      const res = await apiRequest("POST", `/api/admin/location/${locationId}/pond-fish`, { shopItemId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", locationId, "pond-fish"] });
      setShowPicker(false);
      toast({ title: "Fish added", description: "Fish stocked in pond" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not add fish", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (shopItemId: string) => {
      await apiRequest("DELETE", `/api/admin/location/${locationId}/pond-fish/${shopItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", locationId, "pond-fish"] });
      toast({ title: "Removed", description: "Fish removed from pond" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not remove fish", variant: "destructive" });
    },
  });

  const existingIds = new Set(pondFish.map(f => f.shopItemId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-[90%] max-w-sm rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(8,18,40,0.98) 0%, rgba(15,30,60,0.98) 100%)",
          border: `1px solid ${accent}55`,
          boxShadow: `0 8px 40px rgba(0,0,0,0.8)`,
          maxHeight: "calc(75*var(--vh))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${accent}25` }}>
          <h3 className="font-fantasy text-sm tracking-widest" style={{ color: accent, textShadow: `0 0 10px ${accent}40` }}>
            <img src={fishRodIconWp} alt="" style={{ width: 16, height: 16, objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />Pond Stocking
          </h3>
          <button
            data-testid="button-close-pond-admin"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: `${accent}20`, border: `1px solid ${accent}40`, color: accent, cursor: "pointer", fontSize: "12px" }}
          >
            X
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-6">
              <p className="font-fantasy text-xs animate-pulse" style={{ color: accent }}>Loading pond...</p>
            </div>
          ) : pondFish.length === 0 ? (
            <div className="text-center py-6">
              <img src={fishRodIconWp} alt="" style={{ width: 40, height: 40, objectFit: "contain", margin: "0 auto 8px", display: "block", opacity: 0.7 }} />
              <p className="font-fantasy text-xs tracking-wider" style={{ color: `${accent}88` }}>Pond is empty — stock some fish!</p>
            </div>
          ) : (
            pondFish.map(entry => (
              <div
                key={entry.id}
                data-testid={`pond-fish-entry-${entry.id}`}
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{ background: `${accent}08`, border: `1px solid ${accent}20` }}
              >
                <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${accent}20` }}>
                  {entry.item?.imageUrl ? (
                    <img src={entry.item.imageUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <img src={fishCommonIconWp} alt="" style={{ width: 24, height: 24, objectFit: "contain", opacity: 0.6 }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-fantasy text-xs truncate" style={{ color: accent }}>{entry.item?.name || "Unknown Fish"}</p>
                  {entry.item?.starRarity && (
                    <p className="font-fantasy text-[8px]" style={{ color: "#f0c040" }}>{"★".repeat(entry.item.starRarity)}</p>
                  )}
                </div>
                <button
                  data-testid={`button-remove-pond-fish-${entry.shopItemId}`}
                  onClick={() => removeMutation.mutate(entry.shopItemId)}
                  disabled={removeMutation.isPending}
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(220,38,38,0.3)", border: "1px solid rgba(220,38,38,0.4)", cursor: "pointer", color: "#fca5a5" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 pb-4 pt-2 flex-shrink-0" style={{ borderTop: `1px solid ${accent}15` }}>
          {!showPicker ? (
            <button
              data-testid="button-add-fish-to-pond"
              onClick={() => setShowPicker(true)}
              className="w-full py-2.5 rounded-md font-fantasy text-xs tracking-wider flex items-center justify-center gap-2"
              style={{ background: `${accent}15`, border: `1px solid ${accent}40`, color: accent, cursor: "pointer" }}
            >
              <Plus className="w-4 h-4" /> Add Fish to Pond
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-fantasy text-[10px] tracking-wider" style={{ color: `${accent}88` }}>Select fish to stock:</p>
                <button onClick={() => setShowPicker(false)} className="font-fantasy text-[9px]" style={{ color: `${accent}60`, cursor: "pointer", background: "none", border: "none" }}>Cancel</button>
              </div>
              {allFishItems.filter(f => !existingIds.has(f.id)).length === 0 ? (
                <p className="font-fantasy text-[10px] text-center py-2" style={{ color: `${accent}60` }}>All fish already stocked or none created yet</p>
              ) : (
                allFishItems.filter(f => !existingIds.has(f.id)).map(fish => (
                  <button
                    key={fish.id}
                    data-testid={`button-pick-pond-fish-${fish.id}`}
                    onClick={() => addMutation.mutate(fish.id)}
                    disabled={addMutation.isPending}
                    className="w-full flex items-center gap-2 p-2 rounded-lg disabled:opacity-50 text-left"
                    style={{ background: `${accent}08`, border: `1px solid ${accent}20`, cursor: "pointer" }}
                  >
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                      {fish.imageUrl ? <img src={fish.imageUrl} alt="" className="w-full h-full object-contain" /> : <img src={fishCommonIconWp} alt="" className="w-full h-full object-contain opacity-60" />}
                    </div>
                    <div>
                      <p className="font-fantasy text-xs" style={{ color: accent }}>{fish.name}</p>
                      {fish.starRarity && <p className="font-fantasy text-[8px]" style={{ color: "#f0c040" }}>{"★".repeat(fish.starRarity)}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CauldronOverlay — the bayou cauldron decoration shown inside the Mixing
// Tree's interior view. Players see it as a clickable scene element that
// opens the ingredient panel. Admins additionally get a drag handle (move
// the whole cauldron around the scene) and a corner resize grip (change
// its size). Position + size are persisted server-side so changes are
// shared by everyone and survive restarts.
// ─────────────────────────────────────────────────────────────────────────────
function CauldronOverlay({
  isAdmin, x, y, size, onCommit, onClick,
}: {
  isAdmin: boolean;
  x: number;
  y: number;
  size: number;
  onCommit: (layout: { x: number; y: number; size: number }) => void;
  onClick: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; size: number } | null>(null);
  const dragStateRef = useRef<{
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startSize: number;
    parentRect: DOMRect;
  } | null>(null);

  const cur = draft ?? { x, y, size };

  const beginDrag = (mode: "move" | "resize", e: React.PointerEvent) => {
    if (!isAdmin) return;
    const parent = wrapRef.current?.parentElement;
    if (!parent) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: cur.x,
      startY: cur.y,
      startSize: cur.size,
      parentRect: parent.getBoundingClientRect(),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    const dxPct = ((e.clientX - s.startClientX) / s.parentRect.width) * 100;
    const dyPct = ((e.clientY - s.startClientY) / s.parentRect.height) * 100;
    if (s.mode === "move") {
      setDraft({
        x: Math.max(0, Math.min(100, s.startX + dxPct)),
        y: Math.max(0, Math.min(100, s.startY - dyPct)), // y is from bottom
        size: s.startSize,
      });
    } else {
      setDraft({
        x: s.startX,
        y: s.startY,
        size: Math.max(10, Math.min(90, s.startSize + dxPct)),
      });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragStateRef.current = null;
    if (draft) {
      onCommit(draft);
      // keep the draft until the parent re-renders with the new server value;
      // clearing here briefly causes a flicker if the query hasn't updated.
      setTimeout(() => setDraft(null), 0);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="absolute"
      style={{
        left: `${cur.x}%`,
        bottom: `${cur.y}%`,
        transform: "translateX(-50%)",
        width: `${cur.size}%`,
        maxWidth: 320,
        // Must sit above the location view's `relative z-10` content layer
        // (which spans the full screen with h-full and would otherwise eat
        // every pointerdown — that's why admin drag/resize wasn't firing).
        zIndex: 20,
        cursor: isAdmin ? "move" : "pointer",
        touchAction: "none",
      }}
      onPointerDown={(e) => isAdmin && beginDrag("move", e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        // Suppress click-after-drag for admins so a move gesture doesn't open
        // the panel. Players just get the open behaviour.
        if (isAdmin && draft) return;
        e.stopPropagation();
        onClick();
      }}
      data-testid="cauldron-mixing-tree"
    >
      {/* under-cauldron glow puddle */}
      <div
        className="pointer-events-none"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-6%",
          transform: "translateX(-50%)",
          width: "92%",
          height: 28,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(45,212,191,0.45) 0%, rgba(20,83,75,0.22) 45%, transparent 75%)",
          filter: "blur(7px)",
        }}
      />
      <img
        src={mixingTreeCauldronImg}
        alt=""
        className="w-full h-auto block select-none pointer-events-none"
        draggable={false}
        style={{
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.65)) drop-shadow(0 0 12px rgba(45,138,120,0.45))",
        }}
      />
      {isAdmin && (
        <>
          {/* admin outline so the draggable hit-area is visible */}
          <div
            className="absolute inset-0 pointer-events-none rounded-md"
            style={{
              border: "1px dashed rgba(94,234,212,0.55)",
              boxShadow: "inset 0 0 16px rgba(94,234,212,0.18)",
            }}
          />
          {/* resize grip — bottom-right corner */}
          <div
            onPointerDown={(e) => beginDrag("resize", e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute"
            data-testid="cauldron-resize-handle"
            style={{
              right: -8,
              bottom: -8,
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)",
              border: "1.5px solid rgba(20,30,30,0.85)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
              cursor: "nwse-resize",
              touchAction: "none",
            }}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CauldronPanel — modal that shows the player's "Ingredients" inventory and
// the cauldron's current contents. Players tap or drag an ingredient onto
// the cauldron drop-zone to add one of it (decrements inventory and appends
// to the per-user cauldron contents).
// ─────────────────────────────────────────────────────────────────────────────
function CauldronPanel({
  inventory, contents, onAdd, onClear, onClose, isAdding, isClearing,
}: {
  inventory: InventoryItem[];
  contents: Array<{ shopItemId: string; quantity: number; name: string; imageUrl: string | null }>;
  onAdd: (inventoryId: string) => void;
  onClear: () => void;
  onClose: () => void;
  isAdding: boolean;
  isClearing: boolean;
}) {
  const ingredients = useMemo(
    () => inventory.filter((i) => i.type === "ingredient"),
    [inventory]
  );
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  // Cap how many ingredients can sit in the cauldron at once. Two-item
  // mixing is the next mechanic we'll layer on top, so the brew must be
  // exactly two ingredients before anything happens. Tapping/dropping a
  // third ingredient is rejected with a friendly toast.
  const CAULDRON_CAPACITY = 2;
  const totalInCauldron = contents.reduce((n, c) => n + c.quantity, 0);
  const isFull = totalInCauldron >= CAULDRON_CAPACITY;

  const tryAdd = (invId: string) => {
    if (isFull) {
      toast({
        title: "Cauldron is full",
        description: `Only ${CAULDRON_CAPACITY} ingredients at a time. Clear it to start a new brew.`,
      });
      return;
    }
    onAdd(invId);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const invId = e.dataTransfer.getData("text/plain");
    if (invId) tryAdd(invId);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
      {/* Soft scrim — tappable to close, but doesn't darken the cauldron
          much so the player can still see what they're brewing. */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />
      <div
        className="relative w-full rounded-t-2xl p-4 animate-slide-up overflow-hidden pointer-events-auto"
        style={{
          background: "linear-gradient(135deg, rgba(20,30,28,0.98) 0%, rgba(15,40,38,0.98) 100%)",
          border: "1px solid rgba(94,234,212,0.45)",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 30px rgba(45,212,191,0.18)",
          maxHeight: "calc(55*var(--vh))",
        }}
      >
        <button
          data-testid="button-close-cauldron"
          onClick={onClose}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1e3a36 0%, #0f2422 100%)", border: "1.5px solid rgba(94,234,212,0.5)", color: "#5eead4", cursor: "pointer" }}
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-fantasy text-center text-base tracking-[0.18em] mb-3" style={{ color: "#5eead4", textShadow: "0 0 14px rgba(94,234,212,0.4)" }}>
          The Cauldron
        </h3>

        {/* Drop zone — visual cauldron + current contents */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="rounded-xl p-3 mb-3"
          data-testid="cauldron-drop-zone"
          style={{
            background: dragOver
              ? "radial-gradient(circle at 50% 60%, rgba(94,234,212,0.28) 0%, rgba(15,40,38,0.7) 70%)"
              : "radial-gradient(circle at 50% 60%, rgba(45,212,191,0.12) 0%, rgba(15,40,38,0.6) 70%)",
            border: `1px dashed rgba(94,234,212,${dragOver ? 0.85 : 0.45})`,
            transition: "all 120ms ease",
            minHeight: 110,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-fantasy text-[10px] tracking-wider" style={{ color: "#5eead4aa" }}>
              In the cauldron · {totalInCauldron}/{CAULDRON_CAPACITY}
            </span>
            {totalInCauldron > 0 && (
              <button
                data-testid="button-clear-cauldron"
                onClick={onClear}
                disabled={isClearing}
                className="font-fantasy text-[10px] tracking-wider disabled:opacity-50"
                style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}
              >
                Clear
              </button>
            )}
          </div>
          {/* Two explicit slots — once both are filled, the brew is ready
              for the upcoming "mix" mechanic. We render contents flat by
              expanding each row's quantity into individual slot pips so a
              ×2 of the same ingredient still shows as two slots filled. */}
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const slots: Array<{ shopItemId: string; name: string; imageUrl: string | null } | null> = [];
              for (const c of contents) {
                for (let i = 0; i < c.quantity; i++) {
                  slots.push({ shopItemId: c.shopItemId, name: c.name, imageUrl: c.imageUrl });
                }
              }
              while (slots.length < CAULDRON_CAPACITY) slots.push(null);
              return slots.slice(0, CAULDRON_CAPACITY).map((s, idx) => (
                <div
                  key={idx}
                  data-testid={`cauldron-slot-${idx}`}
                  className="flex flex-col items-center justify-center rounded-lg"
                  style={{
                    background: s ? "rgba(94,234,212,0.10)" : "rgba(94,234,212,0.04)",
                    border: `1px ${s ? "solid" : "dashed"} rgba(94,234,212,${s ? 0.30 : 0.25})`,
                    minHeight: 64,
                    padding: 6,
                  }}
                >
                  {s ? (
                    <>
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt="" className="w-9 h-9 object-contain" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-black/30" />
                      )}
                      <p className="font-fantasy text-[9px] leading-tight text-center mt-0.5 line-clamp-1" style={{ color: "#d1faf3" }}>{s.name}</p>
                    </>
                  ) : (
                    <span className="font-fantasy text-[10px]" style={{ color: "#5eead466" }}>empty slot</span>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Ingredients inventory */}
        <div className="mb-1 flex items-center justify-between">
          <h4 className="font-fantasy text-xs tracking-wider" style={{ color: "#d1faf3" }}>Your Ingredients</h4>
          <span className="font-fantasy text-[10px]" style={{ color: isFull ? "#fca5a5" : "#5eead488" }}>
            {isFull ? "cauldron full · clear to add more" : "tap or drag to add"}
          </span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(28*var(--vh))" }}>
          {ingredients.length === 0 ? (
            <p className="font-fantasy text-xs text-center py-6" style={{ color: "#5eead466" }}>
              You don't have any ingredients yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {ingredients.map((ing) => (
                <button
                  key={ing.inventoryId}
                  data-testid={`button-add-ingredient-${ing.inventoryId}`}
                  draggable={!isFull}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", ing.inventoryId); }}
                  onClick={() => tryAdd(ing.inventoryId)}
                  disabled={isAdding || isFull}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg disabled:opacity-50"
                  style={{
                    background: "rgba(94,234,212,0.08)",
                    border: "1px solid rgba(94,234,212,0.22)",
                    cursor: "grab",
                  }}
                >
                  <div className="w-12 h-12 rounded-md flex items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                    {ing.imageUrl ? (
                      <img src={ing.imageUrl} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="font-fantasy text-[10px]" style={{ color: "#5eead466" }}>?</span>
                    )}
                  </div>
                  <p className="font-fantasy text-[10px] text-center leading-tight line-clamp-2" style={{ color: "#d1faf3" }}>{ing.name}</p>
                  {(ing.quantity ?? 1) > 1 && (
                    <p className="font-fantasy text-[9px]" style={{ color: "#5eead4aa" }}>×{ing.quantity}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
