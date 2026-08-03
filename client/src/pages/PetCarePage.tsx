import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { FeedingOverlay } from "@/pages/PetHousePage";
import LoadingScreen from "@/components/LoadingScreen";
import { stabilityDiagnostic } from "@/lib/stabilityDiagnostics";
import ErrorBoundary from "@/components/ErrorBoundary";
import { parsePetCareInventory, parsePetCareUser, readPetCareJson } from "@/lib/petCareData";

export default function PetCarePage() {
  useEffect(() => {
    stabilityDiagnostic("component-mount", { component: "PetCarePage" });
    return () => stabilityDiagnostic("component-unmount", { component: "PetCarePage" });
  }, []);
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ inventoryId: string }>("/pet-care/:inventoryId");
  const inventoryId = params?.inventoryId ?? null;
  const feedHint = new URLSearchParams(window.location.search).get("feedHint") === "1";

  const userQuery = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => parsePetCareUser(await readPetCareJson(
      await fetch("/api/auth/me", { credentials: "include" }),
      "user",
    )),
  });
  const inventoryQuery = useQuery({
    queryKey: ["/api/inventory"],
    queryFn: async () => parsePetCareInventory(await readPetCareJson(
      await fetch("/api/inventory", { credentials: "include" }),
      "inventory",
    )),
  });
  const user = userQuery.data;
  const inventory = parsePetCareInventory(inventoryQuery.data ?? []);
  const isLoading = userQuery.isLoading || inventoryQuery.isLoading;

  const foundPet = inventoryId
    ? inventory.find((it) => it?.id === inventoryId && it?.type === "pet")
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

  useEffect(() => {
    const error = userQuery.error ?? inventoryQuery.error;
    if (!error) return;
    console.error("[PetCarePage:init] Pet Care initialization failed", {
      inventoryId,
      error,
      userStatus: userQuery.status,
      inventoryStatus: inventoryQuery.status,
    });
  }, [inventoryId, inventoryQuery.error, inventoryQuery.status, userQuery.error, userQuery.status]);

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

  const housePet = { ...pet, inventoryId: String(pet?.id ?? inventoryId ?? "") } as any;

  return (
    <ErrorBoundary
      context="PetCarePage.FeedingOverlay"
      resetKey={inventoryId}
      fallback={(
        <main className="pet-care-route-state" role="alert" data-testid="pet-care-render-error">
          <h1>Pet Care couldn't finish loading</h1>
          <p>Your pet and items are safe. Go back and try again.</p>
          <button type="button" onClick={close}>Go back</button>
        </main>
      )}
    >
      <FeedingOverlay
        pet={housePet}
        user={user}
        onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
        onClose={close}
        feedHint={feedHint}
        hideCoinDisplay={true}
      />
    </ErrorBoundary>
  );
}
