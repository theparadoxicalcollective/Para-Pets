import AdornmentArtwork from "./AdornmentArtwork";
import { ADORNMENT_ANIMATIONS, ADORNMENT_ANIMATION_LABELS, ADORNMENT_MOTION_CSS, type AdornmentAnimation } from "@shared/adornmentAnimation";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { basePetPartType } from "@/lib/petPartConfig";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { readFileAsDataUrl } from "@/lib/utils";
import { Plus, Trash2, X, ArrowLeft, Save, Layers, Link2, Pencil, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, Search, RotateCcw, RotateCw } from "lucide-react";
import { renderPetGif, type GifAnimation } from "@/lib/petGif";
import { getAlphaBoundsSync, FULL_BOUNDS } from "@/lib/alphaBounds";
import { PET_ANIMATION_PROFILES, type PetAnimationProfile, normalizeAnimationProfile } from "@/lib/petAnimationConfig";
import { COSTUME_MAX_PLACEMENT_INSTANCES, getWingReplacementPartTypes, type CostumePlacement } from "@shared/costumeFeature";
import {
  getCostumePlacementAnchorPoint,
  detachCostumePlacement,
  changeCostumePivot,
  getCostumeCanvasPosition,
  getCostumeDragOffset,
  getDraggedCostumePosition,
  resizeCostumePlacement,
} from "@/lib/costumePlacement";
import {
  clampPetPartRotation,
  getDraggedPetPartPosition,
  getPetPartDragOffset,
  getUnrotatedPetPartPoint,
  resizePetPartTransform,
} from "@/lib/petPartPlacement";

interface PetTemplate {
  id: string;
  name: string;
  facing?: string | null;
  frontAssembledUrl: string | null;
  backAssembledUrl: string | null;
  hasFrontAssembled?: boolean;
  hasBackAssembled?: boolean;
  sleepingImageUrl: string | null;
  canFly: boolean;
  idleStyle?: PetAnimationProfile | null;
  createdAt: string;
}

interface PetTemplatePart {
  id: string;
  templateId: string;
  form: "base" | "evolution";
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
  rotation: number;
}

interface PetTemplateWithParts extends PetTemplate {
  parts: PetTemplatePart[];
  evolutionParts: PetTemplatePart[];
}

interface CostumeItem { id: string; name: string; imageUrl: string | null; adornmentSlot?: string | null; adornmentEffect?: string | null; }
interface CostumeDefinition { shopItemId: string; templateId: string; placements: CostumePlacement[]; }

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
    { key: k("above_head"),   label: "Above Head",       defaultZ: baseZ + 13, layer: "front" },
    { key: k("hair_center"),  label: "Hair Center",      defaultZ: baseZ + 12, layer: "front" },
    { key: k("hair_left"),    label: "Hair Piece Left",  defaultZ: baseZ + 11, layer: "front" },
    { key: k("hair_right"),   label: "Hair Piece Right", defaultZ: baseZ + 10, layer: "front" },
    { key: k("eyes"),         label: "Eyes (Open)",      defaultZ: baseZ + 9,  layer: "front" },
    { key: k("eyes_closed"),  label: "Eyes (Closed)",    defaultZ: baseZ + 8,  layer: "front", animOnly: true },
    { key: k("mouth_closed"), label: "Mouth (Closed)",   defaultZ: baseZ + 7,  layer: "front" },
    { key: k("mouth"),        label: "Mouth (Open)",     defaultZ: baseZ + 6,  layer: "front", animOnly: true },
    { key: k("accessory_1"),  label: "Accessory 1",      defaultZ: baseZ + 5,  layer: "front" },
    { key: k("accessory_2"),  label: "Accessory 2",      defaultZ: baseZ + 4,  layer: "front" },
    { key: k("head"),         label: "Head",             defaultZ: baseZ + 3,  layer: "front" },
    { key: k("left_ear"),     label: "Left Ear",         defaultZ: baseZ + 2,  layer: "front" },
    { key: k("right_ear"),    label: "Right Ear",        defaultZ: baseZ + 1,  layer: "front" },
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
    // Hands — front-facing only, sit just above neck (defaultZ 60) so
    // they overlay the neck/chest area. LAYER_ORDER z=7 (above neck=6,
    // below head=10). Use for paw/claw/hand parts that emerge from arms.
    { key: "left_hand",            label: "Left Hand",             defaultZ: 62, layer: "front" },
    { key: "right_hand",           label: "Right Hand",            defaultZ: 61, layer: "front" },
    { key: "body",                 label: "Body",                  defaultZ: 50, layer: "body"  },
    // Body 2 — a second body overlay that sits BEHIND the primary body
    // silhouette (LAYER_ORDER z=4.5) but shares the same body-breath
    // animation. Use for underlays, base colours, or pattern layers.
    { key: "body_2",               label: "Body 2",                defaultZ: 49, layer: "body"  },
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
    { key: "body_2",            label: "Body 2",            defaultZ: 49, layer: "body"  },
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
type EditorTab = "parts" | "evolution" | "costume";

function EditorTabs({ active, onChange }: { active: EditorTab; onChange: (tab: EditorTab) => void }) {
  return <>
    <nav aria-label="Pet editor" className="flex flex-wrap gap-2">
      {(["parts", "evolution", "costume"] as const).map(tab => <button key={tab} data-testid={`tab-pet-editor-${tab}`} onClick={() => onChange(tab)} className="rounded-md px-3 py-2 font-fantasy text-[10px] tracking-wider" style={{ background: active === tab ? "rgba(240,192,64,.24)" : "rgba(0,0,0,.3)", border: "1px solid rgba(240,192,64,.3)", color: active === tab ? "#f0c040" : "#a89878" }}>{tab === "costume" ? "ADORNMENTS" : tab.toUpperCase()}</button>)}
    </nav>
  </>;
}

export default function PetDatabasePanel({
  initialTemplateId,
  onSelectedTemplateChange,
  onFacingModeChange,
  onCostumeDirtyChange,
  testMode = false,
  templateNameFilter,
}: {
  initialTemplateId?: string | null;
  onSelectedTemplateChange?: (id: string | null) => void;
  onFacingModeChange?: (mode: "front" | "side") => void;
  onCostumeDirtyChange?: (dirty: boolean) => void;
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
  useEffect(() => { setSelectedCostumeId(null); setSelectedCostumeInstance(1); setCostumeArtworkForm("base"); }, [selectedTemplateId]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [uploadPartType, setUploadPartType] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [partDraft, setPartDraft] = useState<(Pick<PetTemplatePart, "posX" | "posY" | "width" | "height" | "pivotX" | "pivotY" | "rotation"> & { partId: string }) | null>(null);
  const [draggingPartId, setDraggingPartId] = useState<string | null>(null);
  const partDraftRef = useRef<typeof partDraft>(null);
  const partDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [nudgeStep, setNudgeStep] = useState<1 | 5 | 10>(1);
  const [facingMode, setFacingMode] = useState<"front" | "side">("front");
  const [gifExporting, setGifExporting] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [gifAnim, setGifAnim] = useState<GifAnimation>("idle");
  // Base and evolution artwork are separate layer stacks on one template.
  // Costume placement remains a third focused authoring surface.
  const [editorTab, setEditorTab] = useState<EditorTab>("parts");
  const [selectedCostumeId, setSelectedCostumeId] = useState<string | null>(null);
  const [costumeArtworkForm, setCostumeArtworkForm] = useState<"base" | "evolution">("base");
  const [selectedCostumeInstance, setSelectedCostumeInstance] = useState(1);
  const [costumeSearch, setCostumeSearch] = useState("");
  const [costumeDraft, setCostumeDraft] = useState<CostumePlacement | null>(null);
  const [previewAdornmentMotion, setPreviewAdornmentMotion] = useState(false);
  const [costumeDraftDirty, setCostumeDraftDirty] = useState(false);
  const [draggingCostume, setDraggingCostume] = useState(false);
  const costumeDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    onCostumeDirtyChange?.(costumeDraftDirty);
  }, [costumeDraftDirty, onCostumeDirtyChange]);
  useEffect(() => () => onCostumeDirtyChange?.(false), [onCostumeDirtyChange]);

  // Notify parent whenever the facing mode toggles (front ↔ side) so the
  // Test-Animator save preview can match.
  useEffect(() => {
    onFacingModeChange?.(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);
  // Per-group expand/collapse state. Undefined = use the group's default
  // (defined by `collapsed: true` on the group definition).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
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

  const { data: costumeItems = [], isPending: costumeItemsLoading, isError: costumeItemsError, refetch: refetchCostumeItems } = useQuery<CostumeItem[]>({
    queryKey: ["/api/admin/costumes"],
    // Costume media is intentionally lazy: the normal parts editor should not
    // download the costume library.
    enabled: !!selectedTemplateId && editorTab === "costume",
    staleTime: 0,
  });
  const { data: costumeDefinitions = [], isPending: costumeDefinitionsLoading, isError: costumeDefinitionsError, refetch: refetchCostumeDefinitions } = useQuery<CostumeDefinition[]>({
    queryKey: ["/api/admin/costume-definitions", selectedTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/costume-definitions?templateId=${selectedTemplateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load costume placements");
      return res.json();
    },
    enabled: !!selectedTemplateId && editorTab === "costume",
    staleTime: 0,
  });
  // Reopening a template restores a saved placement into the same editor
  // surface; admins can then choose another piece from the selector.
  useEffect(() => {
    if (!selectedCostumeId && costumeDefinitions[0]) setSelectedCostumeId(costumeDefinitions[0].shopItemId);
  }, [costumeDefinitions, selectedCostumeId]);

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

  // This is the authoring surface, so preview the exact saved stack.
  // Runtime animation grouping can still use its semantic layers separately.
  const previewEffectiveZ = (p: { zIndex: number }): number => p.zIndex;
  const activeParts = editorTab === "evolution" || (editorTab === "costume" && costumeArtworkForm === "evolution")
    ? (templateDetail?.evolutionParts ?? [])
    : (templateDetail?.parts ?? []);
  const viewParts = activeParts
    .filter(p => p.view === activeView)
    .map(part => partDraft?.partId === part.id ? { ...part, ...partDraft } : part)
    .sort((a, b) => previewEffectiveZ(a) - previewEffectiveZ(b));

  const currentCostumeView = activeView === "back" ? "side" as const : "front" as const;
  const normalizedCostumeSearch = costumeSearch.trim().toLowerCase();
  const filteredCostumeItems = [...costumeItems]
    .filter(item => !normalizedCostumeSearch || item.name.toLowerCase().includes(normalizedCostumeSearch))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedCostumeItem = costumeItems.find(item => item.id === selectedCostumeId);
  const selectedCostumeDefinition = costumeDefinitions.find(definition => definition.shopItemId === selectedCostumeId);
  const selectedCostumeIsWings = selectedCostumeItem?.adornmentSlot === "wings";
  const formPlacements = (selectedCostumeDefinition?.placements ?? [])
    .filter((placement) => (placement.form ?? "base") === costumeArtworkForm);
  const savedCostumeInstances = Array.from(new Set(
    formPlacements.map(placement => placement.instance ?? 1),
  )).sort((a, b) => a - b);
  const costumeInstances = selectedCostumeIsWings ? [1] : Array.from(new Set([
    1,
    ...savedCostumeInstances,
    ...(costumeDraft ? [costumeDraft.instance ?? selectedCostumeInstance] : []),
  ])).sort((a, b) => a - b);
  const savedCostumePlacement = selectedCostumeIsWings
    ? formPlacements.find(placement => placement.view === currentCostumeView)
    : formPlacements.find(placement =>
        placement.view === currentCostumeView && (placement.instance ?? 1) === selectedCostumeInstance
      );
  const defaultCostumePlacement = (): CostumePlacement => ({
    form: costumeArtworkForm,
    view: currentCostumeView,
    anchorPart: "independent",
    animation: "none",
    animationSpeed: 1,
    replacesWings: false,
    instance: selectedCostumeInstance,
    posX: 500,
    posY: 500,
    width: 300,
    height: 300,
    pivotX: 50,
    pivotY: 50,
    rotation: 0,
    flipX: false,
    depth: "front",
  });
  const selectedCostumePlacement = selectedCostumeId
    ? costumeDraft ?? savedCostumePlacement ?? defaultCostumePlacement()
    : undefined;
  const costumeAnchor = viewParts.find(part => part.partType === selectedCostumePlacement?.anchorPart);
  const costumeAnchorPoint = getCostumePlacementAnchorPoint(costumeAnchor, selectedCostumePlacement);
  const costumeCanvasPosition = getCostumeCanvasPosition(costumeAnchor, selectedCostumePlacement);
  const previewHiddenWings = new Set<string>();
  if (selectedCostumeIsWings && selectedCostumePlacement) {
    viewParts.forEach(part => { if (part.partType.toLowerCase().includes("wing")) previewHiddenWings.add(part.partType); });
  }
  for (const instance of costumeInstances) {
    const placement = instance === selectedCostumeInstance ? selectedCostumePlacement
      : formPlacements.find(p => p.view === currentCostumeView && (p.instance ?? 1) === instance);
    if (!placement) continue;
    if (placement.anchorPart === "independent" && placement.replacesWings) {
      viewParts.forEach(part => { if (part.partType.includes("wing")) previewHiddenWings.add(part.partType); });
    }
    getWingReplacementPartTypes(placement.anchorPart).forEach(part => previewHiddenWings.add(part));
  }
  const canSaveCostumePlacement = !costumeDefinitionsLoading && !costumeDefinitionsError && !!selectedCostumePlacement && (costumeDraftDirty || !savedCostumePlacement);
  const nextCostumeInstance = Array.from({ length: COSTUME_MAX_PLACEMENT_INSTANCES }, (_, index) => index + 1)
    .find(instance => !costumeInstances.includes(instance));
  const canDuplicateCostumePlacement = !selectedCostumeIsWings && !!selectedCostumeItem && !!savedCostumePlacement && !costumeDraftDirty && nextCostumeInstance !== undefined;

  useEffect(() => {
    if (!selectedCostumeId) {
      setCostumeDraft(null);
      setCostumeDraftDirty(false);
      return;
    }
    if (costumeDraftDirty) return;
    setCostumeDraft(savedCostumePlacement ?? defaultCostumePlacement());
  }, [selectedTemplateId, selectedCostumeId, selectedCostumeInstance, currentCostumeView, costumeArtworkForm, selectedCostumeDefinition]);

  useEffect(() => {
    if (!costumeDraftDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [costumeDraftDirty]);

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

  const animationProfileMutation = useMutation({
    mutationFn: async ({ id, idleStyle }: { id: string; idleStyle: PetAnimationProfile }) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-templates/${id}`, { idleStyle });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", selectedTemplateId] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update animation profile", variant: "destructive" }),
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: { templateId: string; form: "base" | "evolution"; partType: string; view: string; imageData: string; zIndex: number; pivotX?: number; pivotY?: number; posX?: number; posY?: number; width?: number; height?: number }) => {
      const res = await apiRequest("POST", `/api/admin/pet-templates/${data.templateId}/part`, {
        form: data.form,
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
    onSuccess: (_part, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", variables.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", variables.templateId] });
      setUploadPartType(null);
      toast({ title: "Added", description: "Part added to canvas" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add part", variant: "destructive" });
    },
  });

  const updatePartMutation = useMutation({
    mutationFn: async ({ partId, ...data }: { partId: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number; pivotX?: number; pivotY?: number; rotation?: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/pet-template-parts/${partId}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      if (partDraftRef.current?.partId === variables.partId) {
        partDraftRef.current = null;
        setPartDraft(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts"] });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      await apiRequest("DELETE", `/api/admin/pet-template-parts/${partId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts"] });
      setSelectedPartId(null);
      partDraftRef.current = null;
      setPartDraft(null);
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
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", selectedTemplateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts"] });
      toast({ title: "Saved!", description: `${facingMode === "front" ? "Front" : "Side"} view assembled and saved` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assemble", variant: "destructive" });
    },
  });

  const saveCostumeMutation = useMutation({
    mutationFn: async ({ itemId, placement }: { itemId: string; placement: CostumePlacement }) => {
      const existing = costumeDefinitions.find(definition => definition.shopItemId === itemId)?.placements ?? [];
      const placementInstance = placement.instance ?? 1;
      const imageData = placement.mirroredWingImageUrl?.startsWith("data:") ? placement.mirroredWingImageUrl : undefined;
      const mirroredWingUpload = imageData ? { view: placement.view, instance: placementInstance, imageData } : undefined;
      const normalizedPlacement = { ...placement, instance: placementInstance,
        mirroredWingImageUrl: imageData ? undefined : placement.mirroredWingImageUrl };
      const placements = [
        ...existing.filter(current =>
          (current.form ?? "base") !== (placement.form ?? "base")
          || current.view !== placement.view
          || (current.instance ?? 1) !== placementInstance
        ),
        normalizedPlacement,
      ];
      const res = await apiRequest("PUT", "/api/admin/costume-definitions", { shopItemId: itemId, templateId: selectedTemplateId, placements, mirroredWingUpload });
      return res.json();
    },
    onSuccess: (data: CostumeDefinition, variables) => {
      setCostumeDraft(data.placements.find(placement =>
        (placement.form ?? "base") === (variables.placement.form ?? "base")
        && placement.view === variables.placement.view
        && (placement.instance ?? 1) === (variables.placement.instance ?? 1)
      ) ?? null);
      setCostumeDraftDirty(false);
      queryClient.setQueryData<CostumeDefinition[]>(["/api/admin/costume-definitions", selectedTemplateId], current => [
        ...(current ?? []).filter(definition => definition.shopItemId !== data.shopItemId),
        data,
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/costume-definitions", selectedTemplateId] });
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === "/api/pet" && query.queryKey[2] === "costumes" });
      toast({ title: "Adornment saved", description: `${selectedCostumeItem?.name ?? "Costume"} placement saved for the ${currentCostumeView} view.` });
    },
    onError: (error: Error) => toast({ title: "Could not save adornment", description: error.message || "Failed to save adornment placement", variant: "destructive" }),
  });

  const removeCostumeInstanceMutation = useMutation({
    mutationFn: async ({ itemId, instance, form }: { itemId: string; instance: number; form: "base" | "evolution" }) => {
      const existing = costumeDefinitions.find(definition => definition.shopItemId === itemId)?.placements ?? [];
      const placements = existing.filter(placement =>
        (placement.form ?? "base") !== form || (placement.instance ?? 1) !== instance
      );
      const res = await apiRequest("PUT", "/api/admin/costume-definitions", { shopItemId: itemId, templateId: selectedTemplateId, placements });
      return res.json();
    },
    onSuccess: (data: CostumeDefinition) => {
      setSelectedCostumeInstance(1);
      setCostumeDraft(null);
      setCostumeDraftDirty(false);
      queryClient.setQueryData<CostumeDefinition[]>(["/api/admin/costume-definitions", selectedTemplateId], current => [
        ...(current ?? []).filter(definition => definition.shopItemId !== data.shopItemId),
        data,
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/costume-definitions", selectedTemplateId] });
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === "/api/pet" && query.queryKey[2] === "costumes" });
      toast({ title: "Adornment copy removed" });
    },
    onError: (error: Error) => toast({ title: "Could not remove adornment copy", description: error.message || "Failed to remove adornment copy", variant: "destructive" }),
  });

  const updateCostumeDraft = (changes: Partial<CostumePlacement>) => {
    if (!selectedCostumeId || saveCostumeMutation.isPending) return;
    setCostumeDraft(current => ({ ...(current ?? selectedCostumePlacement ?? defaultCostumePlacement()), ...changes }));
    setCostumeDraftDirty(true);
  };
  const startCostumeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (saveCostumeMutation.isPending || !selectedCostumePlacement || !costumeCanvasPosition) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = CANVAS_SIZE / rect.width;
    costumeDragRef.current = {
      pointerId: event.pointerId,
      ...getCostumeDragOffset({
        x: (event.clientX - rect.left) * scale,
        y: (event.clientY - rect.top) * scale,
      }, costumeCanvasPosition),
    };
    setDraggingCostume(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveCostumeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = costumeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !selectedCostumePlacement || !costumeAnchorPoint) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    const scale = CANVAS_SIZE / rect.width;
    updateCostumeDraft(getDraggedCostumePosition({
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    }, drag, costumeAnchorPoint, selectedCostumePlacement));
  };
  const endCostumeDrag = (pointerId?: number) => {
    if (pointerId !== undefined && costumeDragRef.current?.pointerId !== pointerId) return;
    costumeDragRef.current = null;
    setDraggingCostume(false);
  };
  const resizeCostume = (nextSize: number) => {
    if (!selectedCostumePlacement) return;
    updateCostumeDraft(resizeCostumePlacement(selectedCostumePlacement, nextSize));
  };
  const rotateCostume = (degrees: number) => updateCostumeDraft({ rotation: Math.max(-180, Math.min(180, degrees)) });
  const flipCostume = () => {
    if (!selectedCostumePlacement) return;
    updateCostumeDraft({ flipX: !(selectedCostumePlacement.flipX ?? false) });
  };
  const duplicateCostumePlacement = () => {
    if (!canDuplicateCostumePlacement || !selectedCostumePlacement || nextCostumeInstance === undefined) return;
    setSelectedCostumeInstance(nextCostumeInstance);
    setCostumeDraft({
      ...selectedCostumePlacement,
      instance: nextCostumeInstance,
      posX: selectedCostumePlacement.posX + 24,
      posY: selectedCostumePlacement.posY + 24,
    });
    setCostumeDraftDirty(true);
  };
  const saveCostumePlacement = () => {
    if (!selectedCostumeId || !selectedCostumePlacement || !canSaveCostumePlacement || saveCostumeMutation.isPending) return;
    saveCostumeMutation.mutate({ itemId: selectedCostumeId, placement: { ...selectedCostumePlacement, form: costumeArtworkForm, instance: selectedCostumeIsWings ? 1 : selectedCostumeInstance, rotation: selectedCostumePlacement.rotation ?? 0, flipX: selectedCostumePlacement.flipX ?? false, animation: selectedCostumeIsWings ? "none" : selectedCostumePlacement.animation } });
  };
  const discardCostumeDraft = () => {
    costumeDragRef.current = null;
    setCostumeDraft(null);
    setCostumeDraftDirty(false);
    setDraggingCostume(false);
    if (!savedCostumePlacement && selectedCostumeInstance !== 1) {
      setSelectedCostumeInstance(savedCostumeInstances[0] ?? 1);
    }
  };
  const selectCostume = (itemId: string) => {
    if (saveCostumeMutation.isPending || itemId === selectedCostumeId) return;
    if (costumeDraftDirty && !window.confirm("Discard the unsaved adornment placement?")) return;
    discardCostumeDraft();
    setSelectedCostumeId(itemId);
    setSelectedCostumeInstance(1);
  };
  const selectCostumeInstance = (instance: number) => {
    if (saveCostumeMutation.isPending || removeCostumeInstanceMutation.isPending || instance === selectedCostumeInstance) return;
    if (costumeDraftDirty && !window.confirm("Discard the unsaved adornment placement?")) return;
    discardCostumeDraft();
    setSelectedCostumeInstance(instance);
  };
  const removeSelectedCostumeInstance = () => {
    if (!selectedCostumeId || selectedCostumeInstance === 1 || !savedCostumePlacement || costumeDraftDirty || removeCostumeInstanceMutation.isPending) return;
    if (!window.confirm(`Remove Copy ${selectedCostumeInstance - 1} from this pet? This removes its front and side placement.`)) return;
    removeCostumeInstanceMutation.mutate({ itemId: selectedCostumeId, instance: selectedCostumeInstance, form: costumeArtworkForm });
  };
  const changeCostumeArtworkForm = (form: "base" | "evolution") => {
    if (saveCostumeMutation.isPending || form === costumeArtworkForm) return;
    if (costumeDraftDirty && !window.confirm("Discard the unsaved adornment placement?")) return;
    discardCostumeDraft();
    setSelectedCostumeInstance(1);
    setSelectedPartId(null);
    setCostumeArtworkForm(form);
  };
  const changeCostumeView = (mode: "front" | "side") => {
    if (saveCostumeMutation.isPending || mode === facingMode) return;
    if (costumeDraftDirty && !window.confirm("Discard the unsaved adornment placement?")) return;
    discardCostumeDraft();
    setSelectedPartId(null);
    setFacingMode(mode);
  };
  const changeEditorTab = (tab: EditorTab) => {
    if (saveCostumeMutation.isPending || tab === editorTab) return;
    if (editorTab === "costume" && costumeDraftDirty && !window.confirm("Discard the unsaved adornment placement?")) return;
    if (editorTab === "costume") discardCostumeDraft();
    setSelectedPartId(null);
    setEditorTab(tab);
  };

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

  // Pixel-accurate selection still respects transparent padding, but the
  // selected part can now be dragged directly like a costume placement.
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (draggingPartId) return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const scale = rect.width / CANVAS_SIZE;
    const point = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    if (point.x < 0 || point.x > CANVAS_SIZE || point.y < 0 || point.y > CANVAS_SIZE) return;

    const sorted = [...viewParts].sort((a, b) => previewEffectiveZ(b) - previewEffectiveZ(a));
    for (const part of sorted) {
      const unrotated = getUnrotatedPetPartPoint(point, part);
      if (unrotated.x < part.posX || unrotated.x > part.posX + part.width ||
          unrotated.y < part.posY || unrotated.y > part.posY + part.height) continue;
      const relX = (unrotated.x - part.posX) / part.width;
      const relY = (unrotated.y - part.posY) / part.height;
      if (!isOpaqueSyncAt(part.imageUrl, relX, relY)) continue;
      setSelectedPartId(part.id);
      return;
    }
    setSelectedPartId(null);
  }, [draggingPartId, viewParts, isOpaqueSyncAt]);

  const makePartDraft = (part: PetTemplatePart) => ({
    partId: part.id,
    posX: part.posX,
    posY: part.posY,
    width: part.width,
    height: part.height,
    pivotX: part.pivotX,
    pivotY: part.pivotY,
    rotation: part.rotation ?? 0,
  });

  const setEditablePartDraft = (next: NonNullable<typeof partDraft>) => {
    partDraftRef.current = next;
    setPartDraft(next);
  };

  const commitPartDraft = () => {
    const draft = partDraftRef.current;
    if (!draft || updatePartMutation.isPending) return;
    updatePartMutation.mutate(draft);
  };

  const startPartDrag = (event: React.PointerEvent<HTMLDivElement>, part: PetTemplatePart) => {
    if (updatePartMutation.isPending) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPartId(part.id);
    const scale = CANVAS_SIZE / rect.width;
    const pointer = { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
    const draft = makePartDraft(part);
    const offset = getPetPartDragOffset(pointer, draft);
    setEditablePartDraft(draft);
    partDragRef.current = { pointerId: event.pointerId, offsetX: offset.x, offsetY: offset.y };
    setDraggingPartId(part.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = partDragRef.current;
    const draft = partDraftRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !draft || drag.pointerId !== event.pointerId || !rect || rect.width <= 0) return;
    event.preventDefault();
    const scale = CANVAS_SIZE / rect.width;
    const position = getDraggedPetPartPosition(
      { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale },
      { x: drag.offsetX, y: drag.offsetY },
    );
    setEditablePartDraft({ ...draft, ...position });
  };

  const endPartDrag = (pointerId?: number) => {
    if (pointerId !== undefined && partDragRef.current?.pointerId !== pointerId) return;
    const hadDrag = !!partDragRef.current;
    partDragRef.current = null;
    setDraggingPartId(null);
    if (hadDrag) commitPartDraft();
  };

  const updateSelectedPartDraft = (changes: Partial<NonNullable<typeof partDraft>>) => {
    if (!selectedPart || updatePartMutation.isPending) return;
    const current = partDraftRef.current?.partId === selectedPart.id ? partDraftRef.current : makePartDraft(selectedPart);
    setEditablePartDraft({ ...current, ...changes, partId: selectedPart.id });
  };

  const saveSelectedPartTransform = (changes: Partial<NonNullable<typeof partDraft>>) => {
    if (!selectedPart || updatePartMutation.isPending) return;
    const current = partDraftRef.current?.partId === selectedPart.id ? partDraftRef.current : makePartDraft(selectedPart);
    const next = { ...current, ...changes, partId: selectedPart.id };
    setEditablePartDraft(next);
    updatePartMutation.mutate(next);
  };

  const nudgeAll = useCallback(async (dx: number, dy: number) => {
    if (viewParts.length === 0 || updatePartMutation.isPending) return;
    const snapshot = viewParts;
    await Promise.all(snapshot.map(part =>
      apiRequest("PATCH", `/api/admin/pet-template-parts/${part.id}`, {
        posX: part.posX + dx,
        posY: part.posY + dy,
      })
    ));
    queryClient.invalidateQueries({ queryKey: ["/api/admin/pet-templates", selectedTemplateId] });
    queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts", selectedTemplateId] });
    queryClient.invalidateQueries({ queryKey: ["/api/pet-template-parts"] });
  }, [viewParts, queryClient, selectedTemplateId, updatePartMutation.isPending]);

  const handleExportGif = async () => {
    if (!viewParts.length || !selectedTemplateId) return;
    setGifExporting(true);
    setGifProgress(0);
    try {
      const result = await renderPetGif({
        parts: viewParts,
        view: activeView as "front" | "back",
        animation: gifAnim,
        facing: templateDetail?.facing ?? "front",
        onProgress: (frame, total) => setGifProgress(Math.round((frame / total) * 100)),
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(templateDetail?.name ?? "pet").replace(/\s+/g, "_")}_${gifAnim}.gif`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "GIF export failed", description: err.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setGifExporting(false);
      setGifProgress(0);
    }
  };

  const selectedPart = viewParts.find(p => p.id === selectedPartId);

  // Has parts in the OTHER view (the one not currently active)
  const otherView = activeView === "front" ? "back" : "front";
  const hasOtherViewParts = activeParts.some(p => p.view === otherView);

  if (selectedTemplateId && templateDetail) {
    const linkedPet = getLinkedShopPet(templateDetail.id);
    const viewLabel = `${editorTab === "evolution" ? "Evolution · " : ""}${facingMode === "front" ? "Front View" : "Side View"}`;

    if (editorTab === "costume") return (
      <div data-testid="pet-costume-editor" className="flex flex-col gap-3 pb-24 xl:pb-0">
        <EditorTabs active={editorTab} onChange={changeEditorTab} />

        <div className="rounded-lg px-3 py-3 space-y-3" style={{ background: "rgba(52,28,72,.28)", border: "1px solid rgba(192,132,252,.3)" }}>
          <div>
            <h3 className="font-fantasy text-[#c084fc] text-sm tracking-widest">{templateDetail.name} — {costumeArtworkForm === "evolution" ? "Evolution " : ""}Adornment Placement</h3>
            <p className="mt-1 text-[11px]" style={{ color: "#a89878" }}>
              Choose a view and adornment, then drag the artwork directly into place on the pet.
            </p>
          </div>
          <div data-testid="adornment-form-selector" className="space-y-2">
            <button
              type="button"
              data-testid="button-adornment-form-base"
              onClick={() => changeCostumeArtworkForm("base")}
              disabled={saveCostumeMutation.isPending}
              className="w-full rounded-md px-3 py-2 text-left font-fantasy text-[10px] tracking-wider disabled:opacity-50"
              style={{ background: costumeArtworkForm === "base" ? "rgba(192,132,252,.28)" : "rgba(0,0,0,.22)", border: "1px solid rgba(192,132,252,.32)", color: costumeArtworkForm === "base" ? "#f3e8ff" : "#a89878" }}
            >
              REGULAR PET ADORNMENTS
              <span className="block mt-0.5 font-sans text-[9px] normal-case tracking-normal opacity-70">Fits adornments to the regular pet parts.</span>
            </button>
            <button
              type="button"
              data-testid="button-adornment-form-evolution"
              onClick={() => changeCostumeArtworkForm("evolution")}
              disabled={saveCostumeMutation.isPending || (templateDetail.evolutionParts ?? []).length === 0}
              className="w-full rounded-md px-3 py-2 text-left font-fantasy text-[10px] tracking-wider disabled:opacity-40"
              style={{ background: costumeArtworkForm === "evolution" ? "rgba(240,192,64,.2)" : "rgba(0,0,0,.22)", border: "1px solid rgba(240,192,64,.28)", color: costumeArtworkForm === "evolution" ? "#f7dfa0" : "#a89878" }}
            >
              EVOLUTION ADORNMENTS
              <span className="block mt-0.5 font-sans text-[9px] normal-case tracking-normal opacity-70">Fits the same adornment separately to the evolution pet parts.</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Adornment placement view">
            <button
              data-testid="button-costume-view-front"
              onClick={() => changeCostumeView("front")}
              disabled={saveCostumeMutation.isPending}
              className="rounded-md px-3 py-2 font-fantasy text-[10px] tracking-wider disabled:opacity-50"
              style={{ background: facingMode === "front" ? "rgba(192,132,252,.3)" : "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.3)", color: facingMode === "front" ? "#e9d5ff" : "#a89878" }}
            >
              FRONT VIEW
            </button>
            <button
              data-testid="button-costume-view-side"
              onClick={() => changeCostumeView("side")}
              disabled={saveCostumeMutation.isPending}
              className="rounded-md px-3 py-2 font-fantasy text-[10px] tracking-wider disabled:opacity-50"
              style={{ background: facingMode === "side" ? "rgba(192,132,252,.3)" : "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.3)", color: facingMode === "side" ? "#e9d5ff" : "#a89878" }}
            >
              SIDE VIEW
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(210px,.9fr)_minmax(320px,1.6fr)_minmax(220px,1fr)] gap-3 items-start">
          <aside className="order-1 rounded-xl p-3 space-y-3" style={{ background: "linear-gradient(180deg,rgba(52,28,72,.48),rgba(20,12,30,.72))", border: "1px solid rgba(192,132,252,.38)", boxShadow: "inset 0 0 18px rgba(192,132,252,.05)" }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-fantasy text-[9px] tracking-widest" style={{ color: "#c084fc" }}>ADORNMENT VAULT</p>
                <p className="mt-1 text-[10px]" style={{ color: "#a89878" }}>Choose artwork to place.</p>
              </div>
              <span className="rounded-full px-2 py-1 text-[9px] font-semibold" style={{ background: "rgba(192,132,252,.13)", border: "1px solid rgba(192,132,252,.3)", color: "#d8b4fe" }}>{costumeItems.length} ITEMS</span>
            </div>
            <label className="relative block">
              <span className="sr-only">Search adornment items</span>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none" style={{ color: "#c084fc" }} />
              <input
                data-testid="input-costume-search"
                type="search"
                value={costumeSearch}
                onChange={event => setCostumeSearch(event.target.value)}
                placeholder="Search adornments…"
                className="w-full rounded-lg py-2 pl-8 pr-3 text-[11px] outline-none"
                style={{ background: "rgba(0,0,0,.34)", border: "1px solid rgba(192,132,252,.28)", color: "#f3e8ff" }}
              />
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-2 gap-2 max-h-64 xl:max-h-[520px] overflow-y-auto pr-1" aria-label="Adornment library">
              {filteredCostumeItems.map(item => {
                const selected = selectedCostumeId === item.id;
                const fittedForPet = costumeDefinitions.some(definition =>
                  definition.shopItemId === item.id && definition.placements.length > 0
                );
                return (
                  <button
                    key={item.id}
                    onClick={() => selectCostume(item.id)}
                    disabled={saveCostumeMutation.isPending}
                    aria-pressed={selected}
                    className="group relative min-w-0 rounded-xl p-2 text-center disabled:opacity-50 active:scale-95 transition-transform"
                    style={{
                      background: selected ? "linear-gradient(180deg,rgba(192,132,252,.28),rgba(88,28,135,.24))" : "rgba(0,0,0,.25)",
                      border: selected ? "1px solid rgba(216,180,254,.72)" : "1px solid rgba(192,132,252,.16)",
                      boxShadow: selected ? "0 0 14px rgba(192,132,252,.2),inset 0 0 10px rgba(216,180,254,.08)" : "none",
                      color: "#e7d7b5",
                    }}
                  >
                    {fittedForPet && <span
                      data-testid={`costume-fitted-${item.id}`}
                      aria-label="Placement saved for this pet"
                      title="Placement saved for this pet"
                      className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full"
                      style={{ background: "#39f58a", border: "1px solid rgba(220,255,232,.9)", boxShadow: "0 0 8px rgba(57,245,138,.95)" }}
                    />}
                    <span className="mx-auto mb-1.5 grid h-14 w-full place-items-center rounded-lg" style={{ background: "radial-gradient(circle,rgba(192,132,252,.12),rgba(0,0,0,.12) 68%)" }}>
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-12 w-12 object-contain" draggable={false} /> : <span className="text-lg" aria-hidden="true">✦</span>}
                    </span>
                    <span className="block truncate text-[9px] leading-tight">{item.name}</span>
                  </button>
                );
              })}
            </div>
            {costumeItemsLoading && <p role="status" className="text-xs" style={{ color: "#a89878" }}>Loading adornments…</p>}
            {costumeItemsError && <p role="alert" className="text-xs" style={{ color: "#a89878" }}>Could not load adornments. <button type="button" className="underline" onClick={() => void refetchCostumeItems()}>Try again</button></p>}
            {!costumeItemsLoading && !costumeItemsError && !costumeItems.length && <p className="text-xs" style={{ color: "#a89878" }}>No saved adornments yet. Add an item with the Adornment type in the item database, then return here to fit it to this pet.</p>}
            {costumeDefinitionsLoading && <p role="status" className="text-xs" style={{ color: "#a89878" }}>Loading saved placements…</p>}
            {costumeDefinitionsError && <p role="alert" className="text-xs" style={{ color: "#a89878" }}>Could not load saved placements. <button type="button" className="underline" onClick={() => void refetchCostumeDefinitions()}>Try again</button></p>}
            {!!costumeItems.length && !filteredCostumeItems.length && <p className="py-4 text-center text-xs" style={{ color: "#a89878" }}>No adornments match “{costumeSearch}”.</p>}
          </aside>

          <section className="order-3 xl:order-2 space-y-2">
            <style>{ADORNMENT_MOTION_CSS}</style>
            <p className="text-center text-[11px]" style={{ color: selectedCostumeItem ? "#d8b4fe" : "#a89878" }}>
              {selectedCostumeItem ? "Press and drag the adornment to position it. It will not save until you tap Save placement." : "Select an adornment from the library to begin."}
            </p>
            <div
              ref={canvasRef}
              data-testid="costume-placement-canvas"
              aria-label="Drag adornment placement canvas"
              className="relative aspect-square rounded-lg select-none"
              style={{
                width: "100%",
                overflow: "hidden",
                isolation: "isolate",
                background: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px",
                border: draggingCostume ? "2px solid rgba(192,132,252,.7)" : "2px dashed rgba(192,132,252,.35)",
                touchAction: "none",
              }}
              onPointerMove={moveCostumeDrag}
              onPointerUp={(event) => endCostumeDrag(event.pointerId)}
              onPointerCancel={(event) => endCostumeDrag(event.pointerId)}
            >
              {viewParts.filter(part => !previewHiddenWings.has(part.partType)).map(part => (
                <img
                  key={part.id}
                  src={part.imageUrl}
                  alt=""
                  className="absolute object-contain pointer-events-none"
                  draggable={false}
                  style={{
                    left: `${(part.posX / CANVAS_SIZE) * 100}%`,
                    top: `${(part.posY / CANVAS_SIZE) * 100}%`,
                    width: `${(part.width / CANVAS_SIZE) * 100}%`,
                    height: `${(part.height / CANVAS_SIZE) * 100}%`,
                    transform: `rotate(${part.rotation ?? 0}deg)`,
                    transformOrigin: `${part.pivotX}% ${part.pivotY}%`,
                    zIndex: basePetPartType(part.partType) === "above_head" ? 20000 : previewEffectiveZ(part) + 1000,
                  }}
                />
              ))}
              {selectedCostumeItem?.imageUrl && costumeInstances.map(instance => {
                const isActive = instance === selectedCostumeInstance;
                const placement = isActive
                  ? selectedCostumePlacement
                  : selectedCostumeDefinition?.placements.find(current => current.view === currentCostumeView && (current.instance ?? 1) === instance);
                const anchor = placement ? viewParts.find(part => part.partType === placement.anchorPart) : undefined;
                const position = getCostumeCanvasPosition(anchor, placement);
                if (!placement || !position) return null;
                return (
                  <div
                    key={`${selectedCostumeItem.id}-${currentCostumeView}-${instance}`}
                    data-testid={`canvas-costume-${selectedCostumeItem.id}-${instance}`}
                    className="absolute"
                    onPointerDown={isActive ? startCostumeDrag : undefined}
                    onLostPointerCapture={isActive ? (event) => endCostumeDrag(event.pointerId) : undefined}
                    style={{
                      left: `${(position.left / CANVAS_SIZE) * 100}%`,
                      top: `${(position.top / CANVAS_SIZE) * 100}%`,
                      width: `${(placement.width / CANVAS_SIZE) * 100}%`,
                      height: `${(placement.height / CANVAS_SIZE) * 100}%`,
                      transform: `rotate(${placement.rotation ?? 0}deg) scaleX(${placement.flipX ? -1 : 1})`,
                      transformOrigin: `${placement.pivotX}% ${placement.pivotY}%`,
                      zIndex: placement.depth === "front" ? 10000 + instance : instance,
                      cursor: isActive ? (draggingCostume ? "grabbing" : "grab") : "default",
                      outline: isActive ? (draggingCostume ? "2px solid rgba(192,132,252,.85)" : "1px dashed rgba(192,132,252,.45)") : "none",
                      outlineOffset: "2px",
                      touchAction: isActive ? "none" : "auto",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    <AdornmentArtwork src={selectedCostumeItem.imageUrl!} placement={placement} animated={previewAdornmentMotion && !draggingCostume} effect={selectedCostumeItem.adornmentEffect as any} wingPair={selectedCostumeIsWings} />
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="order-2 xl:order-3 rounded-xl p-3 space-y-4" style={{ background: "rgba(52,28,72,.35)", border: "1px solid rgba(192,132,252,.35)" }}>
            {selectedCostumeItem && selectedCostumePlacement ? (
              <>
                <div>
                  <p className="font-fantasy text-[9px]" style={{ color: "#c084fc" }}>PLACEMENT CONTROLS</p>
                  <p className="mt-1 text-[11px] truncate" style={{ color: "#e7d7b5" }}>{selectedCostumeItem.name}</p>
                </div>
                <div className="rounded-lg p-2.5" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(192,132,252,.2)" }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[9px] font-semibold tracking-wider" style={{ color: "#d8b4fe" }}>PLACED PIECES</p>
                    {!selectedCostumeIsWings && <button
                      type="button"
                      data-testid="button-duplicate-costume-piece"
                      aria-label="Duplicate adornment piece"
                      title={canDuplicateCostumePlacement ? "Duplicate this fitted piece" : nextCostumeInstance === undefined ? "Maximum of 3 duplicates reached" : "Save this placement before duplicating it"}
                      onClick={duplicateCostumePlacement}
                      disabled={!canDuplicateCostumePlacement || saveCostumeMutation.isPending || removeCostumeInstanceMutation.isPending}
                      className="grid h-8 w-8 place-items-center rounded-full text-lg font-semibold disabled:opacity-35"
                      style={{ background: "rgba(192,132,252,.18)", border: "1px solid rgba(216,180,254,.42)", color: "#f3e8ff" }}
                    >
                      +
                    </button>}
                  </div>
                  <div data-testid="costume-copy-selector" className="flex flex-wrap gap-1.5">
                    {costumeInstances.map(instance => (
                      <button
                        key={instance}
                        type="button"
                        data-testid={`button-costume-instance-${instance}`}
                        onClick={() => selectCostumeInstance(instance)}
                        disabled={saveCostumeMutation.isPending || removeCostumeInstanceMutation.isPending}
                        className="rounded-md px-2 py-1 text-[8px] font-semibold tracking-wider disabled:opacity-50"
                        style={{
                          background: selectedCostumeInstance === instance ? "rgba(192,132,252,.3)" : "rgba(0,0,0,.28)",
                          border: selectedCostumeInstance === instance ? "1px solid rgba(216,180,254,.65)" : "1px solid rgba(192,132,252,.2)",
                          color: selectedCostumeInstance === instance ? "#f3e8ff" : "#bca7c8",
                        }}
                      >
                        {instance === 1 ? "ORIGINAL" : `COPY ${instance - 1}`}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[8px]" style={{ color: "#8f8198" }}>{selectedCostumeIsWings ? "Wings use one fitted source image." : "Original + up to 3 duplicates per pet."}</p>
                    {selectedCostumeInstance > 1 && savedCostumePlacement && !costumeDraftDirty && (
                      <button
                        type="button"
                        data-testid="button-remove-costume-copy"
                        onClick={removeSelectedCostumeInstance}
                        disabled={removeCostumeInstanceMutation.isPending || saveCostumeMutation.isPending}
                        className="rounded px-2 py-1 text-[8px] disabled:opacity-50"
                        style={{ border: "1px solid rgba(248,113,113,.28)", color: "#fca5a5", background: "rgba(127,29,29,.12)" }}
                      >
                        REMOVE COPY
                      </button>
                    )}
                  </div>
                </div>
                {selectedCostumePlacement.anchorPart !== "independent" ? (
                  <div className="space-y-2 text-xs" style={{ color: "#a89878" }}>
                    <p>This saved fitting follows {selectedCostumePlacement.anchorPart}. Give it its own placement to choose its motion.</p>
                    <button type="button" disabled={saveCostumeMutation.isPending || !costumeAnchor} onClick={() => {
                      const detached = detachCostumePlacement(costumeAnchor, selectedCostumePlacement);
                      if (detached) updateCostumeDraft(detached);
                    }} className="w-full rounded p-2.5" style={{ background: "#382444", color: "#e7d7b5" }}>Use independent placement</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: "#a89878" }}>Independent placement — drag anywhere on this pet's canvas.</p>
                    {selectedCostumeIsWings ? (
                      <div className="rounded-md p-2.5 text-xs" style={{ color: "#d8b4fe", background: "rgba(192,132,252,.08)", border: "1px solid rgba(192,132,252,.2)" }}>
                        Wings motion is automatic: one fitted image is mirrored into a front-facing pair that opens and closes together.
                      </div>
                    ) : (
                      <label className="block text-xs" style={{ color: "#a89878" }}>Fitted/default animation
                        <select data-testid="select-adornment-animation" value={selectedCostumePlacement.animation ?? "none"} disabled={saveCostumeMutation.isPending}
                          onChange={event => updateCostumeDraft({ animation: event.target.value as AdornmentAnimation })}
                          className="block w-full mt-1 p-2.5 rounded" style={{ background: "#201526", color: "#e7d7b5" }}>
                          {ADORNMENT_ANIMATIONS.filter(animation => animation !== "wings").map(animation => <option key={animation} value={animation}>{ADORNMENT_ANIMATION_LABELS[animation]}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="block text-xs" style={{ color: "#a89878" }}>Speed
                      <select value={selectedCostumePlacement.animationSpeed ?? 1} disabled={saveCostumeMutation.isPending} onChange={event => updateCostumeDraft({ animationSpeed: Number(event.target.value) })}
                        className="block w-full mt-1 p-2.5 rounded" style={{ background: "#201526", color: "#e7d7b5" }}>
                        <option value={0.5}>Slow</option><option value={1}>Normal</option><option value={1.5}>Lively</option>
                      </select>
                    </label>
                    <label className="flex gap-2 text-xs" style={{ color: "#a89878" }}><input type="checkbox" checked={!!selectedCostumePlacement.replacesWings} disabled={saveCostumeMutation.isPending} onChange={event => updateCostumeDraft({ replacesWings: event.target.checked })} />Hide the pet's original wings</label>
                    <label className="flex gap-2 text-xs" style={{ color: "#a89878" }}><input type="checkbox" checked={previewAdornmentMotion} onChange={event => setPreviewAdornmentMotion(event.target.checked)} />Preview motion (pauses while dragging)</label>
                    {(["pivotX", "pivotY"] as const).map(axis => <label key={axis} className="block text-xs" style={{ color: "#a89878" }}>Pivot {axis === "pivotX" ? "horizontal" : "vertical"}: {Math.round(selectedCostumePlacement[axis])}%
                      <input type="range" min={0} max={100} value={selectedCostumePlacement[axis]} disabled={saveCostumeMutation.isPending} onChange={event => updateCostumeDraft(changeCostumePivot(selectedCostumePlacement, axis, Number(event.target.value)))} className="block w-full mt-2" />
                    </label>)}
                  </div>
                )}
                <label className="block text-xs" style={{ color: "#a89878" }}>
                  Size <span className="float-right">{Math.round(selectedCostumePlacement.width)} × {Math.round(selectedCostumePlacement.height)}</span>
                  <input
                    data-testid="input-costume-size"
                    type="range"
                    min="20"
                    max="1000"
                    step="5"
                    value={Math.max(selectedCostumePlacement.width, selectedCostumePlacement.height)}
                    disabled={saveCostumeMutation.isPending}
                    onChange={event => resizeCostume(Number(event.target.value))}
                    className="block w-full mt-2"
                    style={{ accentColor: "#c084fc" }}
                  />
                </label>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs" style={{ color: "#a89878" }}>Rotation</p>
                    <span data-testid="text-costume-rotation" className="text-[10px]" style={{ color: "#d8b4fe" }}>{Math.round(selectedCostumePlacement.rotation ?? 0)}°</span>
                  </div>
                  <input
                    data-testid="input-costume-rotation"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={selectedCostumePlacement.rotation ?? 0}
                    disabled={saveCostumeMutation.isPending}
                    onChange={event => rotateCostume(Number(event.target.value))}
                    className="block w-full"
                    style={{ accentColor: "#c084fc" }}
                  />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button type="button" aria-label="Rotate adornment left 15 degrees" onClick={() => rotateCostume((selectedCostumePlacement.rotation ?? 0) - 15)} disabled={saveCostumeMutation.isPending} className="grid place-items-center rounded p-2 disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.25)", color: "#d8b4fe" }}><RotateCcw className="h-4 w-4" /></button>
                    <button type="button" onClick={() => rotateCostume(0)} disabled={saveCostumeMutation.isPending} className="rounded p-2 text-[9px] disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.25)", color: "#d8b4fe" }}>RESET</button>
                    <button type="button" aria-label="Rotate adornment right 15 degrees" onClick={() => rotateCostume((selectedCostumePlacement.rotation ?? 0) + 15)} disabled={saveCostumeMutation.isPending} className="grid place-items-center rounded p-2 disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.25)", color: "#d8b4fe" }}><RotateCw className="h-4 w-4" /></button>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="button-flip-costume-horizontal"
                  aria-pressed={!!selectedCostumePlacement.flipX}
                  onClick={flipCostume}
                  disabled={saveCostumeMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg p-2.5 text-[10px] font-semibold tracking-wider disabled:opacity-50"
                  style={{
                    background: selectedCostumePlacement.flipX ? "rgba(192,132,252,.30)" : "rgba(0,0,0,.25)",
                    border: "1px solid rgba(192,132,252,.28)",
                    color: selectedCostumePlacement.flipX ? "#f3e8ff" : "#d8b4fe",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>↔</span>
                  {selectedCostumePlacement.flipX ? "FLIPPED HORIZONTALLY" : "FLIP HORIZONTAL"}
                </button>
                <div>
                  <p className="mb-2 text-xs" style={{ color: "#a89878" }}>Layer</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["front", "back"] as const).map(depth => (
                      <button
                        key={depth}
                        onClick={() => updateCostumeDraft({ depth })}
                        disabled={saveCostumeMutation.isPending}
                        className="p-2.5 rounded text-xs disabled:opacity-50"
                        style={{ background: selectedCostumePlacement.depth === depth ? "rgba(192,132,252,.3)" : "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.25)", color: "#e7d7b5" }}
                      >
                        {depth === "front" ? "IN FRONT" : "BEHIND"}
                      </button>
                    ))}
                  </div>
                </div>
                {costumeDraftDirty && (
                  <button
                    data-testid="button-discard-costume-placement"
                    onClick={discardCostumeDraft}
                    disabled={saveCostumeMutation.isPending}
                    className="w-full p-2 rounded text-xs disabled:opacity-50"
                    style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(192,132,252,.2)", color: "#c4b5d0" }}
                  >
                    Discard unsaved changes
                  </button>
                )}
                <div
                  data-testid="costume-save-dock"
                  aria-live="polite"
                  className="fixed left-4 right-4 z-[100000] mx-auto max-w-[688px] rounded-xl p-2 backdrop-blur-md xl:static xl:max-w-none xl:p-0"
                  style={{ bottom: "max(12px, env(safe-area-inset-bottom))", background: "linear-gradient(180deg,rgba(28,16,38,.92),rgba(12,8,18,.96))", border: "1px solid rgba(192,132,252,.35)", boxShadow: "0 8px 28px rgba(0,0,0,.55),0 0 16px rgba(192,132,252,.12)" }}
                >
                  <button
                    data-testid="button-save-costume-placement"
                    onClick={saveCostumePlacement}
                    disabled={!canSaveCostumePlacement || saveCostumeMutation.isPending || readingWingImage}
                    className="flex w-full items-center justify-center gap-2 rounded-lg p-3 text-xs font-semibold disabled:opacity-50"
                    style={{ background: canSaveCostumePlacement ? "linear-gradient(135deg,rgba(126,34,206,.9),rgba(192,132,252,.72))" : "rgba(192,132,252,.16)", border: "1px solid rgba(216,180,254,.55)", color: "#fff", boxShadow: canSaveCostumePlacement ? "0 0 16px rgba(192,132,252,.24)" : "none" }}
                  >
                    <Save className="h-4 w-4" />
                    {saveCostumeMutation.isPending ? "Saving…" : canSaveCostumePlacement ? "Save placement" : "Placement saved"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: "#a89878" }}>Select an adornment to anchor, drag, resize, and save it.</p>
            )}
          </aside>
        </div>
      </div>
    );

    return (
      <div data-testid={editorTab === "evolution" ? "pet-evolution-editor" : "pet-parts-editor"} className="flex flex-col gap-3">
        <EditorTabs active={editorTab} onChange={changeEditorTab} />
        {editorTab === "evolution" && (
          <div data-testid="evolution-parts-notice" className="rounded-lg px-3 py-2" style={{ background: "rgba(192,132,252,.08)", border: "1px solid rgba(192,132,252,.3)" }}>
            <p className="font-fantasy text-[10px] tracking-wider" style={{ color: "#c084fc" }}>EVOLUTION ARTWORK</p>
            <p className="mt-1 text-[10px]" style={{ color: "#a89878" }}>Upload and arrange the evolved pet layers here. Raid bosses use these parts when available. Player evolution is still Coming Soon.</p>
          </div>
        )}
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

        <div className="flex justify-center items-center mb-1">
          <span className="px-4 py-1.5 rounded-md font-fantasy text-[10px] tracking-wider" style={{ background: "linear-gradient(135deg, #5c3a1e 0%, #8b5e3c 100%)", border: "1px solid rgba(212,160,23,0.6)", color: "#f0c040" }}>
            {viewLabel}
          </span>
        </div>

        {/* Direct manipulation canvas — click a visible part, then drag it into place. */}
        <div
          ref={canvasRef}
          className="relative mx-auto rounded-lg"
          style={{
            width: "100%",
            aspectRatio: "1",
            overflow: "visible",
            background: "repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px",
            border: draggingPartId ? "2px solid rgba(240,192,64,0.7)" : "2px dashed rgba(240,192,64,0.25)",
            cursor: "default",
            touchAction: "none",
            isolation: "isolate",
          }}
          onClick={handleCanvasClick}
          onPointerMove={movePartDrag}
          onPointerUp={(event) => endPartDrag(event.pointerId)}
          onPointerCancel={(event) => endPartDrag(event.pointerId)}
        >
          <div
            data-testid="pet-part-center-guide-horizontal"
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 w-full -translate-y-1/2"
            style={{
              zIndex: 30000,
              borderTop: "1px dashed rgba(240,192,64,0.72)",
              filter: "drop-shadow(0 0 2px rgba(43,220,157,0.7))",
            }}
          />
          <div
            data-testid="pet-part-center-guide-vertical"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-full -translate-x-1/2"
            style={{
              zIndex: 30000,
              borderLeft: "1px dashed rgba(240,192,64,0.72)",
              filter: "drop-shadow(0 0 2px rgba(43,220,157,0.7))",
            }}
          />
          <div>
            {viewParts.map(part => {
              const isSelected = selectedPartId === part.id;
              return (
                <div
                  key={part.id}
                  data-testid={`canvas-part-${part.id}`}
                  className="absolute"
                  style={{
                    left: `${(part.posX / CANVAS_SIZE) * 100}%`,
                    top: `${(part.posY / CANVAS_SIZE) * 100}%`,
                    width: `${(part.width / CANVAS_SIZE) * 100}%`,
                    height: `${(part.height / CANVAS_SIZE) * 100}%`,
                    zIndex: previewEffectiveZ(part),
                    transform: `rotate(${part.rotation ?? 0}deg)`,
                    transformOrigin: `${part.pivotX}% ${part.pivotY}%`,
                    pointerEvents: isSelected ? "auto" : "none",
                    touchAction: isSelected ? "none" : "auto",
                    cursor: isSelected ? (draggingPartId === part.id ? "grabbing" : "grab") : "default",
                    outline: isSelected ? "2px solid rgba(240,192,64,0.8)" : "none",
                    outlineOffset: "2px",
                    borderRadius: "4px",
                  }}
                  onPointerDown={isSelected ? (event) => startPartDrag(event, part) : undefined}
                  onLostPointerCapture={isSelected ? (event) => endPartDrag(event.pointerId) : undefined}
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
        </div>

        {selectedPart && (
          <section
            data-testid="selected-part-transform-panel"
            className="rounded-xl p-3 space-y-4"
            style={{ background: "linear-gradient(180deg,rgba(127,255,212,.08),rgba(0,0,0,.22))", border: "1px solid rgba(127,255,212,.28)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-fantasy text-[9px] tracking-widest" style={{ color: "#7fbfb0" }}>PART TRANSFORM</p>
                <p className="mt-1 truncate font-fantasy text-xs capitalize" style={{ color: "#f0c040" }}>{selectedPart.partType}</p>
                <p className="mt-1 text-[10px]" style={{ color: "#a89878" }}>Drag the highlighted artwork on the canvas. Size and rotation save when released.</p>
              </div>
              <button
                data-testid="button-delete-selected-part"
                onClick={() => deletePartMutation.mutate(selectedPart.id)}
                className="grid h-8 w-8 flex-none place-items-center rounded-full"
                style={{ background: "rgba(220,38,38,.25)", border: "1px solid rgba(248,113,113,.35)", color: "#fca5a5" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span style={{ color: "#a89878" }}>Size (proportional)</span>
                <span style={{ color: "#e7d7b5" }}>{selectedPart.width} × {selectedPart.height}</span>
              </div>
              <input
                data-testid="input-part-size"
                type="range"
                min={4}
                max={1000}
                step={1}
                value={selectedPart.width}
                disabled={updatePartMutation.isPending}
                onChange={(event) => {
                  const resized = resizePetPartTransform(selectedPart, Number(event.target.value));
                  updateSelectedPartDraft({ width: resized.width, height: resized.height });
                }}
                onPointerUp={commitPartDraft}
                onKeyUp={commitPartDraft}
                onBlur={commitPartDraft}
                className="block w-full"
                style={{ accentColor: "#f0c040" }}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button data-testid="button-size-decrease" onClick={() => {
                  const resized = resizePetPartTransform(selectedPart, selectedPart.width - nudgeStep);
                  saveSelectedPartTransform({ width: resized.width, height: resized.height });
                }} disabled={updatePartMutation.isPending} className="rounded p-2 text-sm disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: "#f0c040" }}>− Smaller</button>
                <button data-testid="button-size-increase" onClick={() => {
                  const resized = resizePetPartTransform(selectedPart, selectedPart.width + nudgeStep);
                  saveSelectedPartTransform({ width: resized.width, height: resized.height });
                }} disabled={updatePartMutation.isPending} className="rounded p-2 text-sm disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: "#f0c040" }}>+ Larger</button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span style={{ color: "#a89878" }}>Rotation</span>
                <span style={{ color: "#e7d7b5" }}>{selectedPart.rotation ?? 0}°</span>
              </div>
              <input
                data-testid="input-part-rotation"
                type="range"
                min={-180}
                max={180}
                step={1}
                value={selectedPart.rotation ?? 0}
                disabled={updatePartMutation.isPending}
                onChange={(event) => updateSelectedPartDraft({ rotation: clampPetPartRotation(Number(event.target.value)) })}
                onPointerUp={commitPartDraft}
                onKeyUp={commitPartDraft}
                onBlur={commitPartDraft}
                className="block w-full"
                style={{ accentColor: "#f0c040" }}
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button type="button" aria-label="Rotate part left 15 degrees" onClick={() => saveSelectedPartTransform({ rotation: clampPetPartRotation((selectedPart.rotation ?? 0) - 15) })} disabled={updatePartMutation.isPending} className="grid place-items-center rounded p-2 disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: "#f0c040" }}><RotateCcw className="h-4 w-4" /></button>
                <button type="button" onClick={() => saveSelectedPartTransform({ rotation: 0 })} disabled={updatePartMutation.isPending} className="rounded p-2 text-[9px] disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: "#f0c040" }}>RESET</button>
                <button type="button" aria-label="Rotate part right 15 degrees" onClick={() => saveSelectedPartTransform({ rotation: clampPetPartRotation((selectedPart.rotation ?? 0) + 15) })} disabled={updatePartMutation.isPending} className="grid place-items-center rounded p-2 disabled:opacity-50" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: "#f0c040" }}><RotateCw className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[9px]" style={{ background: "rgba(0,0,0,.2)", color: "#a89878" }}>
              <span>Position: {selectedPart.posX}, {selectedPart.posY}</span>
              <span>Layer order unchanged · z {selectedPart.zIndex}</span>
            </div>
          </section>
        )}

        {viewParts.length > 0 && (
          <details className="rounded-lg px-3 py-2" style={{ background: "rgba(240,192,64,.06)", border: "1px solid rgba(240,192,64,.18)" }}>
            <summary className="cursor-pointer font-fantasy text-[9px] tracking-wider" style={{ color: "#a89878" }}>MOVE WHOLE PET</summary>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-fantasy text-[8px]" style={{ color: "#6a5840" }}>Step</span>
              <div className="flex gap-1.5">
                {([1, 5, 10] as const).map(step => (
                  <button key={step} data-testid={`button-nudge-step-${step}`} onClick={() => setNudgeStep(step)} className="rounded px-2 py-1 font-fantasy text-[9px]" style={{ background: nudgeStep === step ? "rgba(240,192,64,.25)" : "rgba(0,0,0,.25)", border: "1px solid rgba(240,192,64,.25)", color: nudgeStep === step ? "#f0c040" : "#6a5840" }}>{step}px</button>
                ))}
              </div>
            </div>
            <div className="mx-auto mt-3 grid w-fit grid-cols-3 gap-1">
              <span />
              <button data-testid="button-nudge-up" onClick={() => nudgeAll(0, -nudgeStep)} disabled={updatePartMutation.isPending} className="grid h-10 w-10 place-items-center rounded-lg disabled:opacity-50" style={{ background: "rgba(240,192,64,.12)", border: "1px solid rgba(240,192,64,.3)", color: "#f0c040" }}><ChevronUp className="h-5 w-5" /></button>
              <span />
              <button data-testid="button-nudge-left" onClick={() => nudgeAll(-nudgeStep, 0)} disabled={updatePartMutation.isPending} className="grid h-10 w-10 place-items-center rounded-lg disabled:opacity-50" style={{ background: "rgba(240,192,64,.12)", border: "1px solid rgba(240,192,64,.3)", color: "#f0c040" }}><ChevronLeft className="h-5 w-5" /></button>
              <span className="grid h-10 w-10 place-items-center rounded-lg text-[9px]" style={{ background: "rgba(0,0,0,.2)", color: "#6a5840" }}>↕↔</span>
              <button data-testid="button-nudge-right" onClick={() => nudgeAll(nudgeStep, 0)} disabled={updatePartMutation.isPending} className="grid h-10 w-10 place-items-center rounded-lg disabled:opacity-50" style={{ background: "rgba(240,192,64,.12)", border: "1px solid rgba(240,192,64,.3)", color: "#f0c040" }}><ChevronRight className="h-5 w-5" /></button>
              <span />
              <button data-testid="button-nudge-down" onClick={() => nudgeAll(0, nudgeStep)} disabled={updatePartMutation.isPending} className="grid h-10 w-10 place-items-center rounded-lg disabled:opacity-50" style={{ background: "rgba(240,192,64,.12)", border: "1px solid rgba(240,192,64,.3)", color: "#f0c040" }}><ChevronDown className="h-5 w-5" /></button>
              <span />
            </div>
          </details>
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
                      {/* Existing uploads can be selected for direct canvas editing or deleted. */}
                      {matchingParts.map((mp, idx) => (
                        <div key={mp.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`button-edit-part-${pt.key}-${idx}`}
                            onClick={() => setSelectedPartId(mp.id)}
                            className="grid h-7 w-7 place-items-center rounded"
                            style={{ background: selectedPartId === mp.id ? "rgba(127,255,212,.2)" : "rgba(0,0,0,.25)", border: "1px solid rgba(127,255,212,.25)", color: "#7fbfb0" }}
                            title={`Edit ${pt.label} #${idx + 1}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
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
                        </div>
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

        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider" style={{ color: "#a89878" }}>
          Animation profile
          <select
            data-testid="select-animation-profile"
            value={normalizeAnimationProfile(templateDetail.idleStyle, templateDetail.canFly)}
            onChange={(event) => animationProfileMutation.mutate({
              id: templateDetail.id,
              idleStyle: event.target.value as PetAnimationProfile,
            })}
            className="rounded-lg px-2 py-2 text-xs"
            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(106,88,64,0.5)", color: "#e7d7b5" }}
          >
            {PET_ANIMATION_PROFILES.map(profile => (
              <option key={profile} value={profile}>{profile.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>

        {editorTab === "parts" && !testMode && (
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

        {editorTab === "parts" && !testMode && (templateDetail.frontAssembledUrl || templateDetail.backAssembledUrl) && (
          <div className="mt-1">
            <p className="font-fantasy text-[9px] text-[#a89878] tracking-wider mb-2 text-center">Assembled Preview</p>
            <div className="flex justify-center gap-4">
              {templateDetail.frontAssembledUrl && (
                <div className="text-center">
                  <img
                    src={templateDetail.frontAssembledUrl}
                    alt="Front"
                    className="w-28 h-28 object-contain rounded-lg"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(127,255,212,0.2)" }}
                    data-testid="preview-front-assembled"
                  />
                  <span className="font-fantasy text-[8px] text-[#7fbfb0] tracking-wider">Front</span>
                </div>
              )}
              {templateDetail.backAssembledUrl && (
                <div className="text-center">
                  <img
                    src={templateDetail.backAssembledUrl}
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
                    form: editorTab === "evolution" ? "evolution" : "base",
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
                    {(isSide ? t.backAssembledUrl : t.frontAssembledUrl) ? (
                      <img src={(isSide ? t.backAssembledUrl : t.frontAssembledUrl) || ""} alt={t.name} className="w-full h-full object-contain" />
                    ) : t.frontAssembledUrl ? (
                      <img src={t.frontAssembledUrl} alt={t.name} className="w-full h-full object-contain" />
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
                    {(t.hasFrontAssembled || t.frontAssembledUrl) && (
                      <span className="font-fantasy text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(127,255,212,0.1)", color: "#7fbfb0", border: "1px solid rgba(127,255,212,0.2)" }}>
                        Front ✓
                      </span>
                    )}
                    {(t.hasBackAssembled || t.backAssembledUrl) && (
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

