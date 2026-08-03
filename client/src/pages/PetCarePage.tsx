import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { FeedingOverlay } from "@/pages/PetHousePage";
import LoadingScreen from "@/components/LoadingScreen";
import { stabilityDiagnostic } from "@/lib/stabilityDiagnostics";

export default function PetCarePage() {
  useEffect(() => {
    stabilityDiagnostic("component-mount", { component: "PetCarePage" });
    return () => stabilityDiagnostic("component-unmount", { component: "PetCarePage" });
  }, []);
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ inventoryId: string }>("/pet-care/:inventoryId");
  const inventoryId = params?.inventoryId ?? null;
  const feedHint = new URLSearchParams(window.location.search).get("feedHint") === "1";

  const userQuery = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const inventoryQuery = useQuery<any[]>({
    queryKey: ["/api/inventory"],
  });
  const user = userQuery.data;
  const inventory = inventoryQuery.data ?? [];
  const isLoading = userQuery.isLoading || inventoryQuery.isLoading;

  const foundPet = inventoryId
    ? inventory.find((it: any) => it.id === inventoryId && it.type === "pet")
    : null;
  const confirmedPetRef = useRef<any>(null);
  if (foundPet) confirmedPetRef.current = foundPet;
  const pet = foundPet ?? (inventoryQuery.isFetching ? confirmedPetRef.current : null);

  const hasRedirectedRef = useRef(false);

  const close = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  };

  // Navigation is a side effect. Running it while React is rendering can
  // repeatedly update the router when a stale or deleted pet URL is opened.
  useEffect(() => {
    if (isLoading || userQuery.isError || inventoryQuery.isError || !user || pet || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    close();
  }, [inventoryQuery.isError, isLoading, pet, user, userQuery.isError]);

  if (userQuery.isError || inventoryQuery.isError) {
    return (
      <main className="pet-care-route-state" role="alert" data-testid="pet-care-error">
        <h1>Pet Care couldn't load</h1>
        <p>Your pet and items are safe. Check your connection and try again.</p>
        <div>
          <button type="button" onClick={() => void Promise.all([userQuery.refetch(), inventoryQuery.refetch()])}>Try again</button>
          <button type="button" onClick={close}>Go back</button>
        </div>
      </main>
    );
  }

  if (isLoading || !user) return <LoadingScreen label="Loading…" />;

  if (!pet) {
    return null;
  }

  const housePet = { ...pet, inventoryId: pet.id };

  return (
    <FeedingOverlay
      pet={housePet}
      user={user}
      onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
      onClose={close}
      feedHint={feedHint}
      hideCoinDisplay={true}
    />
  );
}
