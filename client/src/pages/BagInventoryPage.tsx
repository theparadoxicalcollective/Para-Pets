import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PetInventory from "@/components/PetInventory";

export default function BagInventoryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  if (!user) return null;

  return (
    <div className="absolute inset-0">
      <PetInventory
        user={user}
        onClose={() => navigate("/")}
        onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
        defaultTab="bag"
        pageMode
      />
    </div>
  );
}
