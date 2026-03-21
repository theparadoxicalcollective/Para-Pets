import { useState, useEffect, useRef } from "react";
import { onLevelUp } from "@/lib/levelUpEvents";
import { Star } from "lucide-react";
import PetAnimator from "@/components/PetAnimator";

const DURATION_MS = 2800;

interface LevelUpEvent {
  id: number;
  newLevel: number;
  petName?: string;
  petTemplateId?: string | null;
}

export default function GlobalLevelUpOverlay() {
  const [events, setEvents] = useState<LevelUpEvent[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    return onLevelUp(({ newLevel, petName, petTemplateId }) => {
      const id = ++counterRef.current;
      setEvents(prev => [...prev, { id, newLevel, petName, petTemplateId }]);
      setTimeout(() => {
        setEvents(prev => prev.filter(e => e.id !== id));
      }, DURATION_MS);
    });
  }, []);

  if (events.length === 0) return null;

  return (
    <>
      {events.map(evt => (
        <LevelUpBurst key={evt.id} newLevel={evt.newLevel} petName={evt.petName} petTemplateId={evt.petTemplateId} />
      ))}
    </>
  );
}

function LevelUpBurst({ newLevel, petName, petTemplateId }: { newLevel: number; petName?: string; petTemplateId?: string | null }) {
  const rings = [0, 0.12, 0.26];
  const rays = Array.from({ length: 12 }, (_, i) => i);
  const stars = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const d = 70 + Math.random() * 60;
    return { a, d };
  });

  return (
    <div
      className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center z-[999]"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <style>{`
        @keyframes glvlFadeOut {
          0%   { opacity: 1; }
          65%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes glvlRing {
          0%   { transform: scale(0.3); opacity: 0.9; }
          100% { transform: scale(8);   opacity: 0; }
        }
        @keyframes glvlRay {
          0%   { opacity: 0.8; transform: scaleY(0.3) rotate(var(--gr)); }
          60%  { opacity: 0.5; }
          100% { opacity: 0;   transform: scaleY(1.4) rotate(var(--gr)); }
        }
        @keyframes glvlStar {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.2); }
          35%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%,-50%) translate(var(--sx),var(--sy)) scale(0.1); }
        }
        @keyframes glvlPop {
          0%   { transform: scale(0.4); opacity: 0; }
          55%  { transform: scale(1.08); }
          70%  { transform: scale(0.96); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glvlGlow {
          0%,100% { filter: brightness(1) drop-shadow(0 0 24px rgba(240,192,64,0.8)); }
          50%     { filter: brightness(1.3) drop-shadow(0 0 48px rgba(240,192,64,1)); }
        }
        @keyframes glvlBg {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          70%  { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes glvlPetPop {
          0%   { transform: scale(0.6) translateY(24px); opacity: 0; }
          50%  { transform: scale(1.04) translateY(-6px); opacity: 1; }
          70%  { transform: scale(0.98) translateY(2px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Background colour wash */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, rgba(240,192,64,0.22) 0%, rgba(0,0,0,0.55) 100%)",
          animation: `glvlBg ${DURATION_MS}ms ease-out forwards`,
        }}
      />

      {/* Expanding rings */}
      {rings.map((delay, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: 80, height: 80,
          border: `3px solid rgba(240,192,${64},${0.9 - i * 0.2})`,
          animation: `glvlRing 1.4s ${delay}s ease-out forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Rays */}
      {rays.map((_, i) => (
        <div key={i} className="absolute" style={{
          width: 2, height: 260,
          background: "linear-gradient(to bottom, transparent 0%, rgba(240,192,64,0.7) 40%, rgba(240,192,64,0.3) 70%, transparent 100%)",
          ["--gr" as any]: `${i * 30}deg`,
          transform: `rotate(${i * 30}deg)`,
          animation: `glvlRay 1.1s ${i * 0.04}s ease-out forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Stars */}
      {stars.map((s, i) => (
        <div key={i} className="absolute font-bold" style={{
          fontSize: 14 + Math.random() * 10,
          color: ["#f0c040","#fbbf24","#fde68a","#fcd34d","#fff"][i % 5],
          left: "50%", top: "50%",
          ["--sx" as any]: `${Math.cos(s.a) * s.d}px`,
          ["--sy" as any]: `${Math.sin(s.a) * s.d}px`,
          animation: `glvlStar 1.3s ${i * 0.06}s ease-out forwards`,
          opacity: 0,
          transform: "translate(-50%,-50%)",
          filter: "drop-shadow(0 0 6px rgba(240,192,64,0.9))",
        }}>★</div>
      ))}

      {/* Centre content */}
      <div
        className="relative flex flex-col items-center gap-2 z-10 w-full"
        style={{ animation: `glvlFadeOut ${DURATION_MS}ms ease-out forwards` }}
      >
        {/* Pet (large) or fallback star icon */}
        <div style={{ animation: "glvlPetPop 0.7s ease-out both", display: "flex", justifyContent: "center" }}>
          {petTemplateId ? (
            <PetAnimator
              petTemplateId={petTemplateId}
              mode="idle"
              view="front"
              size={1000}
              className="w-full"
              style={{ aspectRatio: "1/1", pointerEvents: "none", animation: "glvlGlow 0.8s 0.3s ease-in-out infinite" }}
            />
          ) : (
            <div className="flex items-center justify-center">
              <Star
                style={{
                  width: 96, height: 96,
                  color: "#f0c040", fill: "#f0c040",
                  animation: "glvlGlow 0.8s 0.3s ease-in-out infinite",
                  filter: "drop-shadow(0 0 24px rgba(240,192,64,0.9))",
                }}
              />
            </div>
          )}
        </div>

        <div
          className="font-fantasy text-5xl font-bold tracking-wider"
          style={{
            color: "#f0c040",
            textShadow: "0 0 32px rgba(240,192,64,1), 0 0 64px rgba(240,192,64,0.5)",
            animation: "glvlPop 0.6s 0.1s ease-out both",
          }}
        >
          LEVEL UP!
        </div>
        <div
          className="font-fantasy text-2xl font-bold tracking-widest"
          style={{
            color: "#fff",
            textShadow: "0 0 16px rgba(240,192,64,0.8)",
            animation: "glvlPop 0.6s 0.2s ease-out both",
          }}
        >
          Lv. {newLevel}
        </div>
        {petName && (
          <div
            className="font-fantasy text-sm tracking-widest"
            style={{
              color: "rgba(240,192,64,0.75)",
              animation: "glvlPop 0.6s 0.3s ease-out both",
            }}
          >
            {petName}
          </div>
        )}
      </div>
    </div>
  );
}
