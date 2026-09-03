export type PetArtworkForm = "base" | "evolution";

export function petTemplateQuery(templateId: string, form: PetArtworkForm = "base") {
  return {
    // Keep existing base keys; evolution must never poison a player's base cache.
    queryKey: form === "base" ? ["/api/pet-template-parts", templateId] : ["/api/pet-template-parts", templateId, form],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const suffix = form === "evolution" ? "?form=evolution" : "";
      const response = await fetch(`/api/pet-template-parts/${encodeURIComponent(templateId)}${suffix}`, { credentials: "include", signal });
      if (!response.ok) throw new Error("Failed to load pet template");
      return response.json();
    },
    enabled: !!templateId,
    staleTime: Infinity,
  };
}
