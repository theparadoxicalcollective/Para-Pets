import { useLocation } from "wouter";
import TopBar from "@/components/TopBar";
import bgImg from "@assets/bg_home_v2.png";

interface PetHousePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

export default function PetHousePage({ user }: PetHousePageProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col"
      style={{ maxWidth: "768px", margin: "0 auto" }}
    >
      <div className="absolute inset-0 z-0">
        <img src={bgImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "rgba(10,30,15,0.55)" }} />
      </div>

      <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar
          user={user}
          onProfileClick={() => {}}
          hideTreehouse
        />

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div
            className="flex flex-col items-center gap-3"
            style={{ filter: "drop-shadow(0 0 30px rgba(127,255,212,0.15))" }}
          >
            <TreehouseIllustration size={120} />

            <h1
              className="font-fantasy text-[#f0c040] text-2xl tracking-widest text-center"
              style={{ textShadow: "0 0 20px rgba(240,192,64,0.5)" }}
            >
              Pet House
            </h1>

            <p className="font-fantasy text-[#7fbfb0] text-xs tracking-wider text-center opacity-70">
              Coming soon...
            </p>
          </div>

          <div
            className="w-full max-w-xs rounded-xl px-5 py-4 flex flex-col items-center gap-2"
            style={{
              background: "linear-gradient(135deg, rgba(20,10,3,0.85) 0%, rgba(45,25,8,0.85) 100%)",
              border: "1px solid rgba(212,160,23,0.25)",
            }}
          >
            <p className="font-fantasy text-[#a89878] text-[11px] tracking-wider text-center leading-relaxed">
              Your pets will live here when they're not adventuring. Check back soon!
            </p>
          </div>

          <button
            data-testid="button-back-home"
            onClick={() => navigate("/")}
            className="px-6 py-2.5 rounded-lg font-fantasy text-sm tracking-wider transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
              border: "1px solid rgba(127,255,212,0.4)",
              color: "#7fffd4",
              cursor: "pointer",
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

function TreehouseIllustration({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7fffd4" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#7fffd4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="trunkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b3d1e" />
          <stop offset="100%" stopColor="#9b5a2e" />
        </linearGradient>
        <linearGradient id="leafGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="leafGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="houseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>

      <circle cx="40" cy="40" r="38" fill="url(#glowGrad)" />

      <rect x="34" y="50" width="12" height="22" rx="2" fill="url(#trunkGrad)" />
      <rect x="36" y="50" width="3" height="22" rx="1" fill="rgba(0,0,0,0.15)" />

      <ellipse cx="40" cy="44" rx="22" ry="18" fill="url(#leafGrad1)" />
      <ellipse cx="40" cy="38" rx="18" ry="15" fill="url(#leafGrad2)" />
      <ellipse cx="40" cy="32" rx="14" ry="12" fill="#4ade80" />

      <ellipse cx="28" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />
      <ellipse cx="52" cy="42" rx="9" ry="7" fill="#22c55e" opacity="0.8" />

      <rect x="27" y="34" width="26" height="16" rx="2" fill="url(#houseGrad)" />

      <polygon points="25,35 40,24 55,35" fill="url(#roofGrad)" />
      <polygon points="25,35 40,24 55,35" fill="none" stroke="#7f1d1d" strokeWidth="0.5" />

      <rect x="36" y="41" width="8" height="9" rx="1" fill="#854d0e" />
      <rect x="37" y="42" width="6" height="7" rx="0.5" fill="#92400e" />
      <line x1="40" y1="42" x2="40" y2="49" stroke="#7c2d12" strokeWidth="0.5" />

      <rect x="29" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />
      <rect x="46" y="37" width="5" height="5" rx="0.5" fill="#bae6fd" opacity="0.7" />

      <line x1="34" y1="44" x2="27" y2="50" stroke="#92400e" strokeWidth="2" strokeLinecap="round" />

      <circle cx="22" cy="28" r="1.5" fill="#fde68a" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="58" cy="32" r="1" fill="#fde68a" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle cx="18" cy="38" r="1" fill="#86efac" opacity="0.6">
        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="3s" repeatCount="indefinite" begin="1s" />
      </circle>
    </svg>
  );
}
