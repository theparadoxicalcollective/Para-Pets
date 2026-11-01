import { Monitor, Smartphone, Tablet } from "lucide-react";

/** Desktop-only player notice. No gameplay or account state mounts behind it. */
export default function DesktopComingSoonScreen() {
  const siteAddress = typeof window === "undefined" ? "" : window.location.host;

  return (
    <div
      data-testid="desktop-coming-soon"
      className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto px-4 py-8"
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(ellipse at 50% 20%, #244232 0%, #10261d 44%, #040c08 100%)",
        color: "#f8edce",
      }}
    >
      <main
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-coming-soon-title"
        aria-describedby="desktop-coming-soon-description"
        className="relative w-full max-w-lg rounded-3xl border px-6 py-9 text-center shadow-2xl sm:px-10 sm:py-12"
        style={{
          borderColor: "rgba(221,181,88,0.62)",
          background: "linear-gradient(150deg, rgba(24,51,37,0.97), rgba(7,20,14,0.98))",
          boxShadow: "0 0 0 1px rgba(221,181,88,0.12), 0 24px 70px rgba(0,0,0,0.65)",
        }}
      >
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border" style={{ borderColor: "rgba(221,181,88,0.55)", background: "rgba(221,181,88,0.09)" }}>
          <Monitor aria-hidden="true" size={39} color="#f0cb72" strokeWidth={1.7} />
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "#e6c47c" }}>
          Para Pets
        </p>
        <h1 id="desktop-coming-soon-title" className="mb-4 font-fantasy text-3xl font-bold leading-tight sm:text-4xl" style={{ color: "#f6d788" }}>
          PC Version Coming Soon
        </h1>
        <p id="desktop-coming-soon-description" className="mx-auto max-w-sm text-base leading-relaxed" style={{ color: "#e6e6d1" }}>
          We’re preparing Para Pets for desktop play. For now, please open the game on your phone or tablet to continue your adventure.
        </p>
        <div className="mx-auto my-7 h-px max-w-xs" style={{ background: "linear-gradient(90deg, transparent, rgba(221,181,88,0.65), transparent)" }} />
        <div className="flex items-center justify-center gap-6" style={{ color: "#f0cb72" }}>
          <span className="flex items-center gap-2 text-sm"><Smartphone aria-hidden="true" size={20} /> Phone</span>
          <span className="flex items-center gap-2 text-sm"><Tablet aria-hidden="true" size={23} /> Tablet</span>
        </div>
        {siteAddress && (
          <p className="mt-5 break-all text-sm leading-relaxed" style={{ color: "#c6d2b7" }}>
            Visit <strong style={{ color: "#f0cb72" }}>{siteAddress}</strong> on your phone or tablet.
          </p>
        )}
      </main>
    </div>
  );
}
