import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function ParaPetsHubPage() {
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const playDestination = user ? "/pet-house" : "/auth";

  return (
    <div
      data-testid="para-pets-hub-page"
      className="fixed inset-0 overflow-y-auto"
      style={{
        zIndex: 9999,
        backgroundColor: "#07090f",
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 15% 10%, rgba(58,30,90,0.55) 0%, transparent 60%)",
          "radial-gradient(ellipse 70% 45% at 85% 80%, rgba(20,70,55,0.45) 0%, transparent 55%)",
          "radial-gradient(ellipse 50% 35% at 60% 30%, rgba(26,107,85,0.18) 0%, transparent 50%)",
          "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.8' fill='rgba(127,191,176,0.06)'/%3E%3C/svg%3E\")",
        ].join(", "),
      }}
    >
      {/* Title header — large, prominent, not sticky */}
      <div
        data-testid="hub-title-header"
        className="w-full flex flex-col items-center justify-center pt-14 pb-6 px-5"
        style={{ paddingTop: "max(3.5rem, env(safe-area-inset-top, 3.5rem))" }}
      >
        <h1
          className="font-fantasy text-4xl tracking-widest text-center"
          style={{
            color: "#7fbfb0",
            textShadow: "0 0 32px rgba(127,191,176,0.5), 0 0 60px rgba(127,191,176,0.2)",
          }}
          data-testid="text-hub-title"
        >
          Para Pets
        </h1>
        <div
          className="mt-3 w-32 mx-auto"
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(127,191,176,0.5), transparent)",
          }}
        />
      </div>

      {/* Action bar — sticky, sits below the title */}
      <div
        className="sticky top-0 z-50 w-full border-b border-white/[0.06]"
        data-testid="hub-action-bar"
        style={{
          backgroundColor: "rgba(7,9,15,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 h-13 flex items-center justify-end gap-3 py-3">
          <Link
            href={playDestination}
            data-testid="button-play-game"
            className="text-xs font-bold tracking-widest transition-all duration-150 active:scale-95"
            style={{
              color: "#07090f",
              borderRadius: "9999px",
              padding: "8px 22px",
              background: "linear-gradient(135deg, #7fbfb0 0%, #1a9b70 100%)",
              boxShadow: "0 0 16px rgba(127,191,176,0.35), 0 2px 8px rgba(0,0,0,0.4)",
              letterSpacing: "0.08em",
            }}
          >
            Play Game
          </Link>

          {!user && (
            <Link
              href="/auth"
              data-testid="link-hub-signin"
              className="text-xs font-semibold tracking-wide transition-all duration-150"
              style={{
                color: "#c8d8b0",
                border: "1px solid rgba(127,191,176,0.3)",
                borderRadius: "9999px",
                padding: "7px 18px",
                background: "rgba(26,107,85,0.12)",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 py-10" data-testid="hub-main">
      </main>
    </div>
  );
}
