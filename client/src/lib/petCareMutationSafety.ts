/** Await a Pet Care mutation without allowing mutateAsync's rejection to
 * escape a fire-and-forget event handler. React Query remains responsible for
 * the player-facing onError toast. */
export async function containPetCareMutation(
  mutation: () => Promise<unknown>,
  onContainedError: (error: unknown) => void,
): Promise<boolean> {
  try {
    await mutation();
    return true;
  } catch (error) {
    try { onContainedError(error); } catch {}
    return false;
  }
}
