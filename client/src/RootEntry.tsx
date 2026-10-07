import { type CSSProperties, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import App from "./App";
import AuthPage from "@/pages/AuthPage";
import EmailGateScreen from "@/components/EmailGateScreen";
import LoadingScreen from "@/components/LoadingScreen";
import GinnyQuestOverlay from "@/components/GinnyQuestOverlay";
import JansonQuestOverlay from "@/components/JansonQuestOverlay";
import LonelleQuestOverlay from "@/components/LonelleQuestOverlay";
import { fetchAuthenticatedUser, queryClient } from "./lib/queryClient";
import { calculateViewportSurfaceRect, getStageTransform } from "@/lib/stage";
import { useStageViewportLayout } from "@/lib/stageViewport";
import PortraitOrientationBlocker from "@/components/PortraitOrientationBlocker";

function RootStage({ children }: { children: ReactNode }) {
  const layout = useStageViewportLayout();
  const surface = calculateViewportSurfaceRect(layout);
  const expandedStage = layout.coordinateOwner === "stage";

  return (
    <div
      className="game-stage-shell"
      style={{ position: "fixed", inset: 0, background: "#020806" }}
    >
      <div
        id="game-stage"
        data-design-width={layout.designWidth}
        data-design-height={layout.designHeight}
        data-coordinate-owner={layout.coordinateOwner}
        data-reference-portrait={layout.referencePortrait ? "true" : "false"}
        style={{
          position: "absolute",
          left: expandedStage ? 0 : layout.left,
          top: expandedStage ? 0 : layout.top,
          width: expandedStage ? surface.width : layout.designWidth,
          height: expandedStage ? surface.height : layout.designHeight,
          transform: expandedStage ? `scale(${layout.scale})` : getStageTransform(layout),
          transformOrigin: "top left",
          overflow: "hidden",
          isolation: "isolate",
          visibility: layout.touchPortraitBlocked ? "hidden" : "visible",
          "--fh": `${layout.designHeight}px`,
          "--vh": `${layout.designHeight * 0.01}px`,
          "--vw": `${layout.designWidth * 0.01}px`,
        } as CSSProperties}
      >
        {expandedStage ? (
          <div
            data-testid="root-stage-reference-plane"
            style={{
              position: "absolute",
              left: -surface.left,
              top: -surface.top,
              width: layout.designWidth,
              height: layout.designHeight,
              overflow: "hidden",
            }}
          >
            {children}
          </div>
        ) : children}
      </div>
      <PortraitOrientationBlocker visible={layout.touchPortraitBlocked} />
    </div>
  );
}

function useRootAuth() {
  return useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5_000,
    refetchInterval: query => query.state.data ? 30_000 : false,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => fetchAuthenticatedUser(signal),
  });
}

function isVerificationExemptPath(path: string): boolean {
  return path === "/hub" || path === "/privacy" || path.startsWith("/reset-password/");
}

function RootAuthGate({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <RootStage>
        <LoadingScreen label="Loading…" />
      </RootStage>
    );
  }

  return (
    <RootStage>
      <AuthPage />
    </RootStage>
  );
}

function RootEntryInner() {
  const [location] = useLocation();
  const { data: user, isLoading } = useRootAuth();

  // /auth remains a compatibility alias for old links, but the public sign-in
  // experience has a single canonical address: parapets.net/.
  if (location === "/auth") return <Redirect to="/" />;

  // Verification is an account-level gate, not a navigation-layout concern.
  // Keep only genuinely public/recovery pages exempt so direct links into PvP,
  // the casino, worlds, pet care, etc. cannot bypass verification.
  if (user && !user.emailVerified && !isVerificationExemptPath(location)) {
    return (
      <RootStage>
        <EmailGateScreen email={user.email} />
      </RootStage>
    );
  }

  // Keep the same App position and account key on Home and every game route.
  // Nesting it inside RootAuthGate only on Home remounted the entire game on
  // each trip to/from Home, restarting startup preloads and welcome overlays.
  if (user) return <App key={user.id} />;

  if (location === "/") return <RootAuthGate isLoading={isLoading} />;

  return <App />;
}

export default function RootEntry() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootEntryInner />
      <GinnyQuestOverlay />
      <JansonQuestOverlay />
      <LonelleQuestOverlay />
    </QueryClientProvider>
  );
}
