import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readPetParkImageData } from "@/lib/petParkImageData";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { PARK_WATER_EFFECT_OPTIONS } from "@shared/petParkEffects";
import WorldDecorEffectEditor from "./WorldDecorEffectEditor";
import type {
  WorldSceneContent, WorldSceneAsset, WorldSceneInteriorItem, WorldScenePlacement,
} from "@shared/worlds/worldSceneContent";
import type { ParkEffectType } from "@shared/petParkEffects";

type Panel = "library" | "effects" | "selected" | "terrain" | "shop" | "interior";
const EFFECT_CHOICES: Array<{ type: ParkEffectType; label: string; size: number }> = [
  ...HOME_OUTDOOR_EFFECT_OPTIONS.filter(o => o.type !== "sleep").map(o => ({ type: o.type, label: o.label, size: Math.max(60, o.defaultSize * 6) })),
  ...PARK_WATER_EFFECT_OPTIONS.map(o => ({ type: o.type, label: o.label, size: o.defaultSize })),
];

type Props = {
  worldId: string; scene: WorldSceneContent;
  selected: WorldScenePlacement | null;
  selectedInterior: WorldSceneInteriorItem | null;
  activeBuilding: WorldScenePlacement | null;
  placementPoint: { xPct: number; yPct: number };
  onChanged: () => void;
  onSelect: (id: string | null) => void;
  onSelectInterior: (id: string | null) => void;
  onEnter: (id: string) => void;
  onExit: () => void;
  onPaint: () => void;
};

export default function WorldSceneControls(props: Props) {
  const { toast } = useToast();
  const [panel, setPanel] = useState<Panel>("library");
  const [busy, setBusy] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadKind, setUploadKind] = useState<"decor" | "building">("decor");
  const [uploadArt, setUploadArt] = useState<string | null>(null);
  const [uploadTap, setUploadTap] = useState<string | null>(null);
  const [uploadInterior, setUploadInterior] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const root = `/api/admin/world-editor/${props.worldId}`;

  useEffect(() => {
    setPanel("library");
    setEditingAssetId(null);
    setAssetSearch("");
    setExpanded(false);
  }, [props.worldId]);
  useEffect(() => {
    setPanel(props.activeBuilding ? "interior" : "library");
  }, [props.activeBuilding?.id]);

  const currentAsset = props.scene.assets.find(asset => asset.id === props.selected?.assetId);
  const interiorAsset = props.scene.assets.find(asset => asset.id === props.activeBuilding?.assetId);
  const editingAsset = props.scene.assets.find(asset => asset.id === editingAssetId);
  const activeInteriorItems = props.scene.interiorItems.filter(item => item.buildingId === props.activeBuilding?.id);

  const catalog = useQuery<Array<{ id: string; name: string; type: string }>>({
    queryKey: [root, "shop-catalog", search],
    enabled: panel === "shop" && !!props.selected && props.selected.kind === "building",
    queryFn: async () => {
      const response = await fetch(`${root}/shop-catalog?q=${encodeURIComponent(search)}`,
        { credentials: "include" });
      if (!response.ok) throw new Error("Could not load shop catalog");
      return response.json();
    },
    staleTime: 60_000,
  });

  const mutate = async (method: "POST" | "PATCH" | "DELETE", route: string, data?: unknown) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await apiRequest(method, root + route, data);
      const result = await response.json();
      props.onChanged();
      return result;
    } catch (error) {
      toast({ title: "World edit could not be saved", description: String(error), variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (file: File | undefined, setter: (v: string) => void) => {
    if (!file) return;
    try { setter(await readPetParkImageData(file)); }
    catch (error) { toast({ title: "Invalid image", description: String(error), variant: "destructive" }); }
  };
  const handleUpload = async () => {
    if (!uploadArt || !uploadName.trim()) return;
    const result = await mutate("POST", "/assets", {
      kind: uploadKind, name: uploadName.trim(), imageData: uploadArt,
      tapImageData: uploadTap, interiorImageData: uploadKind === "building" ? uploadInterior : null,
    }) as WorldSceneAsset | null;
    if (result) {
      setUploadName(""); setUploadArt(null); setUploadTap(null); setUploadInterior(null);
      setEditingAssetId(result.id);
    }
  };
  const add = async (kind: "decor" | "building" | "effect", assetId: string | null, effectType: string | null, size: number) => {
    const result = await mutate("POST", "/placements", {
      kind, assetId, effectType, xPct: props.placementPoint.xPct, yPct: props.placementPoint.yPct,
      size, flipped: false, layer: 0, decorEffects: [], isWaterSource: false, isShop: false, shopItemIds: [],
    }) as WorldScenePlacement | null;
    if (result) { props.onSelect(result.id); setPanel("selected"); }
  };
  const addInside = async (kind: "decor" | "effect", assetId: string | null, effectType: string | null, size: number) => {
    if (!props.activeBuilding) return;
    const result = await mutate("POST", "/interior-items", {
      buildingId: props.activeBuilding.id, kind, assetId, effectType,
      xPct: 0.5, yPct: 0.5, size, flipped: false,
    }) as WorldSceneInteriorItem | null;
    if (result) props.onSelectInterior(result.id);
  };
  const patchSelected = async (values: Record<string, unknown>) => {
    if (!props.selected) return;
    await mutate("PATCH", `/placements/${props.selected.id}`, values);
  };
  const patchInterior = async (values: Record<string, unknown>) => {
    if (!props.selectedInterior) return;
    await mutate("PATCH", `/interior-items/${props.selectedInterior.id}`, values);
  };
  const removeSelected = async () => {
    if (!props.selected) return;
    const changed = await mutate("DELETE", `/placements/${props.selected.id}`);
    if (changed) { props.onSelect(null); setPanel("library"); }
  };
  const removeInterior = async () => {
    if (!props.selectedInterior) return;
    const changed = await mutate("DELETE", `/interior-items/${props.selectedInterior.id}`);
    if (changed) props.onSelectInterior(null);
  };

  const selectedItem = props.activeBuilding ? props.selectedInterior : props.selected;
  const isSelectedBuilding = props.selected?.kind === "building" && !props.activeBuilding;
  const tabs: Array<{ id: Panel; label: string }> = props.activeBuilding ? [
    { id: "interior", label: "Interior" }, { id: "library", label: "Decor" },
    { id: "effects", label: "Effects" }, { id: "selected", label: "Edit" },
  ] : [
    { id: "library", label: "Assets" }, { id: "terrain", label: "Terrain" },
    { id: "effects", label: "Effects" }, { id: "selected", label: "Edit" },
    ...(isSelectedBuilding ? [{ id: "shop" as const, label: "Shop" }] : []),
  ];

  const control = "rounded-md border border-[#a88b49]/70 bg-[#21422c] px-2.5 py-2 text-[11px] font-semibold disabled:opacity-40";
  const danger = "rounded-md border border-red-300/40 bg-[#451f25] px-2.5 py-2 text-[11px] text-[#ffd4c9] disabled:opacity-40";
  const field = "w-full rounded-md border border-[#a88b49]/60 bg-[#132a20] p-2 text-xs text-[#f5e5bb]";
  const heading = "text-xs font-semibold text-[#f7d783]";

  const matchingAssets = props.scene.assets.filter(asset =>
    (!props.activeBuilding || asset.kind === "decor") &&
    asset.name.toLowerCase().includes(assetSearch.trim().toLowerCase()));
  // Limit mounted image previews on Safari: each image may be a large artwork.
  const assetList = matchingAssets.slice(0, 40);

  return <section data-testid="world-scene-controls"
    className="absolute z-30 bottom-2 inset-x-2 mx-auto max-w-lg rounded-xl border border-[#9a8146] bg-[#11271b]/95 text-[#f5dfad] shadow-2xl"
    style={{ bottom: "max(8px, env(safe-area-inset-bottom, 8px))" }}
    onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}>
    <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
      <h2 className={heading}>{props.activeBuilding ? "Interior: " + (interiorAsset?.name ?? "Building") : "World Creator"}</h2>
      <div className="flex gap-2">
        {props.activeBuilding && <button className={control} type="button" onClick={props.onExit}>Exit Interior</button>}
        <button type="button" className={control} aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}>{expanded ? "Collapse" : "Edit Tools"}</button>
      </div>
    </div>
    {!expanded ? <div className="flex justify-between gap-1 px-3 pb-2">
      {props.activeBuilding && <button className={control} onClick={() => setExpanded(true)}>Add interior items</button>}
      <button className={control} onClick={() => { setPanel("library"); setExpanded(true); }}>+ Add</button>
      {!props.activeBuilding && <button className={control} onClick={props.onPaint}>Paint Ground</button>}
      {selectedItem && <button className={control} onClick={() => { setPanel("selected"); setExpanded(true); }}>Edit Selected</button>}
    </div> : <>
      <nav className="flex gap-1 overflow-x-auto px-3 py-1">
        {tabs.map(t => <button key={t.id} type="button" onClick={() => setPanel(t.id)}
          aria-pressed={panel === t.id} className={`min-w-[55px] rounded-md border px-2 py-2 text-[10px] font-semibold ${panel === t.id ? "border-[#e7c46d] bg-[#31583c]" : "border-[#705f3c] bg-[#152e21]"}`}>
          {t.label}
        </button>)}
      </nav>
      <div className="max-h-[min(46dvh,340px)] space-y-3 overflow-y-auto overscroll-contain p-3 pt-2">
        {panel === "library" && <>
          {!props.activeBuilding && <div className="space-y-2 border-b border-[#75613c] pb-3">
            <h3 className={heading}>Upload world-only artwork</h3>
            <input aria-label="Asset name" className={field} placeholder="Decoration or building name"
              value={uploadName} onChange={e => setUploadName(e.target.value)} />
            <select value={uploadKind} className={field}
              aria-label="New asset type" onChange={e => setUploadKind(e.target.value as "decor" | "building")}>
              <option value="decor">Decoration</option><option value="building">Building</option>
            </select>
            <label className="block text-[11px]">Artwork (transparent PNG recommended)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 block w-full text-[11px]"
                onChange={e => void chooseFile(e.target.files?.[0], setUploadArt)} />
            </label>
            {uploadArt && <img src={uploadArt} alt="Pending asset" className="h-20 max-w-full object-contain" />}
            <label className="block text-[11px]">Optional tapped appearance
              <input type="file" accept="image/*" className="mt-1 block w-full text-[11px]"
                onChange={e => void chooseFile(e.target.files?.[0], setUploadTap)} />
            </label>
            {uploadKind === "building" && <label className="block text-[11px]">Interior room image
              <input type="file" accept="image/*" className="mt-1 block w-full text-[11px]"
                onChange={e => void chooseFile(e.target.files?.[0], setUploadInterior)} />
            </label>}
            <button type="button" className={control} disabled={busy || !uploadArt || !uploadName.trim()}
              onClick={() => void handleUpload()}>Save to This World's Library</button>
          </div>}
          <h3 className={heading}>Artwork Library — {matchingAssets.length} matching assets</h3>
          <input aria-label="Search world artwork library" className={field}
            placeholder="Find decorations and buildings…" value={assetSearch}
            onChange={event => setAssetSearch(event.target.value)} />
          {matchingAssets.length > assetList.length && <p className="text-[11px] text-[#cabd99]">
            Showing the first {assetList.length}. Search by name for more.
          </p>}
          {!assetList.length && <p className="text-xs text-[#cabd99]">Upload the first asset to begin placing it.</p>}
          <div className="grid grid-cols-2 gap-2">
            {assetList.map(asset => <div key={asset.id} className="rounded-lg border border-[#6d6645] p-2">
              <img src={asset.imageUrl} alt="" loading="lazy" decoding="async" className="mx-auto h-20 w-full object-contain" />
              <p className="truncate py-1 text-[11px]">{asset.name}</p>
              <div className="flex flex-wrap gap-1">
                <button className={control} disabled={busy} onClick={() =>
                  props.activeBuilding
                    ? void addInside("decor", asset.id, null, 130)
                    : void add(asset.kind, asset.id, null, asset.kind === "building" ? 300 : 140)}>
                  {props.activeBuilding ? "Add Inside" : "Place"}
                </button>
                {!props.activeBuilding && <button className={control} onClick={() => setEditingAssetId(asset.id)}>Edit Art</button>}
              </div>
            </div>)}
          </div>
          {!props.activeBuilding && editingAsset && <div className="space-y-2 border-t border-[#75613c] pt-3">
            <h3 className={heading}>Edit {editingAsset.name}</h3>
            <input aria-label="Rename asset" defaultValue={editingAsset.name} key={editingAsset.id}
              id="world-asset-name" className={field} />
            <button type="button" className={control} disabled={busy}
              onClick={() => {
                const el = document.getElementById("world-asset-name") as HTMLInputElement | null;
                if (el) void mutate("PATCH", `/assets/${editingAsset.id}`, { name: el.value });
              }}>Save Name</button>
            {(["imageData", "tapImageData", ...(editingAsset.kind === "building" ? ["interiorImageData"] : [])] as const).map(fieldName =>
              <label key={fieldName} className="block text-[11px]">{fieldName === "imageData" ? "Replace artwork" : fieldName === "tapImageData" ? "Replace tapped artwork" : "Replace interior image"}
                <input type="file" accept="image/*" className="mt-1 block w-full text-[11px]" disabled={busy}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try { await mutate("PATCH", `/assets/${editingAsset.id}`,
                      { [fieldName]: await readPetParkImageData(file) }); }
                    catch (error) { toast({ title: "Could not read image", description: String(error), variant: "destructive" }); }
                  }} />
              </label>)}
            <button type="button" className={danger} disabled={busy} onClick={async () => {
              if (await mutate("DELETE", `/assets/${editingAsset.id}`)) setEditingAssetId(null);
            }}>Delete Unused Asset</button>
          </div>}
        </>}

        {panel === "terrain" && <div className="space-y-2">
          <p className="text-xs">Paint snapped 2.5D dirt, stone, water and garden plots. Tiles save when you lift your finger.</p>
          <button className={control} type="button" onClick={props.onPaint}>Open Terrain Brush</button>
          <p className="text-[11px] text-[#d0c094]">Soil plots can be designed now. Planting and harvesting will use the shared inventory when PR 3 adds player actions.</p>
        </div>}

        {panel === "effects" && <div className="space-y-2">
          <h3 className={heading}>Scene effects</h3>
          <p className="text-[11px]">Tap to add an animated effect in the scene or inside the selected building.</p>
          <div className="grid grid-cols-2 gap-2">
            {EFFECT_CHOICES.map(effect => <button key={effect.type} className={control} disabled={busy}
              onClick={() => props.activeBuilding
                ? void addInside("effect", null, effect.type, effect.size)
                : void add("effect", null, effect.type, effect.size)}>
              {effect.label}
            </button>)}
          </div>
        </div>}

        {panel === "selected" && <>
          {!selectedItem ? <p className="text-xs">Tap a decoration, building, effect, or interior object to edit it.</p> : <>
            <h3 className={heading}>Selected {selectedItem.kind}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button className={control} disabled={busy || selectedItem.size <= 1}
                onClick={() => void (props.activeBuilding
                  ? patchInterior({ size: Math.max(1, selectedItem.size - 15) })
                  : patchSelected({ size: Math.max(1, selectedItem.size - 15) }))}>Smaller</button>
              <span className="text-xs">{selectedItem.size}</span>
              <button className={control} disabled={busy || selectedItem.size >= 1000}
                onClick={() => void (props.activeBuilding
                  ? patchInterior({ size: Math.min(1000, selectedItem.size + 15) })
                  : patchSelected({ size: Math.min(1000, selectedItem.size + 15) }))}>Larger</button>
              <button className={control} disabled={busy}
                onClick={() => void (props.activeBuilding
                  ? patchInterior({ flipped: !selectedItem.flipped })
                  : patchSelected({ flipped: !selectedItem.flipped }))}>Flip</button>
              <button className={danger} disabled={busy} onClick={() =>
                void (props.activeBuilding ? removeInterior() : removeSelected())}>Remove</button>
            </div>
            {!props.activeBuilding && props.selected?.kind === "decor" && currentAsset && <>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={props.selected.isWaterSource} disabled={busy}
                  onChange={e => void patchSelected({ isWaterSource: e.target.checked })} />
                Water refill source (active in PR 3)
              </label>
              <WorldDecorEffectEditor key={props.selected.id} imageUrl={currentAsset.imageUrl}
                effects={props.selected.decorEffects} disabled={busy}
                onChange={effects => void patchSelected({ decorEffects: effects })} />
            </>}
            {!props.activeBuilding && props.selected?.kind === "building" && <>
              <button type="button" className={control} onClick={() => props.onEnter(props.selected!.id)}>
                Enter Building / Edit Interior
              </button>
              <button type="button" className={control} onClick={() => setPanel("shop")}>Shop Setup</button>
            </>}
          </>}
        </>}

        {panel === "shop" && isSelectedBuilding && props.selected && <>
          <h3 className={heading}>Building Shop</h3>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={props.selected.isShop} disabled={busy}
              onChange={e => void patchSelected({ isShop: e.target.checked })} /> Enable shop for future world integration
          </label>
          <input aria-label="Search shared item catalog" value={search} onChange={e => setSearch(e.target.value)}
            className={field} placeholder="Find pets, seeds, tools, items..." />
          <p className="text-[11px] text-[#ceb98c]">Stock references Para Pets' existing item catalog and shared player inventory. Shops aren't public until their worlds are integrated.</p>
          {catalog.isLoading ? <p className="text-xs">Loading items...</p> :
            catalog.isError ? <p className="text-xs">Could not load shared catalog</p> :
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(catalog.data ?? []).map(item => <label key={item.id}
                className="flex items-center gap-2 rounded-md border border-[#5d6f48] p-2 text-[11px]">
                <input type="checkbox" checked={props.selected!.shopItemIds.includes(item.id)} disabled={busy}
                  onChange={e => {
                    const items = e.target.checked
                      ? [...props.selected!.shopItemIds, item.id]
                      : props.selected!.shopItemIds.filter(id => id !== item.id);
                    void patchSelected({ shopItemIds: items });
                  }} />
                <span className="truncate">{item.name} <span className="opacity-60">({item.type})</span></span>
              </label>)}
            </div>}
          <p className="text-[11px]">Selected stock: {props.selected.shopItemIds.length}</p>
        </>}

        {panel === "interior" && props.activeBuilding && <>
          <h3 className={heading}>Interior for {interiorAsset?.name}</h3>
          {interiorAsset?.interiorImageUrl ? <p className="text-xs">Tap and drag objects over the room artwork. Decorations and effects save only in this building.</p> :
            <p className="text-xs text-[#f4caa6]">Add an interior image to the building asset in the outside asset library before decorating.</p>}
          <p className="text-xs">Objects: {activeInteriorItems.length} / 120</p>
          <div className="grid grid-cols-2 gap-1">
            {activeInteriorItems.map(item => <button key={item.id} className={control}
              onClick={() => { props.onSelectInterior(item.id); setPanel("selected"); }}>{item.kind} · {item.size}</button>)}
          </div>
        </>}
      </div>
    </>}
  </section>;
}
