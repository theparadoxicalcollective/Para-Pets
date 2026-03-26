import { useState } from "react";
import { useLocation } from "wouter";
import mainNavIcon from "@assets/generated_images/icon_main_nav.png";
import homeIcon from "@assets/icon_home_new.png";
import petHouseIcon from "@assets/icon_pet_house.png";
import marketIcon from "@assets/icon_market.png";
import fishbowlIcon from "@assets/icon_fishbowl.png";
import globeIcon from "@assets/icon_globe_world.png";
import bagIcon from "@assets/icon_bag.png";
import mapIcon from "@assets/icon_map_new.png";
import questIcon from "@assets/icon_quest_v5.png";
import pvpIcon from "@assets/icon_pvp_new.png";
import petsIcon from "@assets/icon_pets.png";
import badgesIcon from "@assets/icon_badges_new.png";
import PetInventory from "@/components/PetInventory";
import PetWorldPage from "@/pages/PetWorldPage";
import { AquariumPage } from "@/pages/PetHousePage";

interface NavUser {
  id: string;
  username: string;
  email?: string;
  coins: number;
  profileImage: string | null;
  isAdmin: boolean;
  activePetId: string | null;
}

interface FloatingNavProps {
  user: NavUser;
  onUserUpdate?: (u: any) => void;
}

// ── Left arc: Map, Quest, PvP, Pet Inventory, Badges ─────────────────────────
const LEFT_ITEMS = [
  { id: "map",       label: "Map",       icon: mapIcon    },
  { id: "quest",     label: "Quest",     icon: questIcon  },
  { id: "pvp",       label: "PvP",       icon: pvpIcon    },
  { id: "inventory", label: "Pets",      icon: petsIcon   },
  { id: "badges",    label: "Badges",    icon: badgesIcon },
];

// ── Right column: Home, Pet House, Market, Aquarium, Keeper's Central, Pet Bag
const RIGHT_ITEMS = [
  { id: "home",     label: "Home",    icon: homeIcon     },
  { id: "pethouse", label: "House",   icon: petHouseIcon },
  { id: "market",   label: "Market",  icon: marketIcon   },
  { id: "aquarium", label: "Aquarium",icon: fishbowlIcon },
  { id: "keepers",  label: "Central", icon: globeIcon    },
  { id: "bag",      label: "Bag",     icon: bagIcon      },
];

const ICON_SIZE = 44;
const SPACING   = 56; // center-to-center

export default function FloatingNav({ user, onUserUpdate }: FloatingNavProps) {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen]           = useState(false);
  const [showQuest, setShowQuest]     = useState(false);
  const [showPvpNote, setShowPvpNote] = useState(false);
  const [showInv, setShowInv]         = useState<"pets" | "bag" | null>(null);
  const [showAquarium, setShowAquarium]   = useState(false);
  const [showKeepers, setShowKeepers]     = useState(false);

  const close = () => setIsOpen(false);

  const handleLeft = (id: string) => {
    close();
    if (id === "map")       { navigate("/map"); return; }
    if (id === "quest")     { setShowQuest(true); return; }
    if (id === "pvp")       { user.isAdmin ? navigate("/pvp") : setShowPvpNote(true); return; }
    if (id === "inventory") { setShowInv("pets"); return; }
    if (id === "badges")    { navigate("/badges"); return; }
  };

  const handleRight = (id: string) => {
    close();
    if (id === "home")     { navigate("/"); return; }
    if (id === "pethouse") { navigate("/pet-house"); return; }
    if (id === "market")   { navigate("/market"); return; }
    if (id === "aquarium") { setShowAquarium(true); return; }
    if (id === "keepers")  { setShowKeepers(true); return; }
    if (id === "bag")      { setShowInv("bag"); return; }
  };

  return (
    <>
      {/* ── Backdrop (closes nav) ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[90]"
          onClick={close}
        />
      )}

      {/* ── Nav container ────────────────────────────────────────────────── */}
      <div
        className="absolute z-[95]"
        style={{ bottom: 20, right: 16, width: ICON_SIZE, height: ICON_SIZE }}
      >
        {/* LEFT items – fan out to the left */}
        {LEFT_ITEMS.map((item, i) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            isOpen={isOpen}
            delay={i * 45}
            translateX={-(SPACING * (i + 1))}
            translateY={0}
            labelDir="up"
            onClick={() => handleLeft(item.id)}
          />
        ))}

        {/* RIGHT items – fan up on the right side */}
        {RIGHT_ITEMS.map((item, i) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            isOpen={isOpen}
            delay={i * 45}
            translateX={0}
            translateY={-(SPACING * (i + 1))}
            labelDir="left"
            onClick={() => handleRight(item.id)}
          />
        ))}

        {/* ── Main circular button ─────────────────────────────────────── */}
        <button
          data-testid="button-floating-nav"
          onClick={() => setIsOpen(v => !v)}
          className="absolute inset-0 rounded-full transition-transform duration-200 active:scale-90 flex items-center justify-center"
          style={{
            background: "radial-gradient(circle at 38% 35%, rgba(80,180,100,0.25) 0%, rgba(20,40,20,0.85) 70%)",
            border: "2px solid rgba(212,160,23,0.7)",
            boxShadow: isOpen
              ? "0 0 0 4px rgba(212,160,23,0.2), 0 0 20px rgba(212,160,23,0.4), 0 4px 16px rgba(0,0,0,0.7)"
              : "0 0 0 2px rgba(212,160,23,0.15), 0 0 14px rgba(212,160,23,0.25), 0 4px 16px rgba(0,0,0,0.7)",
            cursor: "pointer",
          }}
        >
          <img
            src={mainNavIcon}
            alt="Navigation"
            style={{
              width: ICON_SIZE - 6,
              height: ICON_SIZE - 6,
              objectFit: "contain",
              transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform 0.3s ease",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
            }}
          />
        </button>
      </div>

      {/* ── Quest scroll overlay ─────────────────────────────────────────── */}
      {showQuest && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowQuest(false)}
          />
          <div className="relative w-[85%] max-w-[340px] scroll-unroll">
            <button
              onClick={() => setShowQuest(false)}
              className="absolute -top-2 -right-2 z-30 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: 14, fontWeight: "bold", boxShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
            >
              ×
            </button>
            <div style={{ filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.7))" }}>
              <svg className="w-full" viewBox="0 0 340 40" preserveAspectRatio="none" style={{ display: "block", marginBottom: -1 }}>
                <defs>
                  <linearGradient id="fnScrollRod" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b6e4e" /><stop offset="30%" stopColor="#6b4e2e" /><stop offset="70%" stopColor="#5c3a1e" /><stop offset="100%" stopColor="#3a2010" />
                  </linearGradient>
                  <radialGradient id="fnKnob" cx="50%" cy="40%" r="50%">
                    <stop offset="0%" stopColor="#f0c040" /><stop offset="60%" stopColor="#c4a030" /><stop offset="100%" stopColor="#8b6e2e" />
                  </radialGradient>
                </defs>
                <rect x="18" y="10" width="304" height="22" rx="11" fill="url(#fnScrollRod)" />
                <circle cx="26" cy="21" r="13" fill="url(#fnKnob)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="314" cy="21" r="13" fill="url(#fnKnob)" stroke="#5c3a1e" strokeWidth="1.5" />
                <rect x="28" y="28" width="284" height="12" fill="#f2e8d0" />
              </svg>
              <div style={{ background: "linear-gradient(180deg, #f2e8d0 0%, #e8d8b8 40%, #f0e4c8 100%)", borderLeft: "2px solid rgba(139,110,78,0.2)", borderRight: "2px solid rgba(139,110,78,0.2)", marginLeft: 16, marginRight: 16, paddingBottom: 0 }}>
                <div style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(139,110,78,0.04) 18px, rgba(139,110,78,0.04) 19px)" }} className="absolute inset-0 pointer-events-none" />
                <div className="px-6 py-5">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(139,110,78,0.3))" }} />
                    <h3 className="font-fantasy text-[#5c3a1e] text-sm tracking-[0.25em] font-bold">QUESTS</h3>
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(139,110,78,0.3), transparent)" }} />
                  </div>
                  <div className="rounded-md p-3 flex items-center gap-3 mb-3" style={{ background: "rgba(92,58,30,0.05)", border: "1px dashed rgba(139,110,78,0.2)" }}>
                    <p className="font-fantasy text-[#a08060] text-[10px] tracking-wider leading-relaxed">No active quests. Explore the realm to discover adventures...</p>
                  </div>
                  <div className="rounded-md p-3 flex items-center gap-3" style={{ background: "rgba(92,58,30,0.05)", border: "1px dashed rgba(139,110,78,0.2)" }}>
                    <p className="font-fantasy text-[#a08060] text-[10px] tracking-wider leading-relaxed">No rewards pending. Complete quests to earn coins and items!</p>
                  </div>
                </div>
              </div>
              <svg className="w-full" viewBox="0 0 340 40" preserveAspectRatio="none" style={{ display: "block", marginTop: -1 }}>
                <rect x="28" y="0" width="284" height="12" fill="#e5d5b0" />
                <rect x="18" y="8" width="304" height="22" rx="11" fill="url(#fnScrollRod)" />
                <circle cx="26" cy="19" r="13" fill="url(#fnKnob)" stroke="#5c3a1e" strokeWidth="1.5" />
                <circle cx="314" cy="19" r="13" fill="url(#fnKnob)" stroke="#5c3a1e" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── PvP notice overlay ───────────────────────────────────────────── */}
      {showPvpNote && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPvpNote(false)} />
          <div className="relative w-[80%] max-w-xs rounded-lg p-5 animate-slide-up" style={{ background: "linear-gradient(135deg, rgba(20,10,3,0.98) 0%, rgba(45,25,8,0.98) 100%)", border: "1px solid rgba(212,160,23,0.5)", boxShadow: "0 8px 40px rgba(0,0,0,0.8)" }}>
            <button onClick={() => setShowPvpNote(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: 14, fontWeight: "bold" }}>×</button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "radial-gradient(ellipse at center, rgba(139,0,0,0.3) 0%, rgba(60,10,10,0.5) 100%)", border: "2px solid rgba(200,50,50,0.3)" }}>
                <img src={pvpIcon} alt="PvP" className="w-9 h-9 object-contain" />
              </div>
              <h3 className="font-fantasy text-[#f0c040] text-base tracking-widest font-semibold mb-2" style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}>BATTLE ARENA</h3>
              <p className="font-fantasy text-[#c8b896] text-sm tracking-wider leading-relaxed mb-2">The arena is being forged...</p>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider leading-relaxed mb-4">PvP battles are coming soon! Train your pets and prepare for glorious combat.</p>
              <div className="w-full h-px mb-3" style={{ background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), transparent)" }} />
              <p className="font-fantasy text-[#6a5840] text-[10px] tracking-widest">STAY TUNED FOR UPDATES</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Pet Inventory / Bag modal ────────────────────────────────────── */}
      {showInv && (
        <PetInventory
          user={user}
          onClose={() => setShowInv(null)}
          onUserUpdate={(u) => { onUserUpdate?.(u); }}
          defaultTab={showInv}
        />
      )}

      {/* ── Aquarium overlay ─────────────────────────────────────────────── */}
      {showAquarium && (
        <div className="absolute inset-0 z-[200]">
          <AquariumPage onClose={() => setShowAquarium(false)} userId={user.id} />
        </div>
      )}

      {/* ── Keeper's Central overlay ─────────────────────────────────────── */}
      {showKeepers && (
        <div className="absolute inset-0 z-[200]">
          <PetWorldPage user={user} onClose={() => setShowKeepers(false)} />
        </div>
      )}
    </>
  );
}

// ── Individual nav icon button ────────────────────────────────────────────────
function NavButton({
  icon, label, isOpen, delay, translateX, translateY, labelDir, onClick,
}: {
  icon: string;
  label: string;
  isOpen: boolean;
  delay: number;
  translateX: number;
  translateY: number;
  labelDir: "up" | "left";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center justify-center rounded-full active:scale-90"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        bottom: 0,
        right: 0,
        background: "radial-gradient(circle at 38% 35%, rgba(60,130,80,0.3) 0%, rgba(12,22,12,0.92) 75%)",
        border: "1.5px solid rgba(212,160,23,0.55)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.7), 0 0 10px rgba(212,160,23,0.15)",
        cursor: "pointer",
        transform: isOpen ? `translate(${translateX}px, ${translateY}px) scale(1)` : "translate(0,0) scale(0.5)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: `transform 0.28s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity 0.22s ease ${delay}ms`,
        zIndex: 96,
      }}
    >
      <img src={icon} alt={label} style={{ width: ICON_SIZE - 10, height: ICON_SIZE - 10, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))" }} />

      {/* Label tooltip */}
      {isOpen && (
        <span
          className="absolute font-fantasy pointer-events-none whitespace-nowrap"
          style={{
            fontSize: 8,
            color: "#f0c040",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            letterSpacing: "0.1em",
            ...(labelDir === "up"
              ? { bottom: "calc(100% + 3px)", left: "50%", transform: "translateX(-50%)" }
              : { right: "calc(100% + 4px)", top: "50%", transform: "translateY(-50%)" }),
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
