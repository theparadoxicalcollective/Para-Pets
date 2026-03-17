import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
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

function AppRouter() {
  const { data: user, isLoading, isFetched } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

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
      // Unlock the AudioContext on the very first user gesture (required by
      // browsers / iOS Safari before any sound can play).
      if (!unlocked) {
        unlocked = true;
        unlockAudio();
      }
      const target = e.target as Element;
      const interactive = target.closest('button, [role="button"], [data-testid^="button-"]');
      if (interactive) playClick();
    };

    // pointerdown fires immediately on both mouse-press and touch-tap with no
    // 300 ms mobile delay and no double-fire, replacing the previous click listener.
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
