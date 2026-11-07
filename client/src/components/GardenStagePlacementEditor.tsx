import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Move, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_GARDEN_STAGE_PLACEMENT, GARDEN_PHASES,
  GARDEN_PLACEMENT_MAX_OFFSET, GARDEN_PLACEMENT_MAX_SCALE,
  GARDEN_PLACEMENT_MIN_SCALE, type GardenPhase,
  type GardenStagePlacement, type GardenStagePlacements,
} from "@shared/garden";
import PetParkCropArtwork from "@/components/PetParkCropArtwork";
import PetParkTerrainDetail from "@/components/PetParkTerrainDetail";

export type GardenStageCrop = {
  id: string;
  seedItem: { name: string } | null;
  plantedImageUrl: string | null; seedlingImageUrl: string | null;
  partialImageUrl: string | null; grownImageUrl: string | null; pickedImageUrl: string | null;
  stagePlacements: GardenStagePlacements;
};

const PLOT_WIDTH = 240;
const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const same = (a: GardenStagePlacement, b: GardenStagePlacement) =>
  a.x === b.x && a.y === b.y && a.scale === b.scale;
const keyFor = (cropId: string, stage: GardenPhase) => cropId + ":" + stage;

export default function GardenStagePlacementEditor({ crops, onBack }: {
  crops: readonly GardenStageCrop[];
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Only stages with an uploaded sprite can be configured. Seed packs and
  // inventory fruit art are not world sprites, so they are intentionally absent.
  const choices = useMemo(() => crops.flatMap(crop =>
    GARDEN_PHASES.flatMap(phase => {
      const url = crop[(phase.key + "ImageUrl") as
        "plantedImageUrl" | "seedlingImageUrl" | "partialImageUrl" | "grownImageUrl" | "pickedImageUrl"];
      return url ? [{
        key: keyFor(crop.id, phase.key), crop, stage: phase.key, image: url,
        label: (crop.seedItem?.name ?? "Garden seed") + " · " + phase.label,
      }] : [];
    })), [crops]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, GardenStagePlacement>>({});
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; start: GardenStagePlacement } | null>(null);
  const selected = choices.find(choice => choice.key === selectedKey) ?? choices[0];
  useEffect(() => {
    if (selectedKey && choices.some(choice => choice.key === selectedKey)) return;
    setSelectedKey(choices[0]?.key ?? null);
  }, [choices, selectedKey]);
  const persisted = selected?.crop.stagePlacements?.[selected.stage];
  const placement = selected ? drafts[selected.key] ?? persisted ?? DEFAULT_GARDEN_STAGE_PLACEMENT
    : DEFAULT_GARDEN_STAGE_PLACEMENT;
  const isDirty = !!selected && (!persisted || !same(placement, persisted));
  const isSaved = (key: string, stored?: GardenStagePlacement) =>
    !!stored && (!drafts[key] || same(drafts[key], stored));
  const change = (next: GardenStagePlacement) => {
    if (!selected || saving) return;
    setDrafts(previous => ({ ...previous, [selected.key]: next }));
  };

  const save = async () => {
    if (!selected || saving || !isDirty) return;
    setSaving(true);
    try {
      await apiRequest("PATCH",
        "/api/admin/garden/crops/" + encodeURIComponent(selected.crop.id) + "/stage-placement",
        { stage: selected.stage, placement });
      // Reload authoritative per-crop placements; other player views retrieve
      // this exact object from the ordinary /api/pet-park/garden endpoint.
      await qc.invalidateQueries({ queryKey: ["/api/admin/garden"] });
      setDrafts(previous => {
        const next = { ...previous };
        delete next[selected.key];
        return next;
      });
      toast({ title: "Plant placement saved", description: selected.label });
    } catch (error) {
      toast({ title: "Could not save plant placement", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <section data-testid="garden-stage-placement-editor"
    className="space-y-4 pb-16 font-fantasy text-[#f4dda6]">
    <header className="rounded-2xl border border-[#bca263]/55 bg-[#123326] p-4">
      <button type="button" onClick={onBack} className="mb-3 flex min-h-10 items-center gap-2 text-sm text-[#eed49b]">
        <ArrowLeft size={18}/> Back to Garden
      </button>
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#f4d28b]"><Move size={19}/> Adjust Plants on Plot</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#ccbfa1]">
        Choose an uploaded growth stage, drag its image on the garden plot, adjust its size, and save.
        This is the same plot and artwork renderer used by players.
      </p>
    </header>
    {selected ? <>
      <div className="relative" data-testid="garden-stage-selector">
        <button type="button" aria-label="Select plant growth stage" aria-expanded={expanded}
          data-testid="garden-stage-dropdown" onClick={() => setExpanded(value => !value)}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[#c6a96c]/65 bg-[#143825] p-2 text-left shadow-md">
          <img src={selected.image} alt="" className="h-10 w-10 shrink-0 object-contain" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{selected.label}</span>
          {isSaved(selected.key, persisted) && <span title="Saved placement" aria-label="Saved placement" className="text-xl text-[#71de85]">●</span>}
          <ChevronDown size={18} className="shrink-0"/>
        </button>
        {expanded && <div role="listbox" aria-label="Uploaded garden stages"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[260px] space-y-1 overflow-y-auto rounded-xl border border-[#bda366] bg-[#0c2b1e] p-1.5 shadow-xl">
          {choices.map(choice => {
            const saved = choice.crop.stagePlacements?.[choice.stage];
            return <button key={choice.key} type="button" role="option" aria-selected={selected.key === choice.key}
              data-testid="garden-stage-choice"
              onClick={() => { setSelectedKey(choice.key); setExpanded(false); drag.current = null; }}
              className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-[#285238] aria-selected:bg-[#2b5137]">
              <img src={choice.image} alt="" className="h-10 w-11 shrink-0 object-contain"/>
              <span className="min-w-0 flex-1 truncate">{choice.label}</span>
              {isSaved(choice.key, saved) && <span title="Saved placement" aria-label={"Saved " + choice.label}
                className="text-xl text-[#71de85]">●</span>}
            </button>;
          })}
        </div>}
      </div>

      <div data-testid="garden-stage-plot-preview"
        aria-label="Drag plant on garden plot to position it"
        className="relative h-[310px] w-full cursor-grab overflow-hidden rounded-2xl border border-[#bca363]/60 bg-[radial-gradient(ellipse_at_center,#305640,#1a3e2c_75%)] touch-none active:cursor-grabbing"
        onPointerDown={event => {
          if (saving || event.button !== 0) return;
          drag.current = { pointerId: event.pointerId, startX: event.clientX,
            startY: event.clientY, start: { ...placement } };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const held = drag.current;
          if (!held || held.pointerId !== event.pointerId) return;
          change({
            ...held.start,
            x: round(clamp(held.start.x + (event.clientX - held.startX) / PLOT_WIDTH,
              -GARDEN_PLACEMENT_MAX_OFFSET, GARDEN_PLACEMENT_MAX_OFFSET)),
            y: round(clamp(held.start.y + (event.clientY - held.startY) / PLOT_WIDTH,
              -GARDEN_PLACEMENT_MAX_OFFSET, GARDEN_PLACEMENT_MAX_OFFSET)),
          });
        }}
        onPointerUp={event => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}>
        <div className="pointer-events-none absolute left-1/2 top-[61%]"
          style={{ width: PLOT_WIDTH, height: PLOT_WIDTH / 2, transform: "translate(-50%, -50%)" }}>
          <PetParkTerrainDetail type="garden_plot" tilled />
        </div>
        <PetParkCropArtwork key={selected.key + ":" + selected.image}
          image={selected.image} xPct={.5} yPct={.61} size={PLOT_WIDTH} scale={1}
          zIndex={2} progress={null} placement={placement} />
        <div className="pointer-events-none absolute bottom-3 inset-x-2 text-center text-[11px] text-[#f6deb0]">
          Drag to move · Resize below
        </div>
      </div>

      <label className="block rounded-xl border border-[#b59d67]/45 bg-[#123225] p-3 text-xs">
        <span className="flex justify-between gap-3"><strong>Plant image size</strong>
          <span data-testid="garden-stage-size-value" className="tabular-nums text-[#e9ca82]">{Math.round(placement.scale * 100)}%</span></span>
        <input type="range" aria-label="Adjust plant size"
          data-testid="garden-stage-size-slider"
          min={GARDEN_PLACEMENT_MIN_SCALE} max={GARDEN_PLACEMENT_MAX_SCALE} step=".05"
          value={placement.scale} onChange={event => change({ ...placement, scale: Number(event.target.value) })}
          className="mt-3 w-full accent-[#d9bb72]" />
      </label>
      <div className="flex items-center justify-between gap-3 text-xs text-[#cfc4a7]">
        <span>{isDirty ? "Not saved yet" : "● Placement saved"}</span>
        <button type="button" onClick={() => change({ ...DEFAULT_GARDEN_STAGE_PLACEMENT })}
          disabled={saving} className="flex min-h-10 items-center gap-1 rounded-lg border border-[#ab9461]/55 bg-[#173826] px-3">
          <RotateCcw size={14}/> Reset position & size
        </button>
      </div>

      {/* This save belongs under the actual editor/plot, not to a popup header. */}
      <button type="button" data-testid="garden-save-stage-placement"
        disabled={saving || !isDirty} onClick={() => void save()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#f1d486] bg-[linear-gradient(#f2d99b,#b9934d)] px-4 text-sm font-bold text-[#24321f] shadow-md disabled:opacity-55">
        <Check size={17}/>{saving ? "Saving placement…" : "Save Plant Placement"}
      </button>
    </> : <div className="rounded-xl border border-[#bda36c]/55 bg-[#123326] p-5 text-sm">
      Upload a growth-stage image in Garden Seeds first. Uploaded stages will appear here for editing.
    </div>}
  </section>;
}
