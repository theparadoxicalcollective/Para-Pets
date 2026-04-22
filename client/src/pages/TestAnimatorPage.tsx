import { Link } from "wouter";
import { ArrowLeft, FlaskConical, Save } from "lucide-react";
import PetDatabasePanel from "@/components/PetDatabasePanel";
import { useToast } from "@/hooks/use-toast";

export default function TestAnimatorPage({ user }: { user: { id: string; username: string; isAdmin?: boolean } }) {
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Save not connected yet",
      description: "The Test Animator save flow will be wired up next.",
    });
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

      {/* ── Test-mode banner ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-5 pt-5">
        <div
          data-testid="test-animator-banner"
          className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, rgba(40,28,0,0.85), rgba(28,20,0,0.85))",
            border: "1px solid rgba(240,192,64,0.35)",
            boxShadow: "0 0 24px rgba(240,192,64,0.08), inset 0 1px 0 rgba(240,192,64,0.08)",
          }}
        >
          <FlaskConical size={18} style={{ color: "#f0c040", flexShrink: 0 }} />
          <div className="flex-1">
            <p
              className="font-fantasy text-xs tracking-widest"
              style={{ color: "#f0c040" }}
            >
              Test Animator
            </p>
            <p
              className="font-fantasy text-[10px] mt-0.5"
              style={{ color: "rgba(240,220,160,0.7)" }}
            >
              A sandbox replica of the Pet Parts editor for visual experimentation. Use the Save button at the bottom when you're ready to commit a build (Save is not wired up yet).
            </p>
          </div>
        </div>
      </div>

      {/* ── Editor body ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 pb-32">
        <PetDatabasePanel />
      </div>

      {/* ── Floating Save button (placeholder — not wired up) ────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0"
        style={{
          zIndex: 60,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)",
          paddingTop: 14,
          background: "linear-gradient(to top, rgba(6,10,16,0.96) 60%, rgba(6,10,16,0))",
          pointerEvents: "none",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 flex justify-center" style={{ pointerEvents: "auto" }}>
          <button
            data-testid="button-test-animator-save"
            onClick={handleSave}
            className="flex items-center gap-2 font-fantasy text-sm tracking-widest transition-all active:scale-95"
            style={{
              color: "#060a10",
              borderRadius: 9999,
              padding: "12px 36px",
              background: "linear-gradient(135deg,#f0c040 0%,#b58a1a 100%)",
              boxShadow: "0 0 22px rgba(240,192,64,0.35), 0 4px 14px rgba(0,0,0,0.6)",
              letterSpacing: "0.12em",
              border: "1px solid rgba(240,220,160,0.4)",
            }}
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
