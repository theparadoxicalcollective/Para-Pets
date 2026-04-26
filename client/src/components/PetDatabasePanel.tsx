import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";
import { Plus, Trash2, X, ArrowLeft, Save, Layers, Link2, Pencil, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getAlphaBoundsSync, FULL_BOUNDS } from "@/lib/alphaBounds";

interface PetTemplate {
  id: string;
  name: string;
  facing?: string | null;
  frontAssembled: string | null;
  backAssembled: string | null;
  sleepingImageUrl: string | null;
  canFly: boolean;
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

type PartLayer = "front" | "back" | "body";
interface PartDef { key: string; label: string; defaultZ: number; layer: PartLayer; animOnly?: boolean; defaultPivotX?: number; defaultPivotY?: number; }

// ── Front-facing layer plan ────────────────────────────────────────────────
// Z-order (higher = drawn on top). Layout enforces:
//   heads (all)  >  body parts  >  back hair (per head)  >  head wings  >  wing sets
// Each "head" gets its own full set of parts so multi-headed pets can animate
// each head independently (parts move with their head's anchor).
//
// Existing keys (head, eyes, eyes_closed, mouth, mouth_closed, left_ear,
// right_ear, left_arm, right_arm, body, left_leg, right_leg, tail, left_wing,
// right_wing) are PRESERVED so previously-built pets keep working unchanged.
// New head/body/wing keys use clear prefixes (h2_, h3_, wing_set2_*, etc.).

type HeadIdx = 1 | 2 | 3;
const headPrefix = (i: HeadIdx) => (i === 1 ? "" : `h${i}_`);

/** Build the full part stack for a given head index. The first 11 entries are
 *  the "face stack" (drawn above body parts); back_hair is appended last and
 *  uses a low z-index so it sits BEHIND body parts but in front of wings. */
const headFrontParts = (i: HeadIdx, baseZ: number, backHairZ: number): PartDef[] => {
  const p = headPrefix(i);
  // Reuse the original key names for Head 1 so existing data is preserved.
  const k = (suffix: string) => `${p}${suffix}`;
  return [
    { key: k("above_head"),   label: "Above Head",       defaultZ: baseZ + 12, layer: "front" },
    { key: k("hair_left"),    label: "Hair Piece Left",  defaultZ: baseZ + 11, layer: "front" },
    { key: k("hair_right"),   label: "Hair Piece Right", defaultZ: baseZ + 10, layer: "front" },
    { key: k("eyes"),         label: "Eyes (Open)",      defaultZ: baseZ + 8,  layer: "front" },
    { key: k("eyes_closed"),  label: "Eyes (Closed)",    defaultZ: baseZ + 7,  layer: "front", animOnly: true },
    { key: k("mouth_closed"), label: "Mouth (Closed)",   defaultZ: baseZ + 6,  layer: "front" },
    { key: k("mouth"),        label: "Mouth (Open)",     defaultZ: baseZ + 5,  layer: "front", animOnly: true },
    { key: k("accessory_1"),  label: "Accessory 1",      defaultZ: baseZ + 4,  layer: "front" },
    { key: k("accessory_2"),  label: "Accessory 2",      defaultZ: baseZ + 3,  layer: "front" },
    { key: k("head"),         label: "Head",             defaultZ: baseZ + 2,  layer: "front" },
    { key: k("left_ear"),     label: "Left Ear",         defaultZ: baseZ + 1,  layer: "front" },
    { key: k("right_ear"),    label: "Right Ear",        defaultZ: baseZ + 0,  layer: "front" },
    // Second pair of ears — ONLY exposed on Head 1 (per user request).
    // Mirrors the primary ears but swings on a slightly different beat
    // (3.1 s vs 3.5 s in PetAnimator's getPartDuration). Multi-head
    // pets (Head 2 / Head 3) keep their original single ear pair so
    // the editor doesn't get cluttered with parts most templates
    // won't use.
    ...(i === 1 ? [
      { key: "left_ear_2",  label: "Left Ear 2",  defaultZ: baseZ - 1, layer: "front" as const },
      { key: "right_ear_2", label: "Right Ear 2", defaultZ: baseZ - 2, layer: "front" as const },
    ] : []),
    // Back hair lives in this head's section but renders behind the body so
    // it visually sways behind the head/shoulders. Per-head so each head has
    // its own swaying hair piece on multi-headed pets.
    { key: k("back_hair"),    label: "Back Hair",        defaultZ: backHairZ,  layer: "back"  },
  ];
};

const headWingPair = (i: HeadIdx, zL: number): PartDef[] => [
  { key: `${headPrefix(i)}head_wing_left`,  label: "Head Wing Left",  defaultZ: zL,     layer: "back" },
  { key: `${headPrefix(i)}head_wing_right`, label: "Head Wing Right", defaultZ: zL - 1, layer: "back" },
];

// Z bands keep heads clearly above body, body above back hair, back hair above
// all wings. Multi-head pets get separate bands so they don't z-fight.
const FRONT_PART_GROUPS: { group: string; parts: PartDef[]; collapsed?: boolean }[] = [
  // ── Heads (each is a complete face/ear/hair stack including back hair) ──
  { group: "Head One",   parts: headFrontParts(1, 100, 35) },
  { group: "Head Two",   parts: headFrontParts(2, 85,  34), collapsed: true },
  { group: "Head Three", parts: headFrontParts(3, 70,  33), collapsed: true },

  // ── Body (drawn under all heads, above back hair) ──────────────────────
  { group: "Body Parts", parts: [
    { key: "left_shoulder",        label: "Left Shoulder",         defaultZ: 54, layer: "front" },
    { key: "right_shoulder",       label: "Right Shoulder",        defaultZ: 53, layer: "front" },
    { key: "left_arm",             label: "Left Arm",              defaultZ: 52, layer: "front" },
    { key: "right_arm",            label: "Right Arm",             defaultZ: 51, layer: "front" },
    // Front Accessory 1 / 2 — generic in-front-of-body accessories
    // (necklaces, medallions, chest armour pieces). Sit ABOVE body but
    // below the head so the face still reads cleanly. defaultZ 56 / 55
    // places them above shoulders (54 / 53) and arms (52 / 51) so the
    // accessory always reads on top of any limb that might overlap it.
    // Same defaultZ scheme the side view uses.
    { key: "front_accessory_1",    label: "Front Accessory 1",     defaultZ: 56, layer: "front" },
    { key: "front_accessory_2",    label: "Front Accessory 2",     defaultZ: 55, layer: "front" },
    // Neck — single part type that works for both front- and side-
    // facing pets (admin uploads one image per view, like body). Sits
    // ABOVE the body silhouette and arms / shoulders / accessories
    // (so the neck visibly emerges from the chest) but BELOW the
    // head, ears, and ear_2 layers (so the head reads as resting on
    // top of the neck). LAYER_ORDER puts it at z=9 (one tick below
    // head=10), and the editor defaultZ of 60 keeps it grouped near
    // the chest accessories in the parts list.
    { key: "neck",                 label: "Neck",                  defaultZ: 60, layer: "front" },
    { key: "body",                 label: "Body",                  defaultZ: 50, layer: "body"  },
    // Front-facing-only LEFT / RIGHT positional accessories that sit
    // BEHIND the body silhouette (capes, satchels, harnesses worn under
    // the body image). LAYER_ORDER z=3, alongside back_accessory_1/2.
    { key: "front_left_accessory",  label: "Front Left Accessory",  defaultZ: 44, layer: "back"  },
    { key: "front_right_accessory", label: "Front Right Accessory", defaultZ: 43, layer: "back"  },
    // Back Accessory 1 / 2 — generic behind-body accessories (capes,
    // wings of fabric, pinned items on the back). Layer "back" puts them
    // under body in the renderer (LAYER_ORDER z=3). defaultZ 42 / 41
    // sorts them just below the L/R behind-body accessories so the
    // ordering reads "body > LR-behind > 1-2-behind > tails > wings".
    { key: "back_accessory_1",     label: "Back Accessory 1",      defaultZ: 42, layer: "back"  },
    { key: "back_accessory_2",     label: "Back Accessory 2",      defaultZ: 41, layer: "back"  },
    { key: "left_leg",             label: "Left Leg",              defaultZ: 49, layer: "back"  },
    { key: "right_leg",            label: "Right Leg",             defaultZ: 48, layer: "back"  },
    { key: "tail",                 label: "Tail One",              defaultZ: 47, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
    { key: "tail_2",               label: "Tail Two",              defaultZ: 46, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
    { key: "tail_3",               label: "Tail Three",            defaultZ: 45, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
  ]},

  // ── Head-anchored wings (per head, behind back hair) ───────────────────
  { group: "Head Wings", parts: [
    ...headWingPair(1, 25),
    ...headWingPair(2, 23),
    ...headWingPair(3, 21),
  ], collapsed: true },

  // ── Body wing sets (animate in sync within a set, slightly off between sets)
  // left_wing/right_wing are kept as Set 1 for back-compat with existing pets.
  { group: "Wings",      parts: [
    { key: "left_wing",       label: "Wing Set 1 Left",  defaultZ: 15, layer: "back" },
    { key: "right_wing",      label: "Wing Set 1 Right", defaultZ: 14, layer: "back" },
    { key: "wing_set2_left",  label: "Wing Set 2 Left",  defaultZ: 13, layer: "back" },
    { key: "wing_set2_right", label: "Wing Set 2 Right", defaultZ: 12, layer: "back" },
  ]},
];

// Side facing:
// Head section is structurally IDENTICAL to the front-facing list (Head One/
// Two/Three each with hair / eyes / mouth / accessories / head / ears /
// back hair) so multi-headed pets work the same in side view.
//
// Body section is its own ordered list of front-layer + Body + back-layer +
// tails. The order below is the order shown in the editor's sidebar panel.
// Z-indices place the front layer above the body, the back layer behind the
// body, and tails behind everything. All four wings (front_wing, front_wing_2,
// back_wing, back_wing_2) animate the same way as the existing back wing flap.
const SIDE_PART_GROUPS: { group: string; parts: PartDef[]; collapsed?: boolean }[] = [
  // ── Heads — mirror front-facing exactly so side art can support multi-head pets
  { group: "Head One",   parts: headFrontParts(1, 100, 35) },
  { group: "Head Two",   parts: headFrontParts(2, 85,  34), collapsed: true },
  { group: "Head Three", parts: headFrontParts(3, 70,  33), collapsed: true },

  // ── Body Parts — listed top-to-bottom in visual stacking order so the
  //    sidebar mirrors what gets rendered (front-most first, back-most
  //    last). Body sits between Front Wing 2 and the back-side layers.
  { group: "Body Parts", parts: [
    { key: "front_shoulder",    label: "Front Shoulder",    defaultZ: 58, layer: "front" },
    { key: "front_arm",         label: "Front Arm",         defaultZ: 57, layer: "front" },
    { key: "front_leg",         label: "Front Leg",         defaultZ: 56, layer: "front" },
    { key: "front_accessory_1", label: "Front Accessory 1", defaultZ: 55, layer: "front" },
    { key: "front_accessory_2", label: "Front Accessory 2", defaultZ: 54, layer: "front" },
    { key: "front_wing",        label: "Front Wing 1",      defaultZ: 53, layer: "front" },
    { key: "front_wing_2",      label: "Front Wing 2",      defaultZ: 52, layer: "front" },
    { key: "body",              label: "Body",              defaultZ: 50, layer: "body"  },
    { key: "back_shoulder",     label: "Back Shoulder",     defaultZ: 47, layer: "back"  },
    { key: "back_arm",          label: "Back Arm",          defaultZ: 46, layer: "back"  },
    { key: "back_leg",          label: "Back Leg",          defaultZ: 45, layer: "back"  },
    { key: "back_accessory_1",  label: "Back Accessory 1",  defaultZ: 44, layer: "back"  },
    { key: "back_accessory_2",  label: "Back Accessory 2",  defaultZ: 43, layer: "back"  },
    { key: "back_wing",         label: "Back Wing 1",       defaultZ: 42, layer: "back"  },
    { key: "back_wing_2",       label: "Back Wing 2",       defaultZ: 41, layer: "back"  },
    // Side view also exposes the standalone Left / Right wing parts so
    // pets that animate as a flapping pair (rotation around the body)
    // can use the same wing artwork on both views without forcing
    // builders to repurpose Back Wing 1/2 for that role. Keeping the
    // back layer + matching defaultZ slot so they sit just behind
    // back_wing_2 and above the tails.
    { key: "left_wing",         label: "Left Wing",         defaultZ: 40, layer: "back"  },
    { key: "right_wing",        label: "Right Wing",        defaultZ: 40, layer: "back"  },
    { key: "tail",              label: "Tail 1",            defaultZ: 39, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
    { key: "tail_2",            label: "Tail 2",            defaultZ: 38, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
    { key: "tail_3",            label: "Tail 3",            defaultZ: 37, layer: "back",  defaultPivotX: 50, defaultPivotY: 0 },
  ]},

  // ── Head-anchored wings (per head, same as front-facing) ───────────────
  { group: "Head Wings", parts: [
    ...headWingPair(1, 25),
    ...headWingPair(2, 23),
    ...headWingPair(3, 21),
  ], collapsed: true },
];

const ALL_PART_DEFS: PartDef[] = [
  ...FRONT_PART_GROUPS.flatMap(g => g.parts),
  ...SIDE_PART_GROUPS.flatMap(g => g.parts),
].filter((v, i, a) => a.findIndex(x => x.key === v.key) === i);

const CANVAS_SIZE = 1000;

export default function PetDatabasePanel({
  initialTemplateId,
  onSelectedTemplateChange,
  onFacingModeChange,
  testMode = false,
  templateNameFilter,
}: {
  initialTemplateId?: string | null;
  onSelectedTemplateChange?: (id: string | null) => void;
  onFacingModeChange?: (mode: "front" | "side") => void;
  /** When true, this panel is the Test Animator sandbox: hide the "Save
   *  Front/Side View" assemble flow and the assembled preview, and create
   *  any new pets with isTest=true so they don't pollute live game data. */
  testMode?: boolean;
  /** Optional list of template names to keep visible in the picker. When
   *  set, every other (non-test) template is hidden. Test-mode also adds
   *  any isTest=true pets on top of this filter. */
  templateNameFilter?: string[];
} = {}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);

  // Notify parent whenever the user picks (or clears) a template, so the
  // Test-Animator save preview can render whatever the admin is editing.
  useEffect(() => {
    onSelectedTemplateChange?.(selectedTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [uploadPartType, setUploadPartType] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [nudgeStep, setNudgeStep] = useState<1 | 5 | 10>(1);
  const [facingMode, setFacingMode] = useState<"front" | "side">("front");

  // Notify parent whenever the facing mode toggles (front ↔ side) so the
  // Test-Animator save preview can match.
  useEffect(() => {
    onFacingModeChange?.(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);
  // Per-group expand/collapse state. Undefined = use the group's default
  // (defined by `collapsed: true` on the group definition).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [sideFacingDir, setSideFacingDir] = useState<"left" | "right">("left");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ partId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const pixelCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Derive the DB view value from the facing mode toggle
  const activeView = facingMode === "front" ? "front" : "back";

  // We keep the queryKey base identical regardless of testMode so invalidations
  // elsewhere in this file (and in other panels) still hit the cache. Test mode
  // just swaps in a custom fetcher that adds ?includeTest=true.
  const { data: templatesRaw = [], isLoading } = useQuery<PetTemplate[]>({
    queryKey: ["/api/admin/pet-templates", testMode ? "with-test" : "no-test"],
    queryFn: async () => {
      const url = testMode
        ? "/api/admin/pet-templates?includeTest=true"
        : "/api/admin/pet-templates";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pet templates");
      return res.json();
    },
  });

  // Apply optional name-based filter (used by Test Animator to show only
  // "The Paradox" alongside any sandbox pets). isTest pets always pass.
  const templates = templateNameFilter && templateNameFilter.length > 0
    ? templatesRaw.filter(t => (t as any).isTest === true || templateNameFilter.includes(t.name))
    : templatesRaw;

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

  // Sync facingMode from the loaded template's facing field or existing parts
  useEffect(() => {
    if (!templateDetail) return;
    if (templateDetail.facing === "back") {
      setFacingMode("side");
    } else if (templateDetail.facing === "front") {
      setFacingMode("front");
    } else {
      // Legacy: detect from parts
      const hasBackParts = (templateDetail.parts || []).some(p => p.view === "back");
      setFacingMode(hasBackParts ? "side" : "front");
    }
  }, [templateDetail?.id, templateDetail?.facing]);

  const viewParts = (templateDetail?.parts || []).filter(p => p.view === activeView).sort((a, b) => a.zIndex - b.zIndex);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/admin/pet-templates", { name, isTest: testMode });
      return res.json();
    },
    onSuccess: async (data: PetTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      setShowCreateModal(false);
      setNewPetName("");
      setSelectedTemplateId(data.id);
      toast({ title: "Created", description: testMode ? "Test pet created (sandbox only)" : "Pet template created" });
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

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-templates/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      setShowRenameModal(false);
      setRenameName("");
      toast({ title: "Renamed", description: "Template name updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to rename", variant: "destructive" });
    },
  });

  const canFlyMutation = useMutation({
    mutationFn: async ({ id, canFly }: { id: string; canFly: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-templates/${id}`, { canFly });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update fly setting", variant: "destructive" });
    },
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: { templateId: string; partType: string; view: string; imageData: string; zIndex: number; pivotX?: number; pivotY?: number; posX?: number; posY?: number; width?: number; height?: number }) => {
      const res = await apiRequest("POST", `/api/admin/pet-templates/${data.templateId}/part`, {
        partType: data.partType,
        view: data.view,
        imageData: data.imageData,
        posX: data.posX ?? Math.round(CANVAS_SIZE / 2 - 150),
        posY: data.posY ?? Math.round(CANVAS_SIZE / 2 - 150),
        width: data.width ?? 300,
        height: data.height ?? 300,
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
    onSuccess: async () => {
      // Save the facing direction to the template
      await apiRequest("PATCH", `/api/admin/pet-templates/${selectedTemplateId}`, { facing: activeView });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      toast({ title: "Saved!", description: `${facingMode === "front" ? "Front" : "Side"} view assembled and saved` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assemble", variant: "destructive" });
    },
  });

  const loadImageToCache = useCallback((imageUrl: string): Promise<HTMLCanvasElement> => {
    const cached = pixelCacheRef.current.get(imageUrl);
    if (cached) return Promise.resolve(cached);
    return new Promise<HTMLCanvasElement>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 100;
        canvas.height = img.naturalHeight || 100;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        pixelCacheRef.current.set(imageUrl, canvas);
        resolve(canvas);
      };
      img.onerror = () => {
        const empty = document.createElement("canvas");
        pixelCacheRef.current.set(imageUrl, empty);
        resolve(empty);
      };
      img.src = imageUrl;
    });
  }, []);

  // Preload all visible part images into the pixel cache so hit-testing is synchronous
  useEffect(() => {
    viewParts.forEach(p => { if (p.imageUrl) loadImageToCache(p.imageUrl); });
  }, [viewParts, loadImageToCache]);

  const isOpaqueAt = useCallback(async (imageUrl: string, relX: number, relY: number): Promise<boolean> => {
    const cv = await loadImageToCache(imageUrl);
    const ctx = cv.getContext("2d");
    if (!ctx || cv.width === 0 || cv.height === 0) return true;
    const px = Math.max(0, Math.min(Math.floor(relX * cv.width), cv.width - 1));
    const py = Math.max(0, Math.min(Math.floor(relY * cv.height), cv.height - 1));
    const data = ctx.getImageData(px, py, 1, 1).data;
    return data[3] > 10;
  }, [loadImageToCache]);

  // Synchronous version — when the per-pixel cache is ready, returns
  // true only for opaque pixels. When the cache is NOT yet ready
  // (image still loading on first click after template open), falls
  // back to the alpha BOUNDING BOX from getAlphaBoundsSync — so a
  // click that lands inside a part's PNG box but OUTSIDE the visible
  // pixels' bbox correctly reports false. This prevents the
  // "clicking the leg selects the eyes" bug, where eyes are stored
  // as a near-full-canvas PNG with a tiny visible region in the
  // centre and were stealing every click on parts beneath them
  // before their pixel data finished decoding.
  const isOpaqueSyncAt = useCallback((imageUrl: string, relX: number, relY: number): boolean => {
    const cv = pixelCacheRef.current.get(imageUrl);
    if (cv) {
      const ctx = cv.getContext("2d");
      if (!ctx || cv.width === 0 || cv.height === 0) return false;
      const px = Math.max(0, Math.min(Math.floor(relX * cv.width), cv.width - 1));
      const py = Math.max(0, Math.min(Math.floor(relY * cv.height), cv.height - 1));
      const data = ctx.getImageData(px, py, 1, 1).data;
      return data[3] > 10;
    }
    // Cache miss — use the visible-pixels bbox as a coarser but
    // still-useful hit test. relX/relY are the click coords in the
    // part's full-PNG 0..1 space, and alphaBounds returns the
    // visible region in the same space.
    const ab = getAlphaBoundsSync(imageUrl) ?? FULL_BOUNDS;
    return (
      relX >= ab.left &&
      relX <= ab.left + ab.width &&
      relY >= ab.top &&
      relY <= ab.top + ab.height
    );
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const scale = rect.width / CANVAS_SIZE;
    const canvasX = (e.clientX - rect.left) / scale;
    const canvasY = (e.clientY - rect.top) / scale;
    // Only respond to clicks within the canvas bounds
    if (canvasX < 0 || canvasX > CANVAS_SIZE || canvasY < 0 || canvasY > CANVAS_SIZE) return;
    // Find topmost opaque part using sync cache
    const sorted = [...viewParts].sort((a, b) => b.zIndex - a.zIndex);
    for (const part of sorted) {
      if (canvasX < part.posX || canvasX > part.posX + part.width ||
          canvasY < part.posY || canvasY > part.posY + part.height) continue;
      const relX = (canvasX - part.posX) / part.width;
      const relY = (canvasY - part.posY) / part.height;
      if (!isOpaqueSyncAt(part.imageUrl, relX, relY)) continue;
      // Found an opaque part — start drag
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      didDrag.current = false;
      dragRef.current = {
        partId: part.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: part.posX,
        origY: part.posY,
      };
      setSelectedPartId(part.id);
      return;
    }
    // Clicked on empty canvas space — deselect
    setSelectedPartId(null);
  }, [viewParts, isOpaqueSyncAt]);

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

  const nudge = useCallback((dx: number, dy: number) => {
    const part = viewParts.find(p => p.id === selectedPartId);
    if (!part) return;
    updatePartMutation.mutate({ partId: part.id, posX: part.posX + dx, posY: part.posY + dy });
  }, [selectedPartId, viewParts, updatePartMutation]);

  const resizePart = useCallback((delta: number) => {
    const part = viewParts.find(p => p.id === selectedPartId);
    if (!part) return;
    const newW = Math.max(4, part.width + delta);
    const newH = Math.max(4, part.height + delta);
    updatePartMutation.mutate({ partId: part.id, width: newW, height: newH });
  }, [selectedPartId, viewParts, updatePartMutation]);

  const selectedPart = viewParts.find(p => p.id === selectedPartId);

  // Has parts in the OTHER view (the one not currently active)
  const otherView = activeView === "front" ? "back" : "front";
  const hasOtherViewParts = (templateDetail?.parts || []).some(p => p.view === otherView);

  if (selectedTemplateId && templateDetail) {
    const linkedPet = getLinkedShopPet(templateDetail.id);
    const viewLabel = facingMode === "front" ? "Front View" : sideFacingDir === "left" ? "Side View (Left)" : "Side View (Right)";

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
            data-testid="button-rename-pet-template"
            onClick={() => { setRenameName(templateDetail.name); setShowRenameModal(true); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.25)", cursor: "pointer", color: "#a89878" }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
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
          <span className="px-4 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider" style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.6)", color: "#f0c040" }}>
            {viewLabel}
          </span>
        </div>

        {/* Canvas — overflow visible so parts can extend beyond bounds.
            All pointer handling is on the canvas element itself so parts
            that visually extend outside cannot block buttons below. */}
        <div
          ref={canvasRef}
          className="relative mx-auto rounded-lg"
          style={{
            width: "100%",
            aspectRatio: "1",
            overflow: "visible",
            background: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px",
            border: "2px dashed rgba(240,192,64,0.25)",
            touchAction: "none",
            cursor: selectedPartId ? "grab" : "default",
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
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
                  pointerEvents: "none",
                  outline: isSelected ? "2px solid rgba(240,192,64,0.8)" : "none",
                  outlineOffset: "2px",
                  borderRadius: "4px",
                }}
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
                    style={{ background: "rgba(240,192,64,0.9)", color: "#1a0a00", pointerEvents: "none" }}
                  >
                    {part.partType}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Nudge D-pad — shown directly under canvas when a part is selected */}
        {selectedPart && (
          <div
            className="flex flex-col gap-2 px-3 py-3 rounded-lg"
            style={{ background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.2)" }}
          >
            {/* Step size selector */}
            <div className="flex items-center gap-1.5">
              <span className="font-fantasy text-[8px] tracking-wider" style={{ color: "#6a5840" }}>Step:</span>
              {([1, 5, 10] as const).map(s => (
                <button
                  key={s}
                  data-testid={`button-nudge-step-${s}`}
                  onClick={() => setNudgeStep(s)}
                  className="rounded-md font-fantasy text-[9px] tracking-wider transition-all active:scale-95"
                  style={{
                    padding: "2px 8px",
                    background: nudgeStep === s ? "rgba(240,192,64,0.25)" : "rgba(0,0,0,0.3)",
                    border: nudgeStep === s ? "1px solid rgba(240,192,64,0.6)" : "1px solid rgba(240,192,64,0.15)",
                    color: nudgeStep === s ? "#f0c040" : "#6a5840",
                    cursor: "pointer",
                  }}
                >{s}px</button>
              ))}
            </div>

            <div className="flex gap-4 items-center justify-center">
              {/* D-pad */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 36px)", gap: 4 }}>
                <div />
                <button
                  data-testid="button-nudge-up"
                  onPointerDown={e => { e.stopPropagation(); nudge(0, -nudgeStep); }}
                  className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ height: 36, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                ><ChevronUp className="w-4 h-4" /></button>
                <div />

                <button
                  data-testid="button-nudge-left"
                  onPointerDown={e => { e.stopPropagation(); nudge(-nudgeStep, 0); }}
                  className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ height: 36, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                ><ChevronLeft className="w-4 h-4" /></button>
                <div className="flex flex-col items-center justify-center" style={{ height: 36 }}>
                  <span className="font-fantasy text-[7px] leading-tight" style={{ color: "#a89878" }}>{selectedPart.posX}</span>
                  <span className="font-fantasy text-[7px] leading-tight" style={{ color: "#6a5840" }}>x,y</span>
                  <span className="font-fantasy text-[7px] leading-tight" style={{ color: "#a89878" }}>{selectedPart.posY}</span>
                </div>
                <button
                  data-testid="button-nudge-right"
                  onPointerDown={e => { e.stopPropagation(); nudge(nudgeStep, 0); }}
                  className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ height: 36, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                ><ChevronRight className="w-4 h-4" /></button>

                <div />
                <button
                  data-testid="button-nudge-down"
                  onPointerDown={e => { e.stopPropagation(); nudge(0, nudgeStep); }}
                  className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ height: 36, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                ><ChevronDown className="w-4 h-4" /></button>
                <div />
              </div>

              {/* Size +/- column */}
              <div className="flex flex-col items-center gap-1.5">
                <span className="font-fantasy text-[8px] tracking-wider" style={{ color: "#6a5840" }}>Size</span>
                <button
                  data-testid="button-size-increase"
                  onPointerDown={e => { e.stopPropagation(); resizePart(nudgeStep); }}
                  className="flex items-center justify-center rounded-lg font-bold transition-all active:scale-90"
                  style={{ width: 36, height: 36, fontSize: 20, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                >+</button>
                <span className="font-fantasy text-[7px]" style={{ color: "#a89878" }}>{selectedPart.width}×{selectedPart.height}</span>
                <button
                  data-testid="button-size-decrease"
                  onPointerDown={e => { e.stopPropagation(); resizePart(-nudgeStep); }}
                  className="flex items-center justify-center rounded-lg font-bold transition-all active:scale-90"
                  style={{ width: 36, height: 36, fontSize: 20, background: "rgba(240,192,64,0.12)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", cursor: "pointer" }}
                >−</button>
              </div>
            </div>
          </div>
        )}

        {/* Facing direction selector — mutually exclusive toggle */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(240,192,64,0.25)" }}>
          <div className="flex">
            <button
              data-testid="button-facing-front"
              onClick={() => {
                if (facingMode === "side" && viewParts.length > 0) {
                  if (!confirm("Switch to Front Facing? Parts you add will be saved to the front view.")) return;
                }
                setFacingMode("front");
                setSelectedPartId(null);
              }}
              className="flex-1 py-2 font-fantasy text-[10px] tracking-wider transition-colors"
              style={{
                background: facingMode === "front" ? "rgba(240,192,64,0.2)" : "rgba(0,0,0,0.2)",
                color: facingMode === "front" ? "#f0c040" : "#6a5840",
                borderRight: "1px solid rgba(240,192,64,0.2)",
              }}
            >
              Front Facing
            </button>
            <button
              data-testid="button-facing-side"
              onClick={() => {
                if (facingMode === "front" && viewParts.length > 0) {
                  if (!confirm("Switch to Side Facing? Parts you add will be saved to the side view.")) return;
                }
                setFacingMode("side");
                setSelectedPartId(null);
              }}
              className="flex-1 py-2 font-fantasy text-[10px] tracking-wider transition-colors"
              style={{
                background: facingMode === "side" ? "rgba(240,192,64,0.2)" : "rgba(0,0,0,0.2)",
                color: facingMode === "side" ? "#f0c040" : "#6a5840",
              }}
            >
              Side Facing
            </button>
          </div>
          {facingMode === "side" && (
            <div className="flex border-t" style={{ borderColor: "rgba(240,192,64,0.15)" }}>
              <button
                data-testid="button-side-left"
                onClick={() => setSideFacingDir("left")}
                className="flex-1 py-1.5 font-fantasy text-[9px] tracking-wider transition-colors"
                style={{
                  background: sideFacingDir === "left" ? "rgba(127,255,212,0.12)" : "transparent",
                  color: sideFacingDir === "left" ? "#7fffd4" : "#6a5840",
                  borderRight: "1px solid rgba(240,192,64,0.15)",
                }}
              >
                ← Left Facing
              </button>
              <button
                data-testid="button-side-right"
                onClick={() => setSideFacingDir("right")}
                className="flex-1 py-1.5 font-fantasy text-[9px] tracking-wider transition-colors"
                style={{
                  background: sideFacingDir === "right" ? "rgba(127,255,212,0.12)" : "transparent",
                  color: sideFacingDir === "right" ? "#7fffd4" : "#6a5840",
                }}
              >
                Right Facing →
              </button>
            </div>
          )}
          {hasOtherViewParts && (
            <div className="px-2 py-1.5 border-t" style={{ borderColor: "rgba(240,192,64,0.15)", background: "rgba(240,160,32,0.06)" }}>
              <p className="font-fantasy text-[8px] tracking-wider text-center" style={{ color: "#a89878" }}>
                Both front &amp; side parts exist — only the saved view is used in-game
              </p>
            </div>
          )}
        </div>

        {/* Part type groups — long lists (Heads 2/3, Head Wings) collapse by
            default so admins editing single-headed pets see a tidy panel. */}
        <div className="flex flex-col gap-2">
          {(facingMode === "front" ? FRONT_PART_GROUPS : SIDE_PART_GROUPS).map(group => {
            const isOpen = openGroups[group.group] ?? !group.collapsed;
            // Show a count badge when collapsed so admins know if anything is
            // already uploaded inside the hidden section.
            const filledCount = group.parts.reduce(
              (n, pt) => n + (viewParts.some(p => p.partType === pt.key) ? 1 : 0),
              0,
            );
            return (
            <div key={group.group}>
              <div className="flex items-center gap-2 mb-1">
                <button
                  data-testid={`toggle-group-${group.group.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => setOpenGroups(prev => ({ ...prev, [group.group]: !isOpen }))}
                  className="flex items-center gap-1.5 pl-0.5 pr-1 py-0.5 rounded font-fantasy text-[8px] text-[#6a5840] tracking-widest uppercase transition-colors hover:text-[#a89878]"
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <span style={{ color: "#a89878" }}>{isOpen ? "▾" : "▸"}</span>
                  <span>{group.group}</span>
                  {!isOpen && filledCount > 0 && (
                    <span className="font-fantasy text-[7px] px-1 rounded" style={{ background: "rgba(127,255,212,0.15)", color: "#7fffd4" }}>
                      {filledCount}
                    </span>
                  )}
                </button>
              </div>
              {isOpen && (
              <div className="flex flex-col gap-1.5">
                {group.parts.map(pt => {
                  const matchingParts = viewParts.filter(p => p.partType === pt.key);
                  const exists = matchingParts.length > 0;
                  return (
                    <div key={pt.key} className="flex flex-wrap items-center gap-1">
                      {/* Upload / add button */}
                      <div className="flex items-stretch rounded overflow-hidden" style={{ border: `1px solid ${exists ? "rgba(127,255,212,0.3)" : "rgba(240,192,64,0.2)"}` }}>
                        <button
                          data-testid={`button-upload-${pt.key}`}
                          onClick={() => setUploadPartType(pt.key)}
                          className="px-2 py-1 font-fantasy text-[9px] tracking-wider transition-transform active:scale-95 flex items-center gap-1"
                          style={{
                            background: exists ? "rgba(127,255,212,0.12)" : "rgba(240,192,64,0.08)",
                            color: exists ? "#7fffd4" : "#f0c040",
                            cursor: "pointer",
                            border: "none",
                          }}
                        >
                          {exists ? `✓ ${pt.label}` : `+ ${pt.label}`}
                          {pt.animOnly && <span style={{ color: "#a89878", fontSize: "7px" }}>anim</span>}
                          {matchingParts.length > 1 && (
                            <span style={{ color: "#a89878", fontSize: "7px" }}>×{matchingParts.length}</span>
                          )}
                        </button>
                      </div>
                      {/* One delete button per uploaded part */}
                      {matchingParts.map((mp, idx) => (
                        <button
                          key={mp.id}
                          data-testid={`button-delete-part-${pt.key}-${idx}`}
                          onClick={() => deletePartMutation.mutate(mp.id)}
                          className="flex items-center gap-1 px-1.5 py-1 rounded font-fantasy text-[8px] tracking-wider transition-all active:scale-95"
                          style={{
                            background: "rgba(220,38,38,0.18)",
                            border: "1px solid rgba(220,38,38,0.35)",
                            color: "#fca5a5",
                            cursor: "pointer",
                          }}
                          title={`Delete ${pt.label} #${idx + 1}`}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          {matchingParts.length > 1 && <span>#{idx + 1}</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}
        </div>

        {selectedPart && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.2)" }}
          >
            <div className="flex items-center gap-2">
              <span className="font-fantasy text-[#f0c040] text-xs tracking-wider capitalize">{selectedPart.partType}</span>
              {(() => {
                const ptInfo = ALL_PART_DEFS.find(p => p.key === selectedPart.partType);
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
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(220,38,38,0.3)", cursor: "pointer", color: "#fca5a5" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Single Can-Fly toggle, sitting just above the Save button so it's
            always visible regardless of which part group is expanded. */}
        <button
          data-testid="checkbox-can-fly"
          onClick={() => canFlyMutation.mutate({ id: templateDetail.id, canFly: !templateDetail.canFly })}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-fantasy text-[11px] tracking-wider transition-all active:scale-95"
          style={{
            background: templateDetail.canFly ? "rgba(127,255,212,0.18)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${templateDetail.canFly ? "rgba(127,255,212,0.6)" : "rgba(106,88,64,0.4)"}`,
            color: templateDetail.canFly ? "#7fffd4" : "#a89878",
            cursor: "pointer",
            boxShadow: templateDetail.canFly ? "0 0 10px rgba(127,255,212,0.25)" : "none",
          }}
        >
          <span style={{ fontSize: 14 }}>{templateDetail.canFly ? "✦" : "○"}</span>
          {templateDetail.canFly ? "Can Fly — On" : "Can Fly — Off"}
        </button>

        {!testMode && (
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
              {assembleMutation.isPending ? "Assembling..." : `Save ${facingMode === "front" ? "Front" : "Side"} View`}
            </button>
          </div>
        )}

        {!testMode && (templateDetail.frontAssembled || templateDetail.backAssembled) && (
          <div className="mt-1">
            <p className="font-fantasy text-[9px] text-[#a89878] tracking-wider mb-2 text-center">Assembled Preview</p>
            <div className="flex justify-center gap-4">
              {templateDetail.frontAssembled && (
                <div className="text-center">
                  <img
                    src={templateDetail.frontAssembled}
                    alt="Front"
                    className="w-28 h-28 object-contain rounded-lg"
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
                    alt="Side"
                    className="w-28 h-28 object-contain rounded-lg"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(127,255,212,0.2)" }}
                    data-testid="preview-back-assembled"
                  />
                  <span className="font-fantasy text-[8px] text-[#7fbfb0] tracking-wider">Side</span>
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
                  Upload {uploadPartType} ({facingMode === "front" ? "Front" : "Side"})
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
                  const isBackFull = uploadPartType === "back_full";
                  const ptConfig = ALL_PART_DEFS.find(p => p.key === uploadPartType);
                  const defaultZ = isBackFull ? 0 : (ptConfig?.defaultZ || 0);

                  // Read natural image dimensions and use them directly (capped to canvas size)
                  let naturalW = CANVAS_SIZE;
                  let naturalH = CANVAS_SIZE;
                  try {
                    const img = new window.Image();
                    img.src = dataUrl;
                    await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); });
                    naturalW = Math.min(img.naturalWidth || CANVAS_SIZE, CANVAS_SIZE);
                    naturalH = Math.min(img.naturalHeight || CANVAS_SIZE, CANVAS_SIZE);
                  } catch {}

                  addPartMutation.mutate({
                    templateId: selectedTemplateId!,
                    partType: uploadPartType!,
                    view: isBackFull ? "back" : activeView,
                    imageData: dataUrl,
                    zIndex: defaultZ,
                    pivotX: isBackFull ? 50 : ((ptConfig as any)?.defaultPivotX ?? 50),
                    pivotY: isBackFull ? 50 : ((ptConfig as any)?.defaultPivotY ?? 50),
                    posX: 0,
                    posY: 0,
                    width: naturalW,
                    height: naturalH,
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

        {showRenameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowRenameModal(false)} />
            <div
              className="relative z-10 w-[85%] max-w-sm rounded-lg p-5"
              style={{
                background: "linear-gradient(135deg, rgba(30,15,5,0.97) 0%, rgba(60,35,10,0.97) 100%)",
                border: "1px solid rgba(212,160,23,0.5)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
              }}
            >
              <h4 className="font-fantasy text-[#f0c040] text-center text-sm tracking-widest mb-4">Rename Template</h4>
              <div className="mb-4">
                <label className="font-fantasy text-[#a89878] text-[10px] tracking-wider block mb-1">New Name</label>
                <input
                  data-testid="input-rename-pet-template"
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="Enter new name..."
                  className="w-full px-3 py-2 rounded-md font-fantasy text-sm outline-none"
                  style={{ background: "rgba(242,232,208,0.9)", border: "1px solid #8b5e3c", color: "#2a1a0a" }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRenameModal(false)}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider"
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,160,23,0.2)", color: "#a89878", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  data-testid="button-confirm-rename-pet"
                  onClick={() => {
                    if (renameName.trim() && selectedTemplateId) {
                      renameMutation.mutate({ id: selectedTemplateId, name: renameName.trim() });
                    }
                  }}
                  disabled={renameMutation.isPending || !renameName.trim()}
                  className="flex-1 py-2 rounded-md font-fantasy text-xs tracking-wider disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(127,255,212,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                  }}
                >
                  {renameMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
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
            const isSide = t.facing === "back";
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
                    {(isSide ? t.backAssembled : t.frontAssembled) ? (
                      <img src={(isSide ? t.backAssembled : t.frontAssembled) || ""} alt={t.name} className="w-full h-full object-contain" />
                    ) : t.frontAssembled ? (
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
                      <span className="font-fantasy text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(127,200,255,0.1)", color: "#7fbfff", border: "1px solid rgba(127,200,255,0.2)" }}>
                        Side ✓
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
            <div className="mb-3">
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
                onClick={() => { setShowCreateModal(false); }}
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
