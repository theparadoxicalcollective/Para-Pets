/** A disposed account's startup request must never seed the next account's cache. */
export async function fetchStartupInventory(
  signal: AbortSignal,
  seed: (items: any[]) => void,
  fetcher: typeof fetch = fetch,
): Promise<any[] | null> {
  const response = await fetcher("/api/inventory", { credentials: "include", signal });
  if (!response.ok || signal.aborted) return null;
  const items: unknown = await response.json();
  // Cancellation can occur while the response body is still being decoded.
  if (signal.aborted || !Array.isArray(items)) return null;
  seed(items);
  return items;
}
