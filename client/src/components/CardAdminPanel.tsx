import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LayoutTemplate, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CardPreview from "@/components/CardPreview";
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
}

const EMPTY_FORM: CardFormState = {
  name: "",
  description: "",
  secondDescription: "",
  rarity: 1,
  artworkData: "",
  artworkPreview: "",
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

  const updateLayoutValue = (key: keyof CardBorderLayout, value: number) => {
    setCurrentLayout({ ...currentLayout, [key]: value });
  };

  const fieldControls = selectedField === "name"
    ? [
        ["Left", "nameX", 0, 96],
        ["Top", "nameY", 0, 96],
        ["Width", "nameWidth", 4, 100],
        ["Height", "nameHeight", 4, 50],
        ["Text Size", "nameFontSize", 6, 32],
      ] as const
    : [
        ["Left", "descriptionX", 0, 96],
        ["Top", "descriptionY", 0, 96],
        ["Width", "descriptionWidth", 4, 100],
        ["Height", "descriptionHeight", 4, 50],
        ["Text Size", "descriptionFontSize", 6, 32],
      ] as const;

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
            <p className="mt-2 text-[9px] leading-4 text-white/42">Choose a border, select a box, then drag it directly on the card. The controls below provide precise adjustments.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["name", "description"] as const).map((field) => (
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
                {field === "name" ? "Name Box" : "Description Box"}
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
            <p className="mb-3 font-fantasy text-[9px] tracking-wider text-[#e7cb80]">{selectedField === "name" ? "NAME BOX" : "DESCRIPTION BOX"} SETTINGS</p>
            <div className="space-y-3">
              {fieldControls.map(([label, key, min, max]) => {
                const value = Number(currentLayout[key]);
                const effectiveMax = key === "nameX" || key === "descriptionX"
                  ? 100 - Number(currentLayout[selectedField === "name" ? "nameWidth" : "descriptionWidth"])
                  : key === "nameY" || key === "descriptionY"
                    ? 100 - Number(currentLayout[selectedField === "name" ? "nameHeight" : "descriptionHeight"])
                    : key === "nameWidth" || key === "descriptionWidth"
                      ? 100 - Number(currentLayout[selectedField === "name" ? "nameX" : "descriptionX"])
                      : key === "nameHeight" || key === "descriptionHeight"
                        ? 100 - Number(currentLayout[selectedField === "name" ? "nameY" : "descriptionY"])
                        : max;
                return (
                  <label key={key} className="grid grid-cols-[58px_1fr_42px] items-center gap-2 text-[9px] text-white/55">
                    <span>{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={Math.max(min, effectiveMax)}
                      step={0.5}
                      value={Math.min(value, Math.max(min, effectiveMax))}
                      onChange={(event) => updateLayoutValue(key, Number(event.target.value))}
                      className="accent-amber-400"
                    />
                    <input
                      type="number"
                      min={min}
                      max={Math.max(min, effectiveMax)}
                      step={0.5}
                      value={Number(value.toFixed(1))}
                      onChange={(event) => updateLayoutValue(key, Number(event.target.value))}
                      className="w-full rounded px-1 py-1 text-center text-[9px] outline-none"
                      style={{ color: "#f8e7b0", background: "#09110c", border: "1px solid rgba(224,181,74,.25)" }}
                    />
                  </label>
                );
              })}
            </div>
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
                name={form.name || "Card Name"}
                description={form.description || "Card description"}
                layout={getCardBorderLayout(layouts, form.rarity)}
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
