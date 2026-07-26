import { useMutation,useQuery } from "@tanstack/react-query";
import { apiRequest,queryClient } from "@/lib/queryClient";
import type { ClearingGroundDrop } from "@shared/clearingEquipment";

export function useClearingGroundDrops(sessionId:string|null){
  const key=[`/api/clearing/drops?sessionId=${sessionId??""}`];
  const drops=useQuery<ClearingGroundDrop[]>({queryKey:key,enabled:!!sessionId,refetchInterval:15_000,staleTime:0});
  const collect=useMutation({mutationFn:async(dropId:string)=>(await apiRequest("POST",`/api/clearing/drops/${dropId}/collect`,{sessionId})).json(),onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:key}),queryClient.invalidateQueries({queryKey:["/api/clearing/inventory"]})]);}});
  return {drops,collect,key};
}
