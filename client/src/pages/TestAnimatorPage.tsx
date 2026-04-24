import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, Heart, Loader2, Save } from "lucide-react";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import PetAnimator from "@/components/PetAnimator";
import { useToast } from "@/hooks/use-toast";
import { renderPetGif, downloadBlob } from "@/lib/petGif";

type SaveAnimation = "idle" | "petting" | "sleep";

const ANIMATION_OPTIONS: { value: SaveAnimation; label: string; durationMs: number }[] = [
  { value: "idle",    label: "Idle",     durationMs: 4000 },
  { value: "petting", label: "Petting",  durationMs: 4500 },
  { value: "sleep",   label: "Sleeping", durationMs: 5500 },
];

interface PetTemplate { id: string; name: string }
interface PetPart {
  id: string; templateId: string; partType: string; view: string;
  imageUrl: string; posX: number; posY: number; width: number; height: number;
  zIndex: number; pivotX: number; pivotY: number;
}

// Templates allowed in the Test Animator pet list. "The Paradox" is the canonical
// reference pet; admin-created test pets (isTest=true) are appended automatically
// by PetDatabasePanel when testMode is on.
const ALLOWED_TEMPLATE_NAMES = ["The Paradox"];

export default function TestAnimatorPage({ user }: { user: { id: string; username: string; isAdmin?: boolean } }) {
  const { toast } = useToast();

  // Mirrors the inner PetDatabasePanel selection so the preview matches the
  // pet currently being edited.
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"front" | "side">("front");
  const [animation, setAnimation] = useState<SaveAnimation>("idle");
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<{ frames: number; total: number } | null>(null);

  // Fetch templates with test pets included so we can resolve display names.
  const { data: templates = [] } = useQuery<PetTemplate[]>({
    queryKey: ["/api/admin/pet-templates", "with-test"],
    queryFn: async () => {
      const r = await fetch("/api/admin/pet-templates?includeTest=true", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load templates");
      return r.json();
    },
  });
  const previewName = useMemo(
    () => templates.find(t => t.id === previewTemplateId)?.name ?? "pet",
    [templates, previewTemplateId],
  );

  // Pre-fetch parts for the selected pet so the Save button stays snappy.
  // The route wraps the parts array in { parts, facing, canFly } — we unwrap.
  const { data: parts = [] } = useQuery<PetPart[]>({
    queryKey: ["/api/pet-template-parts", previewTemplateId],
    enabled: !!previewTemplateId,
    queryFn: async () => {
      const r = await fetch(`/api/pet-template-parts/${previewTemplateId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load pet parts");
      const body = await r.json();
      return Array.isArray(body) ? body : (body?.parts ?? []);
    },
  });

  const handleSave = async () => {
    if (!previewTemplateId) {
      toast({ title: "Pick a pet first", description: "Open a template above so the preview has something to record.", variant: "destructive" });
      return;
    }
    if (parts.length === 0) {
      toast({ title: "No parts to save", description: "This pet doesn't have any parts uploaded yet.", variant: "destructive" });
      return;
    }
    const opt = ANIMATION_OPTIONS.find(o => o.value === animation)!;
    const view: "front" | "back" = facingMode === "side" ? "back" : "front";
    setIsCapturing(true);
    setCaptureProgress({ frames: 0, total: 0 });
    try {
      const result = await renderPetGif({
        parts,
        view,
        animation,
        durationMs: opt.durationMs,
        outputSize: 400,
        fps: 18,
        onProgress: (frame, total) => setCaptureProgress({ frames: frame, total }),
      });
      const safeName = previewName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      downloadBlob(result.blob, `${safeName}_${animation}_${facingMode}.gif`);
      toast({
        title: "GIF saved",
        description: `${result.frameCount} frames · ${(result.blob.size / 1024).toFixed(0)} KB`,
      });
    } catch (err: any) {
      toast({ title: "Couldn't save GIF", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setIsCapturing(false);
      setCaptureProgress(null);
    }
  };

  return (
    <div
      data-testid="test-animator-page"
      className="fixed inset-0 overflow-y-auto"
      style={{ zIndex: 9000, background: "#060a10" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 w-full"
        style={{
          zIndex: 50,
          background: "rgba(6,10,16,0.92)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(127,191,176,0.07)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <Link
            href="/hub"
            data-testid="link-test-animator-back"
            className="flex items-center gap-2 font-fantasy text-xs tracking-widest transition-all active:scale-95"
            style={{
              color: "#7fbfb0",
              border: "1px solid rgba(127,191,176,0.25)",
              borderRadius: 9999,
              padding: "7px 14px",
              background: "rgba(127,191,176,0.06)",
            }}
          >
            <ArrowLeft size={14} />
            Back to Hub
          </Link>

          <div className="flex items-center gap-2">
            <FlaskConical size={14} style={{ color: "#f0c040" }} />
            <span
              className="font-fantasy text-xs tracking-widest"
              style={{ color: "#f0c040", letterSpacing: "0.18em" }}
            >
              ANIMATOR TESTBED
            </span>
          </div>

          <span
            className="font-fantasy text-[10px] tracking-widest hidden sm:inline"
            style={{ color: "rgba(240,192,64,0.6)" }}
          >
            {user?.username}
          </span>
        </div>
      </div>

      {/* ── Editor body ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-5 pb-6">
        <PetDatabasePanel
          onSelectedTemplateChange={setPreviewTemplateId}
          onFacingModeChange={setFacingMode}
          testMode
          templateNameFilter={ALLOWED_TEMPLATE_NAMES}
        />
      </div>

      {/* ── Save section ─────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pb-32" id="save-section">
        <SaveSection
          previewTemplateId={previewTemplateId}
          previewName={previewName}
          facingMode={facingMode}
          animation={animation}
          onAnimationChange={setAnimation}
          onSave={handleSave}
          isCapturing={isCapturing}
          captureProgress={captureProgress}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* SAVE section                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

interface SaveSectionProps {
  previewTemplateId: string | null;
  previewName: string;
  facingMode: "front" | "side";
  animation: SaveAnimation;
  onAnimationChange: (a: SaveAnimation) => void;
  onSave: () => void;
  isCapturing: boolean;
  captureProgress: { frames: number; total: number } | null;
}

function SaveSection({
  previewTemplateId, previewName, facingMode, animation,
  onAnimationChange, onSave, isCapturing, captureProgress,
}: SaveSectionProps) {
  const view = facingMode === "side" ? "back" : "front";
  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{
        background: "linear-gradient(135deg, rgba(8,14,22,0.95), rgba(6,10,16,0.95))",
        border: "1px solid rgba(240,192,64,0.30)",
        boxShadow: "0 0 28px rgba(240,192,64,0.06), inset 0 1px 0 rgba(240,192,64,0.06)",
      }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <span
          className="font-fantasy text-xs tracking-widest"
          style={{ color: "#f0c040", letterSpacing: "0.20em" }}
        >
          SAVE
        </span>
        <span
          className="font-fantasy text-[10px] tracking-widest"
          style={{ color: "rgba(240,220,160,0.5)" }}
        >
          {facingMode === "side" ? "SIDE FACING" : "FRONT FACING"}
        </span>
      </div>

      {/* Animation picker + preview */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Left: animation dropdown + Save GIF button */}
        <div className="sm:w-48 flex flex-col gap-3 flex-shrink-0">
          <label className="block">
            <span
              className="font-fantasy text-[10px] tracking-widest block mb-1.5"
              style={{ color: "rgba(240,220,160,0.7)" }}
            >
              ANIMATION
            </span>
            <select
              data-testid="select-test-animator-animation"
              value={animation}
              onChange={(e) => onAnimationChange(e.target.value as SaveAnimation)}
              disabled={isCapturing}
              className="w-full font-fantasy text-sm tracking-widest rounded-xl px-3 py-2.5 outline-none"
              style={{
                color: "#f0c040",
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(240,192,64,0.30)",
                letterSpacing: "0.12em",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23f0c040' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                paddingRight: 32,
              }}
            >
              {ANIMATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} style={{ color: "#000" }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <button
            data-testid="button-test-animator-save-gif"
            onClick={onSave}
            disabled={isCapturing || !previewTemplateId}
            className="flex items-center justify-center gap-2 font-fantasy text-sm tracking-widest transition-all active:scale-95 w-full"
            style={{
              color: "#060a10",
              borderRadius: 9999,
              padding: "12px 18px",
              background: previewTemplateId
                ? "linear-gradient(135deg,#f0c040 0%,#b58a1a 100%)"
                : "rgba(120,100,40,0.4)",
              boxShadow: previewTemplateId
                ? "0 0 22px rgba(240,192,64,0.35), 0 4px 14px rgba(0,0,0,0.6)"
                : "none",
              letterSpacing: "0.12em",
              border: "1px solid rgba(240,220,160,0.4)",
              opacity: isCapturing ? 0.7 : 1,
              cursor: isCapturing || !previewTemplateId ? "not-allowed" : "pointer",
            }}
          >
            {isCapturing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <Save size={16} />
                Save GIF
              </>
            )}
          </button>

          {captureProgress && captureProgress.total > 0 && (
            <p
              data-testid="text-capture-progress"
              className="font-fantasy text-[10px] tracking-widest text-center"
              style={{ color: "rgba(240,220,160,0.6)" }}
            >
              {captureProgress.frames} / {captureProgress.total} frames
            </p>
          )}

          <p
            className="font-fantasy text-[10px] leading-snug"
            style={{ color: "rgba(240,220,160,0.45)" }}
          >
            Transparent animated GIF, ~400×400. The download stays on your device — it isn't uploaded to the game.
          </p>
        </div>

        {/* Right: large preview area */}
        <div className="flex-1 flex items-center justify-center">
          <PreviewArea
            templateId={previewTemplateId}
            view={view}
            animation={animation}
            previewName={previewName}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Preview area                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function PreviewArea({
  templateId, view, animation, previewName,
}: {
  templateId: string | null;
  view: "front" | "back";
  animation: SaveAnimation;
  previewName: string;
}) {
  // Card around the preview is large (~400×400 on tablet, full width on phone)
  // so the admin can clearly see what they're about to save.
  // The live preview here is for VISUAL approval only — the actual GIF is
  // rendered frame-by-frame on a separate offscreen canvas (see petGif.ts).
  const previewMode: "idle" | "petting" | "sleep" =
    animation === "petting" ? "petting" :
    animation === "sleep"   ? "sleep"   : "idle";

  return (
    <div
      data-testid="test-animator-preview-card"
      className="rounded-2xl flex flex-col items-center justify-center"
      style={{
        background:
          // Subtle dark checker so transparent areas read as transparent.
          "repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%, rgba(0,0,0,0) 0% 50%) 50% / 28px 28px, radial-gradient(ellipse at 50% 60%, rgba(127,191,176,0.06), rgba(0,0,0,0) 70%)",
        border: "1px solid rgba(127,191,176,0.18)",
        padding: 16,
        width: "100%",
        maxWidth: 420,
        aspectRatio: "1 / 1",
        position: "relative",
      }}
    >
      <div
        data-testid="test-animator-preview"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        {templateId ? (
          <>
            <PetAnimator
              key={`${templateId}-${animation}-${view}`}
              petTemplateId={templateId}
              mode={previewMode}
              view={view}
              size={400}
              fillContainer
            />
            {animation === "petting" && <HeartsOverlay />}
            {animation === "sleep" && <SleepZsOverlay />}
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center font-fantasy text-xs tracking-widest text-center px-6"
            style={{ color: "rgba(127,191,176,0.55)", letterSpacing: "0.14em" }}
          >
            PICK A PET TEMPLATE ABOVE TO PREVIEW
          </div>
        )}
      </div>

      {templateId && (
        <span
          className="absolute bottom-2 right-3 font-fantasy text-[9px] tracking-widest"
          style={{ color: "rgba(240,220,160,0.5)", letterSpacing: "0.16em" }}
        >
          {previewName.toUpperCase()}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Hearts overlay (for the Petting preview, matches Pet Care page feel)        */
/* ─────────────────────────────────────────────────────────────────────────── */

interface HeartParticle { id: number; left: number; size: number; hue: number; delay: number }

function HeartsOverlay() {
  const [hearts, setHearts] = useState<HeartParticle[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    let active = true;
    const spawn = () => {
      if (!active) return;
      const id = ++idCounter.current;
      // Spawn near the pet's torso area — random horizontal jitter.
      const left = 32 + Math.random() * 36;
      const size = 14 + Math.random() * 12;
      const hue = 340 + Math.random() * 30;
      const delay = Math.random() * 0.2;
      setHearts(prev => [...prev, { id, left, size, hue, delay }]);
      // Auto-remove after the float-up animation finishes (2.4s)
      setTimeout(() => {
        if (!active) return;
        setHearts(prev => prev.filter(h => h.id !== id));
      }, 2600);
    };
    // Quick first heart so the preview shows life immediately
    spawn();
    // 280ms cadence → roughly twice as many hearts on screen at once
    // ("more hearts" per the design brief).
    const t = window.setInterval(spawn, 280);
    return () => { active = false; window.clearInterval(t); };
  }, []);

  return (
    <div
      data-testid="hearts-overlay"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 200, overflow: "hidden" }}
    >
      <style>{`
        @keyframes petTestHeartFloat {
          0%   { transform: translate(-50%, 0) scale(0.6) rotate(-8deg); opacity: 0; }
          15%  { transform: translate(-50%, -10%) scale(1) rotate(0deg);  opacity: 1; }
          70%  { transform: translate(-50%, -55%) scale(1.05) rotate(6deg); opacity: 0.85; }
          100% { transform: translate(-50%, -85%) scale(0.7) rotate(-4deg); opacity: 0; }
        }
      `}</style>
      {hearts.map(h => (
        <div
          key={h.id}
          style={{
            position: "absolute",
            left: `${h.left}%`,
            top: "55%",
            width: h.size,
            height: h.size,
            transform: "translate(-50%, 0)",
            animation: `petTestHeartFloat 2.4s ease-out ${h.delay}s forwards`,
          }}
        >
          <Heart
            size={h.size}
            fill={`hsl(${h.hue} 80% 65%)`}
            stroke={`hsl(${h.hue} 90% 50%)`}
            strokeWidth={1.5}
            style={{
              filter: `drop-shadow(0 0 6px hsla(${h.hue}, 90%, 60%, 0.55))`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Floating Z's overlay (for the Sleeping preview)                             */
/* ─────────────────────────────────────────────────────────────────────────── */

interface ZParticle { id: number; left: number; size: number; delay: number }

function SleepZsOverlay() {
  const [zs, setZs] = useState<ZParticle[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    let active = true;
    const spawn = () => {
      if (!active) return;
      const id = ++idCounter.current;
      const left = 55 + Math.random() * 18;
      const size = 18 + Math.random() * 12;
      const delay = Math.random() * 0.2;
      setZs(prev => [...prev, { id, left, size, delay }]);
      setTimeout(() => {
        if (!active) return;
        setZs(prev => prev.filter(z => z.id !== id));
      }, 3600);
    };
    spawn();
    const t = window.setInterval(spawn, 1300);
    return () => { active = false; window.clearInterval(t); };
  }, []);

  return (
    <div
      data-testid="sleep-zs-overlay"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 200, overflow: "hidden" }}
    >
      <style>{`
        @keyframes petTestZDrift {
          0%   { transform: translate(-50%, 0) scale(0.55) rotate(-6deg);  opacity: 0; }
          12%  { transform: translate(-50%, -8%) scale(1) rotate(0deg);    opacity: 0.95; }
          75%  { transform: translate(-30%, -55%) scale(1.15) rotate(8deg); opacity: 0.7; }
          100% { transform: translate(-15%, -85%) scale(0.85) rotate(12deg); opacity: 0; }
        }
      `}</style>
      {zs.map(z => (
        <div
          key={z.id}
          className="font-fantasy"
          style={{
            position: "absolute",
            left: `${z.left}%`,
            top: "32%",
            transform: "translate(-50%, 0)",
            fontSize: z.size,
            color: "rgba(127,191,176,0.85)",
            textShadow: "0 0 10px rgba(127,191,176,0.55)",
            animation: `petTestZDrift 3.4s ease-out ${z.delay}s forwards`,
            letterSpacing: "0.05em",
            fontWeight: 500,
          }}
        >
          z
        </div>
      ))}
    </div>
  );
}
