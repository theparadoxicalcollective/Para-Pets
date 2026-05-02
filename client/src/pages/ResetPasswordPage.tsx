import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import bgImg from "@assets/bg_login.png";
import logoImg from "@assets/logo_parapets.png";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: tokenCheck, isLoading } = useQuery<{ valid: boolean }>({
    queryKey: ["/api/auth/reset-password", token],
    queryFn: async () => {
      const res = await fetch(`/api/auth/reset-password/${token}`);
      return res.json();
    },
    retry: false,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      return res.json();
    },
    onSuccess: () => {
      setResetComplete(true);
      toast({ title: "Password Reset", description: "Your password has been updated successfully" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Reset Failed", description: parsed.message || msg || "Failed to reset password", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Invalid Password", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Mismatch", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    resetMutation.mutate();
  };

  const inputStyle = {
    background: "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)",
    border: "2px solid #8b5e3c",
    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1)",
  };

  return (
    <div
      className="relative h-screen-frame w-full overflow-hidden flex flex-col items-center"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-black/40 z-0" />

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6 py-8 h-full overflow-y-auto">
        <div className="mb-4">
          <img
            src={logoImg}
            alt="Para Pets"
            className="w-48 mx-auto drop-shadow-2xl"
            style={{ filter: "drop-shadow(0 0 20px rgba(127,191,176,0.5))" }}
          />
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          {isLoading ? (
            <div className="text-center">
              <p className="font-fantasy text-[#7fbfb0] text-sm animate-pulse tracking-wider">Validating reset link...</p>
            </div>
          ) : !tokenCheck?.valid ? (
            <div className="text-center space-y-4">
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,0,0,0.3)", border: "2px solid rgba(200,50,50,0.4)" }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff6666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <h2 className="font-fantasy text-[#ff9999] text-lg tracking-widest" data-testid="text-invalid-token">Invalid Reset Link</h2>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider">This reset link is invalid or has expired.</p>
              <button
                data-testid="button-back-to-login"
                onClick={() => navigate("/auth")}
                className="font-fantasy text-[#d4a017] text-sm tracking-wider hover:text-[#f0c040] transition-colors"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                Back to Sign In
              </button>
            </div>
          ) : resetComplete ? (
            <div className="text-center space-y-4">
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                style={{ background: "rgba(45,106,79,0.3)", border: "2px solid rgba(127,255,212,0.4)" }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7fffd4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="font-fantasy text-[#7fffd4] text-lg tracking-widest" data-testid="text-reset-success">Password Updated</h2>
              <p className="font-fantasy text-[#a89878] text-xs tracking-wider">Your password has been reset successfully.</p>
              <button
                data-testid="button-go-to-login"
                onClick={() => navigate("/auth")}
                className="w-full py-3 rounded-md font-fantasy text-sm tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                  border: "1px solid rgba(127,255,212,0.4)",
                  color: "#7fffd4",
                  cursor: "pointer",
                }}
              >
                Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-fantasy text-[#d4b896] text-center text-xl tracking-widest mb-2">Reset Password</h2>
              <p className="font-fantasy text-[#a89878] text-xs text-center tracking-wider mb-6">Enter your new password below</p>

              <div className="space-y-4">
                <div>
                  <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">NEW PASSWORD</label>
                  <div className="relative">
                    <input
                      data-testid="input-new-password"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      disabled={resetMutation.isPending}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-3 pr-12 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-60"
                      style={inputStyle}
                    />
                    <button
                      data-testid="button-toggle-new-password"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 font-fantasy text-[10px] tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(139,94,60,0.3)", border: "1px solid rgba(139,94,60,0.5)", color: "#8b5e3c", cursor: "pointer" }}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">CONFIRM PASSWORD</label>
                  <input
                    data-testid="input-confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    disabled={resetMutation.isPending}
                    placeholder="Re-enter password"
                    className="w-full px-4 py-3 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-60"
                    style={inputStyle}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 mt-6">
                <button
                  data-testid="button-submit-reset"
                  onClick={handleSubmit}
                  disabled={resetMutation.isPending}
                  className="w-full py-3 rounded-md font-fantasy text-sm tracking-wider transition-transform active:scale-95 disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)",
                    border: "1px solid rgba(127,255,212,0.4)",
                    color: "#7fffd4",
                    cursor: "pointer",
                    boxShadow: "0 0 12px rgba(127,255,212,0.2)",
                  }}
                >
                  {resetMutation.isPending ? "Resetting..." : "Set New Password"}
                </button>

                <button
                  data-testid="button-back-to-login-from-reset"
                  onClick={() => navigate("/auth")}
                  className="font-fantasy text-[#a89878] text-xs tracking-widest hover:text-[#d4b896] transition-colors"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
