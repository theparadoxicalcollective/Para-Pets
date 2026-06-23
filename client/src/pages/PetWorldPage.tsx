import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, FlipHorizontal, Palette, MapPin, Minus, Store, DoorOpen, Package } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";
import { playShopBell, playChime, playTick } from "@/lib/sounds";
import { DESIGN_W, DESIGN_H, getStageScale } from "@/lib/stage";
import { burstGoldenOrbs } from "@/lib/goldenOrbs";
import priceTagImg from "@assets/price_tag.png";
import questArrowImg from "@assets/Photoroom_20260616_95112_PM_1781667768792.png";
import PetAnimator from "@/components/PetAnimator";
import UserProfilePanel from "@/components/UserProfilePanel";
import bgGround from "@assets/IMG_6459_1774675340089.jpeg";
import coinIconImg from "@assets/icon_coin.png";
import petHouseIconImg from "@assets/icon_pet_house.png";
import joystickBaseImg  from "@assets/generated_images/joystick_base.png";
import joystickThumbImg from "@assets/generated_images/joystick_thumb_v3.png";

const WORLD_ID = "pet_world";
const ACCENT = "#7fffd4";
const MAP_W = 1080;
// LOCKED — derived from bgGround (IMG_6459_1774675340089.jpeg) 3000×1920.
// NEVER change after admin has placed KC doors/decor — all positions are stored
// as percentages of (MAP_W × KC_MAP_H). Changing this shifts everything.
const KC_MAP_H = 691;
const MAP_H_DEFAULT = KC_MAP_H;


const LIGHT_ORB_SENTINEL        = "__light_orb__";
const LIGHT_ORB_BLUE_SENTINEL   = "__light_orb_blue__";
const LIGHT_ORB_GREEN_SENTINEL  = "__light_orb_green__";
const LIGHT_ORB_PURPLE_SENTINEL = "__light_orb_purple__";
const FIREFLIES_SENTINEL        = "__fireflies__";
const PASS_THROUGH_SENTINELS = new Set([
  LIGHT_ORB_SENTINEL, LIGHT_ORB_BLUE_SENTINEL,
  LIGHT_ORB_GREEN_SENTINEL, LIGHT_ORB_PURPLE_SENTINEL,
  FIREFLIES_SENTINEL,
]);

function getOrbGradient(s: string) {
  if (s === LIGHT_ORB_BLUE_SENTINEL)
    return "radial-gradient(circle, rgba(150,200,255,0.48) 0%, rgba(90,155,255,0.28) 20%, rgba(60,110,255,0.14) 45%, rgba(40,80,220,0.05) 65%, transparent 80%)";
  if (s === LIGHT_ORB_GREEN_SENTINEL)
    return "radial-gradient(circle, rgba(150,255,190,0.48) 0%, rgba(80,230,130,0.28) 20%, rgba(50,190,90,0.14) 45%, rgba(40,160,70,0.05) 65%, transparent 80%)";
  if (s === LIGHT_ORB_PURPLE_SENTINEL)
    return "radial-gradient(circle, rgba(220,150,255,0.48) 0%, rgba(175,95,252,0.28) 20%, rgba(140,65,225,0.14) 45%, rgba(110,45,205,0.05) 65%, transparent 80%)";
  return "radial-gradient(circle, rgba(255,235,150,0.48) 0%, rgba(255,200,70,0.28) 20%, rgba(255,145,10,0.14) 45%, rgba(255,110,0,0.05) 65%, transparent 80%)";
}

function seededRand(seed: string, n: number) {
  let h = (n + 1) * 2654435761;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

type DecorItem      = { id: string; worldId: string; name: string; imageUrl: string; createdAt: string };
type KcDoor         = { id: string; worldId: string; name: string; posX: number; posY: number; triggerRadius: number; bgUrl: string | null; isShop: boolean; createdAt: string };
type KcDoorDecorP   = { id: string; doorId: string; name: string; imageUrl: string; posX: number; posY: number; size: number; flipped: boolean; createdAt: string };
type DecorPlacement = { id: string; worldId: string; decorItemId: string; name: string; imageUrl: string; posX: number; posY: number; size: number; flipped: boolean; message: string | null; createdAt: string };
type KCLocation     = { id: string; worldId: string; name: string; type: string; iconUrl: string | null; bgUrl: string | null; description: string | null; posX: number; posY: number; isShop: boolean; glowColor: string | null; iconSize: number; flipped: boolean; sortOrder: number; ownerImageUrl: string | null };
type KCShopItem     = { id: string; name: string; price: number; type: string; imageUrl: string | null; rarity: number | null; hatchTime: number | null; eggImageUrl: string | null; hatchedImageUrl: string | null; worldId: string; description?: string | null; giftPoints?: number | null };
type WorldActivePet = {
  userId: string;
  username: string;
  profileImage: string | null;
  inventoryId: string;
  shopItemId: string;
  name: string;
  petNickname: string | null;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  petLevel: number;
  petHealth: number | null;
  petAtk: number | null;
  petDef: number | null;
  rarity: number | null;
  petTemplateId: string | null;
  facingDirection: string | null;
  posX: number | null;
  posY: number | null;
};

function makeInstanceId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface PetWorldPageProps {
  user: { id: string; isAdmin: boolean };
  onClose: () => void;
}

export default function PetWorldPage({ user, onClose }: PetWorldPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const shopHintLocId = new URLSearchParams(searchString).get("shopHint");

  // ── map pan state ──────────────────────────────────────────────────────────
  const [mapX, setMapX]         = useState(0);
  const [mapY, setMapY]         = useState(0);
  const [mapScale, setMapScale] = useState(1);
  const [mapH, setMapH]         = useState(MAP_H_DEFAULT);
  const mapHRef                 = useRef(MAP_H_DEFAULT);

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
  const mapTransformRef         = useRef({ x: 0, y: 0, scale: 1 });
  const mapPanPointersRef       = useRef(new Map<number, { x: number; y: number }>());
  const mapPanStartRef          = useRef<{ x: number; y: number; mapX: number; mapY: number } | null>(null);
  const mapPanningRef           = useRef(false);
  const mapJustPannedRef        = useRef(false);
  const pinchStartRef           = useRef<{ dist: number; scale: number; midX: number; midY: number; mapX: number; mapY: number } | null>(null);
  // Pet tap detection — set on pointer-down, consumed on pointer-up if no drag
  const petTapRef               = useRef<string | null>(null); // userId under the pointer

  // ── decor drag state ───────────────────────────────────────────────────────
  const areaRef          = useRef<HTMLDivElement>(null);
  const decorDragRef     = useRef<{ placementId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const decorDidDrag     = useRef(false);
  const panelDragRef     = useRef<{ item: DecorItem } | null>(null);

  const [decorDragPos,   setDecorDragPos]   = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [panelDragGhost, setPanelDragGhost] = useState<{ clientX: number; clientY: number; item: DecorItem } | null>(null);

  // ── layer order — tracks which item was most recently moved ────────────────
  // Most-recently-moved ID is last in the array → gets the highest z-index boost.
  const [locMoveOrder,   setLocMoveOrder]   = useState<string[]>([]);
  const [decorMoveOrder, setDecorMoveOrder] = useState<string[]>([]);

  const [petIsMoving,         setPetIsMoving]          = useState(false);
  const [facingLeft,          setFacingLeft]           = useState(false);
  const facingLeftRef = useRef(false);

  // ── panel state ────────────────────────────────────────────────────────────
  const [showDecorPanel,   setShowDecorPanel]   = useState(false);
  const [showAddDecorForm, setShowAddDecorForm] = useState(false);
  const [newDecorName,     setNewDecorName]     = useState("");
  const [newDecorImage,    setNewDecorImage]    = useState<string | null>(null);
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);
  const [acceptedNotifMessages, setAcceptedNotifMessages] = useState<string[]>([]);

  // ── location state ─────────────────────────────────────────────────────────
  const [activeLocId,       setActiveLocId]       = useState<string | null>(null);
  const [showLocShop,       setShowLocShop]       = useState(false);
  const [showPlacesPanel,   setShowPlacesPanel]   = useState(false);
  const [showAddLocForm,    setShowAddLocForm]     = useState(false);
  const [newLocName,        setNewLocName]         = useState("");
  const [newLocGlow,        setNewLocGlow]         = useState("#d4a017");
  const [newLocIcon,        setNewLocIcon]         = useState<string | null>(null);
  const [newLocOwner,       setNewLocOwner]        = useState<string | null>(null);
  const [selectedLocId,     setSelectedLocId]      = useState<string | null>(null);
  const [locDragPos,        setLocDragPos]         = useState<{ id: string; x: number; y: number } | null>(null);
  const locDragRef    = useRef<{ locId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const locDidDrag    = useRef(false);

  // ── door state ─────────────────────────────────────────────────────────────
  const [showDoorsPanel,      setShowDoorsPanel]      = useState(false);
  const [activeDoorId,        setActiveDoorId]        = useState<string | null>(null);
  const [selectedDoorId,      setSelectedDoorId]      = useState<string | null>(null);
  const [doorDragPos,         setDoorDragPos]         = useState<{ id: string; x: number; y: number } | null>(null);
  const [showDoorAddDecorForm,setShowDoorAddDecorForm]= useState(false);
  const [newDoorDecorName,    setNewDoorDecorName]    = useState("");
  const [newDoorDecorImage,   setNewDoorDecorImage]   = useState<string | null>(null);
  const [selectedDoorDecorId, setSelectedDoorDecorId]= useState<string | null>(null);
  const [doorDecorDragPos,    setDoorDecorDragPos]    = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingDoor,         setEditingDoor]         = useState<KcDoor | null>(null);
  const [doorEditName,        setDoorEditName]        = useState("");
  const [doorEditRadius,      setDoorEditRadius]      = useState(6);
  const [doorEditIsShop,      setDoorEditIsShop]      = useState(false);
  const [showDoorItemPicker,  setShowDoorItemPicker]  = useState(false);
  const [doorPickerTab,       setDoorPickerTab]       = useState<"items"|"house"|"decor">("items");
  const [doorPickerFilter,    setDoorPickerFilter]    = useState("all");
  const [selectedDoorShopItem, setSelectedDoorShopItem] = useState<KCShopItem | null>(null);
  const [doorBuyStep,         setDoorBuyStep]         = useState<0 | 1 | 2>(0);
  const [doorBuyQty,          setDoorBuyQty]          = useState(1);
  const [doorBuyError,        setDoorBuyError]        = useState<string | null>(null);
  const [bgPanX,            setBgPanX]            = useState(0);
  const bgPanXRef       = useRef(0);
  const [bgRenderedW,       setBgRenderedW]        = useState(0);
  const bgPanDragRef    = useRef<{ startX: number; startPan: number } | null>(null);
  const bgNaturalSizeRef= useRef<{ w: number; h: number } | null>(null);
  const doorDragRef     = useRef<{ doorId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const doorDidDrag     = useRef(false);
  const doorDragLivePosRef = useRef<{ x: number; y: number } | null>(null);
  const doorDecorDragRef= useRef<{ placementId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const doorDecorDragLivePosRef = useRef<{ x: number; y: number } | null>(null);
  const doorDecorDidDrag= useRef(false);
  const kcDoorsRef      = useRef<KcDoor[]>([]);
  const activeDoorIdRef = useRef<string | null>(null);
  const doorCooldownRef = useRef<string | null>(null);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: decorItems = [] } = useQuery<DecorItem[]>({
    queryKey: ["/api/world", WORLD_ID, "decor", "items"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/decor/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: decorPlacements = [] } = useQuery<DecorPlacement[]>({
    queryKey: ["/api/world", WORLD_ID, "decor", "placements"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/decor/placements`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // ── Online pets — driven entirely by SSE events, no polling ───────────────
  const [onlinePets, setOnlinePets] = useState<WorldActivePet[]>([]);
  const onlinePetsRef = useRef<WorldActivePet[]>([]);
  onlinePetsRef.current = onlinePets;

  const [showProfile, setShowProfile] = useState(false);

  const { data: me } = useQuery<{
    id: string; username: string; email: string; profileImage: string | null;
    coins: number; isAdmin: boolean; activePetId: string | null;
    lastUsernameChange: string | null; lastProfilePicChange: string | null;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: friends = [] } = useQuery<any[]>({
    queryKey: ["/api/friends"],
    enabled: showFriendsPanel,
    refetchInterval: showFriendsPanel ? 15000 : false,
  });

  const { data: friendRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/friends/requests"],
    enabled: showFriendsPanel,
    refetchInterval: showFriendsPanel ? 15000 : false,
  });

  const { data: friendRequestCount = 0 } = useQuery<number>({
    queryKey: ["/api/friends/requests/count"],
    select: (d: any) => (typeof d === "number" ? d : d?.count ?? 0),
  });

  const { data: unreadFriendNotifs = [] } = useQuery<{ id: string; type: string; message: string }[]>({
    queryKey: ["/api/notifications/unread"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return (all as any[]).filter((n: any) => n.type === "friend_accepted");
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const markNotifsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/mark-read", {});
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] }),
  });

  const acceptRequestMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/friends/accept/${requestId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not accept request.", variant: "destructive" }),
  });

  const declineRequestMutation = useMutation({
    mutationFn: (otherId: string) => apiRequest("DELETE", `/api/friends/${otherId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests/count"] });
    },
    onError: () => toast({ title: "Error", description: "Could not decline request.", variant: "destructive" }),
  });

  const removeFriendMutation = useMutation({
    mutationFn: (friendId: string) => apiRequest("DELETE", `/api/friends/${friendId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    },
    onError: () => toast({ title: "Error", description: "Could not remove friend.", variant: "destructive" }),
  });

  // ── location queries ────────────────────────────────────────────────────────
  const { data: kcLocations = [] } = useQuery<KCLocation[]>({
    queryKey: ["/api/world", WORLD_ID, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: locShopItems = [] } = useQuery<KCShopItem[]>({
    queryKey: ["/api/location", activeLocId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeLocId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: showLocShop && !!activeLocId,
    staleTime: 30_000,
  });

  const { data: kcDoors = [] } = useQuery<KcDoor[]>({
    queryKey: ["/api/world", WORLD_ID, "kc-doors"],
    queryFn: async () => {
      const res = await fetch(`/api/world/${WORLD_ID}/kc-doors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: doorDecorPlacements = [] } = useQuery<KcDoorDecorP[]>({
    queryKey: ["/api/kc-doors", activeDoorId, "decor"],
    queryFn: async () => {
      const res = await fetch(`/api/kc-doors/${activeDoorId}/decor`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!activeDoorId,
  });

  const { data: doorShopItems = [] } = useQuery<KCShopItem[]>({
    queryKey: ["/api/location", activeDoorId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/location/${activeDoorId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!activeDoorId,
    staleTime: 30_000,
  });

  type AllShopItem = KCShopItem & { locationId?: string | null; fishingType?: string | null };
  const { data: allDoorShopItems = [], isLoading: allDoorShopItemsLoading } = useQuery<AllShopItem[]>({
    queryKey: ["/api/admin/shop-items-all"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop-items-all", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: user?.isAdmin && showDoorItemPicker,
    staleTime: 30_000,
  });

  const { data: allAdminBundles = [] } = useQuery<{ id: string; name: string; shopImageUrl: string | null; price: number }[]>({
    queryKey: ["/api/admin/house-bundles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/house-bundles", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.isAdmin && showDoorItemPicker,
    staleTime: 30_000,
  });

  const { data: allAdminDecor = [] } = useQuery<{ id: string; name: string; imageUrl: string | null; price: number }[]>({
    queryKey: ["/api/admin/home-decor"],
    queryFn: async () => {
      const res = await fetch("/api/admin/home-decor", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.isAdmin && showDoorItemPicker,
    staleTime: 30_000,
  });

  const { data: doorShopBundles = [] } = useQuery<{ id: string; bundleId: string }[]>({
    queryKey: ["/api/admin/location", activeDoorId, "shop-bundles"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${activeDoorId}/shop-bundles`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.isAdmin && !!activeDoorId && showDoorItemPicker,
    staleTime: 0,
  });

  const { data: doorShopDecor = [] } = useQuery<{ id: string; decorId: string }[]>({
    queryKey: ["/api/admin/location", activeDoorId, "shop-decor"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/location/${activeDoorId}/shop-decor`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.isAdmin && !!activeDoorId && showDoorItemPicker,
    staleTime: 0,
  });

  // ── location mutations ──────────────────────────────────────────────────────
  const addLocMutation = useMutation({
    mutationFn: async (data: { name: string; iconData?: string | null; ownerImageData?: string | null; glowColor?: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/location`, { ...data, type: "landmark", isShop: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] });
      setShowAddLocForm(false);
      setNewLocName(""); setNewLocIcon(null); setNewLocOwner(null);
      toast({ title: "Place Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add place", variant: "destructive" }),
  });

  const deleteLocMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/location/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const updateLocPositionMutation = useMutation({
    mutationFn: async ({ locationId, posX, posY }: { locationId: string; posX: number; posY: number }) => {
      await apiRequest("PATCH", `/api/admin/world/location/${locationId}/position`, { posX, posY });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const updateLocSizeMutation = useMutation({
    mutationFn: async ({ locationId, iconSize }: { locationId: string; iconSize: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/location/${locationId}`, { iconSize });
      return res.json();
    },
    onMutate: async ({ locationId, iconSize }) => {
      queryClient.setQueryData<KCLocation[]>(["/api/world", WORLD_ID, "locations"], old =>
        old?.map(l => l.id === locationId ? { ...l, iconSize } : l)
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  const flipLocMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/admin/world/location/${id}/flip`, {}); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "locations"] }),
  });

  // ── location drag handlers ──────────────────────────────────────────────────
  const handleLocPointerDown = useCallback((e: React.PointerEvent, loc: KCLocation) => {
    if (!user.isAdmin) return;
    // Only allow dragging a location that has already been tapped/selected
    if (selectedLocId !== loc.id) return;
    if ((e.target as Element).closest("button")) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    locDidDrag.current = false;
    locDragRef.current = { locId: loc.id, startX: e.clientX, startY: e.clientY, origPosX: loc.posX, origPosY: loc.posY };
  }, [user.isAdmin, selectedLocId]);

  const handleLocPointerMove = useCallback((e: React.PointerEvent) => {
    if (!locDragRef.current || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - locDragRef.current.startX;
    const dy = e.clientY - locDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) locDidDrag.current = true;
    const newX = Math.max(-10, Math.min(110, locDragRef.current.origPosX + dx / (rect.width / 100)));
    const newY = Math.max(-10, Math.min(110, locDragRef.current.origPosY + dy / (rect.height / 100)));
    setLocDragPos({ id: locDragRef.current.locId, x: newX, y: newY });
  }, []);

  const handleLocPointerUp = useCallback(() => {
    if (!locDragRef.current) return;
    const d = locDragRef.current;
    locDragRef.current = null;
    if (locDidDrag.current && locDragPos) {
      updateLocPositionMutation.mutate({ locationId: d.locId, posX: locDragPos.x, posY: locDragPos.y });
      setLocMoveOrder(prev => [...prev.filter(id => id !== d.locId), d.locId]);
    }
    locDidDrag.current = false;
    setLocDragPos(null);
  }, [locDragPos, updateLocPositionMutation]);

  const handleLocClick = useCallback((loc: KCLocation) => {
    if (locDidDrag.current || mapJustPannedRef.current) return;
    if (user.isAdmin) {
      setSelectedLocId(prev => {
        if (prev === loc.id) {
          if (loc.isShop) { setActiveLocId(loc.id); setShowLocShop(true); playShopBell(); }
          return null;
        }
        return loc.id;
      });
    } else {
      if (loc.isShop) { setActiveLocId(loc.id); setShowLocShop(true); playShopBell(); }
    }
  }, [user.isAdmin]);

  const [selectedPet, setSelectedPet] = useState<WorldActivePet | null>(null);

  // ── Joystick / walking state ────────────────────────────────────────────────
  const [localPetPos,    setLocalPetPos]    = useState<{ x: number; y: number } | null>(null);
  const localPetPosRef   = useRef<{ x: number; y: number } | null>(null);
  const joystickDirRef   = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const joystickActRef   = useRef(false);
  const rafRef           = useRef<number | null>(null);
  const lastRafTimeRef   = useRef<number | null>(null);
  const lastSaveRef      = useRef<number>(0);

  // ── seeded default positions — spread pets across the full map canvas ───────
  // Used as a fallback when a pet has no stored server position yet.
  const petDefaultPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    onlinePets.forEach((pet, idx) => {
      if (pet.posX !== null && pet.posY !== null) {
        map.set(pet.userId, { x: pet.posX, y: pet.posY });
      } else {
        const seed = (idx + 1) * 1337;
        const rng = (n: number) => {
          let h = Math.imul(Math.floor(seed * 10000 + n), 0x9e3779b9);
          h ^= h >>> 16;
          return (h >>> 0) / 4294967295;
        };
        map.set(pet.userId, {
          x: 10 + rng(1) * 75,
          y: 40 + rng(2) * 45,
        });
      }
    });
    return map;
  }, [onlinePets]);

  // ── Own pet + joystick movement ────────────────────────────────────────────
  const ownPet = useMemo(() => onlinePets.find(p => p.userId === user.id), [onlinePets, user.id]);

  // Fetch own pet's template so we know the natural facing of its still-image
  // sprite. This lets us initialize `facingLeft` to the natural direction
  // BEFORE the player has touched the joystick — without this, a left-facing
  // pet would render mirrored at rest because the XOR flip below sees
  // facingLeft=false (default) vs naturalFacingLeft=true and applies scaleX(-1).
  const { data: ownPetTemplate } = useQuery<{ facing: string }>({
    queryKey: ["/api/pet-template-parts", ownPet?.petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${ownPet!.petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!ownPet?.petTemplateId,
    staleTime: Infinity,
  });

  // Sync facingLeft to own pet's natural facing on initial load and whenever
  // the active pet swaps. Only runs while the joystick is idle so we don't
  // stomp on the player's current movement direction.
  // Must match the naturalFacingLeft formula inside WorldRoamingPet exactly.
  useEffect(() => {
    if (!ownPet || joystickActRef.current) return;
    const tplFacing = ownPetTemplate?.facing;
    const naturalLeft =
      tplFacing === "left"  ? true :
      tplFacing === "right" ? false :
      // "back" = side-profile template. These are drawn facing LEFT by convention
      // (confirmed by production data: all facingDirection fields are null, and
      // the user consistently sees wrong direction with the old "assumes right"
      // default). Override only when facingDirection is explicitly "right".
      tplFacing === "back"  ? (ownPet.facingDirection !== "right") :
      // "front" / unknown → front-facing or symmetric, default to right-facing.
      (ownPet.facingDirection === "left");
    if (facingLeftRef.current !== naturalLeft) {
      facingLeftRef.current = naturalLeft;
      setFacingLeft(naturalLeft);
    }
  }, [ownPet?.userId, ownPet?.facingDirection, ownPet?.petTemplateId, ownPetTemplate?.facing]);

  // Seed localPetPos once the player's pet is known, then center the camera on it
  useEffect(() => {
    if (ownPet && localPetPosRef.current === null) {
      const stored = petDefaultPositions.get(ownPet.userId) ?? { x: 50, y: 70 };
      const init = { x: Math.max(5, Math.min(92, stored.x)), y: Math.max(15, Math.min(90, stored.y)) };
      localPetPosRef.current = init;
      setLocalPetPos(init);
      // Pan the camera so the pet is horizontally centered in the frame on entry
      const coverSc = Math.max(frameWRef.current / MAP_W, frameHRef.current / mapHRef.current);
      const scaledMapW = MAP_W * coverSc;
      const petScreenX = (init.x / 100) * scaledMapW;
      const targetMapX = frameWRef.current / 2 - petScreenX;
      applyMapTransform(targetMapX, 0, coverSc);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownPet, petDefaultPositions]);

  // RAF movement loop — runs while joystick is active
  const startRaf = useCallback(() => {
    if (rafRef.current !== null) return;
    lastRafTimeRef.current = null;
    const loop = (now: number) => {
      const { dx, dy } = joystickDirRef.current;
      const dt = lastRafTimeRef.current === null ? 0 : Math.min((now - lastRafTimeRef.current) / 1000, 0.1);
      lastRafTimeRef.current = now;
      if (localPetPosRef.current && (dx !== 0 || dy !== 0)) {
        const nx = Math.max(5,  Math.min(92, localPetPosRef.current.x + dx * 6 * dt));
        const ny = Math.max(15, Math.min(90, localPetPosRef.current.y + dy * 4 * dt));
        localPetPosRef.current = { x: nx, y: ny };
        setLocalPetPos({ x: nx, y: ny });

        // ── Door trigger detection — always pick the closest door in range ──
        if (!activeDoorIdRef.current) {
          let closestDoor: KcDoor | null = null;
          let closestDist = Infinity;
          for (const door of kcDoorsRef.current) {
            if (doorCooldownRef.current === door.id) continue;
            const rPx    = door.triggerRadius / 100 * MAP_W;
            const doorCY = door.posY - (rPx / mapHRef.current * 100);
            const ddxPx = (nx - door.posX) / 100 * MAP_W;
            const ddyPx = (ny - doorCY) / 100 * mapHRef.current;
            const distPx = Math.sqrt(ddxPx * ddxPx + ddyPx * ddyPx);
            if (distPx < rPx && distPx < closestDist) { closestDist = distPx; closestDoor = door; }
          }
          if (closestDoor) {
            activeDoorIdRef.current = closestDoor.id;
            setActiveDoorId(closestDoor.id);
            joystickDirRef.current = { dx: 0, dy: 0 };
            if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
          }
        }

        // ── Camera follow: keep pet centered, clamped at map edges ──────────
        const { x: curMapX, y: curMapY, scale: sc } = mapTransformRef.current;
        const scaledMapW = MAP_W * sc;
        if (scaledMapW > frameWRef.current) {
          const petMapX = (nx / 100) * scaledMapW;
          const targetX = Math.max(frameWRef.current - scaledMapW, Math.min(0, frameWRef.current / 2 - petMapX));
          if (Math.abs(targetX - curMapX) > 0.5) {
            const newMapX = curMapX + (targetX - curMapX) * Math.min(1, dt * 8);
            mapTransformRef.current = { x: newMapX, y: curMapY, scale: sc };
            setMapX(newMapX);
          }
        }

        if (ownPet && now - lastSaveRef.current > 2000) {
          lastSaveRef.current = now;
          apiRequest("PATCH", "/api/world/pet_world/pet-position", { ownerUserId: ownPet.userId, posX: nx, posY: ny });
        }
      }
      if (joystickActRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [ownPet]);

  const handleJoystickChange = useCallback((dx: number, dy: number, active: boolean) => {
    joystickDirRef.current = { dx, dy };
    joystickActRef.current = active;
    setPetIsMoving(active);
    // Flip pet sprite based on horizontal movement; only re-render when it actually changes
    if (active && dx !== 0) {
      const newFacingLeft = dx < 0;
      if (newFacingLeft !== facingLeftRef.current) {
        facingLeftRef.current = newFacingLeft;
        setFacingLeft(newFacingLeft);
      }
    }
    if (active) {
      startRaf();
    } else {
      // Save final position on release
      const pos = localPetPosRef.current;
      if (pos && ownPet) {
        apiRequest("PATCH", "/api/world/pet_world/pet-position", { ownerUserId: ownPet.userId, posX: pos.x, posY: pos.y });
      }
      // Also check door triggers at the resting position — catches cases where the player
      // releases the joystick while standing inside a trigger zone
      if (!activeDoorIdRef.current && pos) {
        let closestDoor: KcDoor | null = null;
        let closestDist = Infinity;
        for (const door of kcDoorsRef.current) {
          if (doorCooldownRef.current === door.id) continue;
          const rPx    = door.triggerRadius / 100 * MAP_W;
          const doorCY = door.posY - (rPx / mapHRef.current * 100);
          const ddxPx = (pos.x - door.posX) / 100 * MAP_W;
          const ddyPx = (pos.y - doorCY) / 100 * mapHRef.current;
          const distPx = Math.sqrt(ddxPx * ddxPx + ddyPx * ddyPx);
          if (distPx < rPx && distPx < closestDist) { closestDist = distPx; closestDoor = door; }
        }
        if (closestDoor) { activeDoorIdRef.current = closestDoor.id; setActiveDoorId(closestDoor.id); }
      }
    }
  }, [ownPet, startRaf]);

  // Cleanup RAF on unmount
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  // Comprehensive door trigger check — runs on every position update so it
  // catches positions set by the server, initial load, and joystick-stopped cases.
  useEffect(() => {
    if (!localPetPos || activeDoorIdRef.current) return;
    let closestDoor: KcDoor | null = null;
    let closestDist = Infinity;
    for (const door of kcDoorsRef.current) {
      if (doorCooldownRef.current === door.id) continue;
      const rPx    = door.triggerRadius / 100 * MAP_W;
      const doorCY = door.posY - (rPx / mapHRef.current * 100);
      const ddxPx = (localPetPos.x - door.posX) / 100 * MAP_W;
      const ddyPx = (localPetPos.y - doorCY) / 100 * mapHRef.current;
      const distPx = Math.sqrt(ddxPx * ddxPx + ddyPx * ddyPx);
      if (distPx < rPx && distPx < closestDist) { closestDist = distPx; closestDoor = door; }
    }
    if (closestDoor) {
      activeDoorIdRef.current = closestDoor.id;
      setActiveDoorId(closestDoor.id);
      joystickDirRef.current = { dx: 0, dy: 0 };
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPetPos]);

  // ── SSE: full presence + live positions — roster/join/leave/move ──────────
  useEffect(() => {
    const es = new EventSource("/api/world/pet_world/position-stream");

    // Initial snapshot of everyone currently online (including self)
    es.addEventListener("roster", (e) => {
      try {
        const pets = JSON.parse(e.data) as WorldActivePet[];
        setOnlinePets(pets);
      } catch {}
    });

    // A new player entered the world
    es.addEventListener("join", (e) => {
      try {
        const pet = JSON.parse(e.data) as WorldActivePet;
        setOnlinePets(prev =>
          prev.some(p => p.userId === pet.userId)
            ? prev.map(p => p.userId === pet.userId ? pet : p)
            : [...prev, pet]
        );
      } catch {}
    });

    // A player left the world
    es.addEventListener("leave", (e) => {
      try {
        const { userId } = JSON.parse(e.data) as { userId: string };
        setOnlinePets(prev => prev.filter(p => p.userId !== userId));
      } catch {}
    });

    // Position update from another player
    es.addEventListener("move", (e) => {
      try {
        const { userId, posX, posY } = JSON.parse(e.data) as { userId: string; posX: number; posY: number };
        if (userId === user.id) return; // own pet is managed locally via RAF
        setOnlinePets(prev =>
          prev.map(p => p.userId === userId ? { ...p, posX, posY } : p)
        );
      } catch {}
    });

    return () => es.close();
  }, [user.id]);

  // ── Bulletproof active-pet fallback ───────────────────────────────────────
  // The SSE roster *should* include the user's own pet (the server picks
  // their activePetId or the most-recent hatched pet as a fallback). But if
  // ANYTHING about that path fails — bad DB row, missing shopItems join,
  // banned-flag wonkiness, transient SSE auth issue — the user's pet
  // disappears from KC and there's no second chance. This effect runs
  // independently: if 1.5 s after mounting we still have no own-pet entry
  // in the roster, fetch the user's inventory directly, pick the active
  // (or most recent) hatched pet, and synthesize a roster entry locally.
  // This guarantees the player always sees their own pet on KC, no matter
  // what the server-side path does.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      // Already have a roster entry — nothing to do.
      if (onlinePetsRef.current.some(p => p.userId === user.id)) return;
      try {
        const res = await fetch("/api/inventory", { credentials: "include" });
        if (!res.ok) return;
        const inv: any[] = await res.json();
        const hatched = inv
          .filter(it => it && it.type === "pet" && it.isHatched === true)
          // Sort newest-first so [0] is always the most recently acquired
          // hatched pet, regardless of inventory order from the server.
          .sort((a, b) => {
            const ta = a.acquiredAt ? Date.parse(a.acquiredAt) : 0;
            const tb = b.acquiredAt ? Date.parse(b.acquiredAt) : 0;
            return tb - ta;
          });
        if (hatched.length === 0) return;
        // Prefer the explicitly-chosen active pet. Fall back to the most
        // recently acquired hatched pet so the player always has SOME
        // sprite walking around.
        const preferred = (me?.activePetId
          ? hatched.find(it => it.inventoryId === me.activePetId)
          : null) ?? hatched[0];
        if (!preferred || cancelled) return;
        const synth: WorldActivePet = {
          userId: user.id,
          username: me?.username ?? "you",
          profileImage: me?.profileImage ?? null,
          inventoryId: preferred.inventoryId,
          shopItemId: preferred.shopItemId,
          name: preferred.name,
          petNickname: preferred.petNickname ?? null,
          imageUrl: preferred.imageUrl ?? null,
          hatchedImageUrl: preferred.hatchedImageUrl ?? null,
          petLevel: preferred.petLevel ?? 1,
          petHealth: preferred.petHealth ?? null,
          petAtk: preferred.petAtk ?? null,
          petDef: preferred.petDef ?? null,
          rarity: preferred.rarity ?? null,
          petTemplateId: preferred.petTemplateId ?? null,
          facingDirection: preferred.facingDirection ?? null,
          posX: null,
          posY: null,
        };
        if (cancelled) return;
        setOnlinePets(prev =>
          prev.some(p => p.userId === user.id) ? prev : [...prev, synth],
        );
      } catch {
        // Network error — nothing we can do; user just won't see their pet
        // until SSE recovers. This fallback is best-effort.
      }
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user.id, me?.activePetId, me?.username, me?.profileImage]);

  // ── mutations ──────────────────────────────────────────────────────────────
  const addDecorItemMutation = useMutation({
    mutationFn: async (data: { name: string; imageUrl: string }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/decor/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "items"] });
      setShowAddDecorForm(false);
      setNewDecorName("");
      setNewDecorImage(null);
      toast({ title: "Decor Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add decor", variant: "destructive" }),
  });

  const deleteDecorItemMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/decor/items/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] });
    },
  });

  const addDecorPlacementMutation = useMutation({
    mutationFn: async (data: { item: DecorItem; posX: number; posY: number }) => {
      const res = await apiRequest("POST", `/api/admin/world/${WORLD_ID}/decor/placements`, {
        decorItemId: data.item.id, name: data.item.name, imageUrl: data.item.imageUrl,
        posX: data.posX, posY: data.posY,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
    onError: () => toast({ title: "Error", description: "Failed to place decor", variant: "destructive" }),
  });

  const updateDecorPlacementMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; posX?: number; posY?: number; size?: number; flipped?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/world/decor/placements/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
  });

  const deleteDecorPlacementMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/world/decor/placements/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "decor", "placements"] }),
  });

  // ── KC door mutations ───────────────────────────────────────────────────────
  const createDoorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/kc-doors", { worldId: WORLD_ID });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "kc-doors"] }),
    onError: () => toast({ title: "Error", description: "Could not create door", variant: "destructive" }),
  });

  const updateDoorMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null; isShop?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/kc-doors/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "kc-doors"] }),
    onError: () => toast({ title: "Error", description: "Could not update door", variant: "destructive" }),
  });

  const deleteDoorMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/kc-doors/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/world", WORLD_ID, "kc-doors"] }),
  });

  const assignDoorItemMutation = useMutation({
    mutationFn: async ({ doorId, itemId }: { doorId: string; itemId: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${doorId}/assign-item/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeDoorId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Item Added", description: "Item added to shop" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add item", variant: "destructive" }),
  });

  const unassignDoorItemMutation = useMutation({
    mutationFn: async ({ doorId, itemId }: { doorId: string; itemId: string }) => {
      await apiRequest("DELETE", `/api/admin/location/${doorId}/unassign-item/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location", activeDoorId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] });
      toast({ title: "Item Removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove item", variant: "destructive" }),
  });

  const doorBuyMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await apiRequest("POST", `/api/shop/${WORLD_ID}/buy/${itemId}`, { quantity });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setDoorBuyStep(0);
      setDoorBuyError(null);
      setSelectedDoorShopItem(null);
      playChime();
      const qty = data.quantity ?? 1;
      toast({ title: "Purchased!", description: qty > 1 ? `${qty}× added to your inventory` : "Added to your inventory" });
    },
    onError: (err: any) => {
      let msg = "Could not purchase item";
      try {
        const parsed = JSON.parse(err.message.split(": ").slice(1).join(": "));
        msg = parsed.message || msg;
      } catch {}
      setDoorBuyError(msg);
    },
  });

  const assignDoorBundleMutation = useMutation({
    mutationFn: async ({ doorId, bundleId }: { doorId: string; bundleId: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${doorId}/assign-bundle/${bundleId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", activeDoorId, "shop-bundles"] });
      toast({ title: "Bundle Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add bundle", variant: "destructive" }),
  });

  const unassignDoorBundleMutation = useMutation({
    mutationFn: async ({ doorId, bundleId }: { doorId: string; bundleId: string }) => {
      await apiRequest("DELETE", `/api/admin/location/${doorId}/unassign-bundle/${bundleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", activeDoorId, "shop-bundles"] });
      toast({ title: "Bundle Removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove bundle", variant: "destructive" }),
  });

  const assignDoorDecorMutation = useMutation({
    mutationFn: async ({ doorId, decorId }: { doorId: string; decorId: string }) => {
      const res = await apiRequest("POST", `/api/admin/location/${doorId}/assign-decor/${decorId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", activeDoorId, "shop-decor"] });
      toast({ title: "Decor Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add decor", variant: "destructive" }),
  });

  const unassignDoorDecorMutation = useMutation({
    mutationFn: async ({ doorId, decorId }: { doorId: string; decorId: string }) => {
      await apiRequest("DELETE", `/api/admin/location/${doorId}/unassign-decor/${decorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/location", activeDoorId, "shop-decor"] });
      toast({ title: "Decor Removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove decor", variant: "destructive" }),
  });

  const addDoorDecorMutation = useMutation({
    mutationFn: async ({ doorId, name, imageUrl }: { doorId: string; name: string; imageUrl: string }) => {
      const res = await apiRequest("POST", `/api/admin/kc-doors/${doorId}/decor`, { name, imageUrl, posX: 45, posY: 45, size: 100 });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kc-doors", activeDoorId, "decor"] }),
    onError: () => toast({ title: "Error", description: "Could not add decor", variant: "destructive" }),
  });

  const updateDoorDecorMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; posX?: number; posY?: number; size?: number; flipped?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/kc-door-decor/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kc-doors", activeDoorId, "decor"] }),
  });

  const deleteDoorDecorMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/kc-door-decor/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kc-doors", activeDoorId, "decor"] }),
  });

  // Keep kcDoorsRef in sync for RAF loop access
  kcDoorsRef.current = kcDoors;

  // ── map setup: use fixed KC_MAP_H so door/decor positions never shift ───────
  // (KC_MAP_H is locked to the canonical bgGround aspect ratio — see constant above)
  useEffect(() => {
    mapHRef.current = KC_MAP_H;
    setMapH(KC_MAP_H);
  }, []);

  // ── initial centering on mount / mapH change ───────────────────────────────
  useEffect(() => {
    const coverSc = Math.max(frameWRef.current / MAP_W, frameHRef.current / mapHRef.current);
    // Start at cover scale so the world fills the frame
    const initSc  = coverSc;
    const ix = (frameWRef.current - MAP_W * initSc) / 2;
    const iy = (frameHRef.current - mapHRef.current * initSc) / 2;
    mapTransformRef.current = { x: ix, y: iy, scale: initSc };
    setMapX(ix); setMapY(iy); setMapScale(initSc);
  }, [mapH, frameW, frameH]);

  // ── clamp + apply (horizontal pan only, no zoom) ───────────────────────────
  const applyMapTransform = useCallback((x: number, _y: number, _sc: number) => {
    const coverSc = Math.max(frameWRef.current / MAP_W, frameHRef.current / mapHRef.current);
    const mw = MAP_W * coverSc;
    const mh = mapHRef.current * coverSc;
    // Lock scale to cover; lock Y to vertical center; only X scrolls
    const cx = mw <= frameWRef.current ? (frameWRef.current - mw) / 2 : Math.max(frameWRef.current - mw, Math.min(0, x));
    const cy = (frameHRef.current - mh) / 2;
    mapTransformRef.current = { x: cx, y: cy, scale: coverSc };
    setMapX(cx); setMapY(cy); setMapScale(coverSc);
  }, []);

  // ── horizontal pan only (no zoom, no vertical scroll) ─────────────────────
  const handleVpPointerDown = useCallback((e: React.PointerEvent) => {
    if (decorDragRef.current) return;
    // Only track the first finger; ignore any additional fingers
    if (mapPanPointersRef.current.size > 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mapPanStartRef.current = { x: e.clientX, y: e.clientY, mapX: mapTransformRef.current.x, mapY: mapTransformRef.current.y };
    mapPanningRef.current = false;
    // Record if the tap started over another player's pet
    const petEl = (e.target as Element).closest("[data-petid]") as HTMLElement | null;
    petTapRef.current = petEl ? (petEl.getAttribute("data-petid") ?? null) : null;
  }, []);

  const handleVpPointerMove = useCallback((e: React.PointerEvent) => {
    if (!mapPanStartRef.current || !mapPanPointersRef.current.has(e.pointerId)) return;
    mapPanPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Horizontal drag only — ignore vertical delta
    const dx = (e.clientX - mapPanStartRef.current.x) / getStageScale();
    if (!mapPanningRef.current && Math.abs(dx) > 4) mapPanningRef.current = true;
    if (mapPanningRef.current) applyMapTransform(mapPanStartRef.current.mapX + dx, 0, 1);
  }, [applyMapTransform]);

  const handleVpPointerUp = useCallback((e: React.PointerEvent) => {
    mapPanPointersRef.current.delete(e.pointerId);
    const wasPan = mapPanningRef.current;
    if (wasPan) { mapJustPannedRef.current = true; setTimeout(() => { mapJustPannedRef.current = false; }, 80); }
    mapPanStartRef.current = null;
    mapPanningRef.current = false;
    // If the pointer went down and up on a pet without dragging, open their profile
    if (!wasPan && petTapRef.current) {
      const userId = petTapRef.current;
      const pet = onlinePetsRef.current.find(p => p.userId === userId);
      if (pet) setSelectedPet(pet);
    }
    petTapRef.current = null;
  }, []);

  // ── decor drag on map ──────────────────────────────────────────────────────
  const handleDecorPointerDown = useCallback((e: React.PointerEvent, p: { id: string; posX: number; posY: number }) => {
    if (!user.isAdmin) return;
    // Don't intercept pointer events meant for admin edit buttons
    if ((e.target as Element).closest("button")) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    decorDidDrag.current = false;
    decorDragRef.current = { placementId: p.id, startX: e.clientX, startY: e.clientY, origPosX: p.posX, origPosY: p.posY };
  }, [user.isAdmin]);

  const handleDecorPointerMove = useCallback((e: React.PointerEvent) => {
    if (!decorDragRef.current || !areaRef.current) return;
    e.preventDefault();
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - decorDragRef.current.startX;
    const dy = e.clientY - decorDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) decorDidDrag.current = true;
    const newX = Math.max(0, Math.min(100, decorDragRef.current.origPosX + dx / (rect.width / 100)));
    const newY = Math.max(0, Math.min(100, decorDragRef.current.origPosY + dy / (rect.height / 100)));
    setDecorDragPos({ id: decorDragRef.current.placementId, x: newX, y: newY });
  }, []);

  const handleDecorPointerUp = useCallback(() => {
    if (!decorDragRef.current) return;
    const d = decorDragRef.current;
    decorDragRef.current = null;
    if (decorDidDrag.current && decorDragPos) {
      updateDecorPlacementMutation.mutate({ id: d.placementId, posX: Math.round(decorDragPos.x), posY: Math.round(decorDragPos.y) });
      setDecorMoveOrder(prev => [...prev.filter(id => id !== d.placementId), d.placementId]);
    }
    setDecorDragPos(null);
  }, [decorDragPos, updateDecorPlacementMutation]);

  // ── door drag handlers (admin only) ────────────────────────────────────────
  const handleDoorPointerDown = useCallback((e: React.PointerEvent, door: KcDoor) => {
    if (!user.isAdmin) return;
    if ((e.target as Element).closest("button")) return;
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    doorDidDrag.current = false;
    doorDragRef.current = { doorId: door.id, startX: e.clientX, startY: e.clientY, origPosX: door.posX, origPosY: door.posY };
  }, [user.isAdmin]);

  const handleDoorPointerMove = useCallback((e: React.PointerEvent) => {
    if (!doorDragRef.current || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const dx = e.clientX - doorDragRef.current.startX;
    const dy = e.clientY - doorDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) doorDidDrag.current = true;
    const newX = Math.max(2, Math.min(98, doorDragRef.current.origPosX + dx / (rect.width / 100)));
    const newY = Math.max(2, Math.min(98, doorDragRef.current.origPosY + dy / (rect.height / 100)));
    doorDragLivePosRef.current = { x: newX, y: newY };
    setDoorDragPos({ id: doorDragRef.current.doorId, x: newX, y: newY });
  }, []);

  const handleDoorPointerUp = useCallback(() => {
    if (!doorDragRef.current) return;
    const d = doorDragRef.current;
    doorDragRef.current = null;
    const livePos = doorDragLivePosRef.current;
    doorDragLivePosRef.current = null;
    if (doorDidDrag.current && livePos) {
      updateDoorMutation.mutate({ id: d.doorId, posX: Math.round(livePos.x * 10) / 10, posY: Math.round(livePos.y * 10) / 10 });
    }
    doorDidDrag.current = false;
    setDoorDragPos(null);
  }, [updateDoorMutation]);

  // ── door interior decor drag + background pan handlers ──────────────────────
  const interiorRef = useRef<HTMLDivElement>(null);

  // Reset pan and preload background natural size whenever a door opens/closes
  useEffect(() => {
    bgPanXRef.current = 0;
    setBgPanX(0);
    setBgRenderedW(0);
    bgNaturalSizeRef.current = null;
    if (!activeDoorId) return;
    const door = kcDoors.find(d => d.id === activeDoorId);
    if (!door?.bgUrl) return;
    const img = new Image();
    img.onload = () => {
      bgNaturalSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      // bgRenderedH = FRAME_H (container fills the full frame height)
      // bgRenderedW = natural aspect ratio × rendered height
      if (img.naturalHeight > 0) {
        setBgRenderedW((img.naturalWidth / img.naturalHeight) * FRAME_H);
      }
    };
    img.src = door.bgUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoorId]);

  const handleInteriorPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start a bg pan if no decor drag is active
    if (doorDecorDragRef.current) return;
    // Don't start a pan when the admin taps an edit button
    if ((e.target as Element).closest("button")) return;
    bgPanDragRef.current = { startX: e.clientX, startPan: bgPanXRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDoorDecorPointerDown = useCallback((e: React.PointerEvent, p: KcDoorDecorP) => {
    if (!user.isAdmin) return;
    if ((e.target as Element).closest("button")) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    bgPanDragRef.current = null; // cancel any bg pan when decor drag starts
    doorDecorDidDrag.current = false;
    doorDecorDragRef.current = { placementId: p.id, startX: e.clientX, startY: e.clientY, origPosX: p.posX, origPosY: p.posY };
  }, [user.isAdmin]);

  const handleDoorDecorPointerMove = useCallback((e: React.PointerEvent) => {
    // Background pan (anyone). bgPanX is applied as CSS px inside the scaled
    // #game-stage, i.e. design px — so convert the (scaled) rect + pointer delta
    // back into design px via the stage scale, keeping the pan finger-locked.
    if (bgPanDragRef.current && interiorRef.current) {
      const s = getStageScale();
      const containerRect = interiorRef.current.getBoundingClientRect();
      const cw = containerRect.width / s;
      const ch = containerRect.height / s;
      const nat = bgNaturalSizeRef.current;
      // Compute the image's rendered width at height=100% from natural dimensions
      const renderedW = nat && nat.h > 0
        ? (nat.w / nat.h) * ch
        : cw;
      const maxPan = Math.max(0, renderedW - cw);
      const dx = (bgPanDragRef.current.startX - e.clientX) / s;
      const newPan = Math.max(0, Math.min(maxPan, bgPanDragRef.current.startPan + dx));
      bgPanXRef.current = newPan;
      setBgPanX(newPan);
    }
    // Decor drag (admin only)
    if (!doorDecorDragRef.current || !interiorRef.current) return;
    e.preventDefault();
    const rect = interiorRef.current.getBoundingClientRect();
    // X drag is relative to the background image width so items stay pinned to the background
    const bgW = bgNaturalSizeRef.current && bgNaturalSizeRef.current.h > 0
      ? (bgNaturalSizeRef.current.w / bgNaturalSizeRef.current.h) * rect.height
      : rect.width;
    const dx = e.clientX - doorDecorDragRef.current.startX;
    const dy = e.clientY - doorDecorDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) doorDecorDidDrag.current = true;
    const newX = Math.max(0, Math.min(100, doorDecorDragRef.current.origPosX + dx / (bgW / 100)));
    const newY = Math.max(0, Math.min(100, doorDecorDragRef.current.origPosY + dy / (rect.height / 100)));
    doorDecorDragLivePosRef.current = { x: newX, y: newY };
    setDoorDecorDragPos({ id: doorDecorDragRef.current.placementId, x: newX, y: newY });
  }, []);

  const handleDoorDecorPointerUp = useCallback(() => {
    bgPanDragRef.current = null;
    if (!doorDecorDragRef.current) return;
    const d = doorDecorDragRef.current;
    doorDecorDragRef.current = null;
    const livePos = doorDecorDragLivePosRef.current;
    doorDecorDragLivePosRef.current = null;
    if (doorDecorDidDrag.current && livePos) {
      updateDoorDecorMutation.mutate({ id: d.placementId, posX: Math.round(livePos.x), posY: Math.round(livePos.y) });
    }
    doorDecorDidDrag.current = false;
    setDoorDecorDragPos(null);
  }, [updateDoorDecorMutation]);

  // ── panel drag-to-map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!panelDragGhost) return;
    const onMove = (e: PointerEvent) => {
      setPanelDragGhost(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null);
    };
    const onUp = (e: PointerEvent) => {
      const item = panelDragRef.current?.item;
      panelDragRef.current = null;
      setPanelDragGhost(null);
      if (item && areaRef.current) {
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
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
  }, [!!panelDragGhost]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "#060e06" }}
    >
      {/* ══ Map canvas — single background, full pan + zoom ════════════════ */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: "none", userSelect: "none", zIndex: 3 }}
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
            backgroundImage: `url(${bgGround})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
          onClick={() => { if (user.isAdmin) { setSelectedDecorId(null); setSelectedLocId(null); } }}
        >
          {/* ── Roaming pets — inside the map canvas so they pan with the world ── */}
          {onlinePets.map((pet, idx) => {
            const isOwn = pet.userId === user.id;
            // Own pet uses the locally-managed position for smooth joystick movement
            const rawPos = isOwn && localPetPos
              ? localPetPos
              : (petDefaultPositions.get(pet.userId) ?? { x: 50, y: 70 });
            const resolvedX = Math.max(5,  Math.min(92, rawPos.x));
            const resolvedY = Math.max(15, Math.min(90, rawPos.y));
            return (
              <WorldRoamingPet
                key={pet.userId}
                pet={pet}
                posX={resolvedX}
                posY={resolvedY}
                isOwn={isOwn}
                isMoving={isOwn ? petIsMoving : false}
                facingLeft={isOwn ? facingLeft : undefined}
                onTap={() => setSelectedPet(pet)}
              />
            );
          })}

          {/* ── Locations (places) on the map ─────────────────────────── */}
          {[...kcLocations].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(loc => {
            const pos = locDragPos?.id === loc.id ? { x: locDragPos.x, y: locDragPos.y } : { x: loc.posX, y: loc.posY };
            const glow = loc.glowColor || "#d4a017";
            const sz = loc.iconSize || 160;
            return (
              <div
                key={loc.id}
                className="absolute flex flex-col items-center"
                draggable={false}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: sz,
                  cursor: user.isAdmin ? "grab" : "default",
                  zIndex: selectedLocId === loc.id ? 150 : locDragPos?.id === loc.id ? 200 : 10 + Math.round(((pos.y - (sz * 0.3 / mapH) * 100) / 100) * 60),
                  transform: "translate(-50%, -100%)",
                  touchAction: "none",
                  userSelect: "none",
                } as React.CSSProperties}
                onDragStart={e => e.preventDefault()}
                onPointerDown={e => handleLocPointerDown(e, loc)}
                onPointerMove={handleLocPointerMove}
                onPointerUp={handleLocPointerUp}
                onPointerCancel={() => { locDragRef.current = null; locDidDrag.current = false; setLocDragPos(null); }}
              >
                <div className="relative w-full" style={{ pointerEvents: "none" }}>
                  {/* Quest arrow — points at this location when shopHint matches */}
                  {shopHintLocId === loc.id && (
                    <>
                      <style>{`@keyframes world-quest-bob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-9px)} }`}</style>
                      <img
                        src={questArrowImg}
                        alt=""
                        style={{
                          position: "absolute",
                          top: -58,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 38,
                          height: 50,
                          pointerEvents: "none",
                          zIndex: 310,
                          animation: "world-quest-bob 1.3s ease-in-out infinite",
                          filter: "drop-shadow(0 0 10px rgba(50,220,50,0.95)) drop-shadow(0 0 24px rgba(50,220,50,0.6))",
                        }}
                      />
                    </>
                  )}
                  {loc.iconUrl ? (
                    <img
                      src={loc.iconUrl}
                      alt={loc.name}
                      draggable={false}
                      style={{
                        width: "100%",
                        objectFit: "contain",
                        transform: loc.flipped ? "scaleX(-1)" : undefined,
                        userSelect: "none",
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center" style={{ width: sz, height: sz, borderRadius: 16, background: "rgba(20,20,20,0.5)", border: "1.5px solid rgba(255,255,255,0.15)" }}>
                      <Store style={{ width: sz * 0.4, height: sz * 0.4, color: glow }} />
                    </div>
                  )}
                  {/* Click zone — admin drag/select only; players cannot open shops */}
                  <div
                    onClick={e => { e.stopPropagation(); if (user.isAdmin) handleLocClick(loc); }}
                    style={{ position: "absolute", inset: 0, pointerEvents: "auto", cursor: user.isAdmin ? "grab" : "default", zIndex: 20 }}
                  />
                  {/* Admin controls */}
                  {user.isAdmin && selectedLocId === loc.id && (
                    <div style={{ pointerEvents: "auto" }}>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (confirm(`Delete "${loc.name}"?`)) deleteLocMutation.mutate(loc.id); setSelectedLocId(null); }}
                        className="absolute -top-4 -left-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); flipLocMutation.mutate(loc.id); }}
                        className="absolute -top-4 -right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <FlipHorizontal className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateLocSizeMutation.mutate({ locationId: loc.id, iconSize: Math.max(60, sz - 10) }); }}
                        className="absolute -bottom-4 -left-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Minus className="w-4 h-4 text-white" />
                      </button>
                      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateLocSizeMutation.mutate({ locationId: loc.id, iconSize: Math.min(400, sz + 10) }); }}
                        className="absolute -bottom-4 -right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(80,40,0,0.95)", border: "2px solid rgba(255,160,50,0.7)", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <Plus className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Decor placements */}
          {decorPlacements.map(p => {
            const dpos = decorDragPos?.id === p.id ? { x: decorDragPos.x, y: decorDragPos.y } : { x: p.posX, y: p.posY };
            const isPassThrough = PASS_THROUGH_SENTINELS.has(p.imageUrl);
            const isGlowOrb    = isPassThrough && p.imageUrl !== FIREFLIES_SENTINEL;
            const isFireflies  = p.imageUrl === FIREFLIES_SENTINEL;
            const FF_COUNT = 7;
            const FF_ANIMS = ["ffloat0", "ffloat1", "ffloat2"];
            return (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${dpos.x}%`, top: `${dpos.y}%`,
                  width: `${p.size}px`, height: `${p.size}px`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isPassThrough ? 300 : (decorDragPos?.id === p.id ? 200 : 10 + Math.round(((dpos.y + (p.size * 0.3 / mapH) * 100) / 100) * 60)),
                  cursor: user.isAdmin ? "grab" : "default",
                  touchAction: user.isAdmin ? "none" : "auto",
                  pointerEvents: (!user.isAdmin && isPassThrough) ? "none" : "auto",
                }}
                onPointerDown={e => handleDecorPointerDown(e, p)}
                onPointerMove={handleDecorPointerMove}
                onPointerUp={handleDecorPointerUp}
                onPointerCancel={() => { decorDragRef.current = null; decorDidDrag.current = false; setDecorDragPos(null); }}
                onClick={e => { if (user.isAdmin) { e.stopPropagation(); setSelectedDecorId(prev => prev === p.id ? null : p.id); } }}
              >
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
                      const fx  = seededRand(p.id, i * 3) * 80 + 10;
                      const fy  = seededRand(p.id, i * 3 + 1) * 80 + 10;
                      const fsz = 8 + seededRand(p.id, i * 3 + 2) * 6;
                      const dur = 2.8 + seededRand(p.id, i * 7 + 3) * 2.4;
                      const del = -(seededRand(p.id, i * 11 + 5) * 3);
                      return (
                        <div key={i} style={{
                          position: "absolute", left: `${fx}%`, top: `${fy}%`,
                          width: 3, height: 3, borderRadius: "50%",
                          background: "rgba(255,252,180,1)",
                          filter: "blur(0.4px)",
                          boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 10px 5px rgba(255,220,30,0.55), 0 0 24px 12px rgba(255,190,0,0.25), 0 0 48px 22px rgba(255,160,0,0.09)",
                          mixBlendMode: "screen",
                          animation: `${FF_ANIMS[i % 3]} ${dur}s ease-in-out ${del}s infinite`,
                        }} />
                      );
                    })}
                  </div>
                ) : (
                  <img
                    src={p.imageUrl} alt={p.name} draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", transform: p.flipped ? "scaleX(-1)" : undefined }}
                  />
                )}

                {user.isAdmin && selectedDecorId === p.id && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteDecorPlacementMutation.mutate(p.id); setSelectedDecorId(null); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ top: -16, left: -16, background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                    {!isPassThrough && (
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, flipped: !p.flipped }); }}
                        className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ top: -16, right: -16, background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                        <FlipHorizontal className="w-3.5 h-3.5 text-white" />
                      </button>
                    )}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.max(20, p.size - 10) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -16, left: -16, background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", fontSize: 18, color: "#7fffd4" }}>
                      −
                    </button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); updateDecorPlacementMutation.mutate({ id: p.id, size: Math.min(600, p.size + 10) }); }}
                      className="absolute z-30 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ bottom: -16, right: -16, background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", fontSize: 18, color: "#7fffd4" }}>
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Player-visible door glow ─────────────────────────────────
               A soft golden orb at every door's entrance. Visible to ALL
               users (admins included, on top of their own admin UI). The
               admin door panel itself stays admin-gated below — players
               only ever see this glow effect, not the admin chrome.
               Click opens the door, even if the user has no roaming pet
               on the map.                                                  */}
          {kcDoors.map(door => {
            // Cluster size mirrors the admin's own trigger circle EXACTLY
            // (same formula and same translate(-50%,-100%) anchor below)
            // so the player-facing orbs cover precisely the area the
            // admin placed — no offset, no clamp drift for unusually
            // small or large doors.
            const rPx = door.triggerRadius * (MAP_W / 100);
            const wrapSize = rPx * 2;
            // Magical light orbs — fewer, larger, brighter than fireflies.
            // Positions are fractions of the wrap radius so they scale with
            // the door size. cy < 0 puts the orb above center, cy > 0 below.
            // sizeRel is a fraction of rPx so orbs grow with the door zone.
            const orbs: Array<{ cx: number; cy: number; sizeRel: number; delay: string; duration: string }> = [
              { cx: -0.55, cy: -0.10, sizeRel: 0.18, delay: "0s",    duration: "3.0s" },
              { cx:  0.45, cy: -0.45, sizeRel: 0.13, delay: "0.6s",  duration: "3.4s" },
              { cx:  0.60, cy:  0.10, sizeRel: 0.20, delay: "1.2s",  duration: "2.8s" },
              { cx: -0.20, cy: -0.60, sizeRel: 0.11, delay: "0.3s",  duration: "3.6s" },
              { cx:  0.10, cy: -0.20, sizeRel: 0.16, delay: "1.8s",  duration: "2.6s" },
              { cx: -0.40, cy:  0.30, sizeRel: 0.10, delay: "2.2s",  duration: "3.1s" },
            ];
            return (
              <div
                key={`door-glow-${door.id}`}
                style={{
                  position: "absolute",
                  left: `${door.posX}%`,
                  top: `${door.posY}%`,
                  // Anchor at the door's bottom-center (same as admin
                  // trigger zone and pets/buildings), then push the
                  // cluster UPWARD so it visually floats at door height
                  // rather than at ground level. Without this the orbs
                  // appeared "too low" relative to the door entrance
                  // the admin had set.
                  transform: "translate(-50%, -100%)",
                  width: wrapSize,
                  height: wrapSize,
                  zIndex: 90,
                  pointerEvents: "none",
                }}
                data-testid={`door-glow-wrap-${door.id}`}
              >
                {/* Invisible click target — covers the whole cluster so
                    players can tap anywhere near the orbs, but the target
                    itself is fully transparent so the area still looks
                    mysterious. */}
                <button
                  type="button"
                  aria-label={`Enter ${door.name}`}
                  data-testid={`button-door-glow-${door.id}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (mapPanningRef.current || mapJustPannedRef.current) return;
                    activeDoorIdRef.current = door.id;
                    setActiveDoorId(door.id);
                    joystickDirRef.current = { dx: 0, dy: 0 };
                    if (rafRef.current !== null) {
                      cancelAnimationFrame(rafRef.current);
                      rafRef.current = null;
                    }
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    padding: 0,
                    borderRadius: "50%",
                  }}
                />
                {/* Magical light orbs — translucent balls of light that
                    bloom and fade like the rarity halo on the active-pet
                    page. NO hard core; the brightest center is still
                    semi-transparent so background detail shows through.
                    The wide soft falloff plus drop-shadow glow gives the
                    "ball of pure light" effect the player is asking for. */}
                {orbs.map((orb, i) => {
                  // Make orbs ~3x bigger than before so the bloom area is
                  // clearly visible — the gradient fades to transparent at
                  // the edges so they still feel airy, not heavy.
                  const sizePx = Math.max(18, Math.round(rPx * orb.sizeRel * 2.6));
                  return (
                    <div
                      key={i}
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: sizePx,
                        height: sizePx,
                        marginLeft: rPx * orb.cx - sizePx / 2,
                        marginTop:  rPx * orb.cy - sizePx / 2,
                        borderRadius: "50%",
                        // Translucent pearly center → warm honey mid →
                        // fully transparent edges. Background detail
                        // shows through every layer.
                        background:
                          "radial-gradient(circle, rgba(255,248,210,0.85) 0%, rgba(255,225,150,0.55) 18%, rgba(252,200,80,0.30) 38%, rgba(232,160,30,0.12) 60%, rgba(180,110,10,0.04) 78%, rgba(120,70,4,0) 100%)",
                        // Soft diffuse outer bloom — this is what makes
                        // the orb read as a "ball of light" instead of a
                        // solid ball. Spread is large so it bleeds into
                        // the surrounding pixels gently.
                        filter: `blur(0.5px) drop-shadow(0 0 ${sizePx * 0.35}px rgba(255,225,150,0.55)) drop-shadow(0 0 ${sizePx * 0.9}px rgba(252,200,80,0.30))`,
                        pointerEvents: "none",
                        animation: `kcDoorOrb ${orb.duration} ease-in-out ${orb.delay} infinite`,
                        mixBlendMode: "screen",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* ── Door trigger zones (admin-visible only) ─────────────────── */}
          {user.isAdmin && kcDoors.map(door => {
            const pos = doorDragPos?.id === door.id ? { x: doorDragPos.x, y: doorDragPos.y } : { x: door.posX, y: door.posY };
            const rPx = door.triggerRadius * (MAP_W / 100);
            const isSelected = selectedDoorId === door.id;
            return (
              <div
                key={door.id}
                data-testid={`door-zone-${door.id}`}
                style={{
                  position: "absolute",
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: rPx * 2,
                  height: rPx * 2,
                  // Bottom-center anchor — same as pets and buildings so the stored
                  // position = ground/entrance level. Circle extends upward into the building.
                  transform: "translate(-50%, -100%)",
                  cursor: "grab",
                  zIndex: isSelected ? 300 : 100,
                  touchAction: "none",
                  userSelect: "none",
                }}
                onPointerDown={e => handleDoorPointerDown(e, door)}
                onPointerMove={handleDoorPointerMove}
                onPointerUp={handleDoorPointerUp}
                onPointerCancel={() => { doorDragRef.current = null; doorDidDrag.current = false; setDoorDragPos(null); }}
                onClick={e => { e.stopPropagation(); if (!doorDidDrag.current) setSelectedDoorId(prev => prev === door.id ? null : door.id); }}
              >
                <div style={{
                  width: "100%", height: "100%", borderRadius: "50%",
                  border: `2px dashed ${isSelected ? "#7fffd4" : "rgba(127,255,212,0.4)"}`,
                  background: isSelected ? "rgba(127,255,212,0.08)" : "rgba(127,255,212,0.03)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    background: "rgba(4,10,6,0.75)", borderRadius: 8, padding: "3px 6px",
                    border: "1px solid rgba(127,255,212,0.35)",
                    pointerEvents: "none",
                  }}>
                    <DoorOpen style={{ width: 14, height: 14, color: "#7fffd4" }} />
                    <span style={{ fontSize: 9, color: "#7fffd4", fontFamily: "monospace", maxWidth: 60, textAlign: "center", lineHeight: 1.2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {door.name}
                    </span>
                  </div>
                </div>
                {/* Admin controls when selected */}
                {isSelected && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    {/* Delete button */}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); if (confirm(`Delete door "${door.name}"?`)) { deleteDoorMutation.mutate(door.id); setSelectedDoorId(null); } }}
                      style={{
                        position: "absolute", top: -8, left: -8,
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <Trash2 style={{ width: 12, height: 12, color: "white" }} />
                    </button>
                    {/* Enter button */}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); activeDoorIdRef.current = door.id; setActiveDoorId(door.id); setSelectedDoorId(null); }}
                      style={{
                        position: "absolute", top: -8, right: -8,
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(20,100,60,0.95)", border: "2px solid rgba(127,255,212,0.7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      <DoorOpen style={{ width: 12, height: 12, color: "#7fffd4" }} />
                    </button>
                    {/* Radius − */}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); updateDoorMutation.mutate({ id: door.id, triggerRadius: Math.max(3, door.triggerRadius - 1) }); }}
                      style={{
                        position: "absolute", bottom: -8, left: -8,
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", pointerEvents: "auto", fontSize: 16, color: "#7fffd4",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >−</button>
                    {/* Radius + */}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); updateDoorMutation.mutate({ id: door.id, triggerRadius: Math.min(20, door.triggerRadius + 1) }); }}
                      style={{
                        position: "absolute", bottom: -8, right: -8,
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", pointerEvents: "auto", fontSize: 16, color: "#7fffd4",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── HUD overlay ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>

        {/* ── TopBar-style strip ── */}
        <div
          className="absolute left-0 right-0 pointer-events-auto flex items-start justify-between px-3 gap-3"
          style={{
            top: 0,
            paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
            paddingBottom: 8,
            background: "linear-gradient(180deg, rgba(4,10,6,0.88) 0%, rgba(4,10,6,0.55) 80%, transparent 100%)",
          }}
        >
          {/* LEFT: profile photo column + Friends btn below, then username/coins to the right */}
          <div className="flex items-start gap-2 min-w-0">
            {/* Profile photo column */}
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              {/* Profile photo — tap to open settings */}
              <div
                className="relative"
                data-testid="button-open-profile"
                onClick={() => setShowProfile(true)}
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  border: "2.5px solid #c9a030",
                  boxShadow: "0 0 8px rgba(201,160,48,0.3), 0 2px 8px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  background: "linear-gradient(135deg, #2a1a0a 0%, #4a2e18 100%)",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              >
                {me?.profileImage ? (
                  <img
                    data-testid="img-kc-profile-avatar"
                    src={me.profileImage}
                    alt={me.username}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="font-fantasy font-bold" style={{ color: "#d4a017", fontSize: 18 }}>
                      {(me?.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Username + coins stacked */}
            <div className="flex flex-col gap-1 min-w-0" style={{ paddingTop: 2 }}>
              <div
                className="px-2.5 py-1 rounded-md min-w-0"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.5)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,160,23,0.2)",
                  maxWidth: 120,
                }}
              >
                <p
                  className="font-fantasy text-[#f0c040] font-semibold tracking-widest truncate"
                  style={{ textShadow: "0 0 10px rgba(240,192,64,0.6)", fontSize: "clamp(9px, calc(2.5*var(--vw)), 11px)" }}
                  data-testid="text-kc-username"
                >
                  {me?.username ?? ""}
                </p>
              </div>
              <button
                data-testid="button-kc-coin-shop"
                onClick={() => navigate("/coins")}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-transform active:scale-95 self-start"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.9) 0%, rgba(60,35,10,0.9) 100%)",
                  border: "1px solid rgba(212,160,23,0.4)",
                  cursor: "pointer",
                }}
              >
                <img src={coinIconImg} alt="Coins" style={{ width: 14, height: 14, objectFit: "contain", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }} />
                <span
                  className="font-fantasy text-[#f0c040] font-semibold"
                  style={{ fontSize: "clamp(9px, calc(2.5*var(--vw)), 11px)" }}
                  data-testid="text-kc-coins"
                >
                  {me?.coins ?? 0}
                </span>
                <span className="font-fantasy text-[#d4a017] text-[8px]">+</span>
              </button>
            </div>
          </div>

          {/* RIGHT: admin buttons */}
          {user.isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 2 }}>
              <button
                data-testid="button-world-places"
                onClick={() => { setShowPlacesPanel(p => !p); setShowDecorPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showPlacesPanel ? `rgba(212,160,23,0.22)` : "rgba(4,10,6,0.82)",
                  border: `2px solid #d4a01755`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <MapPin className="w-4 h-4" style={{ color: "#d4a017" }} />
              </button>
              <button
                data-testid="button-world-decor"
                onClick={() => { setShowDecorPanel(p => !p); setShowPlacesPanel(false); setShowDoorsPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showDecorPanel ? `rgba(127,255,212,0.18)` : "rgba(4,10,6,0.82)",
                  border: `2px solid ${ACCENT}55`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Palette className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
              <button
                data-testid="button-world-doors"
                onClick={() => { setShowDoorsPanel(p => !p); setShowDecorPanel(false); setShowPlacesPanel(false); }}
                className="flex-shrink-0 flex items-center justify-center transition-transform active:scale-90 topbar-icon-size-sm"
                style={{
                  background: showDoorsPanel ? "rgba(127,255,212,0.18)" : "rgba(4,10,6,0.82)",
                  border: `2px solid ${ACCENT}55`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <DoorOpen className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Friend Accepted Notification Modal ────────────────────────────── */}
      {acceptedNotifMessages.length > 0 && (
        <div
          className="absolute pointer-events-auto"
          style={{
            inset: 0, zIndex: 80,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px",
          }}
          onClick={() => {
            setAcceptedNotifMessages([]);
            setShowFriendsPanel(true);
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg, rgba(6,20,10,0.98) 0%, rgba(12,35,18,0.98) 100%)",
              border: "1.5px solid rgba(74,222,128,0.45)",
              borderRadius: 18,
              boxShadow: "0 0 40px rgba(74,222,128,0.18), 0 8px 40px rgba(0,0,0,0.8)",
              padding: "28px 24px 22px",
              width: "100%", maxWidth: 340,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "radial-gradient(circle, #4ade80 0%, #16a34a 100%)",
              boxShadow: "0 0 20px rgba(74,222,128,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: "bold", color: "#fff",
              fontFamily: "serif",
            }}>
              !
            </div>
            <p className="font-fantasy text-center" style={{ color: "#4ade80", fontSize: 13, letterSpacing: "0.04em", marginBottom: 2 }}>
              Friend Update
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              {acceptedNotifMessages.map((msg, i) => (
                <p
                  key={i}
                  className="font-fantasy text-center"
                  style={{ color: "#c8f5d8", fontSize: 13, lineHeight: 1.5 }}
                  data-testid={`text-friend-accepted-notif-${i}`}
                >
                  {msg}
                </p>
              ))}
            </div>
            <button
              data-testid="button-close-friend-notif"
              onClick={() => {
                setAcceptedNotifMessages([]);
                setShowFriendsPanel(true);
              }}
              className="transition-transform active:scale-95"
              style={{
                marginTop: 6,
                padding: "9px 32px",
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(74,222,128,0.18) 0%, rgba(22,163,74,0.22) 100%)",
                border: "1.5px solid rgba(74,222,128,0.5)",
                color: "#4ade80",
                fontFamily: "Lora, serif",
                fontSize: 13,
                letterSpacing: "0.06em",
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(74,222,128,0.2)",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Friends Panel ─────────────────────────────────────────────────── */}
      {showFriendsPanel && (
        <div
          className="absolute pointer-events-auto"
          style={{
            zIndex: 40,
            bottom: 0, left: 0, right: 0,
            background: "rgba(4,10,6,0.97)",
            border: `1.5px solid ${ACCENT}28`,
            borderRadius: "20px 20px 0 0",
            boxShadow: "0 -4px 40px rgba(0,0,0,0.8), 0 0 30px rgba(127,255,212,0.06)",
            maxHeight: "calc(72*var(--vh))",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 18px 12px",
            borderBottom: `1px solid ${ACCENT}18`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${ACCENT}80)` }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT }}>Friends</span>
            </div>
            <button
              data-testid="button-close-friends-panel"
              onClick={() => setShowFriendsPanel(false)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(127,255,212,0.07)",
                border: `1px solid ${ACCENT}30`,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: ACCENT,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ overflowY: "auto", padding: "12px 18px 24px", flex: 1 }}>

            {/* Pending requests */}
            {friendRequests.length > 0 && (
              <div className="space-y-2" style={{ marginBottom: 16 }}>
                <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: ACCENT, marginBottom: 8 }}>
                  Requests ({friendRequests.length})
                </p>
                {friendRequests.map((req: any) => (
                  <div
                    key={req.id}
                    data-testid={`friend-request-${req.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 10,
                      background: "rgba(127,255,212,0.06)",
                      border: "1px solid rgba(127,255,212,0.12)",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      {req.profileImage ? (
                        <img src={req.profileImage} alt={req.username}
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(127,255,212,0.3)" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(127,255,212,0.1)", border: "1px solid rgba(127,255,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: ACCENT, fontWeight: "bold" }}>{(req.username ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <span className="font-fantasy text-xs" style={{ color: "#d4e8da", flex: 1 }} data-testid={`text-request-username-${req.id}`}>{req.username}</span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        data-testid={`button-accept-request-${req.id}`}
                        onClick={() => acceptRequestMutation.mutate(req.id)}
                        disabled={acceptRequestMutation.isPending}
                        className="font-fantasy text-[10px] tracking-wider"
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.45)", color: "#4ade80", cursor: "pointer" }}
                      >
                        Accept
                      </button>
                      <button
                        data-testid={`button-decline-request-${req.id}`}
                        onClick={() => declineRequestMutation.mutate(req.requesterId)}
                        disabled={declineRequestMutation.isPending}
                        className="font-fantasy text-[10px] tracking-wider"
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", cursor: "pointer" }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}30, transparent)`, margin: "8px 0" }} />
              </div>
            )}

            {/* Friends list */}
            <div>
              <p className="font-fantasy text-[10px] tracking-widest uppercase" style={{ color: ACCENT, marginBottom: 8 }}>
                My Friends ({friends.length})
              </p>
              {friends.length === 0 && friendRequests.length === 0 && (
                <p className="font-fantasy text-xs text-center" style={{ color: "#5a8070", padding: "16px 0" }} data-testid="text-no-friends">
                  No friends yet — explore the world and add some!
                </p>
              )}
              {friends.length === 0 && friendRequests.length > 0 && (
                <p className="font-fantasy text-xs text-center" style={{ color: "#5a8070", padding: "8px 0" }} data-testid="text-no-friends-yet">
                  No friends yet
                </p>
              )}
              <div className="space-y-2">
                {friends.map((f: any) => (
                  <div
                    key={f.id}
                    data-testid={`friend-row-${f.friendId}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 10,
                      background: "rgba(127,255,212,0.04)",
                      border: "1px solid rgba(127,255,212,0.1)",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      {f.profileImage ? (
                        <img src={f.profileImage} alt={f.username}
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(212,160,23,0.35)" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12, color: "#d4a017", fontWeight: "bold" }}>{(f.username ?? "?").charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    <span className="font-fantasy text-xs flex-1 truncate" style={{ color: "#d4e8da" }} data-testid={`text-friend-username-${f.friendId}`}>{f.username}</span>
                    <button
                      data-testid={`button-remove-friend-${f.friendId}`}
                      onClick={() => removeFriendMutation.mutate(f.friendId)}
                      disabled={removeFriendMutation.isPending}
                      className="font-fantasy text-[10px] tracking-wider"
                      style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── World Decor Panel ────────────────────────────────────────────── */}
      {showDecorPanel && (
        <div
          className="fixed z-[10000] flex flex-col"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "calc(58*var(--vh))",
            background: "linear-gradient(180deg, rgba(4,10,6,0.97) 0%, rgba(6,14,7,0.99) 100%)",
            borderTop: `1.5px solid ${ACCENT}50`,
            borderLeft: `1.5px solid ${ACCENT}30`,
            borderRight: `1.5px solid ${ACCENT}30`,
            borderRadius: "16px 16px 0 0",
            boxShadow: `0 -8px 40px rgba(0,0,0,0.7), 0 0 40px ${ACCENT}15`,
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${ACCENT}25` }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}50` }}>
              World Decor
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-decor-item"
                onClick={() => setShowAddDecorForm(p => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: `${ACCENT}30`, border: `1.5px solid ${ACCENT}80`, cursor: "pointer" }}
                title="Upload custom decor"
              >
                <Plus className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
              <button onClick={() => { setShowDecorPanel(false); setShowAddDecorForm(false); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${ACCENT}88` }} />
              </button>
            </div>
          </div>

          {/* Light / effects quick-add row */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${ACCENT}18` }}>
            <span className="font-fantasy text-[9px] tracking-wider shrink-0" style={{ color: `${ACCENT}66` }}>Light:</span>
            {([
              { label: "Warm",   sentinel: LIGHT_ORB_SENTINEL,        bg: "radial-gradient(circle, rgba(255,220,100,0.75) 0%, rgba(255,150,0,0.4) 55%, transparent 80%)", border: "rgba(255,200,80,0.7)" },
              { label: "Blue",   sentinel: LIGHT_ORB_BLUE_SENTINEL,   bg: "radial-gradient(circle, rgba(120,190,255,0.75) 0%, rgba(60,120,255,0.4) 55%, transparent 80%)", border: "rgba(100,170,255,0.7)" },
              { label: "Green",  sentinel: LIGHT_ORB_GREEN_SENTINEL,  bg: "radial-gradient(circle, rgba(120,255,170,0.75) 0%, rgba(50,200,90,0.4) 55%, transparent 80%)",  border: "rgba(80,230,130,0.7)" },
              { label: "Purple", sentinel: LIGHT_ORB_PURPLE_SENTINEL, bg: "radial-gradient(circle, rgba(210,130,255,0.75) 0%, rgba(150,60,230,0.4) 55%, transparent 80%)", border: "rgba(190,100,255,0.7)" },
            ] as const).map(({ label, sentinel, bg, border }) => (
              <button key={sentinel}
                onClick={() => addDecorItemMutation.mutate({ name: `${label} Orb`, imageUrl: sentinel })}
                className="transition-transform active:scale-90"
                style={{ width: 26, height: 26, borderRadius: "50%", background: bg, border: `1.5px solid ${border}`, cursor: "pointer", flexShrink: 0 }}
                title={`Add ${label} orb`}
              />
            ))}
            {/* Fireflies */}
            <button onClick={() => addDecorItemMutation.mutate({ name: "Fireflies", imageUrl: FIREFLIES_SENTINEL })}
              className="transition-transform active:scale-90"
              style={{ width: 36, height: 26, borderRadius: 8, background: "rgba(20,20,8,0.85)", border: "1.5px solid rgba(255,220,0,0.45)", cursor: "pointer", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Add fireflies">
              {[0,1,2].map(i => (
                <div key={i} style={{
                  position: "absolute", left: `${[28,52,38][i]}%`, top: `${[40,25,62][i]}%`,
                  width: 3, height: 3, borderRadius: "50%",
                  background: "rgba(255,252,180,1)",
                  filter: "blur(0.4px)",
                  boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.6), 0 0 16px 7px rgba(255,190,0,0.25)",
                }} />
              ))}
            </button>
          </div>

          {/* Upload form */}
          {showAddDecorForm && (
            <div className="px-4 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: `1px solid ${ACCENT}18` }}>
              <input
                type="text"
                placeholder="Decor name…"
                value={newDecorName}
                onChange={e => setNewDecorName(e.target.value)}
                className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                style={{ background: "rgba(20,30,15,0.8)", border: `1px solid ${ACCENT}40`, color: ACCENT }}
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px] tracking-wider" style={{ color: `${ACCENT}80` }}>Image:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewDecorImage(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}>
                  {newDecorImage ? "✓ Loaded" : "Choose file"}
                </span>
              </label>
              <button
                onClick={() => { if (newDecorName.trim() && newDecorImage) addDecorItemMutation.mutate({ name: newDecorName.trim(), imageUrl: newDecorImage }); }}
                disabled={!newDecorName.trim() || !newDecorImage || addDecorItemMutation.isPending}
                className="font-fantasy text-xs py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: `${ACCENT}25`, border: `1.5px solid ${ACCENT}60`, color: ACCENT, cursor: "pointer" }}>
                {addDecorItemMutation.isPending ? "Saving…" : "Save Decor Item"}
              </button>
            </div>
          )}

          {/* Decor library */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {decorItems.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: `${ACCENT}55` }}>
                No decor yet — add items above then drag them onto the world
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {decorItems.map(item => {
                  const isPassThrough = PASS_THROUGH_SENTINELS.has(item.imageUrl);
                  return (
                    <div
                      key={item.id}
                      data-testid={`decor-item-${item.id}`}
                      className="relative flex flex-col items-center gap-1 rounded-xl p-2 cursor-grab active:cursor-grabbing transition-transform active:scale-95"
                      style={{ background: "rgba(10,22,12,0.8)", border: `1px solid ${ACCENT}25`, touchAction: "none" }}
                      onPointerDown={e => {
                        e.preventDefault();
                        panelDragRef.current = { item };
                        setPanelDragGhost({ clientX: e.clientX, clientY: e.clientY, item });
                      }}
                    >
                      {/* Preview */}
                      <div className="w-12 h-12 flex items-center justify-center overflow-hidden rounded-lg"
                        style={{ background: "rgba(6,14,8,0.7)" }}>
                        {isPassThrough ? (
                          item.imageUrl === FIREFLIES_SENTINEL ? (
                            <div className="relative w-10 h-10">
                              {[0,1,2,3].map(i => (
                                <div key={i} style={{
                                  position: "absolute", left: `${[20,55,35,65][i]}%`, top: `${[30,20,60,50][i]}%`,
                                  width: 3, height: 3, borderRadius: "50%",
                                  background: "rgba(255,252,180,1)",
                                  filter: "blur(0.4px)",
                                  boxShadow: "0 0 3px 2px rgba(255,248,120,0.95), 0 0 8px 4px rgba(255,220,30,0.55), 0 0 18px 8px rgba(255,190,0,0.22)",
                                }} />
                              ))}
                            </div>
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: getOrbGradient(item.imageUrl) }} />
                          )
                        ) : (
                          <img src={item.imageUrl} alt={item.name} style={{ width: 44, height: 44, objectFit: "contain" }} draggable={false} />
                        )}
                      </div>
                      <span className="font-fantasy text-[9px] tracking-wide text-center leading-tight line-clamp-2"
                        style={{ color: `${ACCENT}cc` }}>
                        {item.name}
                      </span>
                      {/* Delete item */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteDecorItemMutation.mutate(item.id); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10"
                        style={{ background: "rgba(200,30,30,0.9)", border: "1.5px solid rgba(255,80,80,0.6)", cursor: "pointer" }}
                        onPointerDown={e => e.stopPropagation()}>
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Places Panel ────────────────────────────────────────────── */}
      {showPlacesPanel && user.isAdmin && (
        <div
          className="fixed z-[10000] flex flex-col"
          style={{
            bottom: 0, left: 0, right: 0, maxHeight: "calc(58*var(--vh))",
            background: "linear-gradient(180deg, rgba(8,7,2,0.97) 0%, rgba(12,10,3,0.99) 100%)",
            borderTop: "1.5px solid #d4a01750",
            borderLeft: "1.5px solid #d4a01730",
            borderRight: "1.5px solid #d4a01730",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 40px rgba(212,160,23,0.12)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #d4a01725" }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: "#d4a017", textShadow: "0 0 12px #d4a01750" }}>
              Places
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-place"
                onClick={() => setShowAddLocForm(p => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: "#d4a01730", border: "1.5px solid #d4a01780", cursor: "pointer" }}
                title="Add new place"
              >
                <Plus className="w-4 h-4" style={{ color: "#d4a017" }} />
              </button>
              <button onClick={() => { setShowPlacesPanel(false); setShowAddLocForm(false); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: "#d4a01788" }} />
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAddLocForm && (
            <div className="px-4 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid #d4a01718" }}>
              <input
                type="text"
                placeholder="Place name…"
                value={newLocName}
                onChange={e => setNewLocName(e.target.value)}
                className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                style={{ background: "rgba(20,16,2,0.85)", border: "1px solid #d4a01740", color: "#d4a017" }}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 cursor-pointer font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>
                  Glow:
                  <input type="color" value={newLocGlow} onChange={e => setNewLocGlow(e.target.value)}
                    style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #d4a01750", cursor: "pointer", background: "none" }} />
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>Icon:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewLocIcon(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: "#d4a01722", border: "1px solid #d4a01750", color: "#d4a017", cursor: "pointer" }}>
                  {newLocIcon ? "✓ Loaded" : "Choose icon"}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-fantasy text-[10px]" style={{ color: "#d4a01780" }}>Owner:</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) { const url = await readFileAsDataUrl(f); setNewLocOwner(url); }
                }} />
                <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                  style={{ background: "#d4a01722", border: "1px solid #d4a01750", color: "#d4a017", cursor: "pointer" }}>
                  {newLocOwner ? "✓ Loaded" : "Owner image (optional)"}
                </span>
              </label>
              <button
                onClick={() => {
                  if (newLocName.trim()) addLocMutation.mutate({ name: newLocName.trim(), iconData: newLocIcon, ownerImageData: newLocOwner, glowColor: newLocGlow });
                }}
                disabled={!newLocName.trim() || addLocMutation.isPending}
                className="font-fantasy text-xs py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: "#d4a01725", border: "1.5px solid #d4a01760", color: "#d4a017", cursor: "pointer" }}>
                {addLocMutation.isPending ? "Saving…" : "Add Place"}
              </button>
            </div>
          )}

          {/* Places list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-4" style={{ paddingRight: 80 }}>
            {kcLocations.length === 0 ? (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: "#d4a01755" }}>
                No places yet — add one above
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {kcLocations.map(loc => (
                  <div key={loc.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: "rgba(20,16,2,0.7)", border: "1px solid #d4a01725" }}>
                    {loc.iconUrl
                      ? <img src={loc.iconUrl} alt={loc.name} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, border: "1px solid #d4a01740" }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#d4a01720", border: "1px solid #d4a01740", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Store className="w-5 h-5" style={{ color: "#d4a017" }} />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-fantasy text-xs" style={{ color: "#d4a017" }}>{loc.name}</p>
                      <p className="font-fantasy text-[9px]" style={{ color: "#d4a01760" }}>{loc.type} · {loc.posX.toFixed(1)}%, {loc.posY.toFixed(1)}%</p>
                    </div>
                    <button onClick={() => deleteLocMutation.mutate(loc.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.8)", border: "1.5px solid rgba(255,80,80,0.6)", cursor: "pointer" }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Location Shop Panel ────────────────────────────────────────────── */}
      {showLocShop && activeLocId && (() => {
        const activeLoc = kcLocations.find(l => l.id === activeLocId);
        const glow = activeLoc?.glowColor || "#d4a017";
        return (
          <div
            className="fixed z-[10000] flex flex-col"
            style={{
              bottom: 0, left: 0, right: 0, maxHeight: "calc(68*var(--vh))",
              background: "linear-gradient(180deg, rgba(6,4,1,0.97) 0%, rgba(10,7,2,0.99) 100%)",
              borderTop: `1.5px solid ${glow}50`,
              borderLeft: `1.5px solid ${glow}30`,
              borderRight: `1.5px solid ${glow}30`,
              borderRadius: "16px 16px 0 0",
              boxShadow: `0 -8px 40px rgba(0,0,0,0.8), 0 0 40px ${glow}15`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${glow}25` }}>
              <div className="flex items-center gap-3">
                {activeLoc?.iconUrl && (
                  <img src={activeLoc.iconUrl} alt="" className="w-10 h-10 rounded-lg object-contain" style={{ border: `1px solid ${glow}40` }} />
                )}
                <div>
                  <p className="font-fantasy text-sm tracking-wider" style={{ color: glow, textShadow: `0 0 10px ${glow}50` }}>
                    {activeLoc?.name || "Shop"}
                  </p>
                  {activeLoc?.description && (
                    <p className="font-fantasy text-[10px]" style={{ color: `${glow}70` }}>{activeLoc.description}</p>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowLocShop(false); setActiveLocId(null); }}
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${glow}88` }} />
              </button>
            </div>

            {/* Shop owner */}
            {activeLoc?.ownerImageUrl && (
              <div className="flex justify-center py-3 shrink-0" style={{ borderBottom: `1px solid ${glow}18` }}>
                <img src={activeLoc.ownerImageUrl} alt="Shop Owner"
                  style={{ height: 90, objectFit: "contain", filter: `drop-shadow(0 2px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${glow}30)` }} />
              </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {locShopItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Store style={{ width: 36, height: 36, color: `${glow}50` }} />
                  <p className="font-fantasy text-xs text-center" style={{ color: `${glow}55` }}>
                    No items for sale yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {locShopItems.map(item => {
                    const img = item.hatchedImageUrl || item.eggImageUrl || item.imageUrl;
                    const rarityColor = ["", "#a0a0b0", "#4ade80", "#60a5fa", "#c084fc", "#f0c040"][Math.min(5, item.rarity ?? 0)];
                    return (
                      <div key={item.id}
                        data-testid={`shop-item-${item.id}`}
                        className="flex flex-col items-center gap-1 rounded-xl p-2 transition-transform active:scale-95 cursor-pointer"
                        style={{ background: `rgba(20,14,2,0.85)`, border: `1px solid ${glow}25`, boxShadow: rarityColor ? `0 0 8px ${rarityColor}25` : undefined }}>
                        <div className="w-14 h-14 flex items-center justify-center rounded-lg overflow-hidden"
                          style={{ background: "rgba(10,7,1,0.7)" }}>
                          {img ? <img src={img} alt={item.name} style={{ width: 52, height: 52, objectFit: "contain" }} draggable={false} />
                            : <Store style={{ width: 28, height: 28, color: `${glow}60` }} />}
                        </div>
                        <span className="font-fantasy text-[9px] tracking-wide text-center leading-tight line-clamp-2"
                          style={{ color: `${glow}cc` }}>{item.name}</span>
                        <div className="flex items-center gap-1">
                          <img src={coinIconImg} alt="coins" style={{ width: 10, height: 10, objectFit: "contain" }} />
                          <span className="font-fantasy text-[9px]" style={{ color: "#f0c040" }}>{item.price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Admin Doors Panel ────────────────────────────────────────────── */}
      {showDoorsPanel && user.isAdmin && (
        <div
          className="fixed z-[10000] flex flex-col"
          style={{
            bottom: 0, left: 0, right: 0, maxHeight: "calc(55*var(--vh))",
            background: `linear-gradient(180deg, rgba(4,10,6,0.97) 0%, rgba(6,14,7,0.99) 100%)`,
            borderTop: `1.5px solid ${ACCENT}50`,
            borderLeft: `1.5px solid ${ACCENT}30`,
            borderRight: `1.5px solid ${ACCENT}30`,
            borderRadius: "16px 16px 0 0",
            boxShadow: `0 -8px 40px rgba(0,0,0,0.7), 0 0 40px ${ACCENT}15`,
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${ACCENT}25` }}>
            <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}50` }}>
              Interior Doors
            </span>
            <div className="flex items-center gap-2">
              <button
                data-testid="button-add-door"
                onClick={() => createDoorMutation.mutate()}
                disabled={createDoorMutation.isPending}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 disabled:opacity-40"
                style={{ background: `${ACCENT}30`, border: `1.5px solid ${ACCENT}80`, cursor: "pointer" }}
                title="Add new door"
              >
                <Plus className="w-4 h-4" style={{ color: ACCENT }} />
              </button>
              <button onClick={() => setShowDoorsPanel(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" style={{ color: `${ACCENT}88` }} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {kcDoors.length === 0 && (
              <p className="font-fantasy text-xs text-center py-6" style={{ color: `${ACCENT}55` }}>
                No doors yet — tap + to create one, then drag it on the map
              </p>
            )}
            {kcDoors.map(door => (
              <div
                key={door.id}
                className="rounded-xl p-3"
                style={{ background: "rgba(10,22,12,0.8)", border: `1px solid ${ACCENT}25` }}
              >
                {editingDoor?.id === door.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                      style={{ background: "rgba(20,30,15,0.8)", border: `1px solid ${ACCENT}40`, color: ACCENT }}
                      value={doorEditName}
                      onChange={e => setDoorEditName(e.target.value)}
                      placeholder="Door name…"
                    />
                    <div className="flex items-center gap-2">
                      <span className="font-fantasy text-[10px]" style={{ color: `${ACCENT}80` }}>Radius:</span>
                      <button onClick={() => setDoorEditRadius(r => Math.max(3, r - 1))}
                        style={{ width: 22, height: 22, borderRadius: "50%", background: `${ACCENT}20`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer", fontSize: 14 }}>−</button>
                      <span className="font-fantasy text-[10px]" style={{ color: ACCENT }}>{doorEditRadius}%</span>
                      <button onClick={() => setDoorEditRadius(r => Math.min(20, r + 1))}
                        style={{ width: 22, height: 22, borderRadius: "50%", background: `${ACCENT}20`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer", fontSize: 14 }}>+</button>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doorEditIsShop}
                        onChange={e => setDoorEditIsShop(e.target.checked)}
                        style={{ accentColor: ACCENT, width: 14, height: 14, cursor: "pointer" }}
                      />
                      <span className="font-fantasy text-[10px]" style={{ color: `${ACCENT}cc` }}>Mark as shop</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          updateDoorMutation.mutate({ id: door.id, name: doorEditName, triggerRadius: doorEditRadius, isShop: doorEditIsShop });
                          setEditingDoor(null);
                        }}
                        className="font-fantasy text-[10px] flex-1 py-1.5 rounded-lg transition-transform active:scale-95"
                        style={{ background: `${ACCENT}25`, border: `1.5px solid ${ACCENT}60`, color: ACCENT, cursor: "pointer" }}
                      >Save</button>
                      <button onClick={() => setEditingDoor(null)}
                        className="font-fantasy text-[10px] px-3 py-1.5 rounded-lg"
                        style={{ background: "rgba(60,20,20,0.6)", border: "1px solid rgba(200,80,80,0.4)", color: "#f87171", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <DoorOpen style={{ width: 20, height: 20, color: ACCENT, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-fantasy text-xs truncate" style={{ color: ACCENT }}>{door.name}</p>
                        {door.isShop && (
                          <span className="font-fantasy text-[8px] px-1 py-0.5 rounded shrink-0"
                            style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}50`, color: ACCENT }}>SHOP</span>
                        )}
                      </div>
                      <p className="font-fantasy text-[9px]" style={{ color: `${ACCENT}55` }}>
                        radius {door.triggerRadius}% · {door.posX.toFixed(0)}%,{door.posY.toFixed(0)}%
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingDoor(door); setDoorEditName(door.name); setDoorEditRadius(door.triggerRadius); setDoorEditIsShop(door.isShop); }}
                        className="font-fantasy text-[9px] px-2 py-1 rounded-lg"
                        style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}40`, color: ACCENT, cursor: "pointer" }}>Edit</button>
                      <button
                        onClick={() => { activeDoorIdRef.current = door.id; setActiveDoorId(door.id); setShowDoorsPanel(false); }}
                        className="font-fantasy text-[9px] px-2 py-1 rounded-lg"
                        style={{ background: "rgba(20,80,50,0.6)", border: `1px solid ${ACCENT}40`, color: ACCENT, cursor: "pointer" }}>Enter</button>
                      <button
                        onClick={() => { if (confirm(`Delete "${door.name}"?`)) deleteDoorMutation.mutate(door.id); }}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(200,30,30,0.8)", border: "1.5px solid rgba(255,80,80,0.5)", cursor: "pointer" }}>
                        <Trash2 style={{ width: 11, height: 11, color: "white" }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Door Interior Overlay ─────────────────────────────────────────── */}
      {activeDoorId && (() => {
        const door = kcDoors.find(d => d.id === activeDoorId);
        if (!door) return null;
        return (
          <div
            className="fixed inset-0 z-50 overflow-hidden"
            style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, animation: "doorFadeIn 0.35s ease-out both" }}
          >
            {/* Background */}
            <div
              ref={interiorRef}
              style={{
                position: "absolute", inset: 0,
                backgroundColor: "#0a1a0f",
                overflow: "hidden",
                touchAction: "none",
                // CSS background-image avoids all img-tag CSS constraints (max-width, height:auto)
                ...(door.bgUrl ? (
                  // Shop doors are like the bayou shops — a single contained
                  // scene that fits the screen with NO horizontal scroll.
                  // Non-shop doors keep the panoramic side-scroll interior.
                  door.isShop ? {
                    backgroundImage: `url(${door.bgUrl})`,
                    backgroundSize: "cover",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center center",
                  } : {
                    backgroundImage: `url(${door.bgUrl})`,
                    backgroundSize: "auto 100%",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: `-${bgPanX}px 0`,
                  }
                ) : {}),
              }}
              onPointerDown={handleInteriorPointerDown}
              onPointerMove={handleDoorDecorPointerMove}
              onPointerUp={handleDoorDecorPointerUp}
              onPointerCancel={handleDoorDecorPointerUp}
              onClick={() => { if (user.isAdmin) { setSelectedDoorDecorId(null); } }}
            >
              {/* Dark overlay tint */}
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", pointerEvents: "none" }} />

              {/* Decor placements — layer is sized to background image and scrolls with bg pan */}
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                // Width = rendered width of the background image; falls back to full container if not loaded yet
                width: bgRenderedW > 0 ? bgRenderedW : "100%",
                height: "100%",
                // Translate left by the same amount as the background pans
                transform: `translateX(-${bgPanX}px)`,
                pointerEvents: "none",
              }}>
              {doorDecorPlacements.map(p => {
                const livePos = doorDecorDragPos?.id === p.id ? { x: doorDecorDragPos.x, y: doorDecorDragPos.y } : { x: p.posX, y: p.posY };
                const isSelected = user.isAdmin && selectedDoorDecorId === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      position: "absolute",
                      left: `${livePos.x}%`,
                      top: `${livePos.y}%`,
                      width: p.size,
                      height: p.size,
                      transform: "translate(-50%, -50%)",
                      cursor: user.isAdmin ? "grab" : "default",
                      zIndex: isSelected ? 20 : 10,
                      touchAction: "none",
                      pointerEvents: "auto",
                    }}
                    onPointerDown={e => handleDoorDecorPointerDown(e, p)}
                    onClick={e => { if (user.isAdmin) { e.stopPropagation(); setSelectedDoorDecorId(prev => prev === p.id ? null : p.id); } }}
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      draggable={false}
                      style={{
                        width: "100%", height: "100%", objectFit: "contain",
                        transform: p.flipped ? "scaleX(-1)" : undefined,
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    />
                    {isSelected && (
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); deleteDoorDecorMutation.mutate(p.id); setSelectedDoorDecorId(null); }}
                          style={{ position: "absolute", top: -14, left: -14, width: 28, height: 28, borderRadius: "50%", background: "rgba(220,38,38,0.95)", border: "2px solid rgba(255,100,100,0.7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                          <Trash2 style={{ width: 12, height: 12, color: "white" }} />
                        </button>
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateDoorDecorMutation.mutate({ id: p.id, flipped: !p.flipped }); }}
                          style={{ position: "absolute", top: -14, right: -14, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,80,180,0.95)", border: "2px solid rgba(100,180,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", pointerEvents: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                          <FlipHorizontal style={{ width: 12, height: 12, color: "white" }} />
                        </button>
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateDoorDecorMutation.mutate({ id: p.id, size: Math.max(20, p.size - 10) }); }}
                          style={{ position: "absolute", bottom: -14, left: -14, width: 28, height: 28, borderRadius: "50%", background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", pointerEvents: "auto", fontSize: 16, color: "#7fffd4", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>−</button>
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateDoorDecorMutation.mutate({ id: p.id, size: Math.min(500, p.size + 10) }); }}
                          style={{ position: "absolute", bottom: -14, right: -14, width: 28, height: 28, borderRadius: "50%", background: "rgba(10,50,10,0.95)", border: "2px solid rgba(100,220,100,0.7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", pointerEvents: "auto", fontSize: 16, color: "#7fffd4", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>{/* end decor scrolling layer */}
            </div>{/* end background / interiorRef div */}

            {/* ── Shop layout — full-height panel for shop doors ── */}
            {door.isShop && (() => {
              const sortedDoorItems = [...doorShopItems].sort((a, b) => a.price - b.price);
              const TYPE_ORDER = ["pet","edibles","power_up","potion","special","accessory","item","fishing","gift"];
              const TYPE_LABELS: Record<string,string> = { pet:"Pets", edibles:"Edibles", power_up:"Power-Ups", potion:"Potions", special:"Special", accessory:"Accessories", item:"Items", fishing:"Fishing", gift:"Gifts" };
              const allPresentTypes = [...new Set(sortedDoorItems.map(i => i.type))];
              const presentTypes = [...TYPE_ORDER.filter(t => allPresentTypes.includes(t)), ...allPresentTypes.filter(t => !TYPE_ORDER.includes(t))];
              const getDoorItemDescription = (item: KCShopItem): string[] => {
                const lines: string[] = [];
                if (item.type === "pet") {
                  if (item.rarity) lines.push("★".repeat(item.rarity) + " Rarity");
                  if (item.hatchTime) lines.push(`Hatch: ${item.hatchTime}h`);
                } else if (item.description) {
                  lines.push(item.description);
                }
                return lines;
              };
              return (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: "calc(62*var(--vh))",
                  display: "flex", flexDirection: "column",
                  zIndex: 30,
                  pointerEvents: "auto",
                }}>
                  {/* Scene-to-shop gradient fade */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, background: "linear-gradient(180deg, transparent 0%, rgba(8,6,14,0.94) 100%)", pointerEvents: "none" }} />

                  {/* Shop header */}
                  <div className="relative flex items-center justify-between px-4 pt-5 pb-2 flex-shrink-0" style={{ zIndex: 2, background: "rgba(8,6,14,0.94)" }}>
                    <span className="font-fantasy text-base tracking-widest font-semibold" style={{ color: "#d4a017", textShadow: "0 0 14px rgba(212,160,23,0.6)" }}>{door.name}</span>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(20,14,4,0.85)", border: "1px solid rgba(212,160,23,0.35)" }}>
                      <img src={coinIconImg} alt="" style={{ width: 12, height: 12, objectFit: "contain" }} />
                      <span className="font-fantasy text-[11px]" style={{ color: "#f0c040" }}>{me?.coins ?? 0} coins</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex-shrink-0 mx-4 mb-2" style={{ zIndex: 2, height: 1, background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.5), transparent)" }} />

                  {/* Type tabs — only if more than one type */}
                  {presentTypes.length > 1 && (
                    <div className="flex-shrink-0 flex gap-2 px-3 pb-2 overflow-x-auto" style={{ zIndex: 2, scrollbarWidth: "none", background: "rgba(8,6,14,0.94)" }}>
                      {presentTypes.map(t => (
                        <button key={t} className="flex-shrink-0 font-fantasy tracking-widest transition-all active:scale-95"
                          style={{ fontSize: 10, letterSpacing: "0.12em", padding: "5px 12px", borderRadius: 20, background: "rgba(212,160,23,0.15)", border: "1.5px solid rgba(212,160,23,0.45)", color: "#d4a017", cursor: "pointer", whiteSpace: "nowrap" }}>
                          {TYPE_LABELS[t] ?? t.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Scrollable items body */}
                  <div className="flex-1 overflow-y-auto pb-8 px-3 pt-1" style={{ zIndex: 2, scrollbarWidth: "none", background: "rgba(8,6,14,0.94)" }}>
                    {sortedDoorItems.length === 0 ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-center px-8 py-6 rounded-2xl" style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(212,160,23,0.2)" }}>
                          <p className="font-fantasy text-[#c8b89a] text-sm tracking-wider">No wares yet.</p>
                          {user.isAdmin && <p className="font-fantasy text-[10px] tracking-wider mt-1" style={{ color: "rgba(212,160,23,0.6)" }}>Tap + to add items</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 pt-1">
                        {sortedDoorItems.map(item => {
                          const img = item.hatchedImageUrl || item.eggImageUrl || item.imageUrl;
                          const canAfford = (me?.coins ?? 0) >= item.price;
                          const descLines = getDoorItemDescription(item);
                          return (
                            <div
                              key={item.id}
                              data-testid={`door-shop-item-${item.id}`}
                              className="relative flex flex-col items-center rounded-2xl transition-transform active:scale-95"
                              style={{ background: "linear-gradient(160deg,rgba(0,0,0,0.42),rgba(0,0,0,0.58))", border: "1.5px solid rgba(212,160,23,0.3)", boxShadow: "0 2px 16px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05)", cursor: "pointer", padding: "10px 8px 8px" }}
                              onClick={() => { if (user.isAdmin) return; playTick(); setSelectedDoorShopItem(item); setDoorBuyStep(1); setDoorBuyQty(1); setDoorBuyError(null); }}
                            >
                              {user.isAdmin && (
                                <button
                                  data-testid={`button-unassign-door-item-${item.id}`}
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={e => { e.stopPropagation(); if (activeDoorId) unassignDoorItemMutation.mutate({ doorId: activeDoorId, itemId: item.id }); }}
                                  className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                                  style={{ background: "rgba(220,38,38,0.95)", border: "1px solid rgba(255,100,100,0.6)", cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10, color: "white" }} />
                                </button>
                              )}
                              <div className="w-full flex items-center justify-center mb-2" style={{ height: 72 }}>
                                {img
                                  ? <img src={img} alt={item.name} className="max-w-full max-h-full object-contain" style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7)) drop-shadow(0 0 6px rgba(212,160,23,0.3))" }} />
                                  : <Package style={{ width: 40, height: 40, color: "rgba(212,160,23,0.5)" }} />}
                              </div>
                              <p className="font-fantasy text-center text-white leading-tight mb-1.5" style={{ fontSize: 10, lineHeight: 1.3 }}>{item.name}</p>
                              {descLines.length > 0 && <p className="font-fantasy text-center leading-tight mb-1.5" style={{ fontSize: 8, color: "rgba(212,160,23,0.75)", lineHeight: 1.2 }}>{descLines[0]}</p>}
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: canAfford ? "rgba(212,160,23,0.2)" : "rgba(80,60,40,0.25)", border: `1px solid ${canAfford ? "rgba(212,160,23,0.5)" : "rgba(100,80,50,0.35)"}` }}>
                                <img src={coinIconImg} alt="" style={{ width: 9, height: 9, objectFit: "contain" }} />
                                <span className="font-fantasy" style={{ fontSize: 9, color: canAfford ? "#f0c040" : "#7a6040", fontWeight: 700 }}>{item.price}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Interior HUD ── */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 60 }}>
              {/* Top bar */}
              <div className="absolute left-0 right-0 pointer-events-auto flex items-center justify-between px-3"
                style={{
                  top: 0,
                  paddingTop: "max(12px, env(safe-area-inset-top, 12px))",
                  paddingBottom: 8,
                  background: "linear-gradient(180deg, rgba(4,10,6,0.92) 0%, transparent 100%)",
                }}>
                {/* Door name */}
                <span className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}60` }}>
                  {door.name}
                </span>

                <div className="flex items-center gap-2">
                  {/* Admin: add decor */}
                  {user.isAdmin && (
                    <>
                      {door.isShop && (
                        <button
                          data-testid="button-door-item-picker"
                          onClick={() => setShowDoorItemPicker(p => !p)}
                          className="flex items-center gap-1 px-2.5 h-8 rounded-full transition-transform active:scale-90 font-fantasy text-[10px]"
                          style={{
                            background: showDoorItemPicker ? `${ACCENT}30` : "rgba(4,10,6,0.82)",
                            border: `1.5px solid ${ACCENT}50`,
                            color: ACCENT,
                            cursor: "pointer",
                          }}
                          title="Manage shop items"
                        >
                          <Store style={{ width: 12, height: 12 }} />
                          <Plus style={{ width: 10, height: 10 }} />
                        </button>
                      )}
                      <button
                        data-testid="button-door-add-decor"
                        onClick={() => setShowDoorAddDecorForm(p => !p)}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
                        style={{ background: showDoorAddDecorForm ? `${ACCENT}30` : "rgba(4,10,6,0.82)", border: `1.5px solid ${ACCENT}50`, cursor: "pointer" }}
                        title="Add decor to interior"
                      >
                        <Plus style={{ width: 14, height: 14, color: ACCENT }} />
                      </button>
                    </>
                  )}
                  {/* Exit */}
                  <button
                    data-testid="button-exit-door"
                    onClick={() => {
                      doorCooldownRef.current = activeDoorId;
                      setTimeout(() => { doorCooldownRef.current = null; }, 3000);
                      activeDoorIdRef.current = null;
                      setActiveDoorId(null);
                      setShowDoorAddDecorForm(false);
                      setSelectedDoorDecorId(null);
                      setShowDoorItemPicker(false);
                    }}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-full transition-transform active:scale-90 font-fantasy text-xs"
                    style={{ background: "rgba(40,10,10,0.9)", border: "1.5px solid rgba(200,80,80,0.5)", color: "#f87171", cursor: "pointer" }}
                  >
                    <X style={{ width: 12, height: 12 }} />
                    Leave
                  </button>
                </div>
              </div>

              {/* Admin: add decor form */}
              {user.isAdmin && showDoorAddDecorForm && (
                <div className="absolute pointer-events-auto"
                  style={{
                    top: 56, left: 12, right: 12, zIndex: 61,
                    background: "rgba(4,10,6,0.96)", border: `1.5px solid ${ACCENT}40`,
                    borderRadius: 14, padding: "12px 14px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
                  }}>
                  <p className="font-fantasy text-[10px] tracking-widest mb-2" style={{ color: `${ACCENT}88` }}>ADD INTERIOR DECOR</p>
                  <div className="flex flex-col gap-2">
                    <input
                      className="font-fantasy text-xs rounded-lg px-3 py-2 outline-none"
                      style={{ background: "rgba(20,30,15,0.8)", border: `1px solid ${ACCENT}40`, color: ACCENT }}
                      value={newDoorDecorName}
                      onChange={e => setNewDoorDecorName(e.target.value)}
                      placeholder="Decor name…"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="font-fantasy text-[10px]" style={{ color: `${ACCENT}80` }}>Image:</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0];
                        if (f) { const url = await readFileAsDataUrl(f); setNewDoorDecorImage(url); }
                      }} />
                      <span className="font-fantasy text-[10px] px-2 py-1 rounded-lg transition-transform active:scale-95"
                        style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}>
                        {newDoorDecorImage ? "✓ Loaded" : "Choose file"}
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (newDoorDecorName.trim() && newDoorDecorImage && activeDoorId) {
                            addDoorDecorMutation.mutate({ doorId: activeDoorId, name: newDoorDecorName.trim(), imageUrl: newDoorDecorImage });
                            setNewDoorDecorName(""); setNewDoorDecorImage(null); setShowDoorAddDecorForm(false);
                          }
                        }}
                        disabled={!newDoorDecorName.trim() || !newDoorDecorImage || addDoorDecorMutation.isPending}
                        className="font-fantasy text-xs flex-1 py-2 rounded-lg transition-transform active:scale-95 disabled:opacity-40"
                        style={{ background: `${ACCENT}25`, border: `1.5px solid ${ACCENT}60`, color: ACCENT, cursor: "pointer" }}
                      >
                        {addDoorDecorMutation.isPending ? "Saving…" : "Add Decor"}
                      </button>
                      <button onClick={() => { setShowDoorAddDecorForm(false); setNewDoorDecorName(""); setNewDoorDecorImage(null); }}
                        className="font-fantasy text-xs px-3 py-2 rounded-lg"
                        style={{ background: "rgba(60,20,20,0.6)", border: "1px solid rgba(200,80,80,0.4)", color: "#f87171", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Price-tag buy modal for door shop items ─────────────────────── */}
      {selectedDoorShopItem && doorBuyStep > 0 && (() => {
        const item = selectedDoorShopItem;
        const img = item.hatchedImageUrl || item.eggImageUrl || item.imageUrl;
        const maxQty = item.type === "pet" ? 1 : 20;
        const totalCost = item.price * (item.type === "pet" ? 1 : doorBuyQty);
        const canAfford = (me?.coins ?? 0) >= totalCost;
        const descLines: string[] = [];
        if (item.type === "pet") {
          if (item.rarity) descLines.push("★".repeat(item.rarity) + " Rarity");
          if (item.hatchTime) descLines.push(`Hatch: ${item.hatchTime}h`);
        } else if (item.description) {
          descLines.push(item.description);
        }
        return (
          <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ zIndex: 200, maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/70" onClick={() => { setSelectedDoorShopItem(null); setDoorBuyStep(0); setDoorBuyError(null); setDoorBuyQty(1); }} />
            <div className="relative z-10 flex flex-col items-center" style={{ gap: 14 }}>
              {/* Price tag */}
              <div className="relative" style={{ width: "min(calc(115*var(--vw)), calc(115*var(--vh)))", height: "min(calc(115*var(--vw)), calc(115*var(--vh)))" }}>
                <img src={priceTagImg} alt="" className="absolute inset-0 w-full h-full pointer-events-none select-none" style={{ objectFit: "fill", filter: "drop-shadow(0 14px 36px rgba(0,0,0,0.95)) drop-shadow(0 3px 8px rgba(0,0,0,0.7))" }} />
                {/* Item image */}
                {doorBuyStep === 1 && (
                  <div style={{ position: "absolute", left: "50%", top: "63%", transform: "translate(-50%, -50%)", zIndex: 25, width: 96, height: 96, pointerEvents: "none" }}>
                    {img ? <img src={img} alt={item.name} className="w-full h-full object-contain" style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.75))" }} /> : <Package style={{ width: 80, height: 80, color: "rgba(80,40,10,0.75)" }} />}
                  </div>
                )}
                {/* Step 1: name + description + price */}
                {doorBuyStep === 1 && (
                  <div className="absolute flex flex-col justify-between" style={{ top: "41%", left: "29%", right: "29%", bottom: "11%", overflow: "hidden" }}>
                    <div className="text-center">
                      <h3 className="font-fantasy font-bold leading-tight" style={{ color: "#1a0700", fontSize: 14, textShadow: "-1px -1px 0 rgba(255,225,150,0.85), 1px -1px 0 rgba(255,225,150,0.85), -1px 1px 0 rgba(255,225,150,0.85), 1px 1px 0 rgba(255,225,150,0.85)" }}>{item.name}</h3>
                    </div>
                    <div>
                      {descLines.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          {descLines.slice(0, 3).map((line, i) => (
                            <div key={i} className="font-fantasy text-center" style={{ fontSize: 9.5, fontWeight: "bold", color: "#1e0800", lineHeight: 1.45, textShadow: "-1px -1px 0 rgba(255,225,150,0.7), 1px -1px 0 rgba(255,225,150,0.7), -1px 1px 0 rgba(255,225,150,0.7), 1px 1px 0 rgba(255,225,150,0.7)" }}>{line}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ borderTop: "1px solid rgba(100,50,10,0.28)", marginBottom: 6 }} />
                      <div className="flex items-center justify-center" style={{ gap: 5 }}>
                        <img src={coinIconImg} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />
                        <span className="font-fantasy font-bold" style={{ fontSize: 15, color: "#1e0800", textShadow: "-1px -1px 0 rgba(255,225,150,0.85), 1px -1px 0 rgba(255,225,150,0.85), -1px 1px 0 rgba(255,225,150,0.85), 1px 1px 0 rgba(255,225,150,0.85)" }}>{item.price} coins</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Step 2: name + qty + total */}
                {doorBuyStep === 2 && (
                  <div className="absolute flex flex-col justify-center items-center" style={{ top: "41%", left: "29%", right: "29%", bottom: "5%", overflow: "hidden", gap: 6 }}>
                    <h3 className="font-fantasy font-bold text-center" style={{ fontSize: 14, color: "#1a0700", textShadow: "-1px -1px 0 rgba(255,225,150,0.85), 1px -1px 0 rgba(255,225,150,0.85), -1px 1px 0 rgba(255,225,150,0.85), 1px 1px 0 rgba(255,225,150,0.85)" }}>{item.name}</h3>
                    <div style={{ borderTop: "1px solid rgba(100,50,10,0.25)", width: "100%" }} />
                    {item.type !== "pet" && (
                      <div className="flex flex-col items-center" style={{ gap: 3 }}>
                        <span className="font-fantasy" style={{ fontSize: 9, color: "#2e1000", fontWeight: 600, textShadow: "-1px -1px 0 rgba(255,225,150,0.7), 1px -1px 0 rgba(255,225,150,0.7), -1px 1px 0 rgba(255,225,150,0.7), 1px 1px 0 rgba(255,225,150,0.7)" }}>How many?</span>
                        <div className="flex items-center" style={{ gap: 16 }}>
                          {doorBuyQty > 1 && (
                            <button onClick={() => setDoorBuyQty(q => Math.max(1, q - 1))} className="rounded-full flex items-center justify-center font-bold transition-transform active:scale-90" style={{ width: 30, height: 30, background: "rgba(65,30,5,0.28)", border: "1.5px solid rgba(130,65,18,0.55)", color: "#1e0900", cursor: "pointer", fontSize: 16 }}>−</button>
                          )}
                          <span className="font-fantasy font-bold" style={{ fontSize: 24, color: "#1e0900", minWidth: "2ch", textAlign: "center", textShadow: "-1px -1px 0 rgba(255,225,150,0.8), 1px -1px 0 rgba(255,225,150,0.8), -1px 1px 0 rgba(255,225,150,0.8), 1px 1px 0 rgba(255,225,150,0.8)" }}>{doorBuyQty}</span>
                          <button onClick={() => setDoorBuyQty(q => Math.min(maxQty, q + 1))} className="rounded-full flex items-center justify-center font-bold transition-transform active:scale-90" style={{ width: 30, height: 30, background: "rgba(65,30,5,0.28)", border: "1.5px solid rgba(130,65,18,0.55)", color: "#1e0900", cursor: "pointer", fontSize: 16 }}>+</button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center" style={{ gap: 5 }}>
                      <img src={coinIconImg} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} />
                      <span className="font-fantasy font-bold" style={{ fontSize: 18, color: "#1e0900", textShadow: "-1px -1px 0 rgba(255,225,150,0.8), 1px -1px 0 rgba(255,225,150,0.8), -1px 1px 0 rgba(255,225,150,0.8), 1px 1px 0 rgba(255,225,150,0.8)" }}>{totalCost} coins</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Buy button — step 1 */}
              {doorBuyStep === 1 && (
                <div className="flex flex-col items-center" style={{ gap: 4, maxWidth: "calc(90*var(--vw))", width: "100%" }}>
                  <button
                    data-testid="button-door-price-buy"
                    onClick={() => { setDoorBuyStep(2); setDoorBuyQty(1); }}
                    className="w-full font-fantasy font-bold tracking-wide transition-transform active:scale-95"
                    style={{ padding: "11px 40px", fontSize: 14, borderRadius: 12, background: canAfford ? "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)" : "rgba(60,42,18,0.55)", border: `2px solid ${canAfford ? "rgba(220,148,42,0.9)" : "rgba(100,75,40,0.3)"}`, color: canAfford ? "#ffd04a" : "#7a6040", cursor: "pointer", boxShadow: canAfford ? "0 4px 16px rgba(90,45,0,0.5)" : "none", letterSpacing: "0.08em" }}
                  >Buy</button>
                  {!canAfford && <p className="font-fantasy text-center" style={{ fontSize: 10, color: "#e84040", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>Not enough coins</p>}
                </div>
              )}
              {/* Confirm / back — step 2 */}
              {doorBuyStep === 2 && (
                <div className="flex flex-col items-center" style={{ gap: 6, maxWidth: "calc(90*var(--vw))", width: "100%" }}>
                  {doorBuyError && (
                    <div className="font-fantasy text-center w-full" style={{ fontSize: 9, padding: "5px 10px", borderRadius: 8, background: "rgba(150,10,10,0.35)", color: "#ffaaaa", border: "1px solid rgba(200,50,50,0.4)" }}>{doorBuyError}</div>
                  )}
                  <div className="flex w-full" style={{ gap: 10 }}>
                    <button onClick={() => { setDoorBuyStep(1); setDoorBuyError(null); }} className="flex-1 font-fantasy font-semibold transition-transform active:scale-95" style={{ padding: "11px 0", fontSize: 13, borderRadius: 12, background: "rgba(40,25,8,0.7)", border: "1.5px solid rgba(115,65,20,0.5)", color: "#c8a060", cursor: "pointer" }}>Back</button>
                    <button
                      data-testid="button-door-confirm-buy"
                      onClick={(e) => { burstGoldenOrbs(e.clientX, e.clientY); doorBuyMutation.mutate({ itemId: item.id, quantity: doorBuyQty }); }}
                      disabled={doorBuyMutation.isPending}
                      className="flex-1 font-fantasy font-bold transition-transform active:scale-95 disabled:opacity-50"
                      style={{ padding: "11px 0", fontSize: 13, borderRadius: 12, background: "linear-gradient(135deg, rgba(115,62,10,0.97) 0%, rgba(78,40,6,0.97) 100%)", border: "2px solid rgba(220,148,42,0.9)", color: "#ffd04a", cursor: "pointer", boxShadow: "0 4px 14px rgba(90,45,0,0.5)" }}
                    >{doorBuyMutation.isPending ? "Buying…" : "Confirm Buy!"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Door Item Picker Modal ────────────────────────────────────────── */}
      {showDoorItemPicker && user?.isAdmin && activeDoorId && (() => {
        const door = kcDoors.find(d => d.id === activeDoorId);
        if (!door?.isShop) return null;
        const pickable = (allDoorShopItems ?? []).filter(si => {
          if (si.fishingType === "fish") return false;
          if (si.fishingType === "bait" && si.locationId != null) return false;
          if (doorPickerFilter === "all") return true;
          if (doorPickerFilter === "fishing") return si.type === "fishing";
          return si.type === doorPickerFilter;
        });
        return (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center"
            style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDoorItemPicker(false)} />
            <div
              className="relative z-10 w-[90%] max-w-sm rounded-lg max-h-[calc(82*var(--vh))] flex flex-col"
              style={{
                background: "linear-gradient(135deg, rgba(4,10,6,0.98) 0%, rgba(8,18,10,0.98) 100%)",
                border: `1px solid ${ACCENT}55`,
                boxShadow: `0 0 40px ${ACCENT}20`,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Store style={{ width: 14, height: 14, color: ACCENT }} />
                  <h3 className="font-fantasy text-sm tracking-widest" style={{ color: ACCENT, textShadow: `0 0 10px ${ACCENT}40` }}>Manage Shop Items</h3>
                </div>
                <button
                  data-testid="button-close-door-item-picker"
                  onClick={() => setShowDoorItemPicker(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40`, cursor: "pointer", color: ACCENT }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Top-level tabs: Items / House / Decor */}
              <div className="flex-shrink-0 px-3 pb-2 flex gap-1 border-b" style={{ borderColor: `${ACCENT}20` }}>
                {(["items", "house", "decor"] as const).map(tab => (
                  <button
                    key={tab}
                    data-testid={`button-door-tab-${tab}`}
                    onClick={() => setDoorPickerTab(tab)}
                    className="font-fantasy text-[10px] px-3 py-1.5 rounded-t-md transition-all flex-1 capitalize"
                    style={{
                      background: doorPickerTab === tab ? `${ACCENT}25` : "transparent",
                      borderBottom: doorPickerTab === tab ? `2px solid ${ACCENT}` : "2px solid transparent",
                      color: doorPickerTab === tab ? ACCENT : `${ACCENT}60`,
                      cursor: "pointer",
                    }}
                  >{tab === "items" ? "Items" : tab === "house" ? "House" : "Decor"}</button>
                ))}
              </div>

              {/* Sub-filter tabs (Items only) */}
              {doorPickerTab === "items" && (
                <div className="flex-shrink-0 px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: "All", value: "all" },
                      { label: "Potions", value: "potion" },
                      { label: "Power-Ups", value: "power_up" },
                      { label: "Special", value: "special" },
                      { label: "Edibles", value: "edibles" },
                      { label: "Gifts", value: "gift" },
                      { label: "Accessories", value: "accessory" },
                      { label: "Pets", value: "pet" },
                      { label: "Fishing", value: "fishing" },
                    ].map(f => (
                      <button
                        key={f.value}
                        data-testid={`button-door-picker-filter-${f.value}`}
                        onClick={() => setDoorPickerFilter(f.value)}
                        className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-all"
                        style={{
                          background: doorPickerFilter === f.value ? `${ACCENT}35` : "rgba(255,255,255,0.05)",
                          border: `1px solid ${doorPickerFilter === f.value ? ACCENT + "70" : "rgba(255,255,255,0.1)"}`,
                          color: doorPickerFilter === f.value ? ACCENT : `${ACCENT}70`,
                          cursor: "pointer",
                        }}
                      >{f.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                {/* Items tab */}
                {doorPickerTab === "items" && (
                  allDoorShopItemsLoading ? (
                    <p className="font-fantasy text-[#a89878] text-xs text-center py-6 animate-pulse">Loading items…</p>
                  ) : pickable.length === 0 ? (
                    <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No items match this filter.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pickable.map(si => {
                        const alreadyAssigned = doorShopItems.some(it => it.id === si.id);
                        const pickerImg = si.type === "pet" ? (si.eggImageUrl || si.imageUrl) : si.imageUrl;
                        return (
                          <div
                            key={si.id}
                            data-testid={`door-picker-item-${si.id}`}
                            className="flex items-center gap-3 p-2 rounded-lg"
                            style={{
                              background: alreadyAssigned ? `${ACCENT}15` : "rgba(255,255,255,0.03)",
                              border: `1px solid ${alreadyAssigned ? ACCENT + "40" : "rgba(255,255,255,0.08)"}`,
                            }}
                          >
                            <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: "rgba(0,0,0,0.3)" }}>
                              {pickerImg
                                ? <img src={pickerImg} alt="" className="w-full h-full object-contain rounded-md" />
                                : <Package className="w-5 h-5" style={{ color: `${ACCENT}40` }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-fantasy text-xs truncate" style={{ color: ACCENT }}>{si.name}</p>
                              <p className="font-fantasy text-[9px]" style={{ color: `${ACCENT}70` }}>
                                {si.price} coins · {si.fishingType ?? si.type}
                              </p>
                              {si.type === "gift" && si.giftPoints != null && (
                                <p className="font-fantasy text-[8px]" style={{ color: "#ec4899" }}>+{si.giftPoints} loyalty pts</p>
                              )}
                            </div>
                            {alreadyAssigned ? (
                              <button
                                data-testid={`button-door-unassign-${si.id}`}
                                onClick={() => unassignDoorItemMutation.mutate({ doorId: activeDoorId, itemId: si.id })}
                                disabled={unassignDoorItemMutation.isPending}
                                className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-transform active:scale-95"
                                style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#f87171", cursor: "pointer" }}
                              >Remove</button>
                            ) : (
                              <button
                                data-testid={`button-door-assign-${si.id}`}
                                onClick={() => assignDoorItemMutation.mutate({ doorId: activeDoorId, itemId: si.id })}
                                disabled={assignDoorItemMutation.isPending}
                                className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                                style={{ background: `${ACCENT}30`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}
                              >Add</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* House bundles tab */}
                {doorPickerTab === "house" && (
                  <div className="flex flex-col gap-2 pt-1">
                    {allAdminBundles.length === 0 ? (
                      <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No house bundles created yet.</p>
                    ) : allAdminBundles.map(bundle => {
                      const inShop = doorShopBundles.some(lb => lb.bundleId === bundle.id);
                      return (
                        <div
                          key={bundle.id}
                          data-testid={`door-picker-bundle-${bundle.id}`}
                          className="flex items-center gap-3 p-2 rounded-lg"
                          style={{
                            background: inShop ? `${ACCENT}15` : "rgba(255,255,255,0.03)",
                            border: `1px solid ${inShop ? ACCENT + "40" : "rgba(255,255,255,0.08)"}`,
                          }}
                        >
                          <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                            {bundle.shopImageUrl
                              ? <img src={bundle.shopImageUrl} alt="" className="w-full h-full object-cover" />
                              : <span className="w-full h-full flex items-center justify-center text-lg">🏡</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-fantasy text-xs truncate" style={{ color: ACCENT }}>{bundle.name}</p>
                            <p className="font-fantasy text-[9px]" style={{ color: `${ACCENT}70` }}>{bundle.price} coins · house bundle</p>
                          </div>
                          {inShop ? (
                            <button
                              data-testid={`button-door-unassign-bundle-${bundle.id}`}
                              onClick={() => unassignDoorBundleMutation.mutate({ doorId: activeDoorId, bundleId: bundle.id })}
                              disabled={unassignDoorBundleMutation.isPending}
                              className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-transform active:scale-95"
                              style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#f87171", cursor: "pointer" }}
                            >Remove</button>
                          ) : (
                            <button
                              data-testid={`button-door-assign-bundle-${bundle.id}`}
                              onClick={() => assignDoorBundleMutation.mutate({ doorId: activeDoorId, bundleId: bundle.id })}
                              disabled={assignDoorBundleMutation.isPending}
                              className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                              style={{ background: `${ACCENT}30`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}
                            >Add</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Home decor tab */}
                {doorPickerTab === "decor" && (
                  <div className="flex flex-col gap-2 pt-1">
                    {allAdminDecor.length === 0 ? (
                      <p className="font-fantasy text-[#a89878] text-xs text-center py-6">No decor items created yet.</p>
                    ) : allAdminDecor.map(decor => {
                      const inShop = doorShopDecor.some(ld => ld.decorId === decor.id);
                      return (
                        <div
                          key={decor.id}
                          data-testid={`door-picker-decor-${decor.id}`}
                          className="flex items-center gap-3 p-2 rounded-lg"
                          style={{
                            background: inShop ? `${ACCENT}15` : "rgba(255,255,255,0.03)",
                            border: `1px solid ${inShop ? ACCENT + "40" : "rgba(255,255,255,0.08)"}`,
                          }}
                        >
                          <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                            {decor.imageUrl
                              ? <img src={decor.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <span className="w-full h-full flex items-center justify-center text-lg">🪴</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-fantasy text-xs truncate" style={{ color: ACCENT }}>{decor.name}</p>
                            <p className="font-fantasy text-[9px]" style={{ color: `${ACCENT}70` }}>{decor.price} coins · home decor</p>
                          </div>
                          {inShop ? (
                            <button
                              data-testid={`button-door-unassign-decor-${decor.id}`}
                              onClick={() => unassignDoorDecorMutation.mutate({ doorId: activeDoorId, decorId: decor.id })}
                              disabled={unassignDoorDecorMutation.isPending}
                              className="font-fantasy text-[9px] px-2 py-1 rounded-full transition-transform active:scale-95"
                              style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#f87171", cursor: "pointer" }}
                            >Remove</button>
                          ) : (
                            <button
                              data-testid={`button-door-assign-decor-${decor.id}`}
                              onClick={() => assignDoorDecorMutation.mutate({ doorId: activeDoorId, decorId: decor.id })}
                              disabled={assignDoorDecorMutation.isPending}
                              className="font-fantasy text-[9px] px-3 py-1 rounded-full transition-transform active:scale-95"
                              style={{ background: `${ACCENT}30`, border: `1px solid ${ACCENT}50`, color: ACCENT, cursor: "pointer" }}
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
        );
      })()}

      {/* ── Panel drag ghost ─────────────────────────────────────────────── */}
      {panelDragGhost && (
        <div className="fixed pointer-events-none z-50"
          style={{
            left: panelDragGhost.clientX - 28, top: panelDragGhost.clientY - 28,
            width: 56, height: 56,
            opacity: 0.85, transform: "scale(1.1)",
            filter: `drop-shadow(0 4px 14px ${ACCENT}60)`,
          }}>
          {PASS_THROUGH_SENTINELS.has(panelDragGhost.item.imageUrl) ? (
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: getOrbGradient(panelDragGhost.item.imageUrl) }} />
          ) : (
            <img src={panelDragGhost.item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
          )}
        </div>
      )}



      {/* ── Joystick — always visible on the map (hidden only while inside a
           door overlay). When the player has no active pet, the stick still
           shows but its movement loop is a harmless no-op (startRaf and
           handleJoystickChange both guard ownPet before saving / moving),
           which keeps the on-screen affordance consistent for everyone. ─── */}
      {!activeDoorId && (
        <Joystick onChange={handleJoystickChange} />
      )}

      {/* ── Pet detail modal ─────────────────────────────────────────────── */}
      {selectedPet && (
        <PetDetailModal
          pet={selectedPet}
          currentUserId={user.id}
          onClose={() => setSelectedPet(null)}
        />
      )}

      {/* User profile / settings panel */}
      {showProfile && me && (
        <UserProfilePanel
          user={me}
          onClose={() => setShowProfile(false)}
          onUserUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}

// ── PetDetailModal ─────────────────────────────────────────────────────────
function PetDetailModal({
  pet,
  currentUserId,
  onClose,
}: {
  pet: WorldActivePet;
  currentUserId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const isOwnPet = pet.userId === currentUserId;

  const { data: friendStatus, isLoading: statusLoading } = useQuery<{ friendship: any | null }>({
    queryKey: ["/api/friends/status", pet.userId],
    queryFn: async () => {
      const res = await fetch(`/api/friends/status/${pet.userId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isOwnPet,
  });

  const sendRequestMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/friends/request/${pet.userId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", pet.userId] });
      toast({ title: "Friend request sent!", description: `Request sent to ${pet.username}.` });
    },
    onError: () => toast({ title: "Error", description: "Could not send friend request.", variant: "destructive" }),
  });

  const cancelRequestMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/friends/${pet.userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/status", pet.userId] });
      toast({ title: "Request cancelled", description: "Friend request unsent." });
    },
    onError: () => toast({ title: "Error", description: "Could not cancel request.", variant: "destructive" }),
  });

  const [pendingHover, setPendingHover] = useState(false);

  const rarityCount = Math.min(5, Math.max(0, pet.rarity ?? 0));
  const RARITY_COLOURS = ["", "#a0a0b0", "#4ade80", "#60a5fa", "#c084fc", "#f0c040"];
  const starColour = RARITY_COLOURS[rarityCount] ?? "#f0c040";

  const displayName = pet.petNickname || pet.name;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;

  const friendship = friendStatus?.friendship;
  const isFriend = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0, padding: "0 24px" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div
        className="relative w-full rounded-2xl overflow-hidden animate-slide-up"
        style={{
          background: "linear-gradient(160deg, #0d1f10 0%, #0a1a0c 50%, #081408 100%)",
          border: "1.5px solid rgba(127,255,212,0.22)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.9), 0 0 60px rgba(127,255,212,0.04), inset 0 1px 0 rgba(127,255,212,0.12)",
          maxHeight: "calc(86*var(--vh))",
        }}
      >
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.45), transparent)" }} />

        {/* Close button */}
        <button
          data-testid="button-close-pet-detail"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full z-10 transition-transform active:scale-90"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(127,255,212,0.25)", color: ACCENT, fontSize: 16, cursor: "pointer" }}
        >
          ✕
        </button>

        <div className="flex flex-col items-center px-6 pt-7 pb-7 gap-4">

          {/* Pet image — large, centred */}
          <div style={{ width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {petImg ? (
              <img
                src={petImg}
                alt={displayName}
                style={{ width: 160, height: 160, objectFit: "contain", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.8)) drop-shadow(0 0 30px rgba(127,255,212,0.12))" }}
              />
            ) : (
              <div style={{ width: 160, height: 160, borderRadius: 16, background: "rgba(127,255,212,0.06)", border: "1px solid rgba(127,255,212,0.15)" }} />
            )}
          </div>

          {/* Pet name */}
          <div className="flex flex-col items-center gap-1.5">
            <p
              className="font-fantasy font-semibold text-center"
              style={{ fontSize: 20, color: ACCENT, textShadow: `0 0 16px ${ACCENT}55` }}
              data-testid="text-pet-detail-name"
            >
              {displayName}
            </p>
            {pet.petNickname && (
              <p className="font-fantasy text-[10px] tracking-widest" style={{ color: "rgba(127,255,212,0.45)" }}>{pet.name}</p>
            )}

            {/* Rarity stars */}
            {rarityCount > 0 && (
              <div className="flex gap-1 items-center">
                {Array.from({ length: rarityCount }).map((_, i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill={starColour} style={{ filter: `drop-shadow(0 0 5px ${starColour}bb)` }}>
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, transparent, rgba(127,255,212,0.18), transparent)" }} />

          {/* Owner row */}
          <div className="flex flex-col items-center gap-2">
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid rgba(212,160,23,0.55)", overflow: "hidden", background: "rgba(212,160,23,0.12)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {pet.profileImage ? (
                <img src={pet.profileImage} alt={pet.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 20, color: "#d4a017", fontWeight: "bold" }}>{(pet.username ?? "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span className="font-fantasy text-sm" style={{ color: "#d4a017", textShadow: "0 0 10px rgba(212,160,23,0.35)" }} data-testid="text-pet-detail-owner">{pet.username}</span>
          </div>

          {/* Action buttons */}
          {isOwnPet ? (
            <p className="font-fantasy text-[11px] tracking-widest" style={{ color: "rgba(127,255,212,0.35)" }}>Your pet</p>
          ) : (
            <div className="flex items-center gap-3 w-full justify-center">
              {/* Add Friend / status */}
              {statusLoading ? (
                <div style={{ color: "rgba(127,255,212,0.5)", fontSize: 11 }} className="font-fantasy">Loading...</div>
              ) : isFriend ? (
                <div
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full"
                  style={{ background: "rgba(127,255,212,0.08)", border: "1px solid rgba(127,255,212,0.3)", color: ACCENT }}
                  data-testid="status-already-friends"
                >
                  ✓ Friends
                </div>
              ) : isPending ? (
                <button
                  data-testid="button-request-pending"
                  onClick={() => cancelRequestMutation.mutate()}
                  disabled={cancelRequestMutation.isPending}
                  onMouseEnter={() => setPendingHover(true)}
                  onMouseLeave={() => setPendingHover(false)}
                  onTouchStart={() => setPendingHover(true)}
                  onTouchEnd={() => setPendingHover(false)}
                  className="font-fantasy text-xs tracking-wider px-5 py-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: pendingHover ? "rgba(220,80,80,0.15)" : "rgba(240,192,64,0.08)",
                    border: `1px solid ${pendingHover ? "rgba(220,80,80,0.45)" : "rgba(240,192,64,0.3)"}`,
                    color: pendingHover ? "#f08080" : "#f0c040",
                    cursor: cancelRequestMutation.isPending ? "default" : "pointer",
                  }}
                >
                  {cancelRequestMutation.isPending ? "..." : pendingHover ? "✕ Unsend" : "⏳ Pending"}
                </button>
              ) : (
                <button
                  data-testid="button-add-friend"
                  onClick={() => sendRequestMutation.mutate()}
                  disabled={sendRequestMutation.isPending}
                  className="font-fantasy text-sm tracking-wider px-5 py-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(45,154,100,0.65) 0%, rgba(20,100,60,0.65) 100%)",
                    border: "1.5px solid rgba(127,255,212,0.45)",
                    color: ACCENT,
                    cursor: sendRequestMutation.isPending ? "default" : "pointer",
                    boxShadow: "0 0 14px rgba(127,255,212,0.1)",
                  }}
                >
                  {sendRequestMutation.isPending ? "Sending..." : "+ Add Friend"}
                </button>
              )}

              {/* Visit Pet House button */}
              <button
                data-testid="button-visit-pet-house"
                onClick={() => { onClose(); navigate(`/visit/${pet.userId}`); }}
                className="flex flex-col items-center gap-1 transition-transform active:scale-90"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "rgba(4,10,6,0.7)",
                  border: "1.5px solid rgba(212,160,23,0.4)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                }}>
                  <img src={petHouseIconImg} alt="Pet House" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <span className="font-fantasy text-[9px] tracking-widest" style={{ color: "rgba(212,160,23,0.7)" }}>Pet House</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WorldRoamingPet ────────────────────────────────────────────────────────
// Renders a single user's active pet inside the map canvas so it pans with
// the world. posX/posY are percentages of the map canvas dimensions.
function WorldRoamingPet({
  pet,
  posX,
  posY,
  isOwn,
  isMoving,
  facingLeft,
  onTap,
}: {
  pet: WorldActivePet;
  posX: number;
  posY: number;
  isOwn: boolean;
  isMoving: boolean;
  facingLeft: boolean | undefined;
  onTap: () => void;
}) {
  const { data: templateData } = useQuery<{
    parts: Array<{ partType: string; posY: number; height: number; posX: number; width: number; view: string }>;
    facing: string;
    canFly: boolean;
  }>({
    queryKey: ["/api/pet-template-parts", pet.petTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/pet-template-parts/${pet.petTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!pet.petTemplateId,
    staleTime: Infinity,
  });

  const hasWings = !!(templateData?.canFly);

  // Compute the tight bounding box of the pet's actual visible parts so we can
  // position the name badge exactly above the head and stars exactly below the feet.
  const CANVAS_SIZE = 1000;
  const facing = templateData?.facing ?? "front";
  const allParts = templateData?.parts ?? [];
  const frontCount = allParts.filter(p => p.view === "front").length;
  const backCount  = allParts.filter(p => p.view === "back").length;
  const resolvedView = facing === "back" ? "back" : (frontCount === 0 && backCount > 0) ? "back" : "front";
  const visibleParts = allParts.filter(p => p.view === resolvedView);

  // minTopFrac / maxBotFrac are fractions of sz (0–1) for the top and bottom
  // of the pet's actual visual body. Fall back to sensible defaults while loading.
  const rawMinTopFrac = visibleParts.length > 0
    ? Math.min(...visibleParts.map(p => p.posY / CANVAS_SIZE))
    : 0.15;
  const rawMaxBotFrac = visibleParts.length > 0
    ? Math.max(...visibleParts.map(p => (p.posY + p.height) / CANVAS_SIZE))
    : 0.85;

  // PetAnimator scales large-style parts (≥500px) at 0.3× from center center.
  // Apply the same correction here so badge/shadow track the visual body, not the raw coords.
  const isLargeStyle = visibleParts.some(p => p.width >= 500 || p.height >= 500);
  const partScale = isLargeStyle ? 0.3 : 1;
  const minTopFrac = 0.5 + (rawMinTopFrac - 0.5) * partScale;
  const maxBotFrac = 0.5 + (rawMaxBotFrac - 0.5) * partScale;

  // sz is in map-canvas pixels. Kept small so pets read as little
  // characters on the world map and don't dwarf nearby locations.
  const sz     = 60;
  const petImg = pet.hatchedImageUrl || pet.imageUrl;
  const displayName = pet.petNickname || pet.name;

  // Which branch will actually render below decides where the name
  // badge should sit and what counts as the sprite's "natural" facing
  // direction:
  //   - Own pet always renders as a still image (hatchedImageUrl) sized
  //     to the full sz×sz box via objectFit:contain. Its visible top
  //     therefore lives at y≈0, so the parts-derived minTopFrac would
  //     push the badge inside the image. Same for any non-template
  //     fallback still image.
  //   - Parts-based PetAnimator pets are positioned by template part
  //     coords on a 1000×1000 canvas, so minTopFrac is meaningful.
  //
  // The natural-facing source differs too: still images were generated
  // facing pet.facingDirection at hatch, while parts pets are arranged
  // according to templateData.facing.
  //
  // For own-pet still images: when the underlying template is side-facing
  // (templateData.facing === "left" | "right"), trust the template's
  // direction over pet.facingDirection — the still image was generated to
  // match the template parts, so a left-facing-template pet's still image
  // is a left-facing portrait regardless of the per-pet facingDirection
  // field. Falling back to pet.facingDirection only when the template is
  // front/back/missing keeps the legacy behavior for non-side templates.
  const rendersAsStillImage = (isOwn && !!petImg) || (!pet.petTemplateId && !!petImg);
  const templateFacing = templateData?.facing;
  // naturalFacingLeft: true if the sprite's artwork naturally faces left.
  // • Explicit "left"/"right" templates → the template direction is the source
  //   of truth for both still-image renders (generated to match the template)
  //   and parts-based PetAnimator renders.
  // • "front" / "back" / unknown → fall back to pet.facingDirection. This covers
  //   side-profile pets whose parts were saved as "back" view — their stored
  //   facingDirection says which way they actually face, and we honour it
  //   regardless of whether the pet renders as a still image or as live parts.
  //   Previously the PetAnimator path always computed ("back" === "left") = false,
  //   which ignored facingDirection entirely and caused the wrong side to be shown.
  const naturalFacingLeft =
    templateFacing === "left"  ? true  :
    templateFacing === "right" ? false :
    // "back" = side-profile template; default facing LEFT (same rule as the
    // parent useEffect so the two formulas always agree).
    templateFacing === "back"  ? (pet.facingDirection !== "right") :
    // "front" / unknown → front-facing or symmetric; rely on the explicit field.
    (pet.facingDirection === "left");
  const nameTopPx = rendersAsStillImage ? -4 : Math.round(minTopFrac * sz) - 4;

  // Seeded per-pet so each pet drifts and bobs at a unique phase/speed
  const seed = (pet.userId.charCodeAt(0) + pet.userId.charCodeAt(1) * 31) & 0xffff;
  const driftIdx           = seed % 6;
  const driftDuration      = `${90 + (seed % 50)}s`;
  const driftDelay         = `-${(seed % 80).toFixed(0)}s`;
  const floatDuration      = hasWings ? `${5 + (seed % 20) / 10}s` : `${2.8 + (seed % 30) / 30}s`;
  const floatDelay         = `-${((seed % 50) / 50 * 4.0).toFixed(2)}s`;
  const floatAnim          = hasWings ? "petFloatSmall" : "petGroundFloat";

  return (
    <div
      className="absolute"
      style={{
        left: `${posX}%`,
        top:  `${posY}%`,
        transform: "translate(-50%, -100%)",
        // Painter's algorithm: same scale as locations (base 10) + 2 so pets
        // sit just in front of places/decor at the same depth, then naturally
        // drop behind anything whose anchor point is clearly higher on screen.
        // Crossover ≈ 3 % map-height (≈ 20 px) above the location anchor.
        zIndex: 12 + Math.round((posY / 100) * 60),
        pointerEvents: "none",
        userSelect: "none",
        // Smooth glide between SSE position updates for other players' pets;
        // own pet is already smooth via RAF so no transition needed.
        transition: isOwn ? undefined : "left 1.8s linear, top 1.8s linear",
      }}
    >
      {/* Idle drift — wanders slowly around the map; linear so speed stays constant */}
      <div style={{ animation: isOwn ? undefined : `petWorldIdleDrift${driftIdx} ${driftDuration} ${driftDelay} linear infinite` }}>
      {/* Idle float — single up-down wave; own pet uses bounce/pounce instead */}
      <div style={{
        animation: isOwn
          ? isMoving
            ? "kcPetWalkBounce 0.85s ease-in-out infinite"
            : undefined
          : `${floatAnim} ${floatDuration} ease-in-out ${floatDelay} infinite ${hasWings ? "alternate" : ""}`,
      }}>
          {/* Single position:relative box (sz × sz map-pixels).
              Badge and stars are absolutely positioned using the pet's ACTUAL
              bounding box (minTopFrac / maxBotFrac) computed from the real part
              coordinates — no guessing, no invisible-box problem. */}
          <div style={{ position: "relative", width: sz, height: sz, pointerEvents: "none" }}>

            {/* Pet sprite — XOR flip: movement direction vs natural facing direction.
                naturalFacingLeft is computed above and picks the right source
                per render branch:
                  - parts-based uses templateData.facing
                  - still image uses templateData.facing when it is side-facing
                    (left/right), otherwise falls back to pet.facingDirection
                Without that split, a left-facing still image would get flipped
                to face right when the player moved left, because
                templateData.facing defaults to "front" for most templates and
                pet.facingDirection alone misses side-facing-template pets. */}
            <div
              style={{
                transform: ((facingLeft ?? naturalFacingLeft) !== naturalFacingLeft) ? "scaleX(-1)" : undefined,
                transition: "transform 0.1s ease",
              }}
            >
              {isOwn && petImg ? (
                /* Own pet renders as the pet's still image so it always shows up
                   on Keeper's Central even if the part-based animator hasn't
                   loaded. The squish-on-move comes from kcPetWalkBounce on the
                   parent wrapper; no idle bounce here so it sits still when not
                   walking. */
                <img
                  src={petImg}
                  alt={displayName}
                  draggable={false}
                  style={{
                    width: sz, height: sz,
                    objectFit: "contain",
                    pointerEvents: "none",
                    transformOrigin: "center bottom",
                  }}
                />
              ) : pet.petTemplateId ? (
                <PetAnimator
                  petTemplateId={pet.petTemplateId}
                  mode="idle"
                  size={sz}
                  style={{
                    pointerEvents: "none",
                    overflow: "visible",
                  }}
                />
              ) : petImg ? (
                <img
                  src={petImg}
                  alt={displayName}
                  draggable={false}
                  className="pet-idle-squish"
                  style={{
                    width: sz, height: sz,
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />
              ) : null}
            </div>

            {/* Username badge — sits just above the topmost visible part.
                For still-image renders we use the top of the box; for
                parts-based renders we use the parts-derived bounding box. */}
            <span
              className="font-fantasy tracking-wide"
              style={{
                position: "absolute",
                top: nameTopPx,
                left: "50%",
                transform: "translate(-50%, -100%)",
                fontSize: Math.max(11, Math.round(sz * 0.13)),
                padding: `${Math.max(2, Math.round(sz * 0.02))}px ${Math.max(6, Math.round(sz * 0.06))}px`,
                borderRadius: 999,
                background: "rgba(4,10,6,0.82)",
                border: "1px solid rgba(127,255,212,0.30)",
                color: "#7fffd4",
                textShadow: "0 0 8px rgba(127,255,212,0.55)",
                backdropFilter: "blur(4px)",
                whiteSpace: "nowrap",
                zIndex: 2,
              }}
            >
              {pet.username}
            </span>

            {/* Tap zone — tapping a pet opens their profile.
                data-petid is read by the viewport pointer-up handler (setPointerCapture
                intercepts all pointer events on mobile, so onClick alone is unreliable). */}
            <div
              data-petid={pet.userId}
              onClick={onTap}
              style={{
                position: "absolute",
                left: "50%",
                top: Math.round(((minTopFrac + maxBotFrac) / 2) * sz),
                width: Math.round(sz * 0.7),
                height: Math.round((maxBotFrac - minTopFrac) * sz),
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                pointerEvents: "auto",
                cursor: "pointer",
              }}
            />
          </div>
      </div>
      </div>
    </div>
  );
}

// ── Joystick ────────────────────────────────────────────────────────────────
// Virtual analog stick for walking the player's pet around the map.
// Positioned bottom-right so it never overlaps the bottom-right FloatingNav button.
const BASE_R  = 56;
// Smaller than before (was 23) so the centerpiece sits inside the
// base ring's filigree hole instead of bulging past it. Also lets
// the orb image read as "the gem in the centre of an ornate ring"
// rather than a separate pearl glued on top.
const THUMB_R = 17;

function Joystick({ onChange }: { onChange: (dx: number, dy: number, active: boolean) => void }) {
  const baseRef   = useRef<HTMLDivElement>(null);
  const thumbRef  = useRef<HTMLDivElement>(null);
  const pidRef    = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const release = (pointerId: number) => {
    if (pidRef.current !== pointerId) return;
    pidRef.current = null;
    if (thumbRef.current) thumbRef.current.style.transform = "translate(-50%, -50%)";
    onChange(0, 0, false);
  };

  const move = (cx: number, cy: number) => {
    let dx = cx - centerRef.current.x;
    let dy = cy - centerRef.current.y;
    const dist    = Math.hypot(dx, dy);
    const maxDist = BASE_R - THUMB_R;
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    if (thumbRef.current) thumbRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onChange(dx / maxDist, dy / maxDist, true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pidRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pidRef.current = e.pointerId;
    const rect = baseRef.current!.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    move(e.clientX, e.clientY);
  };

  return (
    <div
      ref={baseRef}
      data-testid="joystick-base"
      onPointerDown={onPointerDown}
      onPointerMove={e => { if (e.pointerId === pidRef.current) move(e.clientX, e.clientY); }}
      onPointerUp={e => release(e.pointerId)}
      onPointerCancel={e => release(e.pointerId)}
      style={{
        position: "fixed",
        bottom: 108,
        right: 20,
        width: BASE_R * 2,
        height: BASE_R * 2,
        touchAction: "none",
        zIndex: 60,
      }}
    >
      {/* Base ring — ornate golden filigree PNG with a real transparent
          centre hole. The image bleeds beyond the BASE_R*2 box because of
          its built-in glow halo, so we let it overflow naturally rather
          than clipping. A subtle box-shadow pulse adds a living feel
          underneath the static art. */}
      <img
        src={joystickBaseImg}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: BASE_R * 2.2,
          height: BASE_R * 2.2,
          transform: "translate(-50%, -50%)",
          objectFit: "contain",
          pointerEvents: "none",
          userSelect: "none",
          filter: "drop-shadow(0 0 12px rgba(252,211,77,0.45))",
        }}
      />

      {/* Thumb — ornate emerald gem PNG that fits inside the base ring's
          centre hole. Sized small (THUMB_R * 2 = 34px) so the gold
          filigree on the base remains the dominant ornament; the gem
          reads as the centerpiece, not as the whole control. The image
          carries its own glow + highlight, so we just add a soft drop
          shadow underneath for depth and let the file do the work. */}
      <div
        ref={thumbRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: THUMB_R * 2,
          height: THUMB_R * 2,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      >
        <img
          src={joystickThumbImg}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.55))",
          }}
        />
      </div>
    </div>
  );
}
