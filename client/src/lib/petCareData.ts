export type PetCareRecord = Record<string, unknown>;

export function isPetCareRecord(value: unknown): value is PetCareRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Treat an incomplete inventory response as empty data, while rejecting a
 * malformed top-level payload so React Query can expose its recoverable error
 * state. Null rows are discarded before any Pet Care component reads them.
 */
export function parsePetCareInventory(value: unknown): PetCareRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Pet Care inventory response must be a JSON array");
  }

  return value.filter(isPetCareRecord);
}

export function parsePetCareUser(value: unknown): PetCareRecord | null {
  if (value === null) return null;
  if (!isPetCareRecord(value)) {
    throw new Error("Pet Care user response must be a JSON object");
  }
  return value;
}

export async function readPetCareJson(response: Response, resource: "inventory" | "user") {
  if (!response.ok) {
    throw new Error(`Pet Care ${resource} request failed (${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Pet Care ${resource} response was not valid JSON`);
  }

  return resource === "inventory"
    ? parsePetCareInventory(payload)
    : parsePetCareUser(payload);
}

export function finitePetCareStat(value: unknown, fallback: number, maximum = 100) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(maximum, numericValue))
    : fallback;
}
