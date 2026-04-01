import { useState } from "react";
import { getNextZ } from "@/lib/layerManager";
import { useLocation } from "wouter";
import mainNavIcon from "@assets/generated_images/icon_main_nav.png";
import petHouseIcon from "@assets/generated_images/nav_icon_home.png";
import activePetIcon from "@assets/generated_images/nav_icon_active_pet_new.png";
import petsIcon from "@assets/generated_images/nav_icon_pets.png";
import marketIcon from "@assets/generated_images/nav_icon_market.png";
import fishbowlIcon from "@assets/icon_fishbowl.png";
import globeIcon from "@assets/icon_globe_world.png";
import bagIcon from "@assets/icon_bag.png";
import mapIcon from "@assets/generated_images/nav_icon_map_new.png";
import questIcon from "@assets/generated_images/nav_icon_map.png";
import questScrollBg from "@assets/IMG_6427_1774545779530.png";
import pvpIcon from "@assets/generated_images/nav_icon_pvp.png";
import badgesIcon from "@assets/generated_images/nav_icon_badges.png";
import PetInventory from "@/components/PetInventory";
import PetWorldPage from "@/pages/PetWorldPage";
import { AquariumPage } from "@/pages/AquariumPage";

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

// ── Left arc: Badges, Quest, PvP, Pet Inventory, Map ─────────────────────────
const LEFT_ITEMS = [
  { id: "badges",    label: "Badges",    icon: badgesIcon },
  { id: "quest",     label: "Quest",     icon: questIcon  },
  { id: "pvp",       label: "PvP",       icon: pvpIcon    },
  { id: "inventory", label: "Pets",      icon: petsIcon   },
  { id: "map",       label: "Map",       icon: mapIcon,    fill: true },
];

// ── Right column: Home, Pet House, Market, Aquarium, Keeper's Central, Pet Bag
const RIGHT_ITEMS = [
  { id: "bag",      label: "Bag",     icon: bagIcon      },
  { id: "pethouse", label: "House",   icon: petHouseIcon },
  { id: "market",   label: "Market",  icon: marketIcon   },
  { id: "aquarium", label: "Aquarium",icon: fishbowlIcon },
  { id: "keepers",  label: "Central", icon: globeIcon    },
  { id: "home",     label: "Main",    icon: activePetIcon },
];

const ICON_SIZE   = 44;
const BUTTON_SIZE = 58; // main button — larger for easier tap target
const SPACING     = 60; // center-to-center spacing for icon fan

export default function FloatingNav({ user, onUserUpdate }: FloatingNavProps) {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen]           = useState(false);
  const [showQuest, setShowQuest]     = useState(false);
  const [showPvpNote, setShowPvpNote] = useState(false);
  const [showInv, setShowInv]         = useState<"pets" | "bag" | null>(null);
  const [showAquarium, setShowAquarium]   = useState(false);
  const [showKeepers, setShowKeepers]     = useState(false);
  const [panelZ, setPanelZ]           = useState(300);

  const openPanel = (fn: () => void) => { closeAll(); setPanelZ(getNextZ()); fn(); };

  const closeAll = () => {
    setIsOpen(false);
    setShowQuest(false);
    setShowPvpNote(false);
    setShowInv(null);
    setShowAquarium(false);
    setShowKeepers(false);
  };

  const handleLeft = (id: string) => {
    closeAll();
    if (id === "map")       { navigate("/map"); return; }
    if (id === "quest")     { openPanel(() => setShowQuest(true)); return; }
    if (id === "pvp")       { user.isAdmin ? navigate("/pvp") : openPanel(() => setShowPvpNote(true)); return; }
    if (id === "inventory") { openPanel(() => setShowInv("pets")); return; }
    if (id === "badges")    { navigate("/badges"); return; }
  };

  const handleRight = (id: string) => {
    closeAll();
    if (id === "home")     { navigate("/"); return; }
    if (id === "pethouse") { navigate("/pet-house"); return; }
    if (id === "market")   { navigate("/market"); return; }
    if (id === "aquarium") { openPanel(() => setShowAquarium(true)); return; }
    if (id === "keepers")  { openPanel(() => setShowKeepers(true)); return; }
    if (id === "bag")      { openPanel(() => setShowInv("bag")); return; }
  };

  return (
    <>
      {/* ── Backdrop (closes nav) ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[90]"
          onClick={closeAll}
        />
      )}

      {/* ── Nav container ────────────────────────────────────────────────── */}
      <div
        className="absolute z-[95]"
        style={{ bottom: 16, right: 12, width: BUTTON_SIZE, height: BUTTON_SIZE }}
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
            fillIcon={!!(item as any).fill}
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
            zIndex: 99,
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
              width: BUTTON_SIZE - 14,
              height: BUTTON_SIZE - 14,
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
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: panelZ }}>
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowQuest(false)}
          />
          <div className="relative w-[78%] max-w-[300px] scroll-unroll" style={{ filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.8))" }}>
            {/* Close button */}
            <button
              onClick={() => setShowQuest(false)}
              className="absolute top-[13%] right-[4%] z-30 w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #3a2010 100%)", border: "2px solid rgba(212,160,23,0.6)", color: "#f0c040", cursor: "pointer", fontSize: 14, fontWeight: "bold", boxShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
            >
              ×
            </button>
            {/* Scroll image */}
            <img src={questScrollBg} alt="Quest scroll" className="w-full h-auto block select-none" draggable={false} />
            {/* Content layered on top of parchment area */}
            <div className="absolute inset-0 flex flex-col" style={{ paddingTop: "20%", paddingBottom: "20%", paddingLeft: "13%", paddingRight: "13%" }}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(139,90,40,0.4))" }} />
                <h3 className="font-fantasy text-[#4a2a0e] text-xs tracking-[0.3em] font-bold">QUESTS</h3>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(139,90,40,0.4), transparent)" }} />
              </div>
              <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: "none" }}>
                <div className="rounded p-2.5" style={{ background: "rgba(92,58,30,0.07)", border: "1px dashed rgba(139,90,40,0.25)" }}>
                  <p className="font-fantasy text-[#6b3e1a] text-[10px] tracking-wider leading-relaxed">No active quests. Explore the realm to discover adventures...</p>
                </div>
                <div className="rounded p-2.5" style={{ background: "rgba(92,58,30,0.07)", border: "1px dashed rgba(139,90,40,0.25)" }}>
                  <p className="font-fantasy text-[#6b3e1a] text-[10px] tracking-wider leading-relaxed">No rewards pending. Complete quests to earn coins and items!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PvP notice overlay ───────────────────────────────────────────── */}
      {showPvpNote && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: panelZ }}>
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
        <div className="absolute inset-0" style={{ zIndex: panelZ }}>
          <AquariumPage onClose={() => setShowAquarium(false)} userId={user.id} />
        </div>
      )}

      {/* ── Keeper's Central overlay ─────────────────────────────────────── */}
      {showKeepers && (
        <div className="absolute inset-0" style={{ zIndex: panelZ }}>
          <PetWorldPage user={user} onClose={() => setShowKeepers(false)} />
        </div>
      )}
    </>
  );
}

// ── Individual nav icon button ────────────────────────────────────────────────
function NavButton({
  icon, label, isOpen, delay, translateX, translateY, labelDir, fillIcon = false, onClick,
}: {
  icon: string;
  label: string;
  isOpen: boolean;
  delay: number;
  translateX: number;
  translateY: number;
  labelDir: "up" | "left";
  fillIcon?: boolean;
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
        overflow: fillIcon ? "hidden" : "visible",
        transform: isOpen ? `translate(${translateX}px, ${translateY}px) scale(1)` : "translate(0,0) scale(0.5)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: `transform 0.28s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity 0.22s ease ${delay}ms`,
        zIndex: 96,
      }}
    >
      <img
        src={icon}
        alt={label}
        style={{
          width: fillIcon ? ICON_SIZE : ICON_SIZE - 10,
          height: fillIcon ? ICON_SIZE : ICON_SIZE - 10,
          objectFit: fillIcon ? "cover" : "contain",
          borderRadius: fillIcon ? 0 : "50%",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
        }}
      />

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
