import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LayoutTemplate, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CardPreview from "@/components/CardPreview";
import type { CardSpecialEffect } from "@shared/cardSpecialEffect";
import { CARD_LABEL_DETAILS, CARD_LABELS, type CardLabel } from "@shared/cardLabel";
import {
  CARD_RARITIES,
  defaultCardBorderLayout,
  getCardBorderLayout,
  type CardBorderLayout,
  type CardDefinition,
  type CardLayoutField,
  type CardRarity,
} from "@/lib/cardCatalog";

interface CardFormState {
  name: string;
  description: string;
  secondDescription: string;
  rarity: CardRarity;
  artworkData: string;
  artworkPreview: string;
  effectColor: string;
  specialEffect: CardSpecialEffect | "";
  label: CardLabel | "";
  effectPickerX: number;
  effectPickerY: number;
}

const EMPTY_FORM: CardFormState = {
  name: "",
  description: "",
  secondDescription: "",
  rarity: 1,
  artworkData: "",
  artworkPreview: "",
  effectColor: "",
  specialEffect: "",
  label: "",
  effectPickerX: 50,
  effectPickerY: 50,
};

const panelStyle = {
  background: "rgba(4,12,8,.9)",
  border: "1px solid rgba(224,181,74,.32)",
  boxShadow: "0 8px 24px rgba(0,0,0,.34)",
};

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not read image"));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}


function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

async function suggestArtworkEffectColor(src: string): Promise<{ color: string; x: number; y: number }> {
  const image = new Image();
  if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not sample artwork"));
    image.src = src;
  });

  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Color sampling is unavailable");
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;

  let best = { score: -1, color: "#FFF0B6", x: 50, y: 50 };
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const index = (y * size + x) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha < .75) continue;
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      if (luminance < .16 || luminance > .94) continue;
      const centerBias = 1 - Math.min(1, Math.hypot(x - size / 2, y - size / 2) / (size * .72));
      const score = saturation * 1.35 + (1 - Math.abs(luminance - .58)) * .42 + centerBias * .08;
      if (score > best.score) {
        best = {
          score,
          color: rgbToHex(pixels[index], pixels[index + 1], pixels[index + 2]),
          x: ((x + .5) / size) * 100,
          y: ((y + .5) / size) * 100,
        };
      }
    }
  }
  return { color: best.color, x: best.x, y: best.y };
}

function ArtworkEffectColorPicker({ src, color, pickerX, pickerY, specialEffect, onChange, onAuto }: {
  src: string;
  color: string;
  pickerX: number;
  pickerY: number;
  specialEffect: CardSpecialEffect | "";
  onChange: (color: string, x: number, y: number) => void;
  onAuto: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef(false);

  const sampleAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const image = imageRef.current;
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
    const normalizedY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(bounds.height, 1)));
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    try {
      const sourceX = Math.min(image.naturalWidth - 1, Math.floor(normalizedX * image.naturalWidth));
      const sourceY = Math.min(image.naturalHeight - 1, Math.floor(normalizedY * image.naturalHeight));
      context.drawImage(image, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      onChange(rgbToHex(pixel[0], pixel[1], pixel[2]), normalizedX * 100, normalizedY * 100);
    } catch {
      // Existing remote artwork without CORS can still use the manual color input.
    }
  };

  return (
    <div data-testid="card-effect-color-picker" className="space-y-2 rounded-xl p-3" style={panelStyle}>
      <div>
        <p className="font-fantasy text-[9px] tracking-wider text-[#ddc175]">ARTWORK EFFECT COLOR</p>
        <p className="mt-1 text-[9px] leading-4 text-white/45">Drag the picker over this card's artwork to color its {specialEffect === "aurora" ? "aurora" : specialEffect === "wisps" ? "moonfire wisps" : "magical swirls"}. The gold border stays the same.</p>
      </div>
      <div
        className="relative mx-auto w-full max-w-[210px] overflow-hidden rounded-lg"
        style={{ touchAction: "none", border: "1px solid rgba(224,181,74,.35)" }}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          sampleAt(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) sampleAt(event);
        }}
        onPointerUp={(event) => {
          sampleAt(event);
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        <img ref={imageRef} src={src} crossOrigin={src.startsWith("data:") ? undefined : "anonymous"} alt="" draggable={false} className="block h-auto w-full select-none" />
        <span
          aria-hidden="true"
          data-testid="card-effect-color-picker-dot"
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${pickerX}%`,
            top: `${pickerY}%`,
            background: color || "#FFF0B6",
            border: "2px solid white",
            boxShadow: "0 0 0 2px rgba(0,0,0,.7), 0 0 10px rgba(255,255,255,.7)",
          }}
        />
      </div>
      <div className="grid grid-cols-[52px_1fr_auto] items-center gap-2">
        <input
          data-testid="input-card-effect-color"
          aria-label="Artwork effect color"
          type="color"
          value={color || "#FFF0B6"}
          onChange={(event) => onChange(event.target.value.toUpperCase(), pickerX, pickerY)}
          className="h-10 w-[52px] rounded-lg border-0 bg-transparent p-0"
        />
        <div className="rounded-lg px-3 py-2 text-center font-mono text-[10px] text-[#f5deb0]" style={{ background: "#0a1710", border: "1px solid rgba(224,181,74,.25)" }}>
          {color || "DEFAULT COLOR"}
        </div>
        <button type="button" data-testid="button-auto-card-effect-color" onClick={onAuto} className="h-10 rounded-lg px-3 font-fantasy text-[8px] text-[#f8e7b0] active:scale-95" style={{ background: "rgba(118,76,10,.24)", border: "1px solid rgba(224,181,74,.4)" }}>
          Auto
        </button>
      </div>
    </div>
  );
}

export default function CardAdminPanel() {
  const [tab, setTab] = useState<"cards" | "layout">("cards");
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [form, setForm] = useState<CardFormState>(EMPTY_FORM);
  const [layoutRarity, setLayoutRarity] = useState<CardRarity>(1);
  const [selectedField, setSelectedField] = useState<CardLayoutField>("name");
  const [layoutDrafts, setLayoutDrafts] = useState<Partial<Record<CardRarity, CardBorderLayout>>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: cards = [], isLoading: cardsLoading } = useQuery<CardDefinition[]>({
    queryKey: ["/api/admin/cards"],
  });
  const { data: layouts = [], isLoading: layoutsLoading } = useQuery<CardBorderLayout[]>({
    queryKey: ["/api/admin/card-border-layouts"],
  });

  useEffect(() => {
    if (!layouts.length) return;
    setLayoutDrafts((current) => {
      const next = { ...current };
      for (const layout of layouts) {
        if (!next[layout.rarity]) next[layout.rarity] = layout;
      }
      return next;
    });
  }, [layouts]);

  const currentLayout = layoutDrafts[layoutRarity]
    ?? getCardBorderLayout(layouts, layoutRarity);
  const previewCard = useMemo(
    () => cards.find((card) => card.rarity === layoutRarity) ?? null,
    [cards, layoutRarity],
  );

  const saveCard = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        description: form.description,
        secondDescription: form.secondDescription,
        rarity: form.rarity,
        artworkData: form.artworkData || undefined,
        effectColor: form.effectColor || null,
        specialEffect: form.specialEffect || null,
        label: form.label || null,
      };
      const response = editingCard
        ? await apiRequest("PATCH", `/api/admin/cards/${editingCard.id}`, body)
        : await apiRequest("POST", "/api/admin/cards", body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
      setShowForm(false);
      setEditingCard(null);
      setForm(EMPTY_FORM);
      toast({ title: editingCard ? "Card updated" : "Card created" });
    },
    onError: (error: any) => toast({
      title: "Could not save card",
      description: error?.message || "Please check the card details.",
      variant: "destructive",
    }),
  });

  const deleteCard = useMutation({
    mutationFn: async (card: CardDefinition) => {
      await apiRequest("DELETE", `/api/admin/cards/${card.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
      toast({ title: "Card deleted" });
    },
    onError: (error: any) => toast({
      title: "Could not delete card",
      description: error?.message || "Delete failed.",
      variant: "destructive",
    }),
  });

  const saveLayout = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "PUT",
        `/api/admin/card-border-layouts/${layoutRarity}`,
        currentLayout,
      );
      return response.json() as Promise<CardBorderLayout>;
    },
    onSuccess: (saved) => {
      setLayoutDrafts((current) => ({ ...current, [saved.rarity]: saved }));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/card-border-layouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
      toast({ title: `${saved.rarity}★ border layout saved` });
    },
    onError: (error: any) => toast({
      title: "Could not save border layout",
      description: error?.message || "Keep both boxes inside the card.",
      variant: "destructive",
    }),
  });

  const openNewCard = () => {
    setEditingCard(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEditCard = (card: CardDefinition) => {
    setEditingCard(card);
    setForm({
      name: card.name,
      description: card.description,
      secondDescription: card.secondDescription ?? "",
      rarity: card.rarity,
      artworkData: "",
      artworkPreview: card.artworkUrl,
      effectColor: card.effectColor ?? "",
      specialEffect: card.specialEffect ?? "",
      label: card.label ?? "",
      effectPickerX: 50,
      effectPickerY: 50,
    });
    setShowForm(true);
  };

  const onArtwork = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" });
      return;
    }
    try {
      const data = await readImage(file);
      setForm((current) => ({ ...current, artworkData: data, artworkPreview: data }));
      try {
        const suggestion = await suggestArtworkEffectColor(data);
        setForm((current) => current.artworkPreview === data
          ? { ...current, effectColor: suggestion.color, effectPickerX: suggestion.x, effectPickerY: suggestion.y }
          : current);
      } catch {
        // The movable picker and manual color control remain available.
      }
    } catch (error: any) {
      toast({ title: "Could not read artwork", description: error?.message, variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const submitCard = () => {
    if (!form.name.trim()) {
      toast({ title: "Enter a card name", variant: "destructive" });
      return;
    }
    if (!editingCard && !form.artworkData) {
      toast({ title: "Upload card artwork", variant: "destructive" });
      return;
    }
    saveCard.mutate();
  };

  const setCurrentLayout = (layout: CardBorderLayout) => {
    setLayoutDrafts((current) => ({ ...current, [layout.rarity]: layout }));
  };

  const maxStarWidth = Math.min(80, (100 - currentLayout.starY) * layoutRarity * 3 / 2);

  const resizeStars = (direction: -1 | 1) => {
    const width = Math.max(5, Math.min(maxStarWidth, Number((currentLayout.starWidth + direction).toFixed(1))));
    const centerX = currentLayout.starX + currentLayout.starWidth / 2;
    setCurrentLayout({
      ...currentLayout,
      starWidth: width,
      starX: Math.max(0, Math.min(100 - width, centerX - width / 2)),
    });
  };

  const textFieldKeys = selectedField === "name"
    ? { x: "nameX", y: "nameY", width: "nameWidth", height: "nameHeight", fontSize: "nameFontSize" } as const
    : selectedField === "description"
      ? { x: "descriptionX", y: "descriptionY", width: "descriptionWidth", height: "descriptionHeight", fontSize: "descriptionFontSize" } as const
      : null;

  const nudgeSelectedText = (dx: number, dy: number) => {
    if (!textFieldKeys) return;
    const x = Number(currentLayout[textFieldKeys.x]);
    const y = Number(currentLayout[textFieldKeys.y]);
    const width = Number(currentLayout[textFieldKeys.width]);
    const height = Number(currentLayout[textFieldKeys.height]);
    setCurrentLayout({
      ...currentLayout,
      [textFieldKeys.x]: Number(Math.max(0, Math.min(100 - width, x + dx)).toFixed(1)),
      [textFieldKeys.y]: Number(Math.max(0, Math.min(100 - height, y + dy)).toFixed(1)),
    });
  };

  const centerSelectedText = () => {
    if (!textFieldKeys) return;
    const width = Number(currentLayout[textFieldKeys.width]);
    setCurrentLayout({
      ...currentLayout,
      [textFieldKeys.x]: Number(((100 - width) / 2).toFixed(1)),
    });
  };

  const resizeSelectedText = (direction: -1 | 1) => {
    if (!textFieldKeys) return;
    const current = Number(currentLayout[textFieldKeys.fontSize]);
    setCurrentLayout({
      ...currentLayout,
      [textFieldKeys.fontSize]: Number(Math.max(6, Math.min(32, current + direction)).toFixed(1)),
    });
  };

  const adjustTitleCurve = (direction: -1 | 1) => {
    const current = Number(currentLayout.nameCurve ?? 0);
    setCurrentLayout({
      ...currentLayout,
      nameCurve: Number(Math.max(0, Math.min(8, current + direction)).toFixed(1)),
    });
  };

  return (
    <div data-testid="card-admin-panel" className="space-y-4 pb-10">
      <div className="grid grid-cols-2 gap-2 rounded-xl p-1" style={panelStyle}>
        <button
          type="button"
          data-testid="card-admin-tab-cards"
          onClick={() => setTab("cards")}
          className="flex items-center justify-center gap-2 rounded-lg py-2.5 font-fantasy text-[10px] tracking-wider"
          style={{
            color: tab === "cards" ? "#fff0b0" : "rgba(235,218,170,.52)",
            background: tab === "cards" ? "rgba(184,126,24,.26)" : "transparent",
            border: tab === "cards" ? "1px solid rgba(240,192,64,.46)" : "1px solid transparent",
          }}
        >
          <ImagePlus className="h-4 w-4" /> Cards
        </button>
        <button
          type="button"
          data-testid="card-admin-tab-layout"
          onClick={() => setTab("layout")}
          className="flex items-center justify-center gap-2 rounded-lg py-2.5 font-fantasy text-[10px] tracking-wider"
          style={{
            color: tab === "layout" ? "#fff0b0" : "rgba(235,218,170,.52)",
            background: tab === "layout" ? "rgba(184,126,24,.26)" : "transparent",
            border: tab === "layout" ? "1px solid rgba(240,192,64,.46)" : "1px solid transparent",
          }}
        >
          <LayoutTemplate className="h-4 w-4" /> Border Layout
        </button>
      </div>

      {tab === "cards" ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={panelStyle}>
            <div>
              <p className="font-fantasy text-xs tracking-wider text-[#f5d778]">Card Catalog</p>
              <p className="mt-1 text-[10px] text-white/45">Artwork automatically receives its rarity border.</p>
            </div>
            <button
              type="button"
              data-testid="button-add-card"
              onClick={openNewCard}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95"
              aria-label="Add card"
              style={{ color: "#fff3ba", background: "linear-gradient(145deg,#9b6715,#5c3807)", border: "1px solid #e8bc56", boxShadow: "0 0 14px rgba(232,188,86,.28)" }}
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          {cardsLoading ? (
            <p className="py-8 text-center font-fantasy text-xs text-[#d8bc70]/60">Loading cards...</p>
          ) : cards.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={panelStyle}>
              <ImagePlus className="mx-auto mb-3 h-8 w-8 text-[#d8bc70]/45" />
              <p className="font-fantasy text-xs text-[#ead28a]">No cards created yet</p>
              <p className="mt-2 text-[10px] text-white/40">Tap the + button to add the first card.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div key={card.id} data-testid={`admin-card-row-${card.id}`} className="flex items-center gap-3 rounded-xl p-2.5" style={panelStyle}>
                  <div className="w-[68px] shrink-0">
                    <CardPreview
                      rarity={card.rarity}
                      artworkUrl={card.artworkUrl}
                      effectColor={card.effectColor}
                      specialEffect={card.specialEffect}
                      label={card.label}
                      name={card.name}
                      description={card.description}
                      layout={getCardBorderLayout(layouts, card.rarity)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-fantasy text-[11px] text-[#f4dfa0]">{card.name}</p>
                    <p className="mt-1 text-[10px] text-[#f6c64c]">{"★".repeat(card.rarity)}</p>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/42">{card.description || "No description"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button type="button" aria-label={`Edit ${card.name}`} onClick={() => openEditCard(card)} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-200 active:scale-95" style={{ background: "rgba(18,88,58,.38)", border: "1px solid rgba(110,231,183,.3)" }}><Pencil className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Delete ${card.name}`} onClick={() => window.confirm(`Delete ${card.name}?`) && deleteCard.mutate(card)} className="grid h-8 w-8 place-items-center rounded-lg text-red-200 active:scale-95" style={{ background: "rgba(110,20,20,.38)", border: "1px solid rgba(248,113,113,.3)" }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl p-3" style={panelStyle}>
            <label className="mb-1.5 block font-fantasy text-[9px] tracking-wider text-[#e7cb80]">CHOOSE CARD BORDER</label>
            <select
              data-testid="select-card-border-rarity"
              value={layoutRarity}
              onChange={(event) => setLayoutRarity(Number(event.target.value) as CardRarity)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ color: "#f9e8b0", background: "#0c1710", border: "1px solid rgba(224,181,74,.42)" }}
            >
              {CARD_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{rarity} Star Border</option>)}
            </select>
            <p className="mt-2 text-[9px] leading-4 text-white/42">Choose a border and select the name, description, or stars. Drag on the card or use the simple nudge, center, and size buttons below.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["name", "description", "stars"] as const).map((field) => (
              <button
                key={field}
                type="button"
                data-testid={`select-card-layout-field-${field}`}
                onClick={() => setSelectedField(field)}
                className="rounded-lg py-2 font-fantasy text-[9px] tracking-wider"
                style={{
                  color: selectedField === field ? "#baf7d0" : "rgba(240,220,170,.58)",
                  background: selectedField === field ? "rgba(20,100,65,.35)" : "rgba(0,0,0,.3)",
                  border: selectedField === field ? "1px solid rgba(110,231,183,.55)" : "1px solid rgba(224,181,74,.2)",
                }}
              >
                {field === "name" ? "Name Box" : field === "description" ? "Description Box" : "Stars"}
              </button>
            ))}
          </div>

          <div className="mx-auto w-full max-w-[290px] rounded-xl p-2" style={panelStyle}>
            {layoutsLoading ? <div className="aspect-[2/3] animate-pulse rounded-lg bg-white/5" /> : (
              <CardPreview
                rarity={layoutRarity}
                artworkUrl={previewCard?.artworkUrl}
                name={previewCard?.name || "Sample Card Name"}
                description={previewCard?.description || "Sample card description appears here."}
                layout={currentLayout}
                editable
                selectedField={selectedField}
                onSelectField={setSelectedField}
                onLayoutChange={setCurrentLayout}
              />
            )}
          </div>

          <div className="rounded-xl p-3" style={panelStyle}>
            <p className="mb-3 font-fantasy text-[9px] tracking-wider text-[#e7cb80]">{selectedField === "name" ? "NAME BOX" : selectedField === "description" ? "DESCRIPTION BOX" : "STARS"} SETTINGS</p>
            {selectedField === "stars" ? (
              <div className="space-y-3">
                <p className="text-[10px] leading-4 text-white/55">Drag the stars to set their height, then center them horizontally if needed.</p>
                <button
                  type="button"
                  data-testid="button-center-card-stars"
                  onClick={() => setCurrentLayout({ ...currentLayout, starX: (100 - currentLayout.starWidth) / 2 })}
                  className="min-h-11 w-full rounded-lg font-fantasy text-[10px] text-[#f8e7b0] active:scale-[.99]"
                  style={{ background: "rgba(118,76,10,.24)", border: "1px solid rgba(224,181,74,.46)" }}
                >
                  Center Stars
                </button>
                <div className="grid grid-cols-[48px_1fr_48px] items-center gap-3">
                  <button
                    type="button"
                    data-testid="button-decrease-card-stars"
                    aria-label="Decrease star size"
                    disabled={currentLayout.starWidth <= 5}
                    onClick={() => resizeStars(-1)}
                    className="h-12 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.46)" }}
                  >−</button>
                  <span className="text-center font-fantasy text-[10px] text-[#e7cb80]">Star size: {currentLayout.starWidth.toFixed(1)}%</span>
                  <button
                    type="button"
                    data-testid="button-increase-card-stars"
                    aria-label="Increase star size"
                    disabled={currentLayout.starWidth >= maxStarWidth}
                    onClick={() => resizeStars(1)}
                    className="h-12 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.46)" }}
                  >+</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] leading-4 text-white/55">Drag the text on the preview, or use these buttons for small precise adjustments.</p>

                <div className="mx-auto grid w-full max-w-[210px] grid-cols-3 gap-2">
                  <span />
                  <button
                    type="button"
                    data-testid="button-nudge-card-text-up"
                    aria-label="Move card text up"
                    onClick={() => nudgeSelectedText(0, -0.5)}
                    className="h-11 rounded-lg text-lg text-[#f8e7b0] active:scale-95"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                  >↑</button>
                  <span />
                  <button
                    type="button"
                    data-testid="button-nudge-card-text-left"
                    aria-label="Move card text left"
                    onClick={() => nudgeSelectedText(-0.5, 0)}
                    className="h-11 rounded-lg text-lg text-[#f8e7b0] active:scale-95"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                  >←</button>
                  <button
                    type="button"
                    data-testid="button-center-card-text"
                    onClick={centerSelectedText}
                    className="h-11 rounded-lg font-fantasy text-[9px] text-[#f8e7b0] active:scale-95"
                    style={{ background: "rgba(118,76,10,.24)", border: "1px solid rgba(224,181,74,.46)" }}
                  >Center</button>
                  <button
                    type="button"
                    data-testid="button-nudge-card-text-right"
                    aria-label="Move card text right"
                    onClick={() => nudgeSelectedText(0.5, 0)}
                    className="h-11 rounded-lg text-lg text-[#f8e7b0] active:scale-95"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                  >→</button>
                  <span />
                  <button
                    type="button"
                    data-testid="button-nudge-card-text-down"
                    aria-label="Move card text down"
                    onClick={() => nudgeSelectedText(0, 0.5)}
                    className="h-11 rounded-lg text-lg text-[#f8e7b0] active:scale-95"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                  >↓</button>
                  <span />
                </div>

                <div className="grid grid-cols-[48px_1fr_48px] items-center gap-3">
                  <button
                    type="button"
                    data-testid="button-decrease-card-text-size"
                    aria-label="Decrease card text size"
                    onClick={() => resizeSelectedText(-1)}
                    disabled={!textFieldKeys || Number(currentLayout[textFieldKeys.fontSize]) <= 6}
                    className="h-12 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.46)" }}
                  >−</button>
                  <span className="text-center font-fantasy text-[10px] text-[#e7cb80]">
                    Text size: {textFieldKeys ? Number(currentLayout[textFieldKeys.fontSize]).toFixed(0) : "—"}
                  </span>
                  <button
                    type="button"
                    data-testid="button-increase-card-text-size"
                    aria-label="Increase card text size"
                    onClick={() => resizeSelectedText(1)}
                    disabled={!textFieldKeys || Number(currentLayout[textFieldKeys.fontSize]) >= 32}
                    className="h-12 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                    style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.46)" }}
                  >+</button>
                </div>

                {selectedField === "name" && (
                  <div className="rounded-lg p-2.5" style={{ background: "rgba(0,0,0,.22)", border: "1px solid rgba(224,181,74,.18)" }}>
                    <p className="mb-2 text-center font-fantasy text-[9px] text-[#e7cb80]">
                      Title curve: {(currentLayout.nameCurve ?? 0) > 0 ? (currentLayout.nameCurve ?? 0).toFixed(0) : "Flat"}
                    </p>
                    <div className="grid grid-cols-[48px_1fr_48px] items-center gap-3">
                      <button
                        type="button"
                        data-testid="button-card-title-curve-decrease"
                        aria-label="Decrease card title curve"
                        onClick={() => adjustTitleCurve(-1)}
                        disabled={(currentLayout.nameCurve ?? 0) <= 0}
                        className="h-11 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                        style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                      >−</button>
                      <button
                        type="button"
                        data-testid="button-card-title-curve-flat"
                        onClick={() => setCurrentLayout({ ...currentLayout, nameCurve: 0 })}
                        className="h-11 rounded-lg font-fantasy text-[9px] text-[#f8e7b0] active:scale-95"
                        style={{ background: "rgba(118,76,10,.24)", border: "1px solid rgba(224,181,74,.46)" }}
                      >Flat</button>
                      <button
                        type="button"
                        data-testid="button-card-title-curve-increase"
                        aria-label="Increase card title curve"
                        onClick={() => adjustTitleCurve(1)}
                        disabled={(currentLayout.nameCurve ?? 0) >= 8}
                        className="h-11 rounded-lg text-xl text-[#f8e7b0] active:scale-95 disabled:opacity-40"
                        style={{ background: "#0c1710", border: "1px solid rgba(224,181,74,.36)" }}
                      >+</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCurrentLayout(defaultCardBorderLayout(layoutRarity))}
              className="rounded-xl py-3 font-fantasy text-[9px] tracking-wider text-white/55 active:scale-95"
              style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.12)" }}
            >
              Reset This Border
            </button>
            <button
              type="button"
              data-testid="button-save-card-border-layout"
              disabled={saveLayout.isPending}
              onClick={() => saveLayout.mutate()}
              className="flex items-center justify-center gap-2 rounded-xl py-3 font-fantasy text-[9px] tracking-wider active:scale-95 disabled:opacity-45"
              style={{ color: "#fff1ba", background: "linear-gradient(145deg,#8a5a10,#533306)", border: "1px solid #dbad48" }}
            >
              <Save className="h-4 w-4" /> Save Layout
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[300] overflow-y-auto px-4 py-7" style={{ background: "rgba(2,6,4,.96)" }}>
          <div className="mx-auto w-full max-w-[390px] rounded-2xl p-4" style={{ ...panelStyle, background: "#07110b" }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-fantasy text-sm text-[#f0d37d]">{editingCard ? "Edit Card" : "Add Card"}</p>
                <p className="mt-1 text-[9px] text-white/40">The selected rarity chooses the border automatically.</p>
              </div>
              <button type="button" aria-label="Close card editor" onClick={() => setShowForm(false)} className="grid h-9 w-9 place-items-center rounded-full text-[#e8cb79]" style={{ border: "1px solid rgba(224,181,74,.3)" }}><X className="h-5 w-5" /></button>
            </div>

            <div className="mx-auto mb-4 w-full max-w-[230px]">
              <CardPreview
                rarity={form.rarity}
                artworkUrl={form.artworkPreview}
                effectColor={form.effectColor || null}
                specialEffect={form.specialEffect || null}
                label={form.label || null}
                name={form.name || "Card Name"}
                description={form.description || "Card description"}
                layout={getCardBorderLayout(layouts, form.rarity)}
                showSparkles
              />
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">CARD ARTWORK</span>
                <span className="flex cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-[10px] text-[#f1da96] active:scale-[.99]" style={{ background: "rgba(118,76,10,.24)", border: "1px dashed rgba(224,181,74,.46)" }}>
                  <ImagePlus className="h-4 w-4" /> {form.artworkPreview ? "Replace Artwork" : "Upload Artwork"}
                  <input data-testid="input-card-artwork" type="file" accept="image/*" onChange={onArtwork} className="sr-only" />
                </span>
              </label>
              {form.artworkPreview && form.specialEffect !== "stars" && (
                <ArtworkEffectColorPicker
                  src={form.artworkPreview}
                  color={form.effectColor}
                  pickerX={form.effectPickerX}
                  pickerY={form.effectPickerY}
                  specialEffect={form.specialEffect}
                  onChange={(effectColor, effectPickerX, effectPickerY) => setForm((current) => ({ ...current, effectColor, effectPickerX, effectPickerY }))}
                  onAuto={() => {
                    void suggestArtworkEffectColor(form.artworkPreview).then((suggestion) => {
                      setForm((current) => ({ ...current, effectColor: suggestion.color, effectPickerX: suggestion.x, effectPickerY: suggestion.y }));
                    }).catch(() => undefined);
                  }}
                />
              )}
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">NAME</span>
                <input data-testid="input-card-name" maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ color: "#fff0bd", background: "#0a1710", border: "1px solid rgba(224,181,74,.3)" }} />
              </label>
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">RARITY</span>
                <select data-testid="select-card-rarity" value={form.rarity} onChange={(event) => setForm((current) => ({ ...current, rarity: Number(event.target.value) as CardRarity }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ color: "#fff0bd", background: "#0a1710", border: "1px solid rgba(224,181,74,.3)" }}>
                  {CARD_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{rarity} Star — uses {rarity}StarBorder.png</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">ARTWORK EFFECT</span>
                <select data-testid="select-card-special-effect" value={form.specialEffect} onChange={(event) => setForm((current) => ({ ...current, specialEffect: event.target.value as CardSpecialEffect | "" }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ color: "#fff0bd", background: "#0a1710", border: "1px solid rgba(224,181,74,.3)" }}>
                  <option value="">Standard rarity effect</option>
                  <option value="stars">Stars — shifting rainbow starfield</option>
                  <option value="aurora">Aurora Veil — drifting holographic color</option>
                  <option value="wisps">Moonfire Wisps — floating lights</option>
                </select>
                <span className="mt-1 block text-[9px] leading-4 text-white/45">A special effect replaces the usual artwork sparkles and swirls. Stars uses its own shifting rainbow palette. Aurora Veil and Moonfire Wisps use the artwork color picker above. The rarity border stays the same.</span>
              </label>
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">LABEL</span>
                <select data-testid="select-card-label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value as CardLabel | "" }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ color: "#fff0bd", background: "#0a1710", border: "1px solid rgba(224,181,74,.3)" }}>
                  <option value="">No label</option>
                  {CARD_LABELS.map((label) => <option key={label} value={label}>{CARD_LABEL_DETAILS[label].text}</option>)}
                </select>
                <span className="mt-1 block text-[9px] leading-4 text-white/45">The selected gold-trimmed banner appears diagonally across the card's upper-left corner.</span>
              </label>
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">SHORT DESCRIPTION — CARD FACE</span>
                <textarea data-testid="input-card-description" maxLength={600} rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none" style={{ color: "#fff0bd", background: "#0a1710", border: "1px solid rgba(224,181,74,.3)" }} />
                <span className="mt-1 block text-right text-[8px] text-white/30">{form.description.length}/600</span>
              </label>
              <label className="block">
                <span className="mb-1 block font-fantasy text-[9px] tracking-wider text-[#ddc175]">SECOND DESCRIPTION</span>
                <p className="mb-2 text-xs text-white/50">Players tap the short description on the enlarged card to read this.</p>
                <textarea data-testid="input-card-second-description" maxLength={10000} rows={7} value={form.secondDescription} onChange={event => setForm(current => ({ ...current, secondDescription: event.target.value }))} className="w-full rounded-xl border border-amber-200/30 bg-[#0a1710] px-3 py-2.5 text-sm text-[#fff0bd]" />
                <span className="mt-1 block text-right text-[8px] text-white/30">{form.secondDescription.length}/10000</span>
              </label>
            </div>

            <button type="button" data-testid="button-save-card" disabled={saveCard.isPending} onClick={submitCard} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-fantasy text-[10px] tracking-wider active:scale-[.99] disabled:opacity-45" style={{ color: "#fff0b0", background: "linear-gradient(145deg,#9b6715,#5c3807)", border: "1px solid #e8bc56" }}>
              <Save className="h-4 w-4" /> {saveCard.isPending ? "Saving..." : editingCard ? "Save Card Changes" : "Create Card"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
