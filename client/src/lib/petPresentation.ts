import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { DEFAULT_PET_PRESENTATION, parsePetPresentation, type PetPresentation } from "@shared/petPresentation";
export function usePetPresentation(templateId: string, form = "base", view = "front", enabled = true) {
  const url = `/api/pet-presentation/${encodeURIComponent(templateId)}/${form}/${view}`;
  const client = useQueryClient();
  const query = useQuery({ queryKey: [url], enabled: !!templateId && enabled, queryFn: async ({ signal }) => {
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new Error("Could not load pet placement");
    return parsePetPresentation(await response.json());
  } });
  const save = useMutation({ mutationFn: async (value: PetPresentation) => {
    const response = await apiRequest("PUT", url, value);
    return parsePetPresentation(await response.json());
  }, onSuccess: value => client.setQueryData([url], value) });
  return { ...query, placement: query.data ?? DEFAULT_PET_PRESENTATION, save };
}
