import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuthenticatedUser } from "@/lib/queryClient";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import FishingLeaderboardPanel from "@/components/world/FishingLeaderboardPanel";
import { readHauntedFishingSpot } from "@/lib/hauntedFishingSpot";
import { HAUNTED_WOODS_WORLD_ID } from "@shared/worlds/hauntedWoods";
import type { WorldSceneFishingAction } from "@shared/worlds/worldSceneActions";

const FishingPage = lazy(() => import("@/pages/FishingPage"));
/** Reuse the normal fishing UI and leaderboard without mounting the old world
 * or fetching fishing equipment just to view the leaderboard. */
export default function WorldSceneFishingDialog({ action, onClose }: {
  action: WorldSceneFishingAction;
  onClose: () => void;
}) {
  const user = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: ({ signal }) => fetchAuthenticatedUser(signal),
    retry: false,
  });
  const spot = useQuery({
    queryKey: ["world-scene-haunted-fishing-spot"],
    queryFn: ({ signal }) => readHauntedFishingSpot(signal),
    enabled: action === "fishing-spot",
    // Keep this particular pond fixed for the entire open fishing session.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const ready = !!user.data?.id && (action === "fishing-leaderboard" || !!spot.data);
  const failed = (!user.isPending && !user.data?.id) ||
    (action === "fishing-spot" && spot.isError);

  const statusPanel = (loading: boolean) => (
    <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center text-amber-100">
      <div className="rounded-xl border border-[#b99952] bg-[#122a20] p-5">
        <p role={loading ? "status" : "alert"}>{loading ? "Opening fishing…" : "Couldn’t open fishing. Please try again."}</p>
        <div className="mt-4 flex justify-center gap-3">
          {!loading && <button type="button" className="rounded-lg border px-3 py-2" onClick={() => {
            if (!user.data?.id || user.isError) void user.refetch();
            if (action === "fishing-spot") void spot.refetch();
          }}>Retry</button>}
          <button type="button" className="rounded-lg border px-3 py-2" onClick={onClose}>Back to world</button>
        </div>
      </div>
    </div>
  );

  return <ViewportModalPortal>
    <div role="dialog" aria-modal="true" aria-label={action === "fishing-spot" ? "Haunted Woods fishing" : "Haunted Woods fishing leaderboard"}
      data-testid="world-scene-fishing-dialog" className="absolute inset-0 z-40 overflow-hidden bg-black/60">
      {!failed && ready ? action === "fishing-leaderboard" ?
        <FishingLeaderboardPanel worldId={HAUNTED_WOODS_WORLD_ID} currentUserId={user.data.id} onClose={onClose} /> :
        <Suspense fallback={statusPanel(true)}>
          <FishingPage locationId={spot.data!.id} locationName={spot.data!.name} bgUrl={spot.data!.bgUrl}
            worldId={HAUNTED_WOODS_WORLD_ID} user={user.data} inlineBackdrop onClose={onClose} />
        </Suspense> : statusPanel(!failed || user.isFetching || (action === "fishing-spot" && spot.isFetching))}
    </div>
  </ViewportModalPortal>;
}
