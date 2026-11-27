import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WORLD_DEFINITION_LIST } from "@shared/worlds/worldRegistry";
import { hasRetainedLegacyWorld, worldLockedForPlayer } from "@shared/worlds/worldAccess";
import type { WorldScenePublication } from "@shared/worlds/worldScenePublication";
import { Lock, LockOpen } from "lucide-react";

export default function WorldAccessPanel() {
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const { toast } = useToast();
  const key = ["/api/world-scene-publications"];
  const access = useQuery<WorldScenePublication[]>({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(key[0], { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load world access");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid world access");
      return data;
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 20_000,
  });
  const names = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/worlds"] });
  const update = useMutation({
    mutationFn: async ({ worldId, locked }: { worldId: string; locked: boolean }) =>
      (await apiRequest("PUT", `/api/admin/worlds/${encodeURIComponent(worldId)}/lock`, { locked })).json(),
    onSuccess: (_response, { worldId, locked }) => {
      cache.setQueryData<WorldScenePublication[]>(key, current =>
        current?.map(world => world.worldId === worldId ? { ...world, locked } : world));
      void cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({ queryKey: ["/api/worlds", worldId, "player-scene"] });
      toast({ title: locked ? "World locked" : "World unlocked" });
    },
    onError: (error: Error) => toast({ title: "Could not update world access", description: error.message, variant: "destructive" }),
  });

  if (access.isLoading) return <p className="text-center text-amber-200">Loading worlds…</p>;
  if (access.isError || !access.data) return <div className="text-center text-amber-200">
    <p>Could not load world access.</p>
    <button className="mt-3 rounded-full border border-amber-600 px-4 py-2" onClick={() => void access.refetch()}>Retry</button>
  </div>;
  return <section data-testid="admin-world-access" className="space-y-3 text-[#f5d77b]">
    <p className="text-sm text-amber-100/80">Open a world to players when you're ready. Saved edits update that world automatically; admins can edit even when it is locked.</p>
    {WORLD_DEFINITION_LIST.map(world => {
      const name = names.data?.find(row => row.id === world.id)?.name ?? world.defaultName;
      const locked = worldLockedForPlayer(world.id, access.data);
      return <div key={world.id} data-testid={`admin-world-${world.id}`}
        className="rounded-xl border border-[#b99a4c]/60 bg-[#153523]/90 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-fantasy font-semibold">{name}</h3>
            <p className="text-xs text-amber-100/70">{locked ? "Locked · Coming Soon" : "Unlocked · Open to players"}</p>
          </div>
          <button type="button" role="switch" aria-checked={!locked}
            aria-label={`${name} player access`}
            data-testid={`toggle-world-lock-${world.id}`}
            disabled={update.isPending}
            className="flex shrink-0 items-center gap-2 rounded-full border border-[#b99a4c] bg-[#10271c] px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => update.mutate({ worldId: world.id, locked: !locked })}>
            {locked ? <Lock size={16} /> : <LockOpen size={16} />}
            {locked ? "Unlock" : "Lock"}
          </button>
        </div>
        {hasRetainedLegacyWorld(world.id) && <button type="button"
          className="mt-2 rounded-md border border-[#b99a4c]/60 px-3 py-1.5 text-xs text-amber-200"
          onClick={() => navigate(`/world/${world.id}?legacyView=1`)}>Open original map (admin)</button>}
      </div>;
    })}
  </section>;
}
