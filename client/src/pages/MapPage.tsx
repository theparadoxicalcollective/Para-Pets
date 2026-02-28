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

const WORLD_THEMES: Record<string, { glow: string; border: string }> = {
  snowy_mountain: { glow: "#88ccff", border: "#88ccff" },
  sky_realm: { glow: "#ffd700", border: "#ffd700" },
  island: { glow: "#20b2aa", border: "#20b2aa" },
  volcanic: { glow: "#ff4500", border: "#ff4500" },
  enchanted_grove: { glow: "#7fffd4", border: "#7fffd4" },
  desert: { glow: "#daa520", border: "#daa520" },
  swamp: { glow: "#9370db", border: "#9370db" },
  haunted_woods: { glow: "#8b008b", border: "#8b008b" },
};

const MAP_LOCATIONS = [
  { id: "snowy_mountain", name: "Frostpeak", icon: worldFrostpeak, scale: 1.15 },
  { id: "sky_realm", name: "Sky Realm", icon: worldSkyRealm },
  { id: "island", name: "The Lost Island", icon: worldLostIsland },
  { id: "volcanic", name: "Volcanic Isle", icon: worldVolcanic },
  { id: "enchanted_grove", name: "Enchanted Grove", icon: worldEnchantedGrove },
  { id: "desert", name: "Scorched Desert", icon: worldDesert },
  { id: "swamp", name: "The Swamp", icon: worldSwamp },
  { id: "haunted_woods", name: "Haunted Woods", icon: worldHauntedWoods },
];

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [, navigate] = useLocation();

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(180deg, #080812 0%, #0d1020 40%, #0a0c1a 70%, #080812 100%)",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, rgba(100,80,200,0.08) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(80,120,200,0.05) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(120,60,180,0.05) 0%, transparent 50%)",
        }}
      />

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        .world-card-glow {
          animation: pulseGlow 3s ease-in-out infinite;
        }
      `}</style>

      <div
        className="relative z-10 flex flex-col min-h-[100dvh]"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex-1 px-4 py-2">
          <h2
            className="font-fantasy text-center text-xl tracking-[0.25em] font-bold mb-4 uppercase"
            style={{
              color: "#ffd700",
              textShadow: "0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.3), 0 2px 4px rgba(0,0,0,0.8)",
            }}
            data-testid="text-map-title"
          >
            World Map
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {MAP_LOCATIONS.map((loc) => {
              const theme = WORLD_THEMES[loc.id];
              return (
                <button
                  key={loc.id}
                  data-testid={`button-location-${loc.id}`}
                  onClick={() => navigate(`/world/${loc.id}`)}
                  className="relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-transform duration-200 active:scale-95 group"
                  style={{
                    background: `linear-gradient(135deg, rgba(15,15,30,0.9) 0%, rgba(20,20,40,0.9) 100%)`,
                    border: `1.5px solid ${theme.border}44`,
                    cursor: "pointer",
                    boxShadow: `0 0 12px ${theme.glow}22, inset 0 1px 0 rgba(255,255,255,0.03)`,
                  }}
                >
                  <div
                    className="absolute inset-0 rounded-xl world-card-glow pointer-events-none"
                    style={{
                      boxShadow: `0 0 20px ${theme.glow}33, 0 0 40px ${theme.glow}15`,
                      animationDelay: `${Math.random() * 2}s`,
                    }}
                  />
                  <div className="w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg relative">
                    <div
                      className="absolute inset-0 rounded-lg pointer-events-none"
                      style={{
                        border: `1px solid ${theme.border}33`,
                        boxShadow: `inset 0 0 15px ${theme.glow}11`,
                      }}
                    />
                    <img
                      src={loc.icon}
                      alt={loc.name}
                      className="w-full h-full object-contain transition-all duration-200 group-hover:scale-105"
                      style={{
                        filter: `drop-shadow(0 4px 12px rgba(0,0,0,0.5)) drop-shadow(0 0 8px ${theme.glow}33)`,
                        transform: loc.scale ? `scale(${loc.scale})` : undefined,
                      }}
                    />
                  </div>
                  <span
                    className="font-fantasy text-[11px] tracking-wider font-semibold px-3 py-1 rounded-md relative z-10"
                    style={{
                      background: `linear-gradient(135deg, rgba(10,10,20,0.95) 0%, rgba(15,15,30,0.95) 100%)`,
                      color: theme.glow,
                      border: `1px solid ${theme.border}55`,
                      textShadow: `0 0 8px ${theme.glow}66, 0 1px 3px rgba(0,0,0,0.8)`,
                    }}
                  >
                    {loc.name}
                  </span>
                </button>
              );
            })}
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
