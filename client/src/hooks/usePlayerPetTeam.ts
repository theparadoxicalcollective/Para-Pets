import { useRef, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  playerPetTeamQueryKey, samePetTeam, type PlayerPetTeam,
} from "@/lib/playerPetTeam";

/**
 * One account-scoped source of truth for PvP, Raids and future main-page slots.
 * Writes are serialized (React Query v5 mutation scope) so quick taps cannot
 * cause a slower earlier response to replace a newer team. The local draft
 * stays visible until the final save succeeds; failures revert to the latest
 * server-confirmed selection and surface an error.
 */
export async function fetchPlayerPetTeam(signal?: AbortSignal): Promise<PlayerPetTeam> {
  const response = await fetch("/api/player/pet-team", { credentials: "include", signal });
  if (!response.ok) throw new Error(`Could not load your pet team (${response.status})`);
  return response.json();
}

type SaveRequest = { userId: string; ids: string[]; revision: number };

export function usePlayerPetTeam(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const teamQuery = useQuery<PlayerPetTeam>({
    queryKey: playerPetTeamQueryKey(userId),
    queryFn: ({ signal }) => fetchPlayerPetTeam(signal),
    enabled: !!userId,
    staleTime: 3_000,
    refetchOnMount: "always",
  });

  // A save can outlive the screen it began on. Keep the next screen from
  // starting a paid battle before that mutation has finished.
  const inFlightSaves = useIsMutating({ mutationKey: ["player-pet-team", userId ?? ""] });
  const [draft, setDraft] = useState<{ userId: string; ids: string[] } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const revisionRef = useRef(0);
  const currentDraft = userId && draft?.userId === userId ? draft.ids : null;
  const selectedPetIds = currentDraft ?? teamQuery.data?.petInventoryIds ?? [];

  const saveMutation = useMutation({
    // Network calls for this roster are serialized, including rapid taps.
    mutationKey: ["player-pet-team", userId ?? ""],
    scope: { id: "para-pets-player-team" },
    mutationFn: async ({ userId: savedUserId, ids }: SaveRequest) => {
      // Ignore a late initial GET that began before this write.
      await queryClient.cancelQueries({ queryKey: playerPetTeamQueryKey(savedUserId) });
      const response = await apiRequest("PUT", "/api/player/pet-team", { petInventoryIds: ids });
      const confirmed = await response.json() as PlayerPetTeam;
      // Update the account-scoped cache even if this screen has since unmounted.
      queryClient.setQueryData(playerPetTeamQueryKey(savedUserId), confirmed);
      // PvP's legacy server route still reads the same underlying database row.
      queryClient.invalidateQueries({ queryKey: ["/api/pvp/battle-group"] });
      return confirmed;
    },
    onSuccess: (_result, request) => {
      if (request.revision !== revisionRef.current) return;
      setDraft(null);
      setSaveError(null);
      setSaved(true);
    },
    onError: (error: unknown, request) => {
      if (request.revision !== revisionRef.current) return;
      setDraft(null);
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : "Could not save your pet team.");
    },
  });

  const saveTeam = (ids: string[], force = false): boolean => {
    // An outgoing screen may still be saving. Don't let a newly mounted
    // page edit its stale cached roster until that confirmed save finishes.
    if (!userId || !teamQuery.isSuccess || (inFlightSaves > 0 && currentDraft === null)) return false;
    if (!force && samePetTeam(ids, selectedPetIds)) return true;
    if (ids.length > 5 || new Set(ids).size !== ids.length ||
        ids.some((id) => typeof id !== "string" || !id.trim())) return false;
    const revision = ++revisionRef.current;
    setSaved(false);
    setSaveError(null);
    setDraft({ userId, ids: [...ids] });
    saveMutation.mutate({ userId, ids: [...ids], revision });
    return true;
  };

  return {
    team: teamQuery.data,
    selectedPetIds,
    isReady: teamQuery.isSuccess && !teamQuery.isFetching && !!userId &&
      (inFlightSaves === 0 || currentDraft !== null),
    isLoading: teamQuery.isPending || teamQuery.isFetching && !teamQuery.data,
    isSaving: currentDraft !== null || inFlightSaves > 0,
    saved,
    saveError: teamQuery.isError ? "Could not load your pet team." : saveError,
    saveTeam,
  };
}
