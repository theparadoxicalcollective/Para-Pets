import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlipHorizontal, RotateCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeSetPointerCapture } from "@/lib/homeCrossDevice";
import { PARA_PETS_COIN_IMAGE } from "@/lib/coinAssets";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import {
  defaultParkShopPlacement, withParkShopDefaults, parkShopPriceTagPoint,
  parkShopPriceTagFromPointer, parkShopPriceTagSize,
  rotateParkShopPlacement, flipParkShopPlacement,
  PARK_SHOP_MIN_SIZE, PARK_SHOP_MAX_SIZE, PARK_SHOP_MAX_ITEMS, PARK_SHOP_ROTATION_STEP,
  type ParkShopPlacement,
} from "@shared/petParkShopPlacements";
import type { WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import PRICE_TAG_ART from "@assets/price_tag.png?url";

type Merchandise = {
  id: string; name: string; type: string; price: number;
  imageUrl: string | null; eggImageUrl: string | null; hatchedImageUrl: string | null;
};
type ItemDrag = {
  pointerId: number; itemId: string; x: number; y: number;
  start: ParkShopPlacement; moved: boolean;
};
const FILTERS = [
  { name: "All", type: "all" }, { name: "Pets", type: "pet" },
  { name: "Items", type: "item" }, { name: "Seeds", type: "garden_seed" },
  { name: "Tools", type: "garden_tool" },
];
function itemArt(item: Merchandise) {
  return item.type === "pet"
    ? item.eggImageUrl || item.imageUrl || item.hatchedImageUrl
    : item.imageUrl || item.eggImageUrl || item.hatchedImageUrl;
}
function tagAnchor(placement: ParkShopPlacement) {
  const point = parkShopPriceTagPoint(placement);
  return { left: (point.xPct * 100) + "%", top: (point.yPct * 100) + "%",
    transform: "translate(-50%, -50%)" };
}
/** Match the Pet Park wooden coin-only price marker, including proportional
 * scaling and the offset of the coin on the supplied wooden tag artwork. */
function ShopPriceTag({ itemBoxSize }: { itemBoxSize: number }) {
  return <span data-testid="world-shop-price-tag" aria-hidden="true"
    className="pointer-events-none relative inline-block shrink-0"
    style={{ width: parkShopPriceTagSize(itemBoxSize), height: parkShopPriceTagSize(itemBoxSize) }}>
    <img src={PRICE_TAG_ART} alt="" data-testid="world-shop-tag-art" draggable={false}
      className="absolute inset-0 h-full w-full object-contain" />
    <img src={PARA_PETS_COIN_IMAGE} alt="" data-testid="world-shop-tag-coin" draggable={false}
      className="absolute object-contain drop-shadow-sm"
      style={{ width: "27%", height: "27%", left: "50%", top: "61%", transform: "translate(-50%, -50%)" }} />
  </span>;
}

/** Pet Park-equivalent authoring for private World shop rooms.
 * Uses the existing World placement PATCH only: no player buy endpoints,
 * pricing mutations, new coordinate stages, or catalog duplication.
 */
export default function WorldShopShelf({
  worldId, building, roomWidth, roomHeight, onChanged, onSelectionChange,
}: {
  worldId: string; building: WorldScenePlacement; roomWidth: number; roomHeight: number;
  onChanged: () => void; onSelectionChange?: (editing: boolean) => void;
}) {
  const { toast } = useToast();
  const [ids, setIds] = useState<string[]>(() => [...building.shopItemIds]);
  const [layout, setLayout] = useState<ParkShopPlacement[]>(() =>
    withParkShopDefaults(building.shopItemIds, building.shopItemPlacements));
  const layoutRef = useRef(layout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [draggingItem, setDraggingItem] = useState(false);
  const itemDrag = useRef<ItemDrag | null>(null);
  const tagDrag = useRef<ItemDrag | null>(null);
  const pricePreviewRef = useRef<HTMLDivElement>(null);
  const selected = layout.find(p => p.itemId === selectedId);

  useEffect(() => {
    if (savingRef.current || itemDrag.current || tagDrag.current) return;
    const next = withParkShopDefaults(building.shopItemIds, building.shopItemPlacements);
    setIds([...building.shopItemIds]);
    layoutRef.current = next;
    setLayout(next);
  }, [building.id, building.shopItemIds, building.shopItemPlacements]);
  useEffect(() => { onSelectionChange?.(selectedId !== null); }, [selectedId, onSelectionChange]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search), 240);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!showPicker) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) setShowPicker(false);
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [showPicker]);

  const stock = useQuery<Merchandise[]>({
    queryKey: ["/api/admin/world-editor", worldId, building.id, "shop-stock", building.shopItemIds],
    enabled: building.isShop && building.shopItemIds.length > 0,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/world-editor/" + worldId +
        "/buildings/" + building.id + "/shop-stock");
      return response.json();
    },
  });
  const catalog = useQuery<Merchandise[]>({
    queryKey: ["/api/admin/world-editor", worldId, "shop-catalog", searchTerm, filter],
    enabled: building.isShop && showPicker,
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchTerm, type: filter });
      const response = await apiRequest("GET",
        "/api/admin/world-editor/" + worldId + "/shop-catalog?" + params.toString());
      return response.json();
    },
    staleTime: 30_000,
  });
  const byId = new Map((stock.data ?? []).map(item => [item.id, item]));
  const selectedItem = selectedId ? byId.get(selectedId) : undefined;

  // Save stock IDs and their positions together, as in Pet Park. World backend
  // already validates both; previous placements survive all existing edits.
  const save = async (nextIds: string[], next: ParkShopPlacement[],
    previousIds: string[], previous: ParkShopPlacement[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setIds(nextIds);
    setLayout(next);
    layoutRef.current = next;
    try {
      const response = await apiRequest("PATCH",
        "/api/admin/world-editor/" + worldId + "/placements/" + building.id,
        { shopItemIds: nextIds, shopItemPlacements: next });
      const updated = await response.json();
      const confirmedIds = Array.isArray(updated.shopItemIds) ? updated.shopItemIds as string[] : nextIds;
      const confirmedLayout = Array.isArray(updated.shopItemPlacements)
        ? updated.shopItemPlacements as ParkShopPlacement[] : next;
      setIds(confirmedIds);
      setLayout(confirmedLayout);
      layoutRef.current = confirmedLayout;
      onChanged();
    } catch (error) {
      setIds(previousIds);
      setLayout(previous);
      layoutRef.current = previous;
      toast({ title: "Shop layout not saved", description: String(error), variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const updateSelected = (change: (p: ParkShopPlacement) => ParkShopPlacement) => {
    if (!selectedId || savingRef.current) return;
    const previous = layoutRef.current;
    const next = previous.map(p => p.itemId === selectedId ? change(p) : p);
    void save(ids, next, ids, previous);
  };
  const addItem = (itemId: string) => {
    if (ids.includes(itemId) || ids.length >= PARK_SHOP_MAX_ITEMS || savingRef.current) return;
    const nextIds = [...ids, itemId];
    const next = [...layoutRef.current, defaultParkShopPlacement(itemId, ids.length)];
    void save(nextIds, next, ids, layoutRef.current);
  };
  const removeItem = () => {
    if (!selectedId || savingRef.current) return;
    const nextIds = ids.filter(id => id !== selectedId);
    const next = layoutRef.current.filter(p => p.itemId !== selectedId);
    setSelectedId(null);
    void save(nextIds, next, ids, layoutRef.current);
  };

  const onItemDown = (event: ReactPointerEvent<HTMLButtonElement>, placement: ParkShopPlacement) => {
    if (savingRef.current || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    itemDrag.current = { pointerId: event.pointerId, itemId: placement.itemId,
      x: event.clientX, y: event.clientY, start: placement, moved: false };
    setSelectedId(placement.itemId);
    setDraggingItem(false);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const onItemMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = itemDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 5) return;
    if (!d.moved) { d.moved = true; setDraggingItem(true); }
    const xPct = Math.max(.03, Math.min(.97,
      d.start.xPct + (event.clientX - d.x) / Math.max(1, roomWidth)));
    const yPct = Math.max(.03, Math.min(.97,
      d.start.yPct + (event.clientY - d.y) / Math.max(1, roomHeight)));
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? { ...p, xPct, yPct } : p);
    layoutRef.current = next;
    setLayout(next);
  };
  const onItemUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = itemDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    itemDrag.current = null;
    setDraggingItem(false);
    if (!d.moved || savingRef.current) return;
    const xPct = Math.max(.03, Math.min(.97,
      d.start.xPct + (event.clientX - d.x) / Math.max(1, roomWidth)));
    const yPct = Math.max(.03, Math.min(.97,
      d.start.yPct + (event.clientY - d.y) / Math.max(1, roomHeight)));
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? { ...p, xPct, yPct } : p);
    const previous = next.map(p => p.itemId === d.itemId ? d.start : p);
    void save(ids, next, ids, previous);
  };
  const onItemCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = itemDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    itemDrag.current = null;
    setDraggingItem(false);
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? d.start : p);
    layoutRef.current = next;
    setLayout(next);
  };
  const onTagDown = (event: ReactPointerEvent<HTMLButtonElement>, placement: ParkShopPlacement) => {
    if (savingRef.current || !event.isPrimary) return;
    event.stopPropagation();
    tagDrag.current = { pointerId: event.pointerId, itemId: placement.itemId,
      x: event.clientX, y: event.clientY, start: placement, moved: false };
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  };
  const tagPointAt = (x: number, y: number) => {
    const rect = pricePreviewRef.current?.getBoundingClientRect();
    return rect ? parkShopPriceTagFromPointer(x, y, rect) : null;
  };
  const onTagMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = tagDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = tagPointAt(event.clientX, event.clientY);
    if (!point) return;
    d.moved = true;
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? { ...p, ...point } : p);
    layoutRef.current = next;
    setLayout(next);
  };
  const onTagUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = tagDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    tagDrag.current = null;
    const point = tagPointAt(event.clientX, event.clientY);
    if (!point || savingRef.current || !d.moved) return;
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? { ...p, ...point } : p);
    const previous = next.map(p => p.itemId === d.itemId ? d.start : p);
    void save(ids, next, ids, previous);
  };
  const onTagCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = tagDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    tagDrag.current = null;
    const next = layoutRef.current.map(p => p.itemId === d.itemId ? d.start : p);
    layoutRef.current = next;
    setLayout(next);
  };

  if (!building.isShop) return null;

  return <>
    <button type="button" data-testid="world-shop-add-item" aria-label="Add shop merchandise"
      onClick={event => { event.stopPropagation(); setShowPicker(true); }}
      className="pointer-events-auto absolute left-3 z-50 rounded-full border border-[#e6c77f]/75 bg-[#214d35]/95 px-3 py-2.5 text-xs font-semibold text-[#f5d795] shadow-xl"
      style={{ top: "max(117px, calc(env(safe-area-inset-top, 0px) + 65px))" }}>+ Add Item</button>
    <div data-testid="world-shop-shelf" className="pointer-events-none absolute inset-0 z-[15]">
      {layout.map(p => {
        const item = byId.get(p.itemId);
        if (!item) return null;
        const imageSize = roomHeight * p.size / 100;
        const artwork = itemArt(item);
        return <button key={p.itemId} type="button"
          data-testid={"world-shop-merchandise-" + p.itemId}
          aria-label={"Place " + item.name} aria-pressed={selectedId === p.itemId}
          disabled={saving} onPointerDown={event => onItemDown(event, p)}
          onPointerMove={onItemMove} onPointerUp={onItemUp} onPointerCancel={onItemCancel}
          onLostPointerCapture={onItemCancel}
          onClick={event => { event.stopPropagation(); setSelectedId(p.itemId); }}
          className="pointer-events-auto absolute flex touch-none flex-col items-center justify-center rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
          style={{
            width: imageSize, height: imageSize,
            left: p.xPct * roomWidth, top: p.yPct * roomHeight,
            transform: "translate(-50%, -50%)",
            zIndex: selectedId === p.itemId ? 100 : 20 + Math.round(p.yPct * 50),
            outline: selectedId === p.itemId ? "2px solid #f1d081" : undefined,
            filter: "drop-shadow(0 3px 4px rgba(0,0,0,.42))",
          }}>
          {artwork ? <img src={artwork} alt="" draggable={false} loading="lazy"
            className="pointer-events-none h-full w-full select-none object-contain"
            style={{ transform: "rotate(" + (p.rotation ?? 0) + "deg) scaleX(" +
              (p.flippedX ? -1 : 1) + ")", transformOrigin: "center center" }} />
            : <span aria-hidden="true" className="text-xl text-[#f3d58d]">✦</span>}
          <span data-testid="world-shop-price-on-art"
            className="pointer-events-none absolute z-[1]" style={tagAnchor(p)}>
            <ShopPriceTag itemBoxSize={imageSize} />
          </span>
        </button>;
      })}
      {stock.isLoading && <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-[#10291d]/90 p-2 text-xs text-amber-100">Loading merchandise…</span>}
    </div>
    {selected && selectedItem && !showPicker && <ViewportModalPortal blocking={false}>
      <div className="pointer-events-none absolute inset-x-2 z-[60] flex justify-center"
        style={{ bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
        <div aria-label="Edit shop item artwork" data-testid="world-shop-edit-toolbar"
          onPointerDown={event => event.stopPropagation()}
          className="pointer-events-auto flex w-full max-w-[380px] flex-wrap items-center justify-center gap-2 rounded-xl border border-[#d8b972]/85 bg-[#102d20]/95 p-2 text-[#f2d49b] shadow-xl">
          <span className="max-w-[84px] truncate text-[11px] font-semibold">{selectedItem.name}</span>
          <button type="button" aria-label="Smaller merchandise" disabled={saving}
            onClick={() => updateSelected(p => ({ ...p, size: Math.max(PARK_SHOP_MIN_SIZE, p.size - 2) }))}
            className="min-h-9 min-w-9 rounded-lg border border-[#d7b973]/55 bg-[#1b4630]">−</button>
          <span className="text-[11px]">{selected.size}%</span>
          <button type="button" aria-label="Larger merchandise" disabled={saving}
            onClick={() => updateSelected(p => ({ ...p, size: Math.min(PARK_SHOP_MAX_SIZE, p.size + 2) }))}
            className="min-h-9 min-w-9 rounded-lg border border-[#d7b973]/55 bg-[#1b4630]">+</button>
          <button type="button" data-testid="world-shop-rotate"
            aria-label="Rotate merchandise clockwise 15 degrees" disabled={saving}
            onClick={() => updateSelected(rotateParkShopPlacement)}
            className="flex min-h-9 items-center gap-1 rounded-lg border border-[#d7b973]/55 bg-[#1b4630] px-2 text-[11px]">
            <RotateCw size={15} aria-hidden="true" /> <span>{PARK_SHOP_ROTATION_STEP}°</span>
          </button>
          <button type="button" data-testid="world-shop-flip"
            aria-label="Flip merchandise horizontally" aria-pressed={!!selected.flippedX} disabled={saving}
            onClick={() => updateSelected(flipParkShopPlacement)}
            className="flex min-h-9 items-center gap-1 rounded-lg border border-[#d7b973]/55 bg-[#1b4630] px-2 text-[11px]">
            <FlipHorizontal size={15} aria-hidden="true" /> Flip
          </button>
          <span data-testid="world-shop-rotation" className="min-w-[30px] text-center text-[10px] text-[#f1d58f]">
            {selected.rotation ?? 0}°
          </span>
          <button type="button" aria-label="Remove merchandise" disabled={saving}
            onClick={removeItem} className="min-h-9 rounded-lg border border-[#b87f70]/55 bg-[#50312b] px-2 text-[10px]">Remove</button>
          <button type="button" aria-label="Done editing item" onClick={() => setSelectedId(null)}
            className="min-h-9 rounded-lg border border-[#d7b973]/55 bg-[#214c34] px-2 text-[10px]">Done</button>
        </div>
      </div>
      {!draggingItem && <div data-testid="world-shop-price-preview"
        className="pointer-events-auto absolute right-2 z-[60] flex w-[174px] flex-col items-center gap-1.5 rounded-xl border border-[#d8b972]/85 bg-[#102d20]/95 p-2 text-[#f2d49b] shadow-xl"
        style={{ bottom: "max(132px, calc(env(safe-area-inset-bottom, 0px) + 122px))" }}
        onPointerDown={event => event.stopPropagation()}>
        <strong className="text-[11px]">Position price tag</strong>
        <div ref={pricePreviewRef} data-testid="world-shop-price-preview-art"
          className="relative h-[148px] w-[148px] touch-none rounded-lg ring-1 ring-inset ring-[#927e50]/45 bg-[#26452f]/75">
          {itemArt(selectedItem) ? <img src={itemArt(selectedItem) ?? ""} alt=""
            draggable={false} className="pointer-events-none h-full w-full select-none object-contain"
            style={{ transform: "rotate(" + (selected.rotation ?? 0) + "deg) scaleX(" +
              (selected.flippedX ? -1 : 1) + ")", transformOrigin: "center center" }} />
            : <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl">✦</span>}
          <button type="button" data-testid="world-shop-price-drag-handle"
            aria-label={"Move price tag for " + selectedItem.name} disabled={saving}
            onPointerDown={event => onTagDown(event, selected)}
            onPointerMove={onTagMove} onPointerUp={onTagUp}
            onPointerCancel={onTagCancel} onLostPointerCapture={onTagCancel}
            className="absolute z-[2] cursor-grab touch-none rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 active:cursor-grabbing"
            style={tagAnchor(selected)}>
            <ShopPriceTag itemBoxSize={148} />
          </button>
        </div>
        <span className="text-center text-[10px] text-[#ead1a0]/80">Drag the tag onto the image</span>
      </div>}
    </ViewportModalPortal>}
    {showPicker && <ViewportModalPortal>
      <div data-testid="world-shop-picker" className="pointer-events-auto absolute inset-0 z-[75] flex items-end justify-center">
        <button type="button" aria-label="Close shop item picker"
          className="absolute inset-0 bg-black/45" onClick={() => setShowPicker(false)} />
        <section role="dialog" aria-modal="true" aria-label="Add items to world shop"
          onPointerDown={event => event.stopPropagation()}
          className="relative mx-2 mb-[max(12px,env(safe-area-inset-bottom,0px))] w-full max-w-[380px] rounded-2xl border-2 border-[#c9a967] bg-[#102b20] p-3 text-[#f4d69c] shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm">Stock this shop</strong>
            <span className="text-[10px] text-amber-100/65">{ids.length}/{PARK_SHOP_MAX_ITEMS} items · Tap outside to close</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#bda66c]/50 bg-[#091d16] px-2">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={search} onChange={event => setSearch(event.target.value)}
              aria-label="Search shop items" placeholder="Search items by name"
              className="min-h-10 w-full bg-transparent text-xs outline-none" />
          </div>
          <div className="my-2 flex flex-wrap gap-1" aria-label="Filter shop items">
            {FILTERS.map(value => <button key={value.type} type="button" aria-pressed={filter === value.type}
              onClick={() => setFilter(value.type)}
              className={"rounded-full border px-2 py-1 text-[10px] " +
                (filter === value.type ? "border-[#f4d794] bg-[#41684c]" : "border-[#85724e] bg-[#183d2a]")}>
              {value.name}
            </button>)}
          </div>
          <div role="listbox" aria-label="Choose a shop item"
            className="grid max-h-[min(32dvh,240px)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
            {catalog.isLoading && <p className="col-span-2 p-2 text-xs">Searching items…</p>}
            {catalog.isError && <p className="col-span-2 p-2 text-xs text-red-200">Could not load shop catalog.</p>}
            {(catalog.data ?? []).map(item => <button type="button" role="option" key={item.id}
              aria-selected={ids.includes(item.id)}
              disabled={ids.includes(item.id) || saving || ids.length >= PARK_SHOP_MAX_ITEMS}
              onClick={() => addItem(item.id)}
              className="flex min-h-12 items-center gap-1.5 rounded-lg border border-[#b79a65]/50 bg-[#244733] p-1.5 text-left disabled:opacity-40">
              {itemArt(item) ? <img src={itemArt(item) ?? ""} alt="" loading="lazy" decoding="async"
                className="h-10 w-10 shrink-0 object-contain" /> : <span className="w-10 text-center">✦</span>}
              <span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{item.name}</span>
                <span className="block text-[9px] text-amber-100/60">{ids.includes(item.id) ? "Placed" : item.type}</span></span>
            </button>)}
            {!catalog.isLoading && !catalog.isError && !catalog.data?.length &&
              <p className="col-span-2 p-2 text-xs">No matching items.</p>}
          </div>
        </section>
      </div>
    </ViewportModalPortal>}
    {saving && <div role="status" className="pointer-events-none absolute bottom-2 right-3 z-50 rounded-lg bg-[#10291d]/90 px-2 py-1 text-xs text-amber-200">
      Saving shop…
    </div>}
  </>;
}
