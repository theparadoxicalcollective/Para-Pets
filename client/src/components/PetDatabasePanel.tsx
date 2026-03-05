import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";
import { Plus, Trash2, X, ArrowLeft, Save, Layers, Link2 } from "lucide-react";

interface PetTemplate {
  id: string;
  name: string;
  frontAssembled: string | null;
  backAssembled: string | null;
  createdAt: string;
}

interface PetTemplatePart {
  id: string;
  templateId: string;
  partType: string;
  view: string;
  imageUrl: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  zIndex: number;
  pivotX: number;
  pivotY: number;
}

interface PetTemplateWithParts extends PetTemplate {
  parts: PetTemplatePart[];
}

interface LinkedShopPet {
  id: string;
  name: string;
  eggImageUrl: string | null;
  imageUrl: string | null;
  petTemplateId: string | null;
  rarity: number | null;
}

const PART_TYPES = [
  { key: "head", label: "Head", defaultZ: 8, layer: "front" as const },
  { key: "eyes", label: "Eyes", defaultZ: 9, layer: "front" as const },
  { key: "eyes_closed", label: "Eyes (Closed)", defaultZ: 9, layer: "front" as const },
  { key: "body", label: "Body", defaultZ: 5, layer: "body" as const },
  { key: "tail", label: "Tail", defaultZ: 2, layer: "back" as const, defaultPivotX: 50, defaultPivotY: 0 },
  { key: "wings", label: "Wings", defaultZ: 7, layer: "front" as const },
  { key: "back_arms", label: "Back Arms", defaultZ: 3, layer: "back" as const },
  { key: "back_legs", label: "Back Legs", defaultZ: 1, layer: "back" as const },
  { key: "front_legs", label: "Front Legs", defaultZ: 6, layer: "front" as const },
  { key: "front_arms", label: "Front Arms", defaultZ: 10, layer: "front" as const },
  { key: "hands", label: "Hands", defaultZ: 11, layer: "front" as const },
  { key: "feet", label: "Feet", defaultZ: 4, layer: "back" as const },
];

const CANVAS_SIZE = 1000;

export default function PetDatabasePanel() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [activeView, setActiveView] = useState<"front" | "back">("front");
  const [uploadPartType, setUploadPartType] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [pivotMode, setPivotMode] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ partId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<PetTemplate[]>({
    queryKey: ["/api/admin/pet-templates"],
  });

  const { data: allShopItems = [] } = useQuery<LinkedShopPet[]>({
    queryKey: ["/api/admin/shop-items-all"],
    select: (data: any[]) => data.filter((i: any) => i.type === "pet"),
  });

  const getLinkedShopPet = (templateId: string): LinkedShopPet | undefined => {
    return allShopItems.find(item => item.petTemplateId === templateId);
  };

  const { data: templateDetail } = useQuery<PetTemplateWithParts>({
    queryKey: ["/api/admin/pet-templates", selectedTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pet-templates/${selectedTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedTemplateId,
  });

  const viewParts = (templateDetail?.parts || []).filter(p => p.view === activeView).sort((a, b) => a.zIndex - b.zIndex);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/pet-templates", { name });
      return res.json();
    },
    onSuccess: (data: PetTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      setShowCreateModal(false);
      setNewPetName("");
      setSelectedTemplateId(data.id);
      toast({ title: "Created", description: "Pet template created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/pet-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      setSelectedTemplateId(null);
      toast({ title: "Deleted", description: "Pet template removed" });
    },
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: { templateId: string; partType: string; view: string; imageData: string; zIndex: number; pivotX?: number; pivotY?: number }) => {
      const res = await apiRequest("POST", `/api/admin/pet-templates/${data.templateId}/part`, {
        partType: data.partType,
        view: data.view,
        imageData: data.imageData,
        posX: Math.round(CANVAS_SIZE / 2 - 150),
        posY: Math.round(CANVAS_SIZE / 2 - 150),
        width: 300,
        height: 300,
        zIndex: data.zIndex,
        pivotX: data.pivotX ?? 50,
        pivotY: data.pivotY ?? 50,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      setUploadPartType(null);
      toast({ title: "Added", description: "Part added to canvas" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add part", variant: "destructive" });
    },
  });

  const updatePartMutation = useMutation({
    mutationFn: async ({ partId, ...data }: { partId: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number; pivotX?: number; pivotY?: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-template-parts/${partId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      await apiRequest("DELETE", `/api/admin/pet-template-parts/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      setSelectedPartId(null);
      toast({ title: "Removed", description: "Part removed" });
    },
  });

  const assembleMutation = useMutation({
    mutationFn: async ({ id, view }: { id: string; view: string }) => {
      const res = await apiRequest("POST", `/api/admin/pet-templates/${id}/assemble`, {
        view,
        canvasWidth: CANVAS_SIZE,
        canvasHeight: CANVAS_SIZE,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      toast({ title: "Saved!", description: `${activeView === "front" ? "Front" : "Back"} view assembled and saved` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assemble", variant: "destructive" });
    },
  });

  const handlePointerDown = useCallback((e: React.PointerEvent, part: PetTemplatePart) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    didDrag.current = false;
    dragRef.current = {
      partId: part.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: part.posX,
      origY: part.posY,
    };
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
    const newX = Math.round(dragRef.current.origX + dx);
    const newY = Math.round(dragRef.current.origY + dy);
    setDragPos({ id: dragRef.current.partId, x: newX, y: newY });
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

  const selectedPart = viewParts.find(p => p.id === selectedPartId);

  if (selectedTemplateId && templateDetail) {
    const linkedPet = getLinkedShopPet(templateDetail.id);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            data-testid="button-back-to-pet-list"
            onClick={() => { setSelectedTemplateId(null); setSelectedPartId(null); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(240,192,64,0.15)", border: "1px solid rgba(240,192,64,0.3)", cursor: "pointer", color: "#f0c040" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="font-fantasy text-[#f0c040] text-sm tracking-widest flex-1 truncate">{templateDetail.name}</h3>
          <button
            data-testid="button-delete-pet-template"
            onClick={() => { if (confirm(`Delete "${templateDetail.name}"?`)) deleteMutation.mutate(templateDetail.id); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", cursor: "pointer", color: "#fca5a5" }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {linkedPet ? (
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(127,255,212,0.06)", border: "1px solid rgba(127,255,212,0.2)" }}
            data-testid="linked-shop-pet-info"
          >
            <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#7fbfb0" }} />
            {(linkedPet.eggImageUrl || linkedPet.imageUrl) && (
              <img
                src={linkedPet.eggImageUrl || linkedPet.imageUrl || ""}
                alt=""
                className="w-8 h-8 object-contain rounded-md flex-shrink-0"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-fantasy text-[#7fbfb0] text-[9px] tracking-wider">Linked to Item DB</p>
              <p className="font-fantasy text-[#f0c040] text-[10px] truncate">{linkedPet.name}</p>
            </div>
            {linkedPet.rarity && (
              <span className="text-[8px] flex-shrink-0" style={{ color: "#f0c040" }}>
                {"★".repeat(linkedPet.rarity)}
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(240,192,64,0.05)", border: "1px dashed rgba(240,192,64,0.2)" }}
          >
            <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#6a5840" }} />
            <p className="font-fantasy text-[#6a5840] text-[9px] tracking-wider">Not linked to any Item DB pet — assign in Item DB editor</p>
          </div>
        )}

        <div className="flex justify-center gap-2 mb-1">
          {(["front", "back"] as const).map(v => (
            <button
              key={v}
              data-testid={`button-view-${v}`}
              onClick={() => { setActiveView(v); setSelectedPartId(null); }}
              className="px-4 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider"
              style={{
                background: activeView === v ? "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${activeView === v ? "rgba(212,160,23,0.6)" : "rgba(212,160,23,0.2)"}`,
                color: activeView === v ? "#f0c040" : "#a89878",
                cursor: "pointer",
              }}
            >
              {v === "front" ? "Front View" : "Back View"}
            </button>
          ))}
        </div>

        <div
          ref={canvasRef}
          className="relative mx-auto rounded-lg overflow-hidden"
          style={{
            width: "100%",
            maxWidth: "500px",
            aspectRatio: "1",
            background: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px",
            border: pivotMode ? "2px solid rgba(255,80,80,0.6)" : "2px solid rgba(240,192,64,0.3)",
            boxShadow: pivotMode ? "inset 0 0 30px rgba(255,80,80,0.2)" : "inset 0 0 30px rgba(0,0,0,0.5)",
            touchAction: "none",
            cursor: pivotMode ? "crosshair" : "default",
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={(e) => {
            if (pivotMode && selectedPartId && canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              const canvasX = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
              const canvasY = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;
              const part = viewParts.find(p => p.id === selectedPartId);
              if (part) {
                const relX = Math.round(((canvasX - part.posX) / part.width) * 100);
                const relY = Math.round(((canvasY - part.posY) / part.height) * 100);
                const clampedX = Math.max(0, Math.min(100, relX));
                const clampedY = Math.max(0, Math.min(100, relY));
                updatePartMutation.mutate({ partId: selectedPartId, pivotX: clampedX, pivotY: clampedY });
                setPivotMode(false);
                toast({ title: "Pivot Set", description: `Pivot point set to ${clampedX}%, ${clampedY}%` });
              }
            }
          }}
        >
          {viewParts.map(part => {
            const pos = dragPos?.id === part.id ? { x: dragPos.x, y: dragPos.y } : { x: part.posX, y: part.posY };
            const isSelected = selectedPartId === part.id;
            const isDragging = dragRef.current?.partId === part.id;
            return (
              <div
                key={part.id}
                data-testid={`canvas-part-${part.id}`}
                className="absolute"
                style={{
                  left: `${(pos.x / CANVAS_SIZE) * 100}%`,
                  top: `${(pos.y / CANVAS_SIZE) * 100}%`,
                  width: `${(part.width / CANVAS_SIZE) * 100}%`,
                  height: `${(part.height / CANVAS_SIZE) * 100}%`,
                  zIndex: part.zIndex + (isDragging ? 100 : 0),
                  cursor: pivotMode && isSelected ? "crosshair" : "grab",
                  outline: isSelected ? "2px solid rgba(240,192,64,0.8)" : "none",
                  outlineOffset: "2px",
                  borderRadius: "4px",
                }}
                onPointerDown={(e) => { if (!pivotMode) handlePointerDown(e, part); }}
                onClick={(e) => { e.stopPropagation(); if (!pivotMode && !didDrag.current) setSelectedPartId(part.id); }}
              >
                <img
                  src={part.imageUrl}
                  alt={part.partType}
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {isSelected && (
                  <div
                    className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded font-fantasy text-[8px] tracking-wider whitespace-nowrap"
                    style={{ background: "rgba(240,192,64,0.9)", color: "#1a0a00" }}
                  >
                    {part.partType}
                  </div>
                )}
                {isSelected && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${part.pivotX ?? 50}%`,
                      top: `${part.pivotY ?? 50}%`,
                      width: "12px",
                      height: "12px",
                      marginLeft: "-6px",
                      marginTop: "-6px",
                      borderRadius: "50%",
                      background: "radial-gradient(circle, rgba(255,80,80,1) 0%, rgba(255,80,80,0.4) 50%, transparent 70%)",
                      border: "2px solid #fff",
                      boxShadow: "0 0 6px rgba(255,80,80,0.8), 0 0 12px rgba(255,80,80,0.4)",
                      zIndex: 999,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 justify-center">
          {PART_TYPES.map(pt => {
            const exists = viewParts.some(p => p.partType === pt.key);
            return (
              <button
                key={pt.key}
                data-testid={`button-upload-${pt.key}`}
                onClick={() => setUploadPartType(pt.key)}
                className="px-2 py-1 rounded font-fantasy text-[9px] tracking-wider transition-transform active:scale-95"
                style={{
                  background: exists ? "rgba(127,255,212,0.15)" : "rgba(240,192,64,0.1)",
                  border: `1px solid ${exists ? "rgba(127,255,212,0.3)" : "rgba(240,192,64,0.25)"}`,
                  color: exists ? "#7fffd4" : "#f0c040",
                  cursor: "pointer",
                }}
              >
                {exists ? "✓ " : "+ "}{pt.label}
              </button>
            );
          })}
        </div>

        {selectedPart && (
          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.2)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-fantasy text-[#f0c040] text-xs tracking-wider capitalize">{selectedPart.partType}</span>
                {(() => {
                  const ptInfo = PART_TYPES.find(p => p.key === selectedPart.partType);
                  const layerLabel = ptInfo?.layer === "back" ? "Behind Body" : ptInfo?.layer === "body" ? "Body Layer" : "In Front";
                  const layerColor = ptInfo?.layer === "back" ? "#ff9966" : ptInfo?.layer === "body" ? "#7fbfb0" : "#66ccff";
                  return (
                    <span className="font-fantasy text-[7px] tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${layerColor}40`, color: layerColor }}>
                      {layerLabel}
                    </span>
                  );
                })()}
              </div>
              <button
                data-testid="button-delete-selected-part"
                onClick={() => deletePartMutation.mutate(selectedPart.id)}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "rgba(220,38,38,0.3)", cursor: "pointer", color: "#fca5a5" }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-fantasy text-[8px] text-[#a89878] block">Width</label>
                <input
                  data-testid="input-part-width"
                  type="number"
                  value={selectedPart.width}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(1000, parseInt(e.target.value) || 10));
                    updatePartMutation.mutate({ partId: selectedPart.id, width: val });
                  }}
                  className="w-full px-2 py-1 rounded text-xs font-mono"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(240,192,64,0.2)", color: "#e8ddd0", outline: "none" }}
                />
              </div>
              <div>
                <label className="font-fantasy text-[8px] text-[#a89878] block">Height</label>
                <input
                  data-testid="input-part-height"
                  type="number"
                  value={selectedPart.height}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(1000, parseInt(e.target.value) || 10));
                    updatePartMutation.mutate({ partId: selectedPart.id, height: val });
                  }}
                  className="w-full px-2 py-1 rounded text-xs font-mono"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(240,192,64,0.2)", color: "#e8ddd0", outline: "none" }}
                />
              </div>
              <div>
                <label className="font-fantasy text-[8px] text-[#a89878] block">Layer (Z)</label>
                <input
                  data-testid="input-part-zindex"
                  type="number"
                  value={selectedPart.zIndex}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(20, parseInt(e.target.value) || 0));
                    updatePartMutation.mutate({ partId: selectedPart.id, zIndex: val });
                  }}
                  className="w-full px-2 py-1 rounded text-xs font-mono"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(240,192,64,0.2)", color: "#e8ddd0", outline: "none" }}
                />
              </div>
            </div>

            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(240,192,64,0.15)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-fantasy text-[9px] text-[#a89878] tracking-wider">Pivot Point (Rotation Anchor)</span>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(255,80,80,1) 0%, rgba(255,80,80,0.4) 60%)", border: "1.5px solid #fff", boxShadow: "0 0 4px rgba(255,80,80,0.6)" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="font-fantasy text-[8px] text-[#a89878] block">Pivot X %</label>
                  <input
                    data-testid="input-part-pivot-x"
                    type="number"
                    value={selectedPart.pivotX ?? 50}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updatePartMutation.mutate({ partId: selectedPart.id, pivotX: val });
                    }}
                    className="w-full px-2 py-1 rounded text-xs font-mono"
                    style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,80,80,0.3)", color: "#e8ddd0", outline: "none" }}
                  />
                </div>
                <div>
                  <label className="font-fantasy text-[8px] text-[#a89878] block">Pivot Y %</label>
                  <input
                    data-testid="input-part-pivot-y"
                    type="number"
                    value={selectedPart.pivotY ?? 50}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updatePartMutation.mutate({ partId: selectedPart.id, pivotY: val });
                    }}
                    className="w-full px-2 py-1 rounded text-xs font-mono"
                    style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,80,80,0.3)", color: "#e8ddd0", outline: "none" }}
                  />
                </div>
              </div>
              <button
                data-testid="button-set-pivot"
                onClick={() => { setPivotMode(!pivotMode); }}
                className="w-full py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-transform active:scale-95"
                style={{
                  background: pivotMode ? "rgba(255,80,80,0.3)" : "rgba(255,80,80,0.1)",
                  border: `1px solid ${pivotMode ? "rgba(255,80,80,0.6)" : "rgba(255,80,80,0.3)"}`,
                  color: pivotMode ? "#ff6666" : "#ff9999",
                  cursor: "pointer",
                }}
              >
                {pivotMode ? "Tap on canvas to set pivot..." : "Tap to Set Pivot Point"}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            data-testid="button-assemble-save"
            onClick={() => {
              if (!selectedTemplateId) return;
              assembleMutation.mutate({ id: selectedTemplateId, view: activeView });
            }}
            disabled={assembleMutation.isPending || viewParts.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
              border: "1px solid rgba(127,255,212,0.4)",
              color: "#7fffd4",
              cursor: "pointer",
            }}
          >
            <Save className="w-4 h-4" />
            {assembleMutation.isPending ? "Assembling..." : `Save ${activeView === "front" ? "Front" : "Back"} View`}
          </button>
        </div>

        {(templateDetail.frontAssembled || templateDetail.backAssembled) && (
          <div className="mt-1">
            <p className="font-fantasy text-[9px] text-[#a89878] tracking-wider mb-2 text-center">Assembled Previews</p>
            <div className="flex gap-3 justify-center">
              {templateDetail.frontAssembled && (
                <div className="text-center">
                  <img
                    src={templateDetail.frontAssembled}
                    alt="Front"
                    className="w-24 h-24 object-contain rounded-lg"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(127,255,212,0.2)" }}
                    data-testid="preview-front-assembled"
                  />
                  <span className="font-fantasy text-[8px] text-[#7fbfb0] tracking-wider">Front</span>
                </div>
              )}
              {templateDetail.backAssembled && (
                <div className="text-center">
                  <img
                    src={templateDetail.backAssembled}
                    alt="Back"
                    className="w-24 h-24 object-contain rounded-lg"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(127,255,212,0.2)" }}
                    data-testid="preview-back-assembled"
                  />
                  <span className="font-fantasy text-[8px] text-[#7fbfb0] tracking-wider">Back</span>
                </div>
              )}
            </div>
          </div>
        )}

        {uploadPartType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setUploadPartType(null)} />
            <div
              className="relative z-10 w-[85%] max-w-sm rounded-lg p-5"
              style={{
                background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-fantasy text-[#f0c040] text-sm tracking-widest capitalize">
                  Upload {uploadPartType} ({activeView})
                </h4>
                <button
                  onClick={() => setUploadPartType(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(240,192,64,0.15)", border: "1px solid rgba(240,192,64,0.3)", cursor: "pointer", color: "#f0c040" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="font-fantasy text-[9px] text-[#a89878] tracking-wider mb-3">PNG only, up to 1000x1000px / 15MB</p>
              <input
                data-testid="input-part-upload"
                type="file"
                accept="image/png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 15 * 1024 * 1024) {
                    toast({ title: "Too Large", description: "Max 15MB per image", variant: "destructive" });
                    return;
                  }
                  const dataUrl = await readFileAsDataUrl(file);
                  const ptConfig = PART_TYPES.find(p => p.key === uploadPartType);
                  const defaultZ = ptConfig?.defaultZ || 0;
                  addPartMutation.mutate({
                    templateId: selectedTemplateId!,
                    partType: uploadPartType!,
                    view: activeView,
                    imageData: dataUrl,
                    zIndex: defaultZ,
                    pivotX: (ptConfig as any)?.defaultPivotX ?? 50,
                    pivotY: (ptConfig as any)?.defaultPivotY ?? 50,
                  });
                }}
                className="w-full text-xs font-fantasy"
                style={{ color: "#f0c040" }}
              />
              {addPartMutation.isPending && (
                <p className="font-fantasy text-[10px] text-[#7fbfb0] animate-pulse mt-3 text-center">Uploading...</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-fantasy text-[#f0c040] text-sm tracking-widest" style={{ textShadow: "0 0 10px rgba(240,192,64,0.3)" }}>
          Pet Database
        </h3>
        <button
          data-testid="button-add-pet-template"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
            border: "1px solid rgba(127,255,212,0.4)",
            color: "#7fffd4",
            cursor: "pointer",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Pet
        </button>
      </div>

      {isLoading ? (
        <p className="font-fantasy text-[#7fbfb0] text-xs animate-pulse text-center py-4">Loading pet database...</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-8">
          <Layers className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(240,192,64,0.3)" }} />
          <p className="font-fantasy text-[#a89878] text-xs tracking-wider">No pets in database yet</p>
          <p className="font-fantasy text-[9px] text-[#a89878] tracking-wider mt-1 opacity-60">Tap "Add Pet" to create your first</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {templates.map(t => {
            const linked = getLinkedShopPet(t.id);
            return (
              <button
                key={t.id}
                data-testid={`card-pet-template-${t.id}`}
                onClick={() => setSelectedTemplateId(t.id)}
                className="rounded-lg overflow-hidden text-left transition-transform active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(30,15,5,0.95) 0%, rgba(50,30,10,0.95) 100%)",
                  border: linked ? "1px solid rgba(127,255,212,0.3)" : "1px solid rgba(212,160,23,0.3)",
                  cursor: "pointer",
                }}
              >
                <div className="p-3 flex flex-col items-center gap-2">
                  <div
                    className="w-full aspect-square rounded-md flex items-center justify-center overflow-hidden"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.15)" }}
                  >
                    {t.frontAssembled ? (
                      <img src={t.frontAssembled} alt={t.name} className="w-full h-full object-contain" />
                    ) : (
                      <Layers className="w-8 h-8" style={{ color: "rgba(240,192,64,0.2)" }} />
                    )}
                  </div>
                  <p className="font-fantasy text-[#f0c040] text-xs font-semibold text-center truncate w-full">
                    {t.name}
                  </p>
                  {linked && (
                    <div className="flex items-center gap-1.5 w-full justify-center">
                      {(linked.eggImageUrl || linked.imageUrl) && (
                        <img
                          src={linked.eggImageUrl || linked.imageUrl || ""}
                          alt=""
                          className="w-5 h-5 object-contain rounded-sm"
                          style={{ background: "rgba(0,0,0,0.3)" }}
                        />
                      )}
                      <span className="font-fantasy text-[7px] tracking-wider truncate" style={{ color: "#7fbfb0" }}>
                        {linked.name}
                      </span>
                      {linked.rarity && (
                        <span className="text-[7px]" style={{ color: "#f0c040" }}>{"★".repeat(linked.rarity)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-1">
                    {t.frontAssembled && (
                      <span className="font-fantasy text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}>
                        Front ✓
                      </span>
                    )}
                    {t.backAssembled && (
                      <span className="font-fantasy text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}>
                        Back ✓
                      </span>
                    )}
                    {!linked && (
                      <span className="font-fantasy text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(240,192,64,0.08)", color: "#6a5840", border: "1px dashed rgba(240,192,64,0.2)" }}>
                        Unlinked
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div
            className="relative z-10 w-[85%] max-w-sm rounded-lg p-5"
            style={{
              background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
              border: "1px solid rgba(212,160,23,0.5)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            }}
          >
            <h4 className="font-fantasy text-[#f0c040] text-center text-sm tracking-widest mb-4">Add Pet</h4>
            <div className="mb-4">
              <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">Species</label>
              <input
                data-testid="input-pet-template-name"
                type="text"
                value={newPetName}
                onChange={(e) => setNewPetName(e.target.value)}
                placeholder="Enter species name..."
                className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none"
                style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)", color: "#a89878", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                data-testid="button-confirm-create-pet"
                onClick={() => { if (newPetName.trim()) createMutation.mutate(newPetName.trim()); }}
                disabled={createMutation.isPending || !newPetName.trim()}
                className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                  border: "1px solid rgba(127,255,212,0.4)",
                  color: "#7fffd4",
                  cursor: "pointer",
                }}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
