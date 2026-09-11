import { useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import PetInventory from "@/components/PetInventory";

export default function PetInventoryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });

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
