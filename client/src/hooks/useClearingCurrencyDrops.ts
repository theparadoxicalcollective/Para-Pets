import { useMutation,useQuery } from "@tanstack/react-query";
import { apiRequest,queryClient } from "@/lib/queryClient";
import type { ClearingCurrencyDrop } from "@shared/clearingEquipment";
export function useClearingCurrencyDrops(sessionId:string|null){const key=[`/api/clearing/currency-drops?sessionId=${sessionId??""}`];const drops=useQuery<ClearingCurrencyDrop[]>({queryKey:key,enabled:!!sessionId,refetchInterval:10_000});const collect=useMutation({mutationFn:async(id:string)=>(await apiRequest("POST",`/api/clearing/currency-drops/${id}/collect`,{sessionId})).json(),onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:key}),queryClient.invalidateQueries({queryKey:["/api/user"]})]);}});return{drops,collect};}
