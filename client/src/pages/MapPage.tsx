import { useState } from "react";
import { useLocation } from "wouter";
import bgParchment from "@assets/bg_map_parchment.png";
import worldFrostpeak from "@assets/world_frostpeak.png";
import worldSkyRealm from "@assets/world_sky_realm.png";
import worldVolcanic from "@assets/world_volcanic.png";
import worldIsland from "@assets/world_island.png";
import worldDesert from "@assets/world_desert.png";
import worldEnchantedGrove from "@assets/world_enchanted_grove.png";
import worldHauntedWoods from "@assets/world_haunted_woods.png";
import worldSwamp from "@assets/world_swamp.png";
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
  { id: "snowy_mountain", name: "Frostpeak", icon: worldFrostpeak, top: "8%", left: "5%", width: "42%" },
  { id: "sky_realm", name: "Sky Realm", icon: worldSkyRealm, top: "5%", left: "55%", width: "40%" },
  { id: "island", name: "Treasure Isle", icon: worldIsland, top: "28%", left: "2%", width: "40%" },
  { id: "volcanic", name: "Volcanic Isle", icon: worldVolcanic, top: "26%", left: "52%", width: "35%" },
  { id: "enchanted_grove", name: "Enchanted Grove", icon: worldEnchantedGrove, top: "44%", left: "8%", width: "46%" },
  { id: "desert", name: "Scorched Desert", icon: worldDesert, top: "45%", left: "52%", width: "44%" },
  { id: "swamp", name: "The Swamp", icon: worldSwamp, top: "68%", left: "2%", width: "44%" },
  { id: "haunted_woods", name: "Haunted Woods", icon: worldHauntedWoods, top: "66%", left: "50%", width: "46%" },
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

        <div className="flex-1 relative px-2">
          {MAP_LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              data-testid={`button-location-${loc.id}`}
              onClick={() => navigate(`/world/${loc.id}`)}
              className="absolute transition-transform duration-200 active:scale-105 group"
              style={{
                top: loc.top,
                left: loc.left,
                width: loc.width,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <img
                src={loc.icon}
                alt={loc.name}
                className="w-full h-auto object-contain transition-all duration-200 group-hover:brightness-110"
                style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}
              />
              <span
                className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 whitespace-nowrap font-fantasy text-[10px] tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: "rgba(60,30,10,0.85)",
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
