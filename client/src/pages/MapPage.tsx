import { useState } from "react";
import { useLocation } from "wouter";
import bgMapImg from "@assets/bg_map.png";
import bgHauntedWoods from "@assets/bg_haunted_woods.png";
import bgSwamp from "@assets/bg_swamp.png";
import bgDesert from "@assets/bg_desert.png";
import bgIsland from "@assets/bg_island.png";
import bgVolcanic from "@assets/bg_volcanic.png";
import bgSkyRealm from "@assets/bg_sky_realm.png";
import bgSnowyMountain from "@assets/bg_snowy_mountain.png";
import bgMagicalForest from "@assets/bg_magical_forest.png";
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
  { id: "haunted_woods", name: "Haunted Woods", bg: bgHauntedWoods, top: "12%", left: "8%", color: "#9b59b6" },
  { id: "swamp", name: "The Swamp", bg: bgSwamp, top: "30%", left: "65%", color: "#27ae60" },
  { id: "desert", name: "Scorched Desert", bg: bgDesert, top: "55%", left: "15%", color: "#f39c12" },
  { id: "island", name: "Treasure Isle", bg: bgIsland, top: "72%", left: "55%", color: "#3498db" },
  { id: "volcanic", name: "Volcanic Isle", bg: bgVolcanic, top: "80%", left: "20%", color: "#e74c3c" },
  { id: "sky_realm", name: "Sky Realm", bg: bgSkyRealm, top: "5%", left: "55%", color: "#f1c40f" },
  { id: "snowy_mountain", name: "Frostpeak", bg: bgSnowyMountain, top: "22%", left: "30%", color: "#bdc3c7" },
  { id: "magical_forest", name: "Enchanted Grove", bg: bgMagicalForest, top: "45%", left: "45%", color: "#2ecc71" },
];

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [selectedLocation, setSelectedLocation] = useState<typeof MAP_LOCATIONS[0] | null>(null);

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

          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div
              className="px-8 py-4 rounded-lg text-center"
              style={{
                background: "rgba(0,0,0,0.6)",
                border: `2px solid ${selectedLocation.color}60`,
                boxShadow: `0 0 30px ${selectedLocation.color}30`,
              }}
            >
              <h2
                className="font-fantasy text-xl font-bold tracking-widest mb-2"
                style={{ color: selectedLocation.color, textShadow: `0 0 15px ${selectedLocation.color}80` }}
                data-testid={`text-location-name-${selectedLocation.id}`}
              >
                {selectedLocation.name}
              </h2>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider mb-4">
                This realm awaits exploration...
              </p>
              <button
                data-testid="button-back-to-map"
                onClick={() => setSelectedLocation(null)}
                className="px-6 py-2 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)",
                  border: "1px solid rgba(212,160,23,0.5)",
                  color: "#f0c040",
                  cursor: "pointer",
                }}
              >
                Return to Map
              </button>
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
        backgroundImage: `url(${bgMapImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} />

        <div className="flex-1 relative">
          {MAP_LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              data-testid={`button-location-${loc.id}`}
              onClick={() => setSelectedLocation(loc)}
              className="absolute transition-transform duration-200 active:scale-110 group"
              style={{
                top: loc.top,
                left: loc.left,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center animate-pulse-slow"
                style={{
                  background: `radial-gradient(circle, ${loc.color}50 0%, ${loc.color}20 50%, transparent 70%)`,
                  border: `2px solid ${loc.color}80`,
                  boxShadow: `0 0 15px ${loc.color}40, inset 0 0 8px ${loc.color}30`,
                }}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{
                    background: loc.color,
                    boxShadow: `0 0 8px ${loc.color}`,
                  }}
                />
              </div>
              <span
                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap font-fantasy text-[9px] tracking-wider px-2 py-0.5 rounded"
                style={{
                  background: "rgba(0,0,0,0.8)",
                  color: loc.color,
                  border: `1px solid ${loc.color}40`,
                  textShadow: `0 0 6px ${loc.color}60`,
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
