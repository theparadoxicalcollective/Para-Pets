import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import worldFrostpeak from "@assets/world_frostpeak_v2.png";
import worldSkyRealm from "@assets/world_sky_realm_v3.png";
import worldVolcanic from "@assets/world_volcanic_v3.png";
import worldLostIsland from "@assets/world_lost_island.png";
import worldDesert from "@assets/world_desert_v3.png";
import worldEnchantedGrove from "@assets/world_enchanted_grove_v2.png";
import worldHauntedWoods from "@assets/world_haunted_woods_v3.png";
import worldSwamp from "@assets/world_swamp_v3.png";
import TopBar from "@/components/TopBar";
import UserProfilePanel from "@/components/UserProfilePanel";
import { Plus, X, Trash2, Pencil, ImageIcon } from "lucide-react";
import { readFileAsDataUrl } from "@/lib/utils";

interface MapPageProps {
  user: {
    id: string;
    username: string;
    email: string;
    profileImage: string | null;
    coins: number;
    isAdmin: boolean;
    isModerator: boolean;
    activePetId: string | null;
    lastUsernameChange: string | null;
    lastProfilePicChange: string | null;
  };
}

interface WorldData {
  id: string;
  name: string;
  iconUrl: string | null;
  bgUrl: string | null;
  posX: number;
  posY: number;
  iconSize: number;
  glowColor: string;
  isDefault: boolean;
}

const DEFAULT_ICONS: Record<string, string> = {
  snowy_mountain: worldFrostpeak,
  sky_realm: worldSkyRealm,
  island: worldLostIsland,
  volcanic: worldVolcanic,
  enchanted_grove: worldEnchantedGrove,
  desert: worldDesert,
  swamp: worldSwamp,
  haunted_woods: worldHauntedWoods,
};

export default function MapPage({ user }: MapPageProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [showAddWorld, setShowAddWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldGlow, setNewWorldGlow] = useState("#ffd700");
  const [newWorldIcon, setNewWorldIcon] = useState<string | null>(null);
  const [newWorldBg, setNewWorldBg] = useState<string | null>(null);

  const [editingWorld, setEditingWorld] = useState<WorldData | null>(null);
  const [editName, setEditName] = useState("");
  const [editGlow, setEditGlow] = useState("#ffd700");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editBg, setEditBg] = useState<string | null>(null);

  const [showMapBgEdit, setShowMapBgEdit] = useState(false);
  const [mapBgPreview, setMapBgPreview] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ worldId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const { data: worldsList = [], isLoading } = useQuery<WorldData[]>({
    queryKey: ["/api/worlds"],
    refetchOnMount: true,
    staleTime: 0,
  });

  const { data: mapBgData } = useQuery<{ bgUrl: string | null }>({
    queryKey: ["/api/settings/map-background"],
  });

  const mapBgMutation = useMutation({
    mutationFn: async (imageData: string | null) => {
      const res = await apiRequest("PATCH", "/api/admin/settings/map-background", { imageData });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/map-background"] });
      setShowMapBgEdit(false);
      setMapBgPreview(null);
      toast({ title: "Updated", description: "Map background updated" });
    },
    onError: (err: any) => {
      let msg = "Failed to update background";
      try { const p = JSON.parse(err.message.split(": ").slice(1).join(": ")); msg = p.message || msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const positionMutation = useMutation({
    mutationFn: async ({ worldId, posX, posY }: { worldId: string; posX: number; posY: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/worlds/${worldId}/position`, { posX, posY });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  const createWorldMutation = useMutation({
    mutationFn: async (data: { name: string; iconData: string | null; bgData: string | null; glowColor: string }) => {
      const res = await apiRequest("POST", "/api/admin/worlds", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
      setShowAddWorld(false);
      setNewWorldName("");
      setNewWorldGlow("#ffd700");
      setNewWorldIcon(null);
      setNewWorldBg(null);
      toast({ title: "World Created", description: "New world added to the map" });
    },
    onError: (err: any) => {
      let msg = "Failed to create world";
      try { const p = JSON.parse(err.message.split(": ").slice(1).join(": ")); msg = p.message || msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const deleteWorldMutation = useMutation({
    mutationFn: async (worldId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/worlds/${worldId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
      toast({ title: "Deleted", description: "World removed from map" });
    },
    onError: (err: any) => {
      let msg = "Failed to delete world";
      try { const p = JSON.parse(err.message.split(": ").slice(1).join(": ")); msg = p.message || msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const editWorldMutation = useMutation({
    mutationFn: async (data: { worldId: string; name: string; glowColor: string; iconData: string | null; bgData: string | null }) => {
      const res = await apiRequest("PATCH", `/api/admin/worlds/${data.worldId}`, {
        name: data.name,
        glowColor: data.glowColor,
        iconData: data.iconData,
        bgData: data.bgData,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
      setEditingWorld(null);
      toast({ title: "Updated", description: "World updated successfully" });
    },
    onError: (err: any) => {
      let msg = "Failed to update world";
      try { const p = JSON.parse(err.message.split(": ").slice(1).join(": ")); msg = p.message || msg; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const openEditModal = (w: WorldData) => {
    setEditingWorld(w);
    setEditName(w.name);
    setEditGlow(w.glowColor);
    setEditIcon(null);
    setEditBg(null);
  };

  const getWorldIcon = (w: WorldData) => {
    if (w.iconUrl) return w.iconUrl;
    return DEFAULT_ICONS[w.id] || null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, w: WorldData) => {
    if (!currentUser.isAdmin) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    dragRef.current = {
      worldId: w.id,
      startX: e.clientX,
      startY: e.clientY,
      origPosX: w.posX,
      origPosY: w.posY,
    };
  }, [currentUser.isAdmin]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) didDrag.current = true;
    if (!didDrag.current) return;
    e.preventDefault();
    const pxPerPercX = rect.width / 100;
    const pxPerPercY = rect.height / 100;
    const newX = Math.max(0, Math.min(85, dragRef.current.origPosX + dx / pxPerPercX));
    const newY = Math.max(0, Math.min(90, dragRef.current.origPosY + dy / pxPerPercY));
    setDragPos({ id: dragRef.current.worldId, x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    dragRef.current = null;
    if (didDrag.current && dragPos) {
      positionMutation.mutate({ worldId: d.worldId, posX: Math.round(dragPos.x), posY: Math.round(dragPos.y) });
    }
    setDragPos(null);
  }, [dragPos, positionMutation]);

  const [navigatingWorldId, setNavigatingWorldId] = useState<string | null>(null);

  const isWorldLocked = (w: WorldData) => !currentUser.isAdmin && !currentUser.isModerator && w.id !== "swamp";

  const handleWorldClick = useCallback((w: WorldData) => {
    if (didDrag.current) return;
    if (navigatingWorldId) return;
    if (isWorldLocked(w)) return;
    setSelectedWorldId(w.id);
    setNavigatingWorldId(w.id);
    setTimeout(() => {
      navigate(`/world/${w.id}`);
    }, 800);
  }, [navigate, navigatingWorldId, currentUser.isAdmin]);

  return (
    <div
      className="relative w-full h-screen-frame overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(180deg, #080812 0%, #0a0d1a 15%, #0d1020 35%, #0a0e1c 55%, #0d1020 75%, #080812 100%)",
      }}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 15%, rgba(80,120,200,0.1) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 20% 45%, rgba(120,60,200,0.07) 0%, transparent 40%), " +
            "radial-gradient(ellipse at 80% 35%, rgba(160,80,240,0.06) 0%, transparent 40%), " +
            "radial-gradient(ellipse at 50% 75%, rgba(60,100,200,0.08) 0%, transparent 45%), " +
            "radial-gradient(ellipse at 30% 90%, rgba(100,60,220,0.05) 0%, transparent 35%), " +
            "radial-gradient(ellipse at 70% 60%, rgba(180,100,255,0.05) 0%, transparent 35%)",
        }}
      />

      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 15% 20%, rgba(200,220,255,0.8), transparent),
            radial-gradient(1px 1px at 45% 12%, rgba(200,255,220,0.6), transparent),
            radial-gradient(1px 1px at 72% 28%, rgba(220,200,255,0.7), transparent),
            radial-gradient(1px 1px at 88% 42%, rgba(200,230,255,0.5), transparent),
            radial-gradient(1px 1px at 25% 55%, rgba(180,255,220,0.6), transparent),
            radial-gradient(1px 1px at 60% 48%, rgba(200,200,255,0.5), transparent),
            radial-gradient(1px 1px at 35% 72%, rgba(200,240,255,0.7), transparent),
            radial-gradient(1px 1px at 82% 65%, rgba(180,220,255,0.6), transparent),
            radial-gradient(1px 1px at 50% 85%, rgba(200,255,240,0.5), transparent),
            radial-gradient(1px 1px at 10% 78%, rgba(220,220,255,0.4), transparent),
            radial-gradient(1.5px 1.5px at 55% 30%, rgba(200,240,255,0.9), transparent),
            radial-gradient(1.5px 1.5px at 30% 42%, rgba(180,255,200,0.7), transparent)
          `,
        }}
      />

      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[5%] left-[15%] w-40 h-24 rounded-[50%]" style={{ background: "rgba(60,80,180,0.06)", filter: "blur(40px)" }} />
        <div className="absolute top-[30%] right-[8%] w-48 h-20 rounded-[50%]" style={{ background: "rgba(140,60,220,0.05)", filter: "blur(45px)" }} />
        <div className="absolute top-[55%] left-[10%] w-36 h-28 rounded-[50%]" style={{ background: "rgba(80,60,200,0.06)", filter: "blur(40px)" }} />
        <div className="absolute top-[75%] right-[20%] w-44 h-18 rounded-[50%]" style={{ background: "rgba(100,80,240,0.04)", filter: "blur(50px)" }} />
      </div>

      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          boxShadow: "inset 0 0 100px rgba(0,10,30,0.6), inset 0 0 250px rgba(0,5,15,0.3)",
        }}
      />

      {mapBgData?.bgUrl && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            backgroundImage: `url(${mapBgData.bgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.35,
          }}
        />
      )}

      <style>{`
        @keyframes floatWorld {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .world-node { transition: filter 0.2s ease; touch-action: none; }
        .world-node:active { filter: brightness(1.1); }
        .map-scroll::-webkit-scrollbar { width: 4px; }
        .map-scroll::-webkit-scrollbar-track { background: transparent; }
        .map-scroll::-webkit-scrollbar-thumb { background: rgba(240,192,64,0.3); border-radius: 4px; }
        .map-scroll::-webkit-scrollbar-thumb:hover { background: rgba(240,192,64,0.6); }
      `}</style>

      <div
        className="relative z-10 flex flex-col h-full"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <TopBar user={currentUser} onProfileClick={() => setShowProfile(true)} onUserUpdate={(u) => setCurrentUser(u)} />

        <div className="flex-1 relative overflow-y-auto overflow-x-hidden map-scroll">
          <div className="flex flex-col items-center pt-2 pb-1 relative z-10" data-testid="text-map-title">
            <div className="flex items-center gap-2 mb-0.5">
              <div style={{ width: "32px", height: "1px", background: "linear-gradient(to right, transparent, rgba(240,192,64,0.6))" }} />
              <span className="font-fantasy text-[9px] tracking-[0.5em] uppercase" style={{ color: "rgba(220,170,50,0.65)", letterSpacing: "0.55em" }}>The World of</span>
              <div style={{ width: "32px", height: "1px", background: "linear-gradient(to left, transparent, rgba(240,192,64,0.6))" }} />
            </div>
            <h2
              className="font-fantasy text-center font-bold uppercase"
              style={{
                fontSize: "clamp(26px, 7.5vw, 42px)",
                letterSpacing: "0.25em",
                lineHeight: 1,
                color: "#fff6c8",
                textShadow:
                  "0 0 8px rgba(255,220,80,0.95), 0 0 20px rgba(240,192,64,0.8), 0 0 45px rgba(240,160,40,0.55), 0 0 90px rgba(220,140,20,0.3), 0 3px 6px rgba(0,0,0,1)",
              }}
            >
              Veridia
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div style={{ width: "50px", height: "1px", background: "linear-gradient(to right, transparent, rgba(240,192,64,0.45))" }} />
              <span style={{ color: "rgba(240,192,64,0.4)", fontSize: "8px" }}>✦</span>
              <div style={{ width: "50px", height: "1px", background: "linear-gradient(to left, transparent, rgba(240,192,64,0.45))" }} />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="font-fantasy text-[#8090b0] text-sm animate-pulse">Loading map...</p>
            </div>
          ) : (
            <div
              ref={mapRef}
              className="relative w-full"
              style={{ paddingBottom: "115%" }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="absolute inset-0">

                {worldsList.map((w, i) => {
                  const icon = getWorldIcon(w);
                  const pos = dragPos?.id === w.id ? { x: dragPos.x, y: dragPos.y } : { x: w.posX, y: w.posY };
                  const isDragging = dragRef.current?.worldId === w.id;
                  const locked = isWorldLocked(w);
                  return (
                    <div
                      key={w.id}
                      data-testid={`button-location-${w.id}`}
                      className="absolute world-node flex flex-col items-center"
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        width: "30%",
                        cursor: currentUser.isAdmin ? "grab" : locked ? "default" : "pointer",
                        zIndex: isDragging ? 50 : 10 + i,
                        animation: isDragging ? "none" : `floatWorld ${3 + (i % 3) * 0.5}s ease-in-out infinite`,
                        animationDelay: `${i * 0.4}s`,
                      }}
                      onPointerDown={(e) => handlePointerDown(e, w)}
                      onClick={() => handleWorldClick(w)}
                    >
                      <div className="relative w-full" style={{ aspectRatio: "1" }}>
                        <div
                          className="absolute inset-[-10%] rounded-full pointer-events-none"
                          style={{
                            background: `radial-gradient(circle, ${w.glowColor}30 0%, ${w.glowColor}10 50%, transparent 70%)`,
                            animation: `glowPulse ${3 + (i % 2)}s ease-in-out infinite`,
                            animationDelay: `${i * 0.3}s`,
                          }}
                        />
                        {icon ? (
                          <img
                            src={icon}
                            alt={w.name}
                            className="w-full h-full object-contain relative z-10"
                            draggable={false}
                            style={{
                              filter: locked
                                ? `grayscale(1) brightness(0.28)`
                                : `drop-shadow(0 4px 8px rgba(0,0,0,0.35)) drop-shadow(0 0 10px ${w.glowColor}25)`,
                            }}
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded-full flex items-center justify-center relative z-10"
                            style={{
                              background: locked
                                ? `linear-gradient(135deg, rgba(20,20,30,0.8), rgba(10,10,20,0.8))`
                                : `linear-gradient(135deg, ${w.glowColor}40, ${w.glowColor}20)`,
                              border: `2px solid ${locked ? "rgba(80,80,100,0.4)" : `${w.glowColor}60`}`,
                              fontSize: "28px",
                              filter: locked ? "grayscale(1) brightness(0.28)" : undefined,
                            }}
                          >
                            🌍
                          </div>
                        )}

                        {locked && (
                          <div
                            className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none gap-0.5"
                          >
                            <span style={{ fontSize: "clamp(14px, 4vw, 20px)", lineHeight: 1 }}>🔒</span>
                            <div
                              className="font-fantasy text-center leading-tight px-1.5 py-0.5"
                              style={{
                                background: "rgba(8,4,18,0.92)",
                                border: "1px solid rgba(160,130,60,0.6)",
                                borderRadius: "4px",
                                color: "#e0c060",
                                fontSize: "clamp(7px, 2vw, 10px)",
                                letterSpacing: "0.1em",
                                textShadow: "0 0 8px rgba(220,180,60,0.5)",
                                boxShadow: "0 0 12px rgba(0,0,0,0.8)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Coming Soon
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedWorldId === w.id && (
                        <div className="flex flex-col items-center gap-1 mt-0.5 relative z-10" style={{ animation: "fadeIn 0.2s ease-out" }}>
                          <span
                            className="font-fantasy text-[9px] sm:text-[10px] tracking-wider font-semibold whitespace-nowrap px-2 py-0.5 rounded-full"
                            style={{
                              color: "#e0d8c8",
                              textShadow: `0 0 6px ${w.glowColor}50, 0 1px 2px rgba(0,0,0,0.6)`,
                              background: "rgba(10,12,25,0.8)",
                              border: `1px solid ${w.glowColor}40`,
                              backdropFilter: "blur(4px)",
                            }}
                            data-testid={`text-world-name-${w.id}`}
                          >
                            {w.name}
                          </span>
                          {navigatingWorldId === w.id && (
                            <span
                              className="font-fantasy text-[8px] tracking-widest animate-pulse"
                              style={{ color: w.glowColor, textShadow: `0 0 8px ${w.glowColor}60` }}
                              data-testid={`text-loading-${w.id}`}
                            >
                              Traveling...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>



      </div>

      {showAddWorld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="overlay-add-world-backdrop" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddWorld(false)} />
          <div
            data-testid="modal-add-world"
            className="relative z-10 w-[90%] max-w-sm rounded-xl p-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(16,18,35,0.98) 0%, rgba(22,25,50,0.98) 100%)",
              border: "1px solid rgba(100,80,200,0.3)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(100,60,200,0.1)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-base tracking-widest" style={{ color: "#d0c8e0" }}>
                Add New World
              </h3>
              <button
                data-testid="button-close-add-world"
                onClick={() => setShowAddWorld(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(140,120,200,0.15)", border: "1px solid rgba(140,120,200,0.3)", cursor: "pointer", color: "#c0b8d0" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>World Name</label>
                <input
                  data-testid="input-world-name"
                  type="text"
                  value={newWorldName}
                  onChange={(e) => setNewWorldName(e.target.value)}
                  placeholder="Enter world name..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(140,120,200,0.3)",
                    color: "#d0c8e0",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>Glow Color</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="input-world-glow-color"
                    type="color"
                    value={newWorldGlow}
                    onChange={(e) => setNewWorldGlow(e.target.value)}
                    className="w-10 h-8 rounded border-0 cursor-pointer"
                  />
                  <span className="font-fantasy text-[11px]" style={{ color: "#9088b0" }}>{newWorldGlow}</span>
                </div>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>World Icon (PNG or GIF)</label>
                <input
                  data-testid="input-world-icon"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setNewWorldIcon(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: "#c0b8d0" }}
                />
                {newWorldIcon && (
                  <div className="mt-2 flex justify-center">
                    <img src={newWorldIcon} alt="Preview" className="w-20 h-20 object-contain rounded-lg" style={{ border: "1px solid rgba(140,120,200,0.3)" }} />
                  </div>
                )}
              </div>

              <button
                data-testid="button-submit-add-world"
                onClick={() => {
                  if (!newWorldName.trim()) return;
                  createWorldMutation.mutate({
                    name: newWorldName.trim(),
                    iconData: newWorldIcon,
                    bgData: newWorldBg,
                    glowColor: newWorldGlow,
                  });
                }}
                disabled={createWorldMutation.isPending || !newWorldName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: "linear-gradient(135deg, #2a1850 0%, #3a2070 100%)",
                  border: "1px solid rgba(140,100,240,0.4)",
                  color: "#e0d8f0",
                  cursor: "pointer",
                  boxShadow: "0 0 15px rgba(100,60,200,0.2)",
                }}
              >
                {createWorldMutation.isPending ? "Creating..." : "Create World"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingWorld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div data-testid="overlay-edit-world-backdrop" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingWorld(null)} />
          <div
            data-testid="modal-edit-world"
            className="relative z-10 w-[90%] max-w-sm rounded-xl p-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(16,18,35,0.98) 0%, rgba(22,25,50,0.98) 100%)",
              border: "1px solid rgba(100,80,200,0.3)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(100,60,200,0.1)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-base tracking-widest" style={{ color: "#d0c8e0" }}>
                Edit World
              </h3>
              <button
                data-testid="button-close-edit-world"
                onClick={() => setEditingWorld(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(140,120,200,0.15)", border: "1px solid rgba(140,120,200,0.3)", cursor: "pointer", color: "#c0b8d0" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>World Name</label>
                <input
                  data-testid="input-edit-world-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(140,120,200,0.3)",
                    color: "#d0c8e0",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>Glow Color</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="input-edit-world-glow"
                    type="color"
                    value={editGlow}
                    onChange={(e) => setEditGlow(e.target.value)}
                    className="w-10 h-8 rounded border-0 cursor-pointer"
                  />
                  <span className="font-fantasy text-[11px]" style={{ color: "#9088b0" }}>{editGlow}</span>
                </div>
              </div>

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>Replace Icon (PNG or GIF)</label>
                <input
                  data-testid="input-edit-world-icon"
                  type="file"
                  accept="image/png,image/gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setEditIcon(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: "#c0b8d0" }}
                />
                {editIcon && (
                  <div className="mt-2 flex justify-center">
                    <img src={editIcon} alt="Preview" className="w-20 h-20 object-contain rounded-lg" style={{ border: "1px solid rgba(140,120,200,0.3)" }} />
                  </div>
                )}
                {!editIcon && (getWorldIcon(editingWorld) || editingWorld.iconUrl) && (
                  <div className="mt-2 flex justify-center">
                    <img src={getWorldIcon(editingWorld) || editingWorld.iconUrl || ""} alt="Current" className="w-16 h-16 object-contain rounded-lg opacity-60" style={{ border: "1px solid rgba(140,120,200,0.2)" }} />
                    <span className="font-fantasy text-[9px] self-center ml-2" style={{ color: "#9088b0" }}>Current icon</span>
                  </div>
                )}
              </div>

              <button
                data-testid="button-submit-edit-world"
                onClick={() => {
                  if (!editName.trim() || !editingWorld) return;
                  editWorldMutation.mutate({
                    worldId: editingWorld.id,
                    name: editName.trim(),
                    glowColor: editGlow,
                    iconData: editIcon,
                    bgData: editBg,
                  });
                }}
                disabled={editWorldMutation.isPending || !editName.trim()}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: "linear-gradient(135deg, #2a1850 0%, #3a2070 100%)",
                  border: "1px solid rgba(140,100,240,0.4)",
                  color: "#e0d8f0",
                  cursor: "pointer",
                  boxShadow: "0 0 15px rgba(100,60,200,0.2)",
                }}
              >
                {editWorldMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMapBgEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMapBgEdit(false)} />
          <div
            data-testid="modal-edit-map-bg"
            className="relative z-10 w-[90%] max-w-sm rounded-xl p-5 max-h-[85vh] overflow-y-auto"
            style={{
              background: "linear-gradient(135deg, rgba(16,18,35,0.98) 0%, rgba(22,25,50,0.98) 100%)",
              border: "1px solid rgba(100,80,200,0.3)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(100,60,200,0.1)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-fantasy text-base tracking-widest" style={{ color: "#d0c8e0" }}>
                Map Background
              </h3>
              <button
                data-testid="button-close-map-bg"
                onClick={() => setShowMapBgEdit(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(140,120,200,0.15)", border: "1px solid rgba(140,120,200,0.3)", cursor: "pointer", color: "#c0b8d0" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {mapBgData?.bgUrl && (
                <div>
                  <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>Current Background</label>
                  <img src={mapBgData.bgUrl} alt="Current map bg" className="w-full h-28 object-cover rounded-lg" style={{ border: "1px solid rgba(140,120,200,0.3)" }} />
                </div>
              )}

              <div>
                <label className="font-fantasy text-[10px] tracking-wider block mb-1" style={{ color: "#9088b0" }}>
                  {mapBgData?.bgUrl ? "Replace Background (PNG/GIF/JPEG)" : "Upload Background (PNG/GIF/JPEG)"}
                </label>
                <input
                  data-testid="input-map-bg"
                  type="file"
                  accept="image/png,image/gif,image/jpeg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const dataUrl = await readFileAsDataUrl(file);
                      setMapBgPreview(dataUrl);
                    }
                  }}
                  className="w-full text-xs font-fantasy"
                  style={{ color: "#c0b8d0" }}
                />
                {mapBgPreview && (
                  <div className="mt-2 flex justify-center">
                    <img src={mapBgPreview} alt="Preview" className="w-full h-28 object-cover rounded-lg" style={{ border: "1px solid rgba(140,120,200,0.3)" }} />
                  </div>
                )}
              </div>

              <button
                data-testid="button-submit-map-bg"
                onClick={() => {
                  if (mapBgPreview) mapBgMutation.mutate(mapBgPreview);
                }}
                disabled={mapBgMutation.isPending || !mapBgPreview}
                className="w-full py-2.5 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-50 mt-1"
                style={{
                  background: "linear-gradient(135deg, #2a1850 0%, #3a2070 100%)",
                  border: "1px solid rgba(140,100,240,0.4)",
                  color: "#e0d8f0",
                  cursor: "pointer",
                  boxShadow: "0 0 15px rgba(100,60,200,0.2)",
                }}
              >
                {mapBgMutation.isPending ? "Uploading..." : "Save Background"}
              </button>

              {mapBgData?.bgUrl && (
                <button
                  data-testid="button-remove-map-bg"
                  onClick={() => mapBgMutation.mutate(null)}
                  disabled={mapBgMutation.isPending}
                  className="w-full py-2 rounded-md font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                  style={{
                    background: "rgba(180,50,50,0.2)",
                    border: "1px solid rgba(220,80,80,0.4)",
                    color: "#e0a0a0",
                    cursor: "pointer",
                  }}
                >
                  Remove Background
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
