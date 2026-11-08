import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { HOME_OUTDOOR_EFFECT_OPTIONS } from "@/components/HomeInteriorEffect";
import { PARK_WATER_EFFECT_OPTIONS, PARK_FIREFLIES_OPTION, DEFAULT_PARK_LIGHT_COLOR, type ParkEffectType } from "@shared/petParkEffects";
import {
  PARK_DECOR_EFFECT_MAX_COUNT, PARK_DECOR_EFFECT_MAX_SIZE,
  PARK_DECOR_EFFECT_MIN_SIZE, type ParkDecorEffect,
} from "@shared/petParkDecorEffects";
import { ParkEffectVisual } from "@/components/ParkEffectVisual";

const OPTIONS: { type: ParkEffectType; label: string; size: number }[] = [
  ...HOME_OUTDOOR_EFFECT_OPTIONS.filter(option => option.type !== "sleep").map(option => ({
    type: option.type, label: option.label,
    size: Math.max(24, Math.min(80, option.defaultSize * 2.4)),
  })),
  { type: "fireflies", label: PARK_FIREFLIES_OPTION.label, size: 68 },
  ...PARK_WATER_EFFECT_OPTIONS.map(option => ({
    type: option.type, label: option.label, size: 55,
  })),
];

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Shared, image-relative effect editor for a new decoration or any existing
 * duplicated instance. Live dragging stays local; one complete effect array
 * is persisted only when the gesture ends, not on every pointer sample.
 */
export default function WorldDecorEffectEditor({
  imageUrl, effects, onChange, disabled = false,
}: {
  imageUrl: string | null;
  effects: readonly ParkDecorEffect[];
  onChange: (effects: ParkDecorEffect[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<ParkDecorEffect[]>(() => [...effects]);
  const draftRef = useRef<ParkDecorEffect[]>([...effects]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ pointerId: number; id: string } | null>(null);

  useEffect(() => {
    if (dragging.current) return;
    draftRef.current = [...effects];
    setDraft([...effects]);
  }, [effects]);

  const changeDraft = (next: ParkDecorEffect[]) => {
    draftRef.current = next;
    setDraft(next);
  };
  const persist = (next: ParkDecorEffect[]) => {
    changeDraft(next);
    onChange(next);
  };
  const selected = draft.find(effect => effect.id === selectedId);
  const add = (type: ParkEffectType, size: number) => {
    if (draftRef.current.length >= PARK_DECOR_EFFECT_MAX_COUNT) return;
    const id = `decor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    persist([...draftRef.current, { id, type, x: 0.5, y: 0.5, size,
      ...(type === "colored_light" || type === "lamp_light" ? { color: DEFAULT_PARK_LIGHT_COLOR } : {}) }]);
    setSelectedId(id);
    setShowOptions(false);
  };

  const start = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (disabled || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = { pointerId: event.pointerId, id };
    setSelectedId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current || dragging.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    changeDraft(draftRef.current.map(effect => effect.id === dragging.current?.id
      ? { ...effect, x: clamp((event.clientX - bounds.left) / bounds.width),
          y: clamp((event.clientY - bounds.top) / bounds.height) } : effect));
  };
  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current || dragging.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragging.current = null;
    persist(draftRef.current);
  };
  const cancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current || dragging.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragging.current = null;
    changeDraft([...effects]);
  };
  const resize = (delta: number) => {
    if (!selected) return;
    persist(draftRef.current.map(effect => effect.id === selected.id ? {
      ...effect, size: Math.max(PARK_DECOR_EFFECT_MIN_SIZE,
        Math.min(PARK_DECOR_EFFECT_MAX_SIZE, effect.size + delta)),
    } : effect));
  };

  return <section data-testid="world-decor-effect-editor"
    aria-label="Decoration effects"
    className="space-y-2 rounded-xl border border-[#ba9e60]/60 bg-[#112f21]/90 p-2 text-[#f2d99f]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold">Decoration Effects ({draft.length}/{PARK_DECOR_EFFECT_MAX_COUNT})</span>
      <button type="button" data-testid="world-decor-add-effect"
        disabled={disabled || !imageUrl || draft.length >= PARK_DECOR_EFFECT_MAX_COUNT}
        onClick={() => setShowOptions(current => !current)}
        className="rounded-lg border border-[#c1a560]/70 bg-[#28583d] px-3 py-2 text-xs font-semibold disabled:opacity-40">
        + Add effect
      </button>
    </div>
    {showOptions && <div data-testid="world-decor-effect-choices"
      className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-lg bg-[#102b1e] p-1">
      {OPTIONS.map(option => <button type="button" key={option.type}
        disabled={disabled} onClick={() => add(option.type, option.size)}
        data-testid={`world-decor-add-${option.type}`}
        className="min-h-9 rounded border border-[#c6ab6a]/45 px-2 py-1 text-left text-[11px]">
        {option.label}
      </button>)}
    </div>}
    {imageUrl && <div ref={previewRef} data-testid="world-decor-effect-preview"
      className="relative mx-auto h-[150px] w-[150px] touch-none rounded-lg border border-[#bda464]/45 bg-[#214331]/70">
      <img src={imageUrl} alt="Decoration artwork" draggable={false}
        className="pointer-events-none h-full w-full object-contain" />
      {draft.map(effect => <button type="button" key={effect.id}
        data-testid={`world-decor-effect-handle-${effect.id}`}
        aria-label={`Position ${OPTIONS.find(option => option.type === effect.type)?.label ?? effect.type}`}
        aria-pressed={effect.id === selectedId}
        onPointerDown={event => start(event, effect.id)}
        onPointerMove={move} onPointerUp={finish}
        onPointerCancel={cancel} onLostPointerCapture={cancel}
        className="absolute flex min-h-8 min-w-8 touch-none items-center justify-center rounded-full"
        style={{ left: `${effect.x * 100}%`, top: `${effect.y * 100}%`,
          transform: "translate(-50%,-50%)",
          outline: effect.id === selectedId ? "2px dashed #f9dfa0" : undefined }}>
        <span aria-hidden="true" className="pointer-events-none absolute"
          style={{ width: `${effect.size / 100 * 150}px`,
            height: `${effect.size / 100 * 150}px` }}>
          <ParkEffectVisual type={effect.type} color={effect.color} adminPreview reducedMotion />
        </span>
        <span aria-hidden="true" className="pointer-events-none relative z-10 h-4 w-4 rounded-full border-2 border-[#f6e4a8] bg-[#345f47]/90 shadow-lg" />
      </button>)}
    </div>}
    {selected && <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="max-w-[110px] truncate text-[11px]">{OPTIONS.find(option => option.type === selected.type)?.label ?? selected.type}</span>
      <button type="button" aria-label="Decrease decoration effect size" disabled={disabled}
        onClick={() => resize(-8)} className="rounded-lg border border-[#bba05e]/70 p-2"><Minus size={15}/></button>
      <span className="text-[11px]">{Math.round(selected.size)}%</span>
      <button type="button" aria-label="Increase decoration effect size" disabled={disabled}
        onClick={() => resize(8)} className="rounded-lg border border-[#bba05e]/70 p-2"><Plus size={15}/></button>
      <button type="button" aria-label="Remove selected decoration effect" disabled={disabled}
        onClick={() => { persist(draftRef.current.filter(effect => effect.id !== selected.id)); setSelectedId(null); }}
        className="rounded-lg border border-red-400/50 p-2 text-red-200"><Trash2 size={15}/></button>
    </div>}
    {(selected?.type === "colored_light" || selected?.type === "lamp_light") && <label className="flex items-center justify-between gap-3 rounded-lg border border-[#bda464]/40 p-2 text-xs">
      Lamp orb color
      <input type="color" aria-label="Lamp light color"
        data-testid="park-lamp-light-color-picker" value={selected.color ?? DEFAULT_PARK_LIGHT_COLOR}
        disabled={disabled}
        onChange={event => persist(draftRef.current.map(effect => effect.id === selected.id
          ? { ...effect, color: event.target.value } : effect))}
        className="h-9 w-14 cursor-pointer rounded border border-[#bda464]/70 bg-transparent" />
    </label>}
    {draft.length > 0 && <p className="text-center text-[10px] text-[#e8d7a9]/75">
      Drag an effect marker over the artwork to position it. Effects belong to this world decoration only.
    </p>}
  </section>;
}
