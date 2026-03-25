import { Link } from "wouter";

export default function ParaPetsHubPage() {
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
      <header
        className="sticky top-0 z-50 w-full border-b border-white/[0.06]"
        data-testid="hub-header"
        style={{
          backgroundColor: "rgba(7,9,15,0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <span
            className="font-fantasy text-xl tracking-widest"
            style={{ color: "#7fbfb0", textShadow: "0 0 18px rgba(127,191,176,0.35)" }}
            data-testid="text-hub-title"
          >
            Para Pets
          </span>
          <Link
            href="/auth"
            data-testid="link-hub-signin"
            className="text-xs font-semibold tracking-wide transition-all duration-150"
            style={{
              color: "#c8d8b0",
              border: "1px solid rgba(127,191,176,0.3)",
              borderRadius: "9999px",
              padding: "6px 18px",
              background: "rgba(26,107,85,0.12)",
            }}
          >
            Sign In
          </Link>
        </div>
      </header>

      <div
        className="w-full"
        style={{
          height: "2px",
          background: "linear-gradient(90deg, transparent, rgba(127,191,176,0.25) 30%, rgba(58,30,90,0.3) 70%, transparent)",
        }}
      />

      <main className="max-w-3xl mx-auto px-5 py-12" data-testid="hub-main">
      </main>
    </div>
  );
}
