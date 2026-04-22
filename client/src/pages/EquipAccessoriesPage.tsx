import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import PetEquipAccessoriesPage from "@/components/PetEquipAccessoriesPage";

interface InventoryItem {
  inventoryId: string;
  type: string;
  name: string;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  petTemplateId: string | null;
  petNickname: string | null;
  rarity: number | null;
}

interface AuthUser {
  id: string;
  activePetId: string | null;
}

export default function EquipAccessoriesPage() {
  const [, navigate] = useLocation();

  const { data: user } = useQuery<AuthUser>({ queryKey: ["/api/auth/me"] });
  const { data: inventory = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const activePet = user?.activePetId
    ? inventory.find(i => i.inventoryId === user.activePetId && i.type === "pet")
    : null;

  if (isLoading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(4,8,5,0.92)" }}>
        <p className="font-fantasy text-sm animate-pulse" style={{ color: "#5eead4" }}>Loading…</p>
      </div>
    );
  }

  if (!activePet) {
    navigate("/");
    return null;
  }

  return (
    <PetEquipAccessoriesPage
      petInventoryId={activePet.inventoryId}
      petName={activePet.petNickname || activePet.name}
      petImage={activePet.hatchedImageUrl || activePet.imageUrl}
      petTemplateId={activePet.petTemplateId}
      rarity={activePet.rarity || 1}
      onClose={() => navigate("/")}
    />
  );
}
