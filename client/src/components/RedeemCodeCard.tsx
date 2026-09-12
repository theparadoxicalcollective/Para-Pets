import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RedeemCodeCardProps {
  user?: { emailVerified?: boolean } | null;
  onSignIn: () => void;
}

export default function RedeemCodeCard({ user, onSignIn }: RedeemCodeCardProps) {
  const [code, setCode] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const redeem = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/redeem-code", { code });
      return response.json();
    },
    onSuccess: async (data: { message: string }) => {
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["/api/rewards/pending"] });
      toast({ title: "Code Redeemed!", description: data.message });
    },
    onError: (error: Error) => {
      let message = "That code could not be redeemed";
      const json = error.message.match(/\{.*\}$/)?.[0];
      if (json) { try { message = JSON.parse(json).message || message; } catch {} }
      toast({ title: "Unable to Redeem", description: message, variant: "destructive" });
    },
  });

  const submit = () => {
    if (!user) return onSignIn();
    if (!user.emailVerified) {
      toast({ title: "Email Verification Required", description: "Verify your email before redeeming a code.", variant: "destructive" });
      return;
    }
    if (code.trim().length < 3) return;
    redeem.mutate();
  };

  return (
    <section data-testid="hub-redeem-code" style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: "24px 18px", background: "radial-gradient(circle at 50% 0%, rgba(74,150,74,.18), transparent 55%), linear-gradient(145deg, rgba(8,38,26,.96), rgba(3,20,14,.98))", border: "1px solid rgba(212,168,67,.42)", boxShadow: "0 12px 32px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,232,150,.08)" }}>
      <Sparkles aria-hidden style={{ position: "absolute", right: 14, top: 12, width: 22, color: "rgba(212,168,67,.35)" }} />
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(212,168,67,.1)", border: "1px solid rgba(212,168,67,.42)", boxShadow: "0 0 22px rgba(75,180,95,.18)" }}>
          <Gift aria-hidden style={{ width: 23, color: "#e2bd5c" }} />
        </div>
        <h2 className="font-fantasy tracking-widest mt-3" style={{ color: "#e2bd5c", fontSize: "1rem", textShadow: "0 0 12px rgba(212,168,67,.35)" }}>REDEEM CODE</h2>
        <p className="font-fantasy mt-1 mb-4" style={{ color: "#7fbfb0", fontSize: 10, letterSpacing: ".07em" }}>Enter a realm code to send its treasure to your Reward Box.</p>
        <div className="flex w-full max-w-md gap-2">
          <input data-testid="input-hub-redeem-code" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/\s/g, ""))} onKeyDown={event => { if (event.key === "Enter") submit(); }} maxLength={32} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="ENTER CODE" className="font-fantasy min-w-0 flex-1 outline-none" style={{ height: 44, borderRadius: 12, padding: "0 14px", background: "rgba(1,12,8,.78)", border: "1px solid rgba(127,191,176,.38)", color: "#f0d770", textAlign: "center", letterSpacing: ".14em", fontSize: 12, boxShadow: "inset 0 2px 8px rgba(0,0,0,.45)" }} />
          <button data-testid="button-hub-redeem-code" onClick={submit} disabled={redeem.isPending || (!!user && code.trim().length < 3)} className="font-fantasy tracking-wider transition-all active:scale-95 disabled:opacity-50" style={{ minWidth: 92, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#3a7a20,#1a5010)", border: "1px solid rgba(212,168,67,.6)", color: "#f0d060", boxShadow: "0 0 16px rgba(46,160,46,.2)", fontSize: 11 }}>
            {redeem.isPending ? "Opening…" : user ? "Redeem" : "Sign In"}
          </button>
        </div>
        {user && !user.emailVerified && <p data-testid="redeem-code-verification-note" className="font-fantasy mt-3" style={{ color: "#d7a56c", fontSize: 9 }}>Email verification is required to redeem codes.</p>}
      </div>
    </section>
  );
}

