import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/logo_parapets.png";
import bgImg from "@assets/bg_login.png";
import signInBtn from "@assets/btn_signin_v2.png";
import createAccountBtn from "@assets/btn_create_v2.png";

type Mode = "landing" | "login" | "register";

function resizeImageTo500(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = Math.min(img.width, img.height);
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext("2d")!;
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 500, 500);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("landing");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileImageData, setProfileImageData] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageTo500(file);
      setProfileImageData(resized);
      setProfilePreview(resized);
    } catch {
      toast({ title: "Image Error", description: "Failed to process image", variant: "destructive" });
    }
  }, [toast]);

  const simulateLoad = () => {
    return new Promise<void>((resolve) => {
      setLoadingProgress(0);
      setIsLoading(true);
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 90) {
          clearInterval(interval);
          setLoadingProgress(90);
        } else {
          setLoadingProgress(progress);
        }
      }, 120);
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 1500);
    });
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      await simulateLoad();
      const res = await apiRequest("POST", "/api/auth/login", { username, password, rememberMe });
      return res.json();
    },
    onSuccess: async () => {
      setLoadingProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => {
        setLocation("/");
      }, 300);
    },
    onError: (err: any) => {
      setIsLoading(false);
      setLoadingProgress(0);
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Login Failed", description: parsed.message || msg || "Invalid credentials", variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      await simulateLoad();
      const res = await apiRequest("POST", "/api/auth/register", { username, email, password, profileImageData });
      return res.json();
    },
    onSuccess: async () => {
      setLoadingProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => {
        setLocation("/");
      }, 300);
    },
    onError: (err: any) => {
      setIsLoading(false);
      setLoadingProgress(0);
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      toast({ title: "Registration Failed", description: parsed.message || msg || "Registration failed", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (isLoading) return;
    if (mode === "login") loginMutation.mutate();
    else registerMutation.mutate();
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden flex flex-col items-center"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 z-0" />

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6 py-8 min-h-[100dvh]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex flex-col items-center w-full">
          <div className="mb-3 text-center animate-fade-in">
            <img
              src={logoImg}
              alt="Para Pets"
              className="w-72 mx-auto drop-shadow-2xl"
              style={{ filter: "drop-shadow(0 0 20px rgba(127,191,176,0.5))" }}
            />
          </div>

          {mode === "landing" && (
            <div className="flex flex-col items-center gap-3 mt-2 w-full animate-slide-up">
              <p className="font-fantasy text-[#c8d8b0] text-center text-sm tracking-wider px-4 leading-relaxed">
                A world of magical companions awaits.
                <br />Embark on your journey now.
              </p>

              <button
                data-testid="button-signin"
                onClick={() => setMode("login")}
                className="w-[72%] max-w-[290px] mx-auto block transition-transform duration-150 active:scale-95"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <img src={signInBtn} alt="Sign In" className="w-full h-auto object-contain drop-shadow-lg block" />
              </button>

              <button
                data-testid="button-create-account"
                onClick={() => setMode("register")}
                className="w-[72%] max-w-[290px] mx-auto block transition-transform duration-150 active:scale-95"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <img src={createAccountBtn} alt="Create Account" className="w-full h-auto object-contain drop-shadow-lg block" />
              </button>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="w-full max-w-sm animate-slide-up">
              <h2 className="font-fantasy text-[#d4b896] text-center text-xl tracking-widest mb-6 drop-shadow-lg">
                {mode === "login" ? "Welcome Back" : "Begin Your Journey"}
              </h2>

            <div className="space-y-4">
              {mode === "register" && (
                <>
                  <div className="relative">
                    <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">EMAIL</label>
                    <input
                      data-testid="input-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={isPending}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-60"
                      style={{
                        background: "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)",
                        border: "2px solid #8b5e3c",
                        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">PROFILE PICTURE</label>
                    <div className="flex items-center gap-3">
                      {profilePreview ? (
                        <div
                          className="w-14 h-14 rounded-full overflow-hidden cursor-pointer border-2 border-[#d4a017] flex-shrink-0"
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="img-profile-preview"
                          style={{ boxShadow: "0 0 10px rgba(212,160,23,0.5)" }}
                        >
                          <img src={profilePreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full cursor-pointer border-2 border-dashed border-[#8b5e3c] flex items-center justify-center flex-shrink-0 transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="button-upload-avatar"
                          style={{ background: "rgba(242,232,208,0.15)" }}
                        >
                          <span className="text-[#c8b896] text-2xl">+</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-fantasy text-xs text-[#c8b896] tracking-wider py-2 px-4 rounded-md transition-opacity hover:opacity-80"
                        style={{
                          background: "rgba(139,94,60,0.4)",
                          border: "1px solid #8b5e3c",
                        }}
                      >
                        {profilePreview ? "Change Photo" : "Choose Photo"}
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">
                  {mode === "login" ? "USERNAME OR EMAIL" : "USERNAME"}
                </label>
                <input
                  data-testid="input-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={isPending}
                  placeholder={mode === "login" ? "Username or email" : "HeroName123"}
                  className="w-full px-4 py-3 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)",
                    border: "2px solid #8b5e3c",
                    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1)",
                  }}
                />
              </div>

              <div>
                <label className="font-fantasy text-[#c8b896] text-xs tracking-wider block mb-1 ml-1">PASSWORD</label>
                <div className="relative">
                  <input
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isPending}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-md font-sans text-sm text-[#2a1a0a] placeholder-[#8a7060] outline-none focus:ring-2 focus:ring-[#d4a017] disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #f2e8d0 0%, #e8d8b0 100%)",
                      border: "2px solid #8b5e3c",
                      boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.1)",
                    }}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  />
                  <button
                    data-testid="button-toggle-password"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-fantasy text-[10px] tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(139,94,60,0.3)",
                      border: "1px solid rgba(139,94,60,0.5)",
                      color: "#8b5e3c",
                      cursor: "pointer",
                    }}
                  >
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              {mode === "login" && (
                <button
                  data-testid="button-remember-me"
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-2 mt-1"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      background: rememberMe
                        ? "linear-gradient(135deg, #2d6a4f 0%, #1a4a2e 100%)"
                        : "rgba(242,232,208,0.15)",
                      border: rememberMe
                        ? "2px solid rgba(127,255,212,0.5)"
                        : "2px solid #8b5e3c",
                    }}
                  >
                    {rememberMe && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7fffd4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="font-fantasy text-[#c8b896] text-xs tracking-wider">Remember Me</span>
                </button>
              )}
            </div>

            {isLoading && (
              <div className="mt-5 space-y-2">
                <div className="relative w-full h-5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid #5c3a1e" }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${loadingProgress}%`,
                      background: "linear-gradient(90deg, #1a6b55 0%, #2d9b7a 50%, #7fffd4 100%)",
                      boxShadow: "0 0 10px rgba(127,255,212,0.6)",
                    }}
                  />
                </div>
                <p className="font-fantasy text-[#7fffd4] text-xs text-center tracking-widest animate-pulse">
                  {mode === "login" ? "Entering the realm..." : "Creating your legend..."}
                </p>
              </div>
            )}

            <div className="flex flex-col items-center gap-4 mt-6">
              {mode === "login" ? (
                <button
                  data-testid="button-submit-signin"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="w-[65%] max-w-[260px] transition-transform duration-150 active:scale-93 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <img src={signInBtn} alt="Sign In" className="w-full h-auto object-contain drop-shadow-lg" style={isPending ? { filter: "brightness(0.7)" } : {}} />
                </button>
              ) : (
                <button
                  data-testid="button-submit-register"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="w-[65%] max-w-[260px] transition-transform duration-150 active:scale-93 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <img src={createAccountBtn} alt="Create Account" className="w-full h-auto object-contain drop-shadow-lg" style={isPending ? { filter: "brightness(0.7)" } : {}} />
                </button>
              )}

              <button
                data-testid="button-back"
                onClick={() => { setMode("landing"); setUsername(""); setEmail(""); setPassword(""); setProfileImageData(null); setProfilePreview(null); setIsLoading(false); setLoadingProgress(0); setShowPassword(false); }}
                disabled={isPending}
                className="font-fantasy text-[#a89878] text-xs tracking-widest hover:text-[#d4b896] transition-colors disabled:opacity-40"
              >
                ← BACK
              </button>

              {mode === "login" && (
                <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                  New traveler?{" "}
                  <button
                    data-testid="button-switch-to-register"
                    onClick={() => setMode("register")}
                    disabled={isPending}
                    className="text-[#d4a017] hover:text-[#f0c040] transition-colors"
                  >
                    Create Account
                  </button>
                </p>
              )}

              {mode === "register" && (
                <p className="font-fantasy text-[#a89878] text-xs tracking-wider">
                  Already a hero?{" "}
                  <button
                    data-testid="button-switch-to-login"
                    onClick={() => setMode("login")}
                    disabled={isPending}
                    className="text-[#d4a017] hover:text-[#f0c040] transition-colors"
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
        </div>

        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="font-fantasy text-[#6a5840] text-xs tracking-widest">
            PARA PETS &copy; 2025
          </p>
        </div>
      </div>
    </div>
  );
}
