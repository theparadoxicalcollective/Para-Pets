import { useQuery } from "@tanstack/react-query";

/** An existing *live* legacy location page, returned by the admin-only
 * catalog. Linking only references the page; it never copies or edits it. */
export type WorldLegacyPage = {
  id: string;
  worldId: string;
  worldName: string;
  name: string;
  type: string;
  bgUrl: string;
  isShop: boolean;
};

export function useWorldLegacyPages(worldId: string, enabled = true) {
  return useQuery<WorldLegacyPage[]>({
    queryKey: ["/api/admin/world-editor", worldId, "legacy-pages"],
    enabled: enabled && !!worldId,
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/world-editor/${encodeURIComponent(worldId)}/legacy-pages`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Could not load old world pages");
      return response.json();
    },
    staleTime: 60_000,
  });
}

type Props = {
  worldId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  preview?: boolean;
};

/** Shared by initial building creation and per-building edit controls. */
export default function WorldLegacyPagePicker({
  worldId, value, onChange, disabled, preview = false,
}: Props) {
  const pages = useWorldLegacyPages(worldId);
  const selected = pages.data?.find(page => page.id === value);
  const byWorld = new Map<string, WorldLegacyPage[]>();
  for (const page of pages.data ?? []) {
    const key = page.worldName;
    const group = byWorld.get(key) ?? [];
    group.push(page);
    byWorld.set(key, group);
  }

  return <div className="space-y-1" data-testid="world-legacy-page-picker">
    <label className="block text-xs font-semibold text-[#f3d890]">
      Add Old World Page
      <select aria-label="Add Old World Page"
        data-testid="select-world-legacy-page"
        className="mt-1 min-h-11 w-full rounded-lg border border-[#aa8d54]/75 bg-[#173b2a] px-2 text-xs text-[#f7e5b6]"
        value={value ?? ""} disabled={disabled || pages.isLoading || pages.isError}
        onChange={event => onChange(event.target.value || null)}>
        <option value="">No old page linked</option>
        {Array.from(byWorld, ([name, group]) => <optgroup key={name} label={name}>
          {group.map(page => <option key={page.id} value={page.id}>
            {page.name}{page.isShop ? " · Shop" : ""}
          </option>)}
        </optgroup>)}
      </select>
    </label>
    {pages.isLoading && <p className="text-[11px] text-amber-100/70">Loading old world pages…</p>}
    {pages.isError && <p role="alert" className="text-[11px] text-red-200">
      Could not load old world pages. Reopen the selector to retry.
    </p>}
    {value && !pages.isLoading && !selected && <p className="text-[11px] text-red-200">
      This linked old page is no longer available. Select another or clear it.
    </p>}
    {preview && selected && <>
      <img src={selected.bgUrl} alt={`${selected.name} original world page`}
        className="mx-auto max-h-36 w-full rounded-lg border border-[#b99a4c]/35 object-contain"
        loading="lazy"/>
      <p className="text-[11px] text-amber-100/70">
        Uses the original {selected.worldName} page image without changing its
        content, shop, quests, or saved decorations.
      </p>
    </>}
  </div>;
}
