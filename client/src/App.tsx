import EmailGateScreen from "@/components/EmailGateScreen";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { fetchAuthenticatedUser, queryClient } from "./lib/queryClient";
import { fetchStartupInventory } from "./lib/startupInventory";
import { prepareActivePetVisualState } from "./lib/activePetVisuals";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { installPageLifecycleDiagnostics, stabilityDiagnostic } from "@/lib/stabilityDiagnostics";
import { playClick, unlockAudio } from "@/lib/sounds";
import { showClickSparkles } from "@/lib/interactionEffects";
import { useToast } from "@/hooks/use-toast";
import { initTabSync, teardownTabSync } from "@/lib/tabSync";
import { shouldUseDocumentLayout, usesDeviceGameplaySurface } from "@/lib/stage";
import { useStageViewportLayout } from "@/lib/stageViewport";
import { detectRuntimeMode } from "@/lib/runtimeMode";
import { shouldUseLowMemoryPetRenderer } from "@/lib/petRenderSafety";
import homeBg from "@assets/uploads/NewActivePetBG.png";
import MiniGameFrame from "@/components/world/MiniGameFrame";
import PortraitOrientationBlocker from "@/components/PortraitOrientationBlocker";
import StagePageSurface from "@/components/StagePageSurface";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import { isIsolatedPlayerRoute, shouldHideFloatingNav } from "@/lib/playerPagePresentation";

// ── Eagerly imported (always or near-always needed at startup) ──────────────
import HomePage from "@/pages/HomePage";
import LoadingScreen from "@/components/LoadingScreen";
import WorldLoadingScreen from "@/components/WorldLoadingScreen";
import WelcomeGiftScreen from "@/components/WelcomeGiftScreen";
import DevelopmentNoticeScreen from "@/components/DevelopmentNoticeScreen";
import GlobalLevelUpOverlay from "@/components/GlobalLevelUpOverlay";
import FloatingNav from "@/components/FloatingNav";
import BeginJourneyOverlay from "@/components/BeginJourneyOverlay";
import NpcQuestDiscoveryGuide from "@/components/NpcQuestDiscoveryGuide";
import { bjGetStatus, bjIsCurrentFlowVersion, bjRestart, bjSetStep, bjUsePlayer } from "@/lib/beginJourney";
import ErrorBoundary from "@/components/ErrorBoundary";

// ── Lazy-loaded page chunks ────────────────────────────────────────────────
// Each route is split into its own JS chunk so the initial bundle stays small.
// Vite emits one .js file per page; the browser fetches them only when a
// player actually navigates there. Admin-only pages never load for regular
// players. <Suspense> below shows the LoadingScreen while a chunk is in flight.
const AuthPage           = lazy(() => import("@/pages/AuthPage"));
const MaintenancePage    = lazy(() => import("@/pages/MaintenancePage"));
const MapPage            = lazy(() => import("@/pages/MapPage"));
const AdminPage          = lazy(() => import("@/pages/AdminPage"));
const WorldPage          = lazy(() => import("@/pages/WorldPage"));
const CoinShopPage       = lazy(() => import("@/pages/CoinShopPage"));
const ResetPasswordPage  = lazy(() => import("@/pages/ResetPasswordPage"));
const PetHousePage       = lazy(() => import("@/pages/PetHousePage"));
const VisitPetHousePage  = lazy(() => import("@/pages/VisitPetHousePage"));
const PrivacyPolicyPage  = lazy(() => import("@/pages/PrivacyPolicyPage"));
const ParaPetsHubPage    = lazy(() => import("@/pages/ParaPetsHubPage"));
const FoundersPage       = lazy(() => import("@/pages/FoundersPage"));
const BadgePage          = lazy(() => import("@/pages/BadgePage"));
const MarketPage         = lazy(() => import("@/pages/MarketPage"));
const PvpArenaPage       = lazy(() => import("@/pages/PvpArenaPage"));
const PetInventoryPage   = lazy(() => import("@/pages/PetInventoryPage"));
const BagInventoryPage   = lazy(() => import("@/pages/BagInventoryPage"));
const CardsCollectionPage = lazy(() => import("@/pages/CardsCollectionPage"));
const EquipAccessoriesPage = lazy(() => import("@/pages/EquipAccessoriesPage"));
const PetCarePage          = lazy(() => import("@/pages/PetCarePage"));
const PetLevelUpRoute       = lazy(() => import("@/pages/PetLevelUpRoute"));
const MoltenBlocksPage     = lazy(() => import("@/pages/MoltenBlocksPage"));
const LavaCrawlPage        = lazy(() => import("@/pages/LavaCrawlPage"));
const FriendsPage          = lazy(() => import("@/pages/FriendsPage"));
const ForumPage            = lazy(() => import("@/pages/ForumPage"));
const RaidPage             = lazy(() => import("@/pages/RaidPage"));
const RaidLeaderboardPage  = lazy(() => import("@/pages/RaidLeaderboardPage"));
const RaidBattlePage       = lazy(() => import("@/pages/RaidBattlePage"));
const ElysianBayouClearingPage = lazy(() => import("@/pages/ElysianBayouClearingPage"));

function PvpArenaWrapper() {
  const [, setLocation] = useLocation();
  return <PvpArenaPage onClose={() => setLocation("/")} />;
}

const THEMED_WORLDS = new Set([
  "volcanic", "swamp", "haunted_woods",
  "snowy_mountain", "sky_realm", "island", "desert", "enchanted_grove",
]);

function WorldLoadingGate({ location, user }: { location: string; user: any }) {
  const worldId = location.replace("/world/", "").split("/")[0];
  const isThemed = THEMED_WORLDS.has(worldId);
  const [screenDone, setScreenDone] = useState(!isThemed);
  const [worldReady, setWorldReady] = useState(false);
  const hauntedWelcomeKey = user?.id ? `para_pets_haunted_welcome_v1_${user.id}` : "";
  const [showHauntedWelcome, setShowHauntedWelcome] = useState(() => {
    if (worldId !== "haunted_woods" || !user?.id) return false;
    try {
      return localStorage.getItem(`para_pets_haunted_welcome_v1_${user.id}`) !== "seen";
    } catch {
      return true;
    }
  });

  const { data: worldData } = useQuery<any>({
    queryKey: ["/api/worlds", worldId],
    queryFn: async () => {
      const res = await fetch(`/api/worlds/${worldId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    enabled: isThemed,
  });

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["/api/world", worldId, "locations"],
      queryFn: async () => {
        const res = await fetch(`/api/world/${worldId}/locations`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch locations");
        return res.json();
      },
      staleTime: 60 * 1000,
    });
  }, [worldId]);

  const dismissHauntedWelcome = () => {
    if (hauntedWelcomeKey) {
      try { localStorage.setItem(hauntedWelcomeKey, "seen"); } catch {}
    }
    setShowHauntedWelcome(false);
  };

  // Haunted Woods is now a public player world. WorldPage still carries a
  // legacy guard whose open-world list predates this release and currently uses
  // moderator status only for that redirect. Passing the public Haunted route
  // through that guard keeps the change isolated without granting admin access.
  const worldUser = worldId === "haunted_woods" ? { ...user, isModerator: true } : user;

  return (
    <>
      {/* WorldPage keeps rendering/fetching underneath even while hidden, so its
          data (locations, background image) is fully ready the instant the
          loading screen fades out. `visibility: hidden` (not z-index alone) is
          used so WorldPage's own raw content/spinner can never flash through
          before the themed loading screen paints — same technique as the
          HomePage base layer above. */}
      <div style={{ visibility: !isThemed || screenDone ? "visible" : "hidden", width: "100%", height: "100%" }}>
        <WorldPage user={worldUser} onContentReady={() => setWorldReady(true)} />
      </div>
      {!screenDone && (
        <ViewportModalPortal>
          <WorldLoadingScreen worldId={worldId} bgUrl={worldData?.bgUrl ?? null} pageReady={worldReady} onReady={() => setScreenDone(true)} />
        </ViewportModalPortal>
      )}
      {screenDone && worldId === "haunted_woods" && showHauntedWelcome && (
        <ViewportModalPortal>
        <div
          className="absolute inset-0 flex items-center justify-center px-5"
          data-testid="modal-haunted-world-welcome"
          data-quest-guide-blocker="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="haunted-world-welcome-title"
        >
          <div className="absolute inset-0" style={{ background: "rgba(2, 3, 10, 0.74)", backdropFilter: "blur(5px)" }} />
          <div
            className="relative w-full max-w-[360px] rounded-2xl px-6 py-7 text-center"
            style={{
              background: "linear-gradient(180deg, rgba(22, 15, 35, 0.98) 0%, rgba(8, 10, 20, 0.98) 100%)",
              border: "1px solid rgba(196, 154, 255, 0.48)",
              boxShadow: "0 18px 55px rgba(0,0,0,0.72), 0 0 34px rgba(125, 72, 180, 0.22), inset 0 0 30px rgba(170, 120, 220, 0.05)",
            }}
          >
            <div
              className="font-fantasy text-[10px] tracking-[0.32em] uppercase"
              style={{ color: "#cbb1e8", textShadow: "0 0 10px rgba(196,154,255,.35)" }}
            >
              The Veil Has Lifted
            </div>
            <div className="my-3 text-lg" aria-hidden="true" style={{ color: "#d6b7ff", textShadow: "0 0 14px rgba(196,154,255,.45)" }}>✦</div>
            <h2
              id="haunted-world-welcome-title"
              className="font-fantasy text-[21px] leading-tight tracking-wide"
              style={{ color: "#f1e9ff", textShadow: "0 2px 12px rgba(0,0,0,.8)" }}
            >
              Welcome to the Haunted Woods
            </h2>
            <p className="mt-4 text-[12px] leading-[1.75]" style={{ color: "#c8c1d2" }}>
              The Haunted Woods are now open for exploration. A few paths, encounters, and curiosities are still being awakened, so some features may remain under construction while we finish bringing the realm to life.
            </p>
            <p className="mt-3 font-fantasy text-[11px] leading-relaxed" style={{ color: "#d4bfe9" }}>
              Thank you for exploring with us — and tread carefully among the shadows.
            </p>
            <button
              type="button"
              data-testid="button-enter-haunted-world"
              onClick={dismissHauntedWelcome}
              className="mt-6 w-full rounded-xl py-3 font-fantasy text-[11px] tracking-[0.2em] transition-transform active:scale-[0.98]"
              style={{
                color: "#fff7dc",
                background: "linear-gradient(180deg, rgba(91, 56, 120, 0.95), rgba(49, 31, 72, 0.98))",
                border: "1px solid rgba(220, 188, 255, 0.52)",
                boxShadow: "0 0 20px rgba(137, 83, 180, 0.23), inset 0 1px 0 rgba(255,255,255,.08)",
              }}
            >
              ENTER THE WOODS
            </button>
          </div>
        </div>
        </ViewportModalPortal>
      )}
    </>
  );
}

/** Wraps the entire router in an ErrorBoundary that auto-resets when the URL
 *  changes and offers a Return-to-Game button that actually navigates home,
 *  preventing infinite "throw → reset → throw again" loops on broken pages. */
function RouterErrorBoundary({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  return (
    <ErrorBoundary
      resetKey={location}
      onReset={() => {
        try {
          // World crashes → land on map (not home) so the player doesn't lose context
          if (location.startsWith("/world/")) navigate("/map");
          else navigate("/");
        } catch (_) {}
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

function AppRouter() {
  const [location] = useLocation();
  useEffect(() => { stabilityDiagnostic("wouter-route-change"); }, [location]);
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const user = await fetchAuthenticatedUser(signal);
      if (!user) stabilityDiagnostic("auth-401", { clearedAuthenticatedUser: true });
      return user;
    },
  });

  // Select the browser-local tutorial namespace before any tutorial child renders.
  // This prevents a second account on the same device from inheriting another
  // player's step, starter egg id, or completed state.
  if (user?.id) bjUsePlayer(String(user.id));

  const { data: maintenanceData } = useQuery<{ maintenance: boolean }>({
    queryKey: ["/api/maintenance-status"],
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const maintenanceOn = maintenanceData?.maintenance === true;

  const [showWelcome, setShowWelcome] = useState(false);
  const [showDevNotice, setShowDevNotice] = useState(false);
  const [petStatsOpen, setPetStatsOpen] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setPetStatsOpen((e as CustomEvent<{ open: boolean }>).detail.open);
    window.addEventListener("petStatsToggle", handler);
    return () => window.removeEventListener("petStatsToggle", handler);
  }, []);

  const [navOverlayOpen, setNavOverlayOpen] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setNavOverlayOpen((e as CustomEvent<{ open: boolean }>).detail.open);
    window.addEventListener("navOverlayToggle", handler);
    return () => window.removeEventListener("navOverlayToggle", handler);
  }, []);

  // Server completion is authoritative. Migrate every unfinished account off
  // the legacy looping flow once, and automatically recover missing/stale local
  // state (including moderator resets and players who never received an egg).
  useEffect(() => {
    if (!user || showWelcome) return;
    if ((user as any).tutorial_quest_completed || (user as any).tutorial_reward_claimed) {
      if (bjGetStatus() !== "done") bjSetStep("done");
      return;
    }
    if (!bjIsCurrentFlowVersion() || bjGetStatus() === "done" || bjGetStatus() === "not_started") {
      bjRestart();
    }
  }, [user, showWelcome]);

  // After auth resolves for a logged-in user, fetch inventory and preload the
  // home page background + active pet image before revealing the app.
  // This prevents any flash of the background loading in or the pet image
  // popping in after the page is already visible.
  const [isPreloaded, setIsPreloaded] = useState(false);
  useEffect(() => {
    setIsPreloaded(false);
    if (!user) return;

    const controller = new AbortController();
    const { signal } = controller;

    const lowMemoryPreload = shouldUseLowMemoryPetRenderer(detectRuntimeMode());

    // Hard cap: never block the player for more than 4 seconds total.
    const timeout = setTimeout(() => setIsPreloaded(true), 4000);

    const preloadImage = (url: string) =>
      new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      });

    const fontReady: Promise<void> = document.fonts
      ? document.fonts.ready.then(() => undefined)
      : Promise.resolve();

    // Fetch inventory first, then seed the exact owned-pet queries that decide
    // base/evolution artwork, costumes and Mini Pet state. Waiting for this
    // lightweight metadata prevents Home from mounting an empty/incorrect pet
    // renderer and then rebuilding it a frame later. Image decoding remains
    // non-blocking on mobile to preserve the existing Safari memory safeguards.
    const inventoryReady = fetchStartupInventory(signal, items => {
      queryClient.setQueryData(["/api/inventory"], items);
    })
      .then(async (items) => {
        if (!items || signal.aborted) return;

        const activePetItem = items.find(
          (i: any) => i.inventoryId === user.activePetId && i.type === "pet"
        );

        if (activePetItem?.petTemplateId) {
          const prepared = await prepareActivePetVisualState({
            pet: activePetItem,
            cache: queryClient,
            signal,
          }).catch(() => null);

          if (!signal.aborted && !lowMemoryPreload && Array.isArray(prepared?.templateData?.parts)) {
            prepared.templateData.parts.forEach((part: any) => {
              if (part?.imageUrl) void preloadImage(part.imageUrl);
            });
          }

          // Desktop can warm the unused complete-image fallback. On mobile,
          // decoding it beside every layered part needlessly raises peak memory.
          const petImageUrl = activePetItem.hatchedImageUrl || activePetItem.imageUrl;
          if (petImageUrl && !lowMemoryPreload) void preloadImage(petImageUrl);
        }
      })
      .catch(() => {});

    // Block only on background/fonts/inventory plus active-pet render metadata.
    // The existing 4-second cap still guarantees startup can never hang here.
    Promise.all([preloadImage(homeBg), fontReady, inventoryReady]).then(() => {
      clearTimeout(timeout);
      if (!signal.aborted) setIsPreloaded(true);
    });

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setShowWelcome(false);
      setShowDevNotice(false);
      return;
    }
    try {
      const userId = String(user.id);
      const pendingUserId = localStorage.getItem("para_pets_just_registered_user_id");
      const legacyPending = localStorage.getItem("para_pets_just_registered") === "true";
      const belongsToThisPlayer = pendingUserId === userId || (!pendingUserId && legacyPending);
      if (belongsToThisPlayer && !pendingUserId) {
        localStorage.setItem("para_pets_just_registered_user_id", userId);
      }
      setShowWelcome(belongsToThisPlayer);
      setShowDevNotice(belongsToThisPlayer);
    } catch {
      setShowWelcome(false);
      setShowDevNotice(false);
    }
  }, [user?.id]);

  const handleWelcomeComplete = (updatedUser: any) => {
    setShowWelcome(false);
    if (updatedUser) {
      queryClient.setQueryData(["/api/auth/me"], updatedUser);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  // Handle ?verified= query param — show toast and refresh user
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("verified");
    if (!v) return;
    // Clean the URL without a page reload
    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);
    if (v === "1") {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Email verified!", description: "Your email has been confirmed. Enjoy Para Pets! 🐾" });
    } else if (v === "expired") {
      toast({ title: "Link expired", description: "That verification link has expired. Please request a new one.", variant: "destructive" });
    } else if (v === "invalid") {
      toast({ title: "Invalid link", description: "That verification link is not valid.", variant: "destructive" });
    } else if (v === "error") {
      toast({ title: "Verification unavailable", description: "Please try opening your link again shortly.", variant: "destructive" });
    } else if (v === "already") {
      toast({ title: "Already verified", description: "Your email is already confirmed." });
    }
  }, []);

  // Show loading screen while: auth is in-flight, OR logged-in user's assets
  // haven't been preloaded yet.
  const showingLoadScreen = isLoading || (!!user && !isPreloaded);

  if (showingLoadScreen) {
    return <LoadingScreen label="Loading…" />;
  }

  // Show maintenance screen to logged-in non-admin players. MaintenancePage is
  // lazy-loaded so we wrap it in Suspense to handle the chunk download.
  if (maintenanceOn && user && !user.isAdmin) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <MaintenancePage />
      </Suspense>
    );
  }

  // Block the game until the email is verified. The gate polls every 3 s and
  // dissolves automatically the moment the user clicks the link (any tab).
  if (user && !user.emailVerified && !shouldHideFloatingNav(location)) {
    return <EmailGateScreen email={user.email} />;
  }

  if (showDevNotice && user) {
    return <DevelopmentNoticeScreen onContinue={() => setShowDevNotice(false)} />;
  }

  if (showWelcome && user) {
    return <WelcomeGiftScreen user={user} onComplete={handleWelcomeComplete} />;
  }

  // Isolated pages intentionally replace the gameplay stage instead of keeping
  // Home mounted behind them. The route policy is centralized so new screens
  // cannot silently invent a different device-presentation rule.
  const isFullScreenPath = isIsolatedPlayerRoute(location);

  // An installed app launches at the manifest root. Keep unauthenticated
  // players on that root URL while presenting the same sign-in experience,
  // rather than rewriting the saved app address to /auth.
  if (!user && location === "/") {
    return (
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <AuthPage />
      </Suspense>
    );
  }

  if (isFullScreenPath || !user) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <Switch>
          <Route path="/auth" component={AuthPage} />
          <Route path="/reset-password/:token" component={ResetPasswordPage} />
          <Route path="/privacy"><PrivacyPolicyPage user={user ?? null} /></Route>
          <Route path="/hub"><ParaPetsHubPage /></Route>
          <Route path="/coins"><CoinShopPage user={user ?? null} /></Route>
          <Route path="/forum">
            {user ? <ForumPage /> : <Redirect to="/auth" />}
          </Route>
          <Route path="/founders"><FoundersPage /></Route>
          <Route path="/admin">
            {user?.isAdmin ? <AdminPage user={user} /> : <Redirect to="/" />}
          </Route>
          <Route path="/visit/:userId">
            {user ? <VisitPetHousePage /> : <Redirect to="/auth" />}
          </Route>
          <Route><Redirect to={user ? "/" : "/auth"} /></Route>
        </Switch>
      </Suspense>
    );
  }

  // ── Game layout ────────────────────────────────────────────────────────────
  // Full-screen pages own the stage while open. Keeping the entire HomePage
  // mounted behind them retained its animated pet, decoded images, effects,
  // queries, and timers; that overlap was enough to terminate WebKit during
  // pet and item transitions. Suspense already provides an opaque loading
  // screen, so Home can safely unmount until the player returns.
  return (
    <>
      {location === "/" && (
        <StagePageSurface layout="viewport">
          <HomePage user={user} isOverlayActive={false} />
        </StagePageSurface>
      )}

      {/* Stage pages all use the same absolute stage surface. Home itself is
          mounted only at "/", while other gameplay routes own this surface
          independently. Suspense stays opaque during first-load chunk fetches
          so Safari/Android never flash a different route underneath. */}
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        {location === "/map" && (
          <StagePageSurface layout="viewport">
            <MapPage user={user} />
          </StagePageSurface>
        )}
        {location.startsWith("/world/") && (
          <StagePageSurface key={location} layout="viewport">
            <WorldLoadingGate location={location} user={user} />
          </StagePageSurface>
        )}
        {location === "/coins" && (
          <StagePageSurface layout="viewport">
            <CoinShopPage user={user} />
          </StagePageSurface>
        )}
        {location === "/pet-house" && (
          <StagePageSurface layout="viewport">
            <PetHousePage user={user} />
          </StagePageSurface>
        )}
        {location === "/badges" && (
          <StagePageSurface layout="viewport">
            <BadgePage user={user} />
          </StagePageSurface>
        )}
        {location === "/market" && (
          <StagePageSurface layout="viewport">
            <MarketPage user={user} onUserUpdate={u => queryClient.setQueryData(["/api/auth/me"], u)} />
          </StagePageSurface>
        )}
        {location === "/pvp" && (
          <StagePageSurface layout="viewport">
            <PvpArenaWrapper />
          </StagePageSurface>
        )}
        {location === "/pets" && (
          <StagePageSurface layout="viewport">
            <PetInventoryPage />
          </StagePageSurface>
        )}
        {location === "/bag" && (
          <StagePageSurface layout="viewport">
            <BagInventoryPage />
          </StagePageSurface>
        )}
        {location === "/cards" && (
          <StagePageSurface layout="viewport">
            <CardsCollectionPage />
          </StagePageSurface>
        )}
        {(location === "/equip-accessories" || location.startsWith("/equip-accessories/")) && (
          <StagePageSurface layout="viewport">
            <EquipAccessoriesPage
              petInventoryId={location.startsWith("/equip-accessories/") ? location.split("/")[2] : undefined}
              returnPath={location.startsWith("/equip-accessories/") ? "/pet-house" : "/"}
            />
          </StagePageSurface>
        )}
        {location.startsWith("/pet-care/") && (
          <StagePageSurface key={location} layout="viewport">
            <PetCarePage />
          </StagePageSurface>
        )}
        {location.startsWith("/pet-level-up/") && (
          <StagePageSurface key={location} layout="viewport">
            <PetLevelUpRoute />
          </StagePageSurface>
        )}
        {location === "/games/molten-blocks" && (
          <StagePageSurface layout="viewport">
            <MiniGameFrame worldId="volcanic"><MoltenBlocksPage /></MiniGameFrame>
          </StagePageSurface>
        )}
        {location === "/games/lava-crawl" && (
          <StagePageSurface layout="viewport">
            <MiniGameFrame worldId="volcanic"><LavaCrawlPage /></MiniGameFrame>
          </StagePageSurface>
        )}
        {location === "/friends" && (
          <StagePageSurface layout="viewport">
            <FriendsPage />
          </StagePageSurface>
        )}
        {location === "/raid" && (
          <StagePageSurface layout="viewport">
            <RaidPage />
          </StagePageSurface>
        )}
        {location === "/raid/leaderboard" && (
          <StagePageSurface layout="viewport">
            <RaidLeaderboardPage />
          </StagePageSurface>
        )}
        {location === "/raid/battle" && (
          <StagePageSurface layout="viewport">
            <RaidBattlePage />
          </StagePageSurface>
        )}
        {location === "/explore/elysian-bayou-clearing" && (
          <StagePageSurface layout="viewport">
            <ElysianBayouClearingPage user={user} />
          </StagePageSurface>
        )}
      </Suspense>

      {/* FloatingNav stays above normal page content, but the shared
          navVisibility contract removes it while a blocking modal owns input. */}
      {!shouldHideFloatingNav(location) && !petStatsOpen && !navOverlayOpen && (
        <FloatingNav
          user={user}
          onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
        />
      )}

      {/* Begin Journey tutorial overlay */}
      <BeginJourneyOverlay user={user} />
      <NpcQuestDiscoveryGuide user={user} />
    </>
  );
}

function CrashReporter() {
  const [entry, setEntry] = useState<{ msg: string; source?: string; ts: number } | null>(() => {
    try {
      const raw = localStorage.getItem("__para_last_error");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Only show errors from the last 20 seconds — transient hot-reload errors clear quickly
      if (Date.now() - parsed.ts > 20 * 1000) {
        localStorage.removeItem("__para_last_error");
        return null;
      }
      return parsed;
    } catch (_) { return null; }
  });

  if (!entry) return null;
  const ago = Math.round((Date.now() - entry.ts) / 1000);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.88)", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24, gap: 12,
      }}
    >
      <div style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#ffd700", letterSpacing: "0.1em" }}>
        Crash Report ({ago}s ago)
      </div>
      <div style={{
        background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.4)",
        borderRadius: 8, padding: "10px 14px", maxWidth: 340, width: "100%",
        fontFamily: "monospace", fontSize: 11, color: "#ff9090", lineHeight: 1.6,
        wordBreak: "break-all",
      }}>
        {entry.msg}
        {entry.source && <div style={{ marginTop: 6, color: "rgba(255,144,144,0.6)" }}>{entry.source}</div>}
      </div>
      <button
        onClick={() => { localStorage.removeItem("__para_last_error"); setEntry(null); }}
        style={{
          fontFamily: "Lora, serif", fontSize: 11, letterSpacing: "0.15em",
          color: "#ffd700", background: "rgba(30,18,4,0.9)",
          border: "1px solid rgba(255,215,0,0.45)", borderRadius: 9999,
          padding: "8px 20px", cursor: "pointer",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

// Wide devices keep the canonical gameplay coordinates without presenting
// that coordinate plane as a visible phone frame.
function GameStage({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const layout = useStageViewportLayout(location);

  // Audited gameplay routes use real device pixels. They have no reference plane,
  // stage transform, or centering offsets; authored scenes remain page-owned.
  if (usesDeviceGameplaySurface(location)) {
    return (
      <div key="device-gameplay" className="game-stage-shell" data-stage-coordinate-owner="viewport"
        style={{ position: "fixed", inset: 0, background: "#050c08" }}>
        <div id="game-stage" data-design-width={layout.designWidth} data-design-height={layout.designHeight}
          data-coordinate-owner="viewport" data-reference-portrait="false"
          style={{
            position: "absolute", left: layout.left, top: layout.top,
            width: layout.designWidth, height: layout.designHeight,
            overflow: "hidden", isolation: "isolate",
            visibility: layout.touchPortraitBlocked ? "hidden" : "visible",
            "--fh": `${layout.designHeight}px`,
            "--vh": `${layout.designHeight * 0.01}px`,
            "--vw": `${layout.designWidth * 0.01}px`,
          } as CSSProperties}>
          {/* Native viewport hosts remain necessary for gameplay page, backdrop,
            and scene portals; none uses the old 390×844 transform. */}
        <div id="game-viewport-page" data-testid="game-viewport-page"
          style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }} />
        <div id="game-viewport-backdrop" data-testid="game-viewport-backdrop"
          style={{ position: "absolute", inset: 0, zIndex: 17, pointerEvents: "none" }} />
        <div id="game-viewport-scene" data-testid="game-viewport-scene"
          style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none" }} />
        <div id="game-stage-content" data-testid="game-stage-content"
            style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 15 }}>
            {children}
          </div>
          <div id="game-viewport-hud" data-testid="game-viewport-hud"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40 }} />
        </div>
        <PortraitOrientationBlocker visible={layout.touchPortraitBlocked} />
      </div>
    );
  }

  // Isolated document routes use the real viewport without a reference stage.
  if (shouldUseDocumentLayout(location, layout.viewportWidth)) {
    return (
      <div
        className="game-stage-shell hub-document-shell"
        style={{ position: "fixed", inset: 0, background: "#020604" }}
      >
        <div
          id="game-stage"
          data-design-width={layout.viewportWidth}
          data-design-height={layout.viewportHeight}
          data-coordinate-owner="viewport"
          data-reference-portrait="false"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            isolation: "isolate",
            visibility: layout.touchPortraitBlocked ? "hidden" : "visible",
            "--fh": `${layout.viewportHeight}px`,
            "--vh": `${layout.viewportHeight * 0.01}px`,
            "--vw": `${layout.viewportWidth * 0.01}px`,
          } as CSSProperties}
        >
          {children}
          <div
            id="game-viewport-hud"
            data-testid="game-viewport-hud"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          />
        </div>
        <PortraitOrientationBlocker visible={layout.touchPortraitBlocked} />
      </div>
    );
  }

  // Unknown paths only render AppRouter's redirect. They must not restore
  // the legacy reference plane while that redirect resolves.
  return (
    <div className="game-stage-shell" data-stage-coordinate-owner="viewport"
      style={{ position: "fixed", inset: 0, background: "#050c08" }}>
      <div id="game-stage" data-coordinate-owner="viewport" data-reference-portrait="false"
        data-design-width={layout.designWidth} data-design-height={layout.designHeight}
        style={{
          position: "absolute", left: layout.left, top: layout.top,
          width: layout.designWidth, height: layout.designHeight,
          overflow: "hidden", isolation: "isolate",
          visibility: layout.touchPortraitBlocked ? "hidden" : "visible",
          "--fh": `${layout.designHeight}px`,
          "--vh": `${layout.designHeight * 0.01}px`,
          "--vw": `${layout.designWidth * 0.01}px`,
        } as CSSProperties}>
        <div id="game-stage-content" data-testid="game-stage-content"
          style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 15 }}>
          {children}
        </div>
        <div id="game-viewport-hud" data-testid="game-viewport-hud"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40 }} />
      </div>
      <PortraitOrientationBlocker visible={layout.touchPortraitBlocked} />
    </div>
  );
}

function App() {
  useEffect(() => {
    initTabSync();
    const removeLifecycleDiagnostics = installPageLifecycleDiagnostics();
    return () => {
      removeLifecycleDiagnostics();
      teardownTabSync();
    };
  }, []);

  // Forward global window errors to the server crash log
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "error",
          msg: e.message,
          source: `${e.filename}:${e.lineno}:${e.colno}`,
          url: window.location.pathname,
          ua: navigator.userAgent,
        }),
      }).catch(() => {});
    };
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "Unhandled rejection");
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "unhandled",
          msg,
          source: "",
          url: window.location.pathname,
          ua: navigator.userAgent,
        }),
      }).catch(() => {});
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  useEffect(() => {
    let unlocked = false;

    const handler = (e: PointerEvent) => {
      if (!unlocked) {
        unlocked = true;
        unlockAudio();
      }
      const target = e.target as Element;
      const interactive = target.closest(
        'button, a[href], [role="button"], [role="tab"], [role="option"],' +
        '[data-testid^="button-"], [data-testid^="card-"], [data-testid^="tab-"],' +
        '[data-testid^="link-"], [data-testid^="item-"], [data-testid^="tile-"],' +
        '[data-testid^="nav-"], [data-testid^="select-"]'
      );
      const disabled = interactive?.matches(':disabled, [aria-disabled="true"]');
      if (!interactive || disabled) return;
      if (!interactive.hasAttribute('data-no-click-sound')) playClick();
      if (!interactive.hasAttribute('data-no-click-sparkle')) showClickSparkles(e.clientX, e.clientY);
    };

    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, []);

  useEffect(() => {
    // Safari owns an edge-swipe navigation gesture; Android browsers do not.
    // Installing this non-passive document listener on Android interferes with
    // horizontal controls and drag gestures, including tutorial interactions.
    const runtime = detectRuntimeMode();
    if (!runtime.displayMode.startsWith("ios-")) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartedInPetCareShelf = false;
    let touchStartedInIosEdgeControl = false;
    let touchStartedInGameplayGesture = false;

    // Track where a touch started so touchmove can detect horizontal swipes.
    // Do NOT call preventDefault on touchstart — it silently kills click events
    // on any button near an edge (back arrows, X buttons, etc.).
    const trackTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      const target = e.target as Element | null;
      touchStartedInPetCareShelf = target?.closest?.(".pet-care-item-shelf__viewport") != null;
      touchStartedInIosEdgeControl = target?.closest?.('[data-ios-edge-control="true"]') != null;
      // Petting, item dragging and scene panning own their gestures. The global
      // iOS navigation guard must not cancel those pointer streams.
      touchStartedInGameplayGesture = target?.closest?.('[data-gameplay-touch-gesture="true"]') != null;
    };

    // Block iOS swipe-back / swipe-forward gestures. Prevents back-navigation when
    // players swipe horizontally to attack in battles or navigate map areas.
    // Blocks any predominantly-horizontal swipe, plus edge-started ones at any angle.
    const blockHorizontalSwipe = (e: TouchEvent) => {
      if (touchStartedInPetCareShelf || touchStartedInIosEdgeControl || touchStartedInGameplayGesture) return;
      const adx = Math.abs(e.touches[0].clientX - touchStartX);
      const ady = Math.abs(e.touches[0].clientY - touchStartY);
      const fromEdge = touchStartX < 80 || touchStartX > window.innerWidth - 80;
      if (adx > 10 && (adx > ady * 1.2 || fromEdge)) {
        e.preventDefault();
      }
    };

    document.addEventListener("touchstart", trackTouchStart, { passive: true });
    document.addEventListener("touchmove", blockHorizontalSwipe, { passive: false });
    return () => {
      document.removeEventListener("touchstart", trackTouchStart);
      document.removeEventListener("touchmove", blockHorizontalSwipe);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CrashReporter />
        {/* Canonical gameplay stage with seamless wide-device presentation surfaces. */}
        <GameStage>
          <RouterErrorBoundary>
            <AppRouter />
          </RouterErrorBoundary>
          <ErrorBoundary fallback={null}>
            <GlobalLevelUpOverlay />
          </ErrorBoundary>
        </GameStage>
        {/* Toasts must escape the transformed game stage so blocked pet-menu actions remain visible. */}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
