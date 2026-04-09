import { useState, useRef, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import bgImg from "@assets/bg_login.png";
import signInBtn from "@assets/btn_signin_v2.png";
import createAccountBtn from "@assets/btn_create_v2.png";
import MaintenancePage from "@/pages/MaintenancePage";

type Mode = "landing" | "login" | "register" | "forgot" | "support";

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
  const [loginError, setLoginError] = useState<string | null>(null);
  const [adminBypass, setAdminBypass] = useState(false);

  const { data: maintenanceData } = useQuery<{ maintenance: boolean }>({
    queryKey: ["/api/maintenance-status"],
    retry: false,
    staleTime: 30 * 1000,
  });
  const [supportUsername, setSupportUsername] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [forgotInput, setForgotInput] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [profileImageData, setProfileImageData] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; email?: string; password?: string; general?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";

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

  // Animate the progress bar from 0→90% over ~1.2 s.
  // Returns a Promise so it can be awaited alongside the real API call.
  const animateProgress = () => {
    return new Promise<void>((resolve) => {
      setLoadingProgress(0);
      setIsLoading(true);
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 90) {
          clearInterval(interval);
          setLoadingProgress(90);
          resolve();
        } else {
          setLoadingProgress(progress);
        }
      }, 120);
      // Hard cap — resolve anyway after 1.2 s so the API call is never held up
      setTimeout(() => { clearInterval(interval); resolve(); }, 1200);
    });
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      // Fire the API call and the animation simultaneously so total wait time
      // is max(animation, API) instead of animation + API.
      const apiPromise = apiRequest("POST", "/api/auth/login", { username, password, rememberMe });
      await animateProgress();
      const res = await apiPromise;
      return res.json();
    },
    onSuccess: async () => {
      setLoadingProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => {
        setLocation(returnTo);
      }, 300);
    },
    onError: (err: any) => {
      setIsLoading(false);
      setLoadingProgress(0);
      const msg = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed: any = {};
      try { parsed = JSON.parse(msg); } catch {}
      if (parsed.maintenance === true) {
        setAdminBypass(false);
        setLoginError("The realm is under maintenance. Only admins may enter.");
      } else {
        setLoginError("Invalid username or password. Please try again.");
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const apiPromise = apiRequest("POST", "/api/auth/register", { username, email, password, profileImageData });
      await animateProgress();
      const res = await apiPromise;
      return res.json();
    },
    onSuccess: async () => {
      setLoadingProgress(100);
      setFieldErrors({});
      localStorage.setItem("para_pets_just_registered", "true");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => {
        setLocation(returnTo);
      }, 300);
    },
    onError: (err: any) => {
      setIsLoading(false);
      setLoadingProgress(0);
      const raw = err.message ?? "";
      const bodyStr = raw.includes(":") ? raw.split(": ").slice(1).join(": ") : raw;
      let parsed: { field?: string; message?: string } = {};
      try { parsed = JSON.parse(bodyStr); } catch {}
      const serverMsg = parsed.message || bodyStr || "Registration failed. Please try again.";
      const serverField = parsed.field;
      if (serverField === "username") {
        setFieldErrors({ username: serverMsg });
      } else if (serverField === "email") {
        setFieldErrors({ email: serverMsg });
      } else if (serverField === "password") {
        setFieldErrors({ password: serverMsg });
      } else {
        setFieldErrors({ general: serverMsg });
        toast({ title: "Registration Failed", description: serverMsg, variant: "destructive" });
      }
    },
  });

  const supportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support-message", {
        username: supportUsername,
        email: supportEmail,
        subject: supportSubject,
        message: supportMessage,
      });
      return res.json();
    },
    onSuccess: () => {
      setSupportSent(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { emailOrUsername: forgotInput.trim() });
      return res.json();
    },
    onSuccess: () => {
      setForgotSent(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (isLoading) return;
    if (mode === "login") {
      setLoginError(null);
      loginMutation.mutate();
    } else {
      const errs: typeof fieldErrors = {};
      if (!email.trim()) errs.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Please enter a valid email address";
      if (!username.trim()) errs.username = "Username is required";
      else if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(username)) errs.username = "Letters, numbers, underscores, and periods only (periods cannot be at the start or end)";
      else if (username.length < 3 || username.length > 20) errs.username = "Must be between 3 and 20 characters";
      if (!password) errs.password = "Password is required";
      else if (password.length < 6) errs.password = "Must be at least 6 characters";
      if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
      setFieldErrors({});
      registerMutation.mutate();
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending || supportMutation.isPending || forgotMutation.isPending;

  if (maintenanceData?.maintenance === true && !adminBypass) {
    return (
      <div className="relative h-screen-frame w-full overflow-hidden">
        <MaintenancePage />
        <button
          data-testid="button-admin-login-bypass"
          onClick={() => { setAdminBypass(true); setMode("login"); }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 font-fantasy text-[11px] tracking-widest uppercase"
          style={{
            color: "rgba(110,110,135,0.7)",
            background: "none",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.15em",
            zIndex: 9999,
            padding: "12px 24px",
          }}
        >
          Admin Login
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen-frame w-full overflow-hidden flex flex-col items-center"
      style={{
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        maxWidth: "768px",
        margin: "0 auto",
      }}
    >
      {/* Lighter vignette — let the forest breathe */}
      <div className="absolute inset-0 z-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.08) 45%, rgba(3,10,5,0.7) 100%)" }} />

      <div
        className="relative z-10 flex flex-col items-center w-full h-full"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {mode === "landing" ? (
          /* ══════════════════════ LANDING SCREEN ══════════════════════ */
          <div className="flex flex-col items-center justify-end h-full w-full px-6 pb-8 animate-slide-up">

            {/* ── Title + tagline, sitting just above buttons ── */}
            <div className="flex flex-col items-center mb-5">
              <div className="relative">
                <span className="title-sparkle absolute -top-5 -left-6 text-2xl select-none" style={{ animationDelay: "0s" }}>✦</span>
                <span className="title-sparkle absolute -top-5 -right-6 text-2xl select-none" style={{ animationDelay: "1.2s" }}>✦</span>
                <span className="title-sparkle absolute -bottom-4 -left-9 text-sm select-none" style={{ animationDelay: "0.5s" }}>✦</span>
                <span className="title-sparkle absolute -bottom-4 -right-9 text-sm select-none" style={{ animationDelay: "1.8s" }}>✦</span>
                <div
                  className="px-6 py-2 rounded-xl"
                  style={{
                    background: "rgba(4,12,7,0.58)",
                    backdropFilter: "blur(6px)",
                    border: "1px solid rgba(200,160,50,0.18)",
                  }}
                >
                  <h1 className="para-pets-title select-none text-center">Para Pets</h1>
                </div>
              </div>
              <p
                className="font-fantasy text-[#f0e8d4] text-center text-sm tracking-wide mt-6 leading-relaxed px-5 py-2 rounded-xl"
                style={{
                  background: "rgba(4,12,7,0.58)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(200,160,50,0.18)",
                }}
              >
                A world of magical companions awaits
              </p>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex flex-col items-center w-full">
              <button
                data-testid="button-signin"
                onClick={() => setMode("login")}
                className="w-[78%] max-w-[310px] mx-auto block transition-transform duration-150 active:scale-95"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <img
                  src={signInBtn} alt="Sign In"
                  className="w-full h-auto object-contain block"
                  style={{ filter: "drop-shadow(0 0 16px rgba(240,160,48,0.75)) drop-shadow(0 4px 10px rgba(0,0,0,0.95))" }}
                />
              </button>
              <button
                data-testid="button-create-account"
                onClick={() => setMode("register")}
                className="w-[78%] max-w-[310px] mx-auto block transition-transform duration-150 active:scale-95"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <img
                  src={createAccountBtn} alt="Create Account"
                  className="w-full h-auto object-contain block"
                  style={{ filter: "drop-shadow(0 0 16px rgba(240,160,48,0.75)) drop-shadow(0 4px 10px rgba(0,0,0,0.95))" }}
                />
              </button>
              <Link
                data-testid="link-para-pets-hub"
                href="/hub"
                className="w-[78%] max-w-[310px] mx-auto mt-3 flex items-center justify-center gap-2 py-3 rounded-xl font-fantasy text-sm tracking-widest transition-all duration-150 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(0,90,72,0.72) 0%, rgba(0,58,46,0.72) 100%)",
                  border: "1px solid rgba(0,210,168,0.55)",
                  color: "#7fffd4",
                  boxShadow: "0 0 18px rgba(0,200,160,0.28), inset 0 1px 0 rgba(127,255,212,0.12), 0 4px 12px rgba(0,0,0,0.6)",
                  textShadow: "0 0 14px rgba(0,220,170,0.7)",
                  backdropFilter: "blur(6px)",
                  textDecoration: "none",
                }}
              >
                <span style={{ opacity: 0.85, fontSize: "0.9em" }}>✦</span>
                Para Pets Hub
                <span style={{ opacity: 0.85, fontSize: "0.9em" }}>✦</span>
              </Link>
            </div>
          </div>

        ) : (
          /* ══════════════════ FORM SCREENS ══════════════════ */
          <div className="flex flex-col items-center justify-center w-full min-h-full px-5 py-6 overflow-y-auto">

            {/* Compact title above form */}
            <div className="relative mb-5 text-center">
              <span className="title-sparkle absolute -top-3 -left-4 text-base select-none" style={{ animationDelay: "0s" }}>✦</span>
              <span className="title-sparkle absolute -top-3 -right-4 text-base select-none" style={{ animationDelay: "1s" }}>✦</span>
              <h1 className="para-pets-title select-none" style={{ fontSize: "clamp(1.9rem, 9vw, 2.9rem)" }}>Para Pets</h1>
            </div>

          {/* ── LOGIN / REGISTER PANEL ── */}
          {(mode === "login" || mode === "register") && (
            <div
              className="w-full max-w-sm animate-slide-up"
              style={{
                background: "linear-gradient(160deg, rgba(6,18,10,0.95) 0%, rgba(4,12,8,0.97) 100%)",
                border: "1px solid rgba(175,135,35,0.45)",
                borderRadius: "18px",
                boxShadow: "0 0 0 1px rgba(0,160,130,0.07), 0 14px 45px rgba(0,0,0,0.88), 0 0 28px rgba(150,115,20,0.13)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Forest-panel header */}
              <div className="px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,170,130,0.55))" }} />
                  <span style={{ color: "#7fffd4", fontSize: 14, textShadow: "0 0 8px rgba(0,200,160,0.8)" }}>🌿</span>
                  <h2 className="font-fantasy text-white text-sm tracking-[0.22em]" style={{ textShadow: "0 0 14px rgba(0,200,160,0.35)" }}>
                    {mode === "login" ? "Welcome Back" : "Begin Your Journey"}
                  </h2>
                  <span style={{ color: "#7fffd4", fontSize: 14, textShadow: "0 0 8px rgba(0,200,160,0.8)" }}>🌿</span>
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,170,130,0.55), transparent)" }} />
                </div>
              </div>

              <div className="px-6 pb-6 space-y-3">
                {/* Register-only: email + avatar */}
                {mode === "register" && (
                  <>
                    <div>
                      <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">Email</label>
                      <input
                        data-testid="input-email"
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: undefined })); }}
                        disabled={isPending}
                        placeholder="your@email.com"
                        className="w-full px-4 py-2.5 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                        style={{
                          background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                          border: fieldErrors.email ? "1.5px solid #e05555" : "1.5px solid rgba(170,125,35,0.55)",
                          boxShadow: fieldErrors.email ? "0 0 0 2px rgba(220,60,60,0.22)" : "inset 0 2px 4px rgba(0,0,0,0.15)",
                        }}
                      />
                      {fieldErrors.email && (
                        <p data-testid="error-email" className="font-sans text-[11px] mt-1 ml-1 flex items-center gap-1" style={{ color: "#ff7070" }}>
                          <span>⚠</span> {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">Profile Picture</label>
                      <div className="flex items-center gap-3">
                        {profilePreview ? (
                          <div
                            className="w-12 h-12 rounded-full overflow-hidden cursor-pointer border-2 border-[#ffd700] flex-shrink-0"
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="img-profile-preview"
                            style={{ boxShadow: "0 0 10px rgba(255,215,0,0.45)" }}
                          >
                            <img src={profilePreview} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div
                            className="w-12 h-12 rounded-full cursor-pointer border-2 border-dashed border-[#3a9a80] flex items-center justify-center flex-shrink-0"
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="button-upload-avatar"
                            style={{ background: "rgba(0,160,120,0.1)" }}
                          >
                            <span className="text-[#7fffd4] text-xl">+</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="font-fantasy text-[10px] tracking-wider py-1.5 px-3 rounded-lg transition-opacity hover:opacity-80"
                          style={{ background: "rgba(0,90,65,0.45)", border: "1px solid rgba(0,190,150,0.3)", color: "#7fffd4" }}
                        >
                          {profilePreview ? "Change Photo" : "Choose Photo"}
                        </button>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" data-testid="input-file-upload" />
                    </div>
                  </>
                )}

                {/* Username / email field */}
                <div>
                  <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">
                    {mode === "login" ? "Username or Email" : "Username"}
                  </label>
                  <input
                    data-testid="input-username"
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setFieldErrors(prev => ({ ...prev, username: undefined })); setLoginError(null); }}
                    disabled={isPending}
                    placeholder={mode === "login" ? "Username or email" : "HeroName123"}
                    className="w-full px-4 py-2.5 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                    style={{
                      background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                      border: fieldErrors.username ? "1.5px solid #e05555" : "1.5px solid rgba(170,125,35,0.55)",
                      boxShadow: fieldErrors.username ? "0 0 0 2px rgba(220,60,60,0.22)" : "inset 0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  />
                  {mode === "register" && fieldErrors.username ? (
                    <p data-testid="error-username" className="font-sans text-[11px] mt-1 ml-1 flex items-center gap-1" style={{ color: "#ff7070" }}>
                      <span>⚠</span> {fieldErrors.username}
                    </p>
                  ) : mode === "register" ? (
                    <p className="font-sans text-[10px] mt-1 ml-1" style={{ color: "#5aafaf" }}>Letters, numbers &amp; underscores, 3–20 chars</p>
                  ) : null}
                </div>

                {/* Password field */}
                <div>
                  <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">Password</label>
                  <div className="relative">
                    <input
                      data-testid="input-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: undefined })); setLoginError(null); }}
                      disabled={isPending}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                      style={{
                        background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                        border: fieldErrors.password ? "1.5px solid #e05555" : "1.5px solid rgba(170,125,35,0.55)",
                        boxShadow: fieldErrors.password ? "0 0 0 2px rgba(220,60,60,0.22)" : "inset 0 2px 4px rgba(0,0,0,0.15)",
                      }}
                      onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    />
                    <button
                      data-testid="button-toggle-password"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded opacity-55 hover:opacity-90 transition-opacity"
                      style={{ color: "#5a7a60" }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {mode === "register" && fieldErrors.password ? (
                    <p data-testid="error-password" className="font-sans text-[11px] mt-1 ml-1 flex items-center gap-1" style={{ color: "#ff7070" }}>
                      <span>⚠</span> {fieldErrors.password}
                    </p>
                  ) : mode === "register" ? (
                    <p className="font-sans text-[10px] mt-1 ml-1" style={{ color: "#5aafaf" }}>Minimum 6 characters</p>
                  ) : null}
                </div>

                {/* Login error banner */}
                {mode === "login" && loginError && (
                  <button
                    data-testid="banner-login-error"
                    type="button"
                    onClick={() => setLoginError(null)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-opacity hover:opacity-80 active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(135deg, rgba(80,12,12,0.72) 0%, rgba(60,8,8,0.72) 100%)",
                      border: "1px solid rgba(200,60,60,0.5)",
                      boxShadow: "0 0 16px rgba(160,30,30,0.3)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14 }}>⚔️</span>
                      <span className="font-fantasy text-[11px] tracking-wider" style={{ color: "#ffaaaa" }}>
                        {loginError}
                      </span>
                    </div>
                    <span className="font-fantasy text-[10px] flex-shrink-0" style={{ color: "rgba(255,140,140,0.55)" }}>✕</span>
                  </button>
                )}

                {/* Remember me */}
                {mode === "login" && (
                  <button
                    data-testid="button-remember-me"
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className="flex items-center gap-2"
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: rememberMe ? "linear-gradient(135deg, #155c3a 0%, #0a3020 100%)" : "rgba(0,160,120,0.1)",
                        border: rememberMe ? "1.5px solid rgba(127,255,212,0.65)" : "1.5px solid rgba(0,160,120,0.38)",
                      }}
                    >
                      {rememberMe && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7fffd4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <span className="font-fantasy text-[#96b8a4] text-[10px] tracking-wider">Remember Me</span>
                  </button>
                )}

                {/* Loading bar */}
                {isLoading && (
                  <div className="pt-1" style={{ position: "relative" }}>
                    {/* Bar track */}
                    <div className="relative w-full rounded-full overflow-hidden" style={{ height: 22, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(0,160,120,0.2)" }}>
                      {/* Fill */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${loadingProgress}%`,
                          background: "linear-gradient(90deg, #0a3020 0%, #155c40 50%, #7fffd4 100%)",
                          boxShadow: "0 0 8px rgba(127,255,212,0.65)",
                        }}
                      />
                      {/* Label centered over the bar — single source of truth, no separate text element */}
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          fontSize: "9px",
                          fontFamily: "'Lora', 'Georgia', serif",
                          color: "rgba(127,255,212,0.9)",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          userSelect: "none",
                          pointerEvents: "none",
                        }}
                      >
                        {mode === "login" ? "Entering the realm..." : "Creating your legend..."}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col items-center gap-2.5 pt-1">
                  {mode === "login" ? (
                    <button
                      data-testid="button-submit-signin"
                      onClick={handleSubmit}
                      disabled={isPending}
                      className="w-[68%] max-w-[240px] transition-transform duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      <img src={signInBtn} alt="Sign In" className="w-full h-auto object-contain" style={isPending ? { filter: "brightness(0.65)" } : { filter: "drop-shadow(0 0 10px rgba(240,160,48,0.55))" }} />
                    </button>
                  ) : (
                    <button
                      data-testid="button-submit-register"
                      onClick={handleSubmit}
                      disabled={isPending}
                      className="w-[68%] max-w-[240px] transition-transform duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      <img src={createAccountBtn} alt="Create Account" className="w-full h-auto object-contain" style={isPending ? { filter: "brightness(0.65)" } : { filter: "drop-shadow(0 0 10px rgba(240,160,48,0.55))" }} />
                    </button>
                  )}

                  <button
                    data-testid="button-back"
                    onClick={() => { setMode("landing"); setUsername(""); setEmail(""); setPassword(""); setProfileImageData(null); setProfilePreview(null); setIsLoading(false); setLoadingProgress(0); setShowPassword(false); setLoginFailed(false); }}
                    disabled={isPending}
                    className="font-fantasy text-[#96b8a4] text-[10px] tracking-widest hover:text-white transition-colors disabled:opacity-40"
                  >
                    ← BACK
                  </button>

                  {mode === "login" && (
                    <>
                      {loginError !== null && (
                        <button
                          data-testid="button-forgot-password"
                          onClick={() => { setMode("forgot"); setForgotSent(false); setForgotInput(email); }}
                          disabled={isPending}
                          className="font-fantasy text-[#ffd700] text-[10px] tracking-wider hover:text-white transition-colors"
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                        >
                          Forgot Password?
                        </button>
                      )}
                      <p className="font-fantasy text-[#96b8a4] text-[10px] tracking-wider">
                        New traveler?{" "}
                        <button data-testid="button-switch-to-register" onClick={() => setMode("register")} disabled={isPending} className="text-[#ffd700] hover:text-white transition-colors">
                          Create Account
                        </button>
                      </p>
                    </>
                  )}

                  {mode === "register" && (
                    <p className="font-fantasy text-[#96b8a4] text-[10px] tracking-wider">
                      Already a hero?{" "}
                      <button data-testid="button-switch-to-login" onClick={() => setMode("login")} disabled={isPending} className="text-[#ffd700] hover:text-white transition-colors">
                        Sign In
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── FORGOT PASSWORD PANEL ── */}
          {mode === "forgot" && (
            <div
              className="w-full max-w-sm animate-slide-up"
              style={{
                background: "linear-gradient(160deg, rgba(6,18,10,0.95) 0%, rgba(4,12,8,0.97) 100%)",
                border: "1px solid rgba(175,135,35,0.45)",
                borderRadius: "18px",
                boxShadow: "0 0 0 1px rgba(0,160,130,0.07), 0 14px 45px rgba(0,0,0,0.88)",
                backdropFilter: "blur(16px)",
              }}
            >
              <div className="px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,170,130,0.55))" }} />
                  <span style={{ color: "#7fffd4", fontSize: 14 }}>🍄</span>
                  <h2 className="font-fantasy text-white text-sm tracking-[0.22em]">Forgot Password</h2>
                  <span style={{ color: "#7fffd4", fontSize: 14 }}>🍄</span>
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,170,130,0.55), transparent)" }} />
                </div>
                <p className="font-fantasy text-[#96b8a4] text-[10px] text-center tracking-wider mt-2.5">
                  Enter your email or username for a reset link
                </p>
              </div>

              <div className="px-6 pb-6">
                {forgotSent ? (
                  <div className="text-center space-y-3 py-2">
                    <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ background: "rgba(15,70,45,0.45)", border: "2px solid rgba(127,255,212,0.4)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7fffd4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider" data-testid="text-forgot-sent">Check Your Email</p>
                    <p className="font-fantasy text-[#96b8a4] text-[10px] tracking-wider leading-relaxed">
                      If an account exists, a reset link has been sent. It expires in 1 hour.
                    </p>
                    <button
                      data-testid="button-back-to-login-from-forgot"
                      onClick={() => { setMode("login"); setForgotSent(false); setLoginFailed(false); }}
                      className="font-fantasy text-[#ffd700] text-[10px] tracking-wider hover:text-white transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">Email or Username</label>
                      <input
                        data-testid="input-forgot-email-or-username"
                        type="text"
                        value={forgotInput}
                        onChange={e => setForgotInput(e.target.value)}
                        disabled={forgotMutation.isPending}
                        placeholder="your@email.com or username"
                        className="w-full px-4 py-2.5 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                        style={{
                          background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                          border: "1.5px solid rgba(170,125,35,0.55)",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                        }}
                        onKeyDown={e => e.key === "Enter" && !forgotMutation.isPending && forgotInput.trim() && forgotMutation.mutate()}
                      />
                    </div>
                    <button
                      data-testid="button-submit-forgot"
                      onClick={() => forgotMutation.mutate()}
                      disabled={forgotMutation.isPending || !forgotInput.trim()}
                      className="w-full py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #0d4a30 0%, #082a1c 100%)",
                        border: "1px solid rgba(0,200,160,0.38)",
                        color: "#7fffd4",
                        cursor: "pointer",
                        boxShadow: "0 0 10px rgba(0,200,160,0.14)",
                      }}
                    >
                      {forgotMutation.isPending ? "Sending..." : "Send Reset Link"}
                    </button>
                    <div className="flex flex-col items-center gap-2 pt-0.5">
                      <button
                        data-testid="button-back-to-login-from-forgot"
                        onClick={() => { setMode("login"); setLoginFailed(false); }}
                        className="font-fantasy text-[#96b8a4] text-[10px] tracking-widest hover:text-white transition-colors"
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                      >
                        ← Back to Sign In
                      </button>
                      <button
                        data-testid="button-contact-support-from-forgot"
                        onClick={() => { setMode("support"); setSupportSent(false); setSupportUsername(""); setSupportEmail(""); setSupportSubject("Account Help"); setSupportMessage(""); }}
                        className="font-fantasy text-[#5a8870] text-[9px] tracking-wider hover:text-[#96b8a4] transition-colors"
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                      >
                        Contact Support instead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CONTACT SUPPORT PANEL ── */}
          {mode === "support" && (
            <div
              className="w-full max-w-sm animate-slide-up"
              style={{
                background: "linear-gradient(160deg, rgba(6,18,10,0.95) 0%, rgba(4,12,8,0.97) 100%)",
                border: "1px solid rgba(175,135,35,0.45)",
                borderRadius: "18px",
                boxShadow: "0 0 0 1px rgba(0,160,130,0.07), 0 14px 45px rgba(0,0,0,0.88)",
                backdropFilter: "blur(16px)",
              }}
            >
              <div className="px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,170,130,0.55))" }} />
                  <span style={{ color: "#7fffd4", fontSize: 14 }}>🌟</span>
                  <h2 className="font-fantasy text-white text-sm tracking-[0.22em]">Contact Support</h2>
                  <span style={{ color: "#7fffd4", fontSize: 14 }}>🌟</span>
                  <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(0,170,130,0.55), transparent)" }} />
                </div>
                <p className="font-fantasy text-[#96b8a4] text-[10px] text-center tracking-wider mt-2.5">
                  Fill out the form and we'll help you out
                </p>
              </div>

              <div className="px-6 pb-6">
                {supportSent ? (
                  <div className="text-center space-y-3 py-2">
                    <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ background: "rgba(15,70,45,0.45)", border: "2px solid rgba(127,255,212,0.4)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7fffd4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="font-fantasy text-[#7fffd4] text-sm tracking-wider" data-testid="text-support-sent">Message Sent!</p>
                    <p className="font-fantasy text-[#96b8a4] text-[10px] tracking-wider leading-relaxed">
                      An admin will review your message and reach out to help.
                    </p>
                    <button
                      data-testid="button-back-to-login-from-support"
                      onClick={() => { setMode("login"); setSupportSent(false); setLoginFailed(false); }}
                      className="font-fantasy text-[#ffd700] text-[10px] tracking-wider hover:text-white transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {[
                      { label: "Username", testId: "input-support-username", value: supportUsername, onChange: (v: string) => setSupportUsername(v), type: "text", placeholder: "Your username" },
                      { label: "Email", testId: "input-support-email", value: supportEmail, onChange: (v: string) => setSupportEmail(v), type: "email", placeholder: "your@email.com" },
                      { label: "Subject", testId: "input-support-subject", value: supportSubject, onChange: (v: string) => setSupportSubject(v), type: "text", placeholder: "e.g. Password Help, Account Issue..." },
                    ].map(f => (
                      <div key={f.testId}>
                        <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">{f.label}</label>
                        <input
                          data-testid={f.testId}
                          type={f.type}
                          value={f.value}
                          onChange={e => f.onChange(e.target.value)}
                          disabled={supportMutation.isPending}
                          placeholder={f.placeholder}
                          className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60"
                          style={{
                            background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                            border: "1.5px solid rgba(170,125,35,0.55)",
                            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                          }}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="font-fantasy text-[#7fffd4] text-[10px] tracking-widest block mb-1 ml-1 uppercase opacity-80">Message</label>
                      <textarea
                        data-testid="input-support-message"
                        value={supportMessage}
                        onChange={e => setSupportMessage(e.target.value)}
                        disabled={supportMutation.isPending}
                        placeholder="Describe what you need help with..."
                        rows={3}
                        maxLength={2000}
                        className="w-full px-3 py-2 rounded-lg font-sans text-sm text-[#1a0e04] placeholder-[#8a7060] outline-none disabled:opacity-60 resize-none"
                        style={{
                          background: "linear-gradient(135deg, #f5ead8 0%, #ecdec0 100%)",
                          border: "1.5px solid rgba(170,125,35,0.55)",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.15)",
                        }}
                      />
                      <p className="font-fantasy text-[#5a8870] text-[9px] tracking-wider text-right mt-0.5">{supportMessage.length}/2000</p>
                    </div>
                    <button
                      data-testid="button-submit-support"
                      onClick={() => supportMutation.mutate()}
                      disabled={supportMutation.isPending || !supportUsername || !supportEmail || !supportSubject || !supportMessage}
                      className="w-full py-2.5 rounded-lg font-fantasy text-xs tracking-wider transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #0d4a30 0%, #082a1c 100%)",
                        border: "1px solid rgba(0,200,160,0.38)",
                        color: "#7fffd4",
                        cursor: "pointer",
                        boxShadow: "0 0 10px rgba(0,200,160,0.14)",
                      }}
                    >
                      {supportMutation.isPending ? "Sending..." : "Send Message"}
                    </button>
                    <div className="text-center pt-0.5">
                      <button
                        data-testid="button-back-to-login-from-support"
                        onClick={() => { setMode("login"); setLoginFailed(false); }}
                        className="font-fantasy text-[#96b8a4] text-[10px] tracking-widest hover:text-white transition-colors"
                        style={{ background: "none", border: "none", cursor: "pointer" }}
                      >
                        ← Back to Sign In
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
          <p className="font-fantasy text-[#3a6050] text-[9px] tracking-widest" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            PARA PETS &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
