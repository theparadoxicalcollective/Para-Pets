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

export interface InventoryVisualTarget extends ActivePetVisualTarget {
  type: string;
  isHatched: boolean;
  rarity?: number | null;
  petLevel?: number | null;
}

/**
 * Warm the existing pet renderer's metadata cache before revealing Pet
 * Inventory. This reuses the Active Pet cache keys rather than inventing a
 * second renderer, and limits concurrent requests on mobile networks.
 * Full-size part image decoding remains with the visible renderer so opening
 * a large collection cannot exhaust Safari/Android memory.
 */
export async function prepareInventoryPetVisualState({
  pets, cache, signal, fetcher = fetch, concurrency = 3,
}: {
  pets: readonly InventoryVisualTarget[];
  cache: ActivePetVisualCache;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  concurrency?: number;
}): Promise<number> {
  const targets = pets
    .filter(pet => pet.type === "pet" && pet.isHatched && !!pet.inventoryId && !!pet.petTemplateId)
    .sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || (b.petLevel ?? 0) - (a.petLevel ?? 0));
  const count = Math.min(targets.length, Math.max(1, Math.min(3, Math.floor(concurrency) || 1)));
  let next = 0;
  let ready = 0;

  await Promise.all(Array.from({ length: count }, async () => {
    while (!signal.aborted) {
      const target = targets[next++];
      if (!target) return;
      const result = await prepareActivePetVisualState({
        pet: target, cache, signal, fetcher,
      }).catch(() => null);
      if (result && !signal.aborted) ready++;
    }
  }));
  return ready;
}
