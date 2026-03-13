import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import bgImg from "@assets/bg_home_v2.png";
import TopBar from "@/components/TopBar";
import { useState } from "react";

interface BadgePageProps {
  user: {
    id: string;
    username: string;
    email: string;
    coins: number;
    isAdmin: boolean;
    profileImage: string | null;
  };
}

interface UserBadge {
  id: string;
  badgeId: string;
  awardedAt: string;
  name: string;
  imageUrl: string;
}

export default function BadgePage({ user }: BadgePageProps) {
  const [, navigate] = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const { data: myBadges = [], isLoading } = useQuery<UserBadge[]>({
    queryKey: ["/api/user/badges"],
  });

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85 z-0 pointer-events-none" />

      <div
        className="relative z-10 flex flex-col h-full"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <TopBar
          user={currentUser}
          onProfileClick={() => setShowProfile(true)}
          onUserUpdate={(u) => setCurrentUser(u)}
        />

        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            data-testid="button-back-badges"
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(212,160,23,0.4)",
              color: "#f0c040",
              cursor: "pointer",
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2
            className="font-fantasy text-lg tracking-widest"
            style={{ color: "#f0c040", textShadow: "0 0 16px rgba(240,192,64,0.5)" }}
          >
            My Badges
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <p className="font-fantasy text-sm tracking-wider animate-pulse" style={{ color: "#7fbfb0" }}>
                Gathering honours...
              </p>
            </div>
          ) : myBadges.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(240,192,64,0.08)",
                  border: "2px dashed rgba(240,192,64,0.25)",
                }}
              >
                <svg viewBox="0 0 100 100" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                  <polygon
                    points="50,10 54,30 74,30 58,44 64,64 50,52 36,64 42,44 26,30 46,30"
                    fill="rgba(240,192,64,0.25)"
                    stroke="rgba(240,192,64,0.4)"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-fantasy text-sm tracking-wider mb-1" style={{ color: "#a89878" }}>
                  No badges yet
                </p>
                <p className="font-fantasy text-[10px] tracking-wide" style={{ color: "#6a5840" }}>
                  Earn badges through special achievements
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 pt-2">
              {myBadges.map((badge) => (
                <div
                  key={badge.id}
                  data-testid={`card-badge-${badge.badgeId}`}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(240,192,64,0.1)",
                      border: "2px solid rgba(212,160,23,0.5)",
                      boxShadow: "0 0 16px rgba(240,192,64,0.2), 0 4px 12px rgba(0,0,0,0.6)",
                    }}
                  >
                    <img
                      src={badge.imageUrl}
                      alt={badge.name}
                      className="w-16 h-16 object-contain"
                      style={{ filter: "drop-shadow(0 2px 6px rgba(240,192,64,0.4))" }}
                    />
                  </div>
                  <p
                    className="font-fantasy text-[10px] tracking-wider text-center leading-tight"
                    style={{ color: "#f0c040" }}
                  >
                    {badge.name}
                  </p>
                  <p
                    className="font-fantasy text-[8px] tracking-wide text-center"
                    style={{ color: "#6a5840" }}
                  >
                    {new Date(badge.awardedAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
