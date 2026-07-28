import { useMutation,useQuery } from "@tanstack/react-query";
import { apiRequest,queryClient } from "@/lib/queryClient";
import type { ClearingCurrencyDrop } from "@shared/clearingEquipment";
import { mergePlayerCurrencyBalances, PLAYER_CURRENCY_QUERY_KEY, type PlayerCurrencyBalances } from "@/hooks/usePlayerCurrencyBalances";
export function useClearingCurrencyDrops(sessionId:string|null){
  const key=[`/api/clearing/currency-drops?sessionId=${sessionId??""}`];
  const drops=useQuery<ClearingCurrencyDrop[]>({queryKey:key,enabled:!!sessionId,refetchInterval:10_000});
  const collect=useMutation({mutationFn:async(id:string)=>(await apiRequest("POST",`/api/clearing/currency-drops/${id}/collect`,{sessionId})).json(),onSuccess:async(result:{balances?:PlayerCurrencyBalances})=>{
    if(result.balances)queryClient.setQueryData(PLAYER_CURRENCY_QUERY_KEY,(current:any)=>mergePlayerCurrencyBalances(current,result.balances!));
    queryClient.setQueryData<ClearingCurrencyDrop[]>(key,current=>current?.filter(drop=>drop.dropId!==(result as any).drop?.dropId));
    await Promise.all([queryClient.invalidateQueries({queryKey:key}),queryClient.invalidateQueries({queryKey:PLAYER_CURRENCY_QUERY_KEY})]);
  }});return{drops,collect};
}
