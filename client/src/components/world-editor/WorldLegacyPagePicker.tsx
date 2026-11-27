import { useQuery } from "@tanstack/react-query";

/** An existing *live* legacy location page, returned by the admin-only
 * catalog. Read only: existing building links retain their original artwork
 * and rollback metadata while the old worlds remain available. */
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
