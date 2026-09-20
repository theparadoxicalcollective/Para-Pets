import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface PrizeOption {
  id: string;
  name: string;
  type: string;
  image_url: string | null;
  egg_image_url: string | null;
  star_rarity: number | null;
  rarity: number | null;
  price: number;
}

interface PrizeOptions {
  items: PrizeOption[];
  eggs: PrizeOption[];
  selectedItemIds: string[];
  selectedEggIds: string[];
}

function optionRarity(option: PrizeOption): number {
  const explicit = Number(option.star_rarity ?? option.rarity);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.max(1, Math.min(5, Math.floor(explicit)));
  const price = Number(option.price ?? 0);
  if (price >= 1000) return 5;
  if (price >= 500) return 4;
  if (price >= 250) return 3;
  if (price >= 100) return 2;
  return 1;
}

function typeLabel(type: string): string {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function SlotPrizeAdminDialog({ kind, onClose, onSaved }: {
  kind: "items" | "eggs";
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [options, setOptions] = useState<PrizeOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/admin/haunted-casino/prizes", { credentials: "include", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load prizes");
        return data as PrizeOptions;
      })
      .then(data => {
        const available = data[kind];
        const ids = kind === "eggs" ? data.selectedEggIds : data.selectedItemIds;
        setOptions(available);
        // The server is authoritative about the saved selection. Keeping these
        // ids intact makes reopening the editor an edit operation instead of a
        // blank/reset flow. Any stale ids are surfaced below and are never
        // silently re-enabled as prizes.
        setSelected(new Set(ids));
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Could not load prizes"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind]);

  const optionById = useMemo(() => new Map(options.map(option => [option.id, option])), [options]);
  const selectedOptions = useMemo(
    () => options.filter(option => selected.has(option.id)),
    [options, selected],
  );
  const unavailableSelectedIds = useMemo(
    () => [...selected].filter(id => !optionById.has(id)),
    [optionById, selected],
  );

  const itemTypes = useMemo(() => (
    [...new Set(options.map(option => option.type).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  ), [options]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return options.filter(option => {
      if (term && !option.name.toLowerCase().includes(term)) return false;
      if (kind === "items" && typeFilter !== "all" && option.type !== typeFilter) return false;
      if (rarityFilter !== "all" && optionRarity(option) !== Number(rarityFilter)) return false;
      if (selectedOnly && !selected.has(option.id)) return false;
      return true;
    });
  }, [kind, options, rarityFilter, search, selected, selectedOnly, typeFilter]);

  const togglePrize = (id: string, checked: boolean) => {
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const save = async () => {
    if (saving || loading) return;
    setSaving(true);
    setError(null);
    try {
      // Drop only stale/deleted ids when the admin saves. Existing valid
      // selections stay checked and can be added to/removed individually.
      const ids = [...selected].filter(id => optionById.has(id));
      const response = await fetch(`/api/admin/haunted-casino/prizes/${kind}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error((await response.json()).message || "Could not save prizes");
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save prizes");
    } finally {
      setSaving(false);
    }
  };

  return <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/80" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] flex max-h-[80dvh] w-[calc(100%-24px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-amber-300/50 bg-[#10091d] p-4 text-amber-50 shadow-2xl">
        <Dialog.Title className="pr-10 font-fantasy text-xl">Slot {kind === "eggs" ? "Pet Egg" : "Item"} Prizes</Dialog.Title>
        <Dialog.Description className="mt-2 text-xs text-amber-100/70">
          {kind === "eggs" ? "Three mystery eggs award one of the selected pet eggs. Uncheck an egg to remove it." : "Choose the items players can win. Edibles use the treat symbol; other items use the mystery-prize symbol. PvP tickets are not eligible. 50–500 coin spins favor 1–2★ prizes; 1,000+ coin spins award only 3★ or higher items."}
        </Dialog.Description>
        <Dialog.Close disabled={saving} aria-label="Close prize editor" className="absolute right-2 top-2 h-11 w-11 text-2xl">×</Dialog.Close>

        <section data-testid="slot-current-prizes" className="mt-3 rounded-xl border border-amber-300/25 bg-amber-950/20 p-2">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-100">
            <span>Currently selected</span>
            <span>{selectedOptions.length} active</span>
          </div>
          {loading ? <p className="mt-1 text-xs text-amber-100/60">Loading saved prizes…</p> : selectedOptions.length > 0 ? (
            <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {selectedOptions.map(option => <button key={option.id} type="button" disabled={saving} onClick={() => togglePrize(option.id, false)}
                className="rounded-full border border-amber-300/25 bg-black/35 px-2 py-1 text-[10px] text-amber-50 disabled:opacity-40" title={`Remove ${option.name}`}>
                {option.name} <span aria-hidden="true">×</span>
              </button>)}
            </div>
          ) : <p className="mt-1 text-xs text-amber-100/60">No {kind === "eggs" ? "pet eggs" : "items"} are selected yet.</p>}
          {!loading && unavailableSelectedIds.length > 0 && <p role="status" className="mt-2 text-[10px] text-rose-200/90">
            {unavailableSelectedIds.length} previously saved {unavailableSelectedIds.length === 1 ? "prize is" : "prizes are"} no longer eligible and will be removed when you save.
          </p>}
        </section>

        <label className="mt-3 text-xs">Search {kind}
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" className="mt-1 w-full rounded-lg border border-amber-200/30 bg-black/40 px-3 py-2 text-sm" />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {kind === "items" && <label>Item type
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} disabled={loading || saving}
              className="mt-1 w-full rounded-lg border border-amber-200/30 bg-[#160d25] px-2 py-2 text-sm">
              <option value="all">All item types</option>
              {itemTypes.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}
            </select>
          </label>}
          <label className={kind === "eggs" ? "col-span-2" : undefined}>Rarity
            <select value={rarityFilter} onChange={event => setRarityFilter(event.target.value)} disabled={loading || saving}
              className="mt-1 w-full rounded-lg border border-amber-200/30 bg-[#160d25] px-2 py-2 text-sm">
              <option value="all">All rarities</option>
              {[1, 2, 3, 4, 5].map(rarity => <option key={rarity} value={rarity}>{rarity}★</option>)}
            </select>
          </label>
        </div>
        <label className="mt-2 flex min-h-9 items-center gap-2 text-xs text-amber-100/80">
          <input type="checkbox" checked={selectedOnly} disabled={loading || saving} onChange={event => setSelectedOnly(event.target.checked)} />
          Show selected prizes only
        </label>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {loading && <p role="status">Loading prizes…</p>}
          {!loading && filteredOptions.map(option => (
            <label key={option.id} className="mb-1 flex min-h-14 cursor-pointer items-center gap-3 rounded-lg bg-white/5 p-2">
              <input type="checkbox" disabled={saving} checked={selected.has(option.id)} onChange={event => togglePrize(option.id, event.target.checked)} />
              {(kind === "eggs" ? option.egg_image_url : option.image_url) ? (
                <img src={(kind === "eggs" ? option.egg_image_url : option.image_url) ?? ""} alt="" className="h-10 w-10 object-contain" />
              ) : <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-950/70 text-lg text-amber-200">★</span>}
              <span className="min-w-0 flex-1 text-sm">{option.name}<span className="block text-xs text-amber-100/60">{optionRarity(option)}★{kind === "items" ? ` · ${typeLabel(option.type)}` : ""}</span></span>
            </label>
          ))}
          {!loading && options.length === 0 && <p className="text-sm">No eligible {kind} yet. Add them in the administration realm first.</p>}
          {!loading && options.length > 0 && filteredOptions.length === 0 && <p className="py-4 text-center text-sm text-amber-100/70">No prizes match these filters.</p>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-200">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span>{selectedOptions.length} active · {filteredOptions.length} shown</span>
          <button type="button" disabled={loading || saving || selected.size === 0} onClick={() => setSelected(new Set())} className="min-h-11 px-2 underline">Clear selection</button>
          <button type="button" disabled={loading || saving || (options.length === 0 && !!error)} onClick={() => void save()} className="min-h-11 rounded-lg border border-amber-300/50 bg-emerald-950 px-4 font-bold disabled:opacity-40">{saving ? "Saving…" : "Save prizes"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
