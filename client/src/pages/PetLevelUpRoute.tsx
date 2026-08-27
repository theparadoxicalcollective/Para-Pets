import { useCallback, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoadingScreen from "@/components/LoadingScreen";
import PetLevelUpPage from "@/components/PetLevelUpPage";
import type { PowerUpItem } from "@/components/powerup/PowerUpModalTypes";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { fireLevelUp } from "@/lib/levelUpEvents";
import { stabilityDiagnostic } from "@/lib/stabilityDiagnostics";

interface InventoryItem {
  inventoryId: string;
  shopItemId: string;
  name: string;
  type: string;
  imageUrl: string | null;
  hatchedImageUrl: string | null;
  petTemplateId: string | null;
  petNickname: string | null;
  rarity: number | null;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  statBoostType: string | null;
  statBoostAmount: number | null;
  specialType: string | null;
  specialAmount: number | null;
  quantity: number;
}

function toLevelUpItem(item: InventoryItem): PowerUpItem {
  return {
    inventoryId: item.inventoryId,
    shopItemId: item.shopItemId,
    name: item.name,
    type: item.type,
    imageUrl: item.imageUrl,
    statBoostType: item.statBoostType,
    statBoostAmount: item.statBoostAmount,
    specialType: item.specialType,
    specialAmount: item.specialAmount,
    quantity: item.quantity,
  };
}

function RouteError({ message, onRetry, onClose }: { message: string; onRetry?: () => void; onClose: () => void }) {
  return (
    <main
      role="alert"
      data-testid="pet-level-up-route-error"
      style={{
        position: "fixed", inset: 0, display: "grid", placeItems: "center",
        padding: 24, background: "#060a09", color: "#fff8d9", textAlign: "center",
      }}
    >
      <section>
        <h1 style={{ color: "#f6d66d", fontFamily: "Georgia, serif", fontSize: 28 }}>Level Up couldn't load</h1>
        <p>{message}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
          <button type="button" onClick={onClose}>Go back</button>
        </div>
      </section>
    </main>
  );
}

export default function PetLevelUpRoute() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ inventoryId: string }>("/pet-level-up/:inventoryId");
  const inventoryId = params?.inventoryId ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [successEffect, setSuccessEffect] = useState<{ type: "level"; label: string } | null>(null);

  const inventoryQuery = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    queryFn: async () => {
      const response = await fetch("/api/inventory", { credentials: "include" });
      if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Inventory response was not a list");
      return data;
    },
  });

  const foundPet = inventoryId
    ? inventoryQuery.data?.find((item) => item.inventoryId === inventoryId && item.type === "pet")
    : null;
  const confirmedPetRef = useRef<InventoryItem | null>(null);
  if (foundPet) confirmedPetRef.current = foundPet;
  const pet = foundPet ?? (inventoryQuery.isFetching ? confirmedPetRef.current : null);

  const close = useCallback(() => navigate("/"), [navigate]);

  const useItemMutation = useMutation({
    mutationFn: async (item: PowerUpItem) => {
      if (!inventoryId) throw new Error("No pet was selected");
      const endpoint = item.type === "special"
        ? `/api/pet/${inventoryId}/use-special`
        : `/api/pet/${inventoryId}/power-up`;
      const response = await apiRequest("POST", endpoint, { itemInventoryId: item.inventoryId });
      return { data: await response.json(), item };
    },
    onSuccess: ({ data, item }) => {
      const amount = item.type === "special" ? item.specialAmount : item.statBoostAmount;
      setSuccessEffect({ type: "level", label: `+${amount ?? "?"} LVL pts` });
      if (pet && data?.petLevel && data.petLevel > pet.petLevel) {
        fireLevelUp(data.petLevel, pet.petNickname || pet.name, pet.petTemplateId, pet.inventoryId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests/daily"] });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Failed",
        description: error?.message || "Could not use Level Up item",
        variant: "destructive",
      });
    },
  });

  if (inventoryQuery.isLoading) return <LoadingScreen label="Loading Level Up…" />;
  if (inventoryQuery.isError) {
    return <RouteError message="Your pet and items are safe. Check your connection and try again." onRetry={() => void inventoryQuery.refetch()} onClose={close} />;
  }
  if (!pet) {
    return <RouteError message="That pet is no longer available." onClose={close} />;
  }

  const levelItems = (inventoryQuery.data ?? [])
    .filter((item) =>
      (item.type === "power_up" && item.statBoostType === "lvl") ||
      (item.type === "special" && item.specialType === "level")
    )
    .map(toLevelUpItem);

  return (
    <ErrorBoundary
      context="PetLevelUpRoute"
      resetKey={inventoryId}
      fallback={<RouteError message="The Level Up page hit a display problem. Your pet and items are safe." onClose={close} />}
    >
      <PetLevelUpPage
        petName={pet.petNickname || pet.name}
        petInventoryId={pet.inventoryId}
        petImage={pet.hatchedImageUrl || pet.imageUrl}
        petTemplateId={pet.petTemplateId}
        rarity={pet.rarity || 1}
        petLevel={pet.petLevel}
        petAtk={pet.petAtk ?? 50}
        petDef={pet.petDef ?? 50}
        petHealth={pet.petHealth ?? 1000}
        itemsRemaining={Infinity}
        items={levelItems}
        isPending={useItemMutation.isPending}
        subtitle={`Drag an XP item onto ${pet.petNickname || pet.name} to gain levels`}
        successEffect={successEffect}
        onUseItem={(item) => useItemMutation.mutate(item)}
        onSuccessAnimEnd={() => setSuccessEffect(null)}
        onClose={close}
      />
    </ErrorBoundary>
  );
}
