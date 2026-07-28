import { useMutation,useQuery } from "@tanstack/react-query";
import { apiRequest,queryClient } from "@/lib/queryClient";
import type { ClearingInventoryItem,ClearingLoadoutResponse,ClearingEquipmentSlot } from "@shared/clearingEquipment";

const inventoryKey=["/api/clearing/inventory"],loadoutKey=["/api/clearing/loadout"];
export function useClearingEquipment(){
  const inventory=useQuery<ClearingInventoryItem[]>({queryKey:inventoryKey});
  const loadout=useQuery<ClearingLoadoutResponse>({queryKey:loadoutKey});
  const refresh=async()=>Promise.all([queryClient.invalidateQueries({queryKey:inventoryKey}),queryClient.invalidateQueries({queryKey:loadoutKey})]);
  const equip=useMutation({mutationFn:async(inventoryId:string)=>(await apiRequest("POST","/api/clearing/loadout/equip",{inventoryId})).json(),onSuccess:refresh});
  const unequip=useMutation({mutationFn:async(slot:ClearingEquipmentSlot)=>(await apiRequest("POST","/api/clearing/loadout/unequip",{slot})).json(),onSuccess:refresh});
  const sell=useMutation({mutationFn:async(inventoryIds:string[])=>(await apiRequest("POST","/api/clearing/inventory/sell",{inventoryIds})).json(),onSuccess:async()=>{await refresh();await queryClient.invalidateQueries({queryKey:["/api/auth/me"]});}});
  return {inventory,loadout,equip,unequip,sell};
}
