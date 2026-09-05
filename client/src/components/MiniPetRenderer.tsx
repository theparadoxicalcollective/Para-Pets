import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { MiniPetAnimation, MiniPetPartType } from "@shared/miniPet";

export interface EquippedMiniPet {
  inventoryId: string;
  shopItemId: string;
  name: string;
  imageUrl: string | null;
  rarity: number;
  atkBoost: number;
  healthBoost: number;
  defBoost: number;
  animationStyle: MiniPetAnimation;
  parts: Array<{ id: string; partType: MiniPetPartType; imageUrl: string }>;
}

interface Props {
  petInventoryId: string;
  className?: string;
  style?: React.CSSProperties;
}

const ORDER: MiniPetPartType[] = ["tail", "left_wing", "right_wing", "body", "head", "left_ear", "right_ear", "eyes"];

export default function MiniPetRenderer({ petInventoryId, className = "", style }: Props) {
  const { data } = useQuery<{ equipped: EquippedMiniPet | null }>({
    queryKey: ["/api/pet", petInventoryId, "mini-pet"],
    queryFn: async () => (await apiRequest("GET", `/api/pet/${petInventoryId}/mini-pet`)).json(),
    enabled: !!petInventoryId,
    staleTime: 30_000,
  });
  const pet = data?.equipped;
  if (!pet) return null;
  const parts = [...(pet.parts ?? [])].sort((a, b) => ORDER.indexOf(a.partType) - ORDER.indexOf(b.partType));
  return (
    <div className={className} data-testid="equipped-mini-pet" aria-label={pet.name}
      style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "none", ...style }}>
      <style>{MINI_PET_MOTION}</style>
      <div className={pet.animationStyle === "float" ? "mini-pet-float" : "mini-pet-breath"} style={{ position: "absolute", inset: 0, transformOrigin: "center bottom" }}>
        {parts.length ? parts.map(part => (
          <img key={part.id} src={part.imageUrl} alt="" draggable={false} data-mini-pet-part={part.partType}
            className={part.partType.includes("wing") ? "mini-pet-wing" : part.partType === "tail" ? "mini-pet-tail" : part.partType.includes("ear") ? "mini-pet-ear" : ""}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", transformOrigin: "center bottom", filter: "drop-shadow(0 4px 7px rgba(0,0,0,.5))" }} />
        )) : pet.imageUrl ? (
          <img src={pet.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 7px rgba(0,0,0,.5))" }} />
        ) : null}
      </div>
    </div>
  );
}

const MINI_PET_MOTION = `
@keyframes miniPetBreath { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-.7%) scale(1.006,1.012)} }
@keyframes miniPetFloat { 0%,100%{transform:translateY(1%)} 50%{transform:translateY(-3%)} }
@keyframes miniPetWing { 0%,100%{rotate:-1deg} 50%{rotate:1.5deg} }
@keyframes miniPetTail { 0%,100%{rotate:-.8deg} 50%{rotate:1deg} }
@keyframes miniPetEar { 0%,88%,100%{rotate:0deg} 94%{rotate:.8deg} }
.mini-pet-breath{animation:miniPetBreath 4.8s ease-in-out infinite}
.mini-pet-float{animation:miniPetFloat 4.4s ease-in-out infinite}
.mini-pet-wing{animation:miniPetWing 4.2s ease-in-out infinite}
.mini-pet-tail{animation:miniPetTail 5.1s ease-in-out infinite}
.mini-pet-ear{animation:miniPetEar 5.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.mini-pet-breath,.mini-pet-float,.mini-pet-wing,.mini-pet-tail,.mini-pet-ear{animation:none!important}}
`;
