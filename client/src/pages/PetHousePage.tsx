import { useState, useRef, useCallback, useEffect } from "react";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import petHouseBg from "@assets/IMG_6459_1774822089433.jpeg";

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

const BG_RATIO = 1920 / 2400;

export default function PetHousePage({ user }: PetHousePageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const [panX, setPanX] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ startX: number; startPanX: number; pid: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH / BG_RATIO;
    const min = Math.min(0, containerW - imgW);
    setPanX(Math.max(min, -(imgW - containerW) / 2));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panStartRef.current = { startX: e.clientX, startPanX: panX, pid: e.pointerId };
  }, [panX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = panStartRef.current;
    if (!drag || drag.pid !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgW = containerH / BG_RATIO;
    const min = Math.min(0, containerW - imgW);
    const next = Math.min(0, Math.max(min, drag.startPanX + (e.clientX - drag.startX)));
    setPanX(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen-frame overflow-hidden"
      style={{ maxWidth: "768px", margin: "0 auto", touchAction: "none", cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        src={petHouseBg}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: `${panX}px`,
          height: "100%",
          width: "auto",
          maxWidth: "none",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50 pointer-events-none" style={{ zIndex: 1 }} />

      <div className="relative flex flex-col h-full" style={{ zIndex: 10, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />
        </div>
      </div>

      {showProfile && (
        <UserProfilePanel
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onUserUpdate={(u) => setCurrentUser(u)}
        />
      )}
    </div>
  );
}
