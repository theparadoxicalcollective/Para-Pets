import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readPetParkImageData } from "@/lib/petParkImageData";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { PARK_WATER_EFFECT_OPTIONS, PARK_FIREFLIES_OPTION, DEFAULT_PARK_LIGHT_COLOR } from "@shared/petParkEffects";
import WorldDecorEffectEditor from "./WorldDecorEffectEditor";
import WorldSceneCreateForm from "./WorldSceneCreateForm";
import WorldLegacyPagePicker from "./WorldLegacyPagePicker";
import { useWorldNpcCatalog, type WorldNpcCatalogEntry } from "./WorldNpcCatalog";
import type {
  WorldSceneContent, WorldSceneInteriorItem, WorldScenePlacement,
} from "@shared/worlds/worldSceneContent";
import type { ParkEffectType } from "@shared/petParkEffects";

type Panel = "library" | "effects" | "selected" | "terrain" | "shop" | "interior" | "npc";
const EFFECT_CHOICES: Array<{
  type: ParkEffectType; label: string; description: string; size: number; group: "outdoor" | "water";
}> = [
  ...HOME_OUTDOOR_EFFECT_OPTIONS.filter(o => o.type !== "sleep").map(o => ({
    type: o.type, label: o.label, description: o.description,
    size: Math.max(60, o.defaultSize * 6), group: "outdoor" as const,
  })),
  { ...PARK_FIREFLIES_OPTION, size: PARK_FIREFLIES_OPTION.defaultSize, group: "outdoor" as const },
  ...PARK_WATER_EFFECT_OPTIONS.map(o => ({
    type: o.type, label: o.label, description: o.description,
    size: o.defaultSize, group: "water" as const,
  })),
];

type Props = {
  worldId: string; scene: WorldSceneContent;
  selected: WorldScenePlacement | null;
  selectedInterior: WorldSceneInteriorItem | null;
  activeBuilding: WorldScenePlacement | null;
  placementPoint: { xPct: number; yPct: number };
  interiorDarkness: number;
  interiorPreviewClock: "live" | "day" | "night";
  onInteriorPreviewClockChange: (value: "live" | "day" | "night") => void;
  darknessSaving: boolean;
  onInteriorDarknessChange: (value: number) => void;
  onInteriorDarknessCommit: () => void;
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
  // Keep the new legacy page choice visible immediately while the admin
  // PATCH and React Query scene refresh complete. Roll back on a failed save.
  const [legacyChoice, setLegacyChoice] = useState<{
    buildingId: string; pageId: string | null;
  } | null>(null);
  const [lampLightColor, setColoredLightColor] = useState(DEFAULT_PARK_LIGHT_COLOR);
  const [expanded, setExpanded] = useState(false);
  const [assetKindFilter, setAssetKindFilter] = useState<"decor" | "building" | null>(null);
  const root = `/api/admin/world-editor/${props.worldId}`;
  const npcCatalog = useWorldNpcCatalog(!props.activeBuilding);

  useEffect(() => {
    setPanel("library");
    setExpanded(false);
    setAssetKindFilter(null);
  }, [props.worldId]);
  useEffect(() => {
    setPanel(props.activeBuilding ? "interior" : "library");
  }, [props.activeBuilding?.id]);

  const currentAsset = props.scene.assets.find(asset => asset.id === props.selected?.assetId);
  const interiorAsset = props.scene.assets.find(asset => asset.id === props.activeBuilding?.assetId);
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
      kind, assetId, effectType, effectColor: (effectType === "colored_light" || effectType === "lamp_light") ? lampLightColor : null,
      xPct: props.placementPoint.xPct, yPct: props.placementPoint.yPct,
      size, flipped: false, layer: 0, decorEffects: [], isWaterSource: false, isShop: false, shopItemIds: [],
    }) as WorldScenePlacement | null;
    if (result) { props.onSelect(result.id); setPanel("selected"); setExpanded(false); }
  };
  const addNpc = async (npc: WorldNpcCatalogEntry) => {
    const result = await mutate("POST", "/placements", {
      kind: "npc", npcId: npc.id, assetId: null, effectType: null,
      xPct: props.placementPoint.xPct, yPct: props.placementPoint.yPct,
      size: 130, flipped: false, layer: 0, decorEffects: [],
      isWaterSource: false, isShop: false, shopItemIds: [],
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
  const selectedLegacyPage = legacyChoice && legacyChoice.buildingId === props.selected?.id
    ? legacyChoice.pageId : props.selected?.legacyLocationId ?? null;
  useEffect(() => {
    if (!legacyChoice) return;
    if (props.selected?.id !== legacyChoice.buildingId ||
        props.selected?.legacyLocationId === legacyChoice.pageId)
      setLegacyChoice(null);
  }, [props.selected?.id, props.selected?.legacyLocationId, legacyChoice]);
  const patchLegacyPage = async (id: string | null) => {
    if (!props.selected || props.selected.kind !== "building") return;
    const buildingId = props.selected.id;
    setLegacyChoice({ buildingId, pageId: id });
    const changed = await mutate("PATCH", `/placements/${buildingId}`, {
      legacyLocationId: id,
    });
    if (!changed) setLegacyChoice(null);
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
  const patchArtwork = async (assetId: string, name: "imageData" | "tapImageData" | "interiorImageData" | "nightInteriorImageData",
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
  const selectedNpc = props.selected?.npcId ? npcCatalog.data?.find(n => n.id === props.selected?.npcId) : null;
  const selectedName = props.activeBuilding
    ? props.scene.assets.find(asset => asset.id === props.selectedInterior?.assetId)?.name ??
      props.selectedInterior?.effectType?.replaceAll("_", " ") ?? "Interior object"
    : props.scene.assets.find(asset => asset.id === props.selected?.assetId)?.name ??
      selectedNpc?.name ?? props.selected?.effectType?.replaceAll("_", " ") ?? "World object";
  const quickButton = "min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#10291d]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg disabled:opacity-40";
  const quickAccent = "min-h-12 rounded-xl border border-[#b99a4c]/65 bg-[#20442e]/95 px-2 py-2 text-xs font-semibold text-[#f5d77b] shadow-lg disabled:opacity-40";
  const quickDanger = "min-h-12 rounded-xl border border-[#be8d62]/65 bg-[#463028]/95 px-2 py-2 text-xs font-semibold text-[#f9d6a6] shadow-lg disabled:opacity-40";

  return <>
    {!expanded && !selectedItem && <div
      data-testid="world-scene-controls" aria-label="World editing toolbar"
      className="pointer-events-auto absolute inset-x-3 z-30 mx-auto grid max-w-lg grid-cols-3 gap-1.5"
      style={{ bottom: "max(64px, env(safe-area-inset-bottom, 0px))" }}
      onPointerDown={event => event.stopPropagation()}>
      {props.activeBuilding ? <>
        <div className="col-span-3 flex flex-col gap-1 rounded-lg border border-[#b99a4c]/45 bg-[#153523] px-3 py-2 text-xs sm:col-span-5">
          <span className="flex justify-between text-[#f0d69d]">
            <span>Interior darkness</span><span className="tabular-nums">{props.interiorDarkness}%</span>
          </span>
          <input type="range" min={0} max={90} step={5}
            data-testid="world-editor-interior-darkness-slider"
            aria-label="Interior darkness"
            value={props.interiorDarkness} disabled={props.darknessSaving}
            onChange={event => props.onInteriorDarknessChange(Number(event.currentTarget.value))}
            onPointerUp={props.onInteriorDarknessCommit}
            onPointerCancel={props.onInteriorDarknessCommit}
            onKeyUp={event => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key))
                props.onInteriorDarknessCommit();
            }}
            onBlur={props.onInteriorDarknessCommit}
            className="w-full accent-[#dcb970]" />
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#f0d69d]">
            <span className="mr-auto">Preview</span>
            {(["live", "day", "night"] as const).map(mode => <button key={mode} type="button"
              aria-label={`Preview ${mode} world interior lighting`} aria-pressed={props.interiorPreviewClock === mode}
              onClick={() => props.onInteriorPreviewClockChange(mode)}
              className={`rounded border px-2 py-1 capitalize ${props.interiorPreviewClock === mode
                ? "border-[#f5cf64] bg-[#245037]" : "border-[#b99a4c]/40 bg-[#112c20]"}`}>{mode}</button>)}
          </span>
        </div>
        <button type="button" className={quickButton} onClick={() => openCreator("library", "decor")}>+ Decor</button>
        <button type="button" className={quickButton} onClick={() => openCreator("effects")}>+ Effects</button>
        <button type="button" className={quickButton} onClick={() => openCreator("shop")}>Shop Setup</button>
        <button type="button" className={quickAccent} onClick={props.onExit}>Exit Interior</button>
      </> : <>
        <button type="button" className={quickButton} onClick={() => openCreator("library", "building")}>+ Building</button>
        <button type="button" className={quickButton} onClick={() => openCreator("npc")}>+ NPC</button>
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
      data-testid="world-scene-selected-controls" aria-label="Move selected world object"
      className="pointer-events-auto absolute inset-x-3 z-30 mx-auto flex max-w-sm flex-col gap-2 rounded-xl border border-[#b99a4c]/75 bg-[#10291d]/95 p-2 text-[#f5d77b] shadow-xl"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      onPointerDown={event => event.stopPropagation()}>
      <div className="flex items-center gap-2">
        <strong className="min-w-0 flex-1 truncate text-xs capitalize">{selectedName}</strong>
        <span className="shrink-0 text-[11px] tabular-nums text-amber-100/80">Size {selectedItem.size}</span>
        <button type="button" aria-label="Deselect world object" className={control}
          onClick={() => props.activeBuilding ? props.onSelectInterior(null) : props.onSelect(null)}>Done</button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" aria-label="Decrease selected object size" className={control}
          disabled={busy || selectedItem.size <= 1}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ size: Math.max(1, selectedItem.size - 20) })
            : patchSelected({ size: Math.max(1, selectedItem.size - 20) }))}>− Size</button>
        <button type="button" aria-label="Increase selected object size" className={control}
          disabled={busy || selectedItem.size >= 1000}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ size: Math.min(1000, selectedItem.size + 20) })
            : patchSelected({ size: Math.min(1000, selectedItem.size + 20) }))}>+ Size</button>
        <button type="button" className={control} disabled={busy}
          onClick={() => void (props.activeBuilding
            ? patchInterior({ flipped: !selectedItem.flipped })
            : patchSelected({ flipped: !selectedItem.flipped }))}>Flip</button>
        <button type="button" className={quickAccent}
          aria-label="Edit selected object details" onClick={() => openCreator("selected")}>Edit</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!props.activeBuilding && props.selected?.kind === "decor" &&
          <button type="button" aria-label="Duplicate world decoration"
            className={control} disabled={busy}
            onClick={() => void duplicateSelected()}>Duplicate</button>}
        {!props.activeBuilding && props.selected?.kind === "building" &&
          <button type="button" className={control}
            onClick={() => props.onEnter(props.selected!.id)}>Enter Building</button>}
        <button type="button" className={danger} disabled={busy}
          onClick={() => void (props.activeBuilding ? removeInterior() : removeSelected())}>Remove</button>
        {!props.activeBuilding && props.selected?.kind === "building" &&
          <WorldLegacyPagePicker compact worldId={props.worldId}
            value={selectedLegacyPage}
            onChange={id => { void patchLegacyPage(id); }}
            disabled={busy} />}
        {props.selected?.kind !== "building" && <span className="ml-auto self-center text-[10px] text-amber-100/65">
          {props.activeBuilding ? "Drag selected artwork to move"
            : "Drag selected artwork to move · swipe background to pan"}
        </span>}
      </div>
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
              : panel === "npc" ? "Add NPC"
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
        
        {panel === "npc" && !props.activeBuilding && <section
          data-testid="world-editor-npc-picker" className="space-y-3">
          <p className="text-xs text-amber-100/75">
            Choose an NPC already created in Admin → NPCs. Artwork, dialogue,
            and quest settings stay linked to the original NPC. This world
            remains a private draft until published.
          </p>
          {npcCatalog.isLoading ? <p className="text-xs">Loading NPCs…</p>
            : npcCatalog.isError ? <p className="text-xs text-red-200">Could not load saved NPCs.</p>
            : !npcCatalog.data?.length
              ? <p className="text-xs">No saved NPCs. Create one in Admin → NPCs first.</p>
              : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {npcCatalog.data.map(npc => <button type="button" key={npc.id}
                  data-testid={`button-place-world-npc-${npc.id}`}
                  aria-label={`Place NPC ${npc.name}`} disabled={busy}
                  onClick={() => void addNpc(npc)}
                  className="flex min-h-36 flex-col items-center gap-2 rounded-xl border border-[#b99a4c]/60 bg-[#173726] p-3 text-center text-xs disabled:opacity-40">
                  <img src={npc.imageUrl!} alt="" className="h-24 w-full object-contain" draggable={false}/>
                  <span className="break-words text-[#f5d77b]">{npc.name}</span>
                </button>)}
              </div>}
        </section>}

        {panel === "terrain" && <div className="space-y-2">
          <p className="text-xs">Paint snapped 2.5D dirt, stone, water and garden plots. Tiles save when you lift your finger.</p>
          <button className={control} type="button" onClick={props.onPaint}>Open Terrain Brush</button>
          <p className="text-[11px] text-[#d0c094]">Paint Garden Plot tiles here. Planting and harvesting are player-world features, not editor controls.</p>
        </div>}

        {panel === "effects" && <section aria-label="World outdoor effects" className="space-y-3">
          <div className="text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">
            Outdoor Effects
          </div>
          {!props.activeBuilding && <label className="flex items-center justify-between gap-3 rounded-xl border border-[#b99a4c]/55 p-3 text-xs">
            Lamp Light color
            <input type="color" aria-label="New world lamp light color"
              data-testid="world-standalone-light-color" value={lampLightColor}
              onChange={event => setColoredLightColor(event.target.value)}
              className="h-9 w-14 rounded border border-[#b99a4c]/60 bg-transparent"/>
          </label>}
          <div className="grid grid-cols-2 gap-2">
            {EFFECT_CHOICES.filter(effect => effect.group === "outdoor" &&
              (!props.activeBuilding || effect.type !== "fireflies")).map(effect =>
              <button key={effect.type} type="button"
                data-testid={`add-world-effect-${effect.type}`} disabled={busy}
                onClick={() => props.activeBuilding
                  ? void addInside("effect", null, effect.type, effect.size)
                  : void add("effect", null, effect.type, effect.size)}
                className="min-h-20 rounded-xl border border-[#b99a4c]/50 bg-[#1a4029]/85 p-3 text-left transition-transform active:scale-95 disabled:opacity-40">
                <span className="block text-sm text-[#f5cf64]">{effect.label}</span>
                <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">
                  {effect.description}
                </span>
              </button>)}
          </div>
          <div className="pt-2 text-center text-xs uppercase tracking-[0.2em] text-[#f5cf64]">
            Water Effects
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EFFECT_CHOICES.filter(effect => effect.group === "water").map(effect =>
              <button key={effect.type} type="button"
                data-testid={`add-world-effect-${effect.type}`} disabled={busy}
                onClick={() => props.activeBuilding
                  ? void addInside("effect", null, effect.type, effect.size)
                  : void add("effect", null, effect.type, effect.size)}
                className="min-h-20 rounded-xl border border-[#b99a4c]/50 bg-[#1a4029]/85 p-3 text-left transition-transform active:scale-95 disabled:opacity-40">
                <span className="block text-sm text-[#f5cf64]">{effect.label}</span>
                <span className="mt-1 block text-[11px] leading-snug text-[#bd9d50]">
                  {effect.description}
                </span>
              </button>)}
          </div>
          <p className="text-center text-xs text-amber-100/60">
            Tap to place, then drag the selected effect to move it.
          </p>
        </section>}

        {panel === "selected" && <div className="space-y-3" data-testid="world-scene-details-panel">
          {props.selected?.kind === "npc" && <p className="rounded-lg border border-[#b99a4c]/50 p-3 text-xs">
            NPC: {selectedNpc?.name ?? "Loading NPC"} · Artwork and dialogue are shared with
            Admin → NPCs. This placement has its own position, size and flip.
          </p>}
          {props.selected?.kind === "effect" && (props.selected.effectType === "colored_light" || props.selected.effectType === "lamp_light") &&
            <label className="flex items-center justify-between gap-3 rounded-lg border border-[#b99a4c]/55 p-2 text-xs">
              Lamp Light color
              <input type="color" aria-label="Edit world lamp light color"
                value={props.selected.effectColor ?? DEFAULT_PARK_LIGHT_COLOR}
                disabled={busy}
                onChange={event => void patchSelected({ effectColor: event.target.value })}
                className="h-9 w-14 rounded border border-[#b99a4c]/60 bg-transparent"/>
            </label>}
          {!selectedItem ? <p className="text-xs">Select an object to edit its artwork and settings.</p> : <>
            <p className="text-[11px] text-amber-100/75">
              Close this panel to move the selected object. Size, flip and duplicate stay available on the scene.
            </p>
      {!props.activeBuilding && props.selected?.kind === "decor" && <>
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
        <WorldLegacyPagePicker worldId={props.worldId}
          value={selectedLegacyPage}
          onChange={id => { void patchLegacyPage(id); }}
          disabled={busy} preview />
        {currentAsset && <section className="space-y-2">
          <p className="text-xs font-semibold text-amber-200">Exterior building lights & effects</p>
          <p className="text-[11px] text-amber-100/65">Facade lamps follow the outdoor day/night cycle and move with the building.</p>
          <WorldDecorEffectEditor key={props.selected.id} imageUrl={currentAsset.imageUrl}
            effects={props.selected.decorEffects} disabled={busy}
            onChange={effects => void patchSelected({ decorEffects: effects })}/>
        </section>}
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
          {currentAsset.interiorImageUrl ? "Replace Daytime Interior Background" : "Upload Daytime Interior Background"}
          <input type="file" aria-label="Edit building interior image" accept="image/png,image/jpeg"
            className="sr-only" disabled={busy} onChange={event => {
              void patchArtwork(currentAsset.id, "interiorImageData", event.target.files?.[0]);
              event.target.value = "";
            }}/>
        </label>}
        {currentAsset && <div className="space-y-2 rounded-lg border border-[#b99a4c]/50 p-2 text-xs">
          <label className="block cursor-pointer rounded-lg border border-dashed border-[#b99a4c]/65 bg-[#245037] p-2 text-center">
            {currentAsset.nightInteriorImageUrl ? "Replace Nighttime Interior Background" : "Upload Nighttime Interior Background (optional)"}
            <input type="file" aria-label="Upload world nighttime interior image" accept="image/png,image/jpeg"
              className="sr-only" disabled={busy} onChange={event => {
                void patchArtwork(currentAsset.id, "nightInteriorImageData", event.target.files?.[0]);
                event.target.value = "";
              }}/>
          </label>
          {currentAsset.nightInteriorImageUrl && <button type="button" className={control}
            aria-label="Remove world nighttime interior image" disabled={busy}
            onClick={() => void mutate("PATCH", `/assets/${currentAsset.id}`, { nightInteriorImageData: null })}>
            Remove nighttime image
          </button>}
        </div>}
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
      </div>}
            {props.activeBuilding && <p className="text-xs text-amber-100/80">
              Use the on-scene controls to move, resize or flip this interior object.
            </p>}
          </>}
        </div>}

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
