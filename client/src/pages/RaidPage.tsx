import { useLocation } from "wouter";
import raidBg from "@assets/F17D0472-325D-4FA4-B9E9-5B44668D2BC5_1783810844517.png";
import raidIconImg from "@assets/Photoroom_20260711_52200_PM_1783810844517.png";

export default function RaidPage() {
  const [, navigate] = useLocation();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#08040c",
        overflow: "hidden",
      }}
    >
      <img
        src={raidBg}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,2,8,0.45)",
          pointerEvents: "none",
        }}
      />

      <button
        data-testid="button-close-raid"
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 18,
          right: 16,
          background: "rgba(0,0,0,0.65)",
          border: "1px solid rgba(240,192,64,0.3)",
          borderRadius: 10,
          color: "#a89878",
          fontFamily: "Lora, serif",
          fontSize: 11,
          letterSpacing: "0.1em",
          padding: "7px 16px",
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        Close
      </button>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          zIndex: 5,
          padding: "0 24px",
        }}
      >
        <img
          src={raidIconImg}
          alt="Raid"
          style={{
            width: 130,
            height: 130,
            objectFit: "contain",
            filter: "drop-shadow(0 0 28px rgba(240,80,30,0.65)) drop-shadow(0 0 8px rgba(0,0,0,0.8))",
          }}
        />

        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontFamily: "Lora, serif",
              fontSize: 10,
              letterSpacing: "0.35em",
              color: "#7a4520",
              textTransform: "uppercase",
              margin: "0 0 6px",
            }}
          >
            World Event
          </p>
          <h1
            style={{
              fontFamily: "Lora, serif",
              fontSize: 36,
              color: "#f0c040",
              letterSpacing: "0.12em",
              margin: 0,
              textShadow: "0 0 30px rgba(240,100,20,0.8), 0 0 8px rgba(0,0,0,1)",
            }}
          >
            RAID
          </h1>
        </div>

        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(240,192,64,0.18)",
            borderRadius: 16,
            padding: "18px 32px",
            textAlign: "center",
            maxWidth: 280,
            backdropFilter: "blur(6px)",
          }}
        >
          <p
            style={{
              fontFamily: "Lora, serif",
              fontSize: 15,
              color: "#d4a017",
              letterSpacing: "0.08em",
              margin: "0 0 10px",
            }}
          >
            Coming Soon
          </p>
          <p
            style={{
              fontFamily: "Lora, serif",
              fontSize: 12,
              color: "#5a4020",
              letterSpacing: "0.04em",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            Unite with other tamers to challenge powerful raid bosses and earn legendary rewards.
          </p>
        </div>
      </div>
    </div>
  );
}
