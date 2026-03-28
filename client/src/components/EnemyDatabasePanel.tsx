import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";
import { Trash2, ArrowLeft, Plus, Upload, Shield, Sword, Heart } from "lucide-react";

interface Enemy {
  id: string;
  name: string;
  imageUrl: string | null;
  atk: number;
  health: number;
  isBoss: boolean;
  special1: string | null;
  special2: string | null;
  special3: string | null;
  createdAt: string;
}

interface EnemyPart {
  id: string;
  enemyId: string;
  partType: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
}

const CANVAS_SIZE = 500;

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.4)",
  border: "1px solid rgba(239,68,68,0.3)",
  color: "#fca5a5",
  outline: "none",
};

export default function EnemyDatabasePanel() {
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEnemy, setEditingEnemy] = useState<Enemy | null>(null);

  const [formName, setFormName] = useState("");
  const [formAtk, setFormAtk] = useState("10");
  const [formHealth, setFormHealth] = useState("100");
  const [formIsBoss, setFormIsBoss] = useState(false);
  const [formSpecial1, setFormSpecial1] = useState("");
  const [formSpecial2, setFormSpecial2] = useState("");
  const [formSpecial3, setFormSpecial3] = useState("");
  const [formImageData, setFormImageData] = useState<string | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [uploadPartType, setUploadPartType] = useState<string | null>(null);
  const [newPartLabel, setNewPartLabel] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ partId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allEnemies = [], isLoading } = useQuery<Enemy[]>({
    queryKey: ["/api/admin/enemies"],
  });

  const { data: enemyParts = [] } = useQuery<EnemyPart[]>({
    queryKey: ["/api/admin/enemy-parts", selectedEnemyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enemy-parts/${selectedEnemyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedEnemyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/enemies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemies"] });
      toast({ title: "Created", description: "Enemy added to database" });
      resetForm();
      setShowAddForm(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to create enemy", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/admin/enemies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemies"] });
      toast({ title: "Saved", description: "Enemy updated" });
      resetForm();
      setEditingEnemy(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update enemy", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/enemies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemies"] });
      toast({ title: "Deleted", description: "Enemy removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: { enemyId: string; partType: string; imageData: string; zIndex: number }) => {
      const res = await apiRequest("POST", `/api/admin/enemy-parts/${data.enemyId}`, {
        partType: data.partType,
        imageData: data.imageData,
        zIndex: data.zIndex,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemy-parts", selectedEnemyId] });
      setUploadPartType(null);
      setNewPartLabel("");
      toast({ title: "Added", description: "Part added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add part", variant: "destructive" }),
  });

  const updatePartMutation = useMutation({
    mutationFn: async ({ partId, ...data }: { partId: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/enemy-parts/${partId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemy-parts", selectedEnemyId] });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      await apiRequest("DELETE", `/api/admin/enemy-parts/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enemy-parts", selectedEnemyId] });
      setSelectedPartId(null);
      toast({ title: "Removed", description: "Part removed" });
    },
  });

  const handlePointerDown = useCallback((e: React.PointerEvent, part: EnemyPart) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    dragRef.current = { partId: part.id, startX: e.clientX, startY: e.clientY, origX: part.posX, origY: part.posY };
    setSelectedPartId(part.id);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / CANVAS_SIZE;
    const dx = (e.clientX - dragRef.current.startX) / scale;
    const dy = (e.clientY - dragRef.current.startY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
    setDragPos({ id: dragRef.current.partId, x: Math.round(dragRef.current.origX + dx), y: Math.round(dragRef.current.origY + dy) });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const d = dragRef.current;
    dragRef.current = null;
    if (didDrag.current && dragPos) {
      updatePartMutation.mutate({ partId: d.partId, posX: dragPos.x, posY: dragPos.y });
    }
    setDragPos(null);
  }, [dragPos, updatePartMutation]);

  const resetForm = () => {
    setFormName("");
    setFormAtk("10");
    setFormHealth("100");
    setFormIsBoss(false);
    setFormSpecial1("");
    setFormSpecial2("");
    setFormSpecial3("");
    setFormImageData(null);
    setFormImagePreview(null);
  };

  const openEditForm = (enemy: Enemy) => {
    setEditingEnemy(enemy);
    setFormName(enemy.name);
    setFormAtk(String(enemy.atk));
    setFormHealth(String(enemy.health));
    setFormIsBoss(enemy.isBoss);
    setFormSpecial1(enemy.special1 ?? "");
    setFormSpecial2(enemy.special2 ?? "");
    setFormSpecial3(enemy.special3 ?? "");
    setFormImageData(null);
    setFormImagePreview(enemy.imageUrl ?? null);
    setShowAddForm(true);
  };

  const handleImagePick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setFormImageData(dataUrl);
      setFormImagePreview(dataUrl);
    };
    input.click();
  };

  const handleSubmit = () => {
    if (!formName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = {
      name: formName.trim(),
      atk: parseInt(formAtk) || 10,
      health: parseInt(formHealth) || 100,
      isBoss: formIsBoss,
      special1: formIsBoss ? (formSpecial1.trim() || null) : null,
      special2: formIsBoss ? (formSpecial2.trim() || null) : null,
      special3: formIsBoss ? (formSpecial3.trim() || null) : null,
      imageData: formImageData ?? undefined,
    };
    if (editingEnemy) {
      updateMutation.mutate({ id: editingEnemy.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handlePartUpload = async () => {
    if (!selectedEnemyId || !uploadPartType) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      addPartMutation.mutate({
        enemyId: selectedEnemyId,
        partType: uploadPartType,
        imageData: dataUrl,
        zIndex: enemyParts.length + 1,
      });
    };
    input.click();
  };

  const selectedEnemy = selectedEnemyId ? allEnemies.find(e => e.id === selectedEnemyId) : null;
  const selectedPart = enemyParts.find(p => p.id === selectedPartId);

  if (showAddForm) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-1">
          <button
            data-testid="button-back-from-enemy-form"
            onClick={() => { setShowAddForm(false); setEditingEnemy(null); resetForm(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", color: "#f87171" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="font-fantasy text-sm tracking-widest" style={{ color: "#f87171" }}>
            {editingEnemy ? "Edit Enemy" : "Add Enemy"}
          </h3>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              data-testid="button-pick-enemy-image"
              onClick={handleImagePick}
              className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ background: "rgba(0,0,0,0.4)", border: "2px dashed rgba(239,68,68,0.4)", cursor: "pointer" }}
            >
              {formImagePreview ? (
                <img src={formImagePreview} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="w-5 h-5 text-red-400 opacity-60" />
                  <span className="font-fantasy text-[8px] text-red-400 opacity-60">Image</span>
                </div>
              )}
            </button>

            <div className="flex-1 flex flex-col gap-2">
              <input
                data-testid="input-enemy-name"
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Enemy name..."
                className="w-full px-3 py-2 rounded-lg font-sans text-sm outline-none"
                style={inputStyle}
              />

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    data-testid="toggle-enemy-boss"
                    onClick={() => setFormIsBoss(b => !b)}
                    className="relative w-10 h-5 rounded-full transition-all"
                    style={{
                      background: formIsBoss ? "linear-gradient(135deg, #7c1d1d, #dc2626)" : "rgba(0,0,0,0.4)",
                      border: `1px solid ${formIsBoss ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.25)"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                      style={{
                        left: formIsBoss ? "calc(100% - 18px)" : "2px",
                        background: formIsBoss ? "#f87171" : "rgba(239,68,68,0.4)",
                        boxShadow: formIsBoss ? "0 0 8px rgba(239,68,68,0.6)" : "none",
                      }}
                    />
                  </div>
                  <span className="font-fantasy text-[10px] tracking-wider" style={{ color: formIsBoss ? "#f87171" : "#7a5858" }}>
                    {formIsBoss ? "👑 Boss" : "Regular"}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-fantasy text-[9px] tracking-wider mb-1 flex items-center gap-1" style={{ color: "#fca5a5" }}>
                <Sword className="w-3 h-3" /> ATK Power
              </label>
              <input
                data-testid="input-enemy-atk"
                type="number"
                value={formAtk}
                onChange={e => setFormAtk(e.target.value)}
                min="1"
                className="w-full px-3 py-2 rounded-lg font-sans text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="font-fantasy text-[9px] tracking-wider mb-1 flex items-center gap-1" style={{ color: "#fca5a5" }}>
                <Heart className="w-3 h-3" /> Health
              </label>
              <input
                data-testid="input-enemy-health"
                type="number"
                value={formHealth}
                onChange={e => setFormHealth(e.target.value)}
                min="1"
                className="w-full px-3 py-2 rounded-lg font-sans text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {formIsBoss && (
            <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="font-fantasy text-[9px] tracking-wider" style={{ color: "rgba(239,68,68,0.7)" }}>
                👑 Boss Specials (up to 3)
              </p>
              {[
                { val: formSpecial1, set: setFormSpecial1, label: "Special 1", testId: "input-enemy-special1" },
                { val: formSpecial2, set: setFormSpecial2, label: "Special 2", testId: "input-enemy-special2" },
                { val: formSpecial3, set: setFormSpecial3, label: "Special 3", testId: "input-enemy-special3" },
              ].map(({ val, set, label, testId }) => (
                <input
                  key={testId}
                  data-testid={testId}
                  type="text"
                  value={val}
                  onChange={e => set(e.target.value)}
                  placeholder={`${label} (optional)...`}
                  className="w-full px-3 py-2 rounded-lg font-sans text-sm outline-none"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", outline: "none" }}
                />
              ))}
            </div>
          )}

          <button
            data-testid="button-submit-enemy"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="w-full py-3 rounded-xl font-fantasy text-sm tracking-wider"
            style={{
              background: "linear-gradient(135deg, #7c1d1d, #991b1b)",
              border: "1px solid rgba(239,68,68,0.5)",
              color: "#fca5a5",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(239,68,68,0.2)",
            }}
          >
            {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingEnemy ? "Save Changes" : "Add Enemy"}
          </button>
        </div>
      </div>
    );
  }

  if (selectedEnemyId && selectedEnemy) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            data-testid="button-back-from-enemy-parts"
            onClick={() => { setSelectedEnemyId(null); setSelectedPartId(null); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", color: "#f87171" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-fantasy text-sm tracking-widest truncate" style={{ color: "#f87171" }}>{selectedEnemy.name}</h3>
              {selectedEnemy.isBoss && <span className="text-[10px]">👑</span>}
            </div>
            <p className="font-fantasy text-[8px] tracking-wider" style={{ color: "rgba(239,68,68,0.6)" }}>
              Animation Parts Editor
            </p>
          </div>
          {selectedEnemy.imageUrl && (
            <img src={selectedEnemy.imageUrl} alt="" className="w-10 h-10 object-contain rounded-md" style={{ border: "1px solid rgba(239,68,68,0.2)", background: "rgba(0,0,0,0.3)" }} />
          )}
        </div>

        <div
          ref={canvasRef}
          className="relative mx-auto rounded-xl overflow-hidden"
          style={{
            width: "100%",
            maxWidth: "400px",
            aspectRatio: "1",
            background: "radial-gradient(ellipse at 50% 60%, rgba(60,10,10,0.8) 0%, rgba(20,5,5,0.95) 100%)",
            border: "2px solid rgba(239,68,68,0.3)",
            touchAction: "none",
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {enemyParts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-fantasy text-[8px] tracking-wider text-center" style={{ color: "rgba(239,68,68,0.4)" }}>
                Add parts below<br />to build animation
              </p>
            </div>
          )}
          {[...enemyParts].sort((a, b) => a.zIndex - b.zIndex).map(part => {
            const pos = dragPos?.id === part.id ? { x: dragPos.x, y: dragPos.y } : { x: part.posX, y: part.posY };
            const isSelected = selectedPartId === part.id;
            return (
              <div
                key={part.id}
                data-testid={`enemy-canvas-part-${part.id}`}
                className="absolute"
                style={{
                  left: `${(pos.x / CANVAS_SIZE) * 100}%`,
                  top: `${(pos.y / CANVAS_SIZE) * 100}%`,
                  width: `${(part.width / CANVAS_SIZE) * 100}%`,
                  height: `${(part.height / CANVAS_SIZE) * 100}%`,
                  zIndex: part.zIndex + (dragRef.current?.partId === part.id ? 100 : 0),
                  cursor: "grab",
                  outline: isSelected ? "2px solid rgba(239,68,68,0.8)" : "none",
                  outlineOffset: "2px",
                }}
                onPointerDown={e => handlePointerDown(e, part)}
                onClick={e => { e.stopPropagation(); if (!didDrag.current) setSelectedPartId(part.id); }}
              >
                <img src={part.imageUrl} alt={part.partType} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                {isSelected && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded font-fantasy text-[8px] tracking-wider whitespace-nowrap" style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>
                    {part.partType}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedPart && (
          <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-fantasy text-xs tracking-wider capitalize" style={{ color: "#f87171" }}>{selectedPart.partType}</span>
              <button
                data-testid="button-delete-enemy-part"
                onClick={() => deletePartMutation.mutate(selectedPart.id)}
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", color: "#f87171" }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-fantasy text-[8px]" style={{ color: "rgba(239,68,68,0.6)" }}>Width</label>
                <input
                  data-testid="input-part-width"
                  type="number"
                  value={selectedPart.width}
                  onChange={e => updatePartMutation.mutate({ partId: selectedPart.id, width: parseInt(e.target.value) || selectedPart.width })}
                  className="w-full px-2 py-1 rounded text-xs outline-none font-sans"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
                />
              </div>
              <div>
                <label className="font-fantasy text-[8px]" style={{ color: "rgba(239,68,68,0.6)" }}>Height</label>
                <input
                  data-testid="input-part-height"
                  type="number"
                  value={selectedPart.height}
                  onChange={e => updatePartMutation.mutate({ partId: selectedPart.id, height: parseInt(e.target.value) || selectedPart.height })}
                  className="w-full px-2 py-1 rounded text-xs outline-none font-sans"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
                />
              </div>
              <div>
                <label className="font-fantasy text-[8px]" style={{ color: "rgba(239,68,68,0.6)" }}>Z-Index</label>
                <input
                  data-testid="input-part-zindex"
                  type="number"
                  value={selectedPart.zIndex}
                  onChange={e => updatePartMutation.mutate({ partId: selectedPart.id, zIndex: parseInt(e.target.value) || selectedPart.zIndex })}
                  className="w-full px-2 py-1 rounded text-xs outline-none font-sans"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="font-fantasy text-[9px] tracking-wider mb-2" style={{ color: "rgba(239,68,68,0.6)" }}>
            Add Animation Part
          </p>

          {enemyParts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[...enemyParts].sort((a, b) => a.zIndex - b.zIndex).map(p => (
                <button
                  key={p.id}
                  data-testid={`button-select-part-${p.id}`}
                  onClick={() => setSelectedPartId(selectedPartId === p.id ? null : p.id)}
                  className="px-2 py-0.5 rounded font-fantasy text-[8px] tracking-wider"
                  style={{
                    background: selectedPartId === p.id ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${selectedPartId === p.id ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.2)"}`,
                    color: "#fca5a5",
                    cursor: "pointer",
                  }}
                >
                  {p.partType}
                </button>
              ))}
            </div>
          )}

          {uploadPartType ? (
            <div className="flex flex-col gap-2">
              <p className="font-fantasy text-[9px]" style={{ color: "#fca5a5" }}>
                Uploading: <span style={{ color: "#f87171" }}>{uploadPartType}</span>
              </p>
              <div className="flex gap-2">
                <button
                  data-testid="button-confirm-part-upload"
                  onClick={handlePartUpload}
                  disabled={addPartMutation.isPending}
                  className="flex-1 py-2 rounded-lg font-fantasy text-[10px] tracking-wider"
                  style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171", cursor: "pointer" }}
                >
                  {addPartMutation.isPending ? "Uploading..." : "Choose Image"}
                </button>
                <button
                  onClick={() => { setUploadPartType(null); setNewPartLabel(""); }}
                  className="px-3 py-2 rounded-lg font-fantasy text-[10px]"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.2)", color: "#7a5858", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                data-testid="input-part-label"
                type="text"
                value={newPartLabel}
                onChange={e => setNewPartLabel(e.target.value)}
                placeholder="Part label (e.g. body, left_arm)..."
                className="flex-1 px-3 py-2 rounded-lg font-sans text-xs outline-none"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}
              />
              <button
                data-testid="button-start-part-upload"
                onClick={() => {
                  if (!newPartLabel.trim()) {
                    toast({ title: "Label required", description: "Enter a part label first", variant: "destructive" });
                    return;
                  }
                  setUploadPartType(newPartLabel.trim());
                }}
                className="px-3 py-2 rounded-lg font-fantasy text-[10px]"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", cursor: "pointer" }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(239,68,68,0.6)" }}>
            {allEnemies.length} {allEnemies.length === 1 ? "enemy" : "enemies"} in database
          </p>
        </div>
        <button
          data-testid="button-add-enemy"
          onClick={() => { resetForm(); setEditingEnemy(null); setShowAddForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-fantasy text-[10px] tracking-wider"
          style={{ background: "linear-gradient(135deg, #7c1d1d, #991b1b)", border: "1px solid rgba(239,68,68,0.5)", color: "#fca5a5", cursor: "pointer" }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Enemy
        </button>
      </div>

      {isLoading ? (
        <p className="font-fantasy text-center text-xs animate-pulse" style={{ color: "rgba(239,68,68,0.5)" }}>Summoning enemies...</p>
      ) : allEnemies.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ background: "rgba(239,68,68,0.05)", border: "1px dashed rgba(239,68,68,0.2)" }}>
          <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "rgba(239,68,68,0.5)" }}>
            No enemies yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {allEnemies.map(enemy => (
            <div
              key={enemy.id}
              data-testid={`card-enemy-${enemy.id}`}
              className="rounded-xl overflow-hidden"
              style={{
                background: enemy.isBoss
                  ? "linear-gradient(135deg, rgba(80,15,15,0.9) 0%, rgba(50,8,8,0.9) 100%)"
                  : "linear-gradient(135deg, rgba(45,12,12,0.85) 0%, rgba(30,8,8,0.85) 100%)",
                border: enemy.isBoss ? "1.5px solid rgba(239,68,68,0.45)" : "1px solid rgba(239,68,68,0.2)",
                boxShadow: enemy.isBoss ? "0 0 12px rgba(239,68,68,0.12)" : "none",
              }}
            >
              <div className="flex items-center gap-3 p-3">
                <div
                  className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  {enemy.imageUrl ? (
                    <img src={enemy.imageUrl} alt={enemy.name} className="w-full h-full object-contain" />
                  ) : (
                    <Shield className="w-6 h-6" style={{ color: "rgba(239,68,68,0.4)" }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="font-fantasy text-sm tracking-wider truncate" style={{ color: "#fca5a5", textShadow: enemy.isBoss ? "0 0 8px rgba(239,68,68,0.4)" : "none" }}>
                      {enemy.name}
                    </p>
                    {enemy.isBoss && <span className="text-[10px]">👑</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-fantasy text-[9px] flex items-center gap-0.5" style={{ color: "rgba(239,68,68,0.7)" }}>
                      <Sword className="w-2.5 h-2.5" /> {enemy.atk}
                    </span>
                    <span className="font-fantasy text-[9px] flex items-center gap-0.5" style={{ color: "rgba(239,68,68,0.7)" }}>
                      <Heart className="w-2.5 h-2.5" /> {enemy.health}
                    </span>
                    {enemy.isBoss && (enemy.special1 || enemy.special2 || enemy.special3) && (
                      <span className="font-fantasy text-[8px]" style={{ color: "rgba(239,68,68,0.5)" }}>
                        {[enemy.special1, enemy.special2, enemy.special3].filter(Boolean).length} specials
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    data-testid={`button-parts-enemy-${enemy.id}`}
                    onClick={() => setSelectedEnemyId(enemy.id)}
                    className="px-2 py-1 rounded-lg font-fantasy text-[8px] tracking-wider"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", cursor: "pointer" }}
                  >
                    Parts
                  </button>
                  <button
                    data-testid={`button-edit-enemy-${enemy.id}`}
                    onClick={() => openEditForm(enemy)}
                    className="px-2 py-1 rounded-lg font-fantasy text-[8px] tracking-wider"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`button-delete-enemy-${enemy.id}`}
                    onClick={() => {
                      if (confirm(`Delete "${enemy.name}"?`)) deleteMutation.mutate(enemy.id);
                    }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", cursor: "pointer" }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {enemy.isBoss && (enemy.special1 || enemy.special2 || enemy.special3) && (
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {[enemy.special1, enemy.special2, enemy.special3].filter(Boolean).map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded font-fantasy text-[8px] tracking-wider"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
                    >
                      ✦ {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
