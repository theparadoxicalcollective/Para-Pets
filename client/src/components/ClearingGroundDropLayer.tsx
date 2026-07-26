import type { ClearingGroundDrop } from "@shared/clearingEquipment";
import ClearingGroundDropView from "./ClearingGroundDrop";
export default function ClearingGroundDropLayer({drops,collecting}:{drops:ClearingGroundDrop[];collecting:Set<string>}){return <>{drops.map(drop=><ClearingGroundDropView key={drop.dropId} drop={drop} state={collecting.has(drop.dropId)?"collecting":"available"}/>)}</>}
