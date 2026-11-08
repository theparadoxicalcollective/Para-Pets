import { useCallback, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoadingScreen from "@/components/LoadingScreen";
import PetPowerUpPage from "@/components/PetPowerUpPage";
import type { PowerUpItem } from "@/components/powerup/PowerUpModalTypes";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchAuthenticatedUser } from "@/lib/queryClient";
import { fireLevelUp } from "@/lib/levelUpEvents";
import { getPetPowerUpItems, remainingPetPowerUpSlots } from "@/lib/petPowerUpInventory";
import { petActionReturnPath } from "@/lib/petActionRoutes";

interface InventoryItem extends PowerUpItem {
  hatchedImageUrl: string | null;
  petTemplateId: string | null;
  petNickname: string | null;
  rarity: number | null;
  isHatched: boolean;
  petHealth: number;
  petAtk: number;
  petDef: number;
  petLevel: number;
  itemsUsedThisLevel: number;
}

function RouteError({ message, onRetry, onClose }: {
  message: string;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <main role="alert" data-testid="pet-power-up-route-error" data-stage-coordinate-space="viewport"
      style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center",
        padding: 24, background: "#07150d", color: "#fff2c2", textAlign: "center" }}>
      <section>
        <h1 style={{ color: "#e9c367", fontFamily: "Georgia, serif", fontSize: 26 }}>Power Up unavailable</h1>
        <p>{message}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
          <button type="button" onClick={onClose}>Go back</button>
        </div>
      </section>
    </main>
  );
}

/** Route-based wrapper for the unchanged Power Up presentation and server
 * actions. The pet is selected strictly by its owned inventory row, never
 * by activePetId. Home's original Power Up modal remains functional during
 * the avatar migration; Avatar 04/12 wires the inventory Pet Menu here.
 */
export default function PetPowerUpRoute() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ inventoryId: string }>("/pet-power-up/:inventoryId");
  const inventoryId = params?.inventoryId ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [successEffect, setSuccessEffect] = useState<{
    type: "stat" | "level" | "hatch"; label: string;
  } | null>(null);
  const inFlightRef = useRef(false);

  const close = useCallback(() =>
    navigate(petActionReturnPath(window.location.search)),
  [navigate]);

  const userQuery = useQuery<{ id: string; isAdmin?: boolean } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: ({ signal }) => fetchAuthenticatedUser(signal),
    staleTime: 20_000,
    retry: false,
  });
  const inventoryQuery = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/inventory", { credentials: "include", signal });
      if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("Inventory response was not a list");
      return value as InventoryItem[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const foundPet = inventoryId
    ? inventoryQuery.data?.find(item =>
        item.inventoryId === inventoryId && item.type === "pet" && item.isHatched)
    : null;
  // Inventory refresh after consuming an item should not unmount the pet or
  // Power Up animation. A vanished/unhatched pet is not retained after refetch.
  const confirmedPetRef = useRef<InventoryItem | null>(null);
  if (foundPet) confirmedPetRef.current = foundPet;
  const pet = foundPet ?? (inventoryQuery.isFetching ? confirmedPetRef.current : null);

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
      const label = item.specialType === "fill_evolution_node"
        ? "NODE FILLED!"
        : `+${amount ?? "?"} ${item.statBoostType === "health" ? "HP"
            : item.statBoostType === "atk" ? "ATK"
            : item.statBoostType === "def" ? "DEF" : "LVL pts"}`;
      setSuccessEffect({ type: item.type === "special" ? "level" : "stat", label });
      if (item.specialType === "fill_evolution_node") {
        window.dispatchEvent(new CustomEvent("pet_evolution_refresh"));
      }
      if (pet && data?.petLevel && data.petLevel > pet.petLevel) {
        fireLevelUp(data.petLevel, pet.petNickname || pet.name, pet.petTemplateId, pet.inventoryId);
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/quests/daily"] });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Power Up failed",
        description: error?.message || "Could not use that item.",
        variant: "destructive",
      });
    },
    onSettled: () => { inFlightRef.current = false; },
  });

  const onUseItem = (item: PowerUpItem) => {
    if (inFlightRef.current || useItemMutation.isPending || !pet) return;
    inFlightRef.current = true;
    useItemMutation.mutate(item);
  };

  if (userQuery.isLoading || inventoryQuery.isLoading) {
    return <LoadingScreen label="Loading Power Up…" />;
  }
  if (userQuery.isError || inventoryQuery.isError) {
    return <RouteError
      message="Your pet and items are safe. Check your connection and try again."
      onRetry={() => void Promise.all([userQuery.refetch(), inventoryQuery.refetch()])}
      onClose={close}
    />;
  }
  if (!userQuery.data) {
    return <RouteError message="Sign in to manage your pets." onClose={close} />;
  }
  if (!pet) {
    return <RouteError message="This pet is unavailable or has not hatched yet." onClose={close} />;
  }

  const { powerUpItems, specialItems } = getPetPowerUpItems(inventoryQuery.data ?? []);

  return (
    <div data-testid="pet-power-up-isolated-surface" data-stage-coordinate-space="viewport"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        zIndex: 1000, pointerEvents: "auto", touchAction: "pan-y" }}>
      <ErrorBoundary
        context="PetPowerUpRoute"
        resetKey={inventoryId}
        fallback={<RouteError message="Power Up encountered a display problem. Your pet and items are safe." onClose={close} />}
      >
        <PetPowerUpPage
          deviceSurface
          admin={userQuery.data.isAdmin === true}
          petName={pet.petNickname || pet.name}
          petInventoryId={pet.inventoryId}
          petImage={pet.hatchedImageUrl || pet.imageUrl}
          petTemplateId={pet.petTemplateId}
          rarity={pet.rarity || 1}
          petLevel={pet.petLevel}
          petAtk={pet.petAtk ?? 50}
          petDef={pet.petDef ?? 50}
          petHealth={pet.petHealth ?? 1000}
          itemsRemaining={remainingPetPowerUpSlots(pet.rarity, pet.petLevel, pet.itemsUsedThisLevel)}
          items={powerUpItems}
          specialItems={specialItems}
          isPending={useItemMutation.isPending}
          subtitle={`Drag an item onto ${pet.petNickname || pet.name} to boost their stats`}
          successEffect={successEffect}
          onUseItem={onUseItem}
          onSuccessAnimEnd={() => setSuccessEffect(null)}
          onClose={close}
        />
      </ErrorBoundary>
    </div>
  );
}
