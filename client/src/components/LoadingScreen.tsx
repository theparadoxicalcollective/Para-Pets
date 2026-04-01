export default function LoadingScreen({ label = "Entering the world…" }: { label?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#050d09",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Ambient radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 45% at 50% 58%, rgba(26,100,68,0.28) 0%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      {/* Decorative top wisps */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "40%",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(30,90,60,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Main content */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Orb / sigil */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "radial-gradient(circle at 38% 35%, #62efb8 0%, #1a9965 45%, #0e4d34 100%)",
            boxShadow:
              "0 0 18px 6px rgba(40,190,120,0.38), 0 0 60px 16px rgba(20,100,60,0.18)",
            marginBottom: 20,
            animation: "pp-orb 2.8s ease-in-out infinite",
            flexShrink: 0,
          }}
        />

        {/* Game title */}
        <div
          style={{
            fontFamily: "'Cinzel', 'Cinzel Decorative', Georgia, serif",
            fontSize: "clamp(1.6rem, 7.5vw, 2.1rem)",
            color: "#82efce",
            letterSpacing: "0.22em",
            textAlign: "center",
            textShadow:
              "0 0 28px rgba(60,210,140,0.55), 0 2px 6px rgba(0,0,0,0.85)",
            lineHeight: 1.15,
            marginBottom: 10,
            userSelect: "none",
          }}
        >
          Para Pets
        </div>

        {/* Status label */}
        <div
          style={{
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            fontSize: "0.62rem",
            color: "#336b52",
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 20,
            userSelect: "none",
          }}
        >
          {label}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: "9.5rem",
            height: 5,
            background: "rgba(10,30,20,0.85)",
            borderRadius: 9999,
            overflow: "hidden",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
            position: "relative",
          }}
        >
          {/* Sliding shimmer — smooth loop, no jump */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "42%",
              borderRadius: 9999,
              background:
                "linear-gradient(90deg, transparent 0%, #1db87a 25%, #40eea8 50%, #1db87a 75%, transparent 100%)",
              animation: "pp-bar 1.9s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {/* Bottom corner wisps */}
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "25%",
          background:
            "radial-gradient(ellipse 100% 80% at 50% 110%, rgba(20,70,45,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
