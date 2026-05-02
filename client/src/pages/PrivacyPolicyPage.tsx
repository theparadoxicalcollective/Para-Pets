import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PrivacyPolicyPageProps {
  user?: {
    isAdmin: boolean;
  } | null;
}

export default function PrivacyPolicyPage({ user }: PrivacyPolicyPageProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ text: string }>({
    queryKey: ["/api/privacy-policy"],
    queryFn: async () => {
      const res = await fetch("/api/privacy-policy");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/admin/privacy-policy", { text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privacy-policy"] });
      setEditing(false);
      toast({ title: "Saved", description: "Privacy policy updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save privacy policy", variant: "destructive" });
    },
  });

  const handleEditOpen = () => {
    setDraftText(data?.text ?? "");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraftText("");
  };

  const policyText = data?.text ?? "";
  const paragraphs = policyText.split(/\n\n+/).filter(p => p.trim());

  return (
    <div
      className="h-screen-frame flex flex-col relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #040a04 0%, #061508 30%, #0a1e0d 60%, #040a04 100%)" }}
    >
      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{
          background: "linear-gradient(180deg, rgba(0,10,0,0.85) 0%, transparent 100%)",
        }}
      >
        <button
          data-testid="button-back-privacy"
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(127,255,212,0.2)",
            color: "#7fbfb0",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={16} />
        </button>

        <p
          className="font-fantasy text-sm tracking-widest"
          style={{ color: "rgba(127,255,212,0.75)" }}
        >
          Privacy Policy
        </p>

        {user?.isAdmin ? (
          <button
            data-testid="button-edit-privacy"
            onClick={handleEditOpen}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(212,160,23,0.3)",
              color: "#d4a017",
              cursor: "pointer",
            }}
          >
            <Pencil size={14} />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-10 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <p className="font-fantasy text-xs animate-pulse" style={{ color: "rgba(127,255,212,0.4)" }}>
              Loading...
            </p>
          </div>
        ) : policyText.trim() === "" ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p
              className="font-fantasy text-sm text-center tracking-wider"
              style={{ color: "rgba(127,255,212,0.3)" }}
              data-testid="text-privacy-empty"
            >
              No privacy policy has been set yet.
            </p>
            {user?.isAdmin && (
              <p className="font-fantasy text-[10px] text-center" style={{ color: "rgba(212,160,23,0.4)" }}>
                Use the edit button above to add one.
              </p>
            )}
          </div>
        ) : (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(5,20,8,0.6)",
              border: "1px solid rgba(127,255,212,0.12)",
            }}
          >
            {paragraphs.map((para, i) => (
              <p
                key={i}
                data-testid={`text-privacy-para-${i}`}
                className="text-sm leading-relaxed mb-4 last:mb-0"
                style={{ color: "rgba(240,232,208,0.8)", whiteSpace: "pre-wrap" }}
              >
                {para.trim()}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Admin edit panel — slides up from bottom */}
      {editing && (
        <div
          className="absolute inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="mt-auto rounded-t-3xl flex flex-col"
            style={{
              maxHeight: "90dvh",
              background: "linear-gradient(180deg, #0d1a0d 0%, #081208 100%)",
              border: "1px solid rgba(212,160,23,0.25)",
              borderBottom: "none",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(212,160,23,0.3)" }} />
            </div>

            <div className="px-5 pb-2 flex items-center justify-between">
              <p className="font-fantasy text-sm tracking-wider" style={{ color: "#d4a017" }}>
                Edit Privacy Policy
              </p>
              <button
                data-testid="button-cancel-privacy-edit"
                onClick={handleCancel}
                style={{ background: "none", border: "none", color: "#a89878", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="font-fantasy text-[9px] px-5 pb-2" style={{ color: "rgba(168,152,120,0.5)" }}>
              Paste or type your full privacy policy below. Use blank lines to separate paragraphs.
            </p>

            <textarea
              data-testid="textarea-privacy-policy"
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              placeholder="Paste your privacy policy here..."
              className="flex-1 mx-5 mb-4 rounded-xl p-4 text-sm resize-none outline-none"
              style={{
                minHeight: 240,
                maxHeight: "55dvh",
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(127,255,212,0.2)",
                color: "#f0e8d0",
                fontFamily: "inherit",
                lineHeight: 1.6,
              }}
            />

            <div className="px-5 pb-6 flex gap-3">
              <button
                data-testid="button-save-privacy"
                onClick={() => saveMutation.mutate(draftText)}
                disabled={saveMutation.isPending}
                className="flex-1 py-3 rounded-xl font-fantasy text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #1a4a2e 0%, #2d6a4f 100%)",
                  border: "1px solid rgba(127,255,212,0.35)",
                  color: "#7fffd4",
                  cursor: "pointer",
                }}
              >
                <Check size={14} />
                {saveMutation.isPending ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
