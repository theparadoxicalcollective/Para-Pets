import loadingOrb from "../assets/loading_orb.webp";

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
        {/* Orb glow halo — sits behind the image */}
        <div style={{ position: "relative", marginBottom: 16, flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              inset: "-28px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(50,210,140,0.22) 0%, rgba(20,120,80,0.12) 45%, transparent 70%)",
              animation: "pp-orb 2.8s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-10px",
              borderRadius: "50%",
              boxShadow: "0 0 28px 10px rgba(40,200,130,0.28), 0 0 60px 20px rgba(20,120,70,0.14)",
              animation: "pp-orb 2.8s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <img
            src={loadingOrb}
            alt=""
            style={{
              width: 80,
              height: 80,
              display: "block",
              animation: "pp-orb 2.8s ease-in-out infinite",
              filter: "drop-shadow(0 0 14px rgba(60,220,150,0.6)) drop-shadow(0 0 32px rgba(20,150,90,0.35))",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Game title */}
        <div
          style={{
            fontFamily: "'Lora', 'Lora', Georgia, serif",
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

        {/* Progress bar with label overlaid — unified element, no separate floating text */}
        <div
          style={{
            position: "relative",
            width: "9.5rem",
          }}
        >
          {/* Bar track */}
          <div
            style={{
              width: "100%",
              height: 22,
              background: "rgba(10,30,20,0.85)",
              borderRadius: 9999,
              overflow: "hidden",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
              position: "relative",
            }}
          >
            {/* Sliding shimmer — left starts at -48% to prevent position-0 flash on iOS */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "-48%",
                width: "42%",
                borderRadius: 9999,
                background:
                  "linear-gradient(90deg, transparent 0%, #1db87a 25%, #40eea8 50%, #1db87a 75%, transparent 100%)",
                animation: "pp-bar 1.9s ease-in-out infinite",
              }}
            />
          </div>
          {/* Label centered over the bar */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              fontSize: "0.58rem",
              color: "#4aaa80",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            {label}
          </div>
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
