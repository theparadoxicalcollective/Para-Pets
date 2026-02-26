import { useState } from "react";
import { useLocation } from "wouter";
import bgParchment from "@assets/bg_map_parchment.png";
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
  { id: "snowy_mountain", name: "Frostpeak", icon: worldFrostpeak, row: 0, col: 0, scale: 1.15 },
  { id: "sky_realm", name: "Sky Realm", icon: worldSkyRealm, row: 0, col: 1 },
  { id: "island", name: "The Lost Island", icon: worldLostIsland, row: 1, col: 0 },
  { id: "volcanic", name: "Volcanic Isle", icon: worldVolcanic, row: 1, col: 1 },
  { id: "enchanted_grove", name: "Enchanted Grove", icon: worldEnchantedGrove, row: 2, col: 0 },
  { id: "desert", name: "Scorched Desert", icon: worldDesert, row: 2, col: 1 },
  { id: "swamp", name: "The Swamp", icon: worldSwamp, row: 3, col: 0 },
  { id: "haunted_woods", name: "Haunted Woods", icon: worldHauntedWoods, row: 3, col: 1 },
];

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [, navigate] = useLocation();

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgParchment})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(120,80,30,0.3) 100%)" }} />

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

        <div className="flex-1 px-4 py-2">
          <h2
            className="font-fantasy text-center text-lg tracking-widest font-bold mb-3"
            style={{ color: "#5c3a1e", textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
          >
            WORLD MAP
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {MAP_LOCATIONS.map((loc) => (
              <button
                key={loc.id}
                data-testid={`button-location-${loc.id}`}
                onClick={() => navigate(`/world/${loc.id}`)}
                className="relative flex flex-col items-center gap-1 p-2 rounded-xl transition-transform duration-200 active:scale-95 group"
                style={{
                  background: "rgba(60,30,10,0.12)",
                  border: "1px solid rgba(92,58,30,0.25)",
                  cursor: "pointer",
                }}
              >
                <div className="w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg">
                  <img
                    src={loc.icon}
                    alt={loc.name}
                    className="w-full h-full object-contain transition-all duration-200 group-hover:scale-105"
                    style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))", transform: loc.scale ? `scale(${loc.scale})` : undefined }}
                  />
                </div>
                <span
                  className="font-fantasy text-[11px] tracking-wider font-semibold px-3 py-1 rounded-md"
                  style={{
                    background: "linear-gradient(135deg, rgba(60,30,10,0.9) 0%, rgba(40,20,5,0.9) 100%)",
                    color: "#f0c040",
                    border: "1px solid rgba(212,160,23,0.4)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}
                >
                  {loc.name}
                </span>
              </button>
            ))}
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
