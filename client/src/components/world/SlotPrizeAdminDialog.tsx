import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface PrizeOption {
  id: string;
  name: string;
  type: string;
  image_url: string | null;
  egg_image_url: string | null;
  star_rarity: number | null;
  rarity: number | null;
}

interface PrizeOptions {
  items: PrizeOption[];
  eggs: PrizeOption[];
  selectedItemIds: string[];
  selectedEggIds: string[];
}

export default function SlotPrizeAdminDialog({ kind, onClose, onSaved }: {
  kind: "items" | "eggs";
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [options, setOptions] = useState<PrizeOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
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
        setSelected(new Set(ids.filter(id => available.some(option => option.id === id))));
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Could not load prizes"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind]);

  const save = async () => {
    if (saving || loading) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/haunted-casino/prizes/${kind}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
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
          {kind === "eggs" ? "Three mystery eggs award one of the selected pet eggs. Uncheck an egg to remove it." : "Choose the items players can win. Edibles use the treat symbol; other items use the mystery-prize symbol."}
        </Dialog.Description>
        <Dialog.Close disabled={saving} aria-label="Close prize editor" className="absolute right-2 top-2 h-11 w-11 text-2xl">×</Dialog.Close>
        <label className="mt-3 text-xs">Search {kind}
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" className="mt-1 w-full rounded-lg border border-amber-200/30 bg-black/40 px-3 py-2 text-sm" />
        </label>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {loading && <p role="status">Loading prizes…</p>}
          {!loading && options.filter(option => option.name.toLowerCase().includes(search.toLowerCase())).map(option => (
            <label key={option.id} className="mb-1 flex min-h-14 cursor-pointer items-center gap-3 rounded-lg bg-white/5 p-2">
              <input type="checkbox" disabled={saving} checked={selected.has(option.id)} onChange={event => {
                const checked = event.target.checked;
                setSelected(current => { const next = new Set(current); if (checked) next.add(option.id); else next.delete(option.id); return next; });
              }} />
              <img src={(kind === "eggs" ? option.egg_image_url : option.image_url) ?? ""} alt="" className="h-10 w-10 object-contain" />
              <span className="min-w-0 flex-1 text-sm">{option.name}<span className="block text-xs text-amber-100/60">{option.star_rarity ?? option.rarity ?? 1}★</span></span>
            </label>
          ))}
          {!loading && options.length === 0 && <p className="text-sm">No eligible {kind} yet. Add them in the administration realm first.</p>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-200">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span>{selected.size} prizes selected</span>
          <button type="button" disabled={loading || saving || options.length === 0} onClick={() => setSelected(new Set())} className="min-h-11 px-2 underline">Clear selection</button>
          <button type="button" disabled={loading || saving || (options.length === 0 && !!error)} onClick={() => void save()} className="min-h-11 rounded-lg border border-amber-300/50 bg-emerald-950 px-4 font-bold disabled:opacity-40">{saving ? "Saving…" : "Save prizes"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
