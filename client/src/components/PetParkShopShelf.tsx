import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlipHorizontal, RotateCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PARA_PETS_COIN_IMAGE } from "@/lib/coinAssets";
import PARK_SHOP_PRICE_TAG_IMAGE from "@assets/price_tag.png?url";
import { baseGardenToolKind } from "@shared/garden";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import {
  defaultParkShopPlacement, flipParkShopPlacement, rotateParkShopPlacement, withParkShopDefaults,
  parkShopPriceTagPoint, parkShopPriceTagFromPointer,
  PARK_SHOP_MIN_SIZE, PARK_SHOP_MAX_SIZE, PARK_SHOP_ROTATION_STEP,
  type ParkShopPlacement,
} from "@shared/petParkShopPlacements";

export type ParkShopItemPreview = {
  id: string; name: string; type: string; price: number;
  imageUrl: string | null; eggImageUrl: string | null; hatchedImageUrl: string | null;
  description?: string | null; specialType?: string | null; placement?: ParkShopPlacement | null;
};
const filters = [
  { name: "All", type: "all" }, { name: "Pets", type: "pet" },
  { name: "Items", type: "item" }, { name: "Seeds", type: "garden_seed" },
  { name: "Tools", type: "garden_tool" },
];
function itemArt(item: ParkShopItemPreview) {
  return item.type === "pet" ? item.eggImageUrl || item.imageUrl || item.hatchedImageUrl
    : item.imageUrl || item.eggImageUrl || item.hatchedImageUrl;
}

/** Existing wooden tag artwork, sized relative to the merchandise so small
 * items are not hidden behind a fixed-width price badge. The coin indicates
 * shop availability; the actual price is revealed in the purchase dialog. */
function ShopPriceTag({ size }: { size: number }) {
  return <span data-testid="pet-park-shop-price-tag" aria-hidden="true"
    className="pointer-events-none relative inline-block shrink-0"
    style={{ width: size, height: size }}>
    <img src={PARK_SHOP_PRICE_TAG_IMAGE} alt="" data-testid="pet-park-shop-tag-art"
      className="absolute inset-0 h-full w-full object-contain" draggable={false} />
    <img src={PARA_PETS_COIN_IMAGE} alt="" data-testid="pet-park-shop-tag-coin"
      className="absolute object-contain drop-shadow-sm" draggable={false}
      style={{ width: "27%", height: "27%", left: "50%", top: "61%", transform: "translate(-50%, -50%)" }} />
  </span>;
}

/** Merchandise is positioned directly over the *existing* room artwork,
 * not in a separate shelf or room coordinate system. Only admins drag and
 * resize artwork. Player taps open a compact purchase dialog. */
export default function PetParkShopShelf({
  buildingId, itemIds, placements, canEditPark, imageWidth, imageHeight,
  showPicker, onShowPickerChange,
}: {
  buildingId: string; itemIds: readonly string[]; placements: readonly ParkShopPlacement[];
  canEditPark: boolean; imageWidth: number; imageHeight: number;
  showPicker: boolean; onShowPickerChange: (value: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ids, setIds] = useState<string[]>(() => [...itemIds]);
  const [layout, setLayout] = useState<ParkShopPlacement[]>(() => withParkShopDefaults(itemIds, placements));
  const [selectedEdit, setSelectedEdit] = useState<string | null>(null);
  const [isDraggingMerchandise, setIsDraggingMerchandise] = useState(false);
  const [selectedBuy, setSelectedBuy] = useState<ParkShopItemPreview | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [purchaseConfirmation, setPurchaseConfirmation] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [buyError, setBuyError] = useState<string | null>(null);
  const purchasing = useRef(false);
  const pricePreviewRef = useRef<HTMLDivElement>(null);
  const priceTagDrag = useRef<null | { pointerId: number; itemId: string; x: number; y: number;
    start: ParkShopPlacement; moved: boolean }>(null);
  const drag = useRef<null | { pointerId: number; itemId: string; x: number; y: number;
    start: ParkShopPlacement; moved: boolean }>(null);
  useEffect(() => {
    setIds([...itemIds]);
    setLayout(withParkShopDefaults(itemIds, placements));
  }, [itemIds, placements]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search), 240);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { data: selected = [], isLoading: loading } = useQuery<ParkShopItemPreview[]>({
    queryKey: ["/api/pet-park/buildings", buildingId, "shop-items"],
    queryFn: async () => {
      const result = await apiRequest("GET", "/api/pet-park/buildings/" + encodeURIComponent(buildingId) + "/shop-items");
      return result.json();
    },
    staleTime: 30_000,
  });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ParkShopItemPreview[]>({
    queryKey: ["/api/admin/pet-park/shop-catalog", searchTerm, filter],
    enabled: canEditPark && showPicker,
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchTerm, type: filter });
      const result = await apiRequest("GET", "/api/admin/pet-park/shop-catalog?" + params);
      return result.json();
    },
    staleTime: 30_000,
  });
  const { data: ownedInventory = [], isLoading: inventoryLoading } = useQuery<Array<{ type?: string | null; specialType?: string | null; quantity?: number | null }>>({
    queryKey: ["/api/inventory"], enabled: !canEditPark && !!selectedBuy,
  });
  const selectedBaseKind = selectedBuy ? baseGardenToolKind(selectedBuy) : null;
  const selectedToolOwned = !!selectedBaseKind && ownedInventory.some(row =>
    (row.quantity ?? 1) > 0 && baseGardenToolKind(row) === selectedBaseKind);
  // Match the existing server purchase policy: pets and one-per-kind garden
  // tools remain single purchases; other shop merchandise may be bought 1–20.
  const maxPurchaseQuantity = selectedBuy?.type === "pet" || selectedBaseKind ? 1 : 20;
  const totalPurchasePrice = (selectedBuy?.price ?? 0) * purchaseQuantity;
  const { data: viewer } = useQuery<{ coins?: number }>({
    queryKey: ["/api/auth/me"], enabled: !canEditPark,
  });
  const insufficientCoins = viewer?.coins !== undefined && viewer.coins < totalPurchasePrice;
  useEffect(() => {
    if (!purchaseConfirmation) return;
    const timeout = window.setTimeout(() => setPurchaseConfirmation(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [purchaseConfirmation]);
  const save = useMutation({
    mutationFn: async (next: { ids: string[]; layout: ParkShopPlacement[] }) => {
      const response = await apiRequest("PATCH",
        "/api/admin/pet-park/buildings/" + encodeURIComponent(buildingId),
        { shopItemIds: next.ids, shopItemPlacements: next.layout });
      return response.json();
    },
    onSuccess: (updated, next) => {
      const confirmedIds = Array.isArray(updated.shopItemIds) ? updated.shopItemIds : next.ids;
      const confirmedLayout = Array.isArray(updated.shopItemPlacements) ? updated.shopItemPlacements : next.layout;
      setIds(confirmedIds);
      setLayout(confirmedLayout);
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-park/buildings", buildingId, "shop-items"] });
    },
    onError: (error: Error) => {
      setIds([...itemIds]);
      setLayout(withParkShopDefaults(itemIds, placements));
      toast({ title: "Could not update shop merchandise", description: error.message, variant: "destructive" });
    },
  });
  const buy = useMutation({
    mutationFn: async ({ item, quantity }: { item: ParkShopItemPreview; quantity: number }) => {
      const response = await apiRequest("POST",
        "/api/shop/pet-park/buy/" + encodeURIComponent(item.id),
        { buildingId, quantity });
      return response.json();
    },
    onSuccess: (result, { item, quantity }) => {
      if (result.user) qc.setQueryData(["/api/auth/me"], result.user);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-park/garden"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      // Do not cover the shop with the global, centered success toast.
      // A small scene-local acknowledgement is enough for routine purchases.
      setPurchaseConfirmation(quantity === 1
        ? item.name + " added to your Bag"
        : quantity + " × " + item.name + " added to your Bag");
      setSelectedBuy(null);
      setPurchaseQuantity(1);
      setBuyError(null);
    },
    onError: (error: Error) => setBuyError(error.message),
    onSettled: () => { purchasing.current = false; },
  });
  useEffect(() => {
    if (!showPicker && !selectedBuy) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showPicker && !save.isPending) onShowPickerChange(false);
      if (selectedBuy && !purchasing.current && !buy.isPending) setSelectedBuy(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [showPicker, selectedBuy, onShowPickerChange, buy.isPending, save.isPending]);
  const changeStock = (nextIds: string[], nextLayout: ParkShopPlacement[]) => {
    if (save.isPending) return;
    setIds(nextIds);
    setLayout(nextLayout);
    save.mutate({ ids: nextIds, layout: nextLayout });
  };
  const onAdd = (id: string) => {
    if (ids.includes(id) || ids.length >= 80 || save.isPending) return;
    const next = [...ids, id];
    changeStock(next, [...layout, defaultParkShopPlacement(id, ids.length)]);
  };
  const onRemove = (id: string) => {
    changeStock(ids.filter(value => value !== id), layout.filter(value => value.itemId !== id));
    setSelectedEdit(null);
  };
  const resize = (itemId: string, delta: number) => {
    const next = layout.map(p => p.itemId === itemId
      ? { ...p, size: Math.max(PARK_SHOP_MIN_SIZE, Math.min(PARK_SHOP_MAX_SIZE, p.size + delta)) } : p);
    changeStock(ids, next);
  };
  const rotate = (itemId: string) => {
    const next = layout.map(placement => placement.itemId === itemId
      ? rotateParkShopPlacement(placement) : placement);
    changeStock(ids, next);
  };
  const flip = (itemId: string) => {
    const next = layout.map(placement => placement.itemId === itemId
      ? flipParkShopPlacement(placement) : placement);
    changeStock(ids, next);
  };
  const priceTagPointAt = (clientX: number, clientY: number) => {
    const rect = pricePreviewRef.current?.getBoundingClientRect();
    return rect ? parkShopPriceTagFromPointer(clientX, clientY, rect) : null;
  };
  const onPriceTagDown = (event: ReactPointerEvent<HTMLButtonElement>, placement: ParkShopPlacement) => {
    if (save.isPending || !event.isPrimary) return;
    event.stopPropagation();
    priceTagDrag.current = { pointerId: event.pointerId, itemId: placement.itemId,
      x: event.clientX, y: event.clientY, start: placement, moved: false };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const onPriceTagMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = priceTagDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 3 && !current.moved) return;
    const point = priceTagPointAt(event.clientX, event.clientY);
    if (!point) return;
    current.moved = true;
    setLayout(previous => previous.map(placement =>
      placement.itemId === current.itemId ? { ...placement, ...point } : placement));
  };
  const onPriceTagUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = priceTagDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    priceTagDrag.current = null;
    if (!current.moved || save.isPending) return;
    const point = priceTagPointAt(event.clientX, event.clientY);
    if (!point) return;
    // Commit once through the same authenticated building placement PATCH as
    // moving, resizing and rotating merchandise. Existing placement fields stay.
    changeStock(ids, layout.map(placement =>
      placement.itemId === current.itemId ? { ...placement, ...point } : placement));
  };
  const onPriceTagCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = priceTagDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    priceTagDrag.current = null;
    setLayout(previous => previous.map(placement =>
      placement.itemId === current.itemId ? current.start : placement));
  };
  const onDown = (event: ReactPointerEvent<HTMLButtonElement>, placement: ParkShopPlacement) => {
    if (!canEditPark || save.isPending || !event.isPrimary) return;
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, itemId: placement.itemId,
      x: event.clientX, y: event.clientY, start: placement, moved: false };
    setSelectedEdit(placement.itemId);
    setIsDraggingMerchandise(false);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const onMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5 && !current.moved) return;
    if (!current.moved) {
      current.moved = true;
      // Clear the large price-position panel while moving shop artwork.
      setIsDraggingMerchandise(true);
    }
    const x = Math.max(.03, Math.min(.97, current.start.xPct + (event.clientX - current.x) / imageWidth));
    const y = Math.max(.03, Math.min(.97, current.start.yPct + (event.clientY - current.y) / imageHeight));
    setLayout(previous => previous.map(item => item.itemId === current.itemId ? { ...item, xPct: x, yPct: y } : item));
  };
  const onUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    setIsDraggingMerchandise(false);
    if (!current.moved || save.isPending) return;
    const x = Math.max(.03, Math.min(.97, current.start.xPct + (event.clientX - current.x) / imageWidth));
    const y = Math.max(.03, Math.min(.97, current.start.yPct + (event.clientY - current.y) / imageHeight));
    changeStock(ids, layout.map(item => item.itemId === current.itemId ? { ...item, xPct: x, yPct: y } : item));
  };
  const onCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const current = drag.current;
    drag.current = null;
    setIsDraggingMerchandise(false);
    setLayout(previous => previous.map(item => item.itemId === current.itemId ? current.start : item));
  };
  const byId = new Map(selected.map(item => [item.id, item]));
  const editItem = selected.find(item => item.id === selectedEdit);
  const editPlacement = layout.find(item => item.itemId === selectedEdit);
  return <>
    <div data-testid="pet-park-shop-merchandise" className="pointer-events-none absolute inset-0" style={{ zIndex: 16 }}>
      {layout.map(placement => {
        const item = byId.get(placement.itemId);
        if (!item) return null;
        const dimension = imageHeight * placement.size / 100;
        const tagSize = Math.max(27, Math.min(54, dimension * .42));
        return <button key={item.id} type="button" data-testid={`pet-park-shop-item-${item.id}`}
          aria-label={canEditPark ? "Place " + item.name : "Buy " + item.name}
          aria-pressed={canEditPark ? selectedEdit === item.id : undefined}
          disabled={save.isPending || buy.isPending}
          onPointerDown={event => onDown(event, placement)}
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
          onLostPointerCapture={onCancel}
          onClick={event => {
            event.stopPropagation();
            if (canEditPark) setSelectedEdit(item.id);
            else { setSelectedBuy(item); setPurchaseQuantity(1); setPurchaseConfirmation(null); setBuyError(null); }
          }}
          className={`pointer-events-auto absolute flex touch-none flex-col items-center justify-center rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 ${canEditPark && selectedEdit === item.id ? "outline outline-2 outline-[#f1d081]" : ""}`}
          style={{ left: placement.xPct * imageWidth, top: placement.yPct * imageHeight,
            width: dimension, height: dimension, transform: "translate(-50%,-50%)",
            filter: "drop-shadow(0 3px 4px rgba(0,0,0,.42))" }}>
          {itemArt(item) ? <img src={itemArt(item) ?? ""} alt="" draggable={false} loading="lazy"
            data-testid="pet-park-shop-artwork"
            className="pointer-events-none h-full w-full select-none object-contain"
            style={{ transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flippedX ? -1 : 1})`, transformOrigin: "center center" }} />
            : <span aria-hidden="true" className="text-xl text-[#f3d58d]"
                style={{ transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flippedX ? -1 : 1})` }}>✦</span>}
          <span data-testid="pet-park-shop-price-on-art"
            className="pointer-events-none absolute z-[1]"
            style={{ left: `${parkShopPriceTagPoint(placement).xPct * 100}%`,
              top: `${parkShopPriceTagPoint(placement).yPct * 100}%`,
              transform: "translate(-50%, -50%)" }}>
            <ShopPriceTag size={tagSize} />
          </span>
          {/* No floating item names or numeric prices. The coin-only wooden tag
              marks a purchasable item; names and prices appear at checkout. */}
        </button>;
      })}
      {loading && <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-[#10291d]/90 p-2 text-xs text-amber-100">Loading merchandise…</span>}
    </div>
    {canEditPark && editItem && !showPicker && <ViewportModalPortal blocking={false}>
      <div className="pointer-events-none absolute inset-x-2 z-[60] flex justify-center"
        style={{ bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
        <div aria-label="Edit shop item artwork" className="pointer-events-auto flex w-full max-w-[380px] flex-wrap items-center justify-center gap-2 rounded-xl border border-[#d8b972]/85 bg-[#102d20]/95 p-2 text-[#f2d49b] shadow-xl">
          <span className="max-w-[84px] truncate text-[11px] font-semibold">{editItem.name}</span>
          <button type="button" aria-label="Smaller merchandise" disabled={save.isPending}
            onClick={() => resize(editItem.id, -2)} className="min-h-9 min-w-9 rounded-lg border border-[#d7b973]/55 bg-[#1b4630]">−</button>
          <span className="text-[11px]">{layout.find(item => item.itemId === editItem.id)?.size}%</span>
          <button type="button" aria-label="Larger merchandise" disabled={save.isPending}
            onClick={() => resize(editItem.id, 2)} className="min-h-9 min-w-9 rounded-lg border border-[#d7b973]/55 bg-[#1b4630]">+</button>
          <button type="button" data-testid="pet-park-shop-rotate"
            aria-label="Rotate merchandise clockwise 15 degrees"
            title="Rotate selected item clockwise 15°"
            disabled={save.isPending}
            onClick={() => rotate(editItem.id)}
            className="flex min-h-9 items-center gap-1 rounded-lg border border-[#d7b973]/55 bg-[#1b4630] px-2 text-[11px]">
            <RotateCw size={15} aria-hidden="true" />
            <span>{PARK_SHOP_ROTATION_STEP}°</span>
          </button>
          <button type="button" data-testid="pet-park-shop-flip"
            aria-label="Flip merchandise horizontally"
            title="Mirror selected item left to right"
            aria-pressed={!!editPlacement?.flippedX}
            disabled={save.isPending}
            onClick={() => flip(editItem.id)}
            className="flex min-h-9 items-center gap-1 rounded-lg border border-[#d7b973]/55 bg-[#1b4630] px-2 text-[11px]">
            <FlipHorizontal size={15} aria-hidden="true" />
            <span>Flip</span>
          </button>
          <span data-testid="pet-park-shop-rotation" className="min-w-[30px] text-center text-[10px] text-[#f1d58f]">
            {layout.find(item => item.itemId === editItem.id)?.rotation ?? 0}°
          </span>
          <button type="button" aria-label="Remove merchandise" disabled={save.isPending}
            onClick={() => onRemove(editItem.id)} className="min-h-9 rounded-lg border border-[#b87f70]/55 bg-[#50312b] px-2 text-[10px]">Remove</button>
          <button type="button" aria-label="Done editing item" onClick={() => setSelectedEdit(null)}
            className="min-h-9 rounded-lg border border-[#d7b973]/55 bg-[#214c34] px-2 text-[10px]">Done</button>
        </div>
      </div>
      {editPlacement && !isDraggingMerchandise && <div data-testid="pet-park-shop-price-preview"
        className="pointer-events-auto absolute right-2 z-[60] flex w-[174px] flex-col items-center gap-1.5 rounded-xl border border-[#d8b972]/85 bg-[#102d20]/95 p-2 text-[#f2d49b] shadow-xl"
        style={{ bottom: "max(132px, calc(env(safe-area-inset-bottom, 0px) + 122px))" }}
        onPointerDown={event => event.stopPropagation()}>
        <strong className="text-[11px]">Position price tag</strong>
        <div ref={pricePreviewRef} data-testid="pet-park-shop-price-preview-art"
          className="relative h-[148px] w-[148px] touch-none rounded-lg border border-[#927e50]/45 bg-[#26452f]/75">
          {itemArt(editItem) ? <img src={itemArt(editItem) ?? ""} alt=""
            draggable={false} className="pointer-events-none h-full w-full select-none object-contain"
            style={{ transform: `rotate(${editPlacement.rotation ?? 0}deg) scaleX(${editPlacement.flippedX ? -1 : 1})`, transformOrigin: "center center" }} />
            : <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl">✦</span>}
          <button type="button" data-testid="pet-park-shop-price-drag-handle"
            aria-label={`Move price tag for ${editItem.name}`}
            disabled={save.isPending}
            onPointerDown={event => onPriceTagDown(event, editPlacement)}
            onPointerMove={onPriceTagMove} onPointerUp={onPriceTagUp}
            onPointerCancel={onPriceTagCancel} onLostPointerCapture={onPriceTagCancel}
            className="absolute z-[2] cursor-grab touch-none rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 active:cursor-grabbing"
            style={{ left: `${parkShopPriceTagPoint(editPlacement).xPct * 100}%`,
              top: `${parkShopPriceTagPoint(editPlacement).yPct * 100}%`,
              transform: "translate(-50%, -50%)" }}>
            <ShopPriceTag size={52} />
          </button>
        </div>
        <span className="text-center text-[10px] text-[#ead1a0]/80">Drag the tag onto the image</span>
      </div>}
    </ViewportModalPortal>}
    {showPicker && canEditPark && <ViewportModalPortal>
      <div data-testid="pet-park-shop-picker" className="pointer-events-auto absolute inset-0 z-[75] flex items-end justify-center">
        <button aria-label="Close shop item picker" className="absolute inset-0 bg-black/45"
          onClick={() => onShowPickerChange(false)} />
        <section role="dialog" aria-modal="true" aria-label="Add items to park shop"
          className="relative mx-2 mb-[max(12px,env(safe-area-inset-bottom,0px))] w-full max-w-[380px] rounded-2xl border-2 border-[#c9a967] bg-[#102b20] p-3 text-[#f4d69c] shadow-xl"
          onPointerDown={event => event.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm">Stock this shop</strong>
            <span className="text-[10px] text-amber-100/65">{ids.length}/80 items · Tap outside to close</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#bda66c]/50 bg-[#091d16] px-2">
            <Search size={14}/><input type="search" value={search} onChange={event => setSearch(event.target.value)}
              aria-label="Search shop items" placeholder="Search items by name"
              className="min-h-10 w-full bg-transparent text-xs outline-none" />
          </div>
          <div className="my-2 flex flex-wrap gap-1" aria-label="Filter shop items">
            {filters.map(value => <button key={value.type} type="button" aria-pressed={filter === value.type}
              onClick={() => setFilter(value.type)}
              className={`rounded-full border px-2 py-1 text-[10px] ${filter === value.type ? "border-[#f4d794] bg-[#41684c]" : "border-[#85724e] bg-[#183d2a]"}`}>{value.name}</button>)}
          </div>
          <div role="listbox" aria-label="Choose a shop item"
            className="grid max-h-[min(32dvh,240px)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
            {catalogLoading && <p className="col-span-2 p-2 text-xs">Searching items…</p>}
            {catalog.map(item => <button type="button" role="option" key={item.id}
              aria-selected={ids.includes(item.id)}
              disabled={ids.includes(item.id) || save.isPending || ids.length >= 80}
              onClick={() => onAdd(item.id)}
              className="flex min-h-12 items-center gap-1.5 rounded-lg border border-[#b79a65]/50 bg-[#244733] p-1.5 text-left disabled:opacity-40">
              {itemArt(item) ? <img src={itemArt(item) ?? ""} alt="" loading="lazy" decoding="async"
                className="h-10 w-10 shrink-0 object-contain" /> : <span className="w-10 text-center">✦</span>}
              <span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{item.name}</span>
                <span className="block text-[9px] text-amber-100/60">{ids.includes(item.id) ? "Placed" : item.type}</span></span>
            </button>)}
            {!catalogLoading && !catalog.length && <p className="col-span-2 p-2 text-xs">No matching items.</p>}
          </div>
        </section>
      </div>
    </ViewportModalPortal>}
    {purchaseConfirmation && !canEditPark && <ViewportModalPortal blocking={false}>
      <div data-testid="pet-park-shop-purchase-confirmation" role="status" aria-live="polite"
        className="pointer-events-none absolute inset-x-4 z-[65] flex justify-center"
        style={{ bottom: "max(80px, calc(env(safe-area-inset-bottom, 0px) + 64px))" }}>
        <span className="max-w-[340px] rounded-full border border-[#d7b973]/85 bg-[#173c2b]/95 px-4 py-2 text-center text-xs font-semibold text-[#f6dfa7] shadow-[0_4px_15px_rgba(0,0,0,.45)]">
          {purchaseConfirmation}
        </span>
      </div>
    </ViewportModalPortal>}
    {selectedBuy && !canEditPark && <ViewportModalPortal>
      <div data-testid="pet-park-shop-purchase-dialog" className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center px-4">
        <button className="absolute inset-0 bg-black/60" aria-label="Close purchase details"
          onClick={() => { if (!purchasing.current && !buy.isPending) { setSelectedBuy(null); setBuyError(null); } }} />
        <section role="dialog" aria-modal="true" aria-label={"Buy " + selectedBuy.name}
          className="relative max-h-[min(88dvh,660px)] w-full max-w-[286px] overflow-y-auto overscroll-contain rounded-2xl border-2 border-[#d7b973] bg-gradient-to-b from-[#25563c] to-[#10261c] p-4 text-center text-[#f6dfa7] shadow-[0_12px_36px_rgba(0,0,0,.65)]"
          onPointerDown={event => event.stopPropagation()}>
          <p className="text-[10px] uppercase tracking-widest text-[#dfc285]">Pet Park Shop</p>
          {itemArt(selectedBuy) && <img src={itemArt(selectedBuy) ?? ""} alt=""
            className="mx-auto mt-2 h-[86px] w-[86px] object-contain drop-shadow-lg" />}
          <h2 className="mt-1 text-base font-semibold">{selectedBuy.name}</h2>
          {selectedBuy.description && <p className="mt-1 max-h-20 overflow-y-auto text-[11px] text-amber-100/75">{selectedBuy.description}</p>}
          {maxPurchaseQuantity > 1 ? <div data-testid="pet-park-shop-quantity"
            className="mt-3 flex items-center justify-center gap-3" aria-label="Purchase quantity">
            <button type="button" data-testid="pet-park-shop-quantity-minus"
              aria-label="Decrease quantity" disabled={buy.isPending || purchaseQuantity <= 1}
              onClick={() => { setPurchaseQuantity(q => Math.max(1, q - 1)); setBuyError(null); }}
              className="flex min-h-10 min-w-11 items-center justify-center rounded-lg border border-[#d7b973]/75 bg-[#214c34] text-xl font-semibold disabled:opacity-35">−</button>
            <output data-testid="pet-park-shop-quantity-value" aria-live="off"
              className="min-w-10 text-center text-lg font-semibold tabular-nums">{purchaseQuantity}</output>
            <button type="button" data-testid="pet-park-shop-quantity-plus"
              aria-label="Increase quantity" disabled={buy.isPending || purchaseQuantity >= maxPurchaseQuantity}
              onClick={() => { setPurchaseQuantity(q => Math.min(maxPurchaseQuantity, q + 1)); setBuyError(null); }}
              className="flex min-h-10 min-w-11 items-center justify-center rounded-lg border border-[#d7b973]/75 bg-[#214c34] text-xl font-semibold disabled:opacity-35">+</button>
          </div> : <p className="mt-2 text-[10px] text-amber-100/65">
            {selectedBaseKind ? "One per player" : "Pets are purchased individually"}
          </p>}
          <p className="mt-2 text-[10px] text-amber-100/65">
            {selectedBuy.price.toLocaleString()} coins each
          </p>
          <div className="my-3 flex items-center justify-center gap-2 rounded-xl border border-[#bca06a]/45 bg-[#0d261b]/80 py-2">
            <img src={PARA_PETS_COIN_IMAGE} alt="" className="h-6 w-6 object-contain" />
            <strong data-testid="pet-park-shop-total-price" className="text-base tabular-nums">{totalPurchasePrice.toLocaleString()}</strong>
            <span className="text-[10px] text-amber-100/60">coins total</span>
          </div>
          {viewer?.coins !== undefined && <p className="text-[10px] text-amber-100/65">
            Your balance: {viewer.coins.toLocaleString()} coins</p>}
          {selectedToolOwned && <p data-testid="pet-park-garden-tool-owned" className="mt-2 text-xs font-semibold text-[#8fe2a0]">Already owned · One per player</p>}
          {buyError && <p role="alert" className="mt-2 rounded bg-[#593124] p-2 text-[11px] text-red-100">{buyError}</p>}
          <button type="button" data-testid="pet-park-confirm-purchase"
            disabled={buy.isPending || selectedToolOwned || (!!selectedBaseKind && inventoryLoading) || insufficientCoins}
            onClick={() => {
              // A ref guard closes the double-tap window before the pending
              // state triggers a rerender; duplicate taps must not place
              // two paid orders.
              if (purchasing.current || buy.isPending || selectedToolOwned || (!!selectedBaseKind && inventoryLoading) || insufficientCoins) return;
              purchasing.current = true;
              buy.mutate({ item: selectedBuy, quantity: purchaseQuantity });
            }}
            className="mt-3 min-h-11 w-full rounded-xl border border-[#e7c77e] bg-[#426746] px-3 text-sm font-semibold disabled:opacity-45">
            {buy.isPending ? "Purchasing…" : selectedToolOwned ? "Owned" : selectedBaseKind && inventoryLoading ? "Checking tools…" : insufficientCoins ? "Not enough coins" : `Purchase · ${purchaseQuantity} ${purchaseQuantity === 1 ? "item" : "items"}`}
          </button>
          <p className="mt-2 text-[10px] text-amber-100/60">Tap outside to close</p>
        </section>
      </div>
    </ViewportModalPortal>}
  </>;
}
