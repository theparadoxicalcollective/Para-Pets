import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { playClick, unlockAudio } from "@/lib/sounds";
import { initTabSync, teardownTabSync } from "@/lib/tabSync";
import AuthPage from "@/pages/AuthPage";
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

  const [showWelcome, setShowWelcome] = useState(() =>
    localStorage.getItem("para_pets_just_registered") === "true"
  );

  const handleWelcomeComplete = (updatedUser: any) => {
    setShowWelcome(false);
    if (updatedUser) {
      queryClient.setQueryData(["/api/auth/me"], updatedUser);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <div className="text-4xl font-fantasy text-[#7fbfb0] animate-pulse mb-4">
            Para Pets
          </div>
          <div className="w-48 h-1.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-[#1a6b55] rounded-full animate-loading-bar" />
          </div>
        </div>
      </div>
    );
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
      // Desktop: shrink frame to fit viewport while keeping 390×844 proportions
      const scaleByH = (window.innerHeight * 0.92) / 844;
      const scaleByW = (window.innerWidth * 0.96) / 390;
      setFrameScale(Math.min(1, scaleByH, scaleByW));
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
      const interactive = target.closest('button, [role="button"], [data-testid^="button-"]');
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

    // Block iOS swipe-back / swipe-forward gestures that start near either edge
    // and move predominantly horizontal. Only touchmove prevention is safe here
    // because it fires after intent is clear and doesn't cancel tap/click events.
    const blockHorizontalSwipe = (e: TouchEvent) => {
      const adx = Math.abs(e.touches[0].clientX - touchStartX);
      const ady = Math.abs(e.touches[0].clientY - touchStartY);
      const fromEdge = touchStartX < 60 || touchStartX > window.innerWidth - 60;
      if (fromEdge && adx > ady && adx > 10) {
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
        {/* Mobile: full-screen  |  Desktop: phone emulator centered on dark background */}
        <div
          className="w-full h-[100dvh] md:flex md:items-center md:justify-center md:overflow-hidden md:bg-[#07090f]"
          style={{
            backgroundImage: "radial-gradient(ellipse at 30% 60%, rgba(58,30,90,0.45) 0%, transparent 60%), radial-gradient(ellipse at 75% 30%, rgba(20,70,55,0.35) 0%, transparent 55%)",
          }}
        >
          <div
            className="w-full h-full md:w-[390px] md:h-[844px] md:rounded-[2.5rem] md:overflow-hidden md:flex-shrink-0"
            style={{
              isolation: "isolate",
              /*
               * translateZ(0)  → creates a new containing block so every
               *   position:fixed child stays INSIDE this frame on desktop.
               * scale(frameScale) → uniformly shrinks the 390×844 frame to fit
               *   any viewport without clipping the bottom — exactly like
               *   Chrome DevTools device emulation.
               * On mobile frameScale is always 1, so there's no visual change.
               */
              transform: `translateZ(0) scale(${frameScale})`,
              transformOrigin: "center center",
              /* gold decorative ring — invisible on mobile (full-screen = off-edge) */
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
            <AppRouter />
            <GlobalLevelUpOverlay />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
