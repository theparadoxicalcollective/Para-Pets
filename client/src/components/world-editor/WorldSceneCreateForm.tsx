import { useState } from "react";
import { Image, Minus, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readPetParkImageData } from "@/lib/petParkImageData";
import WorldDecorEffectEditor from "./WorldDecorEffectEditor";
import type { ParkDecorEffect } from "@shared/petParkDecorEffects";
import type { WorldSceneInteriorItem, WorldScenePlacement } from "@shared/worlds/worldSceneContent";

type Props = {
  worldId: string;
  kind: "building" | "decor";
  creationPosition: { xPct: number; yPct: number };
  /** Interior decor uses the same artwork form but saves inside its building. */
  buildingId?: string;
  onCreated: (item: WorldScenePlacement | WorldSceneInteriorItem, inside: boolean) => void;
};

/**
 * Pet Park-style building/decor creation forms, with independent world-scoped saves.
 * Artwork is an internal per-world asset; the admin creates and places it in one
 * action instead of managing a separate library before the first placement.
 */
export default function WorldSceneCreateForm({
  worldId, kind, creationPosition, buildingId, onCreated,
}: Props) {
  const { toast } = useToast();
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState("Decoration");
  const [tapImage, setTapImage] = useState<string | null>(null);
  const [interiorImage, setInteriorImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [size, setSize] = useState(kind === "building" ? 300 : 100);
  const [isShop, setIsShop] = useState(false);
  const [waterSource, setWaterSource] = useState(false);
  const [effects, setEffects] = useState<ParkDecorEffect[]>([]);
  const [saving, setSaving] = useState(false);
  const isBuilding = kind === "building";
  const inside = !!buildingId;
  const border = "border-[#b99a4c]/50";
  const card = "space-y-2 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3";
  const picker = "block cursor-pointer rounded-xl border border-dashed border-[#b99a4c]/60 bg-[#1a4029]/85 px-4 py-4 text-center text-sm";
  const safeFileName = (file: File) =>
    file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Decoration";

  const choose = async (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return;
    try { setter(await readPetParkImageData(file)); }
    catch (error) {
      toast({ title: "Could not read artwork", description: String(error), variant: "destructive" });
    }
  };

  const create = async () => {
    if (!pendingImage || saving || (isBuilding && !name.trim())) return;
    setSaving(true);
    const root = `/api/admin/world-editor/${worldId}`;
    let createdAssetId: string | null = null;
    try {
      const assetResponse = await apiRequest("POST", root + "/assets", {
        kind, name: isBuilding ? name.trim() : pendingFileName,
        imageData: pendingImage, tapImageData: tapImage,
        interiorImageData: isBuilding ? interiorImage : null,
      });
      const asset = await assetResponse.json() as { id: string };
      createdAssetId = asset.id;
      const insidePayload = inside ? {
        kind: "decor", buildingId, assetId: asset.id, effectType: null,
        xPct: 0.5, yPct: 0.5, size, flipped: false,
      } : {
        kind, assetId: asset.id, effectType: null,
        xPct: creationPosition.xPct, yPct: creationPosition.yPct,
        size, flipped: false, layer: 0, decorEffects: effects,
        isWaterSource: isBuilding ? false : waterSource,
        isShop: isBuilding ? isShop : false, shopItemIds: [],
      };
      const placementResponse = await apiRequest("POST", root + (inside ? "/interior-items" : "/placements"), insidePayload);
      const placed = await placementResponse.json() as WorldScenePlacement | WorldSceneInteriorItem;
      onCreated(placed, inside);
      toast({ title: isBuilding ? "Building added" : "Decoration added" });
    } catch (error) {
      // If placement fails, do not leave unused artwork in this world's library.
      if (createdAssetId) {
        try { await apiRequest("DELETE", root + "/assets/" + createdAssetId); }
        catch { /* Keep original error; admin can retry without lost placements. */ }
      }
      toast({ title: "Could not add world object", description: String(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <section aria-label={isBuilding ? "Add World Building" : "Add World Decoration"}
    className="space-y-4 text-amber-100">
    {pendingImage ? <div aria-label="New world artwork preview"
      className={`relative flex h-40 items-center justify-center overflow-hidden rounded-xl border bg-[#263e29] ${border}`}>
      <img src={pendingImage} alt={isBuilding ? "New building preview" : "New decoration preview"}
        draggable={false} className="h-full max-w-full object-contain drop-shadow-lg"
        style={!isBuilding ? { width: Math.min(180, Math.max(42, size * 0.7)) } : undefined} />
      <span className="absolute bottom-1 left-3 text-[10px] text-amber-100/80">
        Starting size · {size} world units
      </span>
      <button type="button" aria-label="Clear new artwork" onClick={() => setPendingImage(null)}
        className="absolute right-2 top-2 rounded-full bg-black/80 p-2"><X size={16}/></button>
    </div> : <label className={picker}>
      <Image size={16} className="mr-2 inline"/>
      {isBuilding ? "Upload Building Image (PNG/JPEG)" : "Upload Image (PNG/JPEG)"}
      <input type="file" accept="image/png,image/jpeg" className="sr-only"
        aria-label={isBuilding ? "Building exterior image" : "Scene item artwork"}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file && !isBuilding) setPendingFileName(safeFileName(file));
          void choose(file, setPendingImage);
          event.target.value = "";
        }}/>
    </label>}

    {isBuilding && <>
      <label className="block space-y-1 text-sm">Building Name
        <input aria-label="Building name" placeholder="e.g. Woodland Cottage"
          maxLength={80} value={name} onChange={event => setName(event.target.value)}
          className={`w-full rounded-xl border bg-[#10291d] p-3 placeholder:text-amber-100/45 ${border}`}/>
      </label>
      <div className={card}>
        <label htmlFor="world-building-starting-size" className="flex justify-between gap-2 text-sm">
          <span>Starting building size</span><strong>{size} world units</strong>
        </label>
        <input id="world-building-starting-size" aria-label="Building starting size"
          type="range" min={120} max={700} step={20} value={size}
          onChange={event => setSize(Number(event.target.value))}
          className="w-full accent-[#d6b66e]"/>
        <p className="text-[11px] text-amber-100/65">
          Larger starting size helps the artwork match the world. Adjust individual sizes after placing.
        </p>
      </div>
      <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${isShop ? "border-[#e0bf76] bg-[#28543a]" : "border-[#b99a4c]/50 bg-[#173b2a]/85"}`}>
        <span className="flex flex-col gap-1"><strong>Is Shop</strong>
          <span className="text-xs text-[#f3dbad]" role="status">
            {isShop ? "ON · New building will be a shop" : "OFF · Regular building"}
          </span>
        </span>
        <span className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border-2 p-1 ${isShop ? "border-[#e5c66a] bg-[#47734b]" : "border-[#887552] bg-[#253529]"}`}>
          <input type="checkbox" role="switch" aria-label="Is Shop building"
            checked={isShop} onChange={event => setIsShop(event.target.checked)}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"/>
          <span aria-hidden="true" className={`pointer-events-none h-5 w-5 rounded-full bg-[#f5dfad] shadow-sm transition-transform ${isShop ? "translate-x-6" : "translate-x-0"}`}/>
        </span>
      </label>
      <p className="text-[11px] text-amber-100/70">
        After creating a shop, enter its interior to choose merchandise.
      </p>
      <label className={picker}>
        {interiorImage ? "Interior image selected — tap to replace" : "Interior Background (optional)"}
        <input aria-label="Building interior image" type="file" accept="image/png,image/jpeg"
          className="mt-2 block w-full text-xs"
          onChange={event => { void choose(event.target.files?.[0], setInteriorImage); event.target.value = ""; }}/>
      </label>
      {interiorImage && <img src={interiorImage} alt="Interior background preview"
        className="mx-auto h-28 max-w-full object-contain"/>}
    </>}

    {!isBuilding && <>
      <div className={card}>
        <strong className="block text-sm text-[#f5d98e]">Tap Image
          <span className="ml-1 text-[11px] font-normal text-amber-100/70">(optional)</span>
        </strong>
        <p className="text-[11px] text-amber-100/75">
          Alternate decoration artwork, for example an opened gate.
        </p>
        {tapImage && <div className="relative flex h-28 items-center justify-center rounded-lg border border-[#c9a65e]/40 bg-[#0b2418] p-2">
          <img src={tapImage} alt="Tap image preview" className="h-full w-full object-contain"/>
          <button type="button" aria-label="Remove Tap Image"
            onClick={() => setTapImage(null)} className="absolute right-1 top-1 rounded-full border border-[#c9a65e]/50 bg-[#153521] p-2">
            <X size={16}/>
          </button>
        </div>}
        <label className={picker}>
          <Image size={15} className="mr-1 inline"/>
          {tapImage ? "Replace Tap Image" : "Upload Tap Image (PNG/JPEG)"}
          <input aria-label="Decoration Tap Image" type="file" accept="image/png,image/jpeg"
            className="sr-only" onChange={event => { void choose(event.target.files?.[0], setTapImage); event.target.value = ""; }}/>
        </label>
      </div>
      {!inside && <WorldDecorEffectEditor imageUrl={pendingImage} effects={effects}
        onChange={setEffects} disabled={saving}/>}
      <div className="space-y-2 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3">
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="world-decor-starting-size">Starting size</label>
          <strong>{size} world units</strong>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Decrease world item size" disabled={size <= 40}
            onClick={() => setSize(value => Math.max(40, value - 10))}
            className={`rounded-xl border p-2 disabled:opacity-40 ${border}`}><Minus size={17}/></button>
          <input id="world-decor-starting-size" aria-label="Decoration starting size"
            type="range" min={40} max={500} step={10} value={size}
            onChange={event => setSize(Number(event.target.value))}
            className="min-w-0 flex-1 accent-[#d6b66e]"/>
          <button type="button" aria-label="Increase world item size" disabled={size >= 500}
            onClick={() => setSize(value => Math.min(500, value + 10))}
            className={`rounded-xl border p-2 disabled:opacity-40 ${border}`}><Plus size={17}/></button>
        </div>
        <p className="text-[11px] text-amber-100/60">
          Size is saved when the object is placed. Depth follows ground position automatically.
        </p>
      </div>
      {!inside && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#b99a4c]/50 bg-[#173b2a]/85 p-3 text-xs text-[#f4d795]">
        <input aria-label="Water Source" type="checkbox" checked={waterSource}
          onChange={event => setWaterSource(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#d8bc67]"/>
        <span><strong className="block text-sm">Water Source</strong>
          <span className="block text-[11px] text-amber-100/75">
            Allow refillable garden tools to collect water from this decoration.
          </span>
        </span>
      </label>}
    </>}

    <button type="button" disabled={saving || !pendingImage || (isBuilding && !name.trim())}
      data-testid={isBuilding ? "button-create-world-building" : "button-create-world-decoration"}
      className="w-full rounded-xl border border-[#b99a4c]/60 bg-[#1a4029]/85 py-3 text-sm font-semibold text-[#f5d98e] disabled:opacity-35"
      onClick={() => void create()}>
      {saving ? "Adding…" : isBuilding ? "Add Building" : "Add Decoration"}
    </button>
  </section>;
}
