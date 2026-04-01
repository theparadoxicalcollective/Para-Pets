import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { playClick, unlockAudio } from "@/lib/sounds";
import { initTabSync, teardownTabSync } from "@/lib/tabSync";
import desktopBackdrop from "@assets/bg_desktop_backdrop.png";
import AuthPage from "@/pages/AuthPage";
import MaintenancePage from "@/pages/MaintenancePage";
import HomePage from "@/pages/HomePage";
import MapPage from "@/pages/MapPage";
import AdminPage from "@/pages/AdminPage";
import WorldPage from "@/pages/WorldPage";
import CoinShopPage from "@/pages/CoinShopPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import PetHousePage from "@/pages/PetHousePage";
import VisitPetHousePage from "@/pages/VisitPetHousePage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import ParaPetsHubPage from "@/pages/ParaPetsHubPage";
import BadgePage from "@/pages/BadgePage";
import MarketPage from "@/pages/MarketPage";
import PvpArenaPage from "@/pages/PvpArenaPage";
import WelcomeGiftScreen from "@/components/WelcomeGiftScreen";
import GlobalLevelUpOverlay from "@/components/GlobalLevelUpOverlay";
import FloatingNav from "@/components/FloatingNav";
import ErrorBoundary from "@/components/ErrorBoundary";

function PvpArenaWrapper() {
  const [, setLocation] = useLocation();
  return <PvpArenaPage onClose={() => setLocation("/")} />;
}

// Paths where FloatingNav should NOT appear
const NAV_HIDDEN_PATHS = ["/auth", "/hub", "/privacy", "/admin"];
function shouldHideNav(path: string) {
  if (NAV_HIDDEN_PATHS.includes(path)) return true;
  if (path.startsWith("/reset-password/")) return true;
  if (path.startsWith("/visit/")) return true;
  return false;
}

function AppRouter() {
  const [location] = useLocation();
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: maintenanceData } = useQuery<{ maintenance: boolean }>({
    queryKey: ["/api/maintenance-status"],
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const maintenanceOn = maintenanceData?.maintenance === true;

  const [showWelcome, setShowWelcome] = useState(() =>
    localStorage.getItem("para_pets_just_registered") === "true"
  );

  // After auth resolves for a logged-in user, fetch inventory and preload the
  // active pet image before revealing the app.  This prevents any flash of
  // the orbs in a horizontal line or the egg image before the pet loads.
  const [isPreloaded, setIsPreloaded] = useState(false);
  useEffect(() => {
    if (!user || isPreloaded) return;

    // Hard cap: never block the player for more than 4 seconds total.
    const timeout = setTimeout(() => setIsPreloaded(true), 4000);

    fetch("/api/inventory", { credentials: "include" })
      .then(res => res.json())
      .then((items: any[]) => {
        // Seed the TanStack Query cache so HomePage's own query is instant.
        queryClient.setQueryData(["/api/inventory"], items);

        const activePetItem = items.find(
          (i: any) => i.shopItemId === user.activePetId && i.type === "pet"
        );
        const imageUrl = activePetItem?.hatchedImageUrl || activePetItem?.imageUrl;

        if (imageUrl) {
          const img = new Image();
          img.onload  = () => { clearTimeout(timeout); setIsPreloaded(true); };
          img.onerror = () => { clearTimeout(timeout); setIsPreloaded(true); };
          img.src = imageUrl;
        } else {
          clearTimeout(timeout);
          setIsPreloaded(true);
        }
      })
      .catch(() => { clearTimeout(timeout); setIsPreloaded(true); });

    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user && localStorage.getItem("para_pets_just_registered") === "true") {
      setShowWelcome(true);
    }
  }, [user]);

  const handleWelcomeComplete = (updatedUser: any) => {
    setShowWelcome(false);
    if (updatedUser) {
      queryClient.setQueryData(["/api/auth/me"], updatedUser);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  // Show loading screen while: auth is in-flight, OR logged-in user's assets
  // haven't been preloaded yet.
  const showingLoadScreen = isLoading || (!!user && !isPreloaded);

  if (showingLoadScreen) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#07110a] overflow-hidden">
        <div className="w-full flex flex-col items-center gap-4 text-center">
          <div className="text-4xl font-fantasy text-[#7fbfb0] animate-pulse" style={{ letterSpacing: "0.15em", paddingLeft: "0.15em" }}>
            Para Pets
          </div>
          <div className="text-xs text-[#4a7a6a] uppercase font-sans" style={{ letterSpacing: "0.25em", paddingLeft: "0.25em" }}>
            Loading…
          </div>
          <div className="w-48 h-1.5 bg-[#0d2018] rounded-full overflow-hidden">
            <div className="h-full bg-[#1a6b55] rounded-full animate-loading-bar" />
          </div>
        </div>
      </div>
    );
  }

  // Show maintenance screen to logged-in non-admin players
  if (maintenanceOn && user && !user.isAdmin) {
    return <MaintenancePage />;
  }

  if (showWelcome && user) {
    return <WelcomeGiftScreen user={user} onComplete={handleWelcomeComplete} />;
  }

  return (
    <>
      <Switch>
        <Route path="/auth" component={AuthPage} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/map">
          {user ? <MapPage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/world/:worldId">
          {user ? <WorldPage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/coins">
          {user ? <CoinShopPage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/admin">
          {user && user.isAdmin ? <AdminPage user={user} /> : <Redirect to="/" />}
        </Route>
        <Route path="/pet-house">
          {user ? <PetHousePage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/visit/:userId">
          {user ? <VisitPetHousePage /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/privacy">
          <PrivacyPolicyPage user={user ?? null} />
        </Route>
        <Route path="/hub">
          <ParaPetsHubPage />
        </Route>
        <Route path="/badges">
          {user ? <BadgePage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/market">
          {user ? <MarketPage user={user} onUserUpdate={u => queryClient.setQueryData(["/api/auth/me"], u)} /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/pvp">
          {user ? <PvpArenaWrapper /> : <Redirect to="/auth" />}
        </Route>
        <Route path="/">
          {user ? <HomePage user={user} /> : <Redirect to="/auth" />}
        </Route>
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      {user && !isLoading && !shouldHideNav(location) && (
        <FloatingNav
          user={user}
          onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
        />
      )}
    </>
  );
}

function CrashReporter() {
  const [entry, setEntry] = useState<{ msg: string; source?: string; ts: number } | null>(() => {
    try {
      const raw = localStorage.getItem("__para_last_error");
      if (!raw) return null;
      return JSON.parse(raw);
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
      <div style={{ fontFamily: "Cinzel, serif", fontSize: 13, color: "#ffd700", letterSpacing: "0.1em" }}>
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
          fontFamily: "Cinzel, serif", fontSize: 11, letterSpacing: "0.15em",
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

function App() {
  useEffect(() => {
    initTabSync();
    return () => teardownTabSync();
  }, []);

  // On desktop, scale the phone frame down so it always fits in the viewport
  // without clipping any content (exactly like a device emulator).
  // On mobile the frame is full-screen so scale stays 1.
  const [frameScale, setFrameScale] = useState(1);
  useEffect(() => {
    const compute = () => {
      if (window.innerWidth < 768) {
        // Mobile: full-screen, no scale needed
        setFrameScale(1);
        document.documentElement.style.setProperty("--fh", "100dvh");
        return;
      }
      // Tablets & desktops: scale the 390×844 frame to fill as much of the
      // viewport as possible while keeping the exact portrait aspect ratio.
      // 0.93 breathing room so the frame never kisses the viewport edges.
      const scaleByH = (window.innerHeight * 0.93) / 844;
      const scaleByW = (window.innerWidth * 0.93) / 390;
      setFrameScale(Math.min(scaleByH, scaleByW));
      // Pages use var(--fh) so they always fill exactly the 844px frame height
      document.documentElement.style.setProperty("--fh", "844px");
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
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
      if (interactive && !interactive.hasAttribute('data-no-click-sound')) playClick();
    };

    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, []);

  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;

    // Track where a touch started so touchmove can detect horizontal swipes.
    // Do NOT call preventDefault on touchstart — it silently kills click events
    // on any button near an edge (back arrows, X buttons, etc.).
    const trackTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    // Block iOS swipe-back / swipe-forward gestures. Prevents back-navigation when
    // players swipe horizontally to attack in battles or navigate map areas.
    // Blocks any predominantly-horizontal swipe, plus edge-started ones at any angle.
    const blockHorizontalSwipe = (e: TouchEvent) => {
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
        <Toaster />
        <CrashReporter />
        {/* Mobile: full-screen  |  Tablet & Desktop: game frame centered on fantasy backdrop */}
        <div
          className="w-full h-[100dvh] overflow-hidden flex items-center justify-center"
          style={{
            // On mobile the frame fills the screen so the backdrop is invisible.
            // On tablets/desktops it shows as the scenic background behind the frame.
            backgroundImage: `url(${desktopBackdrop})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Dark overlay to deepen the backdrop slightly so the game frame pops */}
          <div className="absolute inset-0 pointer-events-none hidden md:block"
            style={{ background: "rgba(4,8,14,0.45)" }} />
          <div
            data-phone-frame="true"
            className="relative w-full h-full overflow-hidden md:w-[390px] md:h-[844px] md:rounded-[2.5rem] md:flex-shrink-0"
            style={{
              isolation: "isolate",
              /*
               * translateZ(0)  → creates a new containing block so every
               *   position:fixed child stays INSIDE this frame on all screens.
               * scale(frameScale) → scales the 390×844 frame to fill as much of
               *   the viewport as possible while keeping the exact aspect ratio.
               * On mobile frameScale is always 1, so there's no visual change.
               */
              transform: `translateZ(0) scale(${frameScale})`,
              transformOrigin: "center center",
              /* gold decorative ring — only visible on tablet/desktop where there is backdrop space */
              boxShadow: [
                "0 0 0 3px rgba(212,175,55,0.88)",
                "0 0 0 6px rgba(160,110,0,0.32)",
                "0 0 0 7px rgba(90,60,0,0.18)",
                "0 0 44px rgba(212,175,55,0.22)",
                "inset 0 0 0 1px rgba(255,225,90,0.13)",
                "0 28px 72px rgba(0,0,0,0.88)",
              ].join(", "),
            }}
          >
            <ErrorBoundary>
              <AppRouter />
            </ErrorBoundary>
            <ErrorBoundary fallback={null}>
              <GlobalLevelUpOverlay />
            </ErrorBoundary>
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
