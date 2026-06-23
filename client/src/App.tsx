import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { lazyWithRetry as lazy, clearChunkReloadFlag } from "@/lib/lazyWithRetry";
import { playClick, unlockAudio } from "@/lib/sounds";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { initTabSync, teardownTabSync } from "@/lib/tabSync";
import { DESIGN_W, DESIGN_H } from "@/lib/stage";
import homeBg from "@assets/bg_home_v2.png";

// ── Eagerly imported (always or near-always needed at startup) ──────────────
import HomePage from "@/pages/HomePage";
import LoadingScreen from "@/components/LoadingScreen";
import WorldLoadingScreen from "@/components/WorldLoadingScreen";
import WelcomeGiftScreen from "@/components/WelcomeGiftScreen";
import DevelopmentNoticeScreen from "@/components/DevelopmentNoticeScreen";
import GlobalLevelUpOverlay from "@/components/GlobalLevelUpOverlay";
import FloatingNav from "@/components/FloatingNav";
import BeginJourneyOverlay from "@/components/BeginJourneyOverlay";
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
const EquipAccessoriesPage = lazy(() => import("@/pages/EquipAccessoriesPage"));
const PetCarePage          = lazy(() => import("@/pages/PetCarePage"));
const MoltenBlocksPage     = lazy(() => import("@/pages/MoltenBlocksPage"));
const FriendsPage          = lazy(() => import("@/pages/FriendsPage"));

// ── Email gate screen — blocks the game until email is verified ───────────────
function EmailGateScreen({ email }: { email: string }) {
  const { toast } = useToast();
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Countdown ticker
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const t = setTimeout(() => setCooldownSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSecs]);

  // Poll every 3 s so the gate auto-dismisses when the user clicks the link
  // in another tab or on another device.
  useEffect(() => {
    const iv = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const resend = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/resend-verification"),
    onSuccess: () => {
      setCooldownSecs(60);
      toast({ title: "Email sent!", description: "Check your inbox and click the link." });
    },
    onError: (err: any) => {
      const secs = err?.secondsLeft ?? 60;
      setCooldownSecs(secs);
      toast({ title: "Please wait", description: `Try again in ${secs}s.`, variant: "destructive" });
    },
  });

  return (
    <div
      data-testid="screen-email-gate"
      className="absolute inset-0 flex flex-col items-center justify-center px-6"
      style={{ zIndex: 9995, background: "linear-gradient(180deg,#0d0805 0%,#150d06 100%)" }}
    >
      {/* Gold top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent)" }} />

      {/* Icon */}
      <div style={{ fontSize: 52, marginBottom: 20, filter: "drop-shadow(0 0 18px rgba(240,192,64,0.35))" }}>📬</div>

      {/* Heading */}
      <p style={{ fontFamily: "Lora, serif", fontSize: 11, letterSpacing: "0.28em", color: "#8a6a30", textTransform: "uppercase", margin: "0 0 8px" }}>
        One more step
      </p>
      <h2 style={{ fontFamily: "Lora, serif", fontSize: 22, color: "#f0c040", margin: "0 0 16px", letterSpacing: "0.05em", textAlign: "center", textShadow: "0 0 20px rgba(240,192,64,0.3)" }}>
        Verify Your Email
      </h2>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 320, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.18)", borderRadius: 16, padding: "20px 20px 24px", textAlign: "center" }}>
        <p style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#a89060", lineHeight: 1.65, margin: "0 0 6px" }}>
          A verification link was sent to
        </p>
        <p style={{ fontFamily: "Lora, serif", fontSize: 13, color: "#f0c040", fontWeight: 600, margin: "0 0 16px", wordBreak: "break-all" }}>
          {email}
        </p>
        <p style={{ fontFamily: "Lora, serif", fontSize: 12, color: "#7a6040", lineHeight: 1.6, margin: "0 0 20px" }}>
          Click the link in that email to enter the game. This page will open automatically once you verify.
        </p>

        {/* Resend button */}
        <button
          data-testid="button-resend-verification"
          disabled={resend.isPending || cooldownSecs > 0}
          onClick={() => resend.mutate()}
          style={{
            width: "100%", padding: "12px 0",
            fontFamily: "Lora, serif", fontSize: 13, letterSpacing: "0.08em",
            color: (resend.isPending || cooldownSecs > 0) ? "rgba(255,215,0,0.35)" : "#ffd700",
            background: (resend.isPending || cooldownSecs > 0) ? "rgba(255,215,0,0.04)" : "rgba(255,215,0,0.10)",
            border: "1px solid rgba(255,215,0,0.25)", borderRadius: 10,
            cursor: (resend.isPending || cooldownSecs > 0) ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {resend.isPending ? "Sending…" : cooldownSecs > 0 ? `Resend email (${cooldownSecs}s)` : "Resend verification email"}
        </button>
      </div>

      {/* Subtle waiting indicator */}
      <p style={{ fontFamily: "Lora, serif", fontSize: 11, color: "rgba(255,215,0,0.2)", marginTop: 28, letterSpacing: "0.12em" }}>
        Waiting for verification…
      </p>

      {/* Gold bottom accent */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent)" }} />
    </div>
  );
}

function PvpArenaWrapper() {
  const [, setLocation] = useLocation();
  return <PvpArenaPage onClose={() => setLocation("/")} />;
}

const THEMED_WORLDS = new Set(["volcanic", "swamp", "haunted_woods"]);

function WorldLoadingGate({ location, user }: { location: string; user: any }) {
  const worldId = location.replace("/world/", "").split("/")[0];
  const [screenDone, setScreenDone] = useState(!THEMED_WORLDS.has(worldId));
  const [worldReady, setWorldReady] = useState(false);
  return (
    <>
      <WorldPage user={user} onContentReady={() => setWorldReady(true)} />
      {!screenDone && (
        <WorldLoadingScreen worldId={worldId} pageReady={worldReady} onReady={() => setScreenDone(true)} />
      )}
    </>
  );
}

// Paths where FloatingNav should NOT appear
const NAV_HIDDEN_PATHS = ["/auth", "/hub", "/privacy", "/admin", "/equip-accessories", "/pvp", "/games/molten-blocks", "/coins"];
function shouldHideNav(path: string) {
  if (NAV_HIDDEN_PATHS.includes(path)) return true;
  if (path.startsWith("/reset-password/")) return true;
  if (path.startsWith("/visit/")) return true;
  if (path.startsWith("/pet-care/")) return true;
  return false;
}

/** Wraps the entire router in an ErrorBoundary that auto-resets when the URL
 *  changes and offers a Return-to-Game button that actually navigates home,
 *  preventing infinite "throw → reset → throw again" loops on broken pages. */
function RouterErrorBoundary({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  return (
    <ErrorBoundary
      resetKey={location}
      onReset={() => { try { navigate("/"); } catch (_) {} }}
    >
      {children}
    </ErrorBoundary>
  );
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
  const [showDevNotice, setShowDevNotice] = useState(() =>
    localStorage.getItem("para_pets_just_registered") === "true"
  );

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

  // After auth resolves for a logged-in user, fetch inventory and preload the
  // home page background + active pet image before revealing the app.
  // This prevents any flash of the background loading in or the pet image
  // popping in after the page is already visible.
  const [isPreloaded, setIsPreloaded] = useState(false);
  useEffect(() => {
    if (!user || isPreloaded) return;

    // Hard cap: never block the player for more than 5 seconds total.
    const timeout = setTimeout(() => setIsPreloaded(true), 5000);

    const preloadImage = (url: string) =>
      new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      });

    fetch("/api/inventory", { credentials: "include" })
      .then(res => res.json())
      .then(async (items: any[]) => {
        // Seed the TanStack Query cache so HomePage's own query is instant.
        queryClient.setQueryData(["/api/inventory"], items);

        const activePetItem = items.find(
          (i: any) => i.inventoryId === user.activePetId && i.type === "pet"
        );
        const petImageUrl = activePetItem?.hatchedImageUrl || activePetItem?.imageUrl;

        // Preload the home page background, the active pet image, and fonts
        // in parallel. All must be ready before the loading screen is dismissed.
        // document.fonts.ready ensures Lora/Open Sans are decoded so there
        // is no FOUT (flash of unstyled text) the moment the game appears.
        const fontReady: Promise<void> = document.fonts
          ? document.fonts.ready.then(() => undefined)
          : Promise.resolve();

        // Also prefetch the active pet's template parts so PetAnimator can
        // render immediately when the home screen appears, instead of waiting
        // for a second API round-trip after the loading screen disappears.
        const petPartsReady: Promise<void> = activePetItem?.petTemplateId
          ? fetch(`/api/pet-template-parts/${activePetItem.petTemplateId}`, { credentials: "include" })
              .then(r => r.ok ? r.json() : null)
              .then((data: any) => {
                if (!data) return;
                // Seed the cache so PetAnimator's useQuery is instant.
                queryClient.setQueryData(["/api/pet-template-parts", activePetItem.petTemplateId], data);
                // Also kick off image loading for each part so they are in
                // the browser's memory cache by the time the canvas draws.
                if (Array.isArray(data.parts)) {
                  data.parts.forEach((p: any) => { if (p.imageUrl) preloadImage(p.imageUrl); });
                }
              })
              .catch(() => undefined)
          : Promise.resolve();

        const preloads: Promise<void>[] = [preloadImage(homeBg), fontReady, petPartsReady];
        if (petImageUrl) preloads.push(preloadImage(petImageUrl));

        Promise.all(preloads).then(() => {
          clearTimeout(timeout);
          setIsPreloaded(true);
        });
      })
      .catch(() => { clearTimeout(timeout); setIsPreloaded(true); });

    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user && localStorage.getItem("para_pets_just_registered") === "true") {
      setShowWelcome(true);
      setShowDevNotice(true);
    }
  }, [user]);

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
  if (user && !user.emailVerified && !shouldHideNav(location)) {
    return <EmailGateScreen email={user.email} />;
  }

  if (showDevNotice && user) {
    return <DevelopmentNoticeScreen onContinue={() => setShowDevNotice(false)} />;
  }

  if (showWelcome && user) {
    return <WelcomeGiftScreen user={user} onComplete={handleWelcomeComplete} />;
  }

  // Full-screen paths that completely replace the game view (no HomePage base)
  const isFullScreenPath =
    location === "/auth" ||
    location.startsWith("/reset-password/") ||
    location === "/privacy" ||
    location === "/hub" ||
    location === "/founders" ||
    location === "/admin" ||
    location.startsWith("/visit/");

  if (isFullScreenPath || !user) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        <Switch>
          <Route path="/auth" component={AuthPage} />
          <Route path="/reset-password/:token" component={ResetPasswordPage} />
          <Route path="/privacy"><PrivacyPolicyPage user={user ?? null} /></Route>
          <Route path="/hub"><ParaPetsHubPage /></Route>
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
  // HomePage is permanently mounted as the base layer so navigating back to "/"
  // is instant — no unmount/remount gap, no blank-screen flash.
  // All other game pages render as absolute overlays on top of it.
  return (
    <>
      {/* Base: always mounted, always visible when no overlay is active */}
      <div style={{ position: "absolute", inset: 0, isolation: "isolate" }}>
        <HomePage user={user} isOverlayActive={location !== "/"} />
      </div>

      {/* Game overlays — each fades in quickly to smooth page-to-page transitions.
          A single <Suspense> wraps every overlay so lazy chunks load without
          unmounting the persistent HomePage base layer underneath.
          ── Fallback note ──────────────────────────────────────────────
          The fallback used to be `null`, which meant that whenever a
          player tapped a route whose chunk wasn't cached yet (most
          commonly /pvp on first visit, or after a fresh deploy), the
          empty Suspense fallback let the persistent <HomePage> base
          layer underneath show through for the duration of the chunk
          download. To the player this looked exactly like "the page
          closed out to the main page before opening back up" — they
          weren't actually navigating home, they were just seeing the
          base layer until the lazy chunk arrived. Swapping in
          <LoadingScreen> (the same fallback we use for /auth, /hub,
          and admin routes) covers HomePage with the standard loading
          orb during chunk fetch. Once the chunk is cached, Suspense
          doesn't re-suspend, so subsequent navigations are instant
          and never flash the loader. This also incidentally hides any
          temporary Home-flash on iOS Safari where chunk downloads can
          take noticeably longer over cellular. */}
      <Suspense fallback={<LoadingScreen label="Loading…" />}>
        {location === "/map" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <MapPage user={user} />
          </div>
        )}
        {location.startsWith("/world/") && (
          <div key={location} className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <WorldLoadingGate location={location} user={user} />
          </div>
        )}
        {location === "/coins" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <CoinShopPage user={user} />
          </div>
        )}
        {location === "/pet-house" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <PetHousePage user={user} />
          </div>
        )}
        {location === "/badges" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <BadgePage user={user} />
          </div>
        )}
        {location === "/market" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <MarketPage user={user} onUserUpdate={u => queryClient.setQueryData(["/api/auth/me"], u)} />
          </div>
        )}
        {location === "/pvp" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <PvpArenaWrapper />
          </div>
        )}
        {location === "/pets" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <PetInventoryPage />
          </div>
        )}
        {location === "/bag" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <BagInventoryPage />
          </div>
        )}
        {location === "/equip-accessories" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <EquipAccessoriesPage />
          </div>
        )}
        {location.startsWith("/pet-care/") && (
          <div key={location} className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <PetCarePage />
          </div>
        )}
        {location === "/games/molten-blocks" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <MoltenBlocksPage />
          </div>
        )}
        {location === "/friends" && (
          <div className="page-overlay" style={{ position: "absolute", inset: 0 }}>
            <FriendsPage />
          </div>
        )}
      </Suspense>

      {/* FloatingNav sits above all overlays */}
      {!shouldHideNav(location) && !petStatsOpen && !navOverlayOpen && (
        <FloatingNav
          user={user}
          onUserUpdate={(u) => queryClient.setQueryData(["/api/auth/me"], u)}
        />
      )}

      {/* Begin Journey tutorial overlay */}
      <BeginJourneyOverlay user={user} />
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

// ── Desktop-only "game is mobile optimized" notice ────────────────────────────
function DesktopNotice() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("para_desktop_notice_v1") === "1"; } catch { return false; }
  });

  // Only show on large non-touch non-mobile-UA screens
  const [isDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 1;
      const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent);
      return window.innerWidth >= 1024 && !hasTouch && !isMobileUA;
    } catch { return false; }
  });

  if (!isDesktop || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem("para_desktop_notice_v1", "1"); } catch {}
    setDismissed(true);
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 99997,
        background: "linear-gradient(90deg, rgba(8,5,1,0.97) 0%, rgba(18,11,3,0.97) 50%, rgba(8,5,1,0.97) 100%)",
        borderBottom: "1.5px solid rgba(212,160,23,0.35)",
        padding: "10px 20px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        boxShadow: "0 4px 28px rgba(0,0,0,0.75)",
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>📱</span>
      <p style={{
        fontFamily: "Lora, serif", fontSize: 12, color: "#c9952a",
        letterSpacing: "0.06em", margin: 0, lineHeight: 1.5,
      }}>
        Para Pets is optimized for mobile. For the best experience, open it on your phone!
      </p>
      <button
        onClick={dismiss}
        style={{
          fontFamily: "Lora, serif", fontSize: 11, letterSpacing: "0.1em",
          color: "rgba(212,160,23,0.75)", background: "transparent",
          border: "1px solid rgba(212,160,23,0.3)", borderRadius: 6,
          padding: "5px 14px", cursor: "pointer", flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        Got it
      </button>
    </div>
  );
}

// ── Cross-device game frame ───────────────────────────────────────────────
// The whole game is authored at one fixed "phone" design size and uniformly
// scaled (letterboxed) to fit any screen, so it looks IDENTICAL on every
// device. iPhone 12 (390×844) renders at scale 1 — pixel-faithful. Larger or
// differently-shaped screens scale the frame up/down and fill the leftover
// space with a themed backdrop + gold border. See index.css (#game-stage).

// Marketing / legal pages stay fluid (full-width responsive web pages) and are
// NOT forced into the phone frame.
const FLUID_PATHS = ["/hub", "/founders", "/privacy"];
function isFluidPath(loc: string) {
  return FLUID_PATHS.includes(loc);
}

function GameStage({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const fluid = isFluidPath(location);

  useEffect(() => {
    if (fluid) {
      document.documentElement.style.removeProperty("--stage-scale");
      return;
    }
    // On iOS Safari the on-screen keyboard fires resize/visualViewport events
    // and shrinks the viewport. Rescaling the whole frame mid-typing is jarring,
    // so freeze the scale while an editable element is focused.
    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    };
    const update = () => {
      if (isEditing()) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / DESIGN_W, h / DESIGN_H);
      document.documentElement.style.setProperty("--stage-scale", String(s));
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [fluid]);

  if (fluid) {
    return (
      <div className="w-full h-[100dvh] overflow-hidden">
        <div
          data-phone-frame="true"
          className="relative w-full h-full overflow-hidden"
          style={{ isolation: "isolate", transform: "translateZ(0)" }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="game-stage-backdrop">
      <div
        id="game-stage"
        data-phone-frame="true"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: "scale(var(--stage-scale, 1))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    initTabSync();
    return () => teardownTabSync();
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

  // Reset the lazy-chunk reload guard once the app has successfully mounted.
  // This way the next time we ship a new build, lazyWithRetry is allowed to
  // do its one-shot reload again (instead of treating the old session's
  // already-recovered flag as "already retried, give up").
  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  // --fh always tracks the real viewport height so every page fills the screen.
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty("--fh", `${window.innerHeight}px`);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
        <DesktopNotice />
        {/* Fixed phone-frame stage, uniformly scaled to fit any device. */}
        <GameStage>
          <RouterErrorBoundary>
            <AppRouter />
          </RouterErrorBoundary>
          <ErrorBoundary fallback={null}>
            <GlobalLevelUpOverlay />
          </ErrorBoundary>
        </GameStage>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
