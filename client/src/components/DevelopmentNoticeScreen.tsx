import { useState } from "react";
import bgImage from "@assets/generated_images/welcome_dev_notice_bg.png";

interface DevelopmentNoticeScreenProps {
  onContinue: () => void;
}

export default function DevelopmentNoticeScreen({ onContinue }: DevelopmentNoticeScreenProps) {
  const [closing, setClosing] = useState(false);

  const handleContinue = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onContinue, 350);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        fontFamily: "Lora, Georgia, serif",
        opacity: closing ? 0 : 1,
        transition: "opacity 0.35s ease-out",
      }}
      data-testid="screen-development-notice"
    >
      {/* Atmospheric darken/vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(10,18,12,0.35) 0%, rgba(8,14,10,0.7) 70%, rgba(4,8,6,0.92) 100%)",
        }}
      />

      {/* Floating fireflies */}
      <span style={{ position: "absolute", top: "18%", left: "18%", width: 5, height: 5, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 12px 2px rgba(253,230,138,0.7)", animation: "devNoticeFirefly 3.2s ease-in-out infinite", animationDelay: "0s", pointerEvents: "none" }} />
      <span style={{ position: "absolute", top: "26%", right: "20%", width: 4, height: 4, borderRadius: "50%", background: "#a7f3d0", boxShadow: "0 0 10px 2px rgba(167,243,208,0.7)", animation: "devNoticeFirefly 2.8s ease-in-out infinite", animationDelay: "0.6s", pointerEvents: "none" }} />
      <span style={{ position: "absolute", top: "36%", left: "30%", width: 3, height: 3, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 8px 2px rgba(253,230,138,0.7)", animation: "devNoticeFirefly 3.6s ease-in-out infinite", animationDelay: "1.2s", pointerEvents: "none" }} />
      <span style={{ position: "absolute", top: "12%", right: "32%", width: 4, height: 4, borderRadius: "50%", background: "#bbf7d0", boxShadow: "0 0 10px 2px rgba(187,247,208,0.7)", animation: "devNoticeFirefly 4.0s ease-in-out infinite", animationDelay: "1.8s", pointerEvents: "none" }} />
      <span style={{ position: "absolute", top: "44%", left: "10%", width: 3, height: 3, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 8px 2px rgba(253,230,138,0.6)", animation: "devNoticeFirefly 3.4s ease-in-out infinite", animationDelay: "2.4s", pointerEvents: "none" }} />

      {/* Card */}
      <div
        className="relative flex flex-col items-center mx-4 mb-10 mt-10"
        style={{
          width: "92%",
          maxWidth: 420,
          padding: "26px 22px 22px",
          borderRadius: 22,
          background:
            "linear-gradient(160deg, rgba(14,28,18,0.94) 0%, rgba(8,18,12,0.96) 100%)",
          border: "1.5px solid rgba(212,170,50,0.55)",
          backdropFilter: "blur(6px)",
          animation: "devNoticeFadeUp 0.55s ease-out, devNoticeGlowPulse 4s ease-in-out infinite 0.55s",
        }}
      >
        {/* Top ornament band */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 22,
            right: 22,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(212,170,50,0.85) 30%, rgba(167,243,208,0.7) 50%, rgba(212,170,50,0.85) 70%, transparent)",
            borderRadius: 2,
          }}
        />

        <p
          style={{
            color: "rgba(212,170,50,0.75)",
            fontSize: 10,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          A Note from the Realm
        </p>

        <h1
          style={{
            color: "#f3e3a5",
            fontSize: 24,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.18,
            margin: 0,
            textShadow: "0 0 22px rgba(212,170,50,0.45), 0 2px 6px rgba(0,0,0,0.6)",
          }}
        >
          Welcome, Early Wanderer
        </h1>

        <div
          style={{
            width: 60,
            height: 1,
            margin: "14px 0 14px",
            background:
              "linear-gradient(90deg, transparent, rgba(212,170,50,0.7), transparent)",
          }}
        />

        <p
          style={{
            color: "#dcd4b8",
            fontSize: 13.5,
            lineHeight: 1.6,
            textAlign: "center",
            margin: 0,
          }}
        >
          The realm of <span style={{ color: "#f3e3a5", fontWeight: 600 }}>Para Pets</span> is still being woven.
          You step in early, and so the paths may shimmer, falter, or shift as the world grows.
        </p>

        <p
          style={{
            color: "#c8c0a4",
            fontSize: 12.5,
            lineHeight: 1.6,
            textAlign: "center",
            marginTop: 12,
            fontStyle: "italic",
          }}
        >
          Small bumps along the trail are part of the journey. Each update brings new wonders,
          smoother magic, and deeper adventures — and your time here helps shape them all.
        </p>

        <p
          style={{
            color: "rgba(167,243,208,0.85)",
            fontSize: 11.5,
            lineHeight: 1.5,
            textAlign: "center",
            marginTop: 14,
            letterSpacing: "0.04em",
          }}
        >
          Thank you for being one of the first to wander these woods. ✦
        </p>

        <button
          data-testid="button-continue-to-realm"
          onClick={handleContinue}
          className="mt-6 w-full rounded-xl font-bold tracking-wider transition-transform active:scale-95"
          style={{
            padding: "13px 0",
            fontSize: 13,
            letterSpacing: "0.12em",
            background:
              "linear-gradient(135deg, rgba(212,170,50,0.95) 0%, rgba(180,120,20,0.95) 50%, rgba(212,170,50,0.95) 100%)",
            border: "1.5px solid rgba(255,220,80,0.7)",
            color: "#1a0e00",
            cursor: "pointer",
            boxShadow: "0 0 22px rgba(212,170,50,0.4)",
            fontFamily: "Lora, Georgia, serif",
          }}
        >
          CONTINUE TO THE REALM
        </button>

        {/* Bottom ornament band */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 22,
            right: 22,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgba(167,243,208,0.7) 30%, rgba(212,170,50,0.85) 50%, rgba(167,243,208,0.7) 70%, transparent)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
