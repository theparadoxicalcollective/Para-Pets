import { useState } from "react";
import { useLocation } from "wouter";
import worldFrostpeak from "@assets/world_frostpeak_v2.png";
import worldSkyRealm from "@assets/world_sky_realm_v3.png";
import worldVolcanic from "@assets/world_volcanic_v2.png";
import worldLostIsland from "@assets/world_lost_island.png";
import worldDesert from "@assets/world_desert_v2.png";
import worldEnchantedGrove from "@assets/world_enchanted_grove_v2.png";
import worldHauntedWoods from "@assets/world_haunted_woods_v2.png";
import worldSwamp from "@assets/world_swamp_v3.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";

interface MapPageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

const MAP_LOCATIONS = [
  { id: "sky_realm", name: "Sky Realm", icon: worldSkyRealm, glow: "#ffd700", x: 48, y: 5, size: 22 },
  { id: "snowy_mountain", name: "Frostpeak", icon: worldFrostpeak, glow: "#88ccff", x: 8, y: 16, size: 24 },
  { id: "enchanted_grove", name: "Enchanted Grove", icon: worldEnchantedGrove, glow: "#7fffd4", x: 62, y: 19, size: 22 },
  { id: "island", name: "Lost Island", icon: worldLostIsland, glow: "#20b2aa", x: 5, y: 40, size: 21 },
  { id: "volcanic", name: "Volcanic Isle", icon: worldVolcanic, glow: "#ff4500", x: 58, y: 42, size: 23 },
  { id: "desert", name: "Scorched Desert", icon: worldDesert, glow: "#daa520", x: 28, y: 56, size: 22 },
  { id: "swamp", name: "The Swamp", icon: worldSwamp, glow: "#9370db", x: 65, y: 64, size: 21 },
  { id: "haunted_woods", name: "Haunted Woods", icon: worldHauntedWoods, glow: "#8b008b", x: 18, y: 76, size: 23 },
];

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [, navigate] = useLocation();

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(180deg, #06060f 0%, #0c1022 30%, #0a0e1c 60%, #06060f 100%)",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 30% 25%, rgba(136,204,255,0.04) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 70% 20%, rgba(255,215,0,0.04) 0%, transparent 45%), " +
            "radial-gradient(ellipse at 15% 50%, rgba(32,178,170,0.03) 0%, transparent 40%), " +
            "radial-gradient(ellipse at 75% 55%, rgba(255,69,0,0.04) 0%, transparent 45%), " +
            "radial-gradient(ellipse at 50% 70%, rgba(218,165,32,0.03) 0%, transparent 40%), " +
            "radial-gradient(ellipse at 25% 85%, rgba(139,0,139,0.04) 0%, transparent 45%)",
        }}
      />

      <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-[0.06]">
        <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(200,180,140,0.5)" strokeWidth="0.5" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#mapGrid)" />
      </svg>

      <style>{`
        @keyframes floatWorld {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .world-node { transition: transform 0.2s ease; }
        .world-node:active { transform: scale(0.92) !important; }
      `}</style>

      <div
        className="relative z-10 flex flex-col min-h-[100dvh]"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex-1 relative">
          <h2
            className="font-fantasy text-center text-lg tracking-[0.3em] font-bold pt-2 pb-1 uppercase relative z-10"
            style={{
              color: "#ffd700",
              textShadow: "0 0 15px rgba(255,215,0,0.5), 0 0 30px rgba(255,215,0,0.2), 0 2px 4px rgba(0,0,0,0.9)",
            }}
            data-testid="text-map-title"
          >
            World Map
          </h2>

          <div className="relative w-full" style={{ paddingBottom: "110%" }}>
            <div className="absolute inset-0">
              {MAP_LOCATIONS.map((loc, i) => (
                <button
                  key={loc.id}
                  data-testid={`button-location-${loc.id}`}
                  onClick={() => navigate(`/world/${loc.id}`)}
                  className="absolute world-node flex flex-col items-center"
                  style={{
                    left: `${loc.x}%`,
                    top: `${loc.y}%`,
                    width: `${loc.size}%`,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    zIndex: 10 + i,
                    animation: `floatWorld ${3 + (i % 3) * 0.5}s ease-in-out infinite`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                >
                  <div className="relative w-full" style={{ aspectRatio: "1" }}>
                    <div
                      className="absolute inset-[-15%] rounded-full pointer-events-none"
                      style={{
                        background: `radial-gradient(circle, ${loc.glow}25 0%, ${loc.glow}08 50%, transparent 70%)`,
                        animation: `glowPulse ${3 + (i % 2)}s ease-in-out infinite`,
                        animationDelay: `${i * 0.3}s`,
                      }}
                    />
                    <img
                      src={loc.icon}
                      alt={loc.name}
                      className="w-full h-full object-contain relative z-10"
                      style={{
                        filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 12px ${loc.glow}30)`,
                      }}
                    />
                  </div>
                  <span
                    className="font-fantasy text-[9px] sm:text-[10px] tracking-wider font-semibold whitespace-nowrap mt-0.5 px-2 py-0.5 rounded-full relative z-10"
                    style={{
                      color: loc.glow,
                      textShadow: `0 0 8px ${loc.glow}66, 0 1px 3px rgba(0,0,0,0.9)`,
                      background: "rgba(6,6,15,0.7)",
                      border: `1px solid ${loc.glow}30`,
                    }}
                  >
                    {loc.name}
                  </span>
                </button>
              ))}

              <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5] opacity-[0.12]">
                <line x1="59%" y1="14%" x2="20%" y2="24%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="20%" y1="28%" x2="16%" y2="48%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="73%" y1="30%" x2="70%" y2="50%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="16%" y1="51%" x2="39%" y2="64%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="70%" y1="53%" x2="50%" y2="64%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="39%" y1="67%" x2="30%" y2="84%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
                <line x1="76%" y1="73%" x2="41%" y2="84%" stroke="#aaa" strokeWidth="0.5" strokeDasharray="4,6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}
