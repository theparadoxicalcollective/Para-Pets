import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type ParkShopItemPreview = {
  id: string; name: string; type: string; price: number;
  imageUrl: string | null; eggImageUrl: string | null; hatchedImageUrl: string | null;
};
const filters = [
  { name: "All", type: "all" },
  { name: "Pets", type: "pet" },
  { name: "Items", type: "item" },
  { name: "Seeds", type: "garden_seed" },
  { name: "Tools", type: "garden_tool" },
];
function shopArt(item: ParkShopItemPreview) {
  return item.imageUrl || item.eggImageUrl || item.hatchedImageUrl;
}

/** An inventory display attached to the existing Pet Park building interior.
 * Reuses catalog IDs rather than copying full item records or storing images.
 * Browsing merchandise is deliberately separate from buying: the existing
 * coin-shop's purchase limits and types require their own secure checkout. */
export default function PetParkShopShelf({
  buildingId, itemIds, canEditPark,
}: { buildingId: string; itemIds: readonly string[]; canEditPark: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search), 240);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { data: selected = [], isLoading: selectedLoading } = useQuery<ParkShopItemPreview[]>({
    queryKey: ["/api/pet-park/buildings", buildingId, "shop-items"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pet-park/buildings/" + encodeURIComponent(buildingId) + "/shop-items");
      return response.json();
    },
    staleTime: 30_000,
  });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ParkShopItemPreview[]>({
    queryKey: ["/api/admin/pet-park/shop-catalog", searchTerm, filter],
    enabled: canEditPark && showPicker,
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchTerm, type: filter });
      const response = await apiRequest("GET", "/api/admin/pet-park/shop-catalog?" + params);
      return response.json();
    },
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: async (nextItemIds: string[]) => {
      const response = await apiRequest("PATCH",
        "/api/admin/pet-park/buildings/" + encodeURIComponent(buildingId),
        { shopItemIds: nextItemIds });
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pet-park/scene"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pet-park"] });
      qc.invalidateQueries({ queryKey: ["/api/pet-park/buildings", buildingId, "shop-items"] });
    },
    onError: (error: Error) => toast({
      title: "Unable to update shop items", description: error.message, variant: "destructive",
    }),
  });
  const addItem = (id: string) => {
    if (!itemIds.includes(id) && itemIds.length < 80 && !save.isPending)
      save.mutate([...itemIds, id]);
  };
  const removeItem = (id: string) => {
    if (!save.isPending) save.mutate(itemIds.filter(current => current !== id));
  };
  return <section data-testid="pet-park-shop-shelf"
    className="pointer-events-auto absolute inset-x-3 z-[52] mx-auto max-w-md rounded-2xl border border-[#bc9f64]/80 bg-[#102d20]/95 p-2.5 text-[#f2d69d] shadow-[0_10px_35px_rgba(0,0,0,.55)]"
    style={{ bottom: "max(154px, calc(env(safe-area-inset-bottom, 0px) + 150px))", maxHeight: showPicker ? "min(53dvh,530px)" : "min(26dvh,190px)" }}>
    <div className="flex items-center justify-between gap-2">
      <strong className="font-fantasy text-sm">Shop items <span className="text-xs font-normal text-amber-100/65">({selected.length})</span></strong>
      {canEditPark && <button type="button" aria-label="Add shop item"
        onClick={() => setShowPicker(old => !old)}
        className="flex min-h-9 items-center gap-1 rounded-full border border-[#c7a56a]/75 bg-[#245037] px-3 text-xs font-semibold">
        {showPicker ? <X size={15} /> : <Plus size={15} />}{showPicker ? "Close" : "+ Add Item"}
      </button>}
    </div>
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1" data-testid="pet-park-shop-items">
      {selectedLoading && <p className="p-2 text-xs">Loading items…</p>}
      {!selectedLoading && !selected.length && <p className="p-2 text-xs text-amber-100/70">
        {canEditPark ? "Use + Add Item to stock this shop from the existing catalog." : "This shop has no items displayed yet."}
      </p>}
      {selected.map(item => <div key={item.id} className="relative flex w-[82px] shrink-0 flex-col items-center rounded-xl border border-[#bd9f69]/45 bg-[#1e4230]/80 p-2 text-center">
        {canEditPark && <button type="button" aria-label={"Remove " + item.name}
          disabled={save.isPending} onClick={() => removeItem(item.id)}
          className="absolute right-0 top-0 rounded-full bg-[#532d24] p-1 disabled:opacity-40">
          <X size={12} />
        </button>}
        {shopArt(item) ? <img src={shopArt(item) ?? ""} alt="" loading="lazy" decoding="async"
          className="h-11 w-11 object-contain" /> : <span className="h-11 text-2xl">✦</span>}
        <span className="mt-1 w-full truncate text-[10px] font-semibold" title={item.name}>{item.name}</span>
        <span className="text-[9px] text-amber-100/65">{item.price} coins</span>
      </div>)}
    </div>
    {!canEditPark && selected.length > 0 && <p className="mt-1 text-[10px] text-amber-100/60">Item display only · Purchases are not enabled here yet.</p>}
    {showPicker && canEditPark && <div data-testid="pet-park-shop-picker" className="mt-2 border-t border-[#bfa46d]/40 pt-2">
      <div className="flex items-center gap-1 rounded-lg border border-[#bda66c]/50 bg-[#0d261b] px-2">
        <Search size={14} />
        <input value={search} onChange={event => setSearch(event.target.value)}
          aria-label="Search shop items" type="search" placeholder="Search existing items by name"
          className="min-h-10 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-amber-100/45" />
      </div>
      <div className="my-2 flex flex-wrap gap-1" aria-label="Filter shop items">
        {filters.map(option => <button type="button" key={option.type}
          aria-pressed={filter === option.type}
          onClick={() => setFilter(option.type)}
          className={"rounded-full border px-2.5 py-1 text-[10px] " +
            (filter === option.type ? "border-[#e6c478] bg-[#4d6b44] font-semibold" : "border-[#9b895c]/55 bg-[#153523]")}>
          {option.name}
        </button>)}
      </div>
      <div role="listbox" aria-label="Choose a shop item"
        className="grid max-h-[min(25dvh,190px)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
        {catalogLoading && <p className="col-span-2 text-center text-xs">Searching items…</p>}
        {catalog.map(item => <button type="button" key={item.id} role="option" aria-selected={itemIds.includes(item.id)}
          disabled={itemIds.includes(item.id) || save.isPending}
          onClick={() => addItem(item.id)}
          className="flex min-h-12 items-center gap-2 rounded-lg border border-[#b99a4c]/50 bg-[#245037]/75 p-1.5 text-left disabled:opacity-40">
          {shopArt(item) ? <img src={shopArt(item) ?? ""} alt=""
            loading="lazy" decoding="async" className="h-10 w-10 shrink-0 object-contain" /> :
            <span className="grid h-10 w-10 shrink-0 place-items-center">✦</span>}
          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.name}</span>
            <span className="block truncate text-[10px] text-amber-100/60">{item.type}</span></span>
        </button>)}
        {!catalogLoading && catalog.length === 0 && <p className="col-span-2 p-2 text-center text-xs">No matching catalog items.</p>}
      </div>
    </div>}
  </section>;
}
