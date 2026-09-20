import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import App from "./App";
import AuthPage from "@/pages/AuthPage";
import EmailGateScreen from "@/components/EmailGateScreen";
import LoadingScreen from "@/components/LoadingScreen";
import GinnyQuestOverlay from "@/components/GinnyQuestOverlay";
import JansonQuestOverlay from "@/components/JansonQuestOverlay";
import { fetchAuthenticatedUser, queryClient } from "./lib/queryClient";
import { calculateStageLayout, getStageTransform, getVisibleViewport } from "@/lib/stage";

function RootStage({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState(() => {
    const viewport = getVisibleViewport();
    return calculateStageLayout(viewport.width, viewport.height, viewport.top, viewport.left);
  });

  useEffect(() => {
    let animationFrame = 0;

    const update = () => {
      const viewport = getVisibleViewport();
      const next = calculateStageLayout(viewport.width, viewport.height, viewport.top, viewport.left);
      setLayout(next);

      const root = document.documentElement.style;
      root.setProperty("--stage-scale", String(next.scale));
      root.setProperty("--viewport-height", `${next.viewportHeight}px`);
      root.setProperty("--viewport-width", `${next.viewportWidth}px`);
      root.setProperty("--fh", `${next.viewportHeight}px`);
      root.setProperty("--vh", `${next.viewportHeight * 0.01}px`);
      root.setProperty("--vw", `${next.viewportWidth * 0.01}px`);
      root.setProperty("--stage-logical-width", `${next.designWidth}px`);
      root.setProperty("--stage-logical-height", `${next.designHeight}px`);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    document.addEventListener("visibilitychange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
      document.removeEventListener("visibilitychange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, []);

  return (
    <div
      className="game-stage-shell"
      style={{ position: "fixed", inset: 0, background: "#020806" }}
    >
      <div
        id="game-stage"
        data-design-width={layout.designWidth}
        data-design-height={layout.designHeight}
        style={{
          position: "absolute",
          left: layout.left,
          top: layout.top,
          width: layout.designWidth,
          height: layout.designHeight,
          transform: getStageTransform(layout),
          transformOrigin: "top left",
          overflow: "hidden",
          isolation: "isolate",
          "--fh": `${layout.designHeight}px`,
          "--vh": `${layout.designHeight * 0.01}px`,
          "--vw": `${layout.designWidth * 0.01}px`,
        } as CSSProperties}
      >
        {children}
      </div>
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
    </QueryClientProvider>
  );
}
