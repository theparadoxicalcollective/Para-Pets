import { useState } from "react";
import { useLocation } from "wouter";
import bgParchment from "@assets/bg_map_parchment.png";
import bgHauntedWoods from "@assets/bg_haunted_woods.png";
import bgSwamp from "@assets/bg_swamp.png";
import bgDesert from "@assets/bg_desert.png";
import bgIsland from "@assets/bg_island.png";
import bgVolcanic from "@assets/bg_volcanic.png";
import bgSkyRealm from "@assets/bg_sky_realm.png";
import bgSnowyMountain from "@assets/bg_snowy_mountain.png";
import bgMagicalForest from "@assets/bg_magical_forest.png";
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
  { id: "snowy_mountain", name: "Frostpeak", bg: bgSnowyMountain, icon: worldFrostpeak, top: "8%", left: "5%", width: "42%" },
  { id: "sky_realm", name: "Sky Realm", bg: bgSkyRealm, icon: worldSkyRealm, top: "5%", left: "55%", width: "40%" },
  { id: "island", name: "Treasure Isle", bg: bgIsland, icon: worldIsland, top: "28%", left: "2%", width: "40%" },
  { id: "volcanic", name: "Volcanic Isle", bg: bgVolcanic, icon: worldVolcanic, top: "26%", left: "52%", width: "35%" },
  { id: "enchanted_grove", name: "Enchanted Grove", bg: bgMagicalForest, icon: worldEnchantedGrove, top: "44%", left: "8%", width: "46%" },
  { id: "desert", name: "Scorched Desert", bg: bgDesert, icon: worldDesert, top: "45%", left: "52%", width: "44%" },
  { id: "swamp", name: "The Swamp", bg: bgSwamp, icon: worldSwamp, top: "68%", left: "2%", width: "44%" },
  { id: "haunted_woods", name: "Haunted Woods", bg: bgHauntedWoods, icon: worldHauntedWoods, top: "66%", left: "50%", width: "46%" },
];

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [selectedLocation, setSelectedLocation] = useState<typeof MAP_LOCATIONS[0] | null>(null);
  const [, navigate] = useLocation();

  if (selectedLocation) {
    return (
      <div
        className="relative w-full min-h-[100dvh] overflow-hidden flex flex-col"
        style={{
          backgroundImage: `url(${selectedLocation.bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          maxWidth: "768px",
          margin: "0 auto",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 z-0 pointer-events-none" />

        <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

          <div className="flex-1 flex flex-col items-center justify-end px-6 pb-8">
            <div
              className="px-8 py-5 rounded-lg text-center w-full max-w-sm"
              style={{
                background: "rgba(0,0,0,0.7)",
                border: "1px solid rgba(212,160,23,0.4)",
                boxShadow: "0 4px 30px rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)",
              }}
            >
              <h2
                className="font-fantasy text-xl font-bold tracking-widest mb-2 text-[#f0c040]"
                style={{ textShadow: "0 0 15px rgba(240,192,64,0.5)" }}
                data-testid={`text-location-name-${selectedLocation.id}`}
              >
                {selectedLocation.name}
              </h2>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider mb-4">
                This realm awaits exploration...
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  data-testid="button-world-shop"
                  onClick={() => navigate(`/shop/${selectedLocation.id}`)}
                  className="px-5 py-2 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(127,255,212,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  Shop
                </button>
                <button
                  data-testid="button-back-to-map"
                  onClick={() => setSelectedLocation(null)}
                  className="px-5 py-2 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                    border: "1px solid rgba(212,160,23,0.5)",
                    color: "#f0c040",
                    cursor: "pointer",
                  }}
                >
                  Back to Map
                </button>
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
              onClick={() => setSelectedLocation(loc)}
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
                style={{
                  filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
                }}
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
