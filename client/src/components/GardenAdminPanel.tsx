import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sprout, Droplets, Scissors, Shovel, X, Pencil, Move } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GARDEN_IMAGE_KEYS, GARDEN_PHASES, GARDEN_TOOL_OPTIONS, GARDEN_WATER_CAPACITY, type GardenImageKey, type GardenToolKind, type GardenStagePlacements } from "@shared/garden";
import GardenStagePlacementEditor from "@/components/GardenStagePlacementEditor";

type CatalogItem = { id: string; name: string; description: string | null; imageUrl: string | null; price: number; specialType?: string | null; isRefillable?: boolean };
type GardenCrop = {
  id: string; seedItem: CatalogItem | null; fruitItem: CatalogItem | null; ready: boolean;
  plantedImageUrl: string | null; seedlingImageUrl: string | null;
  partialImageUrl: string | null; grownImageUrl: string | null; pickedImageUrl: string | null;
  plantedDrops: number; seedlingDrops: number; partialDrops: number; grownDrops: number;
  stagePlacements: GardenStagePlacements;
};
type Catalog = { tools: CatalogItem[]; crops: GardenCrop[] };
type CropDraft = {
  name: string; description: string; fruitName: string; price: string;
  plantedDrops: string; seedlingDrops: string; partialDrops: string; grownDrops: string;
};
type FormSelection = { kind: "tool"; type: GardenToolKind } | { kind: "crop"; crop?: GardenCrop };
const initialDraft: CropDraft = {
  name: "", description: "", fruitName: "", price: "0",
  plantedDrops: "10", seedlingDrops: "10", partialDrops: "10", grownDrops: "10",
};
const inputs = "w-full rounded-lg border border-[#bba061]/55 bg-[#10271b]/95 px-3 py-2 text-sm text-[#fae4ad] outline-none focus:border-[#e4c878]";

function ImageSlot({ label, image, onFile, required = false }: {
  label: string; image: string | null; required?: boolean; onFile: (file: File) => void;
}) {
  return <label className="flex min-h-[94px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#bca165]/70 bg-[#0c2217]/75 p-2 text-center text-[#ebce8a] active:bg-[#20432c]">
    {image ? <img src={image} alt="" className="h-12 w-16 object-contain" draggable={false} />
      : <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#bd9c59]/70 bg-[#294531]"><Plus size={20} /></span>}
    <span className="text-[11px] font-semibold">{image ? "Replace" : "+ Add"} {label}{required ? " *" : ""}</span>
    <input aria-label={`Upload ${label}`} type="file" accept="image/png,image/webp,image/jpeg"
      className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
  </label>;
}
async function readImage(file: File): Promise<string> {
  if (!["image/png", "image/webp", "image/jpeg"].includes(file.type) || file.size > 5_500_000)
    throw new Error("Use PNG, WebP or JPEG images under 5.5 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image upload failed"));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

export default function GardenAdminPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Catalog>({ queryKey: ["/api/admin/garden"] });
  const [form, setForm] = useState<FormSelection | null>(null);
  const [stageEditorOpen, setStageEditorOpen] = useState(false);
  const [draft, setDraft] = useState<CropDraft>({ ...initialDraft });
  const [images, setImages] = useState<Partial<Record<GardenImageKey, string>>>({});
  const [toolName, setToolName] = useState("");
  const [toolPrice, setToolPrice] = useState("0");
  const [toolRefillable, setToolRefillable] = useState(true);
  const [updatingToolId, setUpdatingToolId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openCrop = (crop?: GardenCrop) => {
    setForm({ kind: "crop", crop });
    setImages({});
    setDraft(crop ? {
      name: crop.seedItem?.name ?? "", description: crop.seedItem?.description ?? "",
      fruitName: crop.fruitItem?.name ?? "", price: String(crop.seedItem?.price ?? 0),
      plantedDrops: String(crop.plantedDrops), seedlingDrops: String(crop.seedlingDrops),
      partialDrops: String(crop.partialDrops), grownDrops: String(crop.grownDrops),
    } : { ...initialDraft });
  };
  const openTool = (kind: GardenToolKind) => {
    const option = GARDEN_TOOL_OPTIONS.find(item => item.key === kind)!;
    setForm({ kind: "tool", type: kind }); setToolName(option.label);
    setToolPrice("0"); setImages({});
    setToolRefillable(kind === "watering_pail");
  };
  const setImage = async (key: GardenImageKey, file: File) => {
    try {
      const content = await readImage(file);
      setImages(current => ({ ...current, [key]: content }));
    } catch (error) {
      toast({ title: "Image could not be added", description: String(error), variant: "destructive" });
    }
  };
  const preview = (key: GardenImageKey): string | null => {
    if (images[key]) return images[key]!;
    if (form?.kind !== "crop" || !form.crop) return null;
    if (key === "seedPack") return form.crop.seedItem?.imageUrl ?? null;
    if (key === "fruit") return form.crop.fruitItem?.imageUrl ?? null;
    return form.crop[(key + "ImageUrl") as keyof GardenCrop] as string | null;
  };
  const toggleRefillable = async (item: CatalogItem) => {
    if (updatingToolId) return;
    setUpdatingToolId(item.id);
    try {
      await apiRequest("PATCH", `/api/admin/garden/tools/${item.id}/refillable`,
        { isRefillable: !item.isRefillable });
      await qc.invalidateQueries({ queryKey: ["/api/admin/garden"] });
    } catch (error) {
      toast({ title: "Refillable setting was not changed", description: String(error), variant: "destructive" });
    } finally {
      setUpdatingToolId(null);
    }
  };
  const submit = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      if (form.kind === "tool") {
        if (!images.seedPack) throw new Error("Upload a tool image.");
        const price = Number(toolPrice);
        if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000) throw new Error("Enter a valid tool price.");
        await apiRequest("POST", "/api/admin/garden/tools", {
          kind: form.type, name: toolName.trim(), price, imageData: images.seedPack,
          isRefillable: toolRefillable,
        });
      } else {
        const price = Number(draft.price);
        const drops = GARDEN_PHASES.filter(phase => phase.key !== "picked")
          .map(phase => Number(draft[(phase.key + "Drops") as keyof CropDraft]));
        if (!draft.name.trim() || !draft.fruitName.trim()) throw new Error("Name the seed and its harvested fruit.");
        if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000 ||
            drops.some(value => !Number.isSafeInteger(value) || value < 1 || value > 1000))
          throw new Error("Enter valid prices and 1–1000 drops per growing stage.");
        if (!form.crop && (!images.seedPack || !images.fruit))
          throw new Error("Add the seed pack and fruit inventory images first.");
        const payload: Record<string, unknown> = {
          ...draft, price,
          plantedDrops: drops[0], seedlingDrops: drops[1],
          partialDrops: drops[2], grownDrops: drops[3],
          ...Object.fromEntries(Object.entries(images).map(([key, value]) => [key + "ImageData", value])),
        };
        await apiRequest(form.crop ? "PATCH" : "POST",
          form.crop ? `/api/admin/garden/crops/${form.crop.id}` : "/api/admin/garden/crops", payload);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/admin/garden"] }),
        qc.invalidateQueries({ queryKey: ["/api/admin/shop-items-all"] }),
      ]);
      toast({ title: "Garden item saved" });
      setForm(null); setImages({});
    } catch (error) {
      toast({ title: "Garden item was not saved", description: String(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (stageEditorOpen) return <GardenStagePlacementEditor crops={data?.crops ?? []}
    onBack={() => setStageEditorOpen(false)} />;

  return <section data-testid="garden-admin-section" className="space-y-4 pb-16 font-fantasy text-[#f6e0a6]">
    <div className="rounded-2xl border border-[#aa9558]/55 bg-[linear-gradient(150deg,#284c33,#0e271b)] p-4 shadow-[inset_0_1px_15px_rgba(243,205,113,.07)]">
      <h2 className="text-lg font-semibold text-[#f9db8e]">Garden Supplies</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#d0c5a4]">Add watering pails, tools and seeds for the garden. Seed packets and harvested fruit use the game’s normal Shop, Bag and Market artwork.</p>
      <button type="button" data-testid="garden-adjust-plants-on-plot"
        onClick={() => setStageEditorOpen(true)}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#e6cc82]/70 bg-[#245238] px-3 py-2 text-sm font-semibold text-[#f5dfa8] shadow-md active:bg-[#326249]">
        <Move size={18}/> Adjust Plants on Plot
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {GARDEN_TOOL_OPTIONS.map(tool => <button key={tool.key} type="button"
          data-testid={`garden-add-${tool.key}`} onClick={() => openTool(tool.key)}
          className="flex items-center gap-2 rounded-xl border border-[#b89b56]/60 bg-[#173b29] p-3 text-left text-xs shadow-md active:bg-[#2d593b]">
          <span className="rounded-full border border-[#e9c76b]/60 p-1 text-[#f0d17d]">
            {tool.key === "watering_pail" ? <Droplets size={20} /> : tool.key === "hoe" ? <Shovel size={20} /> : <Scissors size={20} />}
          </span><span><b className="block">{tool.label}</b><small className="text-[#c6bf9e]">{tool.key === "watering_pail" ? `${GARDEN_WATER_CAPACITY} drops` : "Add tool"}</small></span>
          <Plus className="ml-auto shrink-0" size={16} />
        </button>)}
        <button type="button" data-testid="garden-add-seed" onClick={() => openCrop()}
          className="flex items-center gap-2 rounded-xl border border-[#e1bf69]/70 bg-[#294a30] p-3 text-left text-xs shadow-md active:bg-[#365b36]">
          <span className="rounded-full border border-[#e9c76b]/60 p-1"><Sprout size={20}/></span>
          <span className="font-semibold">New Seed</span><Plus className="ml-auto" size={17}/>
        </button>
      </div>
    </div>

    <div className="space-y-2">
      <h3 className="text-sm font-bold text-[#f2d787]">Equipment</h3>
      {isLoading ? <p className="text-xs">Loading catalog…</p> : !data?.tools.length ? <p className="text-xs text-[#c3bb9c]">No garden tools added yet.</p> :
        <div className="grid grid-cols-2 gap-2">{data.tools.map(item => <div key={item.id}
          className="flex items-center gap-2 rounded-xl border border-[#b89b56]/35 bg-[#102c1f] p-2">
          {item.imageUrl && <img src={item.imageUrl} alt="" className="h-11 w-11 object-contain" />}
          <div className="min-w-0"><p className="truncate text-xs font-semibold">{item.name}</p>
            <p className="text-[10px] text-[#c0b891]">{item.specialType === "watering_pail" ? "100 water drops" : item.specialType === "hoe" ? "Prepare plot" : "Harvest crop"}</p></div>
          {item.specialType === "watering_pail" && <button type="button"
            aria-label={`Refillable ${item.name}`} aria-pressed={Boolean(item.isRefillable)}
            data-testid={`garden-tool-refillable-${item.id}`}
            disabled={updatingToolId !== null}
            onClick={() => void toggleRefillable(item)}
            className={`ml-auto shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold disabled:opacity-50 ${item.isRefillable ? "border-[#edce72] bg-[#35543b] text-[#f2d782]" : "border-[#8c835e] bg-[#17291e] text-[#b6ad91]"}`}>
            {item.isRefillable ? "Refillable" : "Not refillable"}
          </button>}
        </div>)}</div>}
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-[#f2d787]">Seeds & Harvested Fruit</h3>
      {!data?.crops.length ? <p className="text-xs text-[#c3bb9c]">Add the first seed to begin designing crops.</p> :
        data.crops.map(crop => <button type="button" key={crop.id} onClick={() => openCrop(crop)}
          className="flex w-full items-center gap-3 rounded-xl border border-[#aa9150]/45 bg-[#0f2b1e] p-3 text-left shadow-md active:bg-[#234732]">
          {crop.seedItem?.imageUrl && <img src={crop.seedItem.imageUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#f5d990]">{crop.seedItem?.name ?? "Seed"}</p>
            <p className="truncate text-xs text-[#d6c8ab]">{crop.fruitItem?.name ?? "Fruit"}</p>
            <p className="text-[10px] text-[#b9bb9f]">{crop.ready ? "All five growth phases ready" : "Draft · add missing images"}</p>
          </div><Pencil size={15} className="shrink-0 text-[#e7c36e]"/></button>)}
    </div>
    {form && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 px-2 pt-6 sm:items-center"
      role="dialog" aria-modal="true" aria-label={form.kind === "tool" ? "Add garden equipment" : "Garden seed editor"}>
      <button type="button" aria-label="Close garden editor" onClick={() => !saving && setForm(null)}
        className="absolute inset-0 cursor-default"/>
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-[#c0a260] bg-[linear-gradient(160deg,#21442e,#09231b)] shadow-[0_16px_55px_rgba(0,0,0,.75)] sm:rounded-3xl"
        style={{ maxHeight: "calc(100dvh - 32px)" }}>
        <header className="flex items-center justify-between border-b border-[#c3a360]/40 p-4">
          <h3 className="text-lg font-bold text-[#f6d98d]">{form.kind === "tool" ? "Add Garden Equipment" : form.crop ? "Edit Seed & Stages" : "Add Garden Seed"}</h3>
          <button type="button" aria-label="Close editor" onClick={() => !saving && setForm(null)}><X size={22}/></button>
        </header>
        <div className="space-y-4 overflow-y-auto overscroll-contain p-4">
          {form.kind === "tool" ? <>
            <label className="block text-xs">Tool name
              <input className={inputs+" mt-1"} value={toolName} maxLength={80} onChange={e => setToolName(e.target.value)} />
            </label>
            <label className="block text-xs">Shop price
              <input type="number" min={0} max={1000000} className={inputs+" mt-1"} value={toolPrice} onChange={e => setToolPrice(e.target.value)} />
            </label>
            <ImageSlot label="tool" required image={images.seedPack ?? null} onFile={f => void setImage("seedPack", f)}/>
            {form.type === "watering_pail" && <p className="text-xs text-[#dfc987]">Every pail holds exactly 100 drops. Water is tracked per owned pail, not shared across players.</p>}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#baa15f]/45 bg-[#193a29] p-3 text-sm">
                <input type="checkbox" aria-label="Refillable" checked={toolRefillable}
                  onChange={event => setToolRefillable(event.target.checked)}
                  className="h-4 w-4 accent-[#e9c875]" />
                <span><strong>Refillable</strong>
                  <small className="block text-[#d0bea0]">Mark this item as refillable. Water-bearing tools, such as pails, can collect up to 100 drops at a Water Source.</small>
                </span>
              </label>
          </> : <>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 block text-xs">Seed name
                <input className={inputs+" mt-1"} value={draft.name} maxLength={80} onChange={e => setDraft(v => ({ ...v, name: e.target.value }))} placeholder="Magical Blueberries"/>
              </label>
              <label className="block text-xs">Harvested fruit name
                <input className={inputs+" mt-1"} value={draft.fruitName} maxLength={80} onChange={e => setDraft(v => ({ ...v, fruitName: e.target.value }))} placeholder="Magical Blueberry"/>
              </label>
              <label className="block text-xs">Seed shop price
                <input type="number" min={0} max={1000000} className={inputs+" mt-1"} value={draft.price} onChange={e => setDraft(v => ({ ...v, price: e.target.value }))}/>
              </label>
              <label className="col-span-2 block text-xs">Description
                <textarea className={inputs+" mt-1"} rows={2} maxLength={600} value={draft.description} onChange={e => setDraft(v => ({ ...v, description: e.target.value }))}/>
              </label>
              <ImageSlot label="seed pack (shop & market)" required image={preview("seedPack")} onFile={f => void setImage("seedPack", f)} />
              <ImageSlot label="fruit (bag & market)" required image={preview("fruit")} onFile={f => void setImage("fruit", f)} />
            </div>
            <div className="space-y-3 border-t border-[#b99752]/35 pt-3">
              <h4 className="text-sm font-semibold text-[#f4d98e]">Plant Growth Stages</h4>
              <p className="text-[11px] text-[#d0c0a1]">Upload each stage here, then use Adjust Plants on Plot to set its exact size and position. Each phase has its own saved placement. Set the water needed to advance to the next phase.</p>
              {GARDEN_PHASES.map(phase => <div key={phase.key} className="flex gap-3 rounded-xl border border-[#baa15f]/35 bg-[#09251a]/65 p-2">
                <div className="w-[110px] shrink-0"><ImageSlot label={phase.label.toLowerCase()} image={preview(phase.key)}
                  onFile={f => void setImage(phase.key, f)} /></div>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm font-semibold text-[#f3d68a]">{phase.label}</p>
                  {phase.key === "picked" ? <p className="mt-2 text-[11px] text-[#ccbd9f]">After picking, this stage stays for 30 seconds, then the plot resets to empty.</p> :
                  <label className="mt-2 block text-xs text-[#d8c7a4]">{phase.waterLabel}
                    <input aria-label={phase.waterLabel} type="number" min={1} max={1000}
                      className={inputs+" mt-1"} value={draft[(phase.key+"Drops") as keyof CropDraft]}
                      onChange={e => setDraft(v => ({ ...v, [(phase.key+"Drops")]: e.target.value }))} />
                  </label>}
                </div>
              </div>)}
            </div>
          </>}
        </div>
        <footer className="flex gap-2 border-t border-[#bda15e]/40 p-3">
          <button type="button" disabled={saving} onClick={() => setForm(null)}
            className="flex-1 rounded-lg border border-[#bda15e]/50 bg-[#142f22] px-3 py-3 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()}
            className="flex-1 rounded-lg border border-[#f4d88f]/80 bg-[linear-gradient(#f6db99,#be954a)] px-3 py-3 text-sm font-bold text-[#25321f] disabled:opacity-50">
            {saving ? "Saving…" : form.kind === "crop" && form.crop ? "Save Changes" : "Add to Garden"}
          </button>
        </footer>
      </div>
    </div>}
  </section>;
}
