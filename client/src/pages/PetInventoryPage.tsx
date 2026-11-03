import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { prepareInventoryPetVisualState, type InventoryVisualTarget } from "@/lib/activePetVisuals";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import petInvForestBg from "@assets/generated_images/pet_inventory_bg.png";
import PetInventory from "@/components/PetInventory";

export default function PetInventoryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: inventory, isError: inventoryError } = useQuery<InventoryVisualTarget[]>({
    queryKey: ["/api/inventory"],
    staleTime: 0,
  });
  const [readyForUser, setReadyForUser] = useState<string | null>(null);

  const lastUserRef = useRef<any>(null);
  if (user) lastUserRef.current = user;
  const resolvedUser = user ?? lastUserRef.current;

  useEffect(() => {
    const userId = resolvedUser?.id;
    if (!userId || !inventory || readyForUser === userId) return;
    const controller = new AbortController();
    let live = true;
    const finish = () => { if (live) setReadyForUser(userId); };
    // Always allow entry even if a slow/missing asset request cannot finish.
    // In-progress metadata requests are aborted when the budget expires.
    const timeout = window.setTimeout(() => { controller.abort(); finish(); }, 6000);
    void prepareInventoryPetVisualState({
      pets: inventory,
      cache: queryClient,
      signal: controller.signal,
    }).catch(() => 0).finally(() => {
      window.clearTimeout(timeout);
      finish();
    });
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [resolvedUser?.id, inventory, readyForUser]);

  if (!resolvedUser) return null;

  if (inventoryError || readyForUser !== resolvedUser.id) {
    return (
      <ViewportModalPortal>
        <div
          data-testid="pet-inventory-loading-page"
          className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center"
          style={{ backgroundColor: "#0b1d13", color: "#ffe9ad" }}
        >
          <div aria-hidden="true" className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(rgba(6,19,12,.43),rgba(6,19,12,.8)),url(${petInvForestBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            pointerEvents: "none",
          }} />
          <div className="relative w-full max-w-sm rounded-2xl px-6 py-8"
            style={{ background: "rgba(14,42,29,.95)", border: "1.5px solid #bf9a44", boxShadow: "0 12px 35px rgba(0,0,0,.55)" }}>
            <h1 className="font-fantasy text-xl font-bold tracking-wide text-[#ffdb86]">Your Companions</h1>
            <p className="mt-3 font-fantasy text-sm text-[#f6e5b7]" role="status" aria-live="polite">
              {inventoryError ? "Unable to load your pets." : "Preparing your pets and their adornments…"}
            </p>
            {inventoryError ? (
              <button type="button" className="mt-5 rounded-lg border border-[#c29a45] bg-[#224532] px-5 py-2 text-[#ffdb86]"
                onClick={() => { void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); }}>
                Try again
              </button>
            ) : (
              <div className="mx-auto mt-5 h-1.5 w-32 overflow-hidden rounded-full bg-[#153825]" aria-hidden="true">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[#e4b951]" />
              </div>
            )}
          </div>
          <button type="button" onClick={() => navigate("/")}
            className="relative mt-6 rounded-lg border border-[#bf9a44]/70 bg-[#102c20]/90 px-6 py-2 font-fantasy text-[#ffe9ad]">
            ← Back
          </button>
        </div>
      </ViewportModalPortal>
    );
  }

  return (
    <div className="absolute inset-0">
      <PetInventory
        user={resolvedUser}
        onClose={() => navigate("/")}
        onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], (old: any) => old ? { ...old, ...u } : u)}
        defaultTab="pets"
        pageMode
      />
    </div>
  );
}
