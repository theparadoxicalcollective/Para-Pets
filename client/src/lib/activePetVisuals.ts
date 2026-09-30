import { petTemplateQuery, type PetArtworkForm } from "./petTemplateQuery";

export interface ActivePetVisualTarget {
  inventoryId: string;
  petTemplateId: string | null;
}

export interface ActivePetVisualCache {
  getQueryData<T = unknown>(queryKey: readonly unknown[]): T | undefined;
  setQueryData<T = unknown>(queryKey: readonly unknown[], value: T): unknown;
}

export interface PreparedActivePetVisualState {
  artworkForm: PetArtworkForm;
  costumeData: any;
  templateData: any;
  miniPetData: any | null;
}

interface PrepareActivePetVisualStateOptions {
  pet: ActivePetVisualTarget;
  cache: ActivePetVisualCache;
  signal: AbortSignal;
  fetcher?: typeof fetch;
}

async function fetchJson(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<any | null> {
  const response = await fetcher(url, { credentials: "include", signal });
  if (!response.ok || signal.aborted) return null;
  const data = await response.json();
  if (signal.aborted) return null;
  return data;
}

/**
 * Seed the exact React Query entries used by the owned-pet renderer before an
 * active pet becomes visible. This intentionally prepares metadata only; image
 * decoding stays under the renderer's existing mobile-memory safeguards.
 */
export async function prepareActivePetVisualState({
  pet,
  cache,
  signal,
  fetcher = fetch,
}: PrepareActivePetVisualStateOptions): Promise<PreparedActivePetVisualState | null> {
  if (!pet.inventoryId || !pet.petTemplateId || signal.aborted) return null;

  const costumeKey = ["/api/pet", pet.inventoryId, "costumes", "owner"] as const;
  const miniPetKey = ["/api/pet", pet.inventoryId, "mini-pet", "owner"] as const;

  let costumeData = cache.getQueryData<any>(costumeKey);
  const miniPetPromise = (async () => {
    const cached = cache.getQueryData<any>(miniPetKey);
    if (cached !== undefined) return cached;

    try {
      const data = await fetchJson(
        `/api/pet/${encodeURIComponent(pet.inventoryId)}/mini-pet`,
        signal,
        fetcher,
      );
      if (data !== null && !signal.aborted) cache.setQueryData(miniPetKey, data);
      return data;
    } catch {
      return null;
    }
  })();

  if (costumeData === undefined) {
    try {
      costumeData = await fetchJson(
        `/api/pet/${encodeURIComponent(pet.inventoryId)}/costumes`,
        signal,
        fetcher,
      );
    } catch {
      return null;
    }
    if (costumeData === null || signal.aborted) return null;
    cache.setQueryData(costumeKey, costumeData);
  }

  const artworkForm: PetArtworkForm = costumeData?.isEvolved ? "evolution" : "base";
  const templateQuery = petTemplateQuery(pet.petTemplateId, artworkForm);
  let templateData = cache.getQueryData<any>(templateQuery.queryKey);

  if (templateData === undefined) {
    const suffix = artworkForm === "evolution" ? "?form=evolution" : "";
    try {
      templateData = await fetchJson(
        `/api/pet-template-parts/${encodeURIComponent(pet.petTemplateId)}${suffix}`,
        signal,
        fetcher,
      );
    } catch {
      return null;
    }
    if (templateData === null || signal.aborted) return null;
    cache.setQueryData(templateQuery.queryKey, templateData);
  }

  const miniPetData = await miniPetPromise;
  if (signal.aborted) return null;

  return {
    artworkForm,
    costumeData,
    templateData,
    miniPetData,
  };
}
