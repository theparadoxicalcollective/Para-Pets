import { useQuery } from "@tanstack/react-query";

// Same NPCs managed by Admin > NPCs; no duplicate art or dialogue uploads.
export type WorldNpcCatalogEntry = {
  id: string; name: string; type: string; worldId: string;
  imageUrl: string | null; specialSkill?: string | null;
};
export function useWorldNpcCatalog(enabled = true) {
  return useQuery<WorldNpcCatalogEntry[]>({
    queryKey: ["/api/shop/__npc_catalog__", "world-editor-npcs"],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/shop/__npc_catalog__", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load saved NPCs");
      const items = await response.json() as WorldNpcCatalogEntry[];
      return items.filter(item => item.type === "npc" &&
        item.worldId === "__npc_catalog__" && item.imageUrl)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 60_000,
  });
}
