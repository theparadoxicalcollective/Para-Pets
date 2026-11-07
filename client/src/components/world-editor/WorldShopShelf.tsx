import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PARA_PETS_COIN_IMAGE } from "@/lib/coinAssets";
import {
  withParkShopDefaults, parkShopPriceTagPoint, parkShopPriceTagSize,
  rotateParkShopPlacement, flipParkShopPlacement, PARK_SHOP_MIN_SIZE, PARK_SHOP_MAX_SIZE,
  PARK_SHOP_PRICE_TAG_MIN, PARK_SHOP_PRICE_TAG_MAX,
  type ParkShopPlacement,
} from "@shared/petParkShopPlacements";
import type { WorldScenePlacement } from "@shared/worlds/worldSceneContent";
import PRICE_TAG_ART from "@assets/price_tag.png?url";

type Merchandise = {
  id: string; name: string; type: string; price: number;
  imageUrl: string | null; eggImageUrl: string | null; hatchedImageUrl: string | null;
};
type Drag = {
  id: number; itemId: string; kind: "stock" | "tag";
  startX: number; startY: number; start: ParkShopPlacement;
  moved: boolean; latest: ParkShopPlacement;
};
function art(item: Merchandise) {
  return item.type === "pet"
    ? item.eggImageUrl || item.imageUrl || item.hatchedImageUrl
    : item.imageUrl || item.eggImageUrl || item.hatchedImageUrl;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/**
 * World-only shop shelf authoring, based on Pet Park merchandise geometry.
 * Stock uses existing shop item identities, not new inventory or purchases.
 * No player purchase or transaction endpoint is called here.
 */
export default function WorldShopShelf({ worldId, building, roomWidth, roomHeight, onChanged }: {
  worldId: string; building: WorldScenePlacement; roomWidth: number; roomHeight: number;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<ParkShopPlacement[]>(() =>
    withParkShopDefaults(building.shopItemIds, building.shopItemPlacements));
  const [saving, setSaving] = useState(false);
  const drag = useRef<Drag | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => {
    if (drag.current) return;
    const next = withParkShopDefaults(building.shopItemIds, building.shopItemPlacements);
    layoutRef.current = next; setLayout(next);
  }, [building.id, building.shopItemIds, building.shopItemPlacements]);

  const stock = useQuery<Merchandise[]>({
    queryKey: ["/api/admin/world-editor", worldId, building.id, "shop-stock", building.shopItemIds],
    enabled: building.isShop && building.shopItemIds.length > 0,
    queryFn: async () => {
      const response = await fetch(`/api/admin/world-editor/${worldId}/buildings/${building.id}/shop-stock`,
        { credentials: "include" });
      if (!response.ok) throw new Error("Unable to read shop stock");
      return response.json();
    },
  });
  const byId = new Map((stock.data ?? []).map(item => [item.id, item]));
  const selected = layout.find(item => item.itemId === selectedId);
  const button = "rounded-md border border-[#b89a57]/70 bg-[#1d3c2b] px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40";

  const save = async (next: ParkShopPlacement[], previous: ParkShopPlacement[]) => {
    if (saving) return;
    setSaving(true);
    layoutRef.current = next;
    setLayout(next);
    try {
      await apiRequest("PATCH", `/api/admin/world-editor/${worldId}/placements/${building.id}`, {
        shopItemPlacements: next,
      });
      onChanged();
    } catch (error) {
      layoutRef.current = previous; setLayout(previous);
      toast({ title: "Shop layout not saved", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = (change: (current: ParkShopPlacement) => ParkShopPlacement) => {
    if (!selected || saving) return;
    const previous = layoutRef.current;
    const next = previous.map(p => p.itemId === selected.itemId ? change(p) : p);
    void save(next, previous);
  };

  const down = (event: ReactPointerEvent<HTMLButtonElement>, placement: ParkShopPlacement) => {
    if ((event.button !== 0 && event.pointerType === "mouse") || saving || drag.current) return;
    event.stopPropagation();
    const kind = (event.target as HTMLElement).closest("[data-world-price-tag]") ? "tag" : "stock";
    drag.current = {
      id: event.pointerId, itemId: placement.itemId, kind,
      startX: event.clientX, startY: event.clientY,
      start: placement, latest: placement, moved: false,
    };
    setSelectedId(placement.itemId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - d.startX, dy = event.clientY - d.startY;
    const imageSize = Math.max(1, roomHeight * d.start.size / 100);
    const next = d.kind === "stock" ? {
      ...d.start, xPct: clamp(d.start.xPct + dx / Math.max(1, roomWidth)),
      yPct: clamp(d.start.yPct + dy / Math.max(1, roomHeight)),
    } : {
      ...d.start,
      priceTagXPct: Math.max(PARK_SHOP_PRICE_TAG_MIN, Math.min(PARK_SHOP_PRICE_TAG_MAX,
        (d.start.priceTagXPct ?? .72) + dx / imageSize)),
      priceTagYPct: Math.max(PARK_SHOP_PRICE_TAG_MIN, Math.min(PARK_SHOP_PRICE_TAG_MAX,
        (d.start.priceTagYPct ?? .78) + dy / imageSize)),
    };
    d.latest = next;
    d.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    layoutRef.current = layoutRef.current.map(p => p.itemId === d.itemId ? next : p);
    setLayout(layoutRef.current);
  };
  const up = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (d.moved) void save(layoutRef.current, layout.map(p => p.itemId === d.itemId ? d.start : p));
  };
  const cancel = () => {
    if (!drag.current) return;
    const d = drag.current;
    drag.current = null;
    layoutRef.current = layoutRef.current.map(p => p.itemId === d.itemId ? d.start : p);
    setLayout(layoutRef.current);
  };
  if (!building.isShop || !building.shopItemIds.length) return null;

  return <>
    <div className="pointer-events-none absolute inset-0 z-[15]" data-testid="world-shop-shelf">
      {layout.map(p => {
        const item = byId.get(p.itemId);
        const artwork = item && art(item);
        const imageSize = roomHeight * p.size / 100;
        const marker = parkShopPriceTagPoint(p);
        return <button key={p.itemId} type="button" data-testid={`world-shop-merchandise-${p.itemId}`}
          aria-label={`Position shop item ${item?.name ?? p.itemId}`}
          onPointerDown={event => down(event, p)}
          onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onClick={event => { event.stopPropagation(); setSelectedId(p.itemId); }}
          className="pointer-events-auto absolute touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
          style={{
            width: imageSize, height: imageSize,
            left: p.xPct * roomWidth, top: p.yPct * roomHeight,
            transform: "translate(-50%, -50%)",
            zIndex: selectedId === p.itemId ? 100 : 20 + Math.round(p.yPct * 50),
            outline: selectedId === p.itemId ? "2px dashed #e6c66d" : undefined,
          }}>
          {artwork && <img src={artwork} alt="" draggable={false}
            className="pointer-events-none h-full w-full object-contain"
            style={{ transform: `rotate(${p.rotation ?? 0}deg) scaleX(${p.flippedX ? -1 : 1})` }} />}
          <span data-world-price-tag className="absolute touch-none"
            style={{
              left: `${marker.xPct * 100}%`, top: `${marker.yPct * 100}%`,
              width: parkShopPriceTagSize(imageSize),
              height: parkShopPriceTagSize(imageSize),
              transform: "translate(-50%, -50%)",
            }}>
            <img src={PRICE_TAG_ART} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
            <img src={PARA_PETS_COIN_IMAGE} alt="" draggable={false}
              className="pointer-events-none absolute left-[37%] top-[30%] h-[35%] w-[35%] object-contain" />
          </span>
        </button>;
      })}
    </div>
    <div className="pointer-events-auto absolute right-2 z-20 max-w-[190px] rounded-xl border border-[#b89a57]/70 bg-[#10281d]/95 p-2 text-[#ecd79b] shadow-lg"
      style={{ top: "max(80px, env(safe-area-inset-top, 80px))" }}
      onPointerDown={event => event.stopPropagation()}>
      <div className="text-[11px] font-semibold">Shop Layout · {layout.length} items</div>
      <p className="my-1 text-[10px] text-[#d3c49b]">Drag merchandise or its price tag to position.</p>
      {selected && <div className="flex flex-wrap gap-1 pt-1">
        <p className="w-full truncate text-[10px]">{byId.get(selected.itemId)?.name ?? "Selected item"}</p>
        <button type="button" className={button} disabled={saving || selected.size <= PARK_SHOP_MIN_SIZE}
          onClick={() => updateSelected(p => ({ ...p, size: Math.max(PARK_SHOP_MIN_SIZE, p.size - 1) }))}>Smaller</button>
        <button type="button" className={button} disabled={saving || selected.size >= PARK_SHOP_MAX_SIZE}
          onClick={() => updateSelected(p => ({ ...p, size: Math.min(PARK_SHOP_MAX_SIZE, p.size + 1) }))}>Larger</button>
        <button type="button" className={button} disabled={saving}
          onClick={() => updateSelected(rotateParkShopPlacement)}>Rotate</button>
        <button type="button" className={button} disabled={saving}
          onClick={() => updateSelected(flipParkShopPlacement)}>Flip</button>
      </div>}
      {stock.isError && <p className="text-[10px] text-red-200">Unable to load stock images.</p>}
      {saving && <p className="text-[10px]">Saving layout…</p>}
    </div>
  </>;
}
