import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BJ_EVENT, bjGetStep, bjSetStep } from "@/lib/beginJourney";
import PetInventory from "@/components/PetInventory";

export default function PetInventoryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const [tutorialStep, setTutorialStep] = useState<number | "done" | null>(() => bjGetStep());
  const { data: inventory } = useQuery<any[]>({
    queryKey: ["/api/inventory"],
    enabled: tutorialStep === 2 || tutorialStep === 3,
    staleTime: 0,
  });

  useEffect(() => {
    const syncTutorialStep = () => setTutorialStep(bjGetStep());
    window.addEventListener(BJ_EVENT, syncTutorialStep);
    return () => window.removeEventListener(BJ_EVENT, syncTutorialStep);
  }, []);

  // Legacy-account compatibility: players who already have hatched pets but no
  // unhatched egg cannot complete the egg-only tutorial section. Skip them past
  // egg selection, egg tapping, and hatch-time potion training to the final step.
  // Truly new players with no pets are intentionally left on step 2 so the
  // starter-egg grant flow can still run normally.
  useEffect(() => {
    if ((tutorialStep !== 2 && tutorialStep !== 3) || !inventory) return;

    const pets = inventory.filter((item: any) => item.type === "pet");
    const hasAnyPet = pets.length > 0;
    const hasUnhatchedEgg = pets.some((item: any) => item.isHatched === false);

    if (hasAnyPet && !hasUnhatchedEgg) {
      bjSetStep(6);
      navigate("/");
    }
  }, [tutorialStep, inventory, navigate]);

  const lastUserRef = useRef<any>(null);
  if (user) lastUserRef.current = user;

  const resolvedUser = user ?? lastUserRef.current;
  if (!resolvedUser) return null;

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
