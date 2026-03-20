import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { playClick, unlockAudio } from "@/lib/sounds";
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
import BadgePage from "@/pages/BadgePage";
import MarketPage from "@/pages/MarketPage";
import PvpArenaPage from "@/pages/PvpArenaPage";
import WelcomeGiftScreen from "@/components/WelcomeGiftScreen";

function PvpArenaWrapper() {
  const [, setLocation] = useLocation();
  return <PvpArenaPage onClose={() => setLocation("/")} />;
}

function AppRouter() {
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
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
  );
}

function App() {
  useEffect(() => {
    let unlocked = false;

    const handler = (e: PointerEvent) => {
      if (!unlocked) {
        unlocked = true;
        unlockAudio();
      }
      const target = e.target as Element;
      const interactive = target.closest('button, [role="button"], [data-testid^="button-"]');
      if (interactive) playClick();
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
        {/* Mobile: full screen as normal */}
        {/* Desktop: centered phone-sized frame with themed background */}
        <div className="w-full h-[100dvh] md:flex md:items-center md:justify-center md:bg-[#07090f]"
          style={{
            backgroundImage: "radial-gradient(ellipse at 30% 60%, rgba(58,30,90,0.45) 0%, transparent 60%), radial-gradient(ellipse at 75% 30%, rgba(20,70,55,0.35) 0%, transparent 55%)",
          }}
        >
          <div
            className="w-full h-full md:w-[390px] md:max-h-[90vh] md:h-[844px] md:rounded-[2.5rem] md:overflow-hidden md:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_32px_80px_rgba(0,0,0,0.85)]"
            style={{ isolation: "isolate" }}
          >
            <AppRouter />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
