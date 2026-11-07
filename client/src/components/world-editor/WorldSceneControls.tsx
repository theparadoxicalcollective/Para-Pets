import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readPetParkImageData } from "@/lib/petParkImageData";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { PARK_WATER_EFFECT_OPTIONS } from "@shared/petParkEffects";
import WorldDecorEffectEditor from "./WorldDecorEffectEditor";
import WorldSceneCreateForm from "./WorldSceneCreateForm";
import type {
  WorldSceneContent, WorldSceneInteriorItem, WorldScenePlacement,
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
  const [search, setSearch] = useState("");
  const [buildingNameDraft, setBuildingNameDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [assetKindFilter, setAssetKindFilter] = useState<"decor" | "building" | null>(null);
  const root = `/api/admin/world-editor/${props.worldId}`;

  useEffect(() => {
    setPanel("library");
    setExpanded(false);
    setAssetKindFilter(null);
  }, [props.worldId]);
  useEffect(() => {
    setPanel(props.activeBuilding ? "interior" : "library");
  }, [props.activeBuilding?.id]);

  const currentAsset = props.scene.assets.find(asset => asset.id === props.selected?.assetId);
  useEffect(() => { setBuildingNameDraft(currentAsset?.name ?? ""); }, [currentAsset?.id, currentAsset?.name]);
  const shopBuilding = props.activeBuilding ??
    (props.selected?.kind === "building" ? props.selected : null);

  const catalog = useQuery<Array<{ id: string; name: string; type: string }>>({
    queryKey: [root, "shop-catalog", search],
    enabled: panel === "shop" && !!shopBuilding,
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

  const add = async (kind: "decor" | "building" | "effect", assetId: string | null, effectType: string | null, size: number) => {
    const result = await mutate("POST", "/placements", {
      kind, assetId, effectType, xPct: props.placementPoint.xPct, yPct: props.placementPoint.yPct,
      size, flipped: false, layer: 0, decorEffects: [], isWaterSource: false, isShop: false, shopItemIds: [],
    }) as WorldScenePlacement | null;
    if (result) { props.onSelect(result.id); setPanel("selected"); setExpanded(false); }
  };
  const addInside = async (kind: "decor" | "effect", assetId: string | null, effectType: string | null, size: number) => {
    if (!props.activeBuilding) return;
    const result = await mutate("POST", "/interior-items", {
      buildingId: props.activeBuilding.id, kind, assetId, effectType,
      xPct: 0.5, yPct: 0.5, size, flipped: false,
    }) as WorldSceneInteriorItem | null;
    if (result) { props.onSelectInterior(result.id); setPanel("selected"); setExpanded(false); }
  };
  const patchSelected = async (values: Record<string, unknown>) => {
    if (!props.selected) return;
    await mutate("PATCH", `/placements/${props.selected.id}`, values);
  };
  const patchInterior = async (values: Record<string, unknown>) => {
    if (!props.selectedInterior) return;
    await mutate("PATCH", `/interior-items/${props.selectedInterior.id}`, values);
  };
  const duplicateSelected = async () => {
    const source = props.selected;
    if (!source || source.kind !== "decor" || !source.assetId) return;
    // The same world asset powers linked copies; individual positioning stays independent.
    const offset = .02;
    const result = await mutate("POST", "/placements", {
      kind: "decor", assetId: source.assetId, effectType: null,
      xPct: Math.max(0, Math.min(1, source.xPct + offset)),
      yPct: Math.max(0, Math.min(1, source.yPct + offset)),
      size: source.size, flipped: source.flipped, layer: source.layer,
      decorEffects: source.decorEffects, isWaterSource: source.isWaterSource,
      isShop: false, shopItemIds: [],
    }) as WorldScenePlacement | null;
    if (result) props.onSelect(result.id);
  };
  const patchArtwork = async (assetId: string, name: "imageData" | "tapImageData" | "interiorImageData",
    file?: File) => {
    if (!file) return;
    try {
      await mutate("PATCH", `/assets/${assetId}`, { [name]: await readPetParkImageData(file) });
    } catch (error) {
      toast({ title: "Artwork could not be read", description: String(error), variant: "destructive" });
    }
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
  const patchShop = async (values: Record<string, unknown>) => {
    if (!shopBuilding) return;
    await mutate("PATCH", `/placements/${shopBuilding.id}`, values);
  };
  const control = "rounded-md border border-[#a88b49]/70 bg-[#21422c] px-2.5 py-2 text-[11px] font-semibold disabled:opacity-40";
  const danger = "rounded-md border border-red-300/40 bg-[#451f25] px-2.5 py-2 text-[11px] text-[#ffd4c9] disabled:opacity-40";
  const field = "w-full rounded-md border border-[#a88b49]/60 bg-[#132a20] p-2 text-xs text-[#f5e5bb]";
  const heading = "text-xs font-semibold text-[#f7d783]";

  const openCreator = (mode: Panel, kind: "decor" | "building" | null = null) => {
    setAssetKindFilter(kind);
    setPanel(mode);
    setExpanded(true);
  };
  const clearTerrain = async () => {
    if (busy || !props.scene.placements.some(item => item.kind === "terrain")) return;
    const result = await mutate("DELETE", "/terrain");
    if (result) toast({ title: "World terrain cleared", description: "Only this private world draft was changed." });
  };
  const selectedName = props.activeBuilding
    ? props.scene.assets.find(asset => asset.id === props.selectedInterior?.assetId)?.name ??
      props.selectedInterior?.effectType?.replaceAll("_", " ") ?? "Interior object"
    : props.scene.assets.find(asset => asset.id === props.selected?.assetId)?.name ??
      props.selected?.effectType?.replaceAll("_", " ") ?? "World object";
  const quickButton = "min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#10291d]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg disabled:opacity-40";
  const quickAccent = "min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#20442e]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg disabled:opacity-40";
  const quickDanger = "min-h-12 rounded-xl border border-[#be8d62]/65 bg-[#463028]/95 px-2 py-2 text-xs font-semibold text-[#f9d6a6] shadow-lg disabled:opacity-40";

  return <>
    {!expanded && !selectedItem && <div
      data-testid="world-scene-controls" aria-label="World editing toolbar"
      className="pointer-events-auto absolute inset-x-3 z-30 mx-auto grid max-w-lg grid-cols-3 gap-1.5 sm:grid-cols-5"
      style={{ bottom: "max(64px, env(safe-area-inset-bottom, 0px))" }}
      onPointerDown={event => event.stopPropagation()}>
      {props.activeBuilding ? <>
        <button type="button" className={quickButton} onClick={() => openCreator("library", "decor")}>+ Decor</button>
        <button type="button" className={quickButton} onClick={() => openCreator("effects")}>+ Effects</button>
        <button type="button" className={quickButton} onClick={() => openCreator("shop")}>Shop Setup</button>
        <button type="button" className={quickAccent} onClick={props.onExit}>Exit Interior</button>
      </> : <>
        <button type="button" className={quickButton} onClick={() => openCreator("library", "building")}>+ Building</button>
        <button type="button" className={quickButton} onClick={() => openCreator("library", "decor")}>+ Decor</button>
        <button type="button" className={quickButton} onClick={() => openCreator("effects")}>+ Effects</button>
        <button type="button" className={quickAccent} aria-label="Paint terrain"
          onClick={props.onPaint}>Paint terrain</button>
        <button type="button" className={quickDanger} aria-label="Clear all world terrain"
          disabled={busy || !props.scene.placements.some(item => item.kind === "terrain")}
          onClick={() => void clearTerrain()}>{busy ? "Saving…" : "Clear terrain"}</button>
      </>}
    </div>}
    {!expanded && selectedItem && <section
      data-testid="world-scene-selected-controls" aria-label="Edit selected world object"
      className="pointer-events-auto absolute left-3 right-3 z-30 mx-auto flex max-w-sm flex-col gap-2 overflow-y-auto rounded-xl border border-[#b99a4c]/75 bg-[#10291d]/95 p-3 text-[#f5d77b] shadow-xl"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom, 0px))", maxHeight: "min(65dvh, 620px)" }}
      onPointerDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate text-sm capitalize">{selectedName}</strong>
        <button type="button" aria-label="Deselect world object" className={control}
          onClick={() => props.activeBuilding ? props.onSelectInterior(null) : props.onSelect(null)}>Done</button>
      </div>
      <p className="text-[11px] text-amber-100/75">Drag the artwork to reposition it. Changes save automatically.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className={control} disabled={busy || selectedItem.size <= 1}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ size: Math.max(1, selectedItem.size - 20) })
            : patchSelected({ size: Math.max(1, selectedItem.size - 20) }))}>− Size</button>
        <span className="tabular-nums">Size {selectedItem.size}</span>
        <button type="button" className={control} disabled={busy || selectedItem.size >= 1000}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ size: Math.min(1000, selectedItem.size + 20) })
            : patchSelected({ size: Math.min(1000, selectedItem.size + 20) }))}>+ Size</button>
        <button type="button" className={control} disabled={busy}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ flipped: !selectedItem.flipped })
            : patchSelected({ flipped: !selectedItem.flipped }))}>Flip</button>
        <button type="button" className={danger} disabled={busy}
          onClick={() => void (props.activeBuilding ? removeInterior() : removeSelected())}>Remove</button>
      </div>
      {!props.activeBuilding && props.selected?.kind === "decor" && <>
        <button type="button" aria-label="Duplicate world decoration" className={control}
          disabled={busy} onClick={() => void duplicateSelected()}>Duplicate</button>
        <button type="button" aria-pressed={props.selected.isWaterSource} className={control}
          disabled={busy} onClick={() => void patchSelected({ isWaterSource: !props.selected!.isWaterSource })}>
          Water Source: {props.selected.isWaterSource ? "ON" : "OFF"}
        </button>
        <div className="space-y-2 rounded-lg border border-[#b99a4c]/55 bg-[#153523] p-2"
          data-testid="world-decoration-artwork-editor">
          <span className="block text-xs font-semibold">Artwork · all linked copies</span>
          {currentAsset && <img src={currentAsset.imageUrl} alt="Selected decoration artwork"
            className="mx-auto h-20 w-full object-contain"/>}
          {currentAsset && <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center text-xs">
            Replace Decoration Artwork
            <input type="file" aria-label="Replace linked decoration artwork" accept="image/png,image/jpeg"
              className="sr-only" disabled={busy} onChange={event => {
                void patchArtwork(currentAsset.id, "imageData", event.target.files?.[0]);
                event.target.value = "";
              }}/>
          </label>}
        </div>
        {currentAsset && <WorldDecorEffectEditor key={props.selected.id}
          imageUrl={currentAsset.imageUrl} effects={props.selected.decorEffects} disabled={busy}
          onChange={effects => void patchSelected({ decorEffects: effects })}/>}
        {currentAsset && <div className="space-y-2 rounded-lg border border-[#b99a4c]/55 bg-[#153523] p-2"
          data-testid="world-decoration-tap-image-editor">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#f5d98e]">Tap Image
              <span className="ml-1 font-normal text-amber-100/70">(optional)</span>
            </span>
            {currentAsset.tapImageUrl && <button type="button" className={danger} disabled={busy}
              onClick={() => void mutate("PATCH", `/assets/${currentAsset.id}`, { tapImageData: null })}>Remove</button>}
          </div>
          {currentAsset.tapImageUrl && <img src={currentAsset.tapImageUrl}
            alt="Current decoration Tap Image" className="mx-auto h-20 w-full object-contain"/>}
          <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center text-xs">
            {currentAsset.tapImageUrl ? "Replace Tap Image" : "Upload Tap Image"}
            <input type="file" aria-label="Edit decoration Tap Image" accept="image/png,image/jpeg"
              className="sr-only" disabled={busy} onChange={event => {
                void patchArtwork(currentAsset.id, "tapImageData", event.target.files?.[0]);
                event.target.value = "";
              }}/>
          </label>
          <p className="text-[11px] text-amber-100/70">
            Alternate artwork changes every linked copy; each copy keeps its own position and size.
          </p>
        </div>}
      </>}
      {!props.activeBuilding && props.selected?.kind === "building" && <div className="space-y-3 rounded-lg border border-[#b99a4c]/55 bg-[#153523] p-2">
        <label className="block space-y-1 text-xs">Building Name
          <input aria-label="Rename world building" value={buildingNameDraft}
            onChange={event => setBuildingNameDraft(event.target.value)} maxLength={80}
            className={field}/>
        </label>
        <button type="button" className={control}
          disabled={busy || !buildingNameDraft.trim() || buildingNameDraft === currentAsset?.name}
          onClick={() => currentAsset && void mutate("PATCH", `/assets/${currentAsset.id}`,
            { name: buildingNameDraft.trim() })}>Save Name</button>
        {currentAsset && <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center text-xs">
          Replace Building Artwork
          <input type="file" aria-label="Replace building artwork" accept="image/png,image/jpeg"
            className="sr-only" disabled={busy} onChange={event => {
              void patchArtwork(currentAsset.id, "imageData", event.target.files?.[0]);
              event.target.value = "";
            }}/>
        </label>}
        {currentAsset && <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center text-xs">
          {currentAsset.interiorImageUrl ? "Replace Interior Background" : "Upload Interior Background (optional)"}
          <input type="file" aria-label="Edit building interior image" accept="image/png,image/jpeg"
            className="sr-only" disabled={busy} onChange={event => {
              void patchArtwork(currentAsset.id, "interiorImageData", event.target.files?.[0]);
              event.target.value = "";
            }}/>
        </label>}
        <label className="flex items-center justify-between rounded-lg border border-[#b99a4c]/55 p-3 text-xs">
          <span>Is Shop · {props.selected.isShop ? "ON" : "OFF"}</span>
          <input type="checkbox" role="switch" aria-label="Is Shop building"
            checked={props.selected.isShop} disabled={busy}
            onChange={event => void patchSelected({ isShop: event.target.checked })}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} onClick={() => props.onEnter(props.selected!.id)}>Enter Building</button>
          {props.selected.isShop && <button type="button" className={control}
            onClick={() => openCreator("shop")}>Shop Setup</button>}
        </div>
      </div>
      {props.activeBuilding && <button type="button" className={control}
        onClick={() => openCreator("selected")}>Edit Interior Object</button>}
    </section>}
    {expanded && <div className="fixed inset-0 z-[90] flex items-end justify-center"
      role="dialog" aria-modal="true"
      aria-label={panel === "library" ? "Add world object" : panel === "effects" ? "Add world effects" : "Edit world object"}>
      <button type="button" aria-label="Close add object" className="absolute inset-0 bg-black/65"
        onClick={() => setExpanded(false)} />
      <section data-testid="world-scene-creator-panel"
        className="relative z-10 flex max-h-[min(78dvh,780px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-amber-500/45 bg-[#10291d] font-fantasy text-amber-100 shadow-2xl"
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 p-4">
          <h2 className="text-base font-semibold tracking-wide text-[#f5cf64]">
            {panel === "library" ? (props.activeBuilding || assetKindFilter === "decor" ? "Decor / Objects" : "Add Building")
              : panel === "effects" ? "World Effects"
              : panel === "selected" ? "Edit " + selectedName
              : panel === "shop" ? "Building Shop Setup"
              : panel === "interior" ? "Building Interior" : "World Tools"}
          </h2>
          <button type="button" aria-label="Close editor" onClick={() => setExpanded(false)}
            className="rounded-full border border-amber-500/35 bg-amber-500/15 px-3 py-2 text-[#f5cf64]">×</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        {panel === "library" && <WorldSceneCreateForm
          key={`${props.worldId}:${props.activeBuilding?.id ?? "world"}:${assetKindFilter ?? "decor"}`}
          worldId={props.worldId}
          kind={props.activeBuilding ? "decor" : (assetKindFilter ?? "decor")}
          buildingId={props.activeBuilding?.id}
          creationPosition={props.placementPoint}
          onCreated={(item, inside) => {
            props.onChanged();
            if (inside) props.onSelectInterior(item.id);
            else props.onSelect(item.id);
            setPanel("selected");
            setExpanded(false);
          }}/>}
        
        {panel === "terrain" && <div className="space-y-2">
          <p className="text-xs">Paint snapped 2.5D dirt, stone, water and garden plots. Tiles save when you lift your finger.</p>
          <button className={control} type="button" onClick={props.onPaint}>Open Terrain Brush</button>
          <p className="text-[11px] text-[#d0c094]">Paint Garden Plot tiles here. Planting and harvesting are player-world features, not editor controls.</p>
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
                Water refill source for the shared watering pail
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

        {panel === "shop" && shopBuilding && <>
          <h3 className={heading}>Building Shop</h3>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={shopBuilding.isShop} disabled={busy}
              onChange={e => void patchShop({ isShop: e.target.checked })} /> Enable shop for future world integration
          </label>
          <input aria-label="Search shared item catalog" value={search} onChange={e => setSearch(e.target.value)}
            className={field} placeholder="Find pets, seeds, tools, items..." />
          <p className="text-[11px] text-[#ceb98c]">Stock references Para Pets' existing item catalog and shared player inventory. Shops aren't public until their worlds are integrated.</p>
          {catalog.isLoading ? <p className="text-xs">Loading items...</p> :
            catalog.isError ? <p className="text-xs">Could not load shared catalog</p> :
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(catalog.data ?? []).map(item => <label key={item.id}
                className="flex items-center gap-2 rounded-md border border-[#5d6f48] p-2 text-[11px]">
                <input type="checkbox" checked={shopBuilding.shopItemIds.includes(item.id)} disabled={busy}
                  onChange={e => {
                    const items = e.target.checked
                      ? [...shopBuilding.shopItemIds, item.id]
                      : shopBuilding.shopItemIds.filter(id => id !== item.id);
                    void patchShop({ shopItemIds: items });
                  }} />
                <span className="truncate">{item.name} <span className="opacity-60">({item.type})</span></span>
              </label>)}
            </div>}
          <p className="text-[11px]">Selected stock: {shopBuilding.shopItemIds.length}</p>
        </>}

        {panel === "interior" && props.activeBuilding && <>
          <h3 className={heading}>Interior for {interiorAsset?.name}</h3>
          {interiorAsset?.interiorImageUrl ? <p className="text-xs">Tap and drag objects over the room artwork. Decorations and effects save only in this building.</p> :
            <p className="text-xs text-[#f4caa6]">Select the building in the world, then upload its Interior Background before decorating.</p>}
          <p className="text-xs">Objects: {props.scene.interiorItems.filter(item => item.buildingId === props.activeBuilding?.id).length} / 120</p>
          <div className="grid grid-cols-2 gap-1">
            {props.scene.interiorItems.filter(item => item.buildingId === props.activeBuilding?.id).map(item => <button key={item.id} className={control}
              onClick={() => { props.onSelectInterior(item.id); setPanel("selected"); }}>{item.kind} · {item.size}</button>)}
          </div>
        </>}
        </div>
      </section>
    </div>}
  </>;
}
