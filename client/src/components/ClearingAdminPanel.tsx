import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import "@/components/NpcAdminBridge";
import ClearingShopAdmin from "@/components/clearing/ClearingShopAdmin";
import {
  ClearingAdminHeader,
  ClearingAdminTabs,
  ClearingDropsAdmin,
  ClearingEnemiesAdmin,
  ClearingSpecialMobsAdmin,
  type ClearingAdminTab,
  type ClearingConfig,
} from "@/components/clearing/ClearingAdminSections";

type World = { id: string; name: string };
type Request = { method: string; url: string; body?: unknown; worldId?: string; success: string };

export default function ClearingAdminPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const worlds = useQuery<World[]>({ queryKey: ["/api/admin/clearing/worlds"] });
  const [world, setWorld] = useState<string>();
  const [tab, setTab] = useState<ClearingAdminTab>("drops");
  const selected = world ?? worlds.data?.[0]?.id;
  const config = useQuery<ClearingConfig>({
    queryKey: ["/api/admin/clearing/worlds", selected],
    enabled: !!selected,
  });
  const items = useQuery<any[]>({ queryKey: ["/api/admin/shop-items-all"] });
  const enemies = useQuery<any[]>({ queryKey: ["/api/admin/enemies"] });
  const shop = useQuery<any>({
    queryKey: ["/api/admin/clearing/worlds", selected, "shop"],
    enabled: !!selected,
  });

  useEffect(() => setTab("drops"), [selected]);

  const mutation = useMutation({
    mutationFn: ({ method, url, body }: Request) => apiRequest(method, url, body),
    onSuccess: (_response, request) => {
      void qc.invalidateQueries({ queryKey: ["/api/admin/clearing/worlds", request.worldId] });
      toast({ title: "Saved", description: request.success });
    },
    onError: (error: Error) =>
      toast({
        title: "Clearing update failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const act = (request: Request) => mutation.mutate({ ...request, worldId: selected });
  const selectedWorld = worlds.data?.find((value) => value.id === selected);

  if (worlds.isLoading || !selected) {
    return (
      <div className="space-y-3" aria-label="Loading Clearing administration">
        <div className="h-28 animate-pulse rounded-xl bg-amber-950/30" />
        <div className="h-52 animate-pulse rounded-xl bg-amber-950/30" />
      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-3 overflow-x-hidden text-amber-50">
      <ClearingAdminHeader
        worlds={worlds.data ?? []}
        selected={selected}
        selectedName={selectedWorld?.name ?? selected}
        onWorld={setWorld}
        config={config.data}
        shop={shop.data}
      />
      <ClearingAdminTabs active={tab} onChange={setTab} />

      {config.data?.missingEnemies && (
        <div className="rounded-xl border border-amber-500/70 bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-100 sm:text-sm">
          No enemies are assigned. The Clearing continues to use its existing temporary fallback.
        </div>
      )}

      {config.data?.hasBossWithoutRare && (
        <div
          role="alert"
          className="rounded-xl border border-red-400 bg-red-950/70 px-3 py-2.5 text-xs font-bold leading-5 text-red-100 sm:text-sm"
        >
          A boss is assigned without an effective Rare drop. Add a Rare drop or change the boss to Regular.
        </div>
      )}

      {config.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-amber-950/30" />
      ) : config.isError ? (
        <p role="alert" className="rounded-xl border border-red-400 p-3 text-red-200">
          Clearing assignments could not be loaded.
        </p>
      ) : (
        config.data && (
          <>
            {tab === "drops" && (
              <ClearingDropsAdmin
                worldId={selected}
                config={config.data}
                catalog={items.data ?? []}
                busy={mutation.isPending}
                act={act}
              />
            )}
            {tab === "enemies" && (
              <ClearingEnemiesAdmin
                key={selected}
                worldId={selected}
                config={config.data}
                catalog={enemies.data ?? []}
                busy={mutation.isPending}
                act={act}
              />
            )}
            {tab === "special-mobs" && (
              <ClearingSpecialMobsAdmin
                worldId={selected}
                config={config.data}
                catalog={items.data ?? []}
                busy={mutation.isPending}
                act={act}
              />
            )}
            {tab === "shop" && <ClearingShopAdmin worldId={selected} catalog={items.data ?? []} />}
          </>
        )
      )}
    </section>
  );
}
