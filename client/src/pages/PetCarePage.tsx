import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { FeedingOverlay } from "@/pages/PetHousePage";
import LoadingScreen from "@/components/LoadingScreen";

export default function PetCarePage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ inventoryId: string }>("/pet-care/:inventoryId");
  const inventoryId = params?.inventoryId ?? null;

  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: inventory = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });

  const pet = inventoryId
    ? inventory.find((it: any) => it.id === inventoryId && it.type === "pet")
    : null;

  const close = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  };

  if (isLoading || !user) return <LoadingScreen label="Loading…" />;

  if (!pet) {
    close();
    return null;
  }

  // The Feeding overlay was originally fed a `HousePet` shape from the pet-house
  // page (which derives from inventory). The raw inventory item has the same
  // fields plus `id` — we re-key it as `inventoryId` to match.
  const housePet = { ...pet, inventoryId: pet.id };

  return (
    <FeedingOverlay
      pet={housePet}
      user={user}
      onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
      onClose={close}
    />
  );
}
