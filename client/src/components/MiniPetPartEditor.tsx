import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save, X } from "lucide-react";
import type { MiniPetPartType } from "@shared/miniPet";

const CANVAS_SIZE = 500;
const OUTPUT_SIZE = 1000;

const RENDER_ORDER: MiniPetPartType[] = [
  "tail",
  "left_wing",
  "right_wing",
  "body",
  "head",
  "left_ear",
  "right_ear",
  "eyes",
  "closed_eyes",
  "head_accessory",
];

type PreviewPart = {
  id: string;
  partType: MiniPetPartType;
  imageUrl: string;
};

type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface Props {
  petName: string;
  partType: MiniPetPartType;
  source: string;
  previewParts: PreviewPart[];
  onCancel: () => void;
  onSave: (imageData: string) => void;
  saving?: boolean;
}

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function initialPlacement(width: number, height: number): Placement {
  if (!width || !height) return { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };
  const scale = Math.min(CANVAS_SIZE / width, CANVAS_SIZE / height);
  const nextWidth = Math.max(1, width * scale);
  const nextHeight = Math.max(1, height * scale);
  return {
    x: (CANVAS_SIZE - nextWidth) / 2,
    y: (CANVAS_SIZE - nextHeight) / 2,
    width: nextWidth,
    height: nextHeight,
  };
}

export default function MiniPetPartEditor({ petName, partType, source, previewParts, onCancel, onSave, saving = false }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const [placement, setPlacement] = useState<Placement>({ x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setPlacement(initialPlacement(image.naturalWidth, image.naturalHeight));
      setLoaded(true);
      setError("");
    };
    image.onerror = () => {
      if (!cancelled) setError("That image could not be loaded. Try uploading the PNG again.");
    };
    image.src = source;
    return () => { cancelled = true; };
  }, [source]);

  const orderedPreview = useMemo(
    () => [...previewParts]
      // Closed Eyes is an alternate blink frame, not a layer that should sit
      // over the open Eyes while positioning other parts. When editing Closed
      // Eyes, hide the open Eyes so the alternate frame can be aligned cleanly.
      .filter(part => partType === "closed_eyes" ? part.partType !== "eyes" : part.partType !== "closed_eyes")
      .sort((a, b) => RENDER_ORDER.indexOf(a.partType) - RENDER_ORDER.indexOf(b.partType)),
    [partType, previewParts],
  );
  const activeIndex = RENDER_ORDER.indexOf(partType);

  const resetPlacement = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    setPlacement(initialPlacement(image.naturalWidth, image.naturalHeight));
  }, []);

  const setScalePercent = (percent: number) => {
    const image = imageRef.current;
    if (!image) return;
    const base = initialPlacement(image.naturalWidth, image.naturalHeight);
    const scale = clamp(percent, 10, 200) / 100;
    const width = base.width * scale;
    const height = base.height * scale;
    setPlacement(current => ({
      x: current.x + (current.width - width) / 2,
      y: current.y + (current.height - height) / 2,
      width,
      height,
    }));
  };

  const currentScalePercent = useMemo(() => {
    const image = imageRef.current;
    if (!image) return 100;
    const base = initialPlacement(image.naturalWidth, image.naturalHeight);
    return Math.round((placement.width / base.width) * 100);
  }, [placement]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: placement.x,
      y: placement.y,
    };
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !canvasRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    const dx = (event.clientX - dragRef.current.startX) * scale;
    const dy = (event.clientY - dragRef.current.startY) * scale;
    setPlacement(current => ({ ...current, x: dragRef.current!.x + dx, y: dragRef.current!.y + dy }));
  };

  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const save = () => {
    const image = imageRef.current;
    if (!image || !loaded) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const outputScale = OUTPUT_SIZE / CANVAS_SIZE;
      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(
        image,
        placement.x * outputScale,
        placement.y * outputScale,
        placement.width * outputScale,
        placement.height * outputScale,
      );
      onSave(canvas.toDataURL("image/png"));
    } catch (saveError) {
      console.error("[mini-pets] part editor export failed", saveError);
      setError("Could not export this part. If this is an older part, choose Replace Image and upload the PNG again.");
    }
  };

  const renderPreviewPart = (part: PreviewPart) => (
    <img
      key={part.id}
      src={part.imageUrl}
      alt=""
      draggable={false}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );

  const before = orderedPreview.filter(part => RENDER_ORDER.indexOf(part.partType) < activeIndex && part.partType !== partType);
  const after = orderedPreview.filter(part => RENDER_ORDER.indexOf(part.partType) > activeIndex && part.partType !== partType);

  return (
    <div className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-black/85 p-3 sm:p-6" data-testid="mini-pet-part-editor">
      <div className="my-auto w-full max-w-xl rounded-2xl p-4 sm:p-5" style={{ background: "#07150f", border: "1px solid rgba(110,231,183,.38)", boxShadow: "0 24px 70px rgba(0,0,0,.72)" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-fantasy text-sm tracking-wider text-emerald-200">MINI PET PART EDITOR</h2>
            <p className="mt-1 text-[10px] text-stone-400">{petName} · {titleCase(partType)} · drag the highlighted part into place</p>
          </div>
          <button type="button" aria-label="Close part editor" onClick={onCancel} className="p-2 text-stone-300"><X size={18} /></button>
        </div>

        <div
          ref={canvasRef}
          className="relative mx-auto aspect-square w-full max-w-[500px] overflow-hidden rounded-xl"
          style={{
            background: "radial-gradient(ellipse at 50% 58%, rgba(22,67,48,.82), rgba(3,15,10,.96))",
            border: "2px solid rgba(110,231,183,.28)",
            touchAction: "none",
          }}
          data-testid="mini-pet-part-canvas"
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-emerald-200/10" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-emerald-200/10" />
          {before.map(renderPreviewPart)}
          {loaded && (
            <div
              className="absolute cursor-grab touch-none active:cursor-grabbing"
              style={{
                left: `${(placement.x / CANVAS_SIZE) * 100}%`,
                top: `${(placement.y / CANVAS_SIZE) * 100}%`,
                width: `${(placement.width / CANVAS_SIZE) * 100}%`,
                height: `${(placement.height / CANVAS_SIZE) * 100}%`,
                outline: "2px solid rgba(110,231,183,.9)",
                outlineOffset: "2px",
              }}
              onPointerDown={pointerDown}
              data-testid="mini-pet-active-part"
            >
              <img src={source} alt={titleCase(partType)} draggable={false} className="pointer-events-none h-full w-full" />
            </div>
          )}
          {after.map(renderPreviewPart)}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)" }}>
          <label className="text-[10px] text-stone-300">
            Size · {currentScalePercent}%
            <input
              type="range"
              min={10}
              max={200}
              step={1}
              value={clamp(currentScalePercent, 10, 200)}
              onChange={event => setScalePercent(Number(event.target.value))}
              className="mt-2 w-full"
              data-testid="mini-pet-part-scale"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-stone-300">X position
              <input type="number" value={Math.round(placement.x)} onChange={event => setPlacement(current => ({ ...current, x: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white" />
            </label>
            <label className="text-[10px] text-stone-300">Y position
              <input type="number" value={Math.round(placement.y)} onChange={event => setPlacement(current => ({ ...current, y: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-white" />
            </label>
          </div>
          <p className="text-[9px] leading-relaxed text-stone-500">Other uploaded Mini Pet parts stay visible as a guide. Saving exports only this part onto a transparent 1000×1000 canvas, so the existing Mini Pet animation and renderer stay compatible.</p>
          {error && <p className="rounded-lg border border-red-400/20 bg-red-950/20 p-2 text-[10px] text-red-200">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={resetPlacement} disabled={!loaded || saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 py-2.5 text-[10px] text-stone-300 disabled:opacity-40"><RotateCcw size={14} /> RESET</button>
            <button type="button" onClick={save} disabled={!loaded || saving} className="flex flex-[1.4] items-center justify-center gap-2 rounded-lg py-2.5 font-fantasy text-[10px] tracking-wider text-emerald-950 disabled:opacity-40" style={{ background: "linear-gradient(135deg,#a7f3d0,#34d399)" }} data-testid="button-save-mini-pet-part"><Save size={14} /> {saving ? "SAVING…" : "SAVE PART"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
