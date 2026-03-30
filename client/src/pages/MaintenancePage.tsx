import maintenanceImg from "@assets/maintenance_scene.png";

export default function MaintenancePage() {
  return (
    <div
      className="relative w-full h-screen-frame flex flex-col items-center justify-between overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0a0c14 0%, #0d1a24 40%, #0a1220 100%)",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      {/* Stars background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              top: `${Math.random() * 55}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.6 + 0.2,
              animation: `pulse ${Math.random() * 3 + 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Top decorative band */}
      <div
        className="w-full h-1.5 flex-shrink-0"
        style={{ background: "linear-gradient(90deg, #1a3a4a, #2a6070, #4a9080, #2a6070, #1a3a4a)" }}
      />

      {/* Illustration */}
      <div className="relative flex-1 flex flex-col items-center justify-end w-full" style={{ maxHeight: "55%" }}>
        <img
          src={maintenanceImg}
          alt="Para Pets maintenance"
          className="w-full h-full object-contain object-bottom"
          style={{ filter: "drop-shadow(0 0 40px rgba(74,144,128,0.25))" }}
        />
        {/* Bottom fade into the panel below */}
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #0a1220)" }}
        />
      </div>

      {/* Content panel */}
      <div className="relative z-10 w-full flex-shrink-0 flex flex-col items-center px-6 pb-10 pt-4 gap-5">

        {/* Title */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="font-fantasy text-2xl tracking-widest"
            style={{
              background: "linear-gradient(135deg, #7fbfb0 0%, #4a9080 50%, #2a6070 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 12px rgba(74,144,128,0.4))",
            }}
          >
            Realm Under Restoration
          </div>
          <div
            className="h-px w-48"
            style={{ background: "linear-gradient(90deg, transparent, #4a9080, transparent)" }}
          />
        </div>

        {/* Message card */}
        <div
          className="w-full rounded-2xl px-5 py-4 flex flex-col gap-3"
          style={{
            background: "linear-gradient(145deg, rgba(20,36,50,0.9) 0%, rgba(14,26,38,0.95) 100%)",
            border: "1px solid rgba(74,144,128,0.35)",
            boxShadow: "0 4px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(74,144,128,0.15)",
          }}
        >
          <p
            className="font-fantasy text-sm leading-relaxed text-center tracking-wide"
            style={{ color: "#8ab4d8" }}
          >
            Our realm's keepers are hard at work weaving new magic into the world.
          </p>
          <p
            className="font-fantasy text-xs leading-relaxed text-center tracking-wide"
            style={{ color: "#5a7a8a" }}
          >
            Please rest at the inn and return shortly — greater adventures await when the gates reopen.
          </p>
        </div>

        {/* Decorative rune row */}
        <div className="flex items-center gap-4">
          {["◆", "◇", "◆"].map((r, i) => (
            <span
              key={i}
              className="font-fantasy text-xs"
              style={{
                color: i === 1 ? "#4a9080" : "#2a5060",
                filter: i === 1 ? "drop-shadow(0 0 6px rgba(74,144,128,0.6))" : "none",
              }}
            >
              {r}
            </span>
          ))}
        </div>

        {/* Footer */}
        <p
          className="font-fantasy text-[10px] tracking-widest uppercase text-center"
          style={{ color: "#2a4050" }}
        >
          Para Pets — Maintenance in Progress
        </p>
      </div>

      {/* Bottom decorative band */}
      <div
        className="w-full h-1.5 flex-shrink-0"
        style={{ background: "linear-gradient(90deg, #1a3a4a, #2a6070, #4a9080, #2a6070, #1a3a4a)" }}
      />
    </div>
  );
}
